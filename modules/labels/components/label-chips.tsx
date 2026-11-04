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

/** The labels on a record, read-only. Renders nothing when there are none. */
export function LabelChips({ labels, className }: { labels: readonly Label[] | undefined; className?: string }) {
  if (!labels?.length) return null;
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label="Labels">
      {labels.map((label) => <li key={label.id}><LabelChip label={label} /></li>)}
    </ul>
  );
}
