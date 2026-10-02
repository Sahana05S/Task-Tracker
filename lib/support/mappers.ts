import type {
  DailyFactRow,
  IdeaRow,
  ReportSnapshotRow,
  SalesLogRow,
  SuggestionRow,
} from '@/types/database';
import type {
  DailyFact,
  Idea,
  ReportSnapshot,
  SalesLog,
  Suggestion,
} from '@/types/tracker';

export const DAILY_FACT_COLUMNS =
  'id, fact_date, posted_by, fact, folder_url, is_validated, validated_by, created_at, updated_at' as const;

export const IDEA_COLUMNS =
  'id, idea_date, posted_by, idea, folder_url, is_validated, validated_by, created_at, updated_at' as const;

export const SUGGESTION_COLUMNS =
  'id, suggestion_date, posted_by, suggestion, folder_url, is_validated, validated_by, created_at, updated_at' as const;

export const SALES_LOG_COLUMNS =
  'id, sale_date, sales_by, project_built_up_area, project_location, client_name, project_folder_url, is_new_project, basement_payment_received, notes, created_at, updated_at' as const;

export const REPORT_SNAPSHOT_COLUMNS =
  'id, report_type, title, status, period_start, period_end, employee_id, payload, created_by, created_at, updated_at' as const;

export function mapDailyFact(row: DailyFactRow): DailyFact {
  return {
    id: row.id,
    factDate: row.fact_date,
    postedBy: row.posted_by,
    fact: row.fact,
    folderUrl: row.folder_url,
    isValidated: row.is_validated,
    validatedBy: row.validated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapIdea(row: IdeaRow): Idea {
  return {
    id: row.id,
    ideaDate: row.idea_date,
    postedBy: row.posted_by,
    idea: row.idea,
    folderUrl: row.folder_url,
    isValidated: row.is_validated,
    validatedBy: row.validated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSuggestion(row: SuggestionRow): Suggestion {
  return {
    id: row.id,
    suggestionDate: row.suggestion_date,
    postedBy: row.posted_by,
    suggestion: row.suggestion,
    folderUrl: row.folder_url,
    isValidated: row.is_validated,
    validatedBy: row.validated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSalesLog(row: SalesLogRow): SalesLog {
  return {
    id: row.id,
    saleDate: row.sale_date,
    salesBy: row.sales_by,
    projectBuiltUpArea: row.project_built_up_area,
    projectLocation: row.project_location,
    clientName: row.client_name,
    projectFolderUrl: row.project_folder_url,
    isNewProject: row.is_new_project,
    basementPaymentReceived: row.basement_payment_received,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
