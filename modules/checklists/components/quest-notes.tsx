'use client';

import * as React from 'react';
import { NotebookPenIcon } from 'lucide-react';

/**
 * Quest notes on the checklist (migration 132): how many notes each Quest row has, and the Quest whose
 * notes open on arrival (`?notes=<row id>`, from a label page). `counts` null means notes are not
 * available here (an older database or a failed read), so no Notes item is offered.
 */
interface QuestNotesState { counts: Readonly<Record<string, number>> | null; openNodeId: string | null }
const NotesContext = React.createContext<QuestNotesState>({ counts: null, openNodeId: null });

export function QuestNotesProvider({ counts, openNodeId, children }: QuestNotesState & { children: React.ReactNode }) {
  const value = React.useMemo(() => ({ counts, openNodeId }), [counts, openNodeId]);
  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export const useQuestNotes = () => React.useContext(NotesContext);

/** A small count on a Quest row, only when it has notes. */
export function QuestNoteBadge({ nodeId }: { nodeId: string }) {
  const { counts } = useQuestNotes();
  const count = counts?.[nodeId] ?? 0;
  if (!count) return null;
  return (
    <span className="badge-soft badge-neutral" title={`${count} note${count === 1 ? '' : 's'} on this Quest`}>
      <NotebookPenIcon className="size-3" aria-hidden="true" />{count}<span className="sr-only"> notes</span>
    </span>
  );
}
