import Link from 'next/link';
import { Building2Icon, ChevronRightIcon, CornerLeftUpIcon, NetworkIcon } from 'lucide-react';

import { buildOrgTree, canViewEmployeeProfile, employeeHref, orgTiers, teamSize, type OrgNode, type OrgPerson, type TodayStatus } from '@/modules/team/client';
import { ROLE_LABELS } from '@/shared/tracker/enums';
import { EmptyState, InitialsAvatar } from '@/shared/ui/mission-ui';
import { RoleBadge } from '@/shared/ui/tracker-badges';
import { cn } from '@/shared/utils';
import type { User } from '@/types/tracker';

import styles from './org-chart.module.css';

const STATUS: Record<TodayStatus, { label: string; dot: string }> = {
  in: { label: 'In today', dot: 'bg-success' },
  half_day: { label: 'Half day', dot: 'bg-attention-strong' },
  away: { label: 'Away today', dot: 'bg-muted-foreground/50' },
  not_recorded: { label: 'Not recorded', dot: 'border-muted-foreground/60 border bg-transparent' },
};

type Viewer = Pick<User, 'id' | 'role' | 'isActive'>;

function Status({ today }: { today: TodayStatus | null }) {
  if (!today) return null;
  const status = STATUS[today];
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
      <span aria-hidden="true" className={cn('inline-block size-2 shrink-0 rounded-full', status.dot)} />
      {status.label}
    </span>
  );
}

/**
 * One person: avatar, name, title, role, department and today's status; a link where the viewer may open the profile.
 * `manager` names who they report to when that is not visible from the lines (under a shared leadership row).
 */
function PersonCard({ person, viewer, reports, manager }: { person: OrgPerson; viewer: Viewer; reports: number; manager?: string }) {
  // The role already reads as the title line when there is no job title, so its chip would only repeat it.
  const showRole = person.jobTitle !== null;
  const chips = showRole || person.department || manager;
  const canOpen = canViewEmployeeProfile(viewer, { id: person.id }) && Boolean(person.employeeId);
  const body = (
    <>
      <span className="flex items-center gap-2.5">
        <InitialsAvatar name={person.fullName} className="size-9 shrink-0" />
        <span className="grid min-w-0 flex-1 text-left">
          <span className="text-foreground line-clamp-2 text-sm font-semibold">
            {person.fullName}
            {person.id === viewer.id ? <span className="text-muted-foreground font-normal"> (you)</span> : null}
          </span>
          <span className="text-muted-foreground truncate text-xs">{person.jobTitle ?? ROLE_LABELS[person.role]}</span>
        </span>
        {canOpen ? (
          <ChevronRightIcon aria-hidden="true" className="text-muted-foreground group-hover:text-primary size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        ) : null}
      </span>
      {chips ? (
        <span className="flex flex-wrap items-center gap-1.5">
          {showRole ? <RoleBadge role={person.role} /> : null}
          {person.department ? (
            <span className="badge-soft badge-neutral inline-flex items-center gap-1">
              <Building2Icon aria-hidden="true" className="size-3" />
              {person.department}
            </span>
          ) : null}
          {manager ? (
            <span className="text-muted-foreground inline-flex min-w-0 items-center gap-1 text-xs">
              <CornerLeftUpIcon aria-hidden="true" className="size-3 shrink-0" />
              <span className="truncate">Reports to {manager.split(' ')[0]}</span>
            </span>
          ) : null}
        </span>
      ) : null}
      <span className="flex items-center justify-between gap-2">
        <Status today={person.today} />
        {reports > 0 ? <span className="text-muted-foreground text-xs">{reports} {reports === 1 ? 'report' : 'reports'}</span> : null}
      </span>
    </>
  );
  const className = 'bg-card border-border grid w-full max-w-xs gap-2 rounded-xl border p-3 text-left md:w-52';
  // Every card the viewer may open is a link to that profile (user request, 28 Oct 2026); members
  // open only their own, so the others say why rather than looking broken.
  return canOpen ? (
    <Link
      href={employeeHref(person)}
      className={cn(className, 'group hover:border-primary/50 focus-visible:ring-ring cursor-pointer outline-none transition-[border-color,box-shadow,translate] hover:-translate-y-0.5 hover:shadow-(--shadow-card) focus-visible:ring-2')}
    >
      {body}
    </Link>
  ) : (
    <div className={className} title="Only managers open other members' profiles">{body}</div>
  );
}

function TreeBranch({ node, viewer, manager }: { node: OrgNode; viewer: Viewer; manager?: string }) {
  return (
    <li>
      <PersonCard person={node.person} viewer={viewer} reports={teamSize(node) - 1} manager={manager} />
      {node.reports.length ? (
        <ul>
          {node.reports.map(child => <TreeBranch key={child.person.id} node={child} viewer={viewer} />)}
        </ul>
      ) : null}
    </li>
  );
}

function ListBranch({ node, viewer, manager }: { node: OrgNode; viewer: Viewer; manager?: string }) {
  return (
    <li className="grid gap-2">
      <PersonCard person={node.person} viewer={viewer} reports={teamSize(node) - 1} manager={manager} />
      {node.reports.length ? (
        <ul className="border-border ml-4 grid gap-2 border-l pl-4">
          {node.reports.map(child => <ListBranch key={child.person.id} node={child} viewer={viewer} />)}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * The company org chart: who reports to whom, from the reporting lines the
 * managing director sets in Manage people. A top-down tree from `md` (it
 * scrolls sideways inside its own box when the company is wide), an indented
 * list on phones. Both are nested lists of the real names. Two or more
 * managing directors at the top share one leadership row, with everyone under
 * them as one level that names each person's manager (`orgTiers`), instead of
 * separate, unconnected trees.
 */
export function OrgChart({ people, viewer, available, canManage }: {
  people: readonly OrgPerson[];
  viewer: Viewer;
  /** False on a database without the org chart yet. */
  available: boolean;
  canManage: boolean;
}) {
  if (!available) {
    return (
      <EmptyState icon={NetworkIcon} title="The org chart isn’t set up yet">
        This workspace’s database doesn’t have reporting lines yet. Once it does, the chart appears here.
      </EmptyState>
    );
  }
  const roots = buildOrgTree(people);
  const { leaders, below, managerOf } = orgTiers(roots);
  const active = people.filter(person => person.active);
  const departments = new Set(active.map(person => person.department).filter(Boolean));
  if (roots.length === 0) {
    return <EmptyState icon={NetworkIcon} title="No active members">Invite people in Manage people to see them here.</EmptyState>;
  }

  return (
    <section aria-labelledby="org-chart-title" className="soft-card grid gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 id="org-chart-title" className="text-foreground text-base font-bold tracking-tight">Org chart</h2>
          <p className="text-muted-foreground text-xs">
            {active.length} {active.length === 1 ? 'person' : 'people'}
            {departments.size ? ` · ${departments.size} ${departments.size === 1 ? 'department' : 'departments'}` : ''}
            {canManage ? ' · Set who reports to whom in Manage people.' : ''}
          </p>
        </div>
        <ul aria-label="Today's status" className="flex flex-wrap gap-x-3 gap-y-1">
          {(Object.keys(STATUS) as TodayStatus[]).map(key => (
            <li key={key}><Status today={key} /></li>
          ))}
        </ul>
      </div>

      <div className="hidden overflow-x-auto pb-2 md:block">
        <div className={styles.tree}>
          {leaders.length ? (
            <ul aria-label="Org chart">
              <li>
                <ul aria-label="Leadership" className={cn(styles.leaders, below.length && styles.leadersWithTeam)}>
                  {leaders.map(leader => (
                    <li key={leader.person.id} className={styles.leader}>
                      <PersonCard person={leader.person} viewer={viewer} reports={teamSize(leader) - 1} />
                    </li>
                  ))}
                </ul>
                {below.length ? (
                  <ul aria-label="Team">
                    {below.map(node => <TreeBranch key={node.person.id} node={node} viewer={viewer} manager={managerOf.get(node.person.id)} />)}
                  </ul>
                ) : null}
              </li>
            </ul>
          ) : (
            <ul aria-label="Org chart">
              {below.map(root => <TreeBranch key={root.person.id} node={root} viewer={viewer} />)}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:hidden">
        {leaders.length ? (
          <ul aria-label="Leadership" className="grid gap-2 sm:grid-cols-2">
            {leaders.map(leader => (
              <li key={leader.person.id}><PersonCard person={leader.person} viewer={viewer} reports={teamSize(leader) - 1} /></li>
            ))}
          </ul>
        ) : null}
        <ul aria-label={leaders.length ? 'Team' : 'Org chart'} className={cn('grid gap-3', leaders.length && 'border-border ml-4 border-l pl-4')}>
          {below.map(node => <ListBranch key={node.person.id} node={node} viewer={viewer} manager={managerOf.get(node.person.id)} />)}
        </ul>
      </div>
    </section>
  );
}
