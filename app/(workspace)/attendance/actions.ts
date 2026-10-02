'use server';

import { revalidatePath } from 'next/cache';
import type { PostgrestError } from '@supabase/supabase-js';

import { getCurrentProfile } from '@/lib/auth/profile';
import { canManageAttendance } from '@/lib/attendance/permissions';
import {
  computeHoursFromCheckTimes,
  defaultHoursForStatus,
} from '@/lib/attendance/summary';
import { createClient } from '@/lib/supabase/server';
import { isAttendanceStatus } from '@/lib/tracker/enums';
import type { ActionResponse, User } from '@/types/tracker';

export type AttendanceActionState = ActionResponse<{ recordId: string }>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Actor =
  | { readonly ok: true; readonly profile: User }
  | { readonly ok: false; readonly error: string };

async function resolveActor(): Promise<Actor> {
  const profile = await getCurrentProfile();

  if (!profile) return { ok: false, error: 'You are not signed in.' };
  if (!profile.isActive) {
    return { ok: false, error: 'Your account is deactivated.' };
  }

  return { ok: true, profile };
}

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function readNullableString(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return value === '' ? null : value;
}

function readOptionalNumber(
  formData: FormData,
  key: string,
): number | null | undefined {
  const value = readString(formData, key);
  if (value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readOptionalUserId(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return UUID_PATTERN.test(value) ? value : null;
}

function describeDatabaseError(error: PostgrestError): string {
  switch (error.code) {
    case '23503':
      return 'The selected employee no longer exists.';
    case '23505':
      return 'An attendance record already exists for that employee and date.';
    case '23514':
      return 'Attendance values are outside their permitted range.';
    case '42501':
      return 'You do not have permission to change that attendance record.';
    default:
      return error.message;
  }
}

function combineDateAndTime(
  attendanceDate: string,
  timeValue: string | null,
): Date | null {
  if (!timeValue) return null;
  const date = new Date(`${attendanceDate}T${timeValue}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoOrNull(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

export async function saveAttendanceRecord(
  formData: FormData,
): Promise<AttendanceActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  const canManage = canManageAttendance(actor.profile.role);
  const requestedUserId = readOptionalUserId(formData, 'userId');
  const userId = canManage ? requestedUserId : actor.profile.id;

  if (!userId) return { success: false, error: 'Select an employee.' };
  if (!canManage && userId !== actor.profile.id) {
    return { success: false, error: 'You can only edit your own attendance.' };
  }

  const attendanceDate = readString(formData, 'attendanceDate');
  if (!ISO_DATE_PATTERN.test(attendanceDate)) {
    return { success: false, error: 'Enter a valid attendance date.' };
  }

  const status = readString(formData, 'status');
  if (!isAttendanceStatus(status)) {
    return { success: false, error: 'Select a valid attendance status.' };
  }

  const checkInAt = combineDateAndTime(
    attendanceDate,
    readNullableString(formData, 'checkInTime'),
  );
  const checkOutAt = combineDateAndTime(
    attendanceDate,
    readNullableString(formData, 'checkOutTime'),
  );
  if (checkInAt && checkOutAt && checkOutAt < checkInAt) {
    return { success: false, error: 'Check-out cannot be before check-in.' };
  }

  const defaults = defaultHoursForStatus(status);
  const computedHours = computeHoursFromCheckTimes(checkInAt, checkOutAt);
  const attendanceHoursInput = readOptionalNumber(formData, 'attendanceHours');
  const offHoursInput = readOptionalNumber(formData, 'offHours');
  if (attendanceHoursInput === undefined || offHoursInput === undefined) {
    return { success: false, error: 'Hours must be valid numbers.' };
  }

  const attendanceHours =
    attendanceHoursInput ?? computedHours ?? defaults.attendanceHours;
  const offHours = offHoursInput ?? defaults.offHours;

  if (attendanceHours < 0 || attendanceHours > 24) {
    return {
      success: false,
      error: 'Attendance hours must be between 0 and 24.',
    };
  }
  if (offHours < 0 || offHours > 24) {
    return { success: false, error: 'Off-hours must be between 0 and 24.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('attendance_records')
    .upsert(
      {
        user_id: userId,
        attendance_date: attendanceDate,
        status,
        check_in_at: toIsoOrNull(checkInAt),
        check_out_at: toIsoOrNull(checkOutAt),
        attendance_hours: attendanceHours,
        off_hours: offHours,
        holiday_name: readNullableString(formData, 'holidayName'),
        notes: readNullableString(formData, 'notes'),
        recorded_by: actor.profile.id,
      },
      { onConflict: 'user_id,attendance_date' },
    )
    .select('id')
    .single();

  if (error) return { success: false, error: describeDatabaseError(error) };

  revalidatePath('/attendance');
  revalidatePath('/dashboard');

  return { success: true, data: { recordId: data.id } };
}
