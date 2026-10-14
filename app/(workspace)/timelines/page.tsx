import { TaskRelations } from '@/components/timelines/task-relations';
import Link from 'next/link';
import { getLivePresentation } from '@/lib/presentation/queries';
import { viewContext } from '@/lib/presentation/context';
import { ReportContext } from '@/components/reports/view-context';
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

export default async function TimelinesPage({searchParams}:{searchParams:Promise<{period?:string;asOf?:string}>}) {
  await requireProfile();

  const query=await searchParams;const context=viewContext(query.period,query.asOf);
  const period=context.period;const presentation=await getLivePresentation(context);
  const {tasks,members}=presentation;
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
        description={`${timeline.groups.length} assignees · ${assignedTaskCount} assignment bars (shared tasks repeat by assignee) · ${timeline.totalDays} day range`}
      />

      <div className="grid gap-4 px-4 py-4 lg:px-6">
        <section className="soft-card grid gap-3 p-4 sm:grid-cols-3">
          <Metric label="Timeline start" value={timeline.startDate} />
          <Metric label="Timeline end" value={timeline.endDate} />
          <Metric label="Visible task bars" value={String(assignedTaskCount)} />
        </section>

        <ReportContext model={presentation}/>
        <TaskGantt timeline={timeline} />
        <section className="soft-card p-4"><h2 className="font-semibold">Undated tasks</h2>{timeline.undated.map(({task,reason})=><p key={task.id}><Link className="underline" href={'/tasks/'+encodeURIComponent(task.taskTag)}>{task.taskTag} · {task.title}</Link> — {reason}</p>)}</section>
        <TaskRelations model={presentation}/>
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
