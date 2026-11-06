import { Fragment } from 'react';
import { ArrowDownIcon, ArrowRightIcon, ExternalLinkIcon, FolderOpenIcon, LinkIcon } from 'lucide-react';

import { fileStorageNote } from '@/modules/files/client';
import { ProofFiles } from '@/modules/files/components/proof-files';
import { AddLinkForm } from '@/modules/tasks/components/detail/add-link-form';
import { AssetLink } from '@/modules/tasks/components/detail/asset-links';
import { ipoLinks } from '@/modules/tasks/internal/details-contract';
import { missionFilesOfKind, PROOFS_BUCKET, type MissionFileKind, type MissionProof } from '@/modules/tasks/internal/proofs/rules';
import { removeProof, saveProof, startProofUpload } from '@/modules/tasks/proof-actions';
import { MissionPanel } from '@/shared/ui/mission-ui';
import type { Task, TaskLink } from '@/types/tracker';

const GROUPS: readonly { kind: MissionFileKind; title: string; empty: string }[] = [
  { kind: 'input', title: 'Input', empty: 'Nothing yet: briefs, drawings or data the work starts from.' },
  { kind: 'process', title: 'Process', empty: 'Nothing yet: working files, calculations or drafts.' },
  { kind: 'output', title: 'Output', empty: 'Nothing yet: what the mission delivers.' },
  { kind: 'proof', title: 'Proofs', empty: 'Nothing yet: receipts, site photos or sign-offs.' },
];

/** A pasted link in a group's list, marked as a link. */
function LinkRow({ link }: { link: TaskLink }) {
  const href = link.url && /^https?:\/\//i.test(link.url) ? link.url : null;
  const name = <span className="truncate">{link.label}</span>;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="badge-soft badge-neutral shrink-0">
        <LinkIcon aria-hidden="true" className="size-3" />
        Link
      </span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="text-primary inline-flex min-w-0 items-center gap-1 font-medium hover:underline">
          {name}
          <ExternalLinkIcon aria-hidden="true" className="size-3.5 shrink-0" />
        </a>
      ) : (
        <span className="text-muted-foreground inline-flex min-w-0 font-medium">{name}</span>
      )}
    </div>
  );
}

/** The arrow between two steps of the flow: down on phones, right from md. */
function FlowArrow() {
  return (
    <div aria-hidden="true" className="text-primary flex flex-col items-center justify-center md:flex-row">
      <span className="bg-primary/40 h-3 w-0.5 md:h-0.5 md:w-2" />
      <ArrowDownIcon className="size-4 md:hidden" />
      <ArrowRightIcon className="hidden size-4 md:block" />
    </div>
  );
}

/**
 * The mission's one Files panel (Work tab): Input → Process → Output as one connected flow
 * (user request, 6 November 2026: left to right with arrows from md, top to bottom on phones),
 * with Proofs and Other links under it.
 * Each group is one list of uploaded files (migrations 101 and 113, moved into
 * the company Shared Drive) and pasted links (`task_links.ipo_role`). Upload is
 * the main action; "Add a link instead" is the small option (not for Proofs).
 * Older reference and legacy links stay readable under Other links.
 */
export function FilesPanel({
  task,
  links,
  files,
  canUpload,
  canAddLink,
  driveReady,
}: {
  task: Task;
  links: readonly TaskLink[];
  /** The mission's uploaded files; null for anyone outside its people and managers (links only, no Proofs). */
  files: readonly MissionProof[] | null;
  /** Managers, the Crew and reviewers of a live mission; never observers. */
  canUpload: boolean;
  /** Who may save a link (mission details: managers and the mission's Crew). */
  canAddLink: boolean;
  /** Whether uploads move into the Shared Drive yet (honest wording). */
  driveReady: boolean;
}) {
  const otherLinks = links.filter((link) => !link.ipoRole || link.ipoRole === 'reference');
  const ipo = GROUPS.filter((group) => group.kind !== 'proof');
  // Proofs sit under the row; anyone without file access (files null) sees links only, no Proofs.
  const proofGroup = files ? GROUPS.find((group) => group.kind === 'proof') ?? null : null;
  const total = (files?.length ?? 0) + links.length;
  const card = (group: (typeof GROUPS)[number]) => (
    <ProofFiles
      key={group.kind}
      bucket={PROOFS_BUCKET}
      files={files ? missionFilesOfKind(files, group.kind) : []}
      items={group.kind === 'proof' ? [] : ipoLinks(links, group.kind).map((link) => ({ key: link.id, node: <LinkRow link={link} /> }))}
      canAdd={canUpload && files !== null}
      fields={{ taskId: task.id, taskTag: task.taskTag, kind: group.kind }}
      start={startProofUpload}
      save={saveProof}
      remove={removeProof}
      label={group.title}
      addLabel="Upload"
      noun={group.kind === 'proof' ? 'proof' : 'file'}
      empty={group.empty}
      className={group.kind === 'proof'
        ? 'bg-muted/50 grid h-full content-start gap-2 rounded-xl p-3'
        : 'bg-card border-primary/30 grid h-full content-start gap-2 rounded-xl border-2 p-3'}
    >
      {canAddLink && group.kind !== 'proof' ? (
        <AddLinkForm taskId={task.id} version={task.lifecycleVersion ?? 0} ipoRole={group.kind} />
      ) : null}
    </ProofFiles>
  );

  return (
    <MissionPanel
      icon={FolderOpenIcon}
      title="Files"
      subtitle={total ? `${total} file${total === 1 ? '' : 's'} and links` : 'Input, Process, Output and Proofs'}
    >
      <div className="grid gap-4">
        {/* Input → Process → Output: one flow, left to right from md, top to bottom below it. */}
        <div
          role="group"
          aria-label="Input, then Process, then Output"
          className="grid gap-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-1.5"
        >
          {ipo.map((group, index) => (
            <Fragment key={group.kind}>
              {index ? <FlowArrow /> : null}
              <div className="min-w-0">{card(group)}</div>
            </Fragment>
          ))}
        </div>
        {proofGroup ? card(proofGroup) : null}

        {otherLinks.length ? (
          <div className="border-border grid gap-2 border-t pt-3">
            <h3 className="eyebrow">Other links</h3>
            {otherLinks.map((link) => <AssetLink key={link.id} link={link} />)}
          </div>
        ) : null}

        <p className="text-muted-foreground border-border border-t pt-3 text-xs">
          PDFs, photos and Word, Excel or PowerPoint files, 25 MB each. {fileStorageNote(driveReady)} Uploaded files open through the app for the
          mission&apos;s people and managers. A link is stored as a link only: the app cannot open or check it.
        </p>
      </div>
    </MissionPanel>
  );
}
