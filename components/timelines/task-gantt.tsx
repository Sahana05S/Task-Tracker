import Link from 'next/link';

import { FreshnessIndicator, StatusBadge } from '@/components/tracker/tracker-badges';
import type { TaskTimeline, TimelineTaskBar } from '@/lib/timelines/gantt';
import { formatDate } from '@/lib/tracker/format';
import { cn } from '@/lib/utils';

export function TaskGantt({ timeline }: { timeline: TaskTimeline }) {
  const timelineWidth = Math.min(2800, Math.max(820, timeline.totalDays * 28));

  if (timeline.groups.length === 0) {
    return (
      <section className="soft-card flex min-h-80 items-center justify-center p-8 text-center">
        <div className="max-w-md">
          <h2 className="text-foreground text-base font-semibold">
            No tasks to timeline yet
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Add tasks with assigned dates and due dates to see Gantt bars grouped
            by assignee.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="soft-card-clip">
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="panel-title text-base">Task timelines</h2>
          <p className="text-muted-foreground text-xs">
            {formatDate(timeline.startDate)} – {formatDate(timeline.endDate)} ·{' '}
            {timeline.totalDays} days
          </p>
        </div>
        <TimelineLegend />
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[68rem]">
          <div className="grid grid-cols-[15rem_minmax(0,1fr)]">
            <div className="bg-muted/40 border-border border-r px-4 py-3 text-xs font-semibold text-slate-700">
              Assignee
            </div>
            <div
              className="bg-muted/40 relative py-3"
              style={{ width: timelineWidth }}
            >
              <div className="relative h-6">
                {timeline.ticks.map((tick) => (
                  <div
                    key={tick.date}
                    className="absolute top-0 -translate-x-1/2 text-center"
                    style={{ left: `${tick.offsetPercent}%` }}
                  >
                    <div className="text-muted-foreground text-[11px] font-medium whitespace-nowrap">
                      {tick.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {timeline.groups.map((group) => (
              <TimelineGroup
                key={group.userId}
                groupName={group.name}
                employeeId={group.employeeId}
                tasks={group.tasks}
                timelineWidth={timelineWidth}
                ticks={timeline.ticks}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TimelineGroup({
  groupName,
  employeeId,
  tasks,
  timelineWidth,
  ticks,
}: {
  groupName: string;
  employeeId: string | null;
  tasks: readonly TimelineTaskBar[];
  timelineWidth: number;
  ticks: TaskTimeline['ticks'];
}) {
  const rowHeight = Math.max(4.25, tasks.length * 2.75 + 1.5);

  return (
    <>
      <div className="border-border bg-card border-t border-r px-4 py-3">
        <p className="text-foreground text-sm font-semibold">{groupName}</p>
        <p className="text-muted-foreground mt-1 text-xs">
          {employeeId ?? 'Unlisted member'} · {tasks.length}{' '}
          {tasks.length === 1 ? 'task' : 'tasks'}
        </p>
      </div>
      <div
        className="border-border bg-card relative border-t"
        style={{ width: timelineWidth, minHeight: `${rowHeight}rem` }}
      >
        <TimelineGrid ticks={ticks} />
        <div className="relative z-10 p-3">
          {tasks.map((task, index) => (
            <TaskBar key={`${task.taskId}-${index}`} task={task} index={index} />
          ))}
        </div>
      </div>
    </>
  );
}

function TimelineGrid({ ticks }: { ticks: TaskTimeline['ticks'] }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {ticks.map((tick) => (
        <span
          key={tick.date}
          className="bg-border/70 absolute inset-y-0 w-px"
          style={{ left: `${tick.offsetPercent}%` }}
        />
      ))}
    </div>
  );
}

function TaskBar({ task, index }: { task: TimelineTaskBar; index: number }) {
  return (
    <Link
      href={task.href}
      className={cn(
        'absolute flex h-9 min-w-28 items-center gap-2 overflow-hidden rounded-full border px-3 text-xs shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-soft',
        statusBarClass(task.status),
        freshnessRingClass(task.freshness),
      )}
      style={{
        left: `${task.offsetPercent}%`,
        width: `${Math.max(task.widthPercent, 2)}%`,
        top: `${0.75 + index * 2.75}rem`,
      }}
      title={`${task.taskTag} · ${task.title} · ${formatDate(task.startDate)} to ${formatDate(task.endDate)}`}
    >
      <span className="shrink-0 font-mono font-semibold">{task.taskTag}</span>
      <span className="truncate font-medium">{task.title}</span>
      <span className="sr-only">
        {task.status}, {task.freshness}, {task.durationDays} days
      </span>
    </Link>
  );
}

function TimelineLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge status="Not Started" />
      <StatusBadge status="In Progress" />
      <StatusBadge status="Done" />
      <StatusBadge status="Discarded" />
      <span className="mx-1 hidden h-4 w-px bg-slate-200 sm:inline-block" />
      <FreshnessIndicator freshness="Super Fresh" />
      <FreshnessIndicator freshness="Almost Fresh" />
      <FreshnessIndicator freshness="Fresh" />
      <FreshnessIndicator freshness="Almost Stale" />
      <FreshnessIndicator freshness="Stale" />
      <FreshnessIndicator freshness="Rotten" />
    </div>
  );
}

function statusBarClass(status: TimelineTaskBar['status']): string {
  switch (status) {
    case 'Done':
      return 'border-emerald-300 bg-emerald-100 text-emerald-950';
    case 'In Progress':
      return 'border-sky-300 bg-sky-100 text-sky-950';
    case 'Discarded':
      return 'border-slate-300 bg-slate-100 text-slate-500 line-through';
    case 'Stopped':
    case 'On-Hold':
    case 'Carryover':
    case 'Not Started':
      return 'border-amber-300 bg-amber-100 text-amber-950';
  }
}

function freshnessRingClass(freshness: TimelineTaskBar['freshness']): string {
  switch (freshness) {
    case 'Super Fresh':
    case 'Almost Fresh':
    case 'Fresh':
      return 'ring-1 ring-emerald-400/70';
    case 'Almost Stale':
    case 'Stale':
      return 'ring-1 ring-amber-400/80';
    case 'Rotten':
      return 'ring-1 ring-rose-500/80';
    default: return 'ring-1 ring-slate-400/50';
  }
}
