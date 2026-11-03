import { PaperclipIcon } from 'lucide-react';

import { ProofFiles } from '@/modules/files/components/proof-files';
import { MissionPanel } from '@/shared/ui/mission-ui';
import { AssetGroup, AssetLink } from '@/modules/tasks/components/detail/asset-links';
import { WorkFileCreator } from '@/modules/tasks/components/work-file-creator';
import { ipoLinks, sectionsForRole } from '@/modules/tasks/internal/details-contract';
import { missionFilesOfKind, PROOFS_BUCKET, type MissionDocumentKind, type MissionProof } from '@/modules/tasks/internal/proofs/rules';
import { removeProof, saveProof, startProofUpload } from '@/modules/tasks/proof-actions';
import type { Task, TaskDetailSection, TaskLink } from '@/types/tracker';

const GROUPS: readonly { kind: MissionDocumentKind; title: string; empty: string; files: string }[] = [
  { kind: 'input', title: 'Inputs', empty: 'No mission inputs have been linked.', files: 'Input documents' },
  { kind: 'process', title: 'Process', empty: 'No process links have been added.', files: 'Process documents' },
  { kind: 'output', title: 'Outputs', empty: 'No mission outputs have been linked.', files: 'Output documents' },
];

/**
 * The mission's Input / Process / Output: uploaded documents (migration 113,
 * kept in the company Shared Drive like proofs) and pasted links
 * (`task_links.ipo_role`), plus references and work-file creation.
 */
export function WorkFilesPanel({
  task,
  links,
  sections,
  checklistHref,
  canCreateWorkFile,
  providerState,
  files,
  canAddFiles,
}: {
  task: Task;
  links: readonly TaskLink[];
  sections: readonly TaskDetailSection[];
  checklistHref: string;
  canCreateWorkFile: boolean;
  providerState: string;
  /** The mission's uploaded files; null for anyone outside its people and managers (no uploads shown). */
  files: readonly MissionProof[] | null;
  /** False for an archived mission. */
  canAddFiles: boolean;
}) {
  const referenceLinks = links.filter(l=>!l.ipoRole || l.ipoRole==='reference');

  return (
    <MissionPanel
      icon={PaperclipIcon}
      title="Work files & assets"
      subtitle="Input, Process and Output documents and links for this mission"
    >
      <div className="grid gap-5">
        {canCreateWorkFile ? (
          <WorkFileCreator taskId={task.id} taskTag={task.taskTag} title={task.title} version={task.lifecycleVersion ?? 0} />
        ) : null}
        <div className="grid gap-5 2xl:grid-cols-3">
          {GROUPS.map((group) => (
            <div key={group.kind} className="grid content-start gap-3">
              <AssetGroup
                title={group.title}
                empty={group.empty}
                links={ipoLinks(links, group.kind)}
                sections={sectionsForRole(sections, group.kind)}
                extraLink={group.kind === 'process' ? { label: 'Master checklist', href: checklistHref } : undefined}
              />
              {files ? (
                <ProofFiles
                  bucket={PROOFS_BUCKET}
                  files={missionFilesOfKind(files, group.kind)}
                  canAdd={canAddFiles}
                  fields={{ taskId: task.id, taskTag: task.taskTag, kind: group.kind }}
                  start={startProofUpload}
                  save={saveProof}
                  remove={removeProof}
                  label={group.files}
                  addLabel="Upload"
                  noun="document"
                  empty="PDFs, photos or Office files, 25 MB each; kept in the company Shared Drive."
                />
              ) : null}
            </div>
          ))}
        </div>

        {referenceLinks.length > 0 ? (
          <div className="grid gap-2">
            <h3 className="eyebrow">References</h3>
            {links.some(l=>!l.ipoRole)?<p className="text-muted-foreground text-sm">Legacy links have no confirmed IPO role and are retained here for review.</p>:null}
            {referenceLinks.map(l=><AssetLink key={l.id} link={l}/>)}
          </div>
        ) : null}

        <div className="text-muted-foreground border-border grid gap-1 border-t pt-3 text-xs">
          <p>
            Uploaded documents go to the company Shared Drive and open through the app for the mission&apos;s people and managers.
            A pasted link is stored as a link only: the app cannot open or check files outside the Shared Drive, so make sure the right people can open it.
          </p>
          <p>Work-folder automation: {providerState}. Creating mission folders in Google Drive automatically is still off.</p>
        </div>
      </div>
    </MissionPanel>
  );
}
