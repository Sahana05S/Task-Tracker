import type { Metadata } from 'next';

import { MissionPage, MissionPageHeader } from '@/components/missions/mission-ui';
import { LogHistory } from '@/components/logs/log-history';
import { requireProfile } from '@/lib/auth/profile';
import { getMyLogHistory } from '@/lib/logs/queries';
import { sumHours } from '@/lib/logs/metrics';
import { formatHours } from '@/lib/tracker/format';

export const metadata: Metadata = {
  title: 'Logs · TaskPulse',
};

/**
 * Personal daily effort history.
 *
 * Scoped to the signed-in user. The SELECT policy on `daily_task_logs` exposes the
 * whole team for transparency, so the narrowing to "mine" happens in the query
 * rather than being left to RLS.
 */
export default async function LogsPage() {
  const profile = await requireProfile();
  const { logs, tasks } = await getMyLogHistory(profile.id);

  const totalHours = sumHours(logs);

  return (
    <MissionPage className="max-w-[880px]">
      <MissionPageHeader
        eyebrow="My time"
        title="My effort log"
        chip={`${formatHours(totalHours)} h logged`}
        description={
          logs.length === 0
            ? 'No entries recorded yet'
            : `${logs.length} ${logs.length === 1 ? 'entry' : 'entries'} · ${formatHours(totalHours)} hours logged`
        }
      />

      <LogHistory logs={logs} tasks={tasks} />
    </MissionPage>
  );
}
