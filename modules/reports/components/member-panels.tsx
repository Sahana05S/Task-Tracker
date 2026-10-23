import Link from 'next/link';
import { MissionActionsMenu } from '@/modules/tasks/components/mission-actions-menu';

import { EmptyState, MissionProgress } from '@/shared/ui/mission-ui';
import { CategoryBadge, FreshnessIndicator, PriorityBadge, StatusBadge } from '@/shared/ui/tracker-badges';
import { formatDate, formatHours, formatPercent } from '@/shared/tracker/format';
import { sumHours } from '@/modules/time-tracking/client';
import type { DailyTaskLog, Task } from '@/types/tracker';

/**
 * A member's missions and logs, as in the workbook's per-member report tab.
 * Shared by the employee profile and Reports > Daily report.
 */

const missionHref = (tag: string) => `/tasks/${encodeURIComponent(tag)}`;

/** The member's missions: tag, title, type, status, progress, due date, priority, freshness. */
export function TaskList({ tasks, empty = 'No missions are assigned to this member yet.' }: { tasks: readonly Task[]; empty?: string }) {
  if (tasks.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <div className="border-border relative overflow-x-auto rounded-xl border">
      <table className="sheet-grid w-full min-w-[56rem]">
        <thead>
          <tr>
            <th>Mission</th>
            <th>Type</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Due</th>
            <th>Priority</th>
            <th>Freshness</th>
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td className="max-w-96 text-xs">
                <Link href={missionHref(task.taskTag)} className="link">
                  <span className="task-tag text-primary">{task.taskTag}</span> · {task.title}
                </Link>
              </td>
              <td className="text-xs"><CategoryBadge category={task.category} /></td>
              <td className="text-xs whitespace-nowrap"><StatusBadge status={task.status} /></td>
              <td className="text-xs">
                <span className="flex min-w-28 items-center gap-2">
                  <MissionProgress value={task.progressPercentage} label={`${task.taskTag} progress`} className="flex-1" />
                  <span className="w-9 text-right tabular-nums">{formatPercent(task.progressPercentage)}</span>
                </span>
              </td>
              <td className="text-xs whitespace-nowrap">{task.dueDate ? formatDate(task.dueDate) : 'No due date'}</td>
              <td className="text-xs"><PriorityBadge priority={task.priority} /></td>
              <td className="text-xs"><FreshnessIndicator freshness={task.freshness} /></td>
              <td className="w-10 text-right"><MissionActionsMenu taskId={task.id} taskTag={task.taskTag} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One day's logs as a list: mission tag, update and hours. */
export function TaskLogSummary({ logs, tasks, empty = 'No task logs.' }: { logs: readonly DailyTaskLog[]; tasks: readonly Task[]; empty?: string }) {
  if (logs.length === 0) return <EmptyState>{empty}</EmptyState>;
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  return (
    <ul className="grid gap-2">
      {logs.map((log) => {
        const task = tasksById.get(log.taskId);
        return (
          <li key={log.id} className="bg-muted/70 flex items-start justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm">
            <div className="min-w-0">
              {task ? (
                <Link href={missionHref(task.taskTag)} className="task-tag text-primary hover:underline">{task.taskTag}</Link>
              ) : (
                <p className="task-tag">Unknown mission</p>
              )}
              <p className="text-muted-foreground mt-0.5 text-xs break-words">{log.updateNotes ?? 'No update notes'}</p>
            </div>
            <span className="text-foreground shrink-0 text-xs font-semibold tabular-nums">{formatHours(log.hoursWorked)} h</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Log compilation table: date, mission, hours, update (hours stay visible on narrow screens). */
export function TaskLogCompilation({ logs, tasks, empty = 'No task logs in this range.' }: { logs: readonly DailyTaskLog[]; tasks: readonly Task[]; empty?: string }) {
  if (logs.length === 0) return <EmptyState>{empty}</EmptyState>;
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const total = sumHours(logs);
  return (
    <div className="border-border relative overflow-x-auto rounded-xl border">
      <table className="sheet-grid w-full min-w-[32rem]">
        <thead>
          <tr>
            <th>Date</th>
            <th>Mission</th>
            <th className="text-right">Hours</th>
            <th>Update</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => {
            const tag = tasksById.get(log.taskId)?.taskTag;
            return (
              <tr key={log.id}>
                <td className="text-xs whitespace-nowrap">{formatDate(log.logDate)}</td>
                <td className="text-xs whitespace-nowrap">
                  {tag ? <Link href={missionHref(tag)} className="task-tag text-primary hover:underline">{tag}</Link> : 'Unknown mission'}
                </td>
                <td className="sheet-numeric text-xs">{formatHours(log.hoursWorked)}</td>
                <td className="max-w-96 text-xs break-words">{log.updateNotes ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={2} className="text-right">Total · {logs.length} log{logs.length === 1 ? '' : 's'}</th>
            <td className="sheet-numeric text-xs font-semibold">{formatHours(total)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
