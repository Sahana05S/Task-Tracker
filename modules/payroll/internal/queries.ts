import 'server-only';

import { createClient } from '@/shared/supabase/server';
import { isMissingFunctionError } from '@/shared/supabase/schema-errors';

import { mapEmployeePayFile, mapPayrollMonth, mapPayrollSetup, type EmployeePayFile, type PayrollMonth, type PayrollSetup } from './mappers';

/**
 * Payroll reads (migration 74). PRIVATE. Each function refuses anyone but an
 * active managing director; `unavailable` means the database predates 74.
 */

export type PayrollRead<T> = { ok: true; data: T } | { ok: false; reason: 'unavailable' | 'forbidden' | 'not_found'; error: string };

function failure(error: { code?: string; message: string }): PayrollRead<never> {
  if (isMissingFunctionError(error)) return { ok: false, reason: 'unavailable', error: 'Payroll needs the latest database update (migration 74).' };
  if (error.code === '42501') return { ok: false, reason: 'forbidden', error: 'Only the managing director can see payroll.' };
  if (error.code === 'P0002') return { ok: false, reason: 'not_found', error: error.message };
  throw new Error(`Payroll could not be loaded: ${error.message}`);
}

export async function readPayrollSetup(): Promise<PayrollRead<PayrollSetup>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('payroll_setup');
  return error ? failure(error) : { ok: true, data: mapPayrollSetup(data) };
}

export async function readPayrollMonth(period: string): Promise<PayrollRead<PayrollMonth>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('payroll_month', { p_period: period });
  return error ? failure(error) : { ok: true, data: mapPayrollMonth(data) };
}

export async function readEmployeePayFile(userId: string, period: string): Promise<PayrollRead<EmployeePayFile>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('payroll_employee_file', { p_user: userId, p_period: period });
  return error ? failure(error) : { ok: true, data: mapEmployeePayFile(data) };
}
