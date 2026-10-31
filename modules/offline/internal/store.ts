// PRIVATE (client-safe via client.ts). The phone's offline copy, kept in
// IndexedDB on the site's own origin so the cached /offline page can read it.
// Nothing here talks to the server.

import { OFFLINE_MODE_STORAGE_KEY, offlineModeOn, readStoredSnapshot, type StoredSnapshot } from './rules';

const DB_NAME = 'stellar-offline';
const DB_VERSION = 1;
const STORE = 'kv';
const SNAPSHOT_KEY = 'snapshot';
/** Cache Storage names the service worker uses (see worker-source.ts). */
export const OFFLINE_CACHE_PREFIX = 'stellar-offline-';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = work(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function saveSnapshot(snapshot: StoredSnapshot): Promise<void> {
  await run('readwrite', store => store.put(snapshot, SNAPSHOT_KEY));
}

/** The stored snapshot, or null when there is none, it is of an older shape, or it belongs to someone else. */
export async function readSnapshot(userId?: string): Promise<StoredSnapshot | null> {
  try {
    return readStoredSnapshot(await run('readonly', store => store.get(SNAPSHOT_KEY)), userId);
  } catch {
    return null;
  }
}

/** Removes the member's offline copy (sign-out, or the switch turned off). */
export async function clearOfflineData(): Promise<void> {
  await run('readwrite', store => store.clear()).catch(() => undefined);
}

/** Removes the cached offline page and build files (the switch turned off); they hold no personal data. */
export async function clearOfflineCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const names = await caches.keys().catch(() => [] as string[]);
  await Promise.all(names.filter(name => name.startsWith(OFFLINE_CACHE_PREFIX)).map(name => caches.delete(name)));
}

/** Asks the browser not to evict the offline copy under storage pressure; the WebView may refuse. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export function readOfflineMode(): boolean {
  try {
    return offlineModeOn(window.localStorage.getItem(OFFLINE_MODE_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function writeOfflineMode(on: boolean): void {
  try {
    window.localStorage.setItem(OFFLINE_MODE_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Private storage off: offline mode simply stays off on this phone.
  }
}
