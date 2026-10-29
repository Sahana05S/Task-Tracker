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

/** Phone notification health for Reports > Data checks (migration 91, managing director). */
export interface PushStatus {
  /** Vault holds the send-push URL and secret, and pg_net is installed. */
  configured: boolean;
  /** Phones registered in the company and not disabled. */
  devices: number;
  waiting: number;
  oldestWaitingAt: string | null;
  /** Last 24 hours. */
  sent: number;
  failed: number;
  dropped: number;
  lastSentAt: string | null;
}

export type PushStatusState = { status: 'ready'; push: PushStatus } | { status: 'missing' } | { status: 'unavailable' };
