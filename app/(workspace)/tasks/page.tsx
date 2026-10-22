import { getNativeTemplates } from '@/modules/tasks';
import type { Metadata } from 'next';

import { NewTaskButton } from '@/modules/tasks/components/new-task-button';
import { MissionsWorkspace } from '@/modules/workspace-views/components/missions-workspace';
import { requireProfile } from '@/shared/session/profile';
import { MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';
import { getTaskEffortTotals } from '@/modules/time-tracking';
import { getTaskWorkspaceData } from '@/modules/tasks';
import { getMissionWaypoints } from '@/modules/recognition';
import { TASK_MANAGER_ROLES } from '@/shared/tracker/enums';
import type { UserRole } from '@/types/tracker';

export const metadata: Metadata = {
  title: 'Missions · TaskPulse',
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
export default async function TasksPage() {
  const profile = await requireProfile();

  const workspace = getTaskWorkspaceData();
  const [{ tasks, members }, effortTotals, templates, waypoints] = await Promise.all([
    workspace,
    getTaskEffortTotals(),
    getNativeTemplates(),
    // Waypoints never hold the list back: a failed read leaves the tracks on current progress.
    workspace.then(({ tasks }) => getMissionWaypoints(tasks)).catch(() => null),
  ]);

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
        description={`${tasks.length} tracked · ${canManage ? 'select rows in the table view to act on several at once' : 'update status and progress on your own missions'}`}
        actions={canManage ? <NewTaskButton /> : null}
      />

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
