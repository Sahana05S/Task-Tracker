// PUBLIC client-safe API of the reports module: report view context, the live
// presentation model and its exports, and plain-language data-gap wording.

export { nextDate, previousDate, viewContext, viewQuery, type ViewContext } from '@/modules/reports/internal/presentation/context';
export { buildPresentation, type DatedCalculation, type LivePresentation, type PresentationResponse } from '@/modules/reports/internal/presentation/model';
export { csvCell, liveReport, reportCsv, reportText } from '@/modules/reports/internal/presentation/export';
export {
  compiledLogs,
  dailyReport,
  dailyReportText,
  formatDailyReport,
  reportsTab,
  type DailyReport,
} from '@/modules/reports/internal/presentation/daily-report';
export { calculationReasons, dataGaps, GAP_SENTENCE, plainReason, type DataGap } from '@/modules/reports/internal/presentation/plain-language';
export type { MonthArchive, MonthHistory } from '@/modules/reports/internal/month/archive';
export {
  DAILY_PERF_STATUS_LABEL,
  dailyPerfCsv,
  dailyPerfFilter,
  dailyPerfRows,
  monthToDate,
  seesTeamDetail,
  type DailyPerfFilter,
  type DailyPerfLog,
  type DailyPerfRow,
} from '@/modules/reports/internal/daily-perf-log';
