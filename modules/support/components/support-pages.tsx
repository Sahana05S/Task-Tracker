import type { ContributionInputContext } from '../internal/input-context';
import { DatedRecordModule, type TaskChoice } from './dated-record-module';
import { SaleProofs } from './sale-proofs';
import type { SaleProofState } from '../internal/sales-proofs';
import { DeleteReportButton, ReportForm } from './report-forms';
import Link from 'next/link';
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
import { EmptyState } from '@/shared/ui/mission-ui';

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

export function SalesLogModule({salesLogs,members,currentUser,tasks=[],inputContext,proofs={}}:{salesLogs:readonly SalesLog[];members:readonly User[];currentUser:User;canManage:boolean;tasks?:readonly TaskChoice[];inputContext?:ContributionInputContext;proofs?:Readonly<Record<string,SaleProofState>>}) {
 const extras=Object.fromEntries(Object.entries(proofs).map(([id,state])=>[id,<SaleProofs key={id} saleId={id} canAdd={state.canAdd} proofs={state.proofs}/>]));
 return <DatedRecordModule kind="sale" extras={extras} members={members} user={currentUser} tasks={tasks} inputContext={inputContext} entries={salesLogs.map(e=>({...e,businessDate:e.saleDate,authorId:e.salesBy,content:e.notes,assetUrl:e.projectFolderUrl,extras:{project_built_up_area:e.projectBuiltUpArea,project_location:e.projectLocation,client_name:e.clientName,is_new_project:e.isNewProject,basement_payment_received:e.basementPaymentReceived}}))}/>;
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
    // The table takes the full width; creating a report opens above it, so the
    // wide table never shares its row with a form (or a missing one).
    <div className="grid gap-4">
      {canManage ? (
        <details className="soft-card group p-5 sm:p-6">
          <summary className="text-foreground cursor-pointer text-base font-bold tracking-tight">Create report</summary>
          <div className="mt-4"><ReportForm members={members} /></div>
        </details>
      ) : null}
      <section className="soft-card-clip">
        {reports.length === 0 ? (
          <EmptyState title="No saved reports yet" className="m-4">The managing director saves a month&apos;s report here, with the figures as they were.</EmptyState>
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
            <ReportForm report={report} members={members} folderUrl={payload.folderUrl} summary={payload.summary} />
          </details>
          <DeleteReportButton id={report.id} title={report.title} />
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

