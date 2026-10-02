import type { Metadata } from 'next';

import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { ReportsModule } from '@/components/support/support-pages';
import { requireProfile } from '@/lib/auth/profile';
import { canManageReportSnapshots } from '@/lib/support/permissions';
import { getSupportModuleData } from '@/lib/support/queries';

export const metadata: Metadata = {
  title: 'Reports · TaskPulse',
};

export default async function ReportsPage() {
  const profile = await requireProfile();
  const data = await getSupportModuleData();

  return (
    <>
      <WorkspaceHeader
        title="Reports"
        description={`${data.period.label} · ${data.summary.reports.total} reports · ${data.summary.reports.final} final`}
      />
      <div className="px-4 py-4 lg:px-6">
        <ReportsModule
          reports={data.reports}
          members={data.members}
          canManage={canManageReportSnapshots(profile.role)}
        />
      </div>
    </>
  );
}
