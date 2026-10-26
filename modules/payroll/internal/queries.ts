import 'server-only';

import { createClient } from '@/shared/supabase/server';
import { isMissingFunctionError } from '@/shared/supabase/schema-errors';

import { mapEmployeePayFile, mapPayrollMonth, mapPayrollSetup, type EmployeePayFile, type PayrollMonth, type PayrollSetup } from './mappers';
import { mapSalaryHistory, type SalaryHistory } from './trend';

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

/** M19 (migration 79): a person's finalised months and salary revisions, for the graph. */
function historyFailure(error: { code?: string; message: string }): PayrollRead<never> {
  if (isMissingFunctionError(error)) return { ok: false, reason: 'unavailable', error: 'Salary history needs the latest database update (migration 79).' };
  return failure(error);
}

/** The signed-in member's own finalised months (any active member). */
export async function readMySalary(): Promise<PayrollRead<SalaryHistory>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('payroll_my_salary');
  return error ? historyFailure(error) : { ok: true, data: mapSalaryHistory(data) };
}

/** Anyone's finalised months in the company (managing director only). */
export async function readSalaryHistory(userId: string): Promise<PayrollRead<SalaryHistory>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('payroll_salary_history', { p_user: userId });
  return error ? historyFailure(error) : { ok: true, data: mapSalaryHistory(data) };
}
