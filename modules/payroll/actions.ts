'use server';

import { revalidatePath } from 'next/cache';

import { runPayrollCommand, runPayrollMonthCommand } from '@/modules/payroll/internal/commands';
import { parsePayrollCommand, parsePayrollMonthCommand } from '@/modules/payroll/internal/input';
import { canManagePayroll } from '@/modules/payroll/internal/permissions';
import { resolveActor } from '@/shared/session/actor';
import type { ActionResponse } from '@/types/tracker';

/**
 * PUBLIC Server Actions for Payroll. The role check only gives a friendly
 * message; `payroll_command` and `payroll_month_command` enforce it in the
 * database.
 */

export type PayrollActionState = ActionResponse<{ version: number }>;

const FORBIDDEN = 'Only the managing director can change payroll.';

/** Saves one pay-file entry or payroll setting (see `PayrollSection`). */
export async function savePayrollEntry(_prev: PayrollActionState | null, form: FormData): Promise<PayrollActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManagePayroll(actor.profile.role)) return { success: false, error: FORBIDDEN, errorCode: 'forbidden' };
  const input = parsePayrollCommand(form);
  if (!input.ok) return { success: false, error: input.error, errorCode: 'validation' };
  const result = await runPayrollCommand(input.value);
  if (!result.ok) return { success: false, error: result.error };
  revalidatePath('/payroll', 'layout');
  return { success: true, data: { version: result.version } };
}

/** Finalises a month's salaries (frozen records) or reopens a finalised month with a reason. */
export async function payrollMonthAction(_prev: PayrollActionState | null, form: FormData): Promise<PayrollActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManagePayroll(actor.profile.role)) return { success: false, error: FORBIDDEN, errorCode: 'forbidden' };
  const input = parsePayrollMonthCommand(form);
  if (!input.ok) return { success: false, error: input.error, errorCode: 'validation' };
  const result = await runPayrollMonthCommand(input.value);
  if (!result.ok) return { success: false, error: result.error };
  revalidatePath('/payroll', 'layout');
  return { success: true, data: { version: result.version } };
}
