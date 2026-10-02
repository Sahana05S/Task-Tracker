import Link from 'next/link';

import {
  deleteKnowledgeEntryAction,
  deleteReportSnapshotAction,
  deleteSalesLogAction,
  saveKnowledgeEntryAction,
  saveReportSnapshotAction,
  saveSalesLogAction,
  toggleKnowledgeValidationAction,
} from '@/app/(workspace)/support/actions';
import { Button } from '@/components/ui/button';
import type { SupportKnowledgeModule } from '@/lib/support/permissions';
import { formatDate } from '@/lib/tracker/format';
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

export function KnowledgeModule({
  config,
  entries,
  members,
  currentUser,
  canManage,
}: {
  config: KnowledgeModuleConfig;
  entries: readonly KnowledgeEntry[];
  members: readonly User[];
  currentUser: User;
  canManage: boolean;
}) {
  const memberNames = new Map(members.map((member) => [member.id, member.fullName]));

  return (
    <div className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <aside className="soft-card h-fit p-4">
        <h2 className="text-foreground text-sm font-semibold">
          Add {config.singular}
        </h2>
        <KnowledgeForm
          config={config}
          members={members}
          currentUser={currentUser}
          canManage={canManage}
        />
      </aside>

      <section className="soft-card overflow-hidden">
        {entries.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            No {config.title.toLowerCase()} have been added for this period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="sheet-grid min-w-[72rem]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>{config.bodyLabel}</th>
                  <th>Employee</th>
                  <th>Folder / asset</th>
                  <th>Validated</th>
                  {canManage ? <th>Manager actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <KnowledgeRow
                    key={entry.id}
                    config={config}
                    entry={entry}
                    members={members}
                    memberNames={memberNames}
                    canManage={canManage}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function KnowledgeForm({
  config,
  members,
  currentUser,
  canManage,
  entry,
}: {
  config: KnowledgeModuleConfig;
  members: readonly User[];
  currentUser: User;
  canManage: boolean;
  entry?: KnowledgeEntry;
}) {
  const postedBy = entry?.postedBy ?? currentUser.id;

  return (
    <form action={asFormAction(saveKnowledgeEntryAction)} className="mt-3 grid gap-3">
      <input type="hidden" name="module" value={config.module} />
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-900">Date</span>
        <input
          type="date"
          name="entryDate"
          defaultValue={entry ? entryDate(entry) : new Date().toISOString().slice(0, 10)}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          required
        />
      </label>

      {canManage ? (
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-900">Employee</span>
          <select
            name="postedBy"
            defaultValue={postedBy ?? currentUser.id}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.fullName}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-900">{config.bodyLabel}</span>
        <textarea
          name="body"
          defaultValue={entry ? entryBody(entry) : ''}
          className="border-input bg-background min-h-24 rounded-md border px-3 py-2 text-sm"
          required
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-900">Folder or asset URL</span>
        <input
          name="folderUrl"
          type="url"
          defaultValue={entry?.folderUrl ?? ''}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          placeholder="Optional"
        />
      </label>

      <Button type="submit" size="sm">
        {entry ? 'Save changes' : `Add ${config.singular}`}
      </Button>
    </form>
  );
}

function KnowledgeRow({
  config,
  entry,
  members,
  memberNames,
  canManage,
}: {
  config: KnowledgeModuleConfig;
  entry: KnowledgeEntry;
  members: readonly User[];
  memberNames: ReadonlyMap<string, string>;
  canManage: boolean;
}) {
  return (
    <tr>
      <td className="text-xs whitespace-nowrap">{formatDate(entryDate(entry))}</td>
      <td className="max-w-96 text-xs">{entryBody(entry)}</td>
      <td className="text-xs">{entry.postedBy ? memberNames.get(entry.postedBy) ?? 'Unknown' : '—'}</td>
      <td className="text-xs">
        {entry.folderUrl ? (
          <Link href={entry.folderUrl} className="text-primary font-medium hover:underline" target="_blank">
            Open asset
          </Link>
        ) : (
          '—'
        )}
      </td>
      <td className="text-xs">{entry.isValidated ? 'Validated' : 'Needs review'}</td>
      {canManage ? (
        <td className="min-w-[24rem] text-xs">
          <details className="grid gap-2">
            <summary className="text-primary cursor-pointer font-medium">Edit</summary>
            <KnowledgeForm
              config={config}
              members={members}
              currentUser={members[0] ?? {
                id: entry.postedBy ?? '',
                employeeId: '',
                fullName: '',
                email: '',
                role: 'team_member',
                isActive: true,
                createdAt: '',
                updatedAt: '',
              }}
              canManage
              entry={entry}
            />
          </details>
          <div className="mt-2 flex flex-wrap gap-2">
            <form action={asFormAction(toggleKnowledgeValidationAction)}>
              <input type="hidden" name="module" value={config.module} />
              <input type="hidden" name="id" value={entry.id} />
              <input type="hidden" name="isValidated" value={String(!entry.isValidated)} />
              <Button type="submit" size="sm" variant="outline">
                {entry.isValidated ? 'Unvalidate' : 'Validate'}
              </Button>
            </form>
            <form action={asFormAction(deleteKnowledgeEntryAction)}>
              <input type="hidden" name="module" value={config.module} />
              <input type="hidden" name="id" value={entry.id} />
              <Button type="submit" size="sm" variant="destructive">
                Delete
              </Button>
            </form>
          </div>
        </td>
      ) : null}
    </tr>
  );
}

export function SalesLogModule({
  salesLogs,
  members,
  currentUser,
  canManage,
}: {
  salesLogs: readonly SalesLog[];
  members: readonly User[];
  currentUser: User;
  canManage: boolean;
}) {
  const memberNames = new Map(members.map((member) => [member.id, member.fullName]));

  return (
    <div className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <aside className="soft-card h-fit p-4">
        <h2 className="text-foreground text-sm font-semibold">Add sales log</h2>
        <SalesForm members={members} currentUser={currentUser} canManage={canManage} />
      </aside>
      <section className="soft-card overflow-hidden">
        {salesLogs.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No sales logs have been added for this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="sheet-grid min-w-[76rem]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Sales by</th>
                  <th>Client</th>
                  <th>Project location</th>
                  <th>Built-up area</th>
                  <th>Folder</th>
                  <th>New project</th>
                  <th>Basement payment</th>
                  <th>Notes</th>
                  {canManage ? <th>Manager actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {salesLogs.map((entry) => (
                  <SalesRow
                    key={entry.id}
                    entry={entry}
                    members={members}
                    currentUser={currentUser}
                    memberNames={memberNames}
                    canManage={canManage}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SalesForm({
  members,
  currentUser,
  canManage,
  entry,
}: {
  members: readonly User[];
  currentUser: User;
  canManage: boolean;
  entry?: SalesLog;
}) {
  return (
    <form action={asFormAction(saveSalesLogAction)} className="mt-3 grid gap-3">
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-900">Sale date</span>
        <input
          type="date"
          name="saleDate"
          defaultValue={entry?.saleDate ?? new Date().toISOString().slice(0, 10)}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          required
        />
      </label>
      {canManage ? (
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-900">Sales by</span>
          <select
            name="salesBy"
            defaultValue={entry?.salesBy ?? currentUser.id}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.fullName}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <input className="border-input bg-background h-9 rounded-md border px-3 text-sm" name="clientName" defaultValue={entry?.clientName ?? ''} placeholder="Client name" />
      <input className="border-input bg-background h-9 rounded-md border px-3 text-sm" name="projectLocation" defaultValue={entry?.projectLocation ?? ''} placeholder="Project location" />
      <input className="border-input bg-background h-9 rounded-md border px-3 text-sm" name="projectBuiltUpArea" defaultValue={entry?.projectBuiltUpArea ?? ''} placeholder="Built-up area" />
      <input className="border-input bg-background h-9 rounded-md border px-3 text-sm" name="projectFolderUrl" type="url" defaultValue={entry?.projectFolderUrl ?? ''} placeholder="Project folder URL" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isNewProject" defaultChecked={entry?.isNewProject ?? false} />
        New project
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="basementPaymentReceived" defaultChecked={entry?.basementPaymentReceived ?? false} />
        Basement payment received
      </label>
      <textarea className="border-input bg-background min-h-20 rounded-md border px-3 py-2 text-sm" name="notes" defaultValue={entry?.notes ?? ''} placeholder="Notes" />
      <Button type="submit" size="sm">{entry ? 'Save changes' : 'Add sales log'}</Button>
    </form>
  );
}

function SalesRow({
  entry,
  members,
  currentUser,
  memberNames,
  canManage,
}: {
  entry: SalesLog;
  members: readonly User[];
  currentUser: User;
  memberNames: ReadonlyMap<string, string>;
  canManage: boolean;
}) {
  return (
    <tr>
      <td className="text-xs">{formatDate(entry.saleDate)}</td>
      <td className="text-xs">{entry.salesBy ? memberNames.get(entry.salesBy) ?? 'Unknown' : '—'}</td>
      <td className="text-xs">{entry.clientName ?? '—'}</td>
      <td className="text-xs">{entry.projectLocation ?? '—'}</td>
      <td className="text-xs">{entry.projectBuiltUpArea ?? '—'}</td>
      <td className="text-xs">{entry.projectFolderUrl ? <Link href={entry.projectFolderUrl} target="_blank" className="text-primary font-medium hover:underline">Open folder</Link> : '—'}</td>
      <td className="text-xs">{entry.isNewProject ? 'Yes' : 'No'}</td>
      <td className="text-xs">{entry.basementPaymentReceived ? 'Yes' : 'No'}</td>
      <td className="max-w-72 text-xs">{entry.notes ?? '—'}</td>
      {canManage ? (
        <td className="min-w-[22rem] text-xs">
          <details>
            <summary className="text-primary cursor-pointer font-medium">Edit</summary>
            <SalesForm members={members} currentUser={currentUser} canManage entry={entry} />
          </details>
          <form action={asFormAction(deleteSalesLogAction)} className="mt-2">
            <input type="hidden" name="id" value={entry.id} />
            <Button type="submit" size="sm" variant="destructive">Delete</Button>
          </form>
        </td>
      ) : null}
    </tr>
  );
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
        <aside className="soft-card h-fit p-4">
          <h2 className="text-foreground text-sm font-semibold">Create report</h2>
          <ReportForm members={members} />
        </aside>
      ) : null}
      <section className="soft-card overflow-hidden xl:col-span-1">
        {reports.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No reports have been saved yet.</p>
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
      <input name="title" defaultValue={report?.title ?? ''} className="border-input bg-background h-9 rounded-md border px-3 text-sm" placeholder="Report title" required />
      <input name="reportType" defaultValue={report?.reportType ?? 'General Report'} className="border-input bg-background h-9 rounded-md border px-3 text-sm" placeholder="Report type" required />
      <select name="status" defaultValue={report?.status ?? 'Draft'} className="border-input bg-background h-9 rounded-md border px-3 text-sm">
        <option value="Draft">Draft</option>
        <option value="Final">Final</option>
      </select>
      <select name="employeeId" defaultValue={report?.employeeId ?? ''} className="border-input bg-background h-9 rounded-md border px-3 text-sm">
        <option value="">General report</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>{member.fullName}</option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input type="date" name="periodStart" defaultValue={report?.periodStart ?? ''} className="border-input bg-background h-9 rounded-md border px-3 text-sm" />
        <input type="date" name="periodEnd" defaultValue={report?.periodEnd ?? ''} className="border-input bg-background h-9 rounded-md border px-3 text-sm" />
      </div>
      <input name="folderUrl" type="url" defaultValue={payload.folderUrl ?? ''} className="border-input bg-background h-9 rounded-md border px-3 text-sm" placeholder="Folder or asset URL" />
      <textarea name="summary" defaultValue={payload.summary ?? ''} className="border-input bg-background min-h-20 rounded-md border px-3 py-2 text-sm" placeholder="Summary" />
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
    <tr>
      <td className="text-xs font-medium text-slate-900">{report.title}</td>
      <td className="text-xs">{report.reportType}</td>
      <td className="text-xs">{report.status}</td>
      <td className="text-xs">{report.employeeId ? memberNames.get(report.employeeId) ?? 'Unknown' : 'General'}</td>
      <td className="text-xs">{formatDate(report.periodStart)} – {formatDate(report.periodEnd)}</td>
      <td className="max-w-80 text-xs">
        {payload.folderUrl ? <Link href={payload.folderUrl} target="_blank" className="text-primary font-medium hover:underline">Open folder</Link> : payload.summary ?? '—'}
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
