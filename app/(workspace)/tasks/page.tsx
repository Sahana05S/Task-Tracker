import type { Metadata } from 'next';

import { TaskWorkspace } from '@/components/tasks/task-workspace';
import { requireProfile } from '@/lib/auth/profile';
import { getTaskEffortTotals } from '@/lib/logs/queries';
import { getTaskWorkspaceData } from '@/lib/tasks/queries';

export const metadata: Metadata = {
  title: 'Tasks · TaskPulse',
};

/**
 * Task tracker route.
 *
 * A Server Component: it authenticates, loads the tasks, the member directory
 * and the per-task hour totals, then hands them to the client shell. Filtering,
 * sorting and inline edits happen there; mutations go back through the Server
 * Actions in `app/tasks/actions.ts` and `app/logs/actions.ts`.
 */
export default async function TasksPage() {
  const profile = await requireProfile();

  const [{ tasks, members }, effortTotals] = await Promise.all([
    getTaskWorkspaceData(),
    getTaskEffortTotals(),
  ]);

  return (
    <TaskWorkspace
      tasks={tasks}
      members={members}
      // Maps are not serialisable across the server-to-client boundary, so the
      // aggregate crosses as entries and is rebuilt on the client.
      effortEntries={[...effortTotals]}
      currentUser={profile}
    />
  );
}
