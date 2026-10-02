import type { Metadata } from 'next';

import { WorkspaceHeader } from '@/components/layout/workspace-header';
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
    <>
      <WorkspaceHeader
        title="Sales log"
        description={`${data.period.label} · ${data.summary.sales.total} sales entries · ${data.summary.sales.newProjects} new projects`}
      />
      <div className="px-4 py-4 lg:px-6">
        <SalesLogModule
          salesLogs={data.salesLogs}
          members={data.members}
          currentUser={profile}
          canManage={canManageSupportRecords(profile.role)}
        />
      </div>
    </>
  );
}
