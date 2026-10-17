import type { Metadata } from 'next';

import { MissionPage, MissionPageHeader } from '@/components/missions/mission-ui';
import { KnowledgeModule } from '@/modules/support/components/support-pages';
import { requireProfile } from '@/shared/session/profile';
import { canManageSupportRecords, getSupportModuleData } from '@/modules/support';

export const metadata: Metadata = {
  title: 'Daily Facts · TaskPulse',
};

export default async function DailyFactsPage() {
  const profile = await requireProfile();
  const data = await getSupportModuleData();

  return (
    <MissionPage>
      <MissionPageHeader
        eyebrow="Records"
        title="Daily facts"
        description={`${data.period.label} · ${data.summary.facts.total} facts · ${data.summary.facts.validated} validated`}
      />
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
    </MissionPage>
  );
}
