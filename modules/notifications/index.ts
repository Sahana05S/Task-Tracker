// PUBLIC server-side API of the notifications module (migration 56).
export { readInbox as listNotifications, readUnreadCount as getUnreadCount } from '@/modules/notifications/internal/queries';
export * from '@/modules/notifications/client';
