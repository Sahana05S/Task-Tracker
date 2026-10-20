import { PaperclipIcon } from 'lucide-react';

import { MissionPanel } from '@/shared/ui/mission-ui';
import { AssetGroup, AssetLink } from '@/modules/tasks/components/detail/asset-links';
import { WorkFileCreator } from '@/modules/tasks/components/work-file-creator';
import { ipoLinks, sectionsForRole } from '@/modules/tasks/internal/details-contract';
import type { Task, TaskDetailSection, TaskLink } from '@/types/tracker';

/** Work-file creation plus the mission's Input / Process / Output assets and references. */
export function WorkFilesPanel({
  task,
  links,
  sections,
  checklistHref,
  canCreateWorkFile,
  providerState,
}: {
  task: Task;
  links: readonly TaskLink[];
  sections: readonly TaskDetailSection[];
  checklistHref: string;
  canCreateWorkFile: boolean;
  providerState: string;
}) {
  const referenceLinks = links.filter(l=>!l.ipoRole || l.ipoRole==='reference');

  return (
    <MissionPanel
      icon={PaperclipIcon}
      title="Work files & assets"
      subtitle="Create a work file and save its link here (Drive automation deferred)"
    >
      <div className="grid gap-5">
        {canCreateWorkFile ? (
          <WorkFileCreator taskId={task.id} taskTag={task.taskTag} title={task.title} version={task.lifecycleVersion ?? 0} />
        ) : null}
        <div className="grid gap-5 xl:grid-cols-3">
          <AssetGroup
            title="Inputs"
            empty="No mission inputs have been linked."
            links={ipoLinks(links,'input')}
            sections={sectionsForRole(sections,'input')}
          />
          <AssetGroup
            title="Process"
            empty="No process links have been added."
            links={ipoLinks(links,'process')}
            sections={sectionsForRole(sections,'process')}
            extraLink={{ label: 'Master checklist', href: checklistHref }}
          />
          <AssetGroup
            title="Outputs"
            empty="No mission outputs have been linked."
            links={ipoLinks(links,'output')}
            sections={sectionsForRole(sections,'output')}
          />
        </div>

        {referenceLinks.length > 0 ? (
          <div className="grid gap-2">
            <h3 className="eyebrow">References</h3>
            {links.some(l=>!l.ipoRole)?<p className="text-muted-foreground text-sm">Legacy links have no confirmed IPO role and are retained here for review.</p>:null}
            {referenceLinks.map(l=><AssetLink key={l.id} link={l}/>)}
          </div>
        ) : null}

        <p className="text-muted-foreground border-border border-t pt-3 text-xs">
          Provider work: {providerState}. Automatic Google Drive operations are unavailable; integration is deferred. Existing asset links remain available.
        </p>
      </div>
    </MissionPanel>
  );
}
