import { createClient } from '@/shared/supabase/server';
import { isConflictCode } from '@/shared/commands/conflict';
import { parsePreview, type ToolsPreview } from '@/modules/tasks/internal/tools/contract';
import type { CommittedItems, Reply } from '@/modules/tasks/internal/tools/commands';
import { monthBounds, type MonthKey, type PreviousMission, type SetupMember, type SetupStanding } from '@/modules/tasks/internal/tools/month-setup';
import type { Json } from '@/types/database';

/** Month setup reads and commands (migration 55). PRIVATE. */

export interface MonthSetupContext {
  month: MonthKey;
  today: string;
  /** The current month or the next one. */
  allowed: boolean;
  carryoverAvailable: boolean;
  /** Missions already dated in the month (any source). */
  existingCount: number;
  /** Missions earlier setups of this month created. */
  setUpCount: number;
  directorId: string | null;
  members: SetupMember[];
  standing: (SetupStanding & { setUp: string[] })[];
  phasesSetUp: number[];
  previous: PreviousMission[];
  previousTruncated: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function parseContext(value: unknown): MonthSetupContext {
  if (!isRecord(value) || typeof value.month !== 'string' || !Array.isArray(value.members) || !Array.isArray(value.standing) || !Array.isArray(value.previous)) {
    throw new Error('Month setup is unavailable.');
  }
  const context = value as unknown as MonthSetupContext;
  return {
    ...context,
    previous: context.previous.map((mission) => ({ ...mission, progress: mission.progress === null ? null : Number(mission.progress) })),
  };
}

export async function getMonthSetupContext(month: MonthKey): Promise<MonthSetupContext> {
  const client = await createClient();
  const { data, error } = await client.rpc('month_setup_context', { p_month: monthBounds(month).start });
  if (error) throw new Error(`Month setup unavailable: ${error.message}`);
  return parseContext(data);
}

/** Missions dated in a month that are not archived (the banner's "has no missions"). */
export async function countMissionsInMonth(month: MonthKey): Promise<number> {
  const { start, end } = monthBounds(month);
  const client = await createClient();
  const { count, error } = await client
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .gte('assigned_date', start)
    .lte('assigned_date', end)
    .is('archived_effective_date', null);
  if (error) throw new Error(`Mission count unavailable: ${error.message}`);
  return count ?? 0;
}

export async function requestMonthSetupPreview(payload: Record<string, Json>): Promise<Reply<ToolsPreview>> {
  const client = await createClient();
  const { data, error } = await client.rpc('month_setup_preview', { p_payload: payload });
  if (error) return { success: false, error: error.message };
  try {
    return { success: true, data: parsePreview(data) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Preview unavailable.' };
  }
}

export async function commitMonthSetupPreview(previewId: string, operationId: string): Promise<Reply<CommittedItems>> {
  const client = await createClient();
  const { data, error } = await client.rpc('month_setup_commit', { p_preview: previewId, p_operation: operationId });
  if (error) return { success: false, error: isConflictCode(error.code) ? `Preview conflict: ${error.message}` : error.message };
  if (!isRecord(data) || !Array.isArray(data.items)) {
    return { success: false, error: 'Command result unavailable. Retry with the same operation.' };
  }
  return { success: true, data: data as unknown as CommittedItems };
}
