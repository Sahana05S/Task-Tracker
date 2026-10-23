import Link from 'next/link';
import { ArrowRight, History } from 'lucide-react';

import { kolkataParts } from '@/modules/records/internal/activity-mapping';
import type { MissionHistoryPage } from '@/modules/records/internal/mission-history';
import type { MissionChange } from '@/modules/records/internal/mission-history-mapping';
import { formatDate } from '@/shared/tracker/format';
import { buttonVariants } from '@/shared/ui/button';
import { EmptyState, MissionNotice, MissionPanel } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

/**
 * The mission page's change log (History tab): every action on the mission,
 * newest first and grouped by Asia/Kolkata day, each with who did it, when,
 * and every value it changed. Paging keeps `tab=history` and adds `before`.
 */
export function MissionChangeLog({
  page,
  paged,
  seesEveryone,
}: {
  /** null when the read failed for a reason other than a missing migration. */
  page: MissionHistoryPage | null;
  /** True after "Older", so "Newest" is offered. */
  paged: boolean;
  /** Managers, assignees and reviewers see everyone's changes; others only their own. */
  seesEveryone: boolean;
}) {
  const subtitle = `${seesEveryone ? 'Everyone\'s changes' : 'Your changes'} · newest first · India time`;
  if (page && !page.available) {
    return (
      <MissionPanel icon={History} title="Change log">
        <MissionNotice tone="info" icon={History}>
          The change log is waiting for a database update. Changes are still recorded and will appear here once it is applied.
        </MissionNotice>
      </MissionPanel>
    );
  }
  return (
    <MissionPanel icon={History} title="Change log" subtitle={subtitle}>
      {!page ? (
        <MissionNotice tone="attention">The change log could not be read just now. Try again shortly.</MissionNotice>
      ) : page.changes.length === 0 ? (
        <EmptyState title="No changes yet">{paged ? 'There is nothing older.' : 'Edits, checklist answers, timers and logs will appear here.'}</EmptyState>
      ) : (
        <div className="grid gap-4">
          {groupByDay(page.changes).map(([day, changes]) => (
            <section key={day} aria-label={formatDate(day)}>
              <h3 className="text-foreground mb-2 text-xs font-semibold">{formatDate(day)}</h3>
              <ol className="border-border grid gap-0 border-l pl-4">
                {changes.map((change) => (
                  <li key={change.id} className="relative pb-3 last:pb-0">
                    <span aria-hidden="true" className="bg-primary absolute top-1.5 -left-[1.3rem] size-2 rounded-full" />
                    <p className="text-sm">
                      <span className="text-muted-foreground tabular mr-2 text-xs">{kolkataParts(change.at).time}</span>
                      <span className="text-foreground font-medium">{change.headline}</span>
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {change.actor}
                      {change.reason ? <span> · “{change.reason}”</span> : null}
                    </p>
                    {change.lines.length ? (
                      <ul className="text-muted-foreground mt-1 grid gap-0.5 text-xs">
                        {change.lines.map((line) => <li key={line} className="break-words">{line}</li>)}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
      {page?.available && (page.next || paged) ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {paged ? <Link href="?tab=history" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Newest</Link> : null}
          {page.next ? (
            <Link
              href={`?${new URLSearchParams({ tab: 'history', before: page.next })}`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'ml-auto')}
            >
              Older
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </MissionPanel>
  );
}

function groupByDay(changes: readonly MissionChange[]): [string, MissionChange[]][] {
  const groups = new Map<string, MissionChange[]>();
  for (const change of changes) {
    const day = kolkataParts(change.at).date;
    const rows = groups.get(day);
    if (rows) rows.push(change);
    else groups.set(day, [change]);
  }
  return [...groups];
}
