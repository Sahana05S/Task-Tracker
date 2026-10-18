import { localCheckTime } from '@/shared/time/kolkata';
import type { Json } from '@/types/database';

/** FormData parsing for dated records (attendance, facts, ideas, suggestions, sales, meetings). PRIVATE. */

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const read = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

export interface DatedRecordCommand {
  kind: string;
  recordId: string | null;
  command: string;
  payload: Record<string, Json>;
  expectedVersion: number;
  operationId: string;
}

/** Attendance fields: status, measured hours (blank is not zero) and local check times. */
function readAttendance(form: FormData, payload: Record<string, Json>): string | null {
  payload.attendance_status = read(form, 'attendance_status');
  for (const key of ['attendance_hours', 'off_hours']) {
    const value = read(form, key);
    if (!value || !Number.isFinite(Number(value))) return 'Enter measured hours explicitly; blank is not zero.';
    payload[key] = value;
  }
  try {
    payload.check_in_at = localCheckTime(read(form, 'business_date'), read(form, 'check_in_time'));
    payload.check_out_at = localCheckTime(read(form, 'business_date'), read(form, 'check_out_time'));
  } catch {
    return 'Check times must be valid local times.';
  }
  payload.holiday_name = read(form, 'holiday_name') || null;
  return null;
}

/** Fields for knowledge entries, sales logs and meeting points. */
function readSupportRecord(form: FormData, kind: string, payload: Record<string, Json>): void {
  payload.asset_url = read(form, 'asset_url') || null;
  payload.related_task_id = read(form, 'related_task_id') || null;
  if (kind === 'sale') {
    for (const key of ['project_built_up_area', 'project_location', 'client_name']) payload[key] = read(form, key) || null;
    for (const key of ['is_new_project', 'basement_payment_received']) payload[key] = form.get(key) === 'on' || form.get(key) === 'true';
  }
  if (kind === 'meeting') {
    for (const key of ['meeting_type', 'owner_id', 'point_type', 'resolution', 'comments', 'resolution_status', 'resolution_due', 'resolved_on']) {
      payload[key] = read(form, key) || null;
    }
  }
}

/** Reads a dated-record form into a `dated_record_command` call. */
export function parseDatedRecord(form: FormData): Parsed<DatedRecordCommand> {
  const kind = read(form, 'kind');
  const command = read(form, 'command') || 'save';
  const payload: Record<string, Json> = { reason: read(form, 'reason') || null };

  if (command === 'save') {
    for (const key of ['business_date', 'author_id', 'content']) payload[key] = read(form, key) || null;
    if (kind === 'attendance') {
      const error = readAttendance(form, payload);
      if (error) return { ok: false, error };
    } else {
      readSupportRecord(form, kind, payload);
    }
  } else if (command === 'validate') {
    payload.state = read(form, 'state');
  }

  const version = read(form, 'expectedVersion');
  if (!/^\d+$/.test(version)) return { ok: false, error: 'Reload the current record before saving.' };

  return {
    ok: true,
    value: {
      kind,
      recordId: read(form, 'recordId') || null,
      command,
      payload,
      expectedVersion: Number(version),
      operationId: read(form, 'operationId'),
    },
  };
}
