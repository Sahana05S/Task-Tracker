import Link from 'next/link';
import { UsersIcon } from 'lucide-react';
import { requireRole } from '@/shared/session/profile';
import { equalParticipantShares, getParticipantReconciliation, getTaskWorkspaceData } from '@/modules/tasks';
import { EmptyState, MissionNotice, MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';
import { codeLabel } from '@/shared/tracker/labels';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Participant reconciliation · TaskPulse' };


export default async function ParticipantReconciliationPage() {
  await requireRole(['managing_director','project_engineer']);
  const [rows, workspace] = await Promise.all([getParticipantReconciliation(), getTaskWorkspaceData()]);
  const names = new Map(workspace.members.map((user) => [user.id,user.fullName]));
  const name = (id: string) => names.get(id) ?? 'Unknown member';
  return <MissionPage>
    <MissionPageHeader
      breadcrumb={<Link href="/task-tools" className="link text-sm">Task Tools</Link>}
      title="Participant reconciliation"
      description="Review current allocations and proposed equal shares before converting legacy tasks."
    />
      <MissionNotice>This preview changes no records. Conversion applies prospectively and preserves earlier credit. Review every participant and the primary owner before confirming in the mission&apos;s editor. Historical logs with unknown applied progress still require reconciliation.</MissionNotice>
      {rows.length === 0 ? (
        <EmptyState icon={UsersIcon} className="soft-card bg-card py-14" title="Nothing to reconcile">
          Every shared mission already has configured shares.
        </EmptyState>
      ) : null}
      {rows.map((row) => {
        const ids=[...new Set([row.legacyPrimary,...row.participants.map((participant) => participant.userId)])];
        const proposed=equalParticipantShares(ids);
        const currentShare=(id:string) => {
          const units=row.participants.find((p) => p.userId===id)?.shareUnits;
          return typeof units==='number' ? `${units/10000}%` : 'Legacy / unresolved';
        };
        return <section key={row.taskId} className="soft-card p-5 sm:p-6">
          <h2 className="text-foreground flex flex-wrap items-center gap-2 text-base font-bold tracking-tight">
            <Link href={`/tasks/${encodeURIComponent(row.taskTag)}`} className="task-tag bg-primary-subtle text-primary-subtle-foreground rounded-md px-2 py-0.5 hover:underline">{row.taskTag}</Link>
            <span className="badge-soft badge-neutral">{codeLabel(row.mode)}</span>
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">Primary: {name(row.legacyPrimary)}; version {row.version}</p>
          <div className="border-border mt-4 overflow-x-auto rounded-xl border"><table className="sheet-grid w-full"><thead><tr><th scope="col">Participant</th><th scope="col">Current share</th><th scope="col">Proposed equal share</th></tr></thead><tbody>
            {ids.map((id) => <tr key={id}><td>{name(id)}</td><td>{currentShare(id)}</td><td>{proposed[id]/10000}%</td></tr>)}
          </tbody></table></div>
        </section>;
      })}
  </MissionPage>;
}
