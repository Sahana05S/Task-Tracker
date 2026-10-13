import { kolkataDate } from '@/lib/tasks/contract';
import { loadContributionContext, type ContributionInputContext } from '@/lib/support/input-context';
import type { TaskChoice } from '@/components/support/dated-record-module';
import { getTeamSummaryInputs } from '@/lib/analytics/summary-inputs';
import { currentPeriod, type AnalyticsPeriod } from '@/lib/analytics/engine';
import {
  DAILY_FACT_COLUMNS,
  IDEA_COLUMNS,
  mapDailyFact,
  mapIdea,
  mapReportSnapshot,
  mapSalesLog,
  mapSuggestion,
  REPORT_SNAPSHOT_COLUMNS,
  SALES_LOG_COLUMNS,
  SUGGESTION_COLUMNS,
} from '@/lib/support/mappers';
import { mapUser, USER_COLUMNS } from '@/lib/supabase/mappers';
import { createClient } from '@/lib/supabase/server';
import type {
  DailyFact,
  Idea,
  ReportSnapshot,
  SalesLog,
  Suggestion,
  User,
} from '@/types/tracker';

export interface SupportModuleData {
  readonly period: AnalyticsPeriod;
  readonly tasks: readonly TaskChoice[];
  readonly inputContext: ContributionInputContext;
  readonly members: readonly User[];
  readonly facts: readonly DailyFact[];
  readonly ideas: readonly Idea[];
  readonly suggestions: readonly Suggestion[];
  readonly salesLogs: readonly SalesLog[];
  readonly reports: readonly ReportSnapshot[];
  readonly summary: SupportSummary;
}

export interface SupportSummary {
  readonly facts: ModuleSummary;
  readonly ideas: ModuleSummary;
  readonly suggestions: ModuleSummary;
  readonly sales: {
    readonly total: number;
    readonly newProjects: number;
    readonly basementPayments: number;
  };
  readonly reports: {
    readonly total: number;
    readonly final: number;
    readonly draft: number;
    readonly employeeReports: number;
    readonly generalReports: number;
  };
}

export interface ModuleSummary {
  readonly total: number;
  readonly validated: number;
  readonly withFolder: number;
}

export interface EmployeeSupportSummary {
  readonly facts: number;
  readonly ideas: number;
  readonly suggestions: number;
  readonly salesLogs: number;
  readonly reports: number;
  readonly validatedContributions: number;
}

export async function getSupportModuleData(
  period: AnalyticsPeriod = currentPeriod(new Date(kolkataDate()+'T12:00:00Z')),
): Promise<SupportModuleData> {
  const supabase = await createClient();
  const [memberResult, factRows, ideaRows, suggestionRows, salesRows, reportRows, summaryInputs, taskChoices] =
    await Promise.all([
      supabase.from('users').select(USER_COLUMNS).order('full_name'),
      selectOrEmpty(
        supabase
          .from('daily_facts')
          .select(DAILY_FACT_COLUMNS)
          .gte('fact_date', period.startDate)
          .lte('fact_date', period.endDate)
          .order('fact_date', { ascending: false }),
      ),
      selectOrEmpty(
        supabase
          .from('ideas')
          .select(IDEA_COLUMNS)
          .gte('idea_date', period.startDate)
          .lte('idea_date', period.endDate)
          .order('idea_date', { ascending: false }),
      ),
      selectOrEmpty(
        supabase
          .from('suggestions')
          .select(SUGGESTION_COLUMNS)
          .gte('suggestion_date', period.startDate)
          .lte('suggestion_date', period.endDate)
          .order('suggestion_date', { ascending: false }),
      ),
      selectOrEmpty(
        supabase
          .from('sales_logs')
          .select(SALES_LOG_COLUMNS)
          .gte('sale_date', period.startDate)
          .lte('sale_date', period.endDate)
          .order('sale_date', { ascending: false }),
      ),
      selectOrEmpty(
        supabase
          .from('report_snapshots')
          .select(REPORT_SNAPSHOT_COLUMNS)
          .or(`period_start.is.null,period_start.lte.${period.endDate}`)
          .or(`period_end.is.null,period_end.gte.${period.startDate}`)
          .order('created_at', { ascending: false }),
      ),
      getTeamSummaryInputs(period),
      supabase.from('tasks').select('id, task_tag, title'),
    ]);

  if (memberResult.error) {
    throw new Error(`Failed to load members: ${memberResult.error.message}`);
  }

  if(taskChoices.error)throw new Error(`Failed to load related tasks: ${taskChoices.error.message}`);
  const endExclusive=new Date(`${period.endDate}T00:00:00Z`);endExclusive.setUTCDate(endExclusive.getUTCDate()+1);
  const inputContext=await loadContributionContext(supabase,period.startDate,endExclusive.toISOString().slice(0,10),new Date().toISOString());
  const facts = factRows.map(mapDailyFact);
  const ideas = ideaRows.map(mapIdea);
  const suggestions = suggestionRows.map(mapSuggestion);
  const salesLogs = salesRows.map(mapSalesLog);
  const reports = reportRows.map(mapReportSnapshot);

  return {
    period,
    inputContext,
    tasks:taskChoices.data.map(t=>({id:t.id,tag:t.task_tag,title:t.title})),
    members: memberResult.data.map(mapUser),
    facts,
    ideas,
    suggestions,
    salesLogs,
    reports,
    summary: { ...summarizeSupport({ facts, ideas, suggestions, salesLogs, reports }), reports: summaryInputs.reportSummary },
  };
}

export function summarizeSupport({
  facts,
  ideas,
  suggestions,
  salesLogs,
  reports,
}: {
  facts: readonly DailyFact[];
  ideas: readonly Idea[];
  suggestions: readonly Suggestion[];
  salesLogs: readonly SalesLog[];
  reports: readonly ReportSnapshot[];
}): SupportSummary {
  return {
    facts: summarizeKnowledge(
      facts.map((entry) => ({
        isValidated: entry.isValidated,
        folderUrl: entry.folderUrl,
      })),
    ),
    ideas: summarizeKnowledge(
      ideas.map((entry) => ({
        isValidated: entry.isValidated,
        folderUrl: entry.folderUrl,
      })),
    ),
    suggestions: summarizeKnowledge(
      suggestions.map((entry) => ({
        isValidated: entry.isValidated,
        folderUrl: entry.folderUrl,
      })),
    ),
    sales: {
      total: salesLogs.length,
      newProjects: salesLogs.filter((entry) => entry.isNewProject).length,
      basementPayments: salesLogs.filter((entry) => entry.basementPaymentReceived)
        .length,
    },
    reports: {
      total: reports.length,
      final: reports.filter((report) => report.status === 'Final').length,
      draft: reports.filter((report) => report.status === 'Draft').length,
      employeeReports: reports.filter((report) => report.employeeId !== null)
        .length,
      generalReports: reports.filter((report) => report.employeeId === null)
        .length,
    },
  };
}

export function summarizeEmployeeSupport({
  userId,
  facts,
  ideas,
  suggestions,
  salesLogs,
  reports,
}: {
  userId: string;
  facts: readonly DailyFact[];
  ideas: readonly Idea[];
  suggestions: readonly Suggestion[];
  salesLogs: readonly SalesLog[];
  reports: readonly ReportSnapshot[];
}): EmployeeSupportSummary {
  const employeeFacts = facts.filter((entry) => entry.postedBy === userId);
  const employeeIdeas = ideas.filter((entry) => entry.postedBy === userId);
  const employeeSuggestions = suggestions.filter(
    (entry) => entry.postedBy === userId,
  );

  return {
    facts: employeeFacts.length,
    ideas: employeeIdeas.length,
    suggestions: employeeSuggestions.length,
    salesLogs: salesLogs.filter((entry) => entry.salesBy === userId).length,
    reports: reports.filter((report) => report.employeeId === userId).length,
    validatedContributions: [
      ...employeeFacts,
      ...employeeIdeas,
      ...employeeSuggestions,
    ].filter((entry) => entry.isValidated).length,
  };
}

function summarizeKnowledge(
  entries: readonly {
    readonly isValidated: boolean;
    readonly folderUrl: string | null;
  }[],
): ModuleSummary {
  return {
    total: entries.length,
    validated: entries.filter((entry) => entry.isValidated).length,
    withFolder: entries.filter((entry) => entry.folderUrl !== null).length,
  };
}

async function selectOrEmpty<T>(
  query: PromiseLike<{
    data: T[] | null;
    error: { code?: string; message: string } | null;
  }>,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}
