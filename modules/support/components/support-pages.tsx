import type { ContributionInputContext } from '../internal/input-context';
import { DatedRecordModule, type TaskChoice } from './dated-record-module';
import { canValidateSupportRecord } from '../internal/permissions';
import Link from 'next/link';

import {
  deleteKnowledgeEntryAction,
  deleteReportSnapshotAction,
  deleteSalesLogAction,
  saveKnowledgeEntryAction,
  saveReportSnapshotAction,
  saveSalesLogAction,
  toggleKnowledgeValidationAction,
} from '../actions';
import { Button } from '@/shared/ui/button';
import type { SupportKnowledgeModule } from '../internal/permissions';
import { formatDate } from '@/shared/tracker/format';
import type {
  DailyFact,
  Idea,
  ReportSnapshot,
  SalesLog,
  Suggestion,
  User,
} from '@/types/tracker';

type ServerFormAction = (formData: FormData) => void | Promise<void>;

export type KnowledgeEntry = DailyFact | Idea | Suggestion;

export interface KnowledgeModuleConfig {
  readonly module: SupportKnowledgeModule;
  readonly title: string;
  readonly singular: string;
  readonly bodyLabel: string;
  readonly dateName: 'factDate' | 'ideaDate' | 'suggestionDate';
  readonly bodyName: 'fact' | 'idea' | 'suggestion';
  readonly href: string;
}

export function KnowledgeModule({config,entries,members,currentUser,tasks=[],inputContext}:{config:KnowledgeModuleConfig;entries:readonly KnowledgeEntry[];members:readonly User[];currentUser:User;canManage:boolean;tasks?:readonly TaskChoice[];inputContext?:ContributionInputContext}) {
 const kind=config.module==='daily-facts'?'fact':config.module==='ideas'?'idea':'suggestion';
 return <DatedRecordModule kind={kind} members={members} user={currentUser} tasks={tasks} inputContext={inputContext} entries={entries.map(e=>({...e,businessDate:entryDate(e),authorId:e.postedBy,content:entryBody(e),assetUrl:e.folderUrl}))}/>;
}

export function SalesLogModule({salesLogs,members,currentUser,tasks=[],inputContext}:{salesLogs:readonly SalesLog[];members:readonly User[];currentUser:User;canManage:boolean;tasks?:readonly TaskChoice[];inputContext?:ContributionInputContext}) {
 return <DatedRecordModule kind="sale" members={members} user={currentUser} tasks={tasks} inputContext={inputContext} entries={salesLogs.map(e=>({...e,businessDate:e.saleDate,authorId:e.salesBy,content:e.notes,assetUrl:e.projectFolderUrl,extras:{project_built_up_area:e.projectBuiltUpArea,project_location:e.projectLocation,client_name:e.clientName,is_new_project:e.isNewProject,basement_payment_received:e.basementPaymentReceived}}))}/>;
}

export function ReportsModule({
  reports,
  members,
  canManage,
}: {
  reports: readonly ReportSnapshot[];
  members: readonly User[];
  canManage: boolean;
}) {
  const memberNames = new Map(members.map((member) => [member.id, member.fullName]));

  return (
    <div className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
      {canManage ? (
        <aside className="soft-card h-fit p-5 sm:p-6">
          <h2 className="text-foreground text-base font-bold tracking-tight">Create report</h2>
          <ReportForm members={members} />
        </aside>
      ) : null}
      <section className="soft-card-clip xl:col-span-1">
        {reports.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm">No reports have been saved yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="sheet-grid min-w-[72rem]">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Employee</th>
                  <th>Period</th>
                  <th>Summary / folder</th>
                  {canManage ? <th>Manager actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <ReportRow key={report.id} report={report} members={members} memberNames={memberNames} canManage={canManage} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ReportForm({
  members,
  report,
}: {
  members: readonly User[];
  report?: ReportSnapshot;
}) {
  const payload = parseReportPayload(report?.payload);

  return (
    <form action={asFormAction(saveReportSnapshotAction)} className="mt-3 grid gap-3">
      {report ? <input type="hidden" name="id" value={report.id} /> : null}
      <input name="title" defaultValue={report?.title ?? ''} className="field" placeholder="Report title" required />
      <input name="reportType" defaultValue={report?.reportType ?? 'General Report'} className="field" placeholder="Report type" required />
      <select name="status" defaultValue={report?.status ?? 'Draft'} className="field">
        <option value="Draft">Draft</option>
        <option value="Final">Final</option>
      </select>
      <select name="employeeId" defaultValue={report?.employeeId ?? ''} className="field">
        <option value="">General report</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>{member.fullName}</option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input type="date" name="periodStart" defaultValue={report?.periodStart ?? ''} className="field" />
        <input type="date" name="periodEnd" defaultValue={report?.periodEnd ?? ''} className="field" />
      </div>
      <input name="folderUrl" type="url" defaultValue={payload.folderUrl ?? ''} className="field" placeholder="Folder or asset URL" />
      <textarea name="summary" defaultValue={payload.summary ?? ''} className="field min-h-20" placeholder="Summary" />
      <Button type="submit" size="sm">{report ? 'Save report' : 'Create report'}</Button>
    </form>
  );
}

function ReportRow({
  report,
  members,
  memberNames,
  canManage,
}: {
  report: ReportSnapshot;
  members: readonly User[];
  memberNames: ReadonlyMap<string, string>;
  canManage: boolean;
}) {
  const payload = parseReportPayload(report.payload);

  return (
    <tr id={`report-${report.id}`}>
      <td className="text-foreground text-xs font-semibold">{report.title}</td>
      <td className="text-xs">{report.reportType}</td>
      <td className="text-xs">{report.status}</td>
      <td className="text-xs">{report.employeeId ? memberNames.get(report.employeeId) ?? 'Unknown' : 'General'}</td>
      <td className="text-xs">{formatDate(report.periodStart)} – {formatDate(report.periodEnd)}</td>
      <td className="max-w-80 text-xs">
        {payload.folderUrl ? <Link href={payload.folderUrl} target="_blank" className="link">Open folder</Link> : payload.summary ?? '—'}
      </td>
      {canManage ? (
        <td className="min-w-[22rem] text-xs">
          <details>
            <summary className="text-primary cursor-pointer font-medium">Edit</summary>
            <ReportForm report={report} members={members} />
          </details>
          <form action={asFormAction(deleteReportSnapshotAction)} className="mt-2">
            <input type="hidden" name="id" value={report.id} />
            <Button type="submit" size="sm" variant="destructive">Delete</Button>
          </form>
        </td>
      ) : null}
    </tr>
  );
}

function parseReportPayload(payload: unknown): {
  summary: string | null;
  folderUrl: string | null;
} {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    return {
      summary: typeof record.summary === 'string' ? record.summary : null,
      folderUrl: typeof record.folderUrl === 'string' ? record.folderUrl : null,
    };
  }
  return { summary: null, folderUrl: null };
}

function entryDate(entry: KnowledgeEntry): string {
  if ('factDate' in entry) return entry.factDate;
  if ('ideaDate' in entry) return entry.ideaDate;
  return entry.suggestionDate;
}

function entryBody(entry: KnowledgeEntry): string {
  if ('fact' in entry) return entry.fact;
  if ('idea' in entry) return entry.idea;
  return entry.suggestion;
}

function asFormAction(
  action: (formData: FormData) => Promise<unknown>,
): ServerFormAction {
  return action as ServerFormAction;
}
