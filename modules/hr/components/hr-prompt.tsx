import Link from 'next/link';
import { ClipboardPenIcon, ScrollTextIcon } from 'lucide-react';

import { readCodeOfConduct } from '@/modules/hr/internal/conduct';
import { readPendingSelfReviews } from '@/modules/hr/internal/reviews';

/**
 * Today's HR reminders: a self-review waiting on the member, and a published
 * Code of Conduct they have not accepted. Nothing shows when neither applies
 * or before migrations 80-81.
 */
export async function HrPrompt({ userId }: { userId: string }) {
  const [reviews, conduct] = await Promise.all([
    readPendingSelfReviews(userId),
    readCodeOfConduct().catch(() => null),
  ]);
  const items = [
    ...reviews.map(review => ({ key: review.id, href: `/hr/reviews/${review.id}`, icon: ClipboardPenIcon, title: 'Your self-review is waiting', detail: review.title, action: 'Rate yourself' })),
    ...(conduct?.current && !conduct.acknowledgedAt
      ? [{ key: 'conduct', href: '/hr/documents/code-of-conduct', icon: ScrollTextIcon, title: 'Please read and accept the Code of Conduct', detail: `Version ${conduct.current.version}`, action: 'Read it' }]
      : []),
  ];
  if (!items.length) return null;
  return (
    <div className="mb-5 grid gap-2">
      {items.map(item => (
        <div key={item.key} className="border-border bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <item.icon aria-hidden="true" className="text-primary mt-0.5 size-5 shrink-0" />
            <div className="min-w-0">
              <p className="text-foreground text-sm font-semibold">{item.title}</p>
              <p className="text-muted-foreground text-xs">{item.detail}</p>
            </div>
          </div>
          <Link href={item.href} className="bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:outline-primary inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold">
            {item.action}
          </Link>
        </div>
      ))}
    </div>
  );
}
