import Link from 'next/link';
import { NotebookPenIcon } from 'lucide-react';

import type { MissionNotes } from '@/modules/learning/client';

/** The Work tab's link to Notes on the Details tab, with the count. */
export function NotesCountChip({ notes }: { notes: MissionNotes }) {
  const total = notes.items.length;
  return (
    <Link href="?tab=details#notes" className="badge-soft badge-neutral hover:underline" title={total ? 'Open the mission\'s notes' : 'No notes yet'}>
      <NotebookPenIcon className="size-3" aria-hidden="true" />
      {total ? `${total} ${total === 1 ? 'note' : 'notes'}` : 'Notes'}
    </Link>
  );
}
