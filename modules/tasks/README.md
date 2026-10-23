# tasks

Missions (tasks): creating and editing them with their assignees, reviewers and
participant shares; the lifecycle (status, progress, scale, review); native
details (Input/Process/Output sections, asset links, related tasks, templates);
the `/tasks` workspace and mission details page; and Task Tools (batch
operations that are previewed first and committed atomically). Since 21 October
2026 Task Tools run from the Missions page: a checkbox column and sticky action
bar in the table, and the same actions per mission in the table and card row
menus. `/task-tools` keeps Recent operations, participant reconciliation and
template versions.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | Server reads: `getTaskWorkspaceData`, `resolveTaskDetailRouteState`, `getTaskDetailData`, `normalizeTaskTagParam`, `getNativeTemplates`, `getNativeDetailState`, `getVisibleReportChoices`, `getParticipantReconciliation`, `getToolLineage` + `buildRecentOperations` (Tools page Recent operations), `getMonthSetupContext` + `countMissionsInMonth` (month setup wizard and the Missions banner), and the Today reads `getMemberTaskIds`, `getOpenTasksByIds`, `countTasksCompletedBetween`. Also re-exports everything in `client.ts`. |
| `client.ts` | Pure rules and types, safe for `'use client'`: task contract (`PRIORITY_WEIGHTS`, `FRESHNESS_SCORES`, `eligibilityReasons`, `classifyFreshness`, `scaleValue`), details contract (`DETAIL_FIELDS`, `ipoLinks`, ...), permissions (`canManageTasks`, `canUpdateTaskOwnFields`, `isAssignedToTask`), shares, mappers (`mapTask`, `TASK_COLUMNS`), Task Tools workflows and types, month helpers (`monthOf`, `addMonths`, `defaultSetupMonth`, `setupBannerMonth`) |
| `actions.ts` | `'use server'` task commands: `createTask`, `updateTask`, `updateTaskStatus`, `updateTaskProgress`, `missionPromptState`, `loadMissionActions`, `createSubMission` (a sub-mission from a checklist add row: `submission_create`, migration 68), `moveMissionFromPrompt` (status prompts: reads the current version and moves only from the status the prompt showed), `changeTaskLifecycle`, `recordTaskReview`, `deleteTask` |
| `detail-actions.ts` | `'use server'` native-details commands: `initializeTaskDetails`, `saveTaskDetails`, `addTaskAsset`, `addTaskRelation`, `renameNativeLink`, `publishNativeTemplate` |
| `tool-actions.ts` | `'use server'` Task Tools: `previewTaskTool`, `commitTaskTool`; month setup: `previewMonthSetup`, `commitMonthSetup` |
| `components/` | `TaskWorkspace` (filters in the URL, table selection, `BulkActionBar`, `TaskRowMenuItems`, `MissionSummarySheet`), `TaskDialog`, `NewTaskButton`, `detail/SubMissionsPanel` + `subMissionFamily` (parent and sub-missions from 'Subtask' dependencies), `MissionActionsMenu` (a mission's Done / Copy / Archive / Edit / Delete from any page; loads on open via `loadMissionActions`), `DeleteMissionSheet`, `TaskLifecyclePanel`, `TaskReviewForm`, `MissionStartToaster` (shell: offers 'Mark In progress' when work is recorded on a Not Started mission, via `shared/ui/mission-progress-event`) and `MissionStatusBanner` (mission page: not started yet / ready to finish), `WorkFileCreator`, native details editor/template manager, `tools/` (`useToolOperation` preview-then-commit hook, `OperationDrawer` with its `PreviewTable`/`CommitResult`, the operation catalogue `operations.ts`, `RecentOperations`), `month-setup/` (`MonthSetupWizard` for `/tasks/setup`, `MissionsPageMenu`, `MonthSetupBanner`), and `detail/` (the mission details page panels) |

## Private (`internal/`)
| File | Job |
|---|---|
| `input.ts` | Parses and validates the task and scale forms |
| `commands.ts` | Task writes: save with participants, lifecycle command, delete, tag lookup |
| `details-commands.ts` | Native-details and template RPCs |
| `cache.ts` | Which pages to revalidate after each kind of change |
| `queries.ts` | `/tasks` workspace data (tasks and members) |
| `effort.ts` | `TaskEffort` totals type and `EMPTY_EFFORT` |
| `detail.ts` | Mission details page data (task, people, sections, links, dependencies, checklist rollup, effort totals) |
| `native-details.ts` | Templates, detail instances, review flags, report choices |
| `reconciliation.ts` | Legacy participant reconciliation preview |
| `member-tasks.ts` | A member's task ids, open tasks and completions for Today (throws on error) |
| `contract.ts` | Task rules: weights, freshness, eligibility, scale |
| `details-contract.ts` | Native detail fields and IPO roles |
| `permissions.ts` | Role/assignment checks (UI messages; RLS and RPCs are the real boundary) |
| `filters.ts` | Workspace filtering and sorting |
| `shares.ts` | Participant share units |
| `mappers.ts`, `credit-summary.ts` | Database row -> domain model, linear participant projection |
| `tools/` | Task Tools contract, support split, workbook workflow list, preview/commit RPCs, `recent.ts` (Recent operations rebuilt from copy lineage in `task_dependencies` and task archives; Done/reopen/section/refresh batches are not listed until the activity log can be read), `month-setup.ts` (pure month setup plan: weekly phases, defaults, coverage filter, payload) and `month-setup-commands.ts` (its RPCs) |

## Database it owns
| Object | Defined in |
|---|---|
| `tasks` | `01_init_schema.sql` (later columns in 07, 10, 16, 17, 25) |
| `task_assignees`, `task_reviewers`, `task_links`, `task_dependencies` | `07_tracker_replacement_foundation.sql` |
| `task_detail_templates`, `task_detail_template_versions`, `task_detail_instances`, `task_detail_sections`, `task_detail_review_flags` | `17_native_task_details_and_templates.sql` |
| `save_task_with_participants` | 10, revised in 12, 16, 17 |
| `create_task_with_scale` | `61_new_mission_scale_mode.sql` |
| `task_lifecycle_command` | `16_task_lifecycle_and_scale_contract.sql` |
| `task_details_command` | 17, revised in 18, 26, 38 |
| `publish_task_detail_template` | `17_native_task_details_and_templates.sql` |
| `task_tools_preview`, `task_tools_command` | 24, revised in 25 (preview also 31, 32, 53 tags, 55 optional Duplicate `title`) |
| `participant_reconciliation` | `10_permissions_and_participant_contract.sql` |
| `month_setup_context`, `month_setup_preview`, `month_setup_commit`, `taskpulse_private.month_setup_items` | `55_month_setup.sql` |

All of these are company-scoped by migrations 39-40 (M15).

## Depends on
`shared/*`, the public API of `checklists` (rollups and checklist types),
`settings` (the company's mission-type names and hidden codes: the create/edit
form offers only active types plus the mission's current one) and
`shared/ui` (mission UI, tracker badges). A new mission may leave its tag blank;
the database allocates the next sheet tag (`<Mon><YY>_<TYPE><n>`, migration 53),
as it does for Task Tools copies. Existing `TT-` tags stay valid. The team headline (scoring's
`MissionHeadlineStrip`) is shown collapsed on Team > Analytics; `countOpenTasks`
feeds the navigation badge.

## New mission scale mode (migration 61)
The New mission dialog asks how the mission is weighted, starting from the
company default (`useDefaultScaleMode()` from `settings`): Fixed weight (the
typed Scale weight, saved by `save_task_with_participants` as before), Hours
logged (multiplier, default 1) or Activity count (a whole number of activities
and a scale per activity). The two formula modes call `create_task_with_scale`,
which saves the mission at scale 0 and applies the versioned scale command in
the same transaction, with its own receipt for retries. Linked scales need a
source mission and stay in the Lifecycle and scale panel, as do later changes.
`parseNewMissionScale` (internal/input.ts) checks the inputs first.

## Missions page rules (DECISIONS "Bulk actions on the Missions table", 21 Oct 2026)
- The table (from 768px, `?view=table`) has a checkbox column; the header box
  selects the visible rows. Changing filters drops hidden rows from the selection.
- Batch actions (Done, Reopen, Confirm section, Refresh, Archive) act on the
  selection; copy actions (Duplicate, Weekly / Day-count phases, One per member,
  Number and suffix, Support split, Carryover) need exactly one row.
- Members get Done and Refresh only (on their own missions in row menus); the
  database (`task_tools_command`) enforces the same.
- Every action previews first; the commit reuses the preview's operation key.
- Cards have the same single-mission actions in their menu and no select mode.

Tasks does not import time-tracking (time-tracking depends on tasks). The task
cards take a `LogHoursAction` slot that the `/tasks` page fills, and the mission
page loads logs and timers from time-tracking itself. In the same way the
cards and the table take a `WaypointSlot` (recognition's waypoint track and the
table's Waypoint column, left out without it), and `MissionOverview` takes a
`belowProgress` node; tasks does not import recognition.

Roadmap public reads: `getAssignedMissionBatch`, `getAssignedRoadmapMission`, `countAssignedMissionsCompletedBetween` (internal/roadmap.ts). Client contract/filter/order helpers live in roadmap-contract.ts and are exported through client.ts. Batches keyset by due date/UUID to agree with PostgreSQL ordering, preserve legacy primary and participant assignments, and fetch no whole-company task list.

## Month setup (DECISIONS "Month setup wizard - 21 October 2026", migration 55)
- `/tasks/setup` (managing director and project engineer; the Missions page menu,
  and a banner from the 25th while next month has no missions). Five steps: month
  (current or next), standing missions × active members (all ticked; single-owner
  missions go to their owner or the MD), weekly Tasks Review phases (7 days from
  the 1st, the last clipped; owner the MD), earlier missions (Repeat as new /
  Carry over remaining / Skip; Done and Discarded skip, a title naming its month
  repeats, 0 < progress < 100 carries over; missions the standing list or phases
  recreate are hidden), then one preview and one atomic commit.
- Repeat as new is the approved D12 copy (Task Tools `duplicate`, which takes an
  optional `title` since 55) named with the month moved on. Carry over is the
  D12 handoff (`carryover`) unchanged, so it only targets a month that has started. A month set up before its 1st gets
  standing missions, phases and repeats; its carry-overs are made from the 1st by
  opening the wizard again (steps 2-3 then show as already set up).
- Standing and phase missions take their sheet tags at commit, in plan order; a
  month is set up once (`month_setup_items` unique per cell, week and source).
- Harness: `tools/test_month_setup_database.py`.
