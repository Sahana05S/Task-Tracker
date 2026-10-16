import { getNativeTemplates } from '@/lib/tasks/native-details';
import type { Metadata } from 'next';

import { NewTaskButton } from '@/components/tasks/new-task-button';
import { TaskWorkspace } from '@/components/tasks/task-workspace';
import { requireProfile } from '@/lib/auth/profile';
import { getTaskEffortTotals } from '@/lib/logs/queries';
import { getTaskWorkspaceData } from '@/lib/tasks/queries';
import { TASK_MANAGER_ROLES } from '@/lib/tracker/enums';
import type { UserRole } from '@/types/tracker';

export const metadata: Metadata = {
  title: 'Missions · TaskPulse',
};

/**
 * Missions list route (layout reference: Stitch missions_list_1).
 *
 * A Server Component: it authenticates, loads the tasks, the member directory and
 * the per-task hour totals, then hands them to the client shell. Filtering,
 * sorting and inline edits happen there; mutations go back through the Server
 * Actions in `app/tasks/actions.ts` and `app/logs/actions.ts`.
 */
export default async function TasksPage() {
  const profile = await requireProfile();

  const [{ tasks, members }, effortTotals, templates] = await Promise.all([
    getTaskWorkspaceData(),
    getTaskEffortTotals(),
    getNativeTemplates(),
  ]);

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
