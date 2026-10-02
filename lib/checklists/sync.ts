import { computeChecklistProgress } from '@/lib/checklists/progress';
import { createClient } from '@/lib/supabase/server';
import { mapTask, TASK_COLUMNS } from '@/lib/tasks/mappers';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface SyncState {
  readonly visitedChecklistIds: Set<string>;
}

export async function syncTaskProgressForChecklist(
  supabase: SupabaseServerClient,
  checklistId: string,
  options: {
    readonly force?: boolean;
    readonly state?: SyncState;
  } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const state = options.state ?? { visitedChecklistIds: new Set<string>() };
  if (state.visitedChecklistIds.has(checklistId)) return { ok: true };
  state.visitedChecklistIds.add(checklistId);

  const { data: checklist, error: checklistError } = await supabase
    .from('task_checklists')
    .select('id, task_id, sync_progress_to_task')
    .eq('id', checklistId)
    .maybeSingle();

  if (checklistError) return { ok: false, error: checklistError.message };
  if (!checklist) return { ok: false, error: 'That checklist no longer exists.' };
  if (!options.force && !checklist.sync_progress_to_task) return { ok: true };

  const { data: nodeRows, error: nodeError } = await supabase
    .from('checklist_nodes')
    .select('id, parent_node_id, is_complete, linked_task_id')
    .eq('checklist_id', checklistId);

  if (nodeError) return { ok: false, error: nodeError.message };

  const linkedTaskIds = [
    ...new Set(
      nodeRows
        .map((row) => row.linked_task_id)
        .filter((linkedTaskId): linkedTaskId is string => linkedTaskId !== null),
    ),
  ];
  const linkedTaskRows =
    linkedTaskIds.length === 0
      ? []
      : await selectOrEmpty(
          supabase.from('tasks').select(TASK_COLUMNS).in('id', linkedTaskIds),
        );
  const linkedTasksById = new Map(
    linkedTaskRows.map((row) => [row.id, mapTask(row)]),
  );

  const progress = computeChecklistProgress(
    nodeRows.map((node) => {
      const linkedTask = linkedTasksById.get(node.linked_task_id ?? '');

      return {
        id: node.id,
        parentNodeId: node.parent_node_id,
        isComplete: node.is_complete || linkedTask?.status === 'Done',
        progressPercentage:
          linkedTask === undefined ? undefined : linkedTask.progressPercentage,
      };
    }),
  );

  const { error: taskError } = await supabase
    .from('tasks')
    .update({ progress_percentage: progress.overallProgressPercentage })
    .eq('id', checklist.task_id);

  if (taskError) return { ok: false, error: taskError.message };

  return syncTaskProgressForLinkedTask(supabase, checklist.task_id, state);
}

export async function syncTaskProgressForLinkedTask(
  supabase: SupabaseServerClient,
  linkedTaskId: string,
  state: SyncState = { visitedChecklistIds: new Set<string>() },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: nodeRows, error } = await supabase
    .from('checklist_nodes')
    .select('checklist_id')
    .eq('linked_task_id', linkedTaskId);

  if (error) return { ok: false, error: error.message };

  for (const nodeRow of nodeRows) {
    const synced = await syncTaskProgressForChecklist(
      supabase,
      nodeRow.checklist_id,
      { state },
    );
    if (!synced.ok) return synced;
  }

  return { ok: true };
}

async function selectOrEmpty<T>(
  query: PromiseLike<{
    data: T[] | null;
    error: { code?: string; message: string } | null;
  }>,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    if (error.code === '42P01') return [];
    throw new Error(error.message);
  }
  return data ?? [];
}
