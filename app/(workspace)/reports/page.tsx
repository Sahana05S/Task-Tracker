import { LiveReport } from '@/components/reports/live-report';
import { ArchivedReport } from '@/components/reports/archived-report';
import { MonthArchiveControls } from '@/components/reports/month-archive-controls';
import { monthHistory,monthRevision } from '@/lib/month/archive';
import { randomUUID } from 'node:crypto';
import { getLivePresentation } from '@/lib/presentation/queries';
import { liveViewContext } from '@/lib/presentation/clock';
import { kolkataDate } from '@/lib/tasks/contract';
import type { Metadata } from 'next';

import { MissionNotice, MissionPage, MissionPageHeader } from '@/components/missions/mission-ui';
import { ReportsModule } from '@/components/support/support-pages';
import { requireProfile } from '@/lib/auth/profile';
import { canManageReportSnapshots } from '@/lib/support/permissions';
import { getSupportModuleData } from '@/lib/support/queries';

export const metadata: Metadata = {
  title: 'Reports · TaskPulse',
};

export default async function ReportsPage({searchParams}:{searchParams:Promise<{period?:string;asOf?:string;revision?:string}>}) {
  const profile = await requireProfile();
  const query=await searchParams;
  const context=await liveViewContext(query.period,query.asOf);
  const revision=query.revision?Number(query.revision):null;
  if(revision!==null&&(!Number.isSafeInteger(revision)||revision<1))throw new Error('Invalid archive revision.');
  const history=await monthHistory(context.period.startDate);
  const archive=revision===null?null:await monthRevision(context.period.startDate,revision);
  const previous=archive&&revision&&revision>1?await monthRevision(context.period.startDate,revision-1):null;
  const presentation=revision===null?await getLivePresentation(context):null;
  const data = revision===null?await getSupportModuleData(context.period,context.asOf):null;

  return (
    <MissionPage>
      <MissionPageHeader
        title="Reports"
        description={data?`${data.period.label} · ${data.summary.reports.total} reports · ${data.summary.reports.final} final`:`${context.period.label} · retained revision ${revision}`}
      />
      <MonthArchiveControls period={context.period.startDate} history={history} canClose={profile.role==='managing_director'} completeMonth={context.period.endDate<kolkataDate(new Date())} operation={randomUUID()}/>
      {archive?<ArchivedReport archive={archive} previous={previous} employee={null}/>:revision!==null?<MissionNotice tone="attention" role="status">That revision is unavailable.</MissionNotice>:presentation?<LiveReport model={presentation}/>:null}
      {data?<><h2 className="panel-title mt-2">Retained saved reports · original rules</h2><ReportsModule
        reports={data.reports}
        members={data.members}
        canManage={canManageReportSnapshots(profile.role)}
      /></>:null}
    </MissionPage>
  );
}
