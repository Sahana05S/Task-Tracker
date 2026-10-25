import type { Metadata } from 'next';

import { getPayrollSetup, monthPeriod } from '@/modules/payroll';
import { EmployeeList } from '@/modules/payroll/components/employee-list';
import { PayrollNav } from '@/modules/payroll/components/payroll-nav';
import { requireRole } from '@/shared/session/profile';
import { kolkataDate } from '@/shared/time/kolkata';
import { MissionNotice, MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';

export const metadata: Metadata = { title: 'Employees · Payroll' };

export default async function PayrollEmployeesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireRole(['managing_director']);
  const month = (monthPeriod((await searchParams).month) ?? monthPeriod(kolkataDate())!).slice(0, 7);
  const result = await getPayrollSetup();
  return (
    <MissionPage wide>
      <MissionPageHeader
        eyebrow="Payroll · managing director only"
        title="Employees"
        chip={result.ok ? `${result.data.employees.filter((e) => e.isActive).length} active` : undefined}
        description="Each person's pay file: salary, fixed deductions, monthly entries and advances."
        tabs={<PayrollNav active="/payroll/employees" month={month} />}
      />
      {result.ok ? <EmployeeList employees={result.data.employees} month={month} /> : <MissionNotice tone="danger">{result.error}</MissionNotice>}
    </MissionPage>
  );
}
