import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getEmployeePayFile, getPayrollSetup, monthPeriod } from '@/modules/payroll';
import { PayFile } from '@/modules/payroll/components/pay-file';
import { MonthPicker, PayrollNav } from '@/modules/payroll/components/payroll-nav';
import { UUID_PATTERN } from '@/shared/forms/form-data';
import { requireRole } from '@/shared/session/profile';
import { kolkataDate } from '@/shared/time/kolkata';
import { MissionNotice, MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';

export const metadata: Metadata = { title: 'Pay file · Payroll' };

export default async function PayFilePage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  await requireRole(['managing_director']);
  const { userId } = await params;
  if (!UUID_PATTERN.test(userId)) notFound();
  const period = monthPeriod((await searchParams).month) ?? monthPeriod(kolkataDate())!;
  const [file, setup] = await Promise.all([getEmployeePayFile(userId, period), getPayrollSetup()]);
  if (!file.ok && file.reason === 'not_found') notFound();
  const month = period.slice(0, 7);

  return (
    <MissionPage wide>
      <MissionPageHeader
        eyebrow="Payroll · pay file"
        title={file.ok ? file.data.fullName : 'Pay file'}
        chip={file.ok && file.data.employeeId ? file.data.employeeId : undefined}
        description={file.ok && file.data.jobTitle ? file.data.jobTitle : undefined}
        actions={
          <>
            <MonthPicker month={month} />
            <Link href={`/payroll/employees?month=${month}`} className="text-primary text-sm font-medium hover:underline">
              All employees
            </Link>
          </>
        }
        tabs={<PayrollNav active="/payroll/employees" month={month} />}
      />
      {file.ok && setup.ok ? (
        <PayFile file={file.data} components={setup.data.components} employees={setup.data.employees} />
      ) : (
        <MissionNotice tone="danger">{!file.ok ? file.error : !setup.ok ? setup.error : null}</MissionNotice>
      )}
    </MissionPage>
  );
}
