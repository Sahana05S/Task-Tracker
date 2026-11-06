'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArchiveIcon, ArchiveRestoreIcon, NotebookPenIcon, PencilIcon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { manageLabel } from '@/modules/labels/actions';
import {
  LABEL_COLOUR_CLASS,
  LABEL_COLOUR_NAME,
  LABEL_COLOURS,
  LABEL_NAME_MAX,
  type CatalogueLabel,
  type LabelColour,
} from '@/modules/labels/client';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/utils';

function formData(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

function LabelForm({ label, onDone }: { label?: CatalogueLabel; onDone: () => void }) {
  const router = useRouter();
  const path = usePathname();
  const [name, setName] = useState(label?.name ?? '');
  const [colour, setColour] = useState<LabelColour>(label?.colour ?? 'neutral');
  const [description, setDescription] = useState(label?.description ?? '');
  // One operation id per draft: an unchanged retry replays the receipt, an edited draft is a new operation.
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [saving, start] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await manageLabel(formData({
        op: label ? 'rename' : 'create', labelId: label?.id ?? '', name, colour, description, path, operationId,
      }));
      if (!result.success) {
        toast.error(result.error ?? 'The label was not saved.');
        return;
      }
      toast.success(label ? 'Label saved; everything it was on keeps it.' : `Created #${result.data?.name ?? name}.`);
      if (!label) { setName(''); setDescription(''); }
      setOperationId(crypto.randomUUID());
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,8rem)_minmax(0,1fr)_auto] sm:items-end">
      <label className="field-label">Name
        <input className="field" value={name} onChange={(e) => { setName(e.target.value); setOperationId(crypto.randomUUID()); }} maxLength={LABEL_NAME_MAX} required placeholder="Site safety" />
      </label>
      <label className="field-label">Colour
        <select className="field" value={colour} onChange={(e) => { setColour(e.target.value as LabelColour); setOperationId(crypto.randomUUID()); }}>
          {LABEL_COLOURS.map((value) => <option key={value} value={value}>{LABEL_COLOUR_NAME[value]}</option>)}
        </select>
      </label>
      <label className="field-label">Description (optional)
        <input className="field" value={description} onChange={(e) => { setDescription(e.target.value); setOperationId(crypto.randomUUID()); }} maxLength={300} />
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving || !name.trim()}>
          {label ? 'Save' : <><PlusIcon aria-hidden="true" />Create</>}
        </Button>
        {label ? <Button type="button" size="sm" variant="ghost" onClick={onDone}>Cancel</Button> : null}
      </div>
    </form>
  );
}

/**
 * Create, rename, recolour, archive and restore the company's labels, and
 * choose which are note types (managing director and managers; label_command
 * enforces it).
 * Renaming keeps the label's id, so every mission, note and meeting point it
 * is on keeps it. Archiving hides a label from records and suggestions.
 */
export function LabelManager({ labels }: { labels: readonly CatalogueLabel[] }) {
  const router = useRouter();
  const path = usePathname();
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, start] = useTransition();

  // Note types (migration 126): every note carries at least one of them.
  function toggleNoteType(label: CatalogueLabel) {
    start(async () => {
      const result = await manageLabel(formData({ op: label.noteType ? 'note_type_off' : 'note_type_on', labelId: label.id, path, operationId: crypto.randomUUID() }));
      if (!result.success) {
        toast.error(result.error ?? 'The label was not changed.');
        return;
      }
      toast.success(label.noteType ? `#${label.name} is no longer a note type.` : `#${label.name} is now a note type.`);
      router.refresh();
    });
  }

  function toggleArchive(label: CatalogueLabel) {
    start(async () => {
      const result = await manageLabel(formData({ op: label.archived ? 'restore' : 'archive', labelId: label.id, path, operationId: crypto.randomUUID() }));
      if (!result.success) {
        toast.error(result.error ?? 'The label was not changed.');
        return;
      }
      toast.success(label.archived ? `Restored #${label.name}.` : `Archived #${label.name}.`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5">
      <LabelForm onDone={() => undefined} />
      {labels.length ? (
        <ul className="divide-border grid divide-y text-sm">
          {labels.map((label) => (
            <li key={label.id} className="grid gap-2 py-2.5">
              {editing === label.id ? (
                <LabelForm label={label} onDone={() => setEditing(null)} />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <a href={`/labels/${encodeURIComponent(label.slug)}`} className={cn('badge-soft hover:underline', LABEL_COLOUR_CLASS[label.colour], label.archived && 'opacity-60')}>
                      #{label.name}
                    </a>
                    <span className="text-muted-foreground text-xs">
                      {label.uses} {label.uses === 1 ? 'record' : 'records'}{label.noteType ? ' · note type' : ''}{label.archived ? ' · archived' : ''}{label.description ? ` · ${label.description}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={label.noteType ? 'secondary' : 'ghost'}
                      disabled={busy || label.archived}
                      aria-pressed={label.noteType}
                      title="Every note needs at least one note type"
                      onClick={() => toggleNoteType(label)}
                    >
                      <NotebookPenIcon aria-hidden="true" />{label.noteType ? 'Note type' : 'Make note type'}
                    </Button>
                    <Button type="button" size="icon" variant="ghost" aria-label={`Rename ${label.name}`} onClick={() => setEditing(label.id)}>
                      <PencilIcon aria-hidden="true" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label={label.archived ? `Restore ${label.name}` : `Archive ${label.name}`} onClick={() => toggleArchive(label)}>
                      {label.archived ? <ArchiveRestoreIcon aria-hidden="true" /> : <ArchiveIcon aria-hidden="true" />}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="text-muted-foreground text-sm">No labels yet. Create one here, or type `#` and a new name on a mission.</p>}
    </div>
  );
}
