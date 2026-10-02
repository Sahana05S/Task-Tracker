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
  'id, task_tag, title, category, description, comments, assignee_id, reviewer_id, task_scale, progress_percentage, scaled_progress, task_productivity, priority, status, freshness, valid_for_metrics, assigned_date, due_date, completed_date, met_deadline, created_at, updated_at' as const;

export function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
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
    scaledProgress: row.scaled_progress,
    taskProductivity: row.task_productivity,
    priority: row.priority,
    status: row.status,
    freshness: row.freshness,
    validForMetrics: row.valid_for_metrics,
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
  const assigneeIds = [...new Set(participants.assigneeIds ?? [])];
  const reviewerIds = [...new Set(participants.reviewerIds ?? [])];

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
