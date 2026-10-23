# records

Dated records: the one write path for attendance records, daily facts, ideas,
suggestions, sales logs and meeting points, and their retained revision
history (business date and observed revision time stay separate). Also the
company activity log (Team > Activity): who changed what, read from what the
company already retains, and each mission's change log (mission page >
History): every action on the mission with every value it changed.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getRecordHistory(kind, id)` (readable revisions), `isRecordReference(kind, id)`, `RECORD_KINDS`, type `RecordRevision`; activity log: `getActivity(filter, before, limit, known?)` (one page, or `{ available: false }` before migration 54), `handleActivityExport` (the CSV route), `activityFilter`, `parseCursor`, `seesAllActivity`, `ACTIVITY_PAGE`, type `ActivityPage`; mission change log: `getMissionHistory(taskId, before)` (one page, or `{ available: false }` before migration 68), `parseHistoryCursor`, type `MissionHistoryPage` |
| `components/` | `RecordHistory` (the `/records/[kind]/[id]/history` page body), `ActivityLog` (the `/team/activity` page body: kind pills, member and dates in the URL, day groups, Older / Newest paging, CSV link), `MissionChangeLog` (the mission page's History tab: day groups, one entry per action with its changed values, Older / Newest paging) |
| `actions.ts` | `'use server'` `writeDatedRecord` (save, withdraw, validate) |

## Private (`internal/`)
| File | Job |
|---|---|
| `input.ts` | Turns a record form into the command payload (attendance hours and local check times; sales and meeting fields) |
| `commands.ts` | Calls `dated_record_command` and checks its `{ id, version }` result |
| `history.ts` | Reads `dated_record_history` and member names |
| `revisions.ts` | Maps raw revisions to readable `RecordRevision` values (action and review labels, dates, attribution) |
| `activity.ts` | Calls `activity_feed` (asks for one row more than shown to know whether "Older" exists; at most 199 per page) and member names |
| `activity-mapping.ts` | Activity URL filter (last 7 days by default, at most 93 days, members forced to themselves), cursor, plain wording and links per row (including Settings > Company sections), CSV |
| `mission-history.ts` | Calls `mission_history` (asks for one action more than shown to know whether "Older" exists) and member names |
| `mission-history-mapping.ts` | Groups `mission_history` rows into one entry per action (a transaction), with a headline and one "Field: before → after" line per changed value |
| `activity-export.ts` | `/api/records/activity` CSV: pages through the same read, at most 5000 rows |

## Database it owns
| Object | Defined in |
|---|---|
| `dated_record_command` | `19_attendance_and_support_history.sql`, revised in 20 |
| `dated_record_history` | `19_attendance_and_support_history.sql` |
| `activity_feed` (read only; plus feed indexes on `audit_events`, `input_history`, `log_revisions`, `month_receipts`) | `54_activity_feed.sql` |
| `activity_feed` command de-duplication (a row change inside a shown command is not listed twice) | `57_activity_feed_command_dedupe.sql` |
| `audit_events.task_id` / `.detail`, `audit_write` keeping every changed value of the mission tables, `mission_history` (read only) | `68_mission_change_log.sql` |
| `activity_feed` lists Settings > Company saves (`company_settings_<section>` on `organization_settings`) | `59_activity_feed_company_settings.sql` |

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
  refresh events never hide a change. Since migration 59 each Settings >
  Company save is one Company line ("Changed the meeting agenda", "Changed
  the mission types", "Changed the meeting types", "Changed the standing
  missions", "Changed the holiday calendar") linking to that section of
  `/settings?tab=company`; the settings row's own version bump is not listed.
- Managers (managing director, project engineer) see the whole company; any
  other member sees what they did and changes to their account, their dated
  records, their logs and missions they are assigned to. Company separation
  is the M15 row security on every source.
- Tests: `tools/test_activity_feed_database.py` (fresh, upgrade, rollback,
  roles, companies, filters, bounds, paging) and
  `modules/records/__tests__/activity.test.ts`.

## Mission change log rules (migration 68)
- Every change to a mission, its assignees, reviewers, links, sections,
  checklist and rows, timers and time logs keeps its before and after values
  (bookkeeping columns such as versions and timestamps left out, text cut at
  400 characters) and the mission it belongs to. Rows from before 68 show the
  values they kept (status, priority, progress, hours, people, timer times)
  and otherwise only name the changed field.
- One entry per action: the command and every row it changed share one
  transaction time. Rows without a person and derived refreshes are left out.
- Managers, the mission's assignees and its reviewers see every change; any
  other member sees only their own. Team > Activity links each mission line
  to this log.
- Tests: `modules/records/__tests__/mission-history.test.ts` (wording).
