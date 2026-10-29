// PUBLIC client-safe exports of the notifications module.
export type { BellState, InboxState, NotificationItem } from '@/modules/notifications/internal/types';
export { NOTIFICATIONS_CHANGED_EVENT, badgeText, bellLabel, safeHref, timeAgo } from '@/modules/notifications/internal/rules';
