# support

Dated support records: daily facts, ideas, suggestions, sales logs, meetings
(with their points), plus report snapshots. It loads them for the current Asia/Kolkata
period, summarizes them, and supplies the raw contribution (and attendance)
source inputs that scoring reads. See `docs/ARCHITECTURE.md` for the rules.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getSupportModuleData()`, the meeting reads `listMeetings({from,to,taskId})`, `readMeeting(id)` and `listActivePeople()` (migration 136), `summarizeSupport()`, `summarizeEmployeeSupport()`, `loadContributionContext()`, `loadAttendanceContext()`, `parseInputContext()`, the Today reads `getMemberContributionStates()` and `getRecentValidatedContributions()`, summary types, and everything in `client.ts`; `getSaleProofs(saleIds)` (sales proofs of the entries the caller may see them on, migration 102) |
| `actions.ts` | `'use server'` `loadPostChoices` (members and open missions for the quick Post drawer) and the commands `saveReportSnapshotAction`, `deleteReportSnapshotAction`, and the knowledge/sales wrappers (`saveKnowledgeEntryAction`, `deleteKnowledgeEntryAction`, `toggleKnowledgeValidationAction`, `saveSalesLogAction`, `deleteSalesLogAction`) that forward to `writeDatedRecord` |
| `meeting-actions.ts` | `'use server'` meetings (migration 136): `createMeetingAction`, `editMeetingAction`, `saveMinutesAction` (autosave, version-checked), `meetingMemberAction` (add/remove), `withdrawMeetingAction`, `meetingPointAction` (add/edit/withdraw), `setPointStatusAction` (one tap), `loadRecentMeetings` (quick Post) |
| `sales-proof-actions.ts` | `'use server'` sales proofs (migration 102): `startSaleProofUpload`, `saveSaleProof`, `removeSaleProof` |
| `client.ts` | Contribution contract (`rawContribution`, `contributionFromStates`, sales `rawSales`/`salesFromStates`/`SALES_COEFFICIENTS`, coefficients, `RecordKind`, `ValidationState`, `DatedRecordMetadata`), input-context types, permission helpers, `DatedEntry`/`TaskChoice`; meetings: `MeetingSummary`, `MeetingDetail`, `MeetingPoint`, `filterMeetings`, `groupMeetingsByMonth`, `nextPointStatus`, `POINT_STATUSES`, `POINT_TYPES`, `MINUTES_CONFLICT` |
| `components/` | `support-pages.tsx` (`KnowledgeModule`, `SalesLogModule` with each entry's proofs block, `ReportsModule`), `sale-proofs.tsx` (`SaleProofs`), `dated-record-module.tsx` (`DatedRecordModule`, `DatedRecordEditor`), `meetings-list.tsx` (`MeetingsList`: My meetings by month, search, mission and label filters), `meeting-sheet.tsx` (`MeetingSheet`: New / Edit meeting with `MissionPicker`), `meeting-members.tsx` (`MeetingMembers`, `WithdrawMeeting`), `meeting-minutes.tsx` (`MeetingMinutes`: autosave with a Saved indicator and conflict reload), `meeting-points-panel.tsx` (`MeetingPointsPanel`: quick add, one-tap status, details, labels), `mission-meetings.tsx` (`MissionMeetingsPanel` on mission pages, `MeetingsTodayList`), `meetings-today.tsx` (`MeetingsToday` on Today), `quick-meeting-point.tsx` (quick Post's meeting point into a recent meeting), `quick-post-drawer.tsx` (`QuickPostDrawer`: one drawer for all five kinds, last-used kind per device, `presetKind`/`presetTaskId`) and `quick-post-trigger.tsx` (`QuickPostTrigger`, the "Post" pill in the top bar and on mission pages; the phone "New" menu opens the drawer directly) |

## Private (`internal/`)
| File | Job |
|---|---|
| `report-summary.ts` | Team report-snapshot counts from the shared team summary |
| `queries.ts` | Period reads of facts, ideas, suggestions, sales, reports, members and tasks; summaries |
| `meetings.ts` | Meetings reads (`meetings_list`, `meeting_detail`), `meeting_command` / `meeting_point_command` calls, active people (migration 136) |
| `meeting-rules.ts` | Meeting types, mappers, filters, month groups, point statuses (client-safe; exported through `client.ts`) |
| `post-choices.ts` | Quick Post drawer read: active members and open missions (plus a preset mission) |
| `today-queries.ts` | Today reads: a member's contribution states in a range, the latest validated facts/ideas/suggestions (throw on error) |
| `input-context.ts` | Calls and validates the contribution/attendance input-context RPCs |
| `commands.ts` | Report snapshot insert/update/delete and database error messages |
| `input.ts` | Parse and validate the report snapshot form |
| `permissions.ts` | Who may create, manage and validate records and reports (UI messages; the database is the real boundary) |
| `contract.ts` | Raw contribution coefficients and arithmetic (business rule; unchanged) |
| `mappers.ts` | Database row -> domain model, column lists |
| `cache.ts` | Revalidates the support pages after a write; `revalidateMeetings` for meetings |
| `sales-proofs.ts` | Sales proofs read, signed upload links and `sale_proof_command` (migration 102); hands moves and releases to the files module |

## Database it owns
| Object | Kind | Defined in |
|---|---|---|
| `daily_facts`, `ideas`, `suggestions`, `sales_logs`, `meeting_points`, `report_snapshots` | tables | `07_tracker_replacement_foundation.sql` (validation/history columns from 19-20; `meeting_points.meeting_id` from 136) |
| `meetings`, `meeting_members`, `meeting_missions` | tables (no direct access) | `136_meetings.sql` |
| `meeting_command(op, meeting, payload, expected_version, operation)`, `meeting_point_command(op, meeting, point, payload, expected_version, operation)`, `meetings_list(from, to, task)`, `meeting_detail(meeting)`, `can_read_meeting(meeting)` | RPCs | `136_meetings.sql` |
| `contribution_input_context(p_from, p_to_exclusive, p_as_of)` | RPC | 19, replaced in 20 and 21; sales mapped in 46 (`m06-support-inputs-v3`) |
| `attendance_input_context(p_user, p_from, p_to_exclusive, p_as_of)` | RPC (called here for the attendance module) | 20, replaced in 21 |

Reads only (owned elsewhere): `users`, `tasks`. Quick posts use the same
editor and command as the Records tabs, so they stay pending and are validated
there. Record writes for facts, ideas,
suggestions, sales and meetings go through `dated_record_command` (migration
19/20), through the `records` module (`writeDatedRecord`).


Migration 102 (`102_sales_proofs.sql`): `taskpulse_private.sale_proofs`, bucket `sales-proofs` (private, 25 MB, PDF/images/Office) and its policies, `sale_proofs(sales[])`, `sale_proof_command(...)`, `sale_proof_folder_allowed`, `sale_proof_in_use`. The entry's salesperson, the managing director and project engineers see and add proofs; the uploader or one of those managers removes one. Files move to `Proofs/<YYYY-MM>/Sales/<date> - <client> - <salesperson>/` in the Shared Drive.

## Meetings (migration 136, 7 November 2026)

User decisions: a meeting is visible to its members and the managing director only (Managers
lost company-wide access to meeting points); the earlier points were grouped into one meeting per
company, date and meeting type ("<type> meeting" or "Meeting"), whose members are the points'
authors and "to be resolved by" people (a meeting holding only withdrawn points is withdrawn).

- `/meeting-points` lists My meetings; `/meeting-points/<id>` is one meeting: header (date, time,
  type, members with Add member, linked missions), Minutes (prefilled from the company agenda when
  created, autosaved; a save over someone else's newer minutes is refused, PT409, and the member
  reloads), Points (quick add: point, owner, due date; one tap moves the status), Documents (next
  update) and History. A point's own history stays at `/records/meeting/<point>/history`.
- `meeting_command`: create (the creator becomes a member), edit (title, date, start time, type,
  missions), save_minutes, add_member (any member), remove_member (the creator or the MD; never the
  last member), withdraw (the creator or the MD). Audited as `meeting_<op>` on `meetings` (the
  title as the reason, never the minutes), idempotent through `command_receipts`.
- `meeting_point_command`: add / edit / set_status (members and the MD), withdraw (the point's
  author, the meeting's creator or the MD). Whoever is asked to resolve a point joins the meeting.
  The old pending/validated review is not used for meeting points (columns kept); every version
  still goes to `input_history` (kind `meeting`). `dated_record_command` refuses kind `meeting`.
- Labels on points, label pages (`labelled` items carry `meetingId`), Team > Activity and record
  history follow the meeting's readers. Linked missions are only named; opening one follows the
  mission's own rules. The mission picker is `MissionPicker` (tasks module).
- `meetings.business_id` follows once the businesses table (migration 134) is in main.

## Depends on
`shared/*` (Kolkata dates, calendar periods, the observation clock, the shared
`team_summary_inputs` fetch for report counts, `shared/ui/execution-form`),
`types/*`, the `records` module (`writeDatedRecord`), `labels` (`LabelInput` on points), `tasks`
(`MissionPicker`, `getMissionPickerOptions`) and `settings` (`MeetingTypeSelect`:
the meeting-point Meeting type is a select over the company's meeting types,
migration 53, keeping a saved value that left the list). Support does not import
scoring; scoring reads support's contribution inputs.
