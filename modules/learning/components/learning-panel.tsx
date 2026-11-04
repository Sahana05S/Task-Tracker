'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LightbulbIcon, PencilIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react';
import { toast } from 'sonner';

import { saveLearning, withdrawLearning } from '@/modules/learning/actions';
import {
  LEARNING_KIND_LABEL,
  LEARNING_MAX_LENGTH,
  learningCounts,
  type LearningKind,
  type MissionLearning,
  type MissionLearnings,
} from '@/modules/learning/client';
import { formatDate } from '@/shared/tracker/format';
import { Button } from '@/shared/ui/button';
import { MissionPanel } from '@/shared/ui/mission-ui';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { Textarea } from '@/shared/ui/textarea';

const KIND_OPTIONS = [
  { value: 'mistake', label: 'Mistake', icon: TriangleAlertIcon },
  { value: 'learning', label: 'Learning', icon: LightbulbIcon },
] as const;

function formData(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

function NoteForm({ taskId, taskTag, note, onDone }: {
  taskId: string;
  taskTag: string;
  /** Editing this note; adding a new one when absent. */
  note?: MissionLearning;
  onDone: () => void;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<LearningKind>(note?.kind ?? 'learning');
  const [body, setBody] = useState(note?.body ?? '');
  // One operation id per draft, so a retried submit is answered from the receipt.
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [saving, startSaving] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startSaving(async () => {
      const result = await saveLearning(formData({ taskId, taskTag, learningId: note?.id ?? '', kind, body, operationId }));
      if (!result.success) {
        toast.error(result.error ?? 'The note was not saved.');
        return;
      }
      toast.success(note ? 'Note updated.' : 'Note added.');
      setBody('');
      setOperationId(crypto.randomUUID());
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <SegmentedControl label="Kind of note" value={kind} options={KIND_OPTIONS} onValueChange={setKind} className="w-fit" />
      <Textarea
        value={body}
        onChange={(event) => { setBody(event.target.value); setOperationId(crypto.randomUUID()); }}
        maxLength={LEARNING_MAX_LENGTH}
        rows={3}
        required
        aria-label={kind === 'mistake' ? 'What went wrong' : 'What was learned'}
        placeholder={kind === 'mistake' ? 'What went wrong, and how it was caught' : 'What to do the same way, or differently, next time'}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={saving || !body.trim()}>{note ? 'Save changes' : 'Add note'}</Button>
        {note ? <Button type="button" size="sm" variant="ghost" onClick={onDone}>Cancel</Button> : null}
      </div>
    </form>
  );
}

/**
 * Mistakes and learning on the mission's Details tab (migration 111). Every
 * member reads them; the mission's assignees, project engineers and the
 * managing director add notes; the author or a manager edits or withdraws one.
 * Not a dated record and never part of a score.
 */
export function LearningPanel({ taskId, taskTag, learnings, noteExtras }: {
  taskId: string;
  taskTag: string;
  learnings: MissionLearnings;
  /** Per-note blocks shown under a note (its labels), keyed by note id. */
  noteExtras?: Readonly<Record<string, React.ReactNode>>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, startRemoving] = useTransition();
  const counts = learningCounts(learnings.items);

  function withdraw(note: MissionLearning) {
    if (!window.confirm('Withdraw this note? It stays in the mission\'s history.')) return;
    startRemoving(async () => {
      const result = await withdrawLearning(formData({ taskId, taskTag, learningId: note.id, operationId: crypto.randomUUID() }));
      if (!result.success) {
        toast.error(result.error ?? 'The note was not withdrawn.');
        return;
      }
      toast.success('Withdrawn.');
      router.refresh();
    });
  }

  return (
    <MissionPanel
      id="learning"
      icon={LightbulbIcon}
      title="Mistakes and learning"
      subtitle={learnings.items.length
        ? `${counts.mistake} mistake${counts.mistake === 1 ? '' : 's'} · ${counts.learning} learning${counts.learning === 1 ? '' : 's'}`
        : 'What went wrong and what to repeat, kept with the mission'}
    >
      <div className="grid gap-5">
        {learnings.items.length ? (
          <ul className="divide-border grid divide-y text-sm">
            {learnings.items.map((note) => (
              <li key={note.id} className="grid gap-1.5 py-3 first:pt-0 last:pb-0">
                {editing === note.id ? (
                  <NoteForm taskId={taskId} taskTag={taskTag} note={note} onDone={() => setEditing(null)} />
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <span className={note.kind === 'mistake' ? 'badge-soft badge-priority-high' : 'badge-soft badge-status-done'}>
                        {note.kind === 'mistake' ? <TriangleAlertIcon className="size-3" aria-hidden="true" /> : <LightbulbIcon className="size-3" aria-hidden="true" />}
                        {LEARNING_KIND_LABEL[note.kind]}
                      </span>
                      {note.canEdit ? (
                        <div className="flex shrink-0 gap-1">
                          <Button type="button" size="icon" variant="ghost" aria-label="Edit note" onClick={() => setEditing(note.id)}>
                            <PencilIcon aria-hidden="true" />
                          </Button>
                          <Button type="button" size="icon" variant="ghost" aria-label="Withdraw note" disabled={removing} onClick={() => withdraw(note)}>
                            <Trash2Icon aria-hidden="true" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    <p className="text-foreground whitespace-pre-wrap break-words">{note.body}</p>
                    <p className="text-muted-foreground text-xs">
                      {note.authorName ?? 'Team member'} · {formatDate(note.createdAt.slice(0, 10))}{note.edited ? ' · edited' : ''}
                    </p>
                    {noteExtras?.[note.id] ?? null}
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {learnings.canAdd ? 'No notes yet. Record a mistake once it is caught, or a learning worth repeating.' : 'No notes yet.'}
          </p>
        )}
        {learnings.canAdd ? (
          <div className="border-border border-t pt-4">
            <NoteForm taskId={taskId} taskTag={taskTag} onDone={() => undefined} />
          </div>
        ) : null}
      </div>
    </MissionPanel>
  );
}
