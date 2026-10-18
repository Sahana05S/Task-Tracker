import { TaskRelations } from '@/components/timelines/task-relations';
import Link from 'next/link';
import { getLivePresentation } from '@/modules/reports';
import { liveViewContext } from '@/modules/reports';
import { ReportContext } from '@/modules/reports/components/view-context';
import type { Metadata } from 'next';

import { CalendarClockIcon, CalendarRangeIcon, FlagIcon, ListChecksIcon } from 'lucide-react';

import { MissionPage, MissionPageHeader, StatTile } from '@/components/missions/mission-ui';
import { TaskGantt } from '@/components/timelines/task-gantt';
import { currentPeriod } from '@/shared/time/period';
import { requireProfile } from '@/shared/session/profile';
import { getTaskWorkspaceData } from '@/modules/tasks';
import { buildTaskTimeline } from '@/lib/timelines/gantt';

export const metadata: Metadata = {
  title: 'Timelines · TaskPulse',
};

export default async function TimelinesPage({searchParams}:{searchParams:Promise<{period?:string;asOf?:string}>}) {
  await requireProfile();

  const query=await searchParams;const context=await liveViewContext(query.period,query.asOf);
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
    <MissionPage wide>
      <MissionPageHeader
        eyebrow="Missions"
        title="Mission timeline"
        description={`${timeline.groups.length} assignees · ${assignedTaskCount} assignment bars (shared missions repeat by assignee) · ${timeline.totalDays} day range`}
      />

      <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
        <StatTile icon={CalendarClockIcon} label="Timeline start" value={timeline.startDate} />
        <StatTile icon={FlagIcon} label="Timeline end" value={timeline.endDate} />
        <StatTile icon={CalendarRangeIcon} label="Visible mission bars" value={String(assignedTaskCount)} />
      </dl>

      <ReportContext model={presentation}/>
      <TaskGantt timeline={timeline} />
      <section className="soft-card grid gap-2 p-5 text-sm sm:p-6"><h2 className="text-foreground mb-1 flex items-center gap-2 text-base font-bold tracking-tight"><ListChecksIcon className="text-primary size-5 shrink-0" aria-hidden="true"/>Undated tasks</h2>{timeline.undated.length===0?<p className="bg-muted/70 text-muted-foreground rounded-xl px-4 py-3">Every mission in this view has dates.</p>:null}{timeline.undated.map(({task,reason})=><p key={task.id} className="bg-muted/70 rounded-xl px-3.5 py-2.5"><Link className="link" href={'/tasks/'+encodeURIComponent(task.taskTag)}>{task.taskTag} · {task.title}</Link> <span className="text-muted-foreground">— {reason}</span></p>)}</section>
      <TaskRelations model={presentation}/>
    </MissionPage>
  );
}
