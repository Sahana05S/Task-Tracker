// PUBLIC client-safe exports of the notifications module.
export type { BellState, InboxState, NotificationItem, PushStatus, PushStatusState } from '@/modules/notifications/internal/types';
export { badgeText, bellLabel, pushHealthLine, safeHref, timeAgo } from '@/modules/notifications/internal/rules';
