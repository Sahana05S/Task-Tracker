import Link from 'next/link';
import type { Metadata } from 'next';
import { HistoryIcon, ListTodoIcon, TableIcon, UsersIcon } from 'lucide-react';

import { buildRecentOperations, canManageTasks, getNativeTemplates, getTaskWorkspaceData, getToolLineage } from '@/modules/tasks';
import { NativeTemplateManager } from '@/modules/tasks/components/native-template-manager';
import { RecentOperations } from '@/modules/tasks/components/tools/recent-operations';
import { buttonVariants } from '@/shared/ui/button';
import { MissionPage, MissionPageHeader, MissionPanel } from '@/shared/ui/mission-ui';
import { requireProfile } from '@/shared/session/profile';

export const metadata: Metadata = {
  title: 'Task Tools · TaskPulse',
};

/**
 * Task Tools as history (DECISIONS "Bulk actions on the Missions table",
 * 21 October 2026). The operations run from the Missions table and row menus;
 * this page keeps what they left behind, participant reconciliation and, for
 * managers, native template versions (until Settings exists).
 */
export default async function TaskToolsPage() {
  const profile = await requireProfile();
  const canManage = canManageTasks(profile.role);
  const [{ tasks, members }, lineage, templates] = await Promise.all([
    getTaskWorkspaceData(),
    // A failed read shows a message in the panel, not an empty history.
    getToolLineage().catch(() => null),
    canManage ? getNativeTemplates() : Promise.resolve([]),
  ]);
  const operations = lineage ? buildRecentOperations(lineage, tasks, members) : null;

  return (
    <MissionPage>
      <MissionPageHeader
        eyebrow="Missions"
        title="Task Tools"
        description="Copies, splits, carryovers and archives made from the Missions page."
        actions={
          <Link href="/tasks?view=table" className={buttonVariants({ variant: 'outline' })}>
            <TableIcon aria-hidden="true" />
            Run an operation
          </Link>
        }
      />

      <MissionPanel icon={HistoryIcon} title="Recent operations">
        <p className="text-muted-foreground -mt-1 mb-4 text-sm">
          Newest first.
        </p>
        <RecentOperations operations={operations} />
      </MissionPanel>

      {canManage ? (
        <>
          <MissionPanel icon={UsersIcon} title="Participant reconciliation">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted-foreground max-w-prose text-sm">
                Compare current shares on older shared missions with an equal split before converting them.
              </p>
              <Link href="/task-tools/participants" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Review reconciliation
              </Link>
            </div>
          </MissionPanel>

          <MissionPanel icon={ListTodoIcon} title="Mission templates">
            <NativeTemplateManager templates={templates} />
          </MissionPanel>
        </>
      ) : null}
    </MissionPage>
  );
}
