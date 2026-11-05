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
| `index.ts` | Server reads: `getTaskWorkspaceData`, `getMissionChoices` (every mission as id, tag and title for pickers; one narrow read), `resolveTaskDetailRouteState`, `getTaskDetailData`, `normalizeTaskTagParam`, `getNativeTemplates`, `getNativeDetailState`, `getVisibleReportChoices`, `getParticipantReconciliation`, `getToolLineage` + `buildRecentOperations` (Tools page Recent operations), `getMonthSetupContext` + `countMissionsInMonth` (month setup wizard and the Missions banner), and the Today reads `getMemberTaskIds`, `getOpenTasksByIds`, `countTasksCompletedBetween`; `getTaskProofs` (a mission's proofs and Input / Process / Output documents, each with its `kind`; null for anyone outside its people and managers). Also re-exports everything in `client.ts`. |
| `client.ts` | Pure rules and types, safe for `'use client'`: task contract (`PRIORITY_WEIGHTS`, `FRESHNESS_SCORES`, `eligibilityReasons`, `classifyFreshness`, `scaleValue`), details contract (`DETAIL_FIELDS`, `ipoLinks`, ...), permissions (`canManageTasks`, `canUpdateTaskOwnFields`, `isAssignedToTask`, `isTaskWorker`, `canEditTaskDetails`, `canManageTaskPeople`, `missionRelationship`, and for migration 117 `canReadMissionWork`, `canMarkMissionDone`, `canWriteMissionFiles`, `canManageMissionObservers`), shares, mappers (`mapTask`, `TASK_COLUMNS`), Task Tools types, month helpers (`monthOf`, `addMonths`, `defaultSetupMonth`, `setupBannerMonth`), proof rules (`proofFileProblem`, `proofMimeType`, `PROOF_ACCEPT`, `MAX_PROOF_BYTES`, `formatProofSize`, `MissionProof`, and for migration 113 `MISSION_FILE_KINDS`, `MISSION_DOCUMENT_KINDS`, `isMissionFileKind`, `missionFilesOfKind`, `missionFileFolder`) and `uploadProofToTicket` (browser half of a proof upload) |
| `actions.ts` | `'use server'` task commands: `createTask`, `updateTask`, `updateTaskStatus`, `updateTaskProgress`, `missionPromptState`, `loadMissionActions`, `createSubMission` (a sub-mission from a checklist add row: `submission_create`, migration 68), `addSubMission` (the same from the Missions list's row menu, into the parent's root checklist in the chosen phase; reads the parent's current version), `moveMissionFromPrompt` (status prompts: reads the current version and moves only from the status the prompt showed), `changeTaskLifecycle`, `recordTaskReview`, `changeTaskPeople` (Crew and observers: `task_people_command`), `deleteTask` |
| `detail-actions.ts` | `'use server'` native-details commands: `initializeTaskDetails`, `saveTaskDetails`, `addTaskAsset`, `addTaskRelation`, `renameNativeLink`, `publishNativeTemplate` |
| `tool-actions.ts` | `'use server'` Task Tools: `previewTaskTool`, `commitTaskTool`; month setup: `previewMonthSetup`, `commitMonthSetup` |
| `proof-actions.ts` | `'use server'` mission proofs (migration 101): `startProofUpload` (signed link in the mission's upload folder), `saveProof`, `removeProof`. The files module moves each proof into the Shared Drive at `Proofs/<YYYY-MM>/<Task tag> - <Title>/` after the response. With a `kind` of `input`, `process` or `output` (migration 113) the same actions add a mission document, filed at `Missions/<YYYY-MM>/<Task tag> - <Title>/{Input,Process,Output}/`; the one Files panel on the Work tab (`detail/FilesPanel`, 4 November 2026) shows Input, Process, Output and Proofs, each one list of uploads and the pasted links of that IPO role (`task_links.ipo_role`, marked Link). Upload is the main action, open to managers, the Crew and reviewers (never observers); "Add a link instead" (`detail/AddLinkForm`, `addTaskAsset`) is the small option for Input / Process / Output, open to whoever edits the details. Reference and legacy links stay readable under Other links |
| `components/` | `TaskWorkspace` (filters in the URL, table selection, `BulkActionBar`, `TaskRowMenuItems`, `MissionSummarySheet`; sub-missions follow their parent through `internal/grouping.ts` `nestSubMissions`, collapsible in the table, with `PartOfChip` / `SubMissionCount` and `SubMissionSheet` for Add sub-mission), `TaskDialog`, `NewTaskButton`, `detail/SubMissionsPanel` + `subMissionFamily` (parent and sub-missions from 'Subtask' dependencies), `MissionActionsMenu` (a mission's Done / Copy / Archive / Edit / Delete from any page; loads on open via `loadMissionActions`), `DeleteMissionSheet`, `TaskLifecyclePanel`, `TaskReviewForm`, `MissionStartToaster` (shell: offers 'Mark In progress' when work is recorded on a Not Started mission, via `shared/ui/mission-progress-event`) and `MissionStatusBanner` (mission page: not started yet / ready to finish), native details editor (text and related missions; no link form)/template manager, `tools/` (`useToolOperation` preview-then-commit hook, `OperationDrawer` with its `PreviewTable`/`CommitResult`, the operation catalogue `operations.ts`, `RecentOperations`), `month-setup/` (`MonthSetupWizard` for `/tasks/setup`, `MissionsPageMenu`, `MonthSetupBanner`), and `detail/` (the mission details page panels) |

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
| `mappers.ts` | Database row -> domain model, linear participant projection |
| `tools/` | Task Tools contract, support split, workbook workflow list, preview/commit RPCs, `recent.ts` (Recent operations rebuilt from copy lineage in `task_dependencies` and task archives; Done/reopen/section/refresh batches are not listed until the activity log can be read), `month-setup.ts` (pure month setup plan: weekly phases, defaults, coverage filter, payload) and `month-setup-commands.ts` (its RPCs) |

## Database it owns
| Object | Defined in |
|---|---|
| `tasks` | `01_init_schema.sql` (later columns in 07, 10, 16, 17, 25) |
| `taskpulse_private.task_proofs`, bucket `mission-proofs` (private, 25 MB, PDF/images/Office) and its policies, `task_proofs(task)`, `task_proof_command(...)`, `task_proof_folder_allowed`, `task_proof_in_use`: the mission's assignees and reviewers plus the managing director and project engineers see and add proofs; the uploader or a manager removes one. Since 117 the files follow `can_read_mission_work` (project engineers only when on the mission) and observers only view: `taskpulse_private.task_proof_writer`, `task_proof_folder_writable` (bucket upload and discard policies). `task_proofs.kind` (proof / input / process / output) and `task_proof_command(..., p_kind)` add Input / Process / Output documents on the same rules | `101_mission_proofs.sql`, `113_mission_ipo_documents.sql` |
| `task_assignees`, `task_reviewers`, `task_links`, `task_dependencies` | `07_tracker_replacement_foundation.sql` |
| `task_detail_templates`, `task_detail_template_versions`, `task_detail_instances`, `task_detail_sections`, `task_detail_review_flags` | `17_native_task_details_and_templates.sql` |
| `save_task_with_participants` | 10, revised in 12, 16, 17, 108 (compares credited assignees and non-observer reviewers only) |
| `task_people_command`, `is_task_worker` (public and `taskpulse_private`), `taskpulse_private.task_people_snapshot` | `108_mission_people.sql`; observers chosen by the managing director, Owner and assignees since 117; since `121_mission_crew.sql` Crew commands (`add_crew` / `remove_crew`) for the managing director and Managers, observers also by the Crew, and `is_task_worker` is any `task_assignees` row |
| `taskpulse_private.crew_equal_split` | `121_mission_crew.sql`: equal split of a mission's Crew, a new `participant_version` when a share moves |
| `taskpulse_private.can_read_mission_work`, `public.can_read_mission_work(task)`, `public.can_read_checklist(checklist)`; read policies `m01_read` on `task_checklists`, `checklist_nodes`, `task_detail_sections`, `m05_section_read` on `checklist_sections`, `m04_links_read` on `task_links`; the write-only `m01_admin_insert` / `_update` / `_delete` policies that replace `m01_admin` on those four tables; the Done rule in `taskpulse_private.task_command` | `117_checklist_visibility.sql`; since `120_mission_work_engineer_scope.sql` a project engineer's writes (`checklist_command`, `task_details_command`, the `m01_admin_*` policies) also need `can_read_mission_work`, and their Team > Activity mission lines are only those of their missions. The interface follows the same rule (`canReadMissionWork`): the Missions cards, table and Quick summary show the checklist link only to those who may read it (others see "Private"), the mission page drops the Details tab for them, and employee reports show their checklist items as plain "Private objective" text |
| `create_task_with_scale` | `61_new_mission_scale_mode.sql` |
| `task_lifecycle_command` | `16_task_lifecycle_and_scale_contract.sql` |
| Review invalidation (`invalidate_reviews` triggers) and the Done gate `assert_checklist_done` | 16 and 18; since `114_objective_review.sql` a time log no longer clears the mission's approvals (D-D3) and Done also waits for every checklist objective to be acknowledged (see modules/checklists) |
| `task_details_command` | 17, revised in 18, 26, 38, 108 (the mission's people save details, relations and link labels) |
| `publish_task_detail_template` | `17_native_task_details_and_templates.sql` |
| `task_tools_preview`, `task_tools_command` | 24, revised in 25 (preview also 31, 32, 53 tags, 55 optional Duplicate `title`); since 115 a copy puts only non-observer reviewers through the save and then adds the source's active Observers (support splits and one-per-member copies carry none); since 121 the whole Crew goes through the save with equal shares and `collaborators` is always empty (`tools/test_task_tools_people_database.py`) |
| `participant_reconciliation` | `10_permissions_and_participant_contract.sql` |
| `month_setup_context`, `month_setup_preview`, `month_setup_commit`, `taskpulse_private.month_setup_items` | `55_month_setup.sql`; `99_month_setup_commit_timeout.sql` gives the commit a 60 s statement timeout (a full month takes about 8.5 s, over the 8 s API cap) |

All of these are company-scoped by migrations 39-40 (M15).

## Mission people (migrations 108 and 121)

Since 5 November 2026 (migration 121, user decision) everyone on a mission is
**Crew**: equal shares, no Mission Lead, no owner power.

| Relationship | Stored as | May |
|---|---|---|
| Crew | any `task_assignees` row (equal `share_units`; one row stays `is_primary` = `tasks.assignee_id` because `check_participants` needs it, with no extra power) | log time, tick and build the checklist, edit details, add files, mark Done, choose observers, share the credit equally |
| Reviewer | `task_reviewers` Primary / Secondary | read the checklist, add files, review; their approval gates Done |
| Observer | `task_reviewers` `reviewer_role='Observer'` | read the checklist and files and get notifications; never tick, edit, upload, review or block Done |

Mission settings and the Crew belong to the managing director and Managers
(`project_engineer` until the role rename). Migration 121 re-split every open
configured mission equally under a new `participant_version` (earlier versions
and Done / Discarded missions unchanged); `set_task_participants` and
`save_task_with_participants` ignore passed shares.

**Who sees a mission's checklist and work (migration 117, user decision 4
November 2026).** The checklist, its rows and sections, details, links, files,
objective reviews, item time, timer session lines and mistakes and learning are
readable only by the managing director and the mission's people above (any
`task_assignees` row, the legacy `tasks.assignee_id`, any `task_reviewers`
row). Project engineers read them only when they are one of those. Everyone
else still sees the mission in lists and its people and progress
(`tasks`, `task_assignees`, `task_reviewers`, `checklist_rollups` stay
company-wide); its Work and Details tabs and `/tasks/[tag]/checklist` show
"This checklist is private to the mission's people" (`MissionWorkPrivate`,
`canReadMissionWork`). The definer reads (`checklist_branch`,
`checklist_reviews`, `checklist_item_seconds`, `timer_session_activity`,
`task_effort_breakdown`, `task_proofs`, `mission_learnings`) raise 42501 for
anyone else rather than returning an empty result, so a private checklist is
never mistaken for an empty one. Scores, reports and awards read through their
own definer functions and are unaffected. The Today Whole team view and opening
another member's branch are for the managing director only.

`task_people_command(task, command, {user_id}, lifecycle_version, operation)`
runs `add_crew` / `remove_crew` (`add_collaborator` / `remove_collaborator` are
aliases) for the managing director and Managers on configured missions, and
`add_observer` / `remove_observer` for those and the mission's Crew (121).
`transfer_owner` is retired. A Crew change re-splits the shares equally and
advances `participant_version`; removing the primary passes the row to the next
member; the last member and a member with a running timer cannot be removed.
It bumps `lifecycle_version`, writes `audit_events` (`task_people_add_crew`, ...)
and a command receipt. The edit form (`TaskDialog`) lists the whole Crew with no
Owner picker and no share boxes; observers are managed on the mission page
("Manage crew"). `Task.observerIds` carries observers; `reviewerIds` excludes them.
`getAssignedMissionBatch` sets `relationship` on each mission and returns
reviewer and observer missions only with `{ watching: true }`.
Tests: `tools/test_task_people_database.py`.

## Depends on
`shared/*`, the public API of `labels` (chips on cards and table rows, the
Missions Labels filter `?label=a&label=b` and the New mission form's labels,
attached after the mission is created; the page passes `labels` to
`TaskWorkspace`), the public API of `checklists` (rollups and checklist types),
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

Roadmap public reads: `getAssignedMissionBatch`, `getAssignedRoadmapMission`, `getMissionLinks`, `countAssignedMissionsCompletedBetween` (internal/roadmap.ts). Client contract/filter/order helpers live in roadmap-contract.ts and are exported through client.ts (`canTimeMission`: only the Crew runs a timer or logs time, so Today hides the timer for reviewers and observers). Batches keyset by due date/UUID to agree with PostgreSQL ordering, preserve legacy primary and participant assignments, and fetch no whole-company task list unless asked for `{ scope: 'team' }` (the managing director's Whole team view on Today since 117; the caller checks the role and the list is still one keyset batch). Each batch also returns `links`: the stored `task_dependencies` rows (Subtask, Dependency, Blocks, Related; read only) with an end in the batch, two indexed reads bounded by `ROADMAP_LINK_LIMIT`, for the Today constellation's lines. `getAssignedRoadmapMission(…, { anyOpen: true })` lets the managing director open any open mission from the Whole team view.

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
