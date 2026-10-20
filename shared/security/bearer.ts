import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Timing-safe check of an `Authorization: Bearer <token>` header. Both sides are
 * hashed first so the comparison never leaks the token length. Same scheme as
 * the award worker endpoint (modules/scoring/internal/stars/worker.ts, which
 * keeps its own copy); use this one for new internal endpoints.
 */
const digest = (value: string) => createHash('sha256').update(value).digest();

export function bearerMatches(request: Request, token: string): boolean {
  const supplied = request.headers.get('authorization') ?? '';
  return timingSafeEqual(digest(supplied), digest('Bearer ' + token));
}
