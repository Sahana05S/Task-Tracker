import Link from 'next/link';

import { REVIEW_STATUS_LABELS, type ReviewStatus, type ReviewSummary } from '@/modules/hr/client';
import { formatDate } from '@/shared/tracker/format';
import { EmptyState } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

const BADGE: Record<ReviewStatus, string> = {
  awaiting_self: 'badge-status-not-started',
  awaiting_md: 'badge-status-in-progress',
  completed: 'badge-status-done',
};

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  return <span className={cn('badge-soft', BADGE[status])}>{REVIEW_STATUS_LABELS[status]}</span>;
}

const score = (value: number | null) => (value === null ? '—' : value.toFixed(2).replace(/\.?0+$/, ''));

/** Reviews as rows: the director's list shows the employee; the employee's shows their own. */
export function ReviewList({ reviews, director }: { reviews: readonly ReviewSummary[]; director: boolean }) {
  if (!reviews.length) {
    return <EmptyState>{director ? 'No reviews yet. Start one with New review.' : 'No reviews yet. The managing director starts them.'}</EmptyState>;
  }
  return (
    <ul className="divide-border border-border bg-card divide-y rounded-xl border">
      {reviews.map(review => (
        <li key={review.id}>
          <Link href={`/hr/reviews/${review.id}`} className="hover:bg-muted/50 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-3 transition-colors">
            <span className="min-w-0">
              <span className="text-foreground block font-semibold">{director ? review.employeeName : review.title}</span>
              <span className="text-muted-foreground block text-xs">
                {director ? `${review.employeeCode} · ${review.title}` : `Started ${formatDate(review.createdAt.slice(0, 10))}`}
              </span>
            </span>
            <span className="flex items-center gap-3 text-xs">
              <span className="text-muted-foreground tabular-nums">
                Self {score(review.selfAverage)}{review.mdAverage !== null ? ` · Director ${score(review.mdAverage)}` : ''}
              </span>
              <ReviewStatusBadge status={review.status} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
