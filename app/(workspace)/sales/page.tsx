import type { Metadata } from 'next';

import { MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';
import { SalesLogModule } from '@/modules/support/components/support-pages';
import { requireProfile } from '@/shared/session/profile';
import { isFileStorageReady } from '@/modules/files';
import { canManageSupportRecords, getSaleProofs, getSupportModuleData } from '@/modules/support';

export const metadata: Metadata = {
  title: 'Sales Log',
};

export default async function SalesPage() {
  const profile = await requireProfile();
  const data = await getSupportModuleData();
  // Proofs only for entries the caller may see them on (the salesperson and managers).
  const [proofs, driveReady] = await Promise.all([getSaleProofs(data.salesLogs.map((entry) => entry.id)), isFileStorageReady()]);

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
        proofs={proofs}
        driveReady={driveReady}
      />
    </MissionPage>
  );
}
