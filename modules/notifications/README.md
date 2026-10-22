# notifications

The signed-in account's own notifications and the top bar's bell. Today the
policies module writes them (migrations 56 and 58): a congratulation when a
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

## Public API
| File | What it offers |
|---|---|
| `index.ts` | `getUnreadCount()`, `listNotifications(limit)`, and everything in `client.ts` |
| `actions.ts` | `notificationCountAction()`, `notificationInboxAction()`, `markNotificationsReadAction(ids \| null)` (the bell's calls) |
| `client.ts` | Types and `bellLabel`, `badgeText`, `timeAgo`, `safeHref` |
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
