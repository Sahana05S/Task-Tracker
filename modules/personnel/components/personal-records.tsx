'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2Icon, CircleDashedIcon, ExternalLinkIcon, FileTextIcon, LoaderCircleIcon, Trash2Icon, UploadIcon } from 'lucide-react';
import { toast } from 'sonner';

import {
  fileProblem,
  formatFileSize,
  MAX_COLLEGE_FILES,
  RECORD_ACCEPT,
  RECORD_KIND_HINTS,
  RECORD_KIND_LABELS,
  RECORD_KINDS,
  recordProgress,
  uploadToTicket,
  type PersonalDocument,
  type RecordKind,
} from '@/modules/personnel/client';
import { removeRecord, saveRecord, startRecordUpload } from '@/modules/personnel/records-actions';
import { formatDate } from '@/shared/tracker/format';
import { Button } from '@/shared/ui/button';
import { MissionPanel } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

function formData(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

/**
 * The Personal info tab: one card per record. The owner uploads, replaces and
 * removes their own files; the managing director views them.
 */
export function PersonalRecords({ documents, links, editable, ownerName }: {
  documents: readonly PersonalDocument[];
  links: Readonly<Record<string, string>>;
  /** True on the member's own profile. */
  editable: boolean;
  ownerName: string;
}) {
  const progress = recordProgress(documents.map(document => document.kind));
  return (
    <MissionPanel title="Personal records" icon={FileTextIcon}>
      <div className="grid gap-4">
        <p className="text-muted-foreground text-sm">
          {editable
            ? 'Upload a PDF or a clear photo of each record (5 MB at most). Only you and the managing director can see them.'
            : `${ownerName}'s records. Only they and the managing director can see them.`}
          {' '}
          <span className={cn('font-semibold', progress.complete ? 'text-success-strong' : 'text-foreground')}>
            {progress.done} of {progress.total} done.
          </span>
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {RECORD_KINDS.map(kind => (
            <RecordCard
              key={kind}
              kind={kind}
              documents={documents.filter(document => document.kind === kind)}
              links={links}
              editable={editable}
            />
          ))}
        </div>
      </div>
    </MissionPanel>
  );
}

function RecordCard({ kind, documents, links, editable }: {
  kind: RecordKind;
  documents: readonly PersonalDocument[];
  links: Readonly<Record<string, string>>;
  editable: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [removing, startRemoving] = useTransition();
  const many = kind === 'college';
  const canAdd = editable && (!many || documents.length < MAX_COLLEGE_FILES);
  const action = documents.length && !many ? 'Replace' : many && documents.length ? 'Add another' : 'Upload';

  async function upload(file: File) {
    const problem = fileProblem(file);
    if (problem) return toast.error(problem);
    setBusy(true);
    try {
      const details = { kind, mimeType: file.type, size: String(file.size) };
      const started = await startRecordUpload(formData({ ...details, fileId: crypto.randomUUID() }));
      if (!started.success || !started.data) return toast.error(started.error ?? 'The upload could not start.');
      const uploadError = await uploadToTicket(started.data, file);
      if (uploadError) return toast.error(uploadError);
      const saved = await saveRecord(formData({ ...details, path: started.data.path, fileName: file.name, operationId: crypto.randomUUID() }));
      if (!saved.success) return toast.error(saved.error ?? 'The record was not saved.');
      toast.success(`${RECORD_KIND_LABELS[kind]} saved.`);
      router.refresh();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  function remove(document: PersonalDocument) {
    if (!window.confirm(`Remove ${document.fileName}?`)) return;
    startRemoving(async () => {
      const result = await removeRecord(formData({ recordId: document.id, operationId: crypto.randomUUID() }));
      if (!result.success) {
        toast.error(result.error ?? 'The record was not removed.');
        return;
      }
      toast.success('Removed.');
      router.refresh();
    });
  }

  const done = documents.length > 0;
  return (
    <section className="border-border bg-card grid content-start gap-3 rounded-xl border p-4" aria-label={RECORD_KIND_LABELS[kind]}>
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h3 className="text-foreground flex items-center gap-1.5 text-sm font-semibold">
            {done
              ? <CheckCircle2Icon aria-hidden="true" className="text-success-strong size-4" />
              : <CircleDashedIcon aria-hidden="true" className="text-muted-foreground size-4" />}
            {RECORD_KIND_LABELS[kind]}
          </h3>
          <p className="text-muted-foreground text-xs">{RECORD_KIND_HINTS[kind]}</p>
        </div>
        {canAdd ? (
          <>
            <input
              ref={input}
              type="file"
              accept={RECORD_ACCEPT}
              className="sr-only"
              aria-label={`${action} ${RECORD_KIND_LABELS[kind]}`}
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button type="button" size="sm" variant={done ? 'outline' : 'default'} disabled={busy} onClick={() => input.current?.click()}>
              {busy ? <LoaderCircleIcon aria-hidden="true" className="animate-spin" /> : <UploadIcon aria-hidden="true" />}
              {busy ? 'Uploading' : action}
            </Button>
          </>
        ) : null}
      </div>
      {done ? (
        <ul className="divide-border grid divide-y text-sm">
          {documents.map(document => (
            <li key={document.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                {links[document.id] ? (
                  <a href={links[document.id]} target="_blank" rel="noreferrer" className="text-primary inline-flex max-w-full items-center gap-1 font-medium hover:underline">
                    <span className="truncate">{document.fileName}</span>
                    <ExternalLinkIcon aria-hidden="true" className="size-3.5 shrink-0" />
                  </a>
                ) : (
                  <span className="text-foreground truncate font-medium">{document.fileName}</span>
                )}
                <p className="text-muted-foreground text-xs">
                  {formatFileSize(document.sizeBytes)} · uploaded {formatDate(document.uploadedAt.slice(0, 10))}
                </p>
              </div>
              {editable ? (
                <Button type="button" size="icon" variant="ghost" disabled={removing} aria-label={`Remove ${document.fileName}`} onClick={() => remove(document)}>
                  <Trash2Icon aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">Not uploaded yet.</p>
      )}
    </section>
  );
}
