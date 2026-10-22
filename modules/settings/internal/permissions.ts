import type { UserRole } from '@/types/tracker';

/**
 * Who sees Settings > Company. PRIVATE; re-exported through `client.ts`. Only
 * gives the UI its answer: `company_settings_command` refuses everyone else.
 */
export function canManageCompanySettings(role: UserRole): boolean {
  return role === 'managing_director';
}
