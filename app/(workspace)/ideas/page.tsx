import type { Metadata } from 'next';

import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { KnowledgeModule } from '@/components/support/support-pages';
import { requireProfile } from '@/lib/auth/profile';
import { canManageSupportRecords } from '@/lib/support/permissions';
import { getSupportModuleData } from '@/lib/support/queries';

export const metadata: Metadata = {
  title: 'Ideas · TaskPulse',
};

export default async function IdeasPage() {
  const profile = await requireProfile();
  const data = await getSupportModuleData();

  return (
    <>
      <WorkspaceHeader
        title="Ideas"
        description={`${data.period.label} · ${data.summary.ideas.total} ideas · ${data.summary.ideas.validated} validated`}
      />
      <div className="px-4 py-4 lg:px-6">
        <KnowledgeModule
          config={{
            module: 'ideas',
            title: 'Ideas',
            singular: 'idea',
            bodyLabel: 'Idea',
            dateName: 'ideaDate',
            bodyName: 'idea',
            href: '/ideas',
          }}
          entries={data.ideas}
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
