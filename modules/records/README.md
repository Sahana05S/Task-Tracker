# records

Dated records: the one write path for attendance records, daily facts, ideas,
suggestions, sales logs and meeting points, and their retained revision
history (business date and observed revision time stay separate). Also the
company activity log (Team > Activity): who changed what, read from what the
company already retains.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getRecordHistory(kind, id)` (readable revisions, null when missing or not yours), `isRecordReference(kind, id)`, `RECORD_KINDS`, type `RecordRevision`; activity log: `getActivity(filter, before, limit, known?)` (one page, or `{ available: false }` before migration 54), `handleActivityExport` (the CSV route), `activityFilter`, `parseCursor`, `seesAllActivity`, `ACTIVITY_PAGE`, type `ActivityPage`; mission history: `getMissionActivity(taskId, before, names, limit?)` (one page of one mission's lines, or `{ available: false }` before migration 124 or for someone not on the mission), `MISSION_ACTIVITY_PAGE`, types `MissionActivityEntry`, `MissionActivityPage` |
| `components/` | `RecordHistory` (the `/records/[kind]/[id]/history` page body), `ActivityLog` (the `/team/activity` page body: kind pills, member and dates in the URL, day groups, Older / Newest paging, CSV link), `MissionActivity` (the mission History tab's Activity panel: day groups, before -> after values, Older / Newest paging) |
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
| `mission-activity.ts` | Calls `mission_activity` (one row more than shown, at most 199 per page) |
| `mission-activity-mapping.ts` | Mission lines in words with names (people rows of one save merge: "Padmapriya and Sahana were added to the Mission Crew"), before -> after values (shares as %, dates, scale, progress), files, objectives and Quest owners |
| `activity-export.ts` | `/api/records/activity` CSV: pages through the same read, at most 5000 rows |

## Database it owns
| Object | Defined in |
|---|---|
| `dated_record_command` | `19_attendance_and_support_history.sql`, revised in 20 |
| `dated_record_history` | `19_attendance_and_support_history.sql` |
| `activity_feed` (read only; plus feed indexes on `audit_events`, `input_history`, `log_revisions`, `month_receipts`) | `54_activity_feed.sql` |
| `activity_feed` command de-duplication (a row change inside a shown command is not listed twice) | `57_activity_feed_command_dedupe.sql` |
| `activity_feed` lists Settings > Company saves (`company_settings_<section>` on `organization_settings`) | `59_activity_feed_company_settings.sql` |
| `mission_activity(task, before, limit)` (read only; one mission's history), `taskpulse_private.audit_mission` and the `audit_events_mission_idx` / `audit_events_checklist_idx` indexes; `activity_feed` lists `task_proofs` and names a `task_people_*` line's member; `audit_write` keeps a mission's title, type and dates, participant roles, link labels and dependency missions as before / after values | `124_mission_activity.sql` |

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
  Since migration 111 Mistakes and learning notes, and since 116 labels: the
  label directory's changes (Company kind, linking to `/labels`) and each label
  added to or removed from a record (Missions kind, with the record's mission);
  the label's name arrives as the entry's reason.
- Managers (managing director, project engineer) see the whole company,
  except that since migration 120 a project engineer sees mission lines only
  for missions they work on, review or observe (plus their own actions); any
  other member sees what they did and changes to their account, their dated
  records, their logs and missions they are assigned to. Company separation
  is the M15 row security on every source.
- Mission Activity (migration 124, the mission's History tab) is the one
  mission's view: the managing director and the mission's people
  (`can_read_mission_work`) read it, anyone else is refused. It lists the
  mission's commands and, unlike Team > Activity, the row-level participant,
  link, dependency and mission-field changes inside a save, so each person
  added or removed is named. A save or people command whose rows are listed
  is not repeated; a lifecycle command (status, progress, scale) keeps one
  line with its before and after values, and the equal Crew re-split (migration
  121) is part of the add or remove line. Time logs and timer sessions keep
  their own panels. A retried command returns from its receipt and writes no
  second line. Both views use the same words (`activitySummary`).
- Tests: `tools/test_activity_feed_database.py` (fresh, upgrade, rollback,
  roles, companies, filters, bounds, paging; 124: named Crew lines, files,
  scale values, retries, refusals, paging) and
  `modules/records/__tests__/activity.test.ts`, `mission-activity.test.ts`.
