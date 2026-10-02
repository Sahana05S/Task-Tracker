import { describe, expect, it } from 'vitest';

import {
  summarizeEmployeeSupport,
  summarizeSupport,
} from '@/lib/support/queries';
import type {
  DailyFact,
  Idea,
  ReportSnapshot,
  SalesLog,
  Suggestion,
} from '@/types/tracker';

function fact(overrides: Partial<DailyFact> = {}): DailyFact {
  return {
    id: overrides.id ?? 'fact-1',
    factDate: overrides.factDate ?? '2026-09-01',
    postedBy: overrides.postedBy ?? 'user-1',
    fact: overrides.fact ?? 'Fact',
    folderUrl: overrides.folderUrl ?? null,
    isValidated: overrides.isValidated ?? false,
    validatedBy: overrides.validatedBy ?? null,
    createdAt: overrides.createdAt ?? '2026-09-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-09-01T00:00:00Z',
  };
}

function idea(overrides: Partial<Idea> = {}): Idea {
  return {
    id: overrides.id ?? 'idea-1',
    ideaDate: overrides.ideaDate ?? '2026-09-01',
    postedBy: overrides.postedBy ?? 'user-1',
    idea: overrides.idea ?? 'Idea',
    folderUrl: overrides.folderUrl ?? null,
    isValidated: overrides.isValidated ?? false,
    validatedBy: overrides.validatedBy ?? null,
    createdAt: overrides.createdAt ?? '2026-09-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-09-01T00:00:00Z',
  };
}

function suggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: overrides.id ?? 'suggestion-1',
    suggestionDate: overrides.suggestionDate ?? '2026-09-01',
    postedBy: overrides.postedBy ?? 'user-1',
    suggestion: overrides.suggestion ?? 'Suggestion',
    folderUrl: overrides.folderUrl ?? null,
    isValidated: overrides.isValidated ?? false,
    validatedBy: overrides.validatedBy ?? null,
    createdAt: overrides.createdAt ?? '2026-09-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-09-01T00:00:00Z',
  };
}

function sale(overrides: Partial<SalesLog> = {}): SalesLog {
  return {
    id: overrides.id ?? 'sale-1',
    saleDate: overrides.saleDate ?? '2026-09-01',
    salesBy: overrides.salesBy ?? 'user-1',
    projectBuiltUpArea: overrides.projectBuiltUpArea ?? null,
    projectLocation: overrides.projectLocation ?? null,
    clientName: overrides.clientName ?? null,
    projectFolderUrl: overrides.projectFolderUrl ?? null,
    isNewProject: overrides.isNewProject ?? false,
    basementPaymentReceived: overrides.basementPaymentReceived ?? false,
    notes: overrides.notes ?? null,
    createdAt: overrides.createdAt ?? '2026-09-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-09-01T00:00:00Z',
  };
}

function report(overrides: Partial<ReportSnapshot> = {}): ReportSnapshot {
  return {
    id: overrides.id ?? 'report-1',
    reportType: overrides.reportType ?? 'General',
    title: overrides.title ?? 'Report',
    status: overrides.status ?? 'Draft',
    periodStart: overrides.periodStart ?? null,
    periodEnd: overrides.periodEnd ?? null,
    employeeId: overrides.employeeId ?? null,
    payload: overrides.payload ?? {},
    createdBy: overrides.createdBy ?? null,
    createdAt: overrides.createdAt ?? '2026-09-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-09-01T00:00:00Z',
  };
}

describe('support summaries', () => {
  it('summarizes workbook support modules', () => {
    const summary = summarizeSupport({
      facts: [
        fact({ isValidated: true, folderUrl: 'https://example.com' }),
        fact({ id: 'fact-2' }),
      ],
      ideas: [idea({ isValidated: true })],
      suggestions: [suggestion({ folderUrl: 'https://example.com' })],
      salesLogs: [
        sale({ isNewProject: true, basementPaymentReceived: true }),
        sale({ id: 'sale-2' }),
      ],
      reports: [
        report({ status: 'Final', employeeId: 'user-1' }),
        report({ id: 'report-2', status: 'Draft', employeeId: null }),
      ],
    });

    expect(summary).toEqual({
      facts: { total: 2, validated: 1, withFolder: 1 },
      ideas: { total: 1, validated: 1, withFolder: 0 },
      suggestions: { total: 1, validated: 0, withFolder: 1 },
      sales: { total: 2, newProjects: 1, basementPayments: 1 },
      reports: {
        total: 2,
        final: 1,
        draft: 1,
        employeeReports: 1,
        generalReports: 1,
      },
    });
  });

  it('summarizes support contributions for a single employee', () => {
    const summary = summarizeEmployeeSupport({
      userId: 'user-1',
      facts: [
        fact({ postedBy: 'user-1', isValidated: true }),
        fact({ id: 'fact-2', postedBy: 'user-2', isValidated: true }),
      ],
      ideas: [idea({ postedBy: 'user-1' })],
      suggestions: [suggestion({ postedBy: 'user-1', isValidated: true })],
      salesLogs: [sale({ salesBy: 'user-1' }), sale({ id: 'sale-2', salesBy: 'user-2' })],
      reports: [report({ employeeId: 'user-1' }), report({ id: 'report-2', employeeId: null })],
    });

    expect(summary).toEqual({
      facts: 1,
      ideas: 1,
      suggestions: 1,
      salesLogs: 1,
      reports: 1,
      validatedContributions: 2,
    });
  });
});
