import type { UserRole } from '@/types/tracker';

/**
 * Who sees Payroll. PRIVATE; re-exported through `client.ts`. Only gives the
 * UI its answer: every payroll function in migration 74 refuses anyone but an
 * active managing director of the caller's company.
 */
export function canManagePayroll(role: UserRole): boolean {
  return role === 'managing_director';
}
