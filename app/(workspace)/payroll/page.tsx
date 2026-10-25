import type { Metadata } from 'next';
import { CalendarDaysIcon, InfoIcon } from 'lucide-react';

import { getPayrollMonth, monthLabel, monthPeriod } from '@/modules/payroll';
import { MonthActions } from '@/modules/payroll/components/month-actions';
import { MonthPicker, PayrollNav } from '@/modules/payroll/components/payroll-nav';
import { SalaryTable } from '@/modules/payroll/components/salary-table';
import { requireRole } from '@/shared/session/profile';
import { kolkataDate } from '@/shared/time/kolkata';
import { MissionNotice, MissionPage, MissionPageHeader, StatTile } from '@/shared/ui/mission-ui';

export const metadata: Metadata = { title: 'Payroll' };

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireRole(['managing_director']);
  const current = monthPeriod(kolkataDate())!;
  const period = monthPeriod((await searchParams).month) ?? current;
  const result = await getPayrollMonth(period);
  const label = monthLabel(period);

  return (
    <MissionPage wide>
      <MissionPageHeader
        eyebrow="Payroll · managing director only"
        title="Salary calculation"
        chip={result.ok ? (result.data.state === 'finalized' ? 'Finalised' : 'Draft') : undefined}
        description={`Salaries for ${label}, from attendance, salaries, deductions and incentives.`}
        actions={<MonthPicker month={period.slice(0, 7)} />}
        tabs={<PayrollNav active="/payroll" month={period.slice(0, 7)} />}
      />
      {!result.ok ? (
        <MissionNotice tone="danger">{result.error}</MissionNotice>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile icon={CalendarDaysIcon} label="Working days in month" value={result.data.header.workingDaysInMonth} note="Calendar days minus weekly offs" />
            <StatTile label="Festival holidays" value={result.data.header.festivalHolidays} note="Company holidays on working days" />
            <StatTile label="Actual working days" value={result.data.header.actualWorkingDays} note="Divides the monthly salary" />
            <StatTile label="Extra paid days" value={result.data.header.extraPaidDays} note={`Full day = ${result.data.header.fullDayHours} h`} />
          </dl>
          {result.data.state === 'finalized' ? (
            <MissionNotice icon={InfoIcon}>
              Finalised
              {result.data.finalizedAt
                ? ` on ${new Date(result.data.finalizedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}`
                : ''}
              . These are the salary records; later changes to attendance or pay files do not alter them. Reopen to recalculate.
            </MissionNotice>
          ) : result.data.reopenReason ? (
            <MissionNotice tone="attention">Reopened: {result.data.reopenReason}. Finalise again to save new records.</MissionNotice>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground max-w-3xl text-sm">
              Per day = monthly ÷ actual working days · Calculated = per day × (days worked + {result.data.header.extraPaidDays}) · In hand = the lower
              of calculated and monthly, minus deductions.
            </p>
            <MonthActions month={result.data} canFinalize={period <= current} />
          </div>
          <SalaryTable month={result.data} />
        </>
      )}
    </MissionPage>
  );
}
