import { getNativeTemplates } from '@/lib/tasks/native-details';
import type { Metadata } from 'next';

import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { NewTaskButton } from '@/components/tasks/new-task-button';
import { TaskWorkspace } from '@/components/tasks/task-workspace';
import { requireProfile } from '@/lib/auth/profile';
import { getTaskEffortTotals } from '@/lib/logs/queries';
import { getTaskWorkspaceData } from '@/lib/tasks/queries';
import { TASK_MANAGER_ROLES } from '@/lib/tracker/enums';
import type { UserRole } from '@/types/tracker';

export const metadata: Metadata = {
  title: 'Tasks · TaskPulse',
};

/**
 * Task tracker route.
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
    <>
      <WorkspaceHeader
        title="Task tracker"
        description={`${tasks.length} tracked · ${openCount} open · ${
          canManage
            ? 'full edit rights'
            : 'status and progress on your own assignments'
        }`}
        // Add Task belongs in the header rather than inside the grid: it is a page
        // action, and putting it here keeps it beside the other controls.
        actions={canManage ? <NewTaskButton /> : null}
      />

      <div className="px-4 py-4 lg:px-6">
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
    </>
  );
}
