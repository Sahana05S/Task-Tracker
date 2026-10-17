import { canManageMilestones } from '@/shared/tracker/enums';
import type { UserRole } from '@/types/tracker';

/**
 * Who may edit organisational content. PRIVATE.
 *
 * This check runs first so the form can show a sentence a person can act on; the
 * `Leadership can manage …` policies from `04_milestones_and_vision.sql` run last
 * and are the real boundary. Both tables are readable by every authenticated
 * member and writable only by `managing_director` and `project_engineer`.
 */

export const NOT_ALLOWED =
  'Only managing directors and project engineers can edit vision and milestones.';

export function canEditMilestones(role: UserRole): boolean {
  return canManageMilestones(role);
}
