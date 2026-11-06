'use client';

import * as React from 'react';
import Link from 'next/link';
import { LoaderCircleIcon, NotebookPenIcon, PencilIcon, Trash2Icon, XIcon } from 'lucide-react';

import { LABEL_COLOUR_CLASS, type Label } from '@/modules/labels/client';
import { LabelPicker, type PickedLabel } from '@/modules/labels/components/label-picker';
import { loadQuestNotes, questNoteCommand } from '@/modules/learning/actions';
import { filterNotes, NOTE_MAX_LENGTH, type QuestNote, type QuestNotes } from '@/modules/learning/client';
import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { Textarea } from '@/shared/ui/textarea';
import { cn } from '@/shared/utils';

type Loaded = { notes: QuestNotes; labels: Label[]; canCreateLabels: boolean };

const toPicks = (labels: readonly Label[]): PickedLabel[] => labels.map((label) => ({ id: label.id, name: label.name, colour: label.colour }));

/**
 * One Quest's notes in a side panel (migration 132), opened from the Quest row's ⋯ menu: newest
 * first, each with its labels; tap a label to show only its notes (with a link to all of them on the
 * label's page); add a short note with one or more company labels; the author edits, the author, a
 * Manager or the managing director deletes. Read when it opens, so a closed panel costs nothing.
 */
export function QuestNotesSheet({ open, onOpenChange, taskId, nodeId, title }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  nodeId: string;
  title: string;
}) {
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<Label | null>(null);
  const [editing, setEditing] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const result = await loadQuestNotes(nodeId);
      if (result.success && result.data) setLoaded(result.data);
      else setError(result.error ?? 'These notes could not be loaded.');
    } catch {
      setError('These notes could not be loaded. Check the connection.');
    }
  }, [nodeId]);

  React.useEffect(() => { if (open) void load(); }, [open, load]);

  const shown = loaded ? filterNotes(loaded.notes.items, filter?.slug ?? null) : [];
  const done = () => { setEditing(null); void load(); };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="pr-12">
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold"><NotebookPenIcon className="size-3.5" aria-hidden="true" />Quest notes</p>
          <SheetTitle className="text-foreground text-lg font-bold tracking-tight break-words">{title}</SheetTitle>
          <SheetDescription className="text-muted-foreground">What happened and what was learnt, tagged with labels.</SheetDescription>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-5 py-5">
          {error ? (
            <p role="alert" className="text-danger text-sm">{error} <button type="button" className="link font-semibold" onClick={() => void load()}>Retry</button></p>
          ) : !loaded ? (
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm"><LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />Loading notes…</p>
          ) : (
            <>
              {loaded.notes.canAdd ? (
                <NoteForm taskId={taskId} nodeId={nodeId} labels={loaded.labels} canCreateLabels={loaded.canCreateLabels} onDone={done} />
              ) : null}

              {filter ? (
                <div className="bg-muted/60 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm">
                  <span>Only <span className={cn('badge-soft', LABEL_COLOUR_CLASS[filter.colour])}>#{filter.name}</span></span>
                  <Link href={`/labels/${encodeURIComponent(filter.slug)}`} className="link font-semibold">See all #{filter.name} notes</Link>
                  <button type="button" className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-xs" onClick={() => setFilter(null)}>
                    <XIcon className="size-3.5" aria-hidden="true" />Show all
                  </button>
                </div>
              ) : null}

              {shown.length ? (
                <ol className="divide-border grid divide-y" aria-label="Notes, newest first">
                  {shown.map((note) => (
                    <li key={note.id} className="grid gap-2 py-3">
                      {editing === note.id ? (
                        <NoteForm taskId={taskId} nodeId={nodeId} note={note} labels={loaded.labels} canCreateLabels={loaded.canCreateLabels} onDone={done} onCancel={() => setEditing(null)} />
                      ) : (
                        <NoteItem note={note} taskId={taskId} onFilter={setFilter} onEdit={() => setEditing(note.id)} onDeleted={done} />
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-muted-foreground text-sm">{filter ? `No notes on this Quest carry #${filter.name}.` : 'No notes on this Quest yet.'}</p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NoteItem({ note, taskId, onFilter, onEdit, onDeleted }: {
  note: QuestNote;
  taskId: string;
  onFilter: (label: Label) => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const date = note.createdAt ? new Date(note.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '';
  return (
    <>
      <p className="text-foreground text-sm whitespace-pre-wrap break-words">{note.body}</p>
      {note.labels.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Labels">
          {note.labels.map((label) => (
            <li key={label.id}>
              {/* Tapping a label shows only its notes here; the bar above then links to all of them. */}
              <button type="button" onClick={() => onFilter(label)} className={cn('badge-soft hover:underline', LABEL_COLOUR_CLASS[label.colour])} title={`Show only #${label.name} notes`}>
                #{label.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span>{note.authorName ?? 'A member'} · {date}{note.edited ? ' · edited' : ''}</span>
        <span className="ml-auto flex items-center gap-1">
          {note.canEdit ? (
            <Button type="button" variant="ghost" size="sm" className="h-7" onClick={onEdit}><PencilIcon aria-hidden="true" />Edit</Button>
          ) : null}
          {note.canDelete ? (
            <ExecutionForm action={questNoteCommand} scope={`note-delete:${note.id}`} onSuccess={onDeleted}>
              <input type="hidden" name="op" value="delete" />
              <input type="hidden" name="taskId" value={taskId} />
              <input type="hidden" name="note_id" value={note.id} />
              <Button type="submit" variant="ghost" size="sm" className="text-danger h-7"><Trash2Icon aria-hidden="true" />Delete</Button>
            </ExecutionForm>
          ) : null}
        </span>
      </div>
    </>
  );
}

/** A new note, or the author's edit of one: short text and one or more labels. */
function NoteForm({ taskId, nodeId, note, labels, canCreateLabels, onDone, onCancel }: {
  taskId: string;
  nodeId: string;
  note?: QuestNote;
  labels: readonly Label[];
  canCreateLabels: boolean;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [picks, setPicks] = React.useState<PickedLabel[]>(() => (note ? toPicks(note.labels) : []));
  const id = React.useId();
  return (
    <ExecutionForm action={questNoteCommand} scope={note ? `note-edit:${note.id}` : `note-add:${nodeId}`} onSuccess={() => { if (!note) setPicks([]); onDone(); }}>
      <input type="hidden" name="op" value={note ? 'edit' : 'add'} />
      <input type="hidden" name="taskId" value={taskId} />
      {note ? <input type="hidden" name="note_id" value={note.id} /> : <input type="hidden" name="node_id" value={nodeId} />}
      {picks.map((pick) => pick.id
        ? <input key={pick.id} type="hidden" name="label_id" value={pick.id} />
        : <input key={`new:${pick.name}`} type="hidden" name="new_label" value={pick.name} />)}
      <div className="grid gap-2">
        <label htmlFor={`${id}-body`} className="sr-only">{note ? 'Edit the note' : 'New note'}</label>
        <Textarea id={`${id}-body`} name="body" required maxLength={NOTE_MAX_LENGTH} rows={3} defaultValue={note?.body}
          placeholder="What happened, and what did you learn?" />
        <LabelPicker value={picks} onChange={setPicks} catalogue={labels} canCreate={canCreateLabels} inputId={`${id}-labels`} />
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={!picks.length} title={picks.length ? undefined : 'Add at least one label, such as #mistake'}>
            {note ? 'Save note' : 'Add note'}
          </Button>
          {onCancel ? <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button> : null}
          {!picks.length ? <span className="text-muted-foreground text-xs">Add at least one label, such as #mistake.</span> : null}
        </div>
      </div>
    </ExecutionForm>
  );
}
