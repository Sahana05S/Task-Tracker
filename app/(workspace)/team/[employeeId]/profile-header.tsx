import Link from 'next/link';
import { Building2Icon } from 'lucide-react';

import { getOrgChart } from '@/modules/team';

import { MissionPageHeader } from '@/shared/ui/mission-ui';
import { Breadcrumb, PageTabs } from '@/shared/ui/page-nav';
import { RoleBadge } from '@/shared/ui/tracker-badges';
import { buttonVariants } from '@/shared/ui/button';
import type { User } from '@/types/tracker';

export type ProfileTab = 'overview' | 'charts' | 'missions' | 'reports';

/** The `period` and `asOf` given in the URL, kept when switching tabs. */
export function carriedQuery(query: { period?: string; asOf?: string }): string {
  const params = new URLSearchParams();
  if (query.period) params.set('period', query.period);
  if (query.asOf) params.set('asOf', query.asOf);
  return params.toString();
}

/**
 * Title, breadcrumb and tabs shared by the profile page and its Reports
 * sub-route. Overview, Charts and Missions are `?tab=` views of the profile;
 * Reports is the `/reports` route. The period query is carried across.
 * The meta row adds the person's org chart placement (job title, department,
 * manager) where the database has it.
 */
export async function ProfileHeader({
  employee,
  current,
  description,
  query,
  missionCount,
}: {
  employee: User;
  current: ProfileTab;
  description: string;
  /** `period` (and `asOf`) to keep when switching tabs. */
  query: string;
  missionCount?: number;
}) {
  const chart = await getOrgChart().catch(() => null);
  const person = chart?.people.find(entry => entry.id === employee.id);
  const manager = person?.reportsTo ? chart?.people.find(entry => entry.id === person.reportsTo) : undefined;
  const base = `/team/${encodeURIComponent(employee.employeeId)}`;
  const withQuery = (path: string, tab?: string) => {
    const params = new URLSearchParams(query);
    if (tab) params.set('tab', tab);
    const search = params.toString();
    return search ? `${path}?${search}` : path;
  };
  return (
    <MissionPageHeader
      breadcrumb={
        <Breadcrumb
          back={{ href: '/team', label: 'Back to team' }}
          items={[{ label: 'Team', href: '/team' }, { label: employee.employeeId, tag: true }]}
        />
      }
      title={employee.fullName}
      meta={
        <>
          <RoleBadge role={employee.role} />
          {person?.department ? (
            <span className="badge-soft badge-neutral inline-flex items-center gap-1">
              <Building2Icon aria-hidden="true" className="size-3" />
              {person.department}
            </span>
          ) : null}
          {person?.jobTitle ? <span className="text-muted-foreground text-xs">{person.jobTitle}</span> : null}
          {manager ? <span className="text-muted-foreground text-xs">Reports to {manager.fullName}</span> : null}
        </>
      }
      description={description}
      actions={
        <Link href={`/reports?member=${encodeURIComponent(employee.employeeId)}`} className={buttonVariants({ variant: 'outline' })}>
          Daily report
        </Link>
      }
      tabs={
        <PageTabs
          label="Profile sections"
          tabs={[
            { href: withQuery(base), label: 'Overview', current: current === 'overview' },
            { href: withQuery(base, 'charts'), label: 'Charts', current: current === 'charts' },
            { href: withQuery(base, 'missions'), label: 'Missions', current: current === 'missions', count: missionCount },
            { href: withQuery(`${base}/reports`), label: 'Reports', current: current === 'reports' },
          ]}
        />
      }
    />
  );
}
