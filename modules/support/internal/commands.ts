import type { PostgrestError } from '@supabase/supabase-js';

import { createClient } from '@/shared/supabase/server';

import type { ReportSnapshotInput } from './input';

export type CommandResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

/** Inserts a new report snapshot, or updates it when `input.id` is set. */
export async function upsertReportSnapshot(
  input: ReportSnapshotInput,
  createdBy: string,
): Promise<CommandResult<{ id: string }>> {
  const payload = {
    title: input.title,
    report_type: input.reportType,
    status: input.status,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    employee_id: input.employeeId,
    payload: {
      summary: input.summary,
      folderUrl: input.folderUrl,
    },
    created_by: createdBy,
  };

  const supabase = await createClient();
  const { data, error } = input.id
    ? await supabase.from('report_snapshots').update(payload).eq('id', input.id).select('id').single()
    : await supabase.from('report_snapshots').insert(payload).select('id').single();

  if (error) return { ok: false, error: describeError(error) };
  return { ok: true, value: { id: data.id } };
}

export async function deleteReportSnapshot(id: string): Promise<CommandResult<{ id: string }>> {
  const supabase = await createClient();
  const { error } = await supabase.from('report_snapshots').delete().eq('id', id);
  if (error) return { ok: false, error: describeError(error) };
  return { ok: true, value: { id } };
}

function describeError(error: PostgrestError): string {
  if (error.code === '42501') return 'You do not have permission for that change.';
  if (error.code === '23503') return 'A linked employee no longer exists.';
  if (error.code === '23514') return 'The submitted dates are invalid.';
  return error.message;
}
