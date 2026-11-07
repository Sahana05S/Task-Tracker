'use server';

import { ISO_DATE_PATTERN, UUID_PATTERN } from '@/shared/forms/form-data';
import { resolveActor } from '@/shared/session/actor';
import type { Json } from '@/types/database';
import type { ActionResponse } from '@/types/tracker';

import { revalidateMeetings } from './internal/cache';
import { MINUTES_CONFLICT, POINT_STATUSES, type MeetingSummary, type PointStatus } from './internal/meeting-rules';
import { listMeetings, runMeetingCommand, runMeetingPointCommand, type MeetingResult } from './internal/meetings';

/**
 * Meetings (migration 136). Each action checks the session and the shape of its input; the
 * database decides who may (members of the meeting and the managing director).
 */

const RELOAD = 'Reload the page and try again.';
const read = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const uuid = (form: FormData, key: string) => (UUID_PATTERN.test(read(form, key)) ? read(form, key) : null);
const uuids = (form: FormData, key: string) => [...new Set(form.getAll(key).map(String).filter((v) => UUID_PATTERN.test(v)))];
const version = (form: FormData) => {
  const value = Number(read(form, 'expectedVersion'));
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
};

async function active(): Promise<string | null> {
  const actor = await resolveActor();
  return actor.ok ? null : actor.error;
}

/** Title, date, start time and type from a meeting form. */
function meetingFields(form: FormData): Record<string, Json> | string {
  const title = read(form, 'title');
  const date = read(form, 'meeting_date');
  const start = read(form, 'start_time');
  if (!title) return 'Give the meeting a title.';
  if (!ISO_DATE_PATTERN.test(date)) return 'Choose the meeting date.';
  if (start && !/^\d{2}:\d{2}$/.test(start)) return 'Start time is HH:MM.';
  const fields: Record<string, Json> = { title, meeting_date: date, start_time: start || null, meeting_type: read(form, 'meeting_type') || null };
  // The business select (migration 134) is shown only when the company has businesses.
  if (form.has('business_id')) fields.business_id = uuid(form, 'business_id');
  return fields;
}

/** New meeting: the caller becomes a member; minutes start from the company agenda. */
export async function createMeetingAction(form: FormData): Promise<ActionResponse<MeetingResult>> {
  const denied = await active();
  if (denied) return { success: false, error: denied };
  const fields = meetingFields(form);
  if (typeof fields === 'string') return { success: false, error: fields, errorCode: 'validation' };
  const operationId = uuid(form, 'operationId');
  if (!operationId) return { success: false, error: RELOAD };
  const result = await runMeetingCommand({
    op: 'create', meetingId: null, expectedVersion: null, operationId,
    payload: { ...fields, members: uuids(form, 'member'), missions: uuids(form, 'mission') },
  });
  if (result.success) revalidateMeetings(result.data?.id);
  return result;
}

/** Title, date, start time, type and linked missions. */
export async function editMeetingAction(form: FormData): Promise<ActionResponse<MeetingResult>> {
  const denied = await active();
  if (denied) return { success: false, error: denied };
  const meetingId = uuid(form, 'meetingId');
  const operationId = uuid(form, 'operationId');
  if (!meetingId || !operationId) return { success: false, error: RELOAD };
  const fields = meetingFields(form);
  if (typeof fields === 'string') return { success: false, error: fields, errorCode: 'validation' };
  const result = await runMeetingCommand({
    op: 'edit', meetingId, expectedVersion: null, operationId, payload: { ...fields, missions: uuids(form, 'mission') },
  });
  if (result.success) revalidateMeetings(meetingId);
  return result;
}

/**
 * Autosave of the minutes (no page refresh): version-checked, so a save over someone else's
 * newer minutes is refused with MINUTES_CONFLICT instead of overwriting them.
 */
export async function saveMinutesAction(input: { meetingId: string; minutes: string; version: number; operationId: string }): Promise<ActionResponse<MeetingResult>> {
  const denied = await active();
  if (denied) return { success: false, error: denied };
  if (!UUID_PATTERN.test(input.meetingId) || !UUID_PATTERN.test(input.operationId) || !Number.isSafeInteger(input.version) || typeof input.minutes !== 'string') {
    return { success: false, error: RELOAD };
  }
  const result = await runMeetingCommand({
    op: 'save_minutes', meetingId: input.meetingId, expectedVersion: input.version, operationId: input.operationId,
    payload: { minutes: input.minutes },
  });
  return !result.success && result.errorCode === 'conflict' ? { ...result, error: MINUTES_CONFLICT } : result;
}

/** add_member (any member) or remove_member (the creator or the managing director). */
export async function meetingMemberAction(form: FormData): Promise<ActionResponse<MeetingResult>> {
  const denied = await active();
  if (denied) return { success: false, error: denied };
  const op = read(form, 'op');
  const meetingId = uuid(form, 'meetingId');
  const userId = uuid(form, 'user_id');
  const operationId = uuid(form, 'operationId');
  if (op !== 'add_member' && op !== 'remove_member') return { success: false, error: RELOAD };
  if (!userId) return { success: false, error: 'Choose a member.', errorCode: 'validation' };
  if (!meetingId || !operationId) return { success: false, error: RELOAD };
  const result = await runMeetingCommand({ op, meetingId, expectedVersion: null, operationId, payload: { user_id: userId } });
  if (result.success) revalidateMeetings(meetingId);
  return result;
}

/** Withdraw a meeting (the creator or the managing director); it leaves every list. */
export async function withdrawMeetingAction(form: FormData): Promise<ActionResponse<MeetingResult>> {
  const denied = await active();
  if (denied) return { success: false, error: denied };
  const meetingId = uuid(form, 'meetingId');
  const operationId = uuid(form, 'operationId');
  if (!meetingId || !operationId) return { success: false, error: RELOAD };
  const result = await runMeetingCommand({ op: 'withdraw', meetingId, expectedVersion: null, operationId, payload: {} });
  if (result.success) revalidateMeetings(meetingId);
  return result;
}

/** Add, edit or withdraw a point of a meeting. Empty optional fields clear them on edit. */
export async function meetingPointAction(form: FormData): Promise<ActionResponse<{ id: string; version: number }>> {
  const denied = await active();
  if (denied) return { success: false, error: denied };
  const op = read(form, 'op');
  const meetingId = uuid(form, 'meetingId');
  const operationId = uuid(form, 'operationId');
  if (op !== 'add' && op !== 'edit' && op !== 'withdraw') return { success: false, error: RELOAD };
  if (!meetingId || !operationId) return { success: false, error: RELOAD };
  const pointId = op === 'add' ? null : uuid(form, 'pointId');
  if (op !== 'add' && !pointId) return { success: false, error: RELOAD };
  const payload: Record<string, Json> = {};
  if (op !== 'withdraw') {
    payload.point = read(form, 'point');
    if (!payload.point) return { success: false, error: 'Write the point.', errorCode: 'validation' };
    payload.owner_id = uuid(form, 'owner_id');
    const due = read(form, 'resolution_due');
    if (due && !ISO_DATE_PATTERN.test(due)) return { success: false, error: 'Due date is YYYY-MM-DD.', errorCode: 'validation' };
    payload.resolution_due = due || null;
    if (form.has('point_type')) payload.point_type = read(form, 'point_type') || null;
    if (form.has('resolution')) payload.resolution = read(form, 'resolution') || null;
    if (form.has('comments')) payload.comments = read(form, 'comments') || null;
    if (form.has('related_task_id')) payload.related_task_id = uuid(form, 'related_task_id');
    const status = read(form, 'resolution_status');
    if (status) {
      if (!(POINT_STATUSES as readonly string[]).includes(status)) return { success: false, error: 'Choose a status.', errorCode: 'validation' };
      payload.resolution_status = status;
    }
  }
  const result = await runMeetingPointCommand({
    op, meetingId, pointId, payload, expectedVersion: op === 'add' ? null : version(form), operationId,
  });
  if (result.success) revalidateMeetings(meetingId);
  return result;
}

/** One tap on a point's status. */
export async function setPointStatusAction(input: { meetingId: string; pointId: string; status: PointStatus; version: number; operationId: string }): Promise<ActionResponse<{ id: string; version: number }>> {
  const denied = await active();
  if (denied) return { success: false, error: denied };
  if (![input.meetingId, input.pointId, input.operationId].every((v) => UUID_PATTERN.test(v)) || !(POINT_STATUSES as readonly string[]).includes(input.status)) {
    return { success: false, error: RELOAD };
  }
  const result = await runMeetingPointCommand({
    op: 'set_status', meetingId: input.meetingId, pointId: input.pointId, payload: { resolution_status: input.status },
    expectedVersion: input.version, operationId: input.operationId,
  });
  if (result.success) revalidateMeetings(input.meetingId);
  return result;
}

/** The member's meetings of the last 60 days, for the quick Post drawer's meeting point. */
export async function loadRecentMeetings(): Promise<ActionResponse<MeetingSummary[]>> {
  const denied = await active();
  if (denied) return { success: false, error: denied };
  const from = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  try {
    return { success: true, data: (await listMeetings({ from })).slice(0, 30) };
  } catch {
    return { success: false, error: 'Your meetings could not be loaded. Close the drawer and try again.' };
  }
}
