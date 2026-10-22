'use server';

// PUBLIC commands of the notifications module, called by the bell. The
// database limits every call to the signed-in account's own notifications.
import { UUID_PATTERN } from '@/shared/forms/form-data';
import type { ActionResponse } from '@/types/tracker';

import { markRead, readInbox, readUnreadCount } from '@/modules/notifications/internal/queries';
import type { BellState, InboxState } from '@/modules/notifications/internal/types';

export async function notificationCountAction(): Promise<BellState> {
  return readUnreadCount();
}

export async function notificationInboxAction(): Promise<InboxState> {
  return readInbox(20);
}

/** Marks the given notifications read, or all of them when `ids` is null. */
export async function markNotificationsReadAction(ids: string[] | null): Promise<ActionResponse<{ marked: number }>> {
  if (ids !== null && (!Array.isArray(ids) || ids.length > 200 || !ids.every((id) => typeof id === 'string' && UUID_PATTERN.test(id)))) {
    return { success: false, error: 'Refresh the page and try again.', errorCode: 'validation' };
  }
  try {
    return { success: true, data: { marked: await markRead(ids) } };
  } catch {
    return { success: false, error: 'Notifications could not be marked read. Try again.', errorCode: 'unavailable' };
  }
}
