/**
 * Database "this record changed; reload and try again" errors.
 *
 * Commands raise PT409 (HTTP 409 through PostgREST) since migration 52. Older
 * databases still raise 40001, which PostgREST 14 retries without limit, so a
 * database before 52 can loop instead of answering; both codes mean the same
 * conflict to the app.
 */
export const CONFLICT_CODES = ['PT409', '40001'] as const;

export function isConflictCode(code: string | null | undefined): boolean {
  return code === 'PT409' || code === '40001';
}
