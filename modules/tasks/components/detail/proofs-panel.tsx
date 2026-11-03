'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLinkIcon, FileCheckIcon, LoaderCircleIcon, Trash2Icon, UploadIcon } from 'lucide-react';
import { toast } from 'sonner';

import { formatProofSize, missionFilesOfKind, PROOF_ACCEPT, proofFileProblem, proofMimeType, uploadProofToTicket, type MissionProof } from '@/modules/tasks/client';
import { removeProof, saveProof, startProofUpload } from '@/modules/tasks/proof-actions';
import { formatDate } from '@/shared/tracker/format';
import { Button } from '@/shared/ui/button';
import { MissionPanel } from '@/shared/ui/mission-ui';

function formData(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

/**
 * Mission proofs (migration 101): outputs, receipts and site photos, kept in
 * the company Shared Drive. The mission's people and managers see and add
 * them; the uploader or a manager removes one.
 */
export function ProofsPanel({ taskId, taskTag, proofs: files, canAdd }: {
  taskId: string;
  taskTag: string;
  /** Every mission file; only proofs show here (Input / Process / Output documents are on the Details tab). */
  proofs: readonly MissionProof[];
  /** False for an archived mission. */
  canAdd: boolean;
}) {
  const proofs = missionFilesOfKind(files, 'proof');
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, startRemoving] = useTransition();

  async function uploadOne(file: File): Promise<boolean> {
    const mimeType = proofMimeType(file);
    const problem = proofFileProblem({ size: file.size, type: mimeType });
    if (problem) {
      toast.error(`${file.name}: ${problem}`);
      return false;
    }
    const details = { taskId, mimeType, size: String(file.size) };
    const started = await startProofUpload(formData({ ...details, fileId: crypto.randomUUID() }));
    if (!started.success || !started.data) {
      toast.error(started.error ?? 'The upload could not start.');
      return false;
    }
    const uploadError = await uploadProofToTicket(started.data, file, mimeType);
    if (uploadError) {
      toast.error(uploadError);
      return false;
    }
    const saved = await saveProof(formData({ ...details, taskTag, path: started.data.path, fileName: file.name, operationId: crypto.randomUUID() }));
    if (!saved.success) {
      toast.error(saved.error ?? 'The proof was not saved.');
      return false;
    }
    return true;
  }

  async function upload(files: File[]) {
    let added = 0;
    try {
      for (const [index, file] of files.entries()) {
        setBusy(files.length > 1 ? `Uploading ${index + 1} of ${files.length}` : 'Uploading');
        if (await uploadOne(file)) added += 1;
      }
      if (added) {
        toast.success(added === 1 ? 'Proof added.' : `${added} proofs added.`);
        router.refresh();
      }
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  }

  function remove(proof: MissionProof) {
    if (!window.confirm(`Remove ${proof.fileName}?`)) return;
    startRemoving(async () => {
      const result = await removeProof(formData({ taskId, taskTag, proofId: proof.id, operationId: crypto.randomUUID() }));
      if (!result.success) {
        toast.error(result.error ?? 'The proof was not removed.');
        return;
      }
      toast.success('Removed.');
      router.refresh();
    });
  }

  return (
    <MissionPanel
      icon={FileCheckIcon}
      title="Proofs"
      subtitle={proofs.length ? `${proofs.length} file${proofs.length === 1 ? '' : 's'}` : 'Outputs, receipts and site photos'}
      action={canAdd ? (
        <>
          <input
            ref={input}
            type="file"
            multiple
            accept={PROOF_ACCEPT}
            className="sr-only"
            aria-label="Add proofs"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length) void upload(files);
            }}
          />
          <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => input.current?.click()}>
            {busy ? <LoaderCircleIcon aria-hidden="true" className="animate-spin" /> : <UploadIcon aria-hidden="true" />}
            {busy ?? 'Add'}
          </Button>
        </>
      ) : null}
    >
      {proofs.length ? (
        <ul className="divide-border grid divide-y text-sm">
          {proofs.map((proof) => (
            <li key={proof.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <a href={proof.href} target="_blank" rel="noreferrer" className="text-primary inline-flex max-w-full items-center gap-1 font-medium hover:underline">
                  <span className="truncate">{proof.fileName}</span>
                  <ExternalLinkIcon aria-hidden="true" className="size-3.5 shrink-0" />
                </a>
                <p className="text-muted-foreground text-xs">
                  {formatProofSize(proof.sizeBytes)} · {proof.uploaderName ?? 'Team member'} · {formatDate(proof.uploadedAt.slice(0, 10))}
                </p>
              </div>
              {proof.canRemove ? (
                <Button type="button" size="icon" variant="ghost" disabled={removing} aria-label={`Remove ${proof.fileName}`} onClick={() => remove(proof)}>
                  <Trash2Icon aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          {canAdd ? 'No proofs yet. Add PDFs, photos or Office files (25 MB each); they are kept in the company Shared Drive.' : 'No proofs were added.'}
        </p>
      )}
    </MissionPanel>
  );
}
