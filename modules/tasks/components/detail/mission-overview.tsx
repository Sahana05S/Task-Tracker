import { CalendarDaysIcon, CheckCircle2Icon, CircleDotIcon, GaugeIcon } from 'lucide-react';

import { MissionProgress } from '@/shared/ui/mission-ui';
import { FactTile, PeopleTile } from '@/modules/tasks/components/detail/detail-tiles';
import type { TaskDetailData } from '@/modules/tasks/internal/detail';
import { CATEGORY_LABELS } from '@/shared/tracker/enums';
import { formatDate, formatHours, formatPercent } from '@/shared/tracker/format';

/**
 * The mission's core facts: progress, status, dates and people. This is the
 * page's first definition list.
 */
export function MissionOverview({
  data,
  assigneeNames,
  reviewerNames,
  overdue,
}: {
  data: TaskDetailData;
  assigneeNames: readonly string[];
  reviewerNames: readonly string[];
  overdue: boolean;
}) {
  const task = data.task;
  return (
    <section className="soft-card p-5 sm:p-6" aria-label="Mission overview">
      <p className="eyebrow">{CATEGORY_LABELS[task.category]}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-foreground text-sm font-semibold">Overall progress</span>
        <span className="text-success-strong text-xl font-bold tabular-nums">
          {formatPercent(task.progressPercentage)}
        </span>
      </div>
      <MissionProgress value={task.progressPercentage} label="Overall progress" className="mt-2 h-2.5" />
      <p className="text-muted-foreground mt-2 text-xs">
        Activity checklist {formatPercent(data.checklistProgressPercentage)} ·{' '}
        {formatHours(data.effort.hoursLogged)} h logged
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
        <FactTile icon={CircleDotIcon} label="Status" value={task.status} />
        <FactTile
          icon={CalendarDaysIcon}
          label="Due"
          value={formatDate(task.dueDate)}
          note={overdue ? 'Overdue' : undefined}
          alert={overdue}
        />
        <FactTile icon={CalendarDaysIcon} label="Assigned" value={formatDate(task.assignedDate)} />
        <FactTile icon={CheckCircle2Icon} label="Completed" value={formatDate(task.completedDate)} />
        <FactTile
          icon={CheckCircle2Icon}
          label="Met deadline"
          value={task.metDeadline === null ? '—' : task.metDeadline ? 'Yes' : 'No'}
        />
        <FactTile
          icon={GaugeIcon}
          label="Task freshness"
          value={task.freshness ?? `Unavailable: ${task.freshnessReason ?? "date evidence missing"}`}
        />
        <PeopleTile label="Assignees" names={assigneeNames} fallback="Unassigned" />
        <PeopleTile label="Reviewers" names={reviewerNames} fallback="No reviewer" />
      </dl>
    </section>
  );
}
