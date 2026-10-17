import { classifyFreshness, eligibilityReasons } from '@/modules/tasks/internal/contract';
import type { TaskRow } from '@/types/database';
import type { Task } from '@/types/tracker';

/**
 * Converts snake_case `tasks` rows into the camelCase `Task` domain model.
 *
 * Nullability is passed through rather than defaulted. `task_scale` and
 * `progress_percentage` are nullable in the schema, and collapsing NULL to 0
 * here would make an unestimated task indistinguishable from a zero-weight one,
 * which matters because `valid_for_metrics` turns on scale being greater than
 * zero.
 */

/**
 * Explicit column list for task selects.
 *
 * `scaled_progress` is included because it is a generated STORED column: the
 * database computes it, and reading it back is the only way to get it.
 */
/**
 * Written as one literal rather than a joined array because supabase-js parses
 * this string at the type level to infer the row shape. A value of type `string`
 * defeats that inference and collapses the result to an error type.
 */
export const TASK_COLUMNS =
  'id, archived_effective_date, archive_reason, handoff_successor_id, participant_credit_mode, participant_version, metric_version, lifecycle_version, work_revision, productivity_available, started_date, scale_mode, scale_inputs, scale_override, scale_provenance, scale_version, eligibility_reasons, freshness_reason, task_tag, title, category, description, comments, assignee_id, reviewer_id, task_scale, progress_owner, progress_percentage, scaled_progress, task_productivity, priority, status, freshness, valid_for_metrics, assigned_date, due_date, completed_date, met_deadline, created_at, updated_at' as const;

export function mapTask(row: TaskRow): Task {
  const freshness = classifyFreshness({ assignedDate: row.assigned_date, dueDate: row.due_date, completedDate: row.completed_date, status: row.status });
  return {
    id: row.id,
    archivedEffectiveDate:row.archived_effective_date??null,
    archiveReason:row.archive_reason??null,
    handoffSuccessorId:row.handoff_successor_id??null,
    participantCreditMode: row.participant_credit_mode ?? "legacy",
    participantVersion: row.participant_version ?? 0,
    taskTag: row.task_tag,
    title: row.title,
    category: row.category,
    description: row.description,
    comments: row.comments,
    assigneeId: row.assignee_id,
    reviewerId: row.reviewer_id,
    assigneeIds: [row.assignee_id],
    reviewerIds: row.reviewer_id ? [row.reviewer_id] : [],
    taskScale: row.task_scale,
    progressPercentage: row.progress_percentage,
    progressOwner: row.progress_owner ?? 'manual',
    scaledProgress: row.scaled_progress,
    taskProductivity: row.productivity_available === false ? null : row.task_productivity,
    priority: row.priority,
    status: row.status,
    freshness: freshness.state,
    freshnessReason: freshness.reason,
    lifecycleVersion: row.lifecycle_version ?? 0,
    workRevision: row.work_revision ?? 0,
    startedDate: row.started_date ?? null,
    scaleMode: row.scale_mode ?? "manual",
    scaleInputs: row.scale_inputs as Record<string, unknown> ?? {},
    scaleOverride: row.scale_override ?? null,
    scaleVersion: row.scale_version ?? 0,
    scaleProvenance: row.scale_provenance ?? "legacy stored value",
    eligibilityReasons: eligibilityReasons({priority:row.priority,status:row.status,taskScale:row.task_scale,progressPercentage:row.progress_percentage}),
    validForMetrics: eligibilityReasons({priority:row.priority,status:row.status,taskScale:row.task_scale,progressPercentage:row.progress_percentage}).length === 0,
    assignedDate: row.assigned_date,
    dueDate: row.due_date,
    completedDate: row.completed_date,
    metDeadline: row.met_deadline,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapTasks(rows: readonly TaskRow[]): Task[] {
  return rows.map(mapTask);
}

export function withTaskParticipants(
  task: Task,
  participants: {
    readonly assigneeIds?: readonly string[];
    readonly reviewerIds?: readonly string[];
  },
): Task {
  // Legacy primaries remain canonical compatibility projections even when old
  // join rows are missing or disagree; reconciliation never drops the owner.
  const assigneeIds = [...new Set([...(task.participantCreditMode === "configured" ? [] : [task.assigneeId]), ...(participants.assigneeIds ?? task.assigneeIds)])];
  const reviewerIds = [...new Set([...(task.reviewerId ? [task.reviewerId] : []), ...(participants.reviewerIds ?? task.reviewerIds)])];

  return {
    ...task,
    assigneeIds: assigneeIds.length > 0 ? assigneeIds : [task.assigneeId],
    reviewerIds:
      reviewerIds.length > 0
        ? reviewerIds
        : task.reviewerId
          ? [task.reviewerId]
          : [],
  };
}
