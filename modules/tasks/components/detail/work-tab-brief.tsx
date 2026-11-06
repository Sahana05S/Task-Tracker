import Link from 'next/link';

import { detailValues } from '@/modules/tasks/client';
import type { TaskDetailSection } from '@/types/tracker';

const SMART = [
  ['smart_specific', 'Specific'],
  ['smart_measurable', 'Measurable'],
  ['smart_achievable', 'Achievable'],
  ['smart_relevant', 'Relevant'],
  ['smart_time_bound', 'Time-bound'],
] as const;

/**
 * The Work tab's read-only goal line (update plan E): the first two lines of
 * the mission description and one chip per SMART goal that is filled in, each
 * chip showing its text on hover. Edited on the Details tab; nothing here
 * writes. Renders nothing when the details are empty. `extra` is a slot for
 * other small chips (Notes).
 */
export function WorkTabBrief({ sections, extra }: { sections: readonly TaskDetailSection[]; extra?: React.ReactNode }) {
  const values = detailValues(sections);
  const description = values.description.trim();
  const smart = SMART.filter(([key]) => values[key].trim());
  if (!description && !smart.length && !extra) return null;
  return (
    <section aria-label="Mission goal" className="grid gap-2">
      {description ? (
        <p className="text-muted-foreground line-clamp-2 text-sm">
          {description}{' '}
          <Link href="?tab=details" className="link text-xs font-semibold">Details</Link>
        </p>
      ) : null}
      {smart.length || extra ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="SMART goals">
          {smart.map(([key, label]) => (
            <li key={key} className="badge-soft badge-accent max-w-full" title={values[key]}>
              <span className="font-semibold">{label}</span>
              <span className="max-w-56 truncate font-normal">{values[key].trim()}</span>
            </li>
          ))}
          {extra ? <li>{extra}</li> : null}
        </ul>
      ) : null}
    </section>
  );
}
