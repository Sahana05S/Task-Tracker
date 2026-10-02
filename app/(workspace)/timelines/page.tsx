import type { Metadata } from 'next';

import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { TaskGantt } from '@/components/timelines/task-gantt';
import { currentPeriod } from '@/lib/analytics/engine';
import { requireProfile } from '@/lib/auth/profile';
import { getTaskWorkspaceData } from '@/lib/tasks/queries';
import { buildTaskTimeline } from '@/lib/timelines/gantt';

export const metadata: Metadata = {
  title: 'Timelines · TaskPulse',
};

export default async function TimelinesPage() {
  await requireProfile();

  const period = currentPeriod();
  const { tasks, members } = await getTaskWorkspaceData();
  const timeline = buildTaskTimeline({
    tasks,
    members,
    fallbackPeriod: period,
  });

  const assignedTaskCount = timeline.groups.reduce(
    (count, group) => count + group.tasks.length,
    0,
  );

  return (
    <>
      <WorkspaceHeader
        title="Task timelines"
        description={`${timeline.groups.length} assignees · ${assignedTaskCount} scheduled task bars · ${timeline.totalDays} day range`}
      />

      <div className="grid gap-4 px-4 py-4 lg:px-6">
        <section className="soft-card grid gap-3 p-4 sm:grid-cols-3">
          <Metric label="Timeline start" value={timeline.startDate} />
          <Metric label="Timeline end" value={timeline.endDate} />
          <Metric label="Visible task bars" value={String(assignedTaskCount)} />
        </section>

        <TaskGantt timeline={timeline} />
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white/70 p-3">
      <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-slate-900 tabular">
        {value}
      </dd>
    </div>
  );
}
