// PUBLIC client-safe exports: types and pure helpers only (no server imports).
export {
  contributionFromStates,
  rawContribution,
  RAW_CONTRIBUTION_COEFFICIENTS,
  RECORD_KINDS,
  rawSales,
  SALES_COEFFICIENTS,
  salesFromStates,
  SUPPORT_INPUT_VERSION,
  SUPPORT_INPUT_VERSIONS,
  type DatedRecordMetadata,
  type RecordKind,
  type SalesSource,
  type ScoreInputContext,
  type ValidationState,
} from './internal/contract';
export type {
  AttendanceDayInput,
  AttendanceInputContext,
  ContributionInputContext,
  ContributionObservation,
  FactorInput,
  InputContext,
} from './internal/input-context';
export {
  canCreateSupportRecord,
  canManageReportSnapshots,
  canManageSupportRecords,
  canValidateSupportRecord,
  type SupportKnowledgeModule,
} from './internal/permissions';
export type { DatedEntry, TaskChoice } from './components/dated-record-module';
