import type { Metadata } from 'next';

import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { KnowledgeModule } from '@/components/support/support-pages';
import { requireProfile } from '@/lib/auth/profile';
import { canManageSupportRecords } from '@/lib/support/permissions';
import { getSupportModuleData } from '@/lib/support/queries';

export const metadata: Metadata = {
  title: 'Daily Facts · TaskPulse',
};

export default async function DailyFactsPage() {
  const profile = await requireProfile();
  const data = await getSupportModuleData();

  return (
    <>
      <WorkspaceHeader
        title="Daily facts"
        description={`${data.period.label} · ${data.summary.facts.total} facts · ${data.summary.facts.validated} validated`}
      />
      <div className="px-4 py-4 lg:px-6">
        <KnowledgeModule
          config={{
            module: 'daily-facts',
            title: 'Daily facts',
            singular: 'daily fact',
            bodyLabel: 'Fact',
            dateName: 'factDate',
            bodyName: 'fact',
            href: '/daily-facts',
          }}
          entries={data.facts}
          tasks={data.tasks}
          inputContext={data.inputContext}
          members={data.members}
          currentUser={profile}
          canManage={canManageSupportRecords(profile.role)}
        />
      </div>
    </>
  );
}
