import { createClient } from '@/shared/supabase/server';
import { LOG_COLUMNS, mapDailyTaskLogs } from '@/lib/logs/mappers';
import {
  type TaskEffort,
} from '@/lib/logs/metrics';
import { mapTasks, TASK_COLUMNS } from '@/lib/tasks/mappers';
import type { DailyTaskLog, Task } from '@/types/tracker';

/**
 * Server-side reads for the daily log module.
 */

export interface LogHistoryData {
  logs: DailyTaskLog[];
  /** Tasks referenced by the returned logs, for tag and title lookup. */
  tasks: Task[];
}

/**
 * Loads one user's effort history, newest first, with the tasks it references.
 *
 * Scoped explicitly to the requested employee, with self/manager privacy
 * enforced again by the database.
 */
export async function getMyLogHistory(userId: string): Promise<LogHistoryData> {
  const supabase = await createClient();

  const { data: logRows, error: logError } = await supabase
    .from('daily_task_logs')
    .select(LOG_COLUMNS)
    .eq('user_id', userId)
    .is('reversed_at', null)
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (logError) {
    throw new Error(`Failed to load logs: ${logError.message}`);
  }

  const logs = mapDailyTaskLogs(logRows);

  if (logs.length === 0) {
    return { logs, tasks: [] };
  }

  const taskIds = [...new Set(logs.map((log) => log.taskId))];

  const { data: taskRows, error: taskError } = await supabase
    .from('tasks')
    .select(TASK_COLUMNS)
    .in('id', taskIds);

  if (taskError) {
    throw new Error(`Failed to load tasks for logs: ${taskError.message}`);
  }

  return { logs, tasks: mapTasks(taskRows) };
}

/**
 * Per-task hour totals across the whole team.
 *
 * Only the two columns the aggregate needs are selected. Productivity is stored
 * on the task by the log actions; this supplies the hours figure the grid shows
 * alongside it, which has no column of its own.
 */
export async function getTaskEffortTotals(): Promise<Map<string, TaskEffort>> {
  const supabase = await createClient();

  const {data,error}=await supabase.rpc('team_task_effort_totals');
  if(error) throw new Error(`Failed to load effort totals: ${error.message}`);
  return new Map(data.map(row=>[row.task_id,{hoursLogged:row.hours_logged,logCount:row.log_count}]));
}

/**
 * Tasks a user may log effort against: their own assignments, excluding work
 * that is finished or abandoned.
 *
 * Fetched on demand when the log drawer opens rather than with every workspace
 * page, since the global FAB is present on all of them.
 */
export async function getLoggableTasksFor(userId: string): Promise<Task[]> {
  const supabase = await createClient();

  const { data: legacyRows, error: legacyError } = await supabase
    .from('tasks')
    .select(TASK_COLUMNS)
    .eq('assignee_id', userId)
    .not('status', 'in', '("Done","Discarded")')
    .order('task_tag', { ascending: true });

  if (legacyError) {
    throw new Error(`Failed to load loggable tasks: ${legacyError.message}`);
  }

  const { data: assignmentRows, error: assignmentError } = await supabase
    .from('task_assignees')
    .select('task_id')
    .eq('user_id', userId);

  if (assignmentError) {
    return mapTasks(legacyRows);
  }

  const legacyTaskIds = new Set(legacyRows.map((row) => row.id));
  const joinedTaskIds = assignmentRows
    .map((row) => row.task_id)
    .filter((taskId) => !legacyTaskIds.has(taskId));

  if (joinedTaskIds.length === 0) {
    return mapTasks(legacyRows);
  }

  const { data: joinedRows, error: joinedError } = await supabase
    .from('tasks')
    .select(TASK_COLUMNS)
    .in('id', joinedTaskIds)
    .not('status', 'in', '("Done","Discarded")');

  if (joinedError) {
    throw new Error(`Failed to load joined loggable tasks: ${joinedError.message}`);
  }

  return mapTasks([...legacyRows, ...joinedRows]).sort((a, b) =>
    a.taskTag.localeCompare(b.taskTag),
  );
}
