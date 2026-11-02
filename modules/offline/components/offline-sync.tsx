'use client';

import { useEffect, useState } from 'react';

import { isNativeApp } from '@/modules/mobile/client';

import { offlineSnapshotAction } from '@/modules/offline/actions';
import { OFFLINE_MODE_EVENT, snapshotIsDue, storeSnapshot } from '@/modules/offline/internal/rules';
import { clearOfflineData, readOfflineMode, readSnapshot, requestPersistentStorage, saveSnapshot } from '@/modules/offline/internal/store';
import { registerOfflineWorker, unregisterOfflineWorker } from '@/modules/offline/internal/worker-client';

/**
 * Mounted once in the signed-in workspace. In a browser, or with the switch
 * off, it does nothing (and removes a worker left from an earlier "on"). In
 * the Android app with "Offline mode (beta)" on, it installs the offline
 * service worker and keeps the member's offline copy fresh: on start, when the
 * app comes back to the front, and at most every 15 minutes.
 */
export function OfflineSync({ userId }: { readonly userId: string }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    const read = () => setEnabled(readOfflineMode());
    read();
    window.addEventListener(OFFLINE_MODE_EVENT, read);
    return () => window.removeEventListener(OFFLINE_MODE_EVENT, read);
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    if (!enabled) {
      void navigator.serviceWorker?.getRegistrations().then((registrations) => {
        if (registrations.length) void unregisterOfflineWorker();
      }).catch(() => undefined);
      return;
    }

    let busy = false;
    const refresh = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        // Another member's copy is removed at once, even if the refresh below fails.
        const own = await readSnapshot(userId);
        if (own === null) await clearOfflineData();
        if (!snapshotIsDue(own, Date.now())) return;
        const result = await offlineSnapshotAction();
        if (result.success && result.data) await saveSnapshot(storeSnapshot(result.data, Date.now()));
        else console.warn('Offline copy not refreshed', result.error);
      } catch (error) {
        console.warn('Offline copy not refreshed', error);
      } finally {
        busy = false;
      }
    };
    const onVisible = () => void refresh();

    void registerOfflineWorker();
    void requestPersistentStorage();
    void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, userId]);

  return null;
}
