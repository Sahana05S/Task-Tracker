import 'server-only';

import { isConflictCode } from '@/shared/commands/conflict';
import { createClient } from '@/shared/supabase/server';
import { isMissingFunctionError } from '@/shared/supabase/schema-errors';

import { CHECK_IN_COLUMNS, mapCheckIn, type CheckInKind, type CheckInMark } from './check-in-model';

/** Private bucket of migration 72; objects at <organization>/<user>/<date>/<kind>-<uuid>.jpg. */
export const CHECK_IN_BUCKET = 'attendance-photos';
/** How long a viewing link to a photo works. */
const PHOTO_LINK_SECONDS = 600;

type Db = Awaited<ReturnType<typeof createClient>>;

/** Check-ins of a period: everyone's for managers, the viewer's own otherwise (RLS agrees). */
export async function getCheckIns({ startDate, endDate, viewerId, canManage }: {
  readonly startDate: string; readonly endDate: string; readonly viewerId: string; readonly canManage: boolean;
}): Promise<CheckInMark[]> {
  const supabase = await createClient();
  let query = supabase.from('attendance_check_ins').select(CHECK_IN_COLUMNS)
    .gte('attendance_date', startDate).lte('attendance_date', endDate).order('captured_at');
  if (!canManage) query = query.eq('user_id', viewerId);
  const { data, error } = await query;
  // Before migration 72 there are simply no check-ins.
  if (error) return [];
  return data.map(mapCheckIn);
}

/** The viewer's check-in and check-out for one day, and whether the day already has a record. */
export async function getDayCheckIns(userId: string, date: string): Promise<{ in: CheckInMark | null; out: CheckInMark | null; recorded: boolean; available: boolean }> {
  const supabase = await createClient();
  const [checks, record] = await Promise.all([
    supabase.from('attendance_check_ins').select(CHECK_IN_COLUMNS).eq('user_id', userId).eq('attendance_date', date),
    supabase.from('attendance_records').select('id').eq('user_id', userId).eq('attendance_date', date).eq('record_state', 'active').maybeSingle(),
  ]);
  const marks = (checks.data ?? []).map(mapCheckIn);
  return {
    in: marks.find(mark => mark.kind === 'in') ?? null,
    out: marks.find(mark => mark.kind === 'out') ?? null,
    recorded: Boolean(record.data),
    available: !checks.error,
  };
}

/** The caller's company, for the photo's folder. */
export async function callerOrganization(supabase: Db): Promise<string | null> {
  const { data, error } = await supabase.rpc('current_organization');
  return error ? null : data;
}

export function photoPath(organizationId: string, userId: string, date: string, kind: CheckInKind, photoId: string): string {
  return `${organizationId}/${userId}/${date}/${kind}-${photoId}.jpg`;
}

/**
 * Uploads the photo as the signed-in user (the bucket's policies allow only
 * their own folder). An object already at the path is the same attempt sent
 * again after a lost response, so it counts as uploaded.
 */
export async function uploadCheckInPhoto(supabase: Db, path: string, photo: Blob): Promise<string | null> {
  const { error } = await supabase.storage.from(CHECK_IN_BUCKET).upload(path, photo, { contentType: 'image/jpeg', upsert: false });
  if (!error) return null;
  if (/exists|duplicate/i.test(error.message)) return null;
  if (/bucket not found/i.test(error.message)) return 'Photo check-in needs the latest database update (migration 72).';
  return `The photo did not upload: ${error.message}`;
}

/** Removes a photo that no check-in points at (the save failed); the bucket refuses anything else. */
export async function discardCheckInPhoto(supabase: Db, path: string): Promise<void> {
  await supabase.storage.from(CHECK_IN_BUCKET).remove([path]);
}

export interface CheckInResult {
  readonly kind: CheckInKind;
  readonly capturedAt: string;
  readonly outsideOffice: boolean | null;
  readonly distanceM: number | null;
  /** Check-out only: hours written to the day's record, or null when the day already had one. */
  readonly hours: number | null;
  readonly recordExists: boolean;
}

/** Runs `attendance_check_in` (migration 72), the permission and time boundary. */
export async function runCheckIn(supabase: Db, input: {
  kind: CheckInKind; path: string; latitude: number | null; longitude: number | null; accuracy: number | null; operationId: string;
}): Promise<{ ok: true; result: CheckInResult } | { ok: false; error: string; code: 'forbidden' | 'validation' | 'conflict' | 'unavailable' }> {
  const { data, error } = await supabase.rpc('attendance_check_in', {
    p_kind: input.kind, p_photo_path: input.path, p_latitude: input.latitude, p_longitude: input.longitude,
    p_accuracy: input.accuracy, p_operation: input.operationId,
  });
  if (error) {
    if (isMissingFunctionError(error)) return { ok: false, error: 'Photo check-in needs the latest database update (migration 72).', code: 'unavailable' };
    if (isConflictCode(error.code)) return { ok: false, error: 'This check-in was sent twice with different details. Take the photo again.', code: 'conflict' };
    // The command raises plain-language messages for refusals and invalid input.
    if (error.code === '42501') return { ok: false, error: error.message, code: 'forbidden' };
    if (error.code === '23514' || error.code === '23505') return { ok: false, error: error.message, code: 'validation' };
    return { ok: false, error: `The check-in was not saved: ${error.message}`, code: 'unavailable' };
  }
  const value = (data ?? {}) as Record<string, unknown>;
  const number = (key: string) => (typeof value[key] === 'number' ? value[key] as number : value[key] == null ? null : Number(value[key]));
  return { ok: true, result: {
    kind: input.kind,
    capturedAt: String(value.capturedAt ?? ''),
    outsideOffice: typeof value.outsideOffice === 'boolean' ? value.outsideOffice : null,
    distanceM: number('distanceM'),
    hours: number('hours'),
    recordExists: value.recordExists === true,
  } };
}

export interface CheckInPhoto {
  readonly kind: CheckInKind;
  readonly url: string;
}

/** Short-lived viewing links for one person's photos of one day (RLS decides who may see them). */
export async function checkInPhotoLinks(userId: string, date: string): Promise<CheckInPhoto[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('attendance_check_ins').select('kind,photo_path').eq('user_id', userId).eq('attendance_date', date);
  const rows = (data ?? []).filter((row): row is { kind: CheckInKind; photo_path: string } => row.photo_path !== null);
  if (!rows.length) return [];
  const { data: links } = await supabase.storage.from(CHECK_IN_BUCKET).createSignedUrls(rows.map(row => row.photo_path), PHOTO_LINK_SECONDS);
  return rows.flatMap(row => {
    const url = links?.find(link => link.path === row.photo_path)?.signedUrl;
    return url ? [{ kind: row.kind, url }] : [];
  });
}
