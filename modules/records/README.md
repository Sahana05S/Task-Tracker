# records

Dated records: the one write path for attendance records, daily facts, ideas,
suggestions, sales logs and meeting points, and their retained revision
history (business date and observed revision time stay separate). Also the
company activity log (Team > Activity): who changed what, read from what the
company already retains.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getRecordHistory(kind, id)` (readable revisions), `isRecordReference(kind, id)`, `RECORD_KINDS`, type `RecordRevision`; activity log: `getActivity(filter, before, limit, known?)` (one page, or `{ available: false }` before migration 54), `handleActivityExport` (the CSV route), `activityFilter`, `parseCursor`, `seesAllActivity`, `ACTIVITY_PAGE`, type `ActivityPage` |
| `components/` | `RecordHistory` (the `/records/[kind]/[id]/history` page body), `ActivityLog` (the `/team/activity` page body: kind pills, member and dates in the URL, day groups, Older / Newest paging, CSV link) |
| `actions.ts` | `'use server'` `writeDatedRecord` (save, withdraw, validate) |

## Private (`internal/`)
| File | Job |
|---|---|
| `input.ts` | Turns a record form into the command payload (attendance hours and local check times; sales and meeting fields) |
| `commands.ts` | Calls `dated_record_command` and checks its `{ id, version }` result |
| `history.ts` | Reads `dated_record_history` and member names |
| `revisions.ts` | Maps raw revisions to readable `RecordRevision` values (action and review labels, dates, attribution) |
| `activity.ts` | Calls `activity_feed` (asks for one row more than shown to know whether "Older" exists; at most 199 per page) and member names |
| `activity-mapping.ts` | Activity URL filter (last 7 days by default, at most 93 days, members forced to themselves), cursor, plain wording and links per row, CSV |
| `activity-export.ts` | `/api/records/activity` CSV: pages through the same read, at most 5000 rows |

## Database it owns
| Object | Defined in |
|---|---|
| `dated_record_command` | `19_attendance_and_support_history.sql`, revised in 20 |
| `dated_record_history` | `19_attendance_and_support_history.sql` |
| `activity_feed` (read only; plus feed indexes on `audit_events`, `input_history`, `log_revisions`, `month_receipts`) | `54_activity_feed.sql` |
| `activity_feed` command de-duplication (a row change inside a shown command is not listed twice) | `57_activity_feed_command_dedupe.sql` |

The tables themselves (attendance records, daily facts, ideas, suggestions,
sales logs, meeting points) belong to `attendance` and `support`, which read
them. All objects are company-scoped by migrations 39-40 (M15).

## Depends on
`shared/*` only. `attendance` and `support` depend on this module.

## Activity log rules (migration 54)
- Sources: dated record history (not the migration baseline), log revisions,
  month receipts, and audit events for missions, checklists, people and
  company items. Derived refreshes (task metrics, checklist rollups, award
  invalidations), system rows and rows already told by a better source are
  left out. Since migration 57 a row-level change made inside a shown command
  (same transaction, so the same audit time) is not listed again; derived
  refresh events never hide a change.
- Managers (managing director, project engineer) see the whole company; any
  other member sees what they did and changes to their account, their dated
  records, their logs and missions they are assigned to. Company separation
  is the M15 row security on every source.
- Tests: `tools/test_activity_feed_database.py` (fresh, upgrade, rollback,
  roles, companies, filters, bounds, paging) and
  `modules/records/__tests__/activity.test.ts`.
