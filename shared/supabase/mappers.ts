import type { UserRow } from '@/types/database';
import type { User } from '@/types/tracker';

/**
 * Converts snake_case database rows into the camelCase domain models in
 * `@/types/tracker`.
 *
 * Keeping the boundary explicit means components never handle raw rows, and a
 * column rename shows up as a compile error here instead of as `undefined` in
 * the UI.
 *
 * Mappers for tasks, daily logs and snapshots arrive with the modules that need
 * them in Phase 3 and beyond.
 */

/** Columns to select when a full `User` is needed. */
export const USER_COLUMNS =
  'id, employee_id, full_name, email, role, is_active, created_at, updated_at' as const;

export function mapUser(row: UserRow): User {
  return {
    id: row.id,
    employeeId: row.employee_id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
