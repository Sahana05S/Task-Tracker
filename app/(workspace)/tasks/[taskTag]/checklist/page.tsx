import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireProfile } from '@/shared/session/profile';
import { MissionActionsMenu } from '@/modules/tasks/components/mission-actions-menu';
import { getMissionChoices, getTaskForChecklist, normalizeTaskTagParam } from '@/modules/tasks';
import { canManageTasks, canUpdateTaskOwnFields } from '@/modules/tasks/client';
import { getChecklistBranch, getObjectiveReviews, getUnmappedRootRows } from '@/modules/checklists';
import { CHECKLIST_SECTIONS, NO_REVIEWS, checklistWorkHref, parseChecklistLocation, parseChecklistView, type ChecklistBranch, type ChecklistBranchOptions } from '@/modules/checklists/client';
import { ChecklistWorkspace, type ChecklistHomeSection } from '@/modules/checklists/components/checklist-workspace';
import { checklistCommand } from '@/modules/checklists/actions';
import { createSubMission } from '@/modules/tasks/actions';
import { getMemberNames } from '@/modules/team';

type Params = Promise<{ taskTag: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const PAGE_SIZE = 50;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const tag = normalizeTaskTagParam((await params).taskTag);
  return { title: `${tag ?? 'Mission'} checklist` };
}

/**
 * The master checklist. Without `parent` it is the checklist home (Setup,
 * Activity and Closure tables); with `parent` it is the table of the rows
 * under one row. Reads are bounded branches, so a large checklist never loads
 * in one go.
 */
export default async function ChecklistPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const user = await requireProfile();
  const task = await getTaskForChecklist((await params).taskTag);
  if (!task) notFound();
  const location = parseChecklistLocation(await searchParams);
  const viewParam = parseChecklistView((await searchParams).view);
  const options: ChecklistBranchOptions = { checklistId: location.checklistId, section: location.section };

  let branch: ChecklistBranch;
  let sections: ChecklistHomeSection[] | undefined;
  try {
    if (location.parentNodeId) {
      branch = await getChecklistBranch(task.id, { ...options, parentNodeId: location.parentNodeId, cursor: location.cursor, limit: PAGE_SIZE });
    } else {
      const loaded = await Promise.all(CHECKLIST_SECTIONS.map(async (section) => {
        const cursor = location.section === section ? location.cursor ?? 0 : 0;
        const read = await getChecklistBranch(task.id, { ...options, section, cursor, limit: PAGE_SIZE });
        return { branch: read, home: { section, rows: read.rows, cursor, nextCursor: read.nextCursor } satisfies ChecklistHomeSection };
      }));
      branch = loaded[0].branch;
      sections = branch.checklist ? loaded.map(entry => entry.home) : undefined;
    }
  } catch {
    return (
      <section className="mx-auto grid w-full max-w-[1200px] gap-3 px-4 pt-6 pb-10 lg:px-6">
        <h1 className="text-foreground text-[1.625rem] leading-tight font-bold tracking-tight">Checklist unavailable</h1>
        <p role="alert" className="text-muted-foreground text-sm">This checklist could not be loaded. Retry, or go back to the mission.</p>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link className="link font-semibold" href={checklistWorkHref(task.taskTag, location)}>Retry checklist</Link>
          <Link className="link font-semibold" href={`/tasks/${encodeURIComponent(task.taskTag)}`}>Back to mission</Link>
        </div>
      </section>
    );
  }

  const manager = canManageTasks(user.role);
  const checklistId = branch.checklist?.id;
  // One mission timer (3 November 2026): the checklist reads no row timers.
  const [names, linkChoices, unmapped, reviews] = await Promise.all([
    getMemberNames().catch((): Record<string, string> => ({})),
    manager ? getMissionChoices().then(choices => choices.filter(t => t.id !== task.id)) : [],
    manager && checklistId && sections ? getUnmappedRootRows(checklistId) : [],
    // A failed review read hides the chips instead of failing the checklist.
    getObjectiveReviews(task.id).catch(() => NO_REVIEWS),
  ]);

  return (
    <ChecklistWorkspace
      task={task}
      ownerNames={task.assigneeIds.map(id => names[id] ?? 'Unknown member')}
      checklist={branch.checklist}
      ancestors={branch.ancestors}
      rollup={branch.rollup}
      version={branch.taskVersion}
      sections={sections}
      page={location.parentNodeId ? { nodeId: location.parentNodeId, section: branch.section, rows: branch.rows, cursor: location.cursor ?? 0, nextCursor: branch.nextCursor } : undefined}
      manager={manager}
      executor={canUpdateTaskOwnFields(user, task)}
      selectedItem={location.item}
      managerTools={manager ? { linkChoices, unmapped } : undefined}
      actions={{ checklist: checklistCommand, submission: createSubMission }}
      view={viewParam ?? 'table'}
      viewExplicit={viewParam !== null && viewParam !== undefined}
      reviews={reviews}
      memberNames={names}
      headerActions={<MissionActionsMenu taskId={task.id} taskTag={task.taskTag} variant="button" />}
    />
  );
}
