# reports

What members send and leaders read and keep: the member's daily report
(Reports > Daily report, with the WhatsApp share text), the live presentation (one view context and model
used by the dashboard, tasks headline, team pages, timelines and reports), the
report export endpoint (JSON / CSV / text), month close (draft, close, revise,
corrections) with retained revisions, report snapshots, the dashboard
analytics read, and plain-language data-gap wording.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | Server reads: `liveViewContext`, `getLivePresentation`, `monthHistory`, `monthRevision`, archive formatters (`archivedReport`, `archivedText`, `archivedCsv`, `archiveDifferences`, `compareRevisions`), `getTeamAnalytics`, `getDailyPerfLog`, `getWorkbookDashboard`, `handleReportExport`. Also re-exports everything in `client.ts`. |
| `client.ts` | Pure, safe for `'use client'`: `viewContext`, `viewQuery`, `nextDate`, `previousDate`, `buildPresentation`, `liveReport`, `reportCsv`, `reportText`, `csvCell`, the daily report (`dailyReport`, `dailyReportText`, `compiledLogs`, `reportsTab`, `longDate`), `dataGaps`, `GAP_SENTENCE`, `calculationReasons`, `plainReason`, the daily perf log's pure parts (`dailyPerfFilter`, `dailyPerfRows`, `dailyPerfCsv`, `seesTeamDetail`, `DAILY_PERF_STATUS_LABEL`), and types (`ViewContext`, `LivePresentation`, `MonthArchive`, ...) |
| `month-actions.ts` | `'use server'` `monthArchiveAction` (draft, close, revise, begin correction); the retired `freezeMonthlySnapshot` stub |
| `report-actions.ts` | `'use server'` `generateReportSnapshotAction` |
| `components/` | `DailyReportView` (member and day pickers, today / yesterday, open missions, log compilation range, validity strip), the "Share as text" panel (uses `shared/ui/share-text`: Send on WhatsApp, Copy, and the phone share sheet where available), member panels `TaskList` / `TaskLogSummary` / `TaskLogCompilation` (also used by the employee profile), `LiveReport`, `ArchivedReport`, `MonthArchiveControls`, `ReportContext`, `OperationalEvidence`, `CopyReport`, `MissionActivityView` (Reports > Mission activity) |

## Private (`internal/`)
| File | Job |
|---|---|
| `presentation/context.ts` | Period/as-of view context and URL query |
| `presentation/clock.ts` | `liveViewContext` on the database observation clock |
| `presentation/queries.ts`, `model.ts` | Loads `live_presentation_context` and builds the presentation with the scoring engine |
| `presentation/export.ts` | Live report JSON / CSV / text |
| `presentation/daily-report.ts` | Daily report read model and the WhatsApp text (bold with asterisks, eight logs per day then "(n more)"); which Reports tab a URL shows |
| `presentation/plain-language.ts` | Data-gap and reason wording |
| `month/archive.ts` | Month archive commands, revisions and comparisons |
| `team-analytics.ts` | Dashboard analytics, workbook charts, stored monthly snapshots, and `getDailyPerfLog` (award read model days + unreversed hours per member-day) |
| `daily-perf-log.ts` | Daily perf log filter (URL values, month to date by default, at most 92 days, members forced to themselves), rows from each day's latest retained daily run (Calculated / Not certified / Not calculated) and the CSV |
| `snapshots.ts` | Builds and stores a report snapshot |
| `export.ts` | The export endpoint (route handlers call it via `index.ts`); `report=daily-log` returns the daily perf log CSV for `member`, `from`, `to` |

## Database it owns
| Object | Defined in |
|---|---|
| `report_snapshots` | `07_tracker_replacement_foundation.sql` |
| `monthly_performance_snapshots` | `01_init_schema.sql` (read-only history) |
| `live_presentation_context` | `28_live_presentation_and_report_context.sql`, `82_presentation_series_on_demand.sql` (`p_series`), `87_live_presentation_read_once.sql` (history read by keys, mission ids collected once; same result), `104_member_presentation_month_level.sql` (team members get colleagues' attendance and other missions' hours only for month-level windows; the per-day `series` is for managers) |
| `month_archive_command`, `month_archive_history`, `month_archive_read` | `29_month_archive_and_revisions.sql` |

All objects are company-scoped by migrations 39-40 (M15).

## Depends on
`shared/*` and the public APIs of `scoring`, `tasks`, `time-tracking`,
`checklists`, `attendance` and `support`. None of them import reports.

## Reports page tabs
`/reports` opens on **Daily report**: `?member=<employee id>&date=YYYY-MM-DD&from=&to=`.
Members see only themselves; managers pick anyone (the same rule as the profile
pages). The day's month is read live through `getLivePresentation(view, member)`,
so logs back-dated to that day show. The per-day `series` (one recomputation per
day of the month) is built only on request, `getLivePresentation(view, member,
{ series: true })`, which only the team profile charts use; without it `series`
is empty. **Month close** is `?tab=month` and still
answers the older `?period=`, `?asOf=` and `?revision=` links; it holds the
archive controls, live or archived report, downloads and the retained saved
reports table (`ReportsModule` from support). **Mission activity** is
`?tab=activity&mission=<tag>` (3 November 2026): pick a mission and see its timer
sessions, who ran each, how long, and what they changed while it ran
(`MissionActivityView`, reusing time-tracking's `TimerRecords` without Stop or
Discard and its `getTimerSessionActivity`, migration 110). Managers see every
session, members their own, as on the mission's History tab; the page composes
the reads (tasks' `getMissionChoices`, team's `getMemberNames`), so reports
imports neither team nor any module's internals.
