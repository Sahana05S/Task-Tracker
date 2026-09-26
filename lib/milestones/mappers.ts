import type { CompanyMilestoneRow, CompanyStatementRow } from '@/types/database';
import type { CompanyMilestone, CompanyStatement } from '@/types/tracker';

/**
 * Row-to-domain conversion for the two tables in
 * `04_milestones_and_vision.sql`.
 *
 * Same boundary as `lib/supabase/mappers.ts` and `lib/tasks/mappers.ts`:
 * components never see a snake_case row, and a column rename surfaces as a
 * compile error here rather than as `undefined` in the UI.
 */

/** Columns to select for a full `CompanyStatement`. */
export const COMPANY_STATEMENT_COLUMNS =
  'id, key_name, title, statement, subtext, updated_at, updated_by' as const;

/** Columns to select for a full `CompanyMilestone`. */
export const COMPANY_MILESTONE_COLUMNS =
  'id, title, description, status, owner_id, delivered_count, target_count, due_date, created_at' as const;

export function mapCompanyStatement(row: CompanyStatementRow): CompanyStatement {
  return {
    id: row.id,
    keyName: row.key_name,
    title: row.title,
    statement: row.statement,
    subtext: row.subtext,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export function mapCompanyStatements(
  rows: readonly CompanyStatementRow[],
): CompanyStatement[] {
  return rows.map(mapCompanyStatement);
}

export function mapCompanyMilestone(row: CompanyMilestoneRow): CompanyMilestone {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    ownerId: row.owner_id,
    deliveredCount: row.delivered_count,
    targetCount: row.target_count,
    dueDate: row.due_date,
    createdAt: row.created_at,
  };
}

export function mapCompanyMilestones(
  rows: readonly CompanyMilestoneRow[],
): CompanyMilestone[] {
  return rows.map(mapCompanyMilestone);
}
