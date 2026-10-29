// PUBLIC client-safe exports of the notifications module.
export type { BellState, InboxState, NotificationItem, PushStatus, PushStatusState } from '@/modules/notifications/internal/types';
export { NOTIFICATIONS_CHANGED_EVENT, badgeText, bellLabel, pushHealthLine, safeHref, timeAgo } from '@/modules/notifications/internal/rules';
