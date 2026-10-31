// PRIVATE (client-safe via client.ts). Registers and removes the offline
// service worker (app/sw.js/route.ts) on this phone.

import { clearOfflineCaches, clearOfflineData } from './store';

const WORKER_URL = '/sw.js';

function supported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/** Installs (or refreshes) the offline service worker; true once one is active or installing. */
export async function registerOfflineWorker(): Promise<boolean> {
  if (!supported()) return false;
  try {
    const registration = await navigator.serviceWorker.register(WORKER_URL, { scope: '/', updateViaCache: 'none' });
    void registration.update().catch(() => undefined);
    return true;
  } catch (error) {
    console.warn('Offline mode could not be set up on this phone', error);
    return false;
  }
}

/** Removes the offline service worker, its cache and the offline copy (the switch turned off). */
export async function unregisterOfflineWorker(): Promise<void> {
  await Promise.all([clearOfflineData(), clearOfflineCaches()]).catch(() => undefined);
  if (!supported()) return;
  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => [] as readonly ServiceWorkerRegistration[]);
  await Promise.all(registrations
    .filter(registration => registration.active?.scriptURL.endsWith(WORKER_URL) || registration.installing?.scriptURL.endsWith(WORKER_URL)
      || registration.waiting?.scriptURL.endsWith(WORKER_URL))
    .map(registration => registration.unregister()));
}

/**
 * Before signing out: the next person on this phone must not see this member's
 * missions. The worker and its cache stay, since they hold no personal data.
 */
export async function forgetOfflineData(): Promise<void> {
  await clearOfflineData().catch(() => undefined);
}
