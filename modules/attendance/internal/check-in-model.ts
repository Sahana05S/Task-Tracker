import type { AttendanceCheckInRow } from '@/types/database';
import { kolkataTime } from '@/shared/time/kolkata';

/**
 * Photo check-in (migration 72): the employee takes a photo, the server keeps
 * the time and the phone's position. Client-safe types and helpers only.
 */

export type CheckInKind = 'in' | 'out';

/** One check-in or check-out, as the matrix and the check-in page show it. */
export interface CheckInMark {
  readonly id: string;
  readonly userId: string;
  readonly date: string;
  readonly kind: CheckInKind;
  /** ISO instant, recorded by the server. */
  readonly capturedAt: string;
  /** HH:MM, India time. */
  readonly time: string;
  readonly hasPhoto: boolean;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly accuracyM: number | null;
  /** Metres from the office, when both the office and the phone's position are known. */
  readonly distanceM: number | null;
  readonly outsideOffice: boolean;
}

export const CHECK_IN_COLUMNS = 'id,user_id,attendance_date,kind,captured_at,photo_path,latitude,longitude,accuracy_m,distance_m,outside_office' as const;

export function mapCheckIn(row: Pick<AttendanceCheckInRow, 'id' | 'user_id' | 'attendance_date' | 'kind' | 'captured_at' | 'photo_path' | 'latitude' | 'longitude' | 'accuracy_m' | 'distance_m' | 'outside_office'>): CheckInMark {
  const number = (value: number | string | null) => (value === null ? null : Number(value));
  return {
    id: row.id,
    userId: row.user_id,
    date: row.attendance_date,
    kind: row.kind,
    capturedAt: row.captured_at,
    time: kolkataTime(new Date(row.captured_at)),
    hasPhoto: row.photo_path !== null,
    latitude: number(row.latitude),
    longitude: number(row.longitude),
    accuracyM: number(row.accuracy_m),
    distanceM: number(row.distance_m),
    outsideOffice: row.outside_office === true,
  };
}

/** A map link for a recorded position (opens in the phone's map app). */
export function mapLink(latitude: number, longitude: number): string {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`;
}

/** A small embedded map around a position, without an API key. */
export function mapEmbed(latitude: number, longitude: number): string {
  const d = 0.0025;
  const box = [longitude - d, latitude - d, longitude + d, latitude + d].map(value => value.toFixed(6)).join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${box}&layer=mapnik&marker=${latitude},${longitude}`;
}

/** Longest side of a stored photo, in pixels; enough to recognise a face. */
const PHOTO_EDGE = 720;
/** The server refuses larger photos (server actions accept 1 MB in all). */
export const MAX_PHOTO_BYTES = 900 * 1024;

/**
 * Shrinks a camera photo to a JPEG of at most 720 px on its longest side
 * (usually 60-150 KB), so a month of check-ins stays small. Browser only.
 */
export async function compressPhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.72, 0.55, 0.4]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= MAX_PHOTO_BYTES) return blob;
    }
    throw new Error('The photo is too large. Take it again.');
  } finally {
    bitmap.close();
  }
}
