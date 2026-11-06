'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FlagIcon, ListChecksIcon, NotebookPenIcon, PencilIcon, Trash2Icon, XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { LABEL_COLOUR_CLASS, type Label } from '@/modules/labels/client';
import { LabelChips } from '@/modules/labels/components/label-chips';
import { LabelCombobox, type LabelChoice } from '@/modules/labels/components/label-combobox';
import { deleteNote, saveNote } from '@/modules/learning/actions';
import {
  filterNotes,
  hasNoteType,
  NOTE_MAX_HASHTAGS,
  NOTE_MAX_LENGTH,
  noteHashtagCounts,
  noteTypeLabels,
  type MissionNote,
  type MissionNotes,
} from '@/modules/learning/client';
import { formatDate } from '@/shared/tracker/format';
import { Button } from '@/shared/ui/button';
import { MissionPanel } from '@/shared/ui/mission-ui';
import { Textarea } from '@/shared/ui/textarea';
import { cn } from '@/shared/utils';

/** A Quest or objective the panel is opened for (`?notes=<row id>` from the checklist). */
export interface NoteScope {
  readonly nodeId: string;
  readonly title: string;
}

/** A hashtag on the draft: chosen from the list, or a new name (managers create it on save). */
type Pick = { label: Label } | { create: string };

function formData(values: Record<string, string | readonly string[]>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string') form.set(key, value);
    else for (const item of value) form.append(key, item);
  }
  return form;
}

function NoteForm({ taskId, taskTag, note, scope, catalogue, canCreate, onDone }: {
  taskId: string;
  taskTag: string;
  /** Editing this note; adding a new one when absent. */
  note?: MissionNote;
  /** A new note goes on this Quest or objective. */
  scope?: NoteScope | null;
  catalogue: readonly Label[];
  canCreate: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState(note?.body ?? '');
  const [picks, setPicks] = useState<Pick[]>(() => (note?.labels ?? []).map((label) => ({ label })));
  // One operation id per draft, so a retried submit is answered from the receipt.
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [saving, startSaving] = useTransition();
  const types = noteTypeLabels(catalogue);
  const chosen = picks.flatMap((pick) => ('label' in pick ? [pick.label] : []));
  // A company without note types gets the starter set on its first note (the database adds them).
  const typed = types.length ? hasNoteType(chosen) : picks.length > 0;
  const full = picks.length >= NOTE_MAX_HASHTAGS;

  function change(next: Pick[]) { setPicks(next); setOperationId(crypto.randomUUID()); }
  function toggle(label: Label) {
    change(chosen.some((l) => l.id === label.id) ? picks.filter((p) => !('label' in p) || p.label.id !== label.id) : [...picks, { label }]);
  }
  function choose(choice: LabelChoice) {
    if (full) return false;
    if ('label' in choice) { if (!chosen.some((l) => l.id === choice.label.id)) change([...picks, { label: choice.label }]); }
    else if (!picks.some((p) => 'create' in p && p.create.toLowerCase() === choice.create.toLowerCase())) change([...picks, { create: choice.create }]);
    return true;
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startSaving(async () => {
      const result = await saveNote(formData({
        taskId, taskTag, noteId: note?.id ?? '', nodeId: note ? '' : scope?.nodeId ?? '', body, operationId,
        labelIds: chosen.map((label) => label.id),
        newLabels: picks.flatMap((pick) => ('create' in pick ? [pick.create] : [])),
      }));
      if (!result.success) {
        toast.error(result.error ?? 'The note was not saved.');
        return;
      }
      toast.success(note ? 'Note updated.' : 'Note added.');
      if (!note) { setBody(''); setPicks([]); }
      setOperationId(crypto.randomUUID());
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <Textarea
        value={body}
        onChange={(event) => { setBody(event.target.value); setOperationId(crypto.randomUUID()); }}
        maxLength={NOTE_MAX_LENGTH}
        rows={3}
        required
        aria-label="Note"
        placeholder={scope && !note ? `A note on ${scope.title}` : 'What happened, what was decided, or what to watch'}
      />
      {types.length ? (
        <div className="grid gap-1.5">
          <p className="text-muted-foreground text-xs font-semibold">Type <span className="font-normal">(at least one)</span></p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Note type">
            {types.map((label) => {
              const on = chosen.some((l) => l.id === label.id);
              return (
                <button
                  key={label.id}
                  type="button"
                  aria-pressed={on}
                  disabled={!on && full}
                  onClick={() => toggle(label)}
                  className={cn('badge-soft cursor-pointer transition-opacity', on ? LABEL_COLOUR_CLASS[label.colour] : 'badge-neutral opacity-70 hover:opacity-100')}
                >
                  #{label.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <p className="text-muted-foreground text-xs font-semibold">Hashtags</p>
        {picks.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Hashtags on this note">
            {picks.map((pick) => {
              const key = 'label' in pick ? pick.label.id : `new:${pick.create}`;
              const name = 'label' in pick ? pick.label.name : pick.create;
              return (
                <li key={key} className={cn('badge-soft', 'label' in pick ? LABEL_COLOUR_CLASS[pick.label.colour] : 'badge-neutral')}>
                  #{name}{'create' in pick ? <span className="text-muted-foreground"> (new)</span> : null}
                  <button
                    type="button"
                    className="-mr-1 rounded-full p-0.5 hover:bg-muted"
                    aria-label={`Remove #${name}`}
                    onClick={() => change(picks.filter((p) => p !== pick))}
                  >
                    <XIcon className="size-3" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        <LabelCombobox
          catalogue={catalogue}
          current={chosen}
          canCreate={canCreate}
          disabled={full}
          onChoose={choose}
          placeholder={canCreate ? 'Type # to add or create a hashtag' : 'Type # to add a hashtag'}
          ariaLabel="Add a hashtag"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={saving || !body.trim() || !typed}>{note ? 'Save changes' : 'Add note'}</Button>
        {note ? <Button type="button" size="sm" variant="ghost" onClick={onDone}>Cancel</Button> : null}
        {!typed ? <span className="text-muted-foreground text-xs">Pick a type, such as #mistake or #learning.</span> : null}
      </div>
    </form>
  );
}

/**
 * Notes on the mission's Details tab (migration 126; Mistakes and learning
 * before it). A note is a short text with hashtags, at least one a note type.
 * It belongs to the mission or one of its Quests or objectives; the panel lists
 * all of them, newest first, and filters by hashtag. Only the mission's people
 * and the managing director read them; the author edits, the author or a
 * manager deletes. Never part of a score.
 */
export function NotesPanel({ taskId, taskTag, notes, catalogue, canCreate, scope = null, allHref }: {
  taskId: string;
  taskTag: string;
  notes: MissionNotes;
  /** The company's hashtags, for the picker; null hides the add form (the catalogue read failed). */
  catalogue: readonly Label[] | null;
  /** May create a hashtag on the way (managers). */
  canCreate: boolean;
  /** Opened for one Quest or objective: the list shows its notes and new notes go on it. */
  scope?: NoteScope | null;
  /** The panel without a scope. */
  allHref: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [hashtag, setHashtag] = useState<string | null>(null);
  const [removing, startRemoving] = useTransition();
  const scoped = useMemo(() => filterNotes(notes.items, null, scope?.nodeId ?? null), [notes.items, scope]);
  const counts = useMemo(() => noteHashtagCounts(scoped), [scoped]);
  const shown = useMemo(() => filterNotes(scoped, hashtag), [scoped, hashtag]);

  function remove(note: MissionNote) {
    if (!window.confirm('Delete this note? It stays in the mission\'s history.')) return;
    startRemoving(async () => {
      const result = await deleteNote(formData({ taskId, taskTag, noteId: note.id, operationId: crypto.randomUUID() }));
      if (!result.success) {
        toast.error(result.error ?? 'The note was not deleted.');
        return;
      }
      toast.success('Note deleted.');
      router.refresh();
    });
  }

  return (
    <MissionPanel
      id="notes"
      icon={NotebookPenIcon}
      title="Notes"
      subtitle={scope
        ? `On ${scope.title} · ${scoped.length} ${scoped.length === 1 ? 'note' : 'notes'}`
        : notes.items.length
          ? `${notes.items.length} ${notes.items.length === 1 ? 'note' : 'notes'} on this mission, its Quests and objectives`
          : 'Mistakes, learnings, ideas and decisions, kept with the mission'}
      action={scope ? <Link href={allHref} className="link text-xs font-semibold" scroll={false}>Show all notes</Link> : null}
    >
      <div className="grid gap-5">
        {counts.length > 1 || hashtag ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter notes by hashtag">
            <button type="button" aria-pressed={!hashtag} onClick={() => setHashtag(null)}
              className={cn('badge-soft cursor-pointer', !hashtag ? 'bg-primary-subtle text-primary-subtle-foreground' : 'badge-neutral')}>
              All
            </button>
            {counts.map(({ label, count }) => (
              <button key={label.id} type="button" aria-pressed={hashtag === label.slug}
                onClick={() => setHashtag(hashtag === label.slug ? null : label.slug)}
                className={cn('badge-soft cursor-pointer', hashtag === label.slug ? LABEL_COLOUR_CLASS[label.colour] : 'badge-neutral')}>
                #{label.name} <span className="opacity-70">{count}</span>
              </button>
            ))}
          </div>
        ) : null}
        {shown.length ? (
          <ul className="divide-border grid divide-y text-sm">
            {shown.map((note) => (
              <li key={note.id} className="grid gap-1.5 py-3 first:pt-0 last:pb-0">
                {editing === note.id && catalogue ? (
                  <NoteForm taskId={taskId} taskTag={taskTag} note={note} catalogue={catalogue} canCreate={canCreate} onDone={() => setEditing(null)} />
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <LabelChips labels={note.labels} />
                      {note.canEdit || note.canDelete ? (
                        <div className="flex shrink-0 gap-1">
                          {note.canEdit && catalogue ? (
                            <Button type="button" size="icon" variant="ghost" aria-label="Edit note" onClick={() => setEditing(note.id)}>
                              <PencilIcon aria-hidden="true" />
                            </Button>
                          ) : null}
                          {note.canDelete ? (
                            <Button type="button" size="icon" variant="ghost" aria-label="Delete note" disabled={removing} onClick={() => remove(note)}>
                              <Trash2Icon aria-hidden="true" />
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <p className="text-foreground whitespace-pre-wrap break-words">{note.body}</p>
                    <p className="text-muted-foreground flex flex-wrap items-center gap-x-1 text-xs">
                      <span>{note.authorName ?? 'Team member'} · {formatDate(note.createdAt.slice(0, 10))}{note.edited ? ' · edited' : ''}</span>
                      {note.nodeId && !scope ? (
                        <span className="inline-flex items-center gap-1">
                          ·{note.nodeKind === 'quest' ? <FlagIcon className="size-3" aria-hidden="true" /> : <ListChecksIcon className="size-3" aria-hidden="true" />}
                          {note.nodeKind === 'quest' ? 'Quest' : 'Objective'}: {note.nodeTitle ?? 'a removed row'}
                        </span>
                      ) : null}
                    </p>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {hashtag ? 'No notes carry this hashtag.' : notes.canAdd ? 'No notes yet. Write one, then pick its type and any other hashtags.' : 'No notes yet.'}
          </p>
        )}
        {notes.canAdd && catalogue ? (
          <div className="border-border border-t pt-4">
            <NoteForm taskId={taskId} taskTag={taskTag} scope={scope} catalogue={catalogue} canCreate={canCreate} onDone={() => undefined} />
          </div>
        ) : null}
      </div>
    </MissionPanel>
  );
}
