import { requireRole } from '@/shared/session/profile';
import { equalParticipantShares, getParticipantReconciliation, getTaskWorkspaceData } from '@/modules/tasks';
import { MissionNotice, MissionPage, MissionPageHeader } from '@/components/missions/mission-ui';

export default async function ParticipantReconciliationPage() {
  await requireRole(['managing_director','project_engineer']);
  const [rows, workspace] = await Promise.all([getParticipantReconciliation(), getTaskWorkspaceData()]);
  const names = new Map(workspace.members.map((user) => [user.id,user.fullName]));
  return <MissionPage>
    <MissionPageHeader eyebrow="Task Tools" title="Participant reconciliation" description="Review current allocations and proposed equal shares before converting legacy tasks." />
      <MissionNotice>This preview changes no records. Conversion applies prospectively and preserves earlier credit. Review every participant and the primary owner before confirming in the task editor. Historical logs with unknown applied progress still require reconciliation.</MissionNotice>
      {rows.map((row) => {
        const ids=[...new Set([row.legacyPrimary,...row.participants.map((participant) => participant.userId)])];
        const proposed=equalParticipantShares(ids);
        const currentShare=(id:string) => {
          const units=row.participants.find((p) => p.userId===id)?.shareUnits;
          return typeof units==='number' ? `${units/10000}%` : 'Legacy / unresolved';
        };
        return <section key={row.taskId} className="soft-card p-5 sm:p-6">
          <h2 className="text-foreground text-base font-bold tracking-tight"><span className="task-tag bg-primary-subtle text-primary-subtle-foreground rounded-md px-2 py-0.5">{row.taskTag}</span> ({row.mode})</h2>
          <p className="text-muted-foreground mt-1 text-sm">Primary: {names.get(row.legacyPrimary) ?? row.legacyPrimary}; version {row.version}</p>
          <div className="border-border mt-4 overflow-x-auto rounded-xl border"><table className="sheet-grid w-full"><thead><tr><th>Participant</th><th>Current share</th><th>Proposed equal share</th></tr></thead><tbody>
            {ids.map((id) => <tr key={id}><td>{names.get(id) ?? id}</td><td>{currentShare(id)}</td><td>{proposed[id]/10000}%</td></tr>)}
          </tbody></table></div>
        </section>;
      })}
  </MissionPage>;
}
