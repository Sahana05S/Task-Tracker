import type { Metadata } from 'next';

import { MissionPage, MissionPageHeader } from '@/components/missions/mission-ui';
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
    <MissionPage>
      <MissionPageHeader
        eyebrow="Records"
        title="Ideas"
        description={`${data.period.label} · ${data.summary.ideas.total} ideas · ${data.summary.ideas.validated} validated`}
      />
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
    </MissionPage>
  );
}
