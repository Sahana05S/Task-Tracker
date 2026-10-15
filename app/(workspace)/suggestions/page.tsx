import type { Metadata } from 'next';

import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { KnowledgeModule } from '@/components/support/support-pages';
import { requireProfile } from '@/lib/auth/profile';
import { canManageSupportRecords } from '@/lib/support/permissions';
import { getSupportModuleData } from '@/lib/support/queries';

export const metadata: Metadata = {
  title: 'Suggestions · TaskPulse',
};

export default async function SuggestionsPage() {
  const profile = await requireProfile();
  const data = await getSupportModuleData();

  return (
    <>
      <WorkspaceHeader
        title="Suggestions"
        description={`${data.period.label} · ${data.summary.suggestions.total} suggestions · ${data.summary.suggestions.validated} validated`}
      />
      <div className="px-4 py-4 lg:px-6">
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
      </div>
    </>
  );
}
