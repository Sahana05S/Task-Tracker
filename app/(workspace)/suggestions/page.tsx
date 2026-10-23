import type { Metadata } from 'next';

import { MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';
import { KnowledgeModule } from '@/modules/support/components/support-pages';
import { requireProfile } from '@/shared/session/profile';
import { canManageSupportRecords, getSupportModuleData } from '@/modules/support';

export const metadata: Metadata = {
  title: 'Suggestions',
};

export default async function SuggestionsPage() {
  const profile = await requireProfile();
  const data = await getSupportModuleData();

  return (
    <MissionPage>
      <MissionPageHeader
        eyebrow="Records"
        title="Suggestions"
        description={`${data.period.label} · ${data.summary.suggestions.total} suggestions · ${data.summary.suggestions.validated} validated`}
      />
      <KnowledgeModule
        config={{
          module: 'suggestions',
          title: 'Suggestions',
          singular: 'suggestion',
          bodyLabel: 'Suggestion',
          dateName: 'suggestionDate',
          bodyName: 'suggestion',
          href: '/suggestions',
        }}
        entries={data.suggestions}
        tasks={data.tasks}
        inputContext={data.inputContext}
        members={data.members}
        currentUser={profile}
        canManage={canManageSupportRecords(profile.role)}
      />
    </MissionPage>
  );
}
