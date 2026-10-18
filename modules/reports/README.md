# reports

What leaders read and keep: the live presentation (one view context and model
used by the dashboard, tasks headline, team pages, timelines and reports), the
report export endpoint (JSON / CSV / text), month close (draft, close, revise,
corrections) with retained revisions, report snapshots, the dashboard
analytics read, and plain-language data-gap wording.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | Server reads: `liveViewContext`, `getLivePresentation`, `monthHistory`, `monthRevision`, archive formatters (`archivedReport`, `archivedText`, `archivedCsv`, `archiveDifferences`, `compareRevisions`), `getTeamAnalytics`, `getWorkbookDashboard`, `getStoredSnapshots`, `handleReportExport`. Also re-exports everything in `client.ts`. |
| `client.ts` | Pure, safe for `'use client'`: `viewContext`, `viewQuery`, `nextDate`, `previousDate`, `buildPresentation`, `liveReport`, `reportCsv`, `reportText`, `csvCell`, `dataGaps`, `GAP_SENTENCE`, `calculationReasons`, `plainReason`, and types (`ViewContext`, `LivePresentation`, `MonthArchive`, ...) |
| `month-actions.ts` | `'use server'` `monthArchiveAction` (draft, close, revise, begin correction); the retired `freezeMonthlySnapshot` stub |
| `report-actions.ts` | `'use server'` `generateReportSnapshotAction` |
| `components/` | `LiveReport`, `ArchivedReport`, `MonthArchiveControls`, `ReportContext`, `OperationalEvidence`, `CopyReport` |

## Private (`internal/`)
| File | Job |
|---|---|
| `presentation/context.ts` | Period/as-of view context and URL query |
| `presentation/clock.ts` | `liveViewContext` on the database observation clock |
| `presentation/queries.ts`, `model.ts` | Loads `live_presentation_context` and builds the presentation with the scoring engine |
| `presentation/export.ts` | Live report JSON / CSV / text |
| `presentation/plain-language.ts` | Data-gap and reason wording |
| `month/archive.ts` | Month archive commands, revisions and comparisons |
| `team-analytics.ts` | Dashboard analytics, workbook charts and stored monthly snapshots |
| `snapshots.ts` | Builds and stores a report snapshot |
| `export.ts` | The export endpoint (route handlers call it via `index.ts`) |

## Database it owns
| Object | Defined in |
|---|---|
| `report_snapshots` | `07_tracker_replacement_foundation.sql` |
| `monthly_performance_snapshots` | `01_init_schema.sql` (read-only history) |
| `live_presentation_context` | `28_live_presentation_and_report_context.sql` |
| `month_archive_command`, `month_archive_history`, `month_archive_read` | `29_month_archive_and_revisions.sql` |

All objects are company-scoped by migrations 39-40 (M15).

## Depends on
`shared/*` and the public APIs of `scoring`, `tasks`, `time-tracking`,
`checklists`, `attendance` and `support`. None of them import reports.
