'use server';

// PUBLIC commands of the policies module. The role checks here only word the
// refusal; policy_command (migrations 56 and 58) enforces every rule.
import { revalidatePath } from 'next/cache';

import { isConflictCode } from '@/shared/commands/conflict';
import { readString, UUID_PATTERN } from '@/shared/forms/form-data';
import { getCurrentProfile } from '@/shared/session/profile';
import { createClient } from '@/shared/supabase/server';
import { kolkataDate } from '@/shared/time/kolkata';
import type { ActionResponse } from '@/types/tracker';

import { PolicyCommandError, policyCommand } from '@/modules/policies/internal/commands';
import { countOutcomes, evaluatePolicy } from '@/modules/policies/internal/evaluate';
import { parsePolicyForm } from '@/modules/policies/internal/input';
import { describeReason } from '@/modules/policies/internal/labels';
import { periodLabel, periodOf } from '@/modules/policies/internal/periods';
import { readDueWork, readEvaluations, readFacts, type EvaluationRow } from '@/modules/policies/internal/queries';
import { runDueItems } from '@/modules/policies/internal/run';
import type { Outcome } from '@/modules/policies/internal/types';

const ONLY_MD: ActionResponse<never> = { success: false, error: 'Only the managing director can change policies.', errorCode: 'forbidden' };

async function isDirector() {
  const actor = await getCurrentProfile();
  return Boolean(actor?.isActive && actor.role === 'managing_director');
}

function refusal(error: unknown): ActionResponse<never> {
  if (error instanceof PolicyCommandError) {
    const errorCode = isConflictCode(error.code) ? 'conflict' : error.code === '42501' ? 'forbidden' : error.code === '23514' ? 'validation' : 'unavailable';
    return { success: false, errorCode, error: errorCode === 'conflict' ? 'This policy changed meanwhile. Refresh the page and try again.' : error.message };
  }
  return { success: false, errorCode: 'unavailable', error: 'Policies are not available right now. Try again in a moment.' };
}

function identity(form: FormData) {
  const operationId = readString(form, 'operationId');
  return UUID_PATTERN.test(operationId) ? operationId : null;
}

/** Creates a policy, or revises one when the form carries its id and version. */
export async function savePolicyAction(form: FormData): Promise<ActionResponse<{ policyId: string; version: number }>> {
  if (!(await isDirector())) return ONLY_MD;
  const operationId = identity(form);
  if (!operationId) return { success: false, error: 'Refresh the page and try again.', errorCode: 'validation' };
  const parsed = parsePolicyForm(form);
  if (!parsed.ok) return { success: false, error: parsed.error, errorCode: 'validation' };
  const policyId = readString(form, 'policyId');
  const expectedVersion = Number(readString(form, 'expectedVersion'));
  if (policyId && (!UUID_PATTERN.test(policyId) || !Number.isSafeInteger(expectedVersion))) {
    return { success: false, error: 'Refresh the page and try again.', errorCode: 'validation' };
  }
  try {
    const db = await createClient();
    const result = policyId
      ? await policyCommand<{ policyId: string; version: number }>(db, 'revise', { ...parsed.value, policyId, expectedVersion, reason: readString(form, 'reason') }, operationId)
      : await policyCommand<{ policyId: string; version: number }>(db, 'create', { ...parsed.value }, operationId);
    revalidatePath('/policies');
    return { success: true, data: { policyId: result.policyId, version: result.version } };
  } catch (error) {
    return refusal(error);
  }
}

/** Pause, resume or archive a policy. */
export async function setPolicyStateAction(form: FormData): Promise<ActionResponse<{ version: number }>> {
  if (!(await isDirector())) return ONLY_MD;
  const command = readString(form, 'command');
  const policyId = readString(form, 'policyId');
  const expectedVersion = Number(readString(form, 'expectedVersion'));
  const operationId = identity(form);
  if (!['activate', 'deactivate', 'archive'].includes(command) || !UUID_PATTERN.test(policyId) || !Number.isSafeInteger(expectedVersion) || !operationId) {
    return { success: false, error: 'Refresh the page and try again.', errorCode: 'validation' };
  }
  try {
    const result = await policyCommand<{ version: number }>(await createClient(), command as 'activate' | 'deactivate' | 'archive',
      { policyId, expectedVersion }, operationId);
    revalidatePath('/policies');
    return { success: true, data: { version: result.version } };
  } catch (error) {
    return refusal(error);
  }
}

export interface EvaluateNowResult { periods: number; evaluated: number; changed: number; notified: number }

/**
 * "Evaluate now": the current and previous period of one policy, through the
 * same evaluator and command as the nightly worker. A failure is a recorded run.
 */
export async function evaluateNowAction(form: FormData): Promise<ActionResponse<EvaluateNowResult>> {
  if (!(await isDirector())) return { success: false, error: 'Only the managing director can evaluate policies.', errorCode: 'forbidden' };
  const policyId = readString(form, 'policyId');
  if (!UUID_PATTERN.test(policyId)) return { success: false, error: 'Refresh the page and try again.', errorCode: 'validation' };
  try {
    const db = await createClient();
    const due = await readDueWork(db, { policyId, limit: 2 });
    const run = await runDueItems(db, due.items, 'on_demand');
    revalidatePath('/policies');
    if (run.status === 'failed') {
      return { success: false, errorCode: 'unavailable', error: `The evaluation failed (${run.errorCode}). It is listed under Recent runs; try again later.` };
    }
    return { success: true, data: { periods: run.periods, evaluated: run.evaluated, changed: run.changed, notified: run.notified } };
  } catch (error) {
    return refusal(error);
  }
}

export interface PreviewRow { name: string; outcome: Outcome; reason: string | null }
export interface PreviewResult { periodLabel: string; final: boolean; members: number; met: number; notMet: number; unavailable: number; rows: PreviewRow[] }

/** What a draft would give for the current period, from the live facts; nothing is saved. */
export async function previewPolicyAction(form: FormData): Promise<ActionResponse<PreviewResult>> {
  if (!(await isDirector())) return ONLY_MD;
  if (!readString(form, 'name')) form.set('name', 'Preview');
  if (!readString(form, 'badge')) form.set('badge', 'Preview');
  const parsed = parsePolicyForm(form);
  if (!parsed.ok) return { success: false, error: parsed.error, errorCode: 'validation' };
  try {
    const period = periodOf(parsed.value.periodKind, kolkataDate());
    const facts = await readFacts(await createClient(), period.start, period.end);
    const result = evaluatePolicy(parsed.value, period, facts);
    const counts = countOutcomes(result.evaluations);
    const order: Record<Outcome, number> = { not_met: 0, unavailable: 1, met: 2 };
    return {
      success: true,
      data: {
        periodLabel: periodLabel(period), final: result.final, members: result.evaluations.length, ...counts,
        rows: result.evaluations
          .map((e) => ({ name: e.name, outcome: e.outcome, reason: e.reasons[0] ? describeReason(e.reasons[0]) : null }))
          .sort((a, b) => order[a.outcome] - order[b.outcome] || a.name.localeCompare(b.name)),
      },
    };
  } catch {
    return { success: false, errorCode: 'unavailable', error: 'The preview could not read this period’s attendance and logs. Try again in a moment.' };
  }
}

export interface ResultRow extends Pick<EvaluationRow, 'employeeId' | 'name' | 'outcome' | 'final' | 'withdrawn' | 'evaluatedAt'> { reason: string | null }

/** One policy's recorded results for a period (managers: everyone; members: themselves). */
export async function policyResultsAction(policyId: string, periodKey: string): Promise<ActionResponse<ResultRow[]>> {
  if (!UUID_PATTERN.test(policyId) || !/^\d{4}-(\d{2}(-\d{2})?|W\d{2})$/.test(periodKey)) {
    return { success: false, error: 'Refresh the page and try again.', errorCode: 'validation' };
  }
  try {
    const rows = await readEvaluations(await createClient(), policyId, periodKey);
    return {
      success: true,
      data: rows.map(({ employeeId, name, outcome, final, withdrawn, evaluatedAt, reasons }) => (
        { employeeId, name, outcome, final, withdrawn, evaluatedAt, reason: reasons[0] ? describeReason(reasons[0]) : null })),
    };
  } catch {
    return { success: false, errorCode: 'unavailable', error: 'Results are not available right now.' };
  }
}
