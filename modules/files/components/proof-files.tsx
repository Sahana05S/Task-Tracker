'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLinkIcon, LoaderCircleIcon, PaperclipIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { formatFileSize, PROOF_ACCEPT, proofFileProblem, proofMimeType, uploadToSignedLink, type FileBucket, type ProofFile } from '@/modules/files/client';
import { formatDate } from '@/shared/tracker/format';
import { Button } from '@/shared/ui/button';
import type { ActionResponse } from '@/types/tracker';

type Action<T> = (form: FormData) => Promise<ActionResponse<T>>;

function formData(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

/**
 * A compact proof list with Add and Remove, for any record whose proofs go to
 * the Shared Drive (sales entries; migration 102). The owning module supplies
 * its three Server Actions and the record's hidden fields (`fields`, sent with
 * every action); the database decides who may.
 */
export function ProofFiles({ bucket, files, canAdd, fields, start, save, remove, label = 'Proofs' }: {
  bucket: FileBucket;
  files: readonly ProofFile[];
  canAdd: boolean;
  fields: Readonly<Record<string, string>>;
  start: Action<{ path: string; token: string }>;
  save: Action<null>;
  remove: Action<null>;
  label?: string;
}) {
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
    const details = { ...fields, mimeType, size: String(file.size) };
    const started = await start(formData({ ...details, fileId: crypto.randomUUID() }));
    if (!started.success || !started.data) {
      toast.error(started.error ?? 'The upload could not start.');
      return false;
    }
    const uploadError = await uploadToSignedLink(bucket, started.data, file, mimeType);
    if (uploadError) {
      toast.error(uploadError);
      return false;
    }
    const saved = await save(formData({ ...details, path: started.data.path, fileName: file.name, operationId: crypto.randomUUID() }));
    if (!saved.success) {
      toast.error(saved.error ?? 'The proof was not saved.');
      return false;
    }
    return true;
  }

  async function upload(list: File[]) {
    let added = 0;
    try {
      for (const [index, file] of list.entries()) {
        setBusy(list.length > 1 ? `Uploading ${index + 1} of ${list.length}` : 'Uploading');
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

  function removeOne(file: ProofFile) {
    if (!window.confirm(`Remove ${file.fileName}?`)) return;
    startRemoving(async () => {
      const result = await remove(formData({ ...fields, proofId: file.id, operationId: crypto.randomUUID() }));
      if (!result.success) {
        toast.error(result.error ?? 'The proof was not removed.');
        return;
      }
      toast.success('Removed.');
      router.refresh();
    });
  }

  if (!files.length && !canAdd) return null;
  return (
    <section className="border-border grid gap-2 border-t pt-3" aria-label={label}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-foreground flex items-center gap-1.5 text-sm font-semibold">
          <PaperclipIcon aria-hidden="true" className="text-primary size-4" />
          {label}{files.length ? ` (${files.length})` : ''}
        </h3>
        {canAdd ? (
          <>
            <input
              ref={input}
              type="file"
              multiple
              accept={PROOF_ACCEPT}
              className="sr-only"
              aria-label={`Add ${label.toLowerCase()}`}
              onChange={(event) => {
                const list = Array.from(event.target.files ?? []);
                if (list.length) void upload(list);
              }}
            />
            <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => input.current?.click()}>
              {busy ? <LoaderCircleIcon aria-hidden="true" className="animate-spin" /> : null}
              {busy ?? 'Add proof'}
            </Button>
          </>
        ) : null}
      </div>
      {files.length ? (
        <ul className="divide-border grid divide-y text-sm">
          {files.map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-2 py-1.5">
              <div className="min-w-0">
                <a href={file.href} target="_blank" rel="noreferrer" className="text-primary inline-flex max-w-full items-center gap-1 font-medium hover:underline">
                  <span className="truncate">{file.fileName}</span>
                  <ExternalLinkIcon aria-hidden="true" className="size-3.5 shrink-0" />
                </a>
                <p className="text-muted-foreground text-xs">
                  {formatFileSize(file.sizeBytes)} · {file.uploaderName ?? 'Team member'} · {formatDate(file.uploadedAt.slice(0, 10))}
                </p>
              </div>
              {file.canRemove ? (
                <Button type="button" size="icon" variant="ghost" disabled={removing} aria-label={`Remove ${file.fileName}`} onClick={() => removeOne(file)}>
                  <Trash2Icon aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">Receipts, agreements or site photos; kept in the company Shared Drive.</p>
      )}
    </section>
  );
}
