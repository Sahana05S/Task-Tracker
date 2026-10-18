import type {
  DailyStarRecordRow,
  PerformanceScoreComponentRow,
  ReportSnapshotRow,
} from '@/types/database';
import type {
  DailyStarRecord,
  PerformanceScoreComponent,
  ReportSnapshot,
} from '@/types/tracker';

export const DAILY_STAR_COLUMNS =
  'id, star_date, user_id, score, productivity_component, progress_component, checklist_component, freshness_component, attendance_component, reason, is_override, override_by, created_at, updated_at' as const;

export const PERFORMANCE_COMPONENT_COLUMNS =
  'id, user_id, score_date, metric_key, metric_value, source_table, source_id, created_at' as const;

export const REPORT_SNAPSHOT_COLUMNS =
  'id, report_type, title, status, period_start, period_end, employee_id, payload, created_by, created_at, updated_at' as const;

export function mapDailyStarRecord(
  row: DailyStarRecordRow,
): DailyStarRecord {
  return {
    id: row.id,
    starDate: row.star_date,
    userId: row.user_id,
    score: row.score,
    productivityComponent: row.productivity_component,
    progressComponent: row.progress_component,
    checklistComponent: row.checklist_component,
    freshnessComponent: row.freshness_component,
    attendanceComponent: row.attendance_component,
    reason: row.reason,
    isOverride: row.is_override,
    overrideBy: row.override_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDailyStarRecords(
  rows: readonly DailyStarRecordRow[],
): DailyStarRecord[] {
  return rows.map(mapDailyStarRecord);
}

export function mapPerformanceScoreComponent(
  row: PerformanceScoreComponentRow,
): PerformanceScoreComponent {
  return {
    id: row.id,
    userId: row.user_id,
    scoreDate: row.score_date,
    metricKey: row.metric_key,
    metricValue: row.metric_value,
    sourceTable: row.source_table,
    sourceId: row.source_id,
    createdAt: row.created_at,
  };
}

export function mapPerformanceScoreComponents(
  rows: readonly PerformanceScoreComponentRow[],
): PerformanceScoreComponent[] {
  return rows.map(mapPerformanceScoreComponent);
}

export function mapReportSnapshot(row: ReportSnapshotRow): ReportSnapshot {
  return {
    id: row.id,
    reportType: row.report_type,
    title: row.title,
    status: row.status,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    employeeId: row.employee_id,
    payload: row.payload,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapReportSnapshots(
  rows: readonly ReportSnapshotRow[],
): ReportSnapshot[] {
  return rows.map(mapReportSnapshot);
}
