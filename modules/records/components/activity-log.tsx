import Link from 'next/link';
import { ArrowRight, Download, History } from 'lucide-react';

import {
  ACTIVITY_KIND_LABEL,
  ACTIVITY_KINDS,
  cursorParam,
  kolkataParts,
  type ActivityEntry,
  type ActivityFilter,
} from '@/modules/records/internal/activity-mapping';
import type { ActivityPage } from '@/modules/records/internal/activity';
import { formatDate } from '@/shared/tracker/format';
import { buttonVariants } from '@/shared/ui/button';
import { NativeSelect } from '@/shared/ui/native-select';
import { PageTabs } from '@/shared/ui/page-nav';
import { EmptyState, MissionNotice, MissionPanel } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

/**
 * The Team > Activity page body: filters (kind pills, member, dates) kept in
 * the URL, the changes grouped by Asia/Kolkata day, newest first, and keyset
 * paging ("Older"). Members see only their own activity and changes to their
 * records; the database decides that, this only renders it.
 */
export function ActivityLog({
  filter,
  page,
  paged,
  canChooseMember,
}: {
  filter: ActivityFilter;
  /** null when the read failed for a reason other than a missing migration. */
  page: ActivityPage | null;
  /** True after "Older", so "Newest" is offered. */
  paged: boolean;
  canChooseMember: boolean;
}) {
  const query = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const values = { from: filter.from, to: filter.to, kind: filter.kind, member: canChooseMember ? filter.member : null, ...changes };
    for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
    return `?${params}`;
  };
  const csv = `/api/records/activity${query({})}`;
  const people = page?.available ? page.people : [];

  if (page && !page.available) {
    return (
      <MissionNotice tone="info" icon={History}>
        The activity log is not available here yet: this database is waiting for an update (migration 54). Everything is
        still recorded, and it will appear once the update is applied.
      </MissionNotice>
    );
  }

  return (
    <div className="grid gap-4">
      <PageTabs
        label="Kinds of change"
        tabs={[null, ...ACTIVITY_KINDS].map((kind) => ({
          href: query({ kind }),
          label: kind ? ACTIVITY_KIND_LABEL[kind] : 'Everything',
          current: filter.kind === kind,
        }))}
      />

      <form method="get" className="grid gap-3 sm:flex sm:flex-wrap sm:items-end">
        {filter.kind ? <input type="hidden" name="kind" value={filter.kind} /> : null}
        {canChooseMember ? (
          <label className="grid gap-1 text-xs font-medium">
            Member
            <NativeSelect name="member" defaultValue={filter.member ?? ''} className="h-10 min-w-44 bg-white">
              <option value="">Everyone</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>{person.fullName}</option>
              ))}
            </NativeSelect>
          </label>
        ) : null}
        <label className="grid min-w-0 gap-1 text-xs font-medium">
          From
          <input type="date" name="from" defaultValue={filter.from} className="field h-10 w-full bg-white sm:w-auto" />
        </label>
        <label className="grid min-w-0 gap-1 text-xs font-medium">
          To
          <input type="date" name="to" defaultValue={filter.to} className="field h-10 w-full bg-white sm:w-auto" />
        </label>
        <button type="submit" className={cn(buttonVariants({ variant: 'outline' }), 'justify-self-start')}>Apply</button>
      </form>

      {!page ? (
        <MissionNotice tone="attention">The activity log could not be read just now. Try again shortly.</MissionNotice>
      ) : (
        <MissionPanel
          title="Changes"
          subtitle={`${filter.from} to ${filter.to} · newest first · times in Asia/Kolkata`}
          action={
            <a href={csv} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              <Download className="size-4" aria-hidden="true" />
              Download CSV
            </a>
          }
        >
          {page.entries.length === 0 ? (
            <EmptyState title="No changes in these dates">
              {paged ? 'There is nothing older in this range.' : 'Try a wider date range or another kind.'}
            </EmptyState>
          ) : (
            <ActivityTable entries={page.entries} />
          )}
          {page.next || paged ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {paged ? <Link href={query({})} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Newest</Link> : null}
              {page.next ? (
                <Link href={query({ before: cursorParam(page.next) })} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'ml-auto')}>
                  Older
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              ) : null}
            </div>
          ) : null}
        </MissionPanel>
      )}
    </div>
  );
}

function ActivityTable({ entries }: { entries: readonly ActivityEntry[] }) {
  return (
    <div className="border-border overflow-hidden rounded-xl border bg-white">
      <table className="w-full text-sm">
        <caption className="sr-only">Company changes, newest first</caption>
        <thead className="bg-muted/60 text-muted-foreground text-xs">
          <tr>
            <th scope="col" className="w-16 px-3 py-2 text-left font-semibold">Time</th>
            <th scope="col" className="hidden px-3 py-2 text-left font-semibold sm:table-cell">Who</th>
            <th scope="col" className="px-3 py-2 text-left font-semibold">What</th>
            <th scope="col" className="hidden px-3 py-2 text-left font-semibold md:table-cell">About</th>
            <th scope="col" className="hidden px-3 py-2 text-right font-semibold sm:table-cell"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        {groupByDay(entries).map(([day, rows]) => (
          <tbody key={day} className="border-border border-t">
            <tr>
              <th scope="colgroup" colSpan={5} className="text-foreground px-3 pt-3 pb-1 text-left text-xs font-semibold">
                {formatDate(day)}
              </th>
            </tr>
            {rows.map((entry) => (
              <tr key={entry.id} className="hover:bg-muted/40 align-top">
                <td className="text-muted-foreground tabular px-3 pt-2.5 pb-2 text-xs whitespace-nowrap">{kolkataParts(entry.at).time}</td>
                <td className="text-foreground hidden px-3 py-2 font-medium sm:table-cell">{entry.actor}</td>
                <td className="px-3 py-2">
                  <p className="text-foreground">{entry.summary}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    <span>{ACTIVITY_KIND_LABEL[entry.kind]}</span>
                    <span className="sm:hidden"> · {entry.actor}</span>
                    {entry.about ? <span className="md:hidden"> · about {entry.about}</span> : null}
                    {entry.reason ? <span> · “{entry.reason}”</span> : null}
                  </p>
                  {entry.href ? (
                    <Link href={entry.href} className="text-primary mt-1 inline-block text-xs font-semibold underline-offset-2 hover:underline sm:hidden">
                      {entry.linkLabel}
                    </Link>
                  ) : null}
                </td>
                <td className="text-muted-foreground hidden px-3 py-2 md:table-cell">{entry.about ?? '—'}</td>
                <td className="hidden px-3 py-2 text-right whitespace-nowrap sm:table-cell">
                  {entry.href ? (
                    <Link href={entry.href} className="text-primary text-xs font-semibold underline-offset-2 hover:underline">
                      {entry.linkLabel}
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function groupByDay(entries: readonly ActivityEntry[]): [string, ActivityEntry[]][] {
  const groups = new Map<string, ActivityEntry[]>();
  for (const entry of entries) {
    const day = kolkataParts(entry.at).date;
    const rows = groups.get(day);
    if (rows) rows.push(entry);
    else groups.set(day, [entry]);
  }
  return [...groups];
}
