import type { Metadata } from 'next';

import { getMySalary, monthPeriod } from '@/modules/payroll';
import { SalaryTrend } from '@/modules/payroll/components/salary-trend';
import { requireProfile } from '@/shared/session/profile';
import { kolkataDate } from '@/shared/time/kolkata';
import { MissionNotice, MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';

export const metadata: Metadata = { title: 'My salary' };

/** Each member's own salary history (M19): finalised months only, read by migration 79. */
export default async function MySalaryPage() {
  await requireProfile();
  const history = await getMySalary();
  return (
    <MissionPage wide>
      <MissionPageHeader
        title="My salary"
        description="How your pay has grown: monthly salary, in-hand pay and incentives for every finalised month. Only you and the managing director can see this."
      />
      {history.ok ? (
        <SalaryTrend history={history.data} asOfPeriod={monthPeriod(kolkataDate())!} subject="Your" />
      ) : (
        <MissionNotice tone="danger">{history.error}</MissionNotice>
      )}
    </MissionPage>
  );
}
