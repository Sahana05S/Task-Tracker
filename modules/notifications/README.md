# notifications

The signed-in account's own notifications and the top bar's bell. Migration
92's events (below) and the policies module write them (migrations 56 and 58): a congratulation when a
policy is met for a whole period (once per policy and period, never resent),
and a notice to the managing directors when a policy evaluation fails (once a
day).

## What it does
`NotificationBell` replaces the old placeholder bell in the top bar at every
width. It reads the unread count on load and whenever the tab becomes visible
again; the count is part of its accessible name ("Notifications, 3 unread")
and shows as a badge. Opening it loads the latest 20; choosing one marks it
read and follows its in-app link; "Mark all read" clears the rest. A database
without migration 56 or a failed read says so in the menu (and a small amber
dot on the bell), never a silent zero.

Migration 92 (owned here) adds `taskpulse_private.notify(...)` and the
event triggers: mission assigned and reviewer added (`task_assignees`,
`task_reviewers`), mission status change (`tasks.status`, not the automatic
Not Started -> In Progress), daily star (`award_runs`), and the published
ceremony's monthly star, category winners and announcement (M16). Mission
events come only from a signed-in person's change and never tell people
about their own change. The bell also re-reads its count on the
`stellar:notifications-changed` window event (`NOTIFICATIONS_CHANGED_EVENT`).

## Public API
| File | What it offers |
|---|---|
| `index.ts` | `getUnreadCount()`, `listNotifications(limit)`, and everything in `client.ts` |
| `actions.ts` | `notificationCountAction()`, `notificationInboxAction()`, `markNotificationsReadAction(ids \| null)` (the bell's calls) |
| `client.ts` | Types and `bellLabel`, `badgeText`, `timeAgo`, `safeHref`, `NOTIFICATIONS_CHANGED_EVENT` |
| `components/notification-bell.tsx` | The bell |

## Private (`internal/`)
| File | Job |
|---|---|
| `queries.ts` | `notifications_unread_count`, `notifications_list`, `notifications_mark_read` |
| `rules.ts` | Labels, badge text, relative time, link safety |
| `types.ts` | Shapes |

## Database it uses
`taskpulse_private.notifications` through the self-only functions
`notifications_list`, `notifications_unread_count` and `notifications_mark_read`
(migration 56, owned by the policies module). The database scopes every call to
the signed-in account and company.

## Depends on
`shared/*` only.
