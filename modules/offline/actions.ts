'use server';

// PUBLIC server actions of the offline module, called by OfflineSync on the
// live site inside the Android app. The cached /offline page never calls them
// (a cached page from an older build would carry stale action ids).
import { resolveActor } from '@/shared/session/actor';
import type { ActionResponse } from '@/types/tracker';

import { buildOfflineSnapshot } from '@/modules/offline/internal/snapshot';
import type { OfflineSnapshot } from '@/modules/offline/internal/rules';

/** The signed-in member's own offline copy, with a fresh offline grant (migration 97). */
export async function offlineSnapshotAction(): Promise<ActionResponse<OfflineSnapshot>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  try {
    return { success: true, data: await buildOfflineSnapshot(actor.profile) };
  } catch {
    return { success: false, error: 'Offline use could not be prepared. Try again with a connection.', errorCode: 'unavailable' };
  }
}
