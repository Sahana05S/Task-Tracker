import Link from 'next/link';
import { notFound } from 'next/navigation';

import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { Button } from '@/components/ui/button';
import { requireProfile } from '@/lib/auth/profile';
import { computeChecklistProgress } from '@/lib/checklists/progress';
import { resolveTaskDetailRouteState } from '@/lib/tasks/detail';
import { canManageTasks, canUpdateTaskOwnFields } from '@/lib/tasks/permissions';
import {
  CHECKLIST_NODE_TYPE_LABELS,
  CHECKLIST_NODE_TYPES,
} from '@/lib/tracker/enums';
import { formatPercent } from '@/lib/tracker/format';
import type { ChecklistNode, Task } from '@/types/tracker';

import {
  addChecklistNode,
  createMasterChecklist,
  deleteChecklistNode,
  setChecklistProgressSync,
  toggleChecklistNode,
} from './actions';

interface ChecklistPageProps {
  params: Promise<{
    taskTag: string;
  }>;
}

export default async function ChecklistPage({ params }: ChecklistPageProps) {
  const currentUser = await requireProfile();

  const { taskTag } = await params;
  const routeState = await resolveTaskDetailRouteState(taskTag);

  if (routeState.status !== 'ready') {
    notFound();
  }

  const { data } = routeState;
  const canManage = canManageTasks(currentUser.role);
  const canUpdate = canUpdateTaskOwnFields(currentUser, data.task);
  const progress = computeChecklistProgress(
    data.checklistNodes.map((node) => {
      const linkedTask = data.linkedTasksById.get(node.linkedTaskId ?? '');

      return {
        id: node.id,
        parentNodeId: node.parentNodeId,
        isComplete: node.isComplete || linkedTask?.status === 'Done',
        progressPercentage:
          linkedTask === undefined ? undefined : linkedTask.progressPercentage,
      };
    }),
  );
  const progressByNodeId = new Map(
    progress.nodeProgress.map((nodeProgress) => [
      nodeProgress.id,
      nodeProgress,
    ]),
  );
  const tree = buildChecklistTree(data.checklistNodes);
  const childCounts = countChildren(data.checklistNodes);

  return (
    <>
      <WorkspaceHeader
        title={`${data.task.taskTag} checklist`}
        description={data.checklist?.title ?? data.task.title}
        actions={
          <Link
            href={`/tasks/${encodeURIComponent(data.task.taskTag)}`}
            className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors"
          >
            Back to task
          </Link>
        }
      />

      <div className="px-4 py-4 lg:px-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <main className="grid gap-4">
            <section className="soft-card grid gap-4 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    Master checklist progress
                  </p>
                  <p className="text-foreground mt-1 text-2xl font-semibold tabular">
                    {formatPercent(progress.overallProgressPercentage)}
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Parent pages and groups use equal-weight child rollups. A
                    parent reaches 100% only when every child is complete.
                  </p>
                </div>
                {data.checklist ? (
                  <SyncProgressForm
                    checklistId={data.checklist.id}
                    taskTag={data.task.taskTag}
                    enabled={data.checklist.syncProgressToTask}
                    canManage={canManage}
                  />
                ) : null}
              </div>

              <progress
                className="task-progress w-full"
                value={progress.overallProgressPercentage}
                max={100}
                data-complete={
                  progress.overallProgressPercentage >= 100 ? 'true' : 'false'
                }
                aria-label="Master checklist progress"
              />

              {!data.checklist ? (
                <CreateChecklistForm
                  taskTag={data.task.taskTag}
                  taskTitle={data.task.title}
                  canUpdate={canUpdate}
                />
              ) : tree.length > 0 ? (
                <ChecklistTree
                  nodes={tree}
                  childCounts={childCounts}
                  progressByNodeId={progressByNodeId}
                  linkedTasksById={data.linkedTasksById}
                  taskTag={data.task.taskTag}
                  checklistId={data.checklist.id}
                  canUpdate={canUpdate}
                  canManage={canManage}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  No checklist items have been added yet.
                </p>
              )}
            </section>
          </main>

          <aside className="grid h-fit gap-4">
            <section className="soft-card p-4">
              <h2 className="text-foreground text-sm font-semibold">
                Checklist setup
              </h2>
              {data.checklist ? (
                <AddNodeForm
                  checklistId={data.checklist.id}
                  taskTag={data.task.taskTag}
                  nodes={data.checklistNodes}
                  canManage={canManage}
                />
              ) : (
                <p className="text-muted-foreground mt-3 text-sm">
                  Create the master checklist first, then add pages, groups,
                  checklist items, and linked subtasks.
                </p>
              )}
            </section>

            <section className="soft-card p-4">
              <h2 className="text-foreground text-sm font-semibold">
                Task-linked subtasks
              </h2>
              <p className="text-muted-foreground mt-2 text-sm">
                Use node type Task with another task tag to reuse a real task as
                a subtask. Its progress contributes to this checklist rollup.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}

interface ChecklistTreeNode {
  readonly node: ChecklistNode;
  readonly children: readonly ChecklistTreeNode[];
}

function CreateChecklistForm({
  taskTag,
  taskTitle,
  canUpdate,
}: {
  taskTag: string;
  taskTitle: string;
  canUpdate: boolean;
}) {
  if (!canUpdate) {
    return (
      <p className="text-muted-foreground text-sm">
        No checklist exists yet. Ask a manager or assignee to create it.
      </p>
    );
  }

  return (
    <form
      action={asFormAction(createMasterChecklist)}
      className="grid gap-3 rounded-md border border-dashed border-slate-300 bg-white/70 p-4"
    >
      <input type="hidden" name="taskTag" value={taskTag} />
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-900">Checklist title</span>
        <input
          name="title"
          defaultValue={`CHECKLIST - ${taskTitle}`}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          maxLength={180}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="syncProgressToTask"
          value="true"
          className="accent-primary size-4"
        />
        <span>Sync task progress from checklist rollup</span>
      </label>
      <Button type="submit" className="w-fit">
        Create master checklist
      </Button>
    </form>
  );
}

function SyncProgressForm({
  checklistId,
  taskTag,
  enabled,
  canManage,
}: {
  checklistId: string;
  taskTag: string;
  enabled: boolean;
  canManage: boolean;
}) {
  if (!canManage) {
    return (
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
        Sync {enabled ? 'enabled' : 'disabled'}
      </span>
    );
  }

  return (
    <form
      action={asFormAction(setChecklistProgressSync)}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="checklistId" value={checklistId} />
      <input type="hidden" name="taskTag" value={taskTag} />
      <input
        type="hidden"
        name="syncProgressToTask"
        value={enabled ? 'false' : 'true'}
      />
      <Button type="submit" variant={enabled ? 'accent' : 'outline'} size="sm">
        {enabled ? 'Checklist sync on' : 'Sync checklist to task'}
      </Button>
    </form>
  );
}

function AddNodeForm({
  checklistId,
  taskTag,
  nodes,
  canManage,
}: {
  checklistId: string;
  taskTag: string;
  nodes: readonly ChecklistNode[];
  canManage: boolean;
}) {
  if (!canManage) {
    return (
      <p className="text-muted-foreground mt-3 text-sm">
        Only managers can edit checklist structure.
      </p>
    );
  }

  return (
    <form action={asFormAction(addChecklistNode)} className="mt-3 grid gap-3">
      <input type="hidden" name="checklistId" value={checklistId} />
      <input type="hidden" name="taskTag" value={taskTag} />
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-900">Type</span>
        <select
          name="nodeType"
          defaultValue="Item"
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          {CHECKLIST_NODE_TYPES.map((nodeType) => (
            <option key={nodeType} value={nodeType}>
              {CHECKLIST_NODE_TYPE_LABELS[nodeType]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-900">Parent</span>
        <select
          name="parentNodeId"
          defaultValue=""
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">Checklist root</option>
          {nodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.title}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-900">Title</span>
        <input
          name="title"
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          maxLength={180}
          required
          placeholder="Task setup"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-900">Linked task tag</span>
        <input
          name="linkedTaskTag"
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          placeholder="Sep26_T5"
        />
        <span className="text-muted-foreground text-xs">
          Required for Task nodes. Leave blank for pages, groups, and items.
        </span>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-900">Description</span>
        <textarea
          name="description"
          className="border-input bg-background min-h-20 rounded-md border px-3 py-2 text-sm"
          placeholder="Optional notes"
        />
      </label>
      <Button type="submit" size="sm">
        Add checklist node
      </Button>
    </form>
  );
}

function ChecklistTree({
  nodes,
  childCounts,
  progressByNodeId,
  linkedTasksById,
  taskTag,
  checklistId,
  canUpdate,
  canManage,
}: {
  nodes: readonly ChecklistTreeNode[];
  childCounts: ReadonlyMap<string, number>;
  progressByNodeId: ReadonlyMap<
    string,
    { readonly progressPercentage: number; readonly isComplete: boolean }
  >;
  linkedTasksById: ReadonlyMap<string, Task>;
  taskTag: string;
  checklistId: string;
  canUpdate: boolean;
  canManage: boolean;
}) {
  return (
    <ul className="grid gap-2">
      {nodes.map((treeNode) => (
        <ChecklistTreeItem
          key={treeNode.node.id}
          treeNode={treeNode}
          childCounts={childCounts}
          progressByNodeId={progressByNodeId}
          linkedTasksById={linkedTasksById}
          taskTag={taskTag}
          checklistId={checklistId}
          canUpdate={canUpdate}
          canManage={canManage}
          depth={0}
        />
      ))}
    </ul>
  );
}

function ChecklistTreeItem({
  treeNode,
  childCounts,
  progressByNodeId,
  linkedTasksById,
  taskTag,
  checklistId,
  canUpdate,
  canManage,
  depth,
}: {
  treeNode: ChecklistTreeNode;
  childCounts: ReadonlyMap<string, number>;
  progressByNodeId: ReadonlyMap<
    string,
    { readonly progressPercentage: number; readonly isComplete: boolean }
  >;
  linkedTasksById: ReadonlyMap<string, Task>;
  taskTag: string;
  checklistId: string;
  canUpdate: boolean;
  canManage: boolean;
  depth: number;
}) {
  const { node, children } = treeNode;
  const nodeProgress = progressByNodeId.get(node.id);
  const linkedTask = linkedTasksById.get(node.linkedTaskId ?? '');
  const hasChildren = (childCounts.get(node.id) ?? 0) > 0;
  const isComplete = nodeProgress?.isComplete ?? node.isComplete;
  const progressPercentage = nodeProgress?.progressPercentage ?? 0;

  return (
    <li>
      <div
        className="rounded-md border border-slate-200 bg-white/80 px-3 py-2"
        style={{ marginLeft: depth === 0 ? 0 : depth * 18 }}
      >
        <div className="flex flex-wrap items-start gap-3">
          <div className="pt-0.5">
            <span
              className={
                isComplete
                  ? 'inline-flex size-5 items-center justify-center rounded border border-emerald-300 bg-emerald-50 text-xs font-bold text-emerald-700'
                  : 'inline-flex size-5 items-center justify-center rounded border border-rose-300 bg-rose-50 text-xs font-bold text-rose-700'
              }
              aria-label={isComplete ? 'Complete' : 'Incomplete'}
            >
              {isComplete ? '✓' : '×'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                {CHECKLIST_NODE_TYPE_LABELS[node.nodeType]}
              </span>
              <p className="text-sm font-medium text-slate-900">{node.title}</p>
              <span className="tabular text-muted-foreground text-xs">
                {formatPercent(progressPercentage)}
              </span>
            </div>
            {node.description ? (
              <p className="text-muted-foreground mt-1 text-sm">
                {node.description}
              </p>
            ) : null}
            {linkedTask ? (
              <Link
                href={`/tasks/${encodeURIComponent(linkedTask.taskTag)}`}
                className="task-tag mt-2 inline-flex hover:underline"
              >
                {linkedTask.taskTag}
              </Link>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasChildren ? (
              <span className="text-muted-foreground rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
                Rollup
              </span>
            ) : canUpdate ? (
              <form action={asFormAction(toggleChecklistNode)}>
                <input type="hidden" name="taskTag" value={taskTag} />
                <input type="hidden" name="nodeId" value={node.id} />
                <input
                  type="hidden"
                  name="isComplete"
                  value={isComplete ? 'false' : 'true'}
                />
                <Button type="submit" variant="outline" size="sm">
                  Mark {isComplete ? 'No' : 'Yes'}
                </Button>
              </form>
            ) : null}
            {canManage ? (
              <form action={asFormAction(deleteChecklistNode)}>
                <input type="hidden" name="taskTag" value={taskTag} />
                <input type="hidden" name="checklistId" value={checklistId} />
                <input type="hidden" name="nodeId" value={node.id} />
                <Button type="submit" variant="ghost" size="sm">
                  Delete
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      </div>
      {children.length > 0 ? (
        <ul className="mt-2 grid gap-2">
          {children.map((child) => (
            <ChecklistTreeItem
              key={child.node.id}
              treeNode={child}
              childCounts={childCounts}
              progressByNodeId={progressByNodeId}
              linkedTasksById={linkedTasksById}
              taskTag={taskTag}
              checklistId={checklistId}
              canUpdate={canUpdate}
              canManage={canManage}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function buildChecklistTree(
  nodes: readonly ChecklistNode[],
): ChecklistTreeNode[] {
  const childrenByParent = new Map<string | null, ChecklistNode[]>();

  for (const node of nodes) {
    const siblings = childrenByParent.get(node.parentNodeId) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parentNodeId, siblings);
  }

  function build(parentNodeId: string | null): ChecklistTreeNode[] {
    return (childrenByParent.get(parentNodeId) ?? []).map((node) => ({
      node,
      children: build(node.id),
    }));
  }

  return build(null);
}

function countChildren(
  nodes: readonly ChecklistNode[],
): ReadonlyMap<string, number> {
  const childCounts = new Map<string, number>();
  for (const node of nodes) {
    if (node.parentNodeId === null) continue;
    childCounts.set(
      node.parentNodeId,
      (childCounts.get(node.parentNodeId) ?? 0) + 1,
    );
  }
  return childCounts;
}

type ServerFormAction = (formData: FormData) => void | Promise<void>;

function asFormAction(
  action: (formData: FormData) => Promise<unknown>,
): ServerFormAction {
  return action as ServerFormAction;
}
