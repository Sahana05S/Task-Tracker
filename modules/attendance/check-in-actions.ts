'use server';
import { revalidatePath } from 'next/cache';

import { canManageAttendance } from '@/modules/attendance/internal/permissions';
import { MAX_PHOTO_BYTES, type CheckInKind } from '@/modules/attendance/internal/check-in-model';
import {
  callerOrganization,
  checkInPhotoLinks,
  discardCheckInPhoto,
  photoPath,
  runCheckIn,
  uploadCheckInPhoto,
  type CheckInPhoto,
  type CheckInResult,
} from '@/modules/attendance/internal/check-in';
import { ISO_DATE_PATTERN, readString, UUID_PATTERN } from '@/shared/forms/form-data';
import { resolveActor } from '@/shared/session/actor';
import { createClient } from '@/shared/supabase/server';
import { kolkataDate } from '@/shared/time/kolkata';
import type { ActionResponse } from '@/types/tracker';

const coordinate = (form: FormData, key: string, limit: number): number | null | undefined => {
  const raw = readString(form, key);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : undefined;
};

/**
 * Check in or out now: uploads the photo to the caller's own folder, then runs
 * `attendance_check_in`, which takes the time from the database clock, keeps
 * the position and (on check-out) completes the day's attendance record.
 * `operationId` and `photoId` stay the same when a lost response is retried,
 * so the retry replays instead of saving twice.
 */
export async function checkIn(form: FormData): Promise<ActionResponse<CheckInResult>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  const kind = readString(form, 'kind') as CheckInKind;
  const operationId = readString(form, 'operationId'), photoId = readString(form, 'photoId');
  const photo = form.get('photo');
  if ((kind !== 'in' && kind !== 'out') || !UUID_PATTERN.test(operationId) || !UUID_PATTERN.test(photoId)) {
    return { success: false, error: 'Reload the page and try again.', errorCode: 'validation' };
  }
  if (!(photo instanceof Blob) || !photo.size) return { success: false, error: 'Take a photo first.', errorCode: 'validation' };
  if (photo.size > MAX_PHOTO_BYTES || !['image/jpeg', 'image/webp'].includes(photo.type)) {
    return { success: false, error: 'The photo could not be used. Take it again.', errorCode: 'validation' };
  }
  const latitude = coordinate(form, 'latitude', 90), longitude = coordinate(form, 'longitude', 180), accuracy = coordinate(form, 'accuracy', 1_000_000);
  if (latitude === undefined || longitude === undefined || accuracy === undefined || (latitude === null) !== (longitude === null)) {
    return { success: false, error: 'The location could not be read. Try again.', errorCode: 'validation' };
  }

  const supabase = await createClient();
  const organizationId = await callerOrganization(supabase);
  if (!organizationId) return { success: false, error: 'Your account is not part of an active company.', errorCode: 'forbidden' };
  const path = photoPath(organizationId, actor.profile.id, kolkataDate(), kind, photoId);
  const uploadError = await uploadCheckInPhoto(supabase, path, photo);
  if (uploadError) return { success: false, error: uploadError, errorCode: 'unavailable' };
  const outcome = await runCheckIn(supabase, { kind, path, latitude, longitude, accuracy: accuracy === null ? null : Math.round(accuracy), operationId });
  if (!outcome.ok) {
    await discardCheckInPhoto(supabase, path);
    return { success: false, error: outcome.error, errorCode: outcome.code };
  }
  revalidatePath('/attendance', 'layout');
  revalidatePath('/dashboard');
  return { success: true, data: outcome.result };
}

/** Viewing links for one person's check-in photos of a day: their own, or anyone's for a manager. */
export async function loadCheckInPhotos(memberId: string, date: string): Promise<ActionResponse<CheckInPhoto[]>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  if (!UUID_PATTERN.test(memberId) || !ISO_DATE_PATTERN.test(date)) return { success: false, error: 'Unknown day.', errorCode: 'validation' };
  if (memberId !== actor.profile.id && !canManageAttendance(actor.profile.role)) {
    return { success: false, error: 'Only managers can see other people’s photos.', errorCode: 'forbidden' };
  }
  return { success: true, data: await checkInPhotoLinks(memberId, date) };
}
