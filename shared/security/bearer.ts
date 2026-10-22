import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Timing-safe check of an `Authorization: Bearer <token>` header. Both sides are
 * hashed first so the comparison never leaks the token length. The award and
 * policies workers use it through authorizeWorkerRequest (shared/supabase/worker.ts).
 */
const digest = (value: string) => createHash('sha256').update(value).digest();

export function bearerMatches(request: Request, token: string): boolean {
  const supplied = request.headers.get('authorization') ?? '';
  return timingSafeEqual(digest(supplied), digest('Bearer ' + token));
}
