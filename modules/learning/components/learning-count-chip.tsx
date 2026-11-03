import Link from 'next/link';
import { LightbulbIcon } from 'lucide-react';

import { learningCounts, type MissionLearnings } from '@/modules/learning/client';

/** The Work tab's link to Mistakes and learning on the Details tab, with its count. */
export function LearningCountChip({ learnings }: { learnings: MissionLearnings }) {
  const counts = learningCounts(learnings.items);
  const total = learnings.items.length;
  return (
    <Link
      href="?tab=details#learning"
      className="badge-soft badge-neutral hover:underline"
      title={total ? `${counts.mistake} mistakes, ${counts.learning} learnings` : 'No mistakes or learning recorded yet'}
    >
      <LightbulbIcon className="size-3" aria-hidden="true" />
      {total ? `${total} ${total === 1 ? 'note' : 'notes'} on mistakes and learning` : 'Mistakes and learning'}
    </Link>
  );
}
