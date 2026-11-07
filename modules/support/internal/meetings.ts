import 'server-only';

import { isConflictCode } from '@/shared/commands/conflict';
import { createClient } from '@/shared/supabase/server';
import type { Json } from '@/types/database';
import type { ActionResponse } from '@/types/tracker';

import { mapMeetingDetail, mapMeetingSummary, type MeetingDetail, type MeetingSummary } from './meeting-rules';

/**
 * Meetings (migration 136): reads and commands. Every read and write is a SECURITY DEFINER
 * function that checks the caller is a member of the meeting or the managing director. PRIVATE.
 */

/** The caller's readable, active meetings, newest first (at most 500), optionally a date range or one mission. */
export async function listMeetings(filter: { from?: string | null; to?: string | null; taskId?: string | null } = {}): Promise<MeetingSummary[]> {
  const db = await createClient();
  const { data, error } = await db.rpc('meetings_list', { p_from: filter.from ?? null, p_to: filter.to ?? null, p_task: filter.taskId ?? null });
  if (error) throw new Error(`Meetings unavailable: ${error.message}`);
  return (Array.isArray(data) ? data : []).flatMap((row) => {
    const meeting = mapMeetingSummary(row);
    return meeting ? [meeting] : [];
  });
}

/** One meeting with its minutes and points; null when it does not exist or the caller may not read it. */
export async function readMeeting(id: string): Promise<MeetingDetail | null> {
  const db = await createClient();
  const { data, error } = await db.rpc('meeting_detail', { p_meeting: id });
  if (error) {
    if (error.code === 'P0002' || error.code === '22P02') return null;
    throw new Error(`Meeting unavailable: ${error.message}`);
  }
  return mapMeetingDetail(data);
}

type MeetingOp = 'create' | 'edit' | 'save_minutes' | 'add_member' | 'remove_member' | 'withdraw';
type PointOp = 'add' | 'edit' | 'set_status' | 'withdraw';

function failure(error: { code?: string; message: string }): ActionResponse<never> {
  if (isConflictCode(error.code)) return { success: false, error: error.message, errorCode: 'conflict' };
  if (error.code === '42501') return { success: false, error: error.message, errorCode: 'forbidden' };
  if (error.code === 'P0002') return { success: false, error: 'This meeting is not available to you.', errorCode: 'forbidden' };
  return { success: false, error: error.message, errorCode: 'validation' };
}

export interface MeetingResult { readonly id: string; readonly version: number; readonly state: string }

export async function runMeetingCommand(input: {
  op: MeetingOp; meetingId: string | null; payload: Record<string, Json>; expectedVersion: number | null; operationId: string;
}): Promise<ActionResponse<MeetingResult>> {
  const db = await createClient();
  const { data, error } = await db.rpc('meeting_command', {
    p_op: input.op, p_meeting: input.meetingId, p_payload: input.payload, p_expected_version: input.expectedVersion, p_operation: input.operationId,
  });
  if (error) return failure(error);
  const row = (data ?? {}) as Record<string, unknown>;
  return { success: true, data: { id: String(row.id ?? ''), version: Number(row.version ?? 0), state: String(row.state ?? 'active') } };
}

export async function runMeetingPointCommand(input: {
  op: PointOp; meetingId: string; pointId: string | null; payload: Record<string, Json>; expectedVersion: number | null; operationId: string;
}): Promise<ActionResponse<{ id: string; version: number }>> {
  const db = await createClient();
  const { data, error } = await db.rpc('meeting_point_command', {
    p_op: input.op, p_meeting: input.meetingId, p_point: input.pointId, p_payload: input.payload,
    p_expected_version: input.expectedVersion, p_operation: input.operationId,
  });
  if (error) return failure(error);
  const row = (data ?? {}) as Record<string, unknown>;
  return { success: true, data: { id: String(row.id ?? ''), version: Number(row.version ?? 0) } };
}

/** Active people of the company (members to add, owners of points), by name. */
export async function listActivePeople(): Promise<{ id: string; name: string }[]> {
  const db = await createClient();
  const { data, error } = await db.from('users').select('id, full_name').eq('is_active', true).order('full_name');
  if (error) throw new Error(`Members unavailable: ${error.message}`);
  return data.map((row) => ({ id: row.id, name: row.full_name }));
}
