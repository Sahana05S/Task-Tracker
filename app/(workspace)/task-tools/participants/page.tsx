import { requireRole } from '@/lib/auth/profile';
import { createClient } from '@/lib/supabase/server';
import { getTaskWorkspaceData } from '@/lib/tasks/queries';
import { equalParticipantShares } from '@/lib/tasks/shares';
import type { Json } from '@/types/database';
import { MissionNotice, MissionPage, MissionPageHeader } from '@/components/missions/mission-ui';

function object(value: Json): { [key: string]: Json | undefined } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid reconciliation response.');
  return value;
}
export default async function ParticipantReconciliationPage() {
  await requireRole(['managing_director','project_engineer']);
  const supabase = await createClient();
  const [{data,error},workspace] = await Promise.all([
    supabase.rpc('participant_reconciliation'), getTaskWorkspaceData(),
  ]);
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) throw new Error('Missing participant reconciliation.');
  const names = new Map(workspace.members.map((user) => [user.id,user.fullName]));
  return <MissionPage>
    <MissionPageHeader eyebrow="Task Tools" title="Participant reconciliation" description="Review current allocations and proposed equal shares before converting legacy tasks." />
      <MissionNotice>This preview changes no records. Conversion applies prospectively and preserves earlier credit. Review every participant and the primary owner before confirming in the task editor. Historical logs with unknown applied progress still require reconciliation.</MissionNotice>
      {data.map((value) => {
        const row=object(value);
        if (typeof row.task_id!=='string' || typeof row.task_tag!=='string' || typeof row.legacy_primary!=='string' || !Array.isArray(row.participants)) throw new Error('Invalid reconciliation task.');
        const participants=row.participants.map(object);
        const ids=[...new Set([row.legacy_primary,...participants.map((participant) => {
          if (typeof participant.user_id!=='string') throw new Error('Invalid participant identity.');
          return participant.user_id;
        })])];
        const proposed=equalParticipantShares(ids);
        return <section key={row.task_id} className="soft-card p-5 sm:p-6">
          <h2 className="text-foreground text-base font-bold tracking-tight"><span className="task-tag bg-primary-subtle text-primary-subtle-foreground rounded-md px-2 py-0.5">{row.task_tag}</span> ({String(row.mode)})</h2>
          <p className="text-muted-foreground mt-1 text-sm">Primary: {names.get(row.legacy_primary) ?? row.legacy_primary}; version {String(row.version)}</p>
          <div className="border-border mt-4 overflow-x-auto rounded-xl border"><table className="sheet-grid w-full"><thead><tr><th>Participant</th><th>Current share</th><th>Proposed equal share</th></tr></thead><tbody>
            {ids.map((id) => <tr key={id}><td>{names.get(id) ?? id}</td><td>{typeof participants.find((p) => p.user_id===id)?.share_units==='number' ? `${Number(participants.find((p) => p.user_id===id)?.share_units)/10000}%` : 'Legacy / unresolved'}</td><td>{proposed[id]/10000}%</td></tr>)}
          </tbody></table></div>
        </section>;
      })}
  </MissionPage>;
}
