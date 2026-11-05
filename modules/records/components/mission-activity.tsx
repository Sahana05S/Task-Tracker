import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { cursorParam, kolkataParts } from '@/modules/records/internal/activity-mapping';
import type { MissionActivityEntry, MissionActivityPage } from '@/modules/records/internal/mission-activity-mapping';
import { formatDate } from '@/shared/tracker/format';
import { buttonVariants } from '@/shared/ui/button';
import { EmptyState, MissionNotice } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

/**
 * A mission's own history (History tab, migration 124): who changed what on
 * this mission, with names and before -> after values, grouped by India day,
 * newest first, with keyset paging. Read only. Team > Activity is the
 * company-wide view of the same words.
 */
export function MissionActivity({
  page,
  basePath,
  paged,
}: {
  /** null when the read failed for a reason other than a missing migration. */
  page: MissionActivityPage | null;
  /** The History tab's URL without a cursor, e.g. `/tasks/T1?tab=history`. */
  basePath: string;
  paged: boolean;
}) {
  if (!page) return <MissionNotice tone="attention">The mission&apos;s activity could not be read just now. Try again shortly.</MissionNotice>;
  if (!page.available) {
    return (
      <MissionNotice tone="info">
        The mission&apos;s activity is not available here yet: this workspace is waiting for a database update.
      </MissionNotice>
    );
  }
  const join = basePath.includes('?') ? '&' : '?';
  return (
    <div className="grid gap-3">
      {page.entries.length === 0 ? (
        <EmptyState title="No changes yet">{paged ? 'There is nothing older.' : 'Changes to this mission will appear here.'}</EmptyState>
      ) : (
        groupByDay(page.entries).map(([day, entries]) => (
          <section key={day} aria-label={formatDate(day)} className="grid gap-1">
            <h3 className="text-muted-foreground text-xs font-semibold">{formatDate(day)}</h3>
            <ol className="border-border divide-border divide-y rounded-xl border bg-card">
              {entries.map((entry) => (
                <li key={entry.id} className="grid gap-0.5 px-3 py-2 text-sm">
                  <p className="text-foreground">
                    {entry.summary}
                    {entry.detail ? <span className="text-muted-foreground">: {entry.detail}</span> : null}
                  </p>
                  {entry.changes.length ? (
                    <ul className="text-muted-foreground grid gap-0.5 text-xs">
                      {entry.changes.map((change) => (
                        <li key={change.label}>
                          {change.label}: {change.before ?? 'none'} → <span className="text-foreground">{change.after ?? 'none'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="text-muted-foreground text-xs">
                    <span className="tabular">{kolkataParts(entry.at).time}</span> · {entry.actor}
                    {entry.reason ? <span> · “{entry.reason}”</span> : null}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
      {page.next || paged ? (
        <div className="flex flex-wrap items-center gap-2">
          {paged ? <Link href={basePath} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Newest</Link> : null}
          {page.next ? (
            <Link
              href={`${basePath}${join}before=${encodeURIComponent(cursorParam(page.next))}`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'ml-auto')}
            >
              Older
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function groupByDay(entries: readonly MissionActivityEntry[]): [string, MissionActivityEntry[]][] {
  const groups = new Map<string, MissionActivityEntry[]>();
  for (const entry of entries) {
    const day = kolkataParts(entry.at).date;
    const rows = groups.get(day);
    if (rows) rows.push(entry);
    else groups.set(day, [entry]);
  }
  return [...groups];
}
