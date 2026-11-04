import { getNativeTemplates } from '@/modules/tasks';
import type { Metadata } from 'next';

import { NewTaskButton } from '@/modules/tasks/components/new-task-button';
import { MissionsPageMenu, MonthSetupBanner } from '@/modules/tasks/components/month-setup/month-setup-entry';
import { MissionsWorkspace } from '@/modules/workspace-views/components/missions-workspace';
import { requireProfile } from '@/shared/session/profile';
import { MissionNotice, MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';
import Link from 'next/link';
import { HashIcon } from 'lucide-react';
import { getLabelled } from '@/modules/labels';
import { LabelChip } from '@/modules/labels/components/label-chips';
import { getTaskEffortTotals } from '@/modules/time-tracking';
import { addMonths, countMissionsInMonth, defaultSetupMonth, getTaskWorkspaceData, monthOf, setupBannerMonth } from '@/modules/tasks';
import { kolkataDate } from '@/shared/time/kolkata';
import { getMissionWaypoints } from '@/modules/recognition';
import { TASK_MANAGER_ROLES } from '@/shared/tracker/enums';
import type { UserRole } from '@/types/tracker';

export const metadata: Metadata = {
  title: 'Missions',
};

/**
 * Missions list route (layout reference: Stitch missions_list_1).
 *
 * A Server Component: it authenticates, loads the tasks, the member directory and
 * the per-task hour totals, then hands them to the client shell. Filtering,
 * sorting, selection and inline edits happen there; mutations go back through
 * the Server Actions in `modules/tasks/actions.ts`, `modules/tasks/tool-actions.ts`
 * and `modules/time-tracking/actions.ts`. The team headline lives on Team >
 * Analytics (slice 3, 20 October 2026).
 */
export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireProfile();
  // ?label=<slug> (migration 112): only the missions carrying that label.
  const labelParam = (await searchParams).label;
  const labelSlug = typeof labelParam === 'string' && labelParam ? labelParam : null;
  const labelled = labelSlug ? await getLabelled(labelSlug) : null;
  const labelledIds = labelSlug ? new Set(labelled?.items.filter((item) => item.kind === 'task').map((item) => item.id) ?? []) : null;
  const canManage = (TASK_MANAGER_ROLES as readonly UserRole[]).includes(
    profile.role,
  );

  const workspace = getTaskWorkspaceData().then((data) => (labelledIds ? { ...data, tasks: data.tasks.filter((task) => labelledIds.has(task.id)) } : data));
  const [{ tasks, members }, effortTotals, templates, waypoints, setup] = await Promise.all([
    workspace,
    getTaskEffortTotals(),
    getNativeTemplates(),
    // Waypoints never hold the list back: a failed read leaves the tracks on current progress.
    workspace.then(({ tasks }) => getMissionWaypoints(tasks)).catch(() => null),
    // Neither does month setup: without the counts the menu offers next month and no banner shows.
    canManage ? monthSetupEntry().catch(() => null) : null,
  ]);

  const openCount = tasks.filter(
    (task) => !task.archivedEffectiveDate && task.status !== 'Done' && task.status !== 'Discarded',
  ).length;

  return (
    <MissionPage>
      <MissionPageHeader
        title="Missions"
        chip={`${openCount} active`}
        description={`${tasks.length} tracked · ${canManage ? 'select rows in the table view to act on several at once' : 'update status and progress on your own missions'}`}
        actions={canManage ? (
          <>
            <NewTaskButton />
            <MissionsPageMenu setupMonth={setup?.menuMonth ?? defaultSetupMonth(kolkataDate(), true)} />
          </>
        ) : null}
      />

      {setup?.bannerMonth ? <MonthSetupBanner month={setup.bannerMonth} /> : null}

      {labelSlug ? (
        <MissionNotice icon={HashIcon}>
          {labelled ? <>Showing missions labelled <LabelChip label={labelled.label} />.</> : <>No label called #{labelSlug}.</>}{' '}
          <Link href="/tasks" className="link font-semibold">Show all missions</Link>
        </MissionNotice>
      ) : null}

      <MissionsWorkspace
        tasks={tasks}
        templates={templates}
        members={members}
        // Maps are not serialisable across the server-to-client boundary, so the
        // aggregate crosses as entries and is rebuilt on the client.
        effortEntries={[...effortTotals]}
        currentUser={profile}
        waypoints={waypoints}
      />
    </MissionPage>
  );
}

/** The month the menu offers and, from the 25th while next month is empty, the banner's month. */
async function monthSetupEntry() {
  const today = kolkataDate();
  const current = monthOf(today);
  // Next month is counted only on the banner's days (an empty month there would show it).
  const bannerDays = setupBannerMonth(today, 0) !== null;
  const [currentCount, nextCount] = await Promise.all([
    countMissionsInMonth(current),
    bannerDays ? countMissionsInMonth(addMonths(current, 1)) : Promise.resolve(null),
  ]);
  return {
    menuMonth: defaultSetupMonth(today, currentCount > 0),
    bannerMonth: nextCount === null ? null : setupBannerMonth(today, nextCount),
  };
}
