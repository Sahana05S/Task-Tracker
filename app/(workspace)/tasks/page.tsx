import { getNativeTemplates } from '@/modules/tasks';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { MissionHeadlineStrip } from '@/modules/tasks/components/mission-headline';
import { NewTaskButton } from '@/modules/tasks/components/new-task-button';
import { TaskWorkspace } from '@/modules/tasks/components/task-workspace';
import { computeMissionHeadline } from '@/lib/analytics/headline';
import { requireProfile } from '@/shared/session/profile';
import { getMilestonesPageData } from '@/modules/milestones';
import { viewContext } from '@/lib/presentation/context';
import { getLivePresentation } from '@/lib/presentation/queries';
import { getTaskEffortTotals } from '@/lib/logs/queries';
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
 * Actions in `modules/tasks/actions.ts` and `app/logs/actions.ts`.
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
    <div className="mx-auto w-full max-w-[1200px] px-4 pt-6 pb-10 lg:px-6">
      <header className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-foreground text-[1.625rem] leading-tight font-bold tracking-tight lg:text-[2rem]">
              Missions
            </h1>
            <span className="bg-primary-subtle text-primary-subtle-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold">
              <span aria-hidden="true" className="bg-primary size-1.5 rounded-full" />
              {openCount} active
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            {tasks.length} tracked ·{' '}
            {canManage
              ? 'you can create and edit missions'
              : 'update status and progress on your own missions'}
          </p>
        </div>
        {/* New mission belongs in the header rather than inside the list: it is
            a page action, and putting it here keeps it beside the title. */}
        {canManage ? <div className="ml-auto"><NewTaskButton /></div> : null}
      </header>

      {/* The headline needs the live month presentation, which is slow; it
          streams in so the mission list is never held up by it. */}
      <Suspense fallback={<HeadlineSkeleton />}>
        <TeamHeadline tasks={tasks} hoursByTask={hoursByTask} />
      </Suspense>

      <TaskWorkspace
        tasks={tasks}
        templates={templates}
        members={members}
        // Maps are not serialisable across the server-to-client boundary, so the
        // aggregate crosses as entries and is rebuilt on the client.
        effortEntries={[...effortTotals]}
        currentUser={profile}
      />
    </div>
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
    <section aria-label="Team headline loading" aria-busy="true" className="mb-5 grid gap-3">
      <p className="text-muted-foreground text-sm">Loading team headline…</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="soft-inset h-20 animate-pulse rounded-2xl" />)}
      </div>
    </section>
  );
}
