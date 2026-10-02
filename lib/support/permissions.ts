import { TASK_MANAGER_ROLES } from '@/lib/tracker/enums';
import type { User, UserRole } from '@/types/tracker';

export type SupportKnowledgeModule = 'daily-facts' | 'ideas' | 'suggestions';

export function canCreateSupportRecord(user: Pick<User, 'isActive'>): boolean {
  return user.isActive;
}

export function canManageSupportRecords(role: UserRole): boolean {
  return (
    (TASK_MANAGER_ROLES as readonly UserRole[]).includes(role) ||
    role === 'data_manager'
  );
}

export function canManageReportSnapshots(role: UserRole): boolean {
  return (TASK_MANAGER_ROLES as readonly UserRole[]).includes(role);
}
