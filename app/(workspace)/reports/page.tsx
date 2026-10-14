import { LiveReport } from '@/components/reports/live-report';
import { ArchivedReport } from '@/components/reports/archived-report';
import { MonthArchiveControls } from '@/components/reports/month-archive-controls';
import { monthHistory,monthRevision } from '@/lib/month/archive';
import { randomUUID } from 'node:crypto';
import { getLivePresentation } from '@/lib/presentation/queries';
import { viewContext } from '@/lib/presentation/context';
import { kolkataDate } from '@/lib/tasks/contract';
import type { Metadata } from 'next';

import { WorkspaceHeader } from '@/components/layout/workspace-header';
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
  const context=viewContext(query.period,query.asOf);
  const revision=query.revision?Number(query.revision):null;
  if(revision!==null&&(!Number.isSafeInteger(revision)||revision<1))throw new Error('Invalid archive revision.');
  const history=await monthHistory(context.period.startDate);
  const archive=revision===null?null:await monthRevision(context.period.startDate,revision);
  const previous=archive&&revision&&revision>1?await monthRevision(context.period.startDate,revision-1):null;
  const presentation=revision===null?await getLivePresentation(context):null;
  const data = revision===null?await getSupportModuleData(context.period,context.asOf):null;

  return (
    <>
      <WorkspaceHeader
        title="Reports"
        description={data?`${data.period.label} · ${data.summary.reports.total} reports · ${data.summary.reports.final} final`:`${context.period.label} · retained revision ${revision}`}
      />
      <div className="grid gap-4 px-4 py-4 lg:px-6">
        <MonthArchiveControls period={context.period.startDate} history={history} canClose={profile.role==='managing_director'} completeMonth={context.period.endDate<kolkataDate(new Date())} operation={randomUUID()}/>
        {archive?<ArchivedReport archive={archive} previous={previous} employee={null}/>:revision!==null?<p role="status">That revision is unavailable.</p>:presentation?<LiveReport model={presentation}/>:null}
        {data?<><h2 className="font-semibold">Retained saved reports · original rules</h2><ReportsModule
          reports={data.reports}
          members={data.members}
          canManage={canManageReportSnapshots(profile.role)}
        /></>:null}
      </div>
    </>
  );
}
