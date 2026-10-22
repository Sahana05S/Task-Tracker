// PRIVATE. Reads and the one write of migration 56's notifications (self only:
// the database scopes every call to the signed-in account).
import { isMissingFunctionError } from '@/shared/supabase/schema-errors';
import { createClient } from '@/shared/supabase/server';

import type { BellState, InboxState, NotificationItem } from './types';

export async function readUnreadCount(): Promise<BellState> {
  const db = await createClient();
  const { data, error } = await db.rpc('notifications_unread_count');
  if (error) return { status: isMissingFunctionError(error) ? 'missing' : 'unavailable' };
  return typeof data === 'number' ? { status: 'ready', unread: data } : { status: 'unavailable' };
}

export async function readInbox(limit = 20): Promise<InboxState> {
  const db = await createClient();
  const { data, error } = await db.rpc('notifications_list', { p_limit: limit });
  if (error) return { status: isMissingFunctionError(error) ? 'missing' : 'unavailable' };
  const model = data as unknown as { unread?: unknown; items?: unknown } | null;
  if (!model || typeof model.unread !== 'number' || !Array.isArray(model.items)) return { status: 'unavailable' };
  return { status: 'ready', unread: model.unread, items: model.items as NotificationItem[] };
}

/** Marks the caller's notifications read (all unread when ids is null); returns how many changed. */
export async function markRead(ids: string[] | null): Promise<number> {
  const db = await createClient();
  const { data, error } = await db.rpc('notifications_mark_read', { p_ids: ids });
  if (error) throw new Error(`Notifications could not be marked read: ${error.message}`);
  return typeof data === 'number' ? data : 0;
}
