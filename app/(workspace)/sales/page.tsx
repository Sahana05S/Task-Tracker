import type { Metadata } from 'next';

import { MissionPage, MissionPageHeader } from '@/components/missions/mission-ui';
import { SalesLogModule } from '@/components/support/support-pages';
import { requireProfile } from '@/lib/auth/profile';
import { canManageSupportRecords } from '@/lib/support/permissions';
import { getSupportModuleData } from '@/lib/support/queries';

export const metadata: Metadata = {
  title: 'Sales Log · TaskPulse',
};

export default async function SalesPage() {
  const profile = await requireProfile();
  const data = await getSupportModuleData();

  return (
    <MissionPage>
      <MissionPageHeader
        eyebrow="Records"
        title="Sales log"
        description={`${data.period.label} · ${data.summary.sales.total} sales entries · ${data.summary.sales.newProjects} new projects`}
      />
      <SalesLogModule
        salesLogs={data.salesLogs}
        tasks={data.tasks}
        inputContext={data.inputContext}
        members={data.members}
        currentUser={profile}
        canManage={canManageSupportRecords(profile.role)}
      />
    </MissionPage>
  );
}
