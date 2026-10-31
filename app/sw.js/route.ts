import { serviceWorkerSource } from '@/modules/offline';

/**
 * The Android app's offline service worker (M21). Its text names this deploy,
 * so every deploy installs a fresh worker and drops the previous cache; it is
 * never cached itself.
 */
export function GET(): Response {
  const deployment = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';
  return new Response(serviceWorkerSource(deployment), {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  });
}
