import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarCheckIcon } from 'lucide-react';

import { formatINR, getPayrollSetup, monthLabel } from '@/modules/payroll';
import { PayrollNav } from '@/modules/payroll/components/payroll-nav';
import { requireRole } from '@/shared/session/profile';
import { EmptyState, MissionNotice, MissionPage, MissionPageHeader, MissionPanel } from '@/shared/ui/mission-ui';

export const metadata: Metadata = { title: 'Salary records · Payroll' };

export default async function PayrollHistoryPage() {
  await requireRole(['managing_director']);
  const result = await getPayrollSetup();
  return (
    <MissionPage wide>
      <MissionPageHeader
        eyebrow="Payroll · managing director only"
        title="Salary records"
        description="Every finalised month. Each person's own records are on their pay file."
        tabs={<PayrollNav active="/payroll/history" />}
      />
      {!result.ok ? (
        <MissionNotice tone="danger">{result.error}</MissionNotice>
      ) : (
        <MissionPanel icon={CalendarCheckIcon} title="Finalised months">
          {result.data.months.length === 0 ? (
            <EmptyState>No month has been finalised yet. Finalise one from Salary calculation.</EmptyState>
          ) : (
            <ul className="divide-border divide-y">
              {result.data.months.map((m) => (
                <li key={m.period} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <Link href={`/payroll?month=${m.period.slice(0, 7)}`} className="text-foreground hover:text-primary min-w-40 flex-1 font-semibold hover:underline">
                    {monthLabel(m.period)}
                  </Link>
                  <span className="text-muted-foreground text-xs">
                    {m.state === 'finalized' ? `Finalised${m.revision > 1 ? ` (revision ${m.revision})` : ''}` : 'Reopened, being recalculated'} · {m.employees} employees
                  </span>
                  <span className="tabular font-semibold">{formatINR(m.totalInHand)}</span>
                </li>
              ))}
            </ul>
          )}
        </MissionPanel>
      )}
    </MissionPage>
  );
}
