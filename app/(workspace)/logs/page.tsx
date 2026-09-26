import type { Metadata } from 'next';

import { LogHistory } from '@/components/logs/log-history';
import { requireProfile } from '@/lib/auth/profile';
import { getMyLogHistory } from '@/lib/logs/queries';

export const metadata: Metadata = {
  title: 'Logs · TaskPulse',
};

/**
 * Personal daily effort history.
 *
 * Scoped to the signed-in user. The SELECT policy on `daily_task_logs` exposes
 * the whole team for transparency, so the narrowing to "mine" happens in the
 * query rather than being left to RLS.
 */
export default async function LogsPage() {
  const profile = await requireProfile();
  const { logs, tasks } = await getMyLogHistory(profile.id);

  return <LogHistory logs={logs} tasks={tasks} />;
}
