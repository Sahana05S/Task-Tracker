// PRIVATE (server, through index.ts). The service worker of the Android app's
// offline mode (M21), served by app/sw.js/route.ts. It is registered only
// inside the app, with the switch on (components/offline-sync.tsx).
//
// What it does, and nothing more:
// - page navigations go to the network as usual and are never cached; when the
//   network fails or answers with a server error, the member is sent to
//   /offline, served from the cache;
// - /offline itself is fetched from the network when possible, else the cache;
// - Next.js build files (/_next/static, scripts, styles, fonts) are cached on
//   first use, so the offline page loads without a connection;
// - everything else (data requests, Server Actions, API routes, uploads) is
//   left to the browser untouched, so no personal data enters Cache Storage.
// On install it fetches /offline and caches the build files that page names
// (the site may not be framed, even by itself, so no iframe warm-up). Each
// deploy has its own cache name; activation deletes the older ones.

import { OFFLINE_CACHE_PREFIX } from './store';

export const OFFLINE_PATH = '/offline';

export function serviceWorkerSource(deploymentId: string): string {
  const cacheName = `${OFFLINE_CACHE_PREFIX}${deploymentId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'dev'}`;
  return `'use strict';
const CACHE = ${JSON.stringify(cacheName)};
const PREFIX = ${JSON.stringify(OFFLINE_CACHE_PREFIX)};
const OFFLINE = ${JSON.stringify(OFFLINE_PATH)};
// Any build file the page names, under /_next/static/ in any layout (production
// builds use /_next/static/immutable/...), in HTML attributes or flight data.
const STATIC = /(?:\\/_next\\/)?static\\/[A-Za-z0-9_\\-.\\/~%]+\\.(?:js|css|woff2?|ttf|otf|png|jpe?g|svg|webp|ico)/g;

async function precache() {
  const cache = await caches.open(CACHE);
  const page = await fetch(OFFLINE, { cache: 'no-store', credentials: 'same-origin' });
  if (!page.ok) throw new Error('Offline page unavailable: ' + page.status);
  const html = await page.clone().text();
  await cache.put(OFFLINE, page);
  const files = new Set();
  for (const match of html.matchAll(STATIC)) files.add('/_next/' + match[0].replace(/^\\/?(_next\\/)?/, ''));
  await Promise.all([...files].map((url) =>
    fetch(url).then((response) => (response.ok ? cache.put(url, response) : undefined)).catch(() => undefined)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((names) => Promise.all(names.filter((name) => name.startsWith(PREFIX) && name !== CACHE).map((name) => caches.delete(name))))
    .then(() => self.clients.claim()));
});

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
  }
  return response;
}

async function offlinePage() {
  return (await caches.match(OFFLINE)) || Response.error();
}

// A page load. The network as usual; when it fails, or answers with a server
// error (the Android shell can report an unreachable site that way), the
// offline copy instead.
async function navigate(request, url) {
  try {
    const response = await fetch(request);
    if (response.status < 500) return response;
  } catch (error) {
    // No connection: fall through to the offline copy.
  }
  if (url.pathname === OFFLINE) return offlinePage();
  if (!(await caches.match(OFFLINE))) return Response.error();
  return Response.redirect(OFFLINE + '?from=' + encodeURIComponent(url.pathname), 302);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode !== 'navigate') return;
  event.respondWith(navigate(request, url));
});
`;
}
