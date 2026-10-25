import type { Metadata } from 'next';

import { getPayrollSetup } from '@/modules/payroll';
import { PayrollNav } from '@/modules/payroll/components/payroll-nav';
import { PayrollSettings } from '@/modules/payroll/components/payroll-settings';
import { requireRole } from '@/shared/session/profile';
import { MissionNotice, MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';

export const metadata: Metadata = { title: 'Settings · Payroll' };

export default async function PayrollSettingsPage() {
  await requireRole(['managing_director']);
  const result = await getPayrollSetup();
  return (
    <MissionPage wide>
      <MissionPageHeader
        eyebrow="Payroll · managing director only"
        title="Payroll settings"
        description="Salary rules and the lists of deductions and incentives."
        tabs={<PayrollNav active="/payroll/settings" />}
      />
      {result.ok ? <PayrollSettings setup={result.data} /> : <MissionNotice tone="danger">{result.error}</MissionNotice>}
    </MissionPage>
  );
}
