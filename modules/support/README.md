# support

Dated support records: daily facts, ideas, suggestions, sales logs and meeting
points, plus report snapshots. It loads them for the current Asia/Kolkata
period, summarizes them, and supplies the raw contribution (and attendance)
source inputs that scoring reads. See `docs/ARCHITECTURE.md` for the rules.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getSupportModuleData()`, `getMeetingPointsData()`, `summarizeSupport()`, `summarizeEmployeeSupport()`, `loadContributionContext()`, `loadAttendanceContext()`, `parseInputContext()`, summary types, and everything in `client.ts` |
| `actions.ts` | `'use server'` commands: `saveReportSnapshotAction`, `deleteReportSnapshotAction`, and the knowledge/sales wrappers (`saveKnowledgeEntryAction`, `deleteKnowledgeEntryAction`, `toggleKnowledgeValidationAction`, `saveSalesLogAction`, `deleteSalesLogAction`) that forward to `writeDatedRecord` |
| `client.ts` | Contribution contract (`rawContribution`, `contributionFromStates`, coefficients, `RecordKind`, `ValidationState`, `DatedRecordMetadata`), input-context types, permission helpers, `DatedEntry`/`TaskChoice` |
| `components/` | `support-pages.tsx` (`KnowledgeModule`, `SalesLogModule`, `ReportsModule`) and `dated-record-module.tsx` (`DatedRecordModule`, `DatedRecordEditor`) |

## Private (`internal/`)
| File | Job |
|---|---|
| `report-summary.ts` | Team report-snapshot counts from the shared team summary |
| `queries.ts` | Period reads of facts, ideas, suggestions, sales, reports, members and tasks; summaries |
| `meeting-queries.ts` | Meeting points page read (meeting points, members, tasks) |
| `input-context.ts` | Calls and validates the contribution/attendance input-context RPCs |
| `commands.ts` | Report snapshot insert/update/delete and database error messages |
| `input.ts` | Parse and validate the report snapshot form |
| `permissions.ts` | Who may create, manage and validate records and reports (UI messages; the database is the real boundary) |
| `contract.ts` | Raw contribution coefficients and arithmetic (business rule; unchanged) |
| `mappers.ts` | Database row -> domain model, column lists |
| `cache.ts` | Revalidates the support pages after a write |

## Database it owns
| Object | Kind | Defined in |
|---|---|---|
| `daily_facts`, `ideas`, `suggestions`, `sales_logs`, `meeting_points`, `report_snapshots` | tables | `07_tracker_replacement_foundation.sql` (validation/history columns from 19-20) |
| `contribution_input_context(p_from, p_to_exclusive, p_as_of)` | RPC | 19, replaced in 20 and 21 |
| `attendance_input_context(p_user, p_from, p_to_exclusive, p_as_of)` | RPC (called here for the attendance module) | 20, replaced in 21 |

Reads only (owned elsewhere): `users`, `tasks`. Record writes for facts, ideas,
suggestions, sales and meetings go through `dated_record_command` (migration
19/20), through the `records` module (`writeDatedRecord`).

## Depends on
`shared/*` (Kolkata dates, calendar periods, the observation clock, the shared
`team_summary_inputs` fetch for report counts, `shared/ui/execution-form`),
`types/*`, and legacy code not yet in modules: `components/missions/mission-ui`,
the `records` module (`writeDatedRecord`). Support does not import scoring;
scoring reads support's contribution inputs.
