// PRIVATE (client-safe via client.ts). Notification shapes (migration 56).

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  /** In-app path, or null. */
  href: string | null;
  createdAt: string;
  readAt: string | null;
}

/** What the bell shows: a count, or why it has none. Never a silent zero. */
export type BellState =
  | { status: 'ready'; unread: number }
  | { status: 'missing' }
  | { status: 'unavailable' };

export type InboxState =
  | { status: 'ready'; unread: number; items: NotificationItem[] }
  | { status: 'missing' }
  | { status: 'unavailable' };
