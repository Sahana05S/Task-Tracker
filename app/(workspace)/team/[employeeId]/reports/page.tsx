import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { requireProfile } from '@/lib/auth/profile';
import { canViewEmployeeReports } from '@/lib/team/permissions';
import { getEmployeeReportsData } from '@/lib/team/queries';
import {
  normalizeEmployeeIdParam,
  resolveEmployeeRouteState,
} from '@/lib/team/routes';
import { formatDate, formatNumeric } from '@/lib/tracker/format';

interface EmployeeReportsPageProps {
  params: Promise<{ employeeId: string }>;
}

export async function generateMetadata({
  params,
}: EmployeeReportsPageProps): Promise<Metadata> {
  const { employeeId } = await params;
  const normalized = normalizeEmployeeIdParam(employeeId);
  return { title: `${normalized ?? 'Employee'} Reports · TaskPulse` };
}

export default async function EmployeeReportsPage({
  params,
}: EmployeeReportsPageProps) {
  const viewer = await requireProfile();
  const { employeeId } = await params;
  const routeState = await resolveEmployeeRouteState(
    employeeId,
    getEmployeeReportsData,
  );

  if (routeState.status !== 'ready') notFound();

  const data = routeState.data;
  if (!canViewEmployeeReports(viewer, data.employee)) notFound();

  return (
    <>
      <WorkspaceHeader
        title={`${data.employee.fullName} reports`}
        description={`${data.period.label} · performance, chart links, stars, and saved reports`}
        actions={
          <Link
            href={`/team/${encodeURIComponent(data.employee.employeeId)}`}
            className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors"
          >
            Back to profile
          </Link>
        }
      />

      <div className="grid gap-4 px-4 py-4 lg:px-6">
        <section id="charts" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ChartCard
            label="Performance score"
            value={
              data.performance
                ? formatNumeric(data.performance.starScore)
                : '—'
            }
            detail="Current period composite score"
          />
          <ChartCard
            label="Productivity"
            value={
              data.performance?.productivity === null ||
              data.performance?.productivity === undefined
                ? '—'
                : `${formatNumeric(data.performance.productivity)}/h`
            }
            detail="Progress per eligible task hour"
          />
          <ChartCard
            label="Attendance"
            value={`${formatNumeric(data.attendanceSummary.attendanceHours)}h`}
            detail={`${formatNumeric(data.attendanceSummary.payableDays)} payable days`}
          />
          <ChartCard
            label="Daily stars"
            value={String(data.stars.length)}
            detail="Recorded daily star wins"
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Panel title="Score components">
            {data.scoreComponents.length === 0 ? (
              <EmptyText>No score component rows yet.</EmptyText>
            ) : (
              <div className="overflow-x-auto">
                <table className="sheet-grid min-w-[36rem]">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Metric</th>
                      <th className="text-right">Value</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.scoreComponents.map((component) => (
                      <tr key={component.id}>
                        <td className="text-xs">
                          {formatDate(component.scoreDate)}
                        </td>
                        <td className="text-xs">{component.metricKey}</td>
                        <td className="sheet-numeric text-xs">
                          {formatNumeric(component.metricValue)}
                        </td>
                        <td className="text-xs">
                          {component.sourceTable ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Daily star log">
            {data.stars.length === 0 ? (
              <EmptyText>No daily star records yet.</EmptyText>
            ) : (
              <div className="grid gap-2">
                {data.stars.map((star) => (
                  <div
                    key={star.id}
                    className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span>{formatDate(star.starDate)}</span>
                      <span className="font-semibold tabular">
                        {formatNumeric(star.score)}
                      </span>
                    </div>
                    {star.reason ? (
                      <p className="mt-1 text-xs text-slate-700">
                        {star.reason}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </section>

        <Panel title="Saved reports">
          {data.reports.length === 0 ? (
            <EmptyText>
              No saved report snapshots exist for this employee yet.
            </EmptyText>
          ) : (
            <div className="overflow-x-auto">
              <table className="sheet-grid min-w-[52rem]">
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Period</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.reports.map((report) => (
                    <tr key={report.id}>
                      <td className="text-xs font-medium text-slate-900">
                        {report.title}
                      </td>
                      <td className="text-xs">{report.reportType}</td>
                      <td className="text-xs">{report.status}</td>
                      <td className="text-xs">
                        {formatDate(report.periodStart)} –{' '}
                        {formatDate(report.periodEnd)}
                      </td>
                      <td className="text-xs">{formatDate(report.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

function ChartCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="metric-card">
      <dt className="text-muted-foreground text-[11px] font-medium">{label}</dt>
      <dd className="stat-figure">{value}</dd>
      <dd className="metric-trend">{detail}</dd>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="soft-card p-4">
      <h2 className="text-foreground text-sm font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}
