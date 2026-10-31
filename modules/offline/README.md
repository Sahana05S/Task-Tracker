# offline

Offline mode for the Android app (M21, DECISIONS "M21 offline mode", 31
October 2026). The app is a shell that loads this site, so with no connection
nothing used to work. With **Offline mode (beta)** on (account menu, inside the
app only; off by default), the phone keeps a copy of the member's own missions
and shows them at `/offline` when a page cannot load.

This first part is read-only: missions, their checklists, today's check-in and
running timers as last saved. Recording time, ticks and check-ins offline (a
queue replayed when the phone is back online) follows in later parts.

## How it works
- **Service worker** (`/sw.js`, `app/sw.js/route.ts`, source in
  `internal/worker-source.ts`), registered only inside the app with the switch
  on. Page navigations go to the network and are never cached; when one fails,
  the member is sent to `/offline` from the cache. Next.js build files are
  cached on first use. Data requests, Server Actions and API routes are left
  alone, so no personal data enters Cache Storage. Each deploy has its own
  cache, and the worker is never cached itself.
- **`/offline`** (`app/offline/page.tsx`, `components/offline-app.tsx`) is
  built once per deploy with no session, and reads only IndexedDB. It must not
  import a Server Action (a cached page from an older build would carry stale
  action ids) or read cookies: `__tests__/architecture/offline-page.test.ts`
  walks its imports. When the connection returns ("Try again", or the
  `online` event), it checks that the site answers and goes back to the page
  that failed (else Today).
- **Offline copy**: `OfflineSync` (mounted in the workspace layout) calls
  `offlineSnapshotAction` on start, when the app comes to the front and at
  most every 15 minutes. The snapshot holds the member's open assigned
  missions (up to 30) with their Setup/Activity/Closure rows (up to 1,500 rows,
  150 reads), running timers, today's check-ins and an **offline grant**
  (migration 97), plus the phone's clock difference to the server. Another
  member's copy is never shown; sign-out deletes the copy.

## Public API
| File | What it offers |
|---|---|
| `index.ts` | `serviceWorkerSource(deploymentId)`, `OFFLINE_PATH`, and everything in `client.ts` |
| `actions.ts` | `offlineSnapshotAction()` |
| `client.ts` | Snapshot types and rules (`snapshotIsDue`, `storeSnapshot`, `correctedNow`, `asOfLabel`, `childRows`), the IndexedDB store (`readSnapshot`, `saveSnapshot`, `clearOfflineData`), the switch (`readOfflineMode`, `writeOfflineMode`), `registerOfflineWorker`, `unregisterOfflineWorker`, `forgetOfflineData` |
| `components/offline-sync.tsx` | `OfflineSync` (workspace layout) |
| `components/offline-mode-item.tsx` | `OfflineModeItem` (account menu, app only) |
| `components/offline-app.tsx` | `OfflineApp` (the `/offline` page) |

## Private (`internal/`)
| File | Job |
|---|---|
| `rules.ts` | Snapshot shape, limits, freshness, clock offset, labels |
| `snapshot.ts` | Builds the snapshot from the tasks, checklists, time-tracking, attendance and settings modules; issues the grant |
| `store.ts` | IndexedDB copy, Cache Storage clean-up, the switch in localStorage |
| `worker-client.ts` | Registers and removes the service worker |
| `worker-source.ts` | The service worker's text |

## Database it uses
`offline_grant_issue()` and `taskpulse_private.offline_grants` (migration 97,
listed in the attendance README with the offline check-in RPC). Reads go
through the public readers of the modules above.

This is a view module (it composes domain modules), listed in `VIEW_MODULES`
in `__tests__/architecture/boundaries.test.ts`.
