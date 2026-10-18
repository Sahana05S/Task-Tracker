import { fetchTeamSummary } from '@/shared/read-models/team-summary';
import { resolvePeriod, type AnalyticsPeriod } from '@/shared/time/period';
import type { Json } from '@/types/database';

/**
 * Team report-snapshot counts for a calendar month, read from the shared
 * `team_summary_inputs` result. PRIVATE. The private summary counts every
 * snapshot, including ones the caller's RLS view of `report_snapshots` hides.
 */

export interface ReportSummary {
  total: number;
  final: number;
  draft: number;
  employeeReports: number;
  generalReports: number;
}

type ObjectValue = { [key: string]: Json | undefined };

function object(value: Json | undefined): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid team summary response.');
  return value;
}

function number(value: Json | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid summary number.');
  return value;
}

export async function getReportSummary(period: AnalyticsPeriod): Promise<ReportSummary> {
  const canonical = resolvePeriod(period.year, period.month);
  if (period.startDate !== canonical.startDate || period.endDate !== canonical.endDate) {
    throw new Error('Team summaries require a complete calendar month.');
  }
  const report = object(object(await fetchTeamSummary(period.year, period.month)).report_summary);
  return {
    total: number(report.total),
    final: number(report.final),
    draft: number(report.draft),
    employeeReports: number(report.employeeReports),
    generalReports: number(report.generalReports),
  };
}
