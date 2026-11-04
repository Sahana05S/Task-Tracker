import Link from 'next/link';

import { LABEL_COLOUR_CLASS, type Label } from '@/modules/labels/client';
import { cn } from '@/shared/utils';

/** One label as a chip linking to its browse page. */
export function LabelChip({ label, className }: { label: Label; className?: string }) {
  return (
    <Link
      href={`/labels/${encodeURIComponent(label.slug)}`}
      className={cn('badge-soft hover:underline', LABEL_COLOUR_CLASS[label.colour], className)}
      title={label.description ?? `Everything labelled ${label.name}`}
    >
      <span aria-hidden="true">#</span>{label.name}
    </Link>
  );
}

/**
 * The labels on a record, read-only. Renders nothing when there are none.
 * `max` shows the first few and a "+n" count (titled with the rest) for tight
 * places such as table rows and cards.
 */
export function LabelChips({ labels, max, className, chipClassName }: {
  labels: readonly Label[] | undefined;
  max?: number;
  className?: string;
  chipClassName?: string;
}) {
  if (!labels?.length) return null;
  const shown = max && labels.length > max ? labels.slice(0, max) : labels;
  const rest = labels.slice(shown.length);
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label="Labels">
      {shown.map((label) => <li key={label.id}><LabelChip label={label} className={chipClassName} /></li>)}
      {rest.length ? (
        <li className={cn('badge-soft badge-neutral', chipClassName)} title={rest.map((label) => `#${label.name}`).join(' ')}>
          +{rest.length}<span className="sr-only"> more: {rest.map((label) => label.name).join(', ')}</span>
        </li>
      ) : null}
    </ul>
  );
}
