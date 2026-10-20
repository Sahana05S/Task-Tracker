import { getNativeTemplates } from '@/modules/tasks';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { MissionHeadlineStrip } from '@/modules/scoring/components/mission-headline';
import { NewTaskButton } from '@/modules/tasks/components/new-task-button';
import { MissionsWorkspace } from '@/modules/workspace-views/components/missions-workspace';
import { computeMissionHeadline } from '@/modules/scoring/client';
import { requireProfile } from '@/shared/session/profile';
import { MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';
import { getMilestonesPageData } from '@/modules/milestones';
import { viewContext } from '@/modules/reports/client';
import { getLivePresentation } from '@/modules/reports';
import { getTaskEffortTotals } from '@/modules/time-tracking';
import { getTaskWorkspaceData } from '@/modules/tasks';
import { TASK_MANAGER_ROLES } from '@/shared/tracker/enums';
import type { Task, UserRole } from '@/types/tracker';

export const metadata: Metadata = {
  title: 'Missions · TaskPulse',
};

/**
 * Missions list route (layout reference: Stitch missions_list_1).
 *
 * A Server Component: it authenticates, loads the tasks, the member directory and
 * the per-task hour totals, then hands them to the client shell. Filtering,
 * sorting and inline edits happen there; mutations go back through the Server
 * Actions in `modules/tasks/actions.ts` and `modules/time-tracking/actions.ts`.
 */
export default async function TasksPage() {
  const profile = await requireProfile();

  const [{ tasks, members }, effortTotals, templates] = await Promise.all([
    getTaskWorkspaceData(),
    getTaskEffortTotals(),
    getNativeTemplates(),
  ]);
  const hoursByTask = new Map([...effortTotals].map(([id, effort]) => [id, effort.hoursLogged]));

  const canManage = (TASK_MANAGER_ROLES as readonly UserRole[]).includes(
    profile.role,
  );

  const openCount = tasks.filter(
    (task) => !task.archivedEffectiveDate && task.status !== 'Done' && task.status !== 'Discarded',
  ).length;

  return (
    <MissionPage>
      <MissionPageHeader
        title="Missions"
        chip={`${openCount} active`}
        description={`${tasks.length} tracked · ${canManage ? 'you can create and edit missions' : 'update status and progress on your own missions'}`}
        actions={canManage ? <NewTaskButton /> : null}
      />

      {/* The headline needs the live month presentation, which is slow; it
          streams in so the mission list is never held up by it. */}
      <Suspense fallback={<HeadlineSkeleton />}>
        <TeamHeadline tasks={tasks} hoursByTask={hoursByTask} />
      </Suspense>

      <MissionsWorkspace
        tasks={tasks}
        templates={templates}
        members={members}
        // Maps are not serialisable across the server-to-client boundary, so the
        // aggregate crosses as entries and is rebuilt on the client.
        effortEntries={[...effortTotals]}
        currentUser={profile}
      />
    </MissionPage>
  );
}

/** Team headline strip (sheet Tasks header), loaded after the list is ready. */
async function TeamHeadline({ tasks, hoursByTask }: { tasks: Task[]; hoursByTask: ReadonlyMap<string, number> }) {
  const view = viewContext();
  const [presentation, milestones] = await Promise.all([
    // Supplementary: if either source fails, the strip says "Unavailable".
    getLivePresentation(view).catch(() => null),
    getMilestonesPageData().catch(() => null),
  ]);
  const headline = computeMissionHeadline({ analytics: presentation?.analytics ?? null, tasks, period: view.period, hoursByTask });
  const goals = milestones?.status === 'ready' ? milestones.milestones.filter(m => m.status !== 'Achieved') : null;
  return (
    <MissionHeadlineStrip
      headline={headline}
      monthLabel={view.period.label}
      showLeaders={presentation?.scope === 'manager_team_detail'}
      goals={goals}
    />
  );
}

function HeadlineSkeleton() {
  return (
    <section aria-label="Team headline loading" aria-busy="true" className="grid gap-3">
      <p className="text-muted-foreground text-sm">Loading team headline…</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="soft-inset h-20 animate-pulse rounded-2xl" />)}
      </div>
    </section>
  );
}
