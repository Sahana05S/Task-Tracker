# Stellar update plan: 3 November 2026 requests

**Date:** 3 November 2026
**Sources:** the two calls of 3 November 2026 (7:17 PM and 7:46 PM); the first
consolidated plan written from them ("TaskPulse / Stellar Consolidated Update &
Implementation Plan"); an audit of this codebase at migration 106 (`main` at
`ab7583a`).
**Status:** Done, except the icon (D15, postponed by the user). Every workstream
below is merged and its migration is live (migrations 107-115, 4 November 2026);
see "Result". The user answered D-A3, D-B1, D-D2, D12 and D13 on 3 November 2026
and asked that everything stay in English; the other open decisions were built
with the recommended answer (section 14).

## Result (4 November 2026)

Built by parallel sessions, one branch and one reserved migration each; every PR
merged after green CI, and every migration run applied cleanly.

| Workstream | PR | Migration | What the user sees |
|---|---|---|---|
| J Org chart | #130 | 107 | Two or more managing directors share one leadership row; everyone below names their manager; today's status ignores withdrawn records |
| I WhatsApp | #130 | none | After check-in, a greeting with the time and a daily positive note; after check-out, the daily report; Send on WhatsApp opens the chat picker on phone or laptop |
| A Mission people | #135 | 108 | Owner, Collaborators (no share, no time logging) and Observers (follow only, never block Done); Manage people on the mission page |
| B Objectives and sub-quests | #133 | 109 | Items are called Objectives; Quests hold Quests (3 deep), Objectives and Sub-missions; "remove row and its rows" works again |
| C One mission timer | #136 | 110 | No timers on checklist rows; the mission timer's sessions list what was changed while each ran |
| E Mistakes and learning | #132 | 111 | A Mistakes & learning panel and a SMART brief on each mission |
| G Labels | #134 | 112 | `#` labels on missions, learning notes and meeting points; `/labels`; Settings > Company > Labels |
| H Input / Process / Output | #131 | 113 | Upload Input, Process and Output documents on a mission; they move into the Shared Drive |
| D Objective review | #138 | 114 | Acknowledge / Work needed per objective; pending or Work-needed objectives block Done |
| F Constellation graph | #137 | none | Today's map is a star graph of real mission links; Whole team switch for managers |
| Follow-ups | #139 | 115 | Task Tools copies keep collaborators and observers in their roles; Reports > Mission activity |
| K Icon | — | — | Postponed by the user |

Still to look at: the graph and the other new screens on the live site with real
missions (they were checked with sample data), and in the Android app that the
WhatsApp link opens WhatsApp (stellar-mobile shell).

## Notes (6 November 2026)

The user asked to replace Mistakes and learning with one Notes panel (branch `learning/notes`,
migration 126). User decisions:

- **One Notes panel** on the mission's Details tab, where Mistakes and learning was: a text box and
  a hashtag picker (several hashtags, the existing label registry and `#name` typing, no
  duplicates); newest first with author, date and hashtag chips; filter by hashtag inside the
  panel. The author edits or deletes a note; Managers and the MD delete any note.
- **Notes on Quests and objectives:** a note belongs to the mission, a Quest or an objective
  (`mission_learnings.checklist_node_id`, same mission enforced). The mission page shows them all
  and says which Quest or objective each came from. Each checklist row has a Notes button and a
  Quest's home a "Notes on this Quest" link; both open the panel scoped to that row
  (`?tab=details&notes=<row>`), and new notes go on it.
- **Type hashtags:** every note carries at least one type hashtag, enforced in the database (the
  command, plus a deferred constraint trigger that also refuses removing the last one). Managers
  choose the types in Settings > Company > Labels ("Make note type"; `labels.note_type`).
- **Starter hashtags,** created once per company by slug and never duplicated: types #mistake
  #learning #idea #decision #risk #blocker #followup; topics #client #vendor #approval #government
  #site #design #drawing #estimate #payment #documentation; causes #communication #delay #rework
  #missinginfo #quality #budget; impact #critical #minor #repeat. A company with no type hashtag
  at all receives them with its first note.
- **Existing data:** every Mistakes and learning note became a note with #mistake or #learning,
  keeping its author, dates, text and labels; nothing was deleted (the migration's notice gives
  the count).
- **Privacy unchanged:** only `can_read_mission_work` (117) callers read notes, their hashtags on
  label pages, the Today map and the Missions filter.
- **Hashtags everywhere:** `/labels/<name>` has a "Notes" group; the Today map highlights missions
  with notes carrying the hashtag and, once opened, Quests and objectives whose own notes carry
  it; the Missions filter has "Include notes" (`?notes=1`).
- **Activity:** History and Team > Activity read "Added a note #mistake #client" (and Edited /
  Deleted), with the Quest or objective named on the History line.
- **Wording:** "Mistakes and learning" is gone from the interface; hashtags are never called tags.
  No scoring, award or report change.

Compatibility: the table and the `mission_learning` label subject kind are reused;
`mission_learning_command` and `mission_learnings(task)` keep working (the command now writes a
typed note), so the site deployed after the migration had no broken window.

## Revision 2 (5 November 2026)

The user's consolidated "Revision 2" plan (calls of 3 and 4 November) was built in eight parallel
lanes, one branch each, all merged and live on 5 November 2026 (migrations 121-125). User
decisions: Crew with equal credit and no Lead; roles Managing Director / Manager / Team Member
(no one is Manager yet); a Quest's owner, owners of Quests above it, the MD and Managers edit it;
Quest timers per person per Quest with sub-Quests rolling up.

| Change | PR | Migration | What the user sees |
|---|---|---|---|
| Mission Crew | #159 | 121 | Owner / Assignees / Collaborators become one Crew; all Crew log time and mark Done; equal credit, no share boxes; Crew managed by the MD and Managers; Crew choose observers (0 open missions needed a re-split) |
| Quest owners, unlimited nesting | #158 | 122 | Every Quest has a Crew owner; only the owner, owners above it, the MD and Managers change its rows; "Add sub-Quest" with an owner picker, Assign in the row menu; no 3-level limit |
| Quest timers | #160 | 123 | Start/Stop on each Quest (table, Quest home, Today graph, mission Time panel); one timer per person per Quest, several at once; Quest totals include sub-Quests; mission timer only when a mission has no Quests; History and Reports group sessions by Quest; scoring unchanged |
| Mission activity history | #157 | 124 | The History tab opens with an Activity panel naming who did what ("X and Y were added to the Mission Crew", proofs, Quest assignments); same wording in Team > Activity; older entries read generically |
| Roles and org chart | #156 | 125 | Only Managing Director, Manager, Team Member; 1 Project Engineer and 2 Data Managers became Team Members; Manager keeps the old Project Engineer powers; org chart is one tree, wraps wide levels, starts centred, counts direct reports |
| Files row and origin link | #153 | none | Input / Process / Output side by side (swipe row on phones); a sub-mission shows "Created from TAG > row"; a Quest shows "Part of ..." |
| WhatsApp and Today | #155 | none | WhatsApp opens once after check-in (greeting) and check-out (four-block report); check in and out from a sheet on Today |
| Hashtags on the Today map | #154 | none | "Find by hashtag" highlights matching missions, optional dotted label links, link to the label page |

Left open: Quests and objectives cannot carry hashtags themselves (their notes can since 6 November); a leadership row of more than
four MDs does not wrap; some code comments still say "project engineers"; Objective review (11)
and the security audit (15) were not changed. CI ran out of private-repository Actions minutes on
5 November; the user made the repository public again.

## Follow-up changes (4 November 2026)

After trying the 3 November features the user asked for six more changes. Built in five
parallel lanes, all merged and live (migrations 116-119):

| Change | PR | Migration | What the user sees |
|---|---|---|---|
| Label changes in Team > Activity | #141 | 116 | Created / renamed / archived labels and labels added to or removed from records appear in Team > Activity |
| One Files panel | #143 | none | On the mission Work tab: Input, Process, Output and Proofs, each one list; Upload is the main button, "Add a link instead" is an option; Settings > Company > Shared Drive lets the managing director connect the drive; screens say files stay in the app until it is connected |
| Objective status and views | #145 | none | Only Yes and N/A (tap again to clear); a sent-back objective shows "Changes needed" with the note; sections and Quests say Not started / Changes needed / In progress correctly; Table, Board, Blocks, Outline and Today show the same details |
| Checklist visibility and roles | #147 | 117 | A mission's checklist and work are visible only to the managing director, the Owner, assignees, collaborators, reviewers and observers (project engineers only on missions they are on); MD, Owner and assignees decide observers; collaborators can no longer mark Done; observers can view files but not upload or remove them |
| Several timers at once | #146 | 118 | A person can run several mission timers together; each mission keeps its full time, and the day's productive hours are the merged time (9-13 and 11-14 = 5 h), used by attendance checks, reports and scores |
| Check-out report in four blocks | #148 | 119 | Check-in to 11:00, 11:00-13:00, 14:00-16:00, 16:00 to check-out (break times editable in Settings > Company > Check-in); each block lists the missions worked on and the block's productive hours |
| Labels show and filter | #144 | none | Label chips on the Missions list and cards, the mission header and Today; a label filter on the Missions page; labels in the New mission dialog |

Two items left open by #147 were then closed by migration 120 (#150): a project engineer sees
mission lines in Team > Activity only for missions they are on, and the database refuses their
checklist and detail changes on missions they are not on.

## Why this second plan exists

The first plan was written from the call recordings without access to the code.
It keeps the right intent, but it could not know that several of the things it
asks for already exist, that some words on the call mean something specific in
the app ("Submission" is a **Sub-mission**, "Items" are checklist rows, "tag"
already means a mission's identifier), or where each change has to go. This plan
keeps every workstream from the first plan, corrects what the code already
settles, and names the files, tables and functions each change touches.

Two answers were taken from the user while writing it:

- **Hierarchy:** checklist Items become **Objectives**. A **Quest** may contain
  Objectives, Quests (sub-quests) and Sub-missions. Sub-missions stay as they
  are. Setup / Activity / Closure stay the mission's three sections. No new row
  kind is added.
- **Mistakes and learning** belongs **on the mission page**, tied to that
  mission.

## Rules that bind every item

- One short branch per change, named after the module (`docs/ARCHITECTURE.md`).
- Migrations are forward only, numbered from **107** in merge order (106 is the latest; 47 and
  70 are intentional gaps). Each ends with
  `SELECT taskpulse_private.m15_secure();`. A new company-owned table has an
  `organization_id` column and a row in `taskpulse_private.m15_tenant_tables`.
- When a migration rewrites a function, start from its live
  `pg_get_functiondef`, not from the file that first created it.
- Migrations reach the live database only through
  `.github/workflows/migrate-demo.yml` after merging; check that run after each
  merge.
- The database is the permission boundary; `permissions.ts` files only give
  friendly messages.
- No second scoring formula. Nothing here changes the ten-factor engine.
- `__tests__/architecture/boundaries.test.ts` and `literal-colours.test.ts`
  must keep passing. Colours come from the tokens in `app/globals.css`.
- Testing stays light: `npm run typecheck` and the one focused test file; CI
  runs the full suite and the database harnesses.

---

## 1. Corrections to the first plan

What the code already settles, and what that means for the work.

| # | First plan said | What exists | Consequence |
|---|---|---|---|
| 1 | Replace the Today roadmap with a graph; keep the Mission Timeline | The roadmap is `modules/workspace-views/components/today/mission-map.tsx` with `mission-roadmap.tsx`, `roadmap-item-work.tsx`, geometry in `internal/mission-map.ts` (`layoutMissionMap`), actions in `roadmap-actions.ts` and data in `modules/tasks/internal/roadmap.ts`. It is already a pannable, zoomable SVG with reduced motion, re-centre, URL location and a List view. The "Mission Timeline" is the `/timelines` page (`TaskGantt`, `TaskRelations`), not part of Today. | The graph is a new layout and data adapter inside the existing map shell. The timeline is untouched. |
| 2 | Design Collaborator and Observer roles | The values already exist and carry no permissions: `task_assignees.assignment_role` is Owner / Collaborator / Support (`save_task_with_participants` writes the first assignee as Owner, the rest as Collaborator), and `task_reviewers.reviewer_role` is Primary / Secondary / Observer. There is no creator column on `tasks`; `tasks.assignee_id` mirrors the first assignee. | Give the existing values meaning (section 3) instead of adding tables. |
| 3 | MDs need default read and write access | Already true. Policy `m01_read` lets every active member read every mission in the company. The managing director and project engineers hold identical mission powers (`TASK_MANAGER_ROLES` in `shared/tracker/enums.ts`, inline role checks in SQL). | Nothing to build. Open question: should project engineers keep parity (D-A1). |
| 4 | Protect the MD-controlled scale | Already enforced in SQL. `task_lifecycle_command('scale')` raises "Manager scale authority required" for anyone but MD/PE; `guard_write()` blocks direct writes to protected fields; table grants on `tasks` were revoked in migration 16; history is in `taskpulse_private.scale_versions` and audit in `audit_events.protected_changes` (a jsonb column, not a table). | Only possible change is MD-only instead of MD and PE (D-A1). |
| 5 | Introduce one mission-level timer; decide concurrency | Timers are already per mission (`task_timers`). The database allows **one running timer per user** (`idx_task_timers_one_running_per_user`). An "item timer" is that same mission timer tagged with `checklist_node_id` (migration 34). Timer logs carry `effective_progress_delta = 0`. | Retire the per-row controls and add a session report. Removing row timers changes no score. |
| 6 | Log the changes made while a timer runs | `taskpulse_private.audit_events`, `log_revisions`, `command_receipts` and the read `public.activity_feed` (migrations 54, 57, 59) already record every mission and checklist command with its actor and time. | The session report is a derived read; no new column on logs or timers. |
| 7 | Define submission, verification and acknowledgment | Review exists for the **whole mission** only: `task_reviewers.review_approved` / `reviewed_revision`, `task_command('review')`, `TaskReviewForm` ("Approve review" / "Request changes"). Any checklist change and every log insert clears all approvals (`invalidate_reviews` triggers). The Done gate `assert_checklist_done` needs every `task_reviewers` row approved at the current `work_revision`. There is no per-row review, no "Work needed" and no row comment. | Per-objective review is new work (section 6). An Observer reviewer row would block Done until the gate excludes it (section 3). |
| 8 | Mission → Activity → Quest → Sub-Quest → Objective → Submission | A mission has sections Setup / Activity / Closure (`checklist_nodes.detail_section`). Each row is an Item (ticked Yes / No / N/A), a Quest (a `Page` row owning a `task_checklists` row through `owner_node_id`; items only since migration 77, enforced by `quest_items_guard` and `quest_nesting_guard`) or a Sub-mission (`linked_task_id` plus a `task_dependencies` Subtask row). The add control offers Item / Quest / Sub-mission (`checklist-add-row.tsx`); there is no "Activity" row and no literal "Add Item" button. | Apply the user's answer (section 4). "Submission" means Sub-mission. |
| 9 | Hashtag labels | No label concept exists. "Tag" already means the mission identifier `tasks.task_tag` (`<Mon><YY>_<TYPE><n>`, migration 53). | Call the new feature **labels** in code and copy; `#` is only how you type one. |
| 10 | Labels in the Mistakes and Learning section | That section does not exist. The nearest thing is the meeting-point type "Lessons Learned". | New, on the mission page (section 7). |
| 11 | Connect IPO documents to Google Drive; Drive was deferred | Two separate things exist. `modules/drive` is the M10 work-folder outbox, still switched off (`DRIVE_INTEGRATION_DEFERRED = true`). `modules/files` has been live since 2 November: uploads move into the company Shared Drive through the service account (`taskpulse_private.drive_files`, `/api/files`, `file_access`). Links already carry an IPO role: `task_links.ipo_role` is input / process / output / reference, grouped by `WorkFilesPanel` with `ipoLinks()`. Uploaded proofs (`task_proofs`, migration 101) have no IPO category. | Build IPO uploads on the `modules/files` pattern (section 10). `modules/drive` stays off. |
| 12 | WhatsApp after check-in | Nothing opens WhatsApp today. `modules/reports/components/share-text.tsx` already offers Copy and the phone's share sheet for the daily report. No phone numbers are stored. How the Android app handles external links is decided in the separate `stellar-mobile` repository. | A drafted message the person sends to whoever they choose, plus a check in the Android shell (section 11). |
| 13 | Add or fix the organisation chart | It exists: the default `/team` view (`OrgChart`, `org_chart()`, `users.reports_to` / `job_title` / `department_id`, migrations 65 and 103). | A second managing director splits it into two unconnected trees (D13); fix in section 12. |
| 14 | Find every place the icon is used | One glyph source, `shared/ui/stellar-mark.tsx` (`STELLAR_STAR_PATHS`, `StellarMark`), plus `app/icon.svg` and `app/apple-icon.tsx`. There is no web manifest. Android icons live in `stellar-mobile`. | Small, once the asset arrives (section 13). |
| 15 | Navigation is Today · Missions · Records · Team · Reports | Also Policies (wide screens) and a More menu (`modules/workspace-views/components/shell/nav-items.ts`, checked by `nav-coverage.test.ts`). | No new primary section; new pages go under existing sections or More. |
| 16 | Infrastructure ownership (GitHub, Supabase, Azure) | This app uses GitHub `Sahana05S/task-tracker`, Vercel, the Supabase project named in AGENTS.md, a Google service account for the Shared Drive and FCM for push. No Azure. | A separate assessment; out of scope here. |

## 2. Vocabulary

| Said on the call | Word in the app today | Word after this plan | Stored as |
|---|---|---|---|
| Mission | Mission | Mission | `tasks` |
| Item | Item | **Objective** | `checklist_nodes` row, `node_type = 'Item'` (unchanged) |
| Quest | Quest | Quest | `Page` row + its own `task_checklists` row |
| Sub-quest | (not allowed) | Sub-quest | A Quest inside a Quest |
| Submission | Sub-mission | Sub-mission | `checklist_nodes.linked_task_id` + `task_dependencies` Subtask |
| Activity | Section | Section (Setup / Activity / Closure) | `checklist_nodes.detail_section` |
| Owner | (first assignee) | Owner | `task_assignees.assignment_role = 'Owner'` |
| Collaborator | (unused value) | Collaborator | `task_assignees`, `assignment_role = 'Collaborator'`, `share_units = 0` |
| Observer | (unused value) | Observer | `task_reviewers.reviewer_role = 'Observer'` |
| Hashtag | (none) | Label | new `labels` table |
| Tag | Mission tag | Mission tag | `tasks.task_tag` |
| Work files | Work files, Proofs | Work files (links), IPO documents (uploads), Proofs | `task_links`, `task_proofs` |
| Mission timer | Timer | Timer session | `task_timers` row |

---

## 3. Workstream A: mission people and permissions

**Module:** `tasks`. **Migration:** 108. **Branch:** `tasks/people`.

- **Owner** is shown and chosen explicitly. `TaskDialog` gets an Owner picker
  (default: the first assignee) that writes `assignment_role = 'Owner'` and
  `is_primary`. The People tile in `MissionOverview` lists Owner, Assignees,
  Collaborators, Reviewers and Observers separately.
- **Collaborator** is a `task_assignees` row with
  `assignment_role = 'Collaborator'` and `share_units = 0`: they may edit the
  mission's details, checklist, labels and learnings but earn no credit.
  Existing non-first assignees are already stored as "Collaborator" **with**
  shares; the migration rewrites none of them. The TypeScript mappers treat a
  Collaborator row with shares as an assignee, and only zero-share rows show as
  collaborators. **Collaborators do not log time** (D-A3, user, 3 November
  2026). Because `is_task_assignee()` is true for any `task_assignees` row,
  migration 108 adds `taskpulse_private.is_task_worker(task)` (an assignee with
  shares, or the legacy single assignee) and uses it in `execution_command`
  (logs and timers, including the offline timer RPCs) and the `m01_own_work`
  policy; `TimerButton` and "Log time" hide the mission for a collaborator
  (`canStartTimerForTask`, `getLoggableTasksFor`).
- **Observer** is a `task_reviewers` row with `reviewer_role = 'Observer'`. An
  observer sees the mission on Today and the graph and gets its notifications,
  but cannot tick, edit or review. Needed changes: `assert_checklist_done`
  (rewritten from its live definition) ignores Observer rows; `TaskReviewForm`
  and "Your review is requested" skip observers; the Today source
  (`getAssignedMissionBatch`) also returns reviewer and observer missions with a
  `relationship` field.
- **Managing people:** a new RPC `task_people_command(p_task, p_command,
  p_payload, p_expected_version, p_operation)` adds or removes collaborators and
  observers and transfers ownership. Allowed to the managing director, project
  engineers and the mission's Owner (D-A4). It writes `audit_events`, a command
  receipt, and bumps `participant_version` only when shares change.
  `save_task_with_participants` is not changed.
- **Details editing** (`task_details_command`, managers only except the
  assignee work-file link of migration 38) opens to the Owner and Collaborators
  if D-A2 is yes. **Scale** stays MD and PE unless D-A1 says MD only.

**Files:** `modules/tasks/actions.ts`, `internal/commands.ts`,
`internal/permissions.ts`, `internal/mappers.ts`, `internal/roadmap.ts`,
`components/task-dialog.tsx`, `components/detail/mission-overview.tsx`,
`components/task-review-form.tsx`; `shared/tracker/enums.ts`.

**Tests:** a new `tools/test_task_people_database.py` (and its line in
`.github/workflows/contract-checks.yml`): a collaborator edits their mission but
not another; an observer cannot call `checklist_command('state')`; an Observer
row does not block Done; MD and PE parity unchanged; a removed collaborator's
next RPC fails.

## 4. Workstream B: Objectives and sub-quests

**Module:** `checklists` (and `tasks` for sub-missions). **Migration:** 109.
**Branch:** `checklists/objectives-subquests`.

- **Rename in the interface only.** "Item" becomes "Objective" in
  `checklist-add-row.tsx` (label, hint, placeholder, "Add objective"),
  `checklist-table.tsx` (column header), `checklist-workspace.tsx` (a Quest's
  list is titled "Objectives"; "Every objective counts equally towards the
  Quest's progress"), `checklist-cards.tsx`, the Today copy in
  `roadmap-item-work.tsx` and `mission-map.tsx`, the activity wording in
  `modules/records/internal/activity-mapping.ts`, the guide topics in
  `modules/guide`, and any test that asserts these strings. Database names,
  payload values (`node_type: 'Item'`) and `rowKind()` values stay.
- **Quests may hold Quests and Sub-missions.** Migration 108 drops the triggers
  `aa_m77_quest_nesting` and `aa_m77_quest_items` and adds
  `quest_depth_guard`: **at most 3 levels of Quest** (a Quest, its sub-quest,
  and one more; D-B1, user, 3 November 2026). Rows in a Quest stay
  filed in its `activity` section, and `submission_guard` stays.
  `checklist_node_result` already recurses through a Quest's own checklist with
  a path argument that stops cycles; prove it with a nested case in
  `__tests__/fixtures/checklist-rollups.json` and the TypeScript mirror in
  `internal/progress.ts`.
- `checklist_command('delete')` with `with_children` removes nested Quests'
  checklists too (today it refuses while a Quest is inside), and `edit` refuses
  moving a Quest under one of its own descendants.
- `submission_create` (migration 68) accepts a Quest's checklist, so a
  Sub-mission can be added from inside a Quest; reviewers are copied as today.
- Inside a Quest the add control offers Objective / Quest / Sub-mission (today
  only items). The breadcrumb shows Quest › Sub-quest. The Outline view already
  reads levels on demand (`loadChecklistRows`).
- **Progress and credit are unchanged.** The rollup stays
  `checklist_result` (migration 85: Activity 95%, Setup 2.5%, Closure 2.5%), so
  nested work cannot be counted twice.

**Tests:** extend `tools/test_m63_checklist_rows_database.py` or add
`tools/test_checklist_subquests_database.py`; update string assertions in
`modules/checklists/__tests__`.

## 5. Workstream C: one mission timer and the session report

**Module:** `time-tracking` (UI changes in `checklists` and `workspace-views`).
**Migration:** 110 (read-only function). **Branch:**
`time-tracking/mission-timer`.

- **Retire the per-row timer in the interface.** Remove `ItemTimerControls`
  (`modules/checklists/components/checklist-rows.tsx`) from the table, cards,
  outline and Today's `checklist-item-work.tsx`, and hide the Est. and Elapsed
  columns. The data stays: `estimated_minutes`, `elapsed_seconds`,
  `daily_task_logs.checklist_node_id`, and `getTaskEffortBreakdown` keeps
  showing past time per row. `start_checklist_item_timer`,
  `record_offline_timer` (with a row) and `startItemTimer` stay on the server
  for the Android offline queue and are marked deprecated in the module README.
- **One control remains:** `TimerButton` (mission header, Missions cards, Today)
  and the Time panel on the mission page. One running timer per user stays;
  switching missions is Stop, then Start.
- **Session report:** a new read `getTimerSessionActivity(taskId)` backed by a
  SQL function `timer_session_activity(p_task)` (read-only, company-scoped like
  `activity_feed`). For each stopped timer it returns the person, start, end,
  hours and the `audit_events` rows that person made on that mission and its
  checklist between start and end. `TimerRecords` on the History tab shows
  "During this session: …", and the Reports mission activity lists the same.
  Time and audit stay separate tables.
- The Stop sheet shows the existing session note (`task_timers.notes`, the
  `notes` payload of `stop_task_timer`), so a person can say what they did
  (D-C2).
- **Scoring is untouched.** Timer logs add hours only; productivity is earned
  credit divided by attendance hours.

## 6. Workstream D: objective verification and "Work needed"

**Modules:** `checklists` and `tasks`. **Migration:** 114. **Branch:**
`checklists/objective-review`.

- New columns on `checklist_nodes`: `review_state` (`none`, `pending`,
  `acknowledged`, `work_needed`; default `none`), `reviewed_by`,
  `reviewed_at`, `review_note`. Every decision is also an `audit_events` row
  (`command = 'checklist_review'`), which the activity feed shows; no second
  history table.
- `checklist_command` gains `review` with `{node_id, decision, note}`, allowed
  to the managing director, project engineers and the mission's Primary and
  Secondary reviewers (not Observers).
- Ticking **Yes** sets `pending` when the mission has a non-Observer reviewer,
  otherwise `none`. Any later tick change resets it the same way.
- **Work needed** requires a note and sets the tick back to **No** through the
  existing state path, so progress and credit move by the ordinary negative
  change that already exists since migration 66. **No new scoring rule.**
  **Acknowledged** changes no progress.
- The version check (`p_expected_version`) stops two reviewers deciding at once.
- `assert_checklist_done` also refuses while any row is `pending` or
  `work_needed` (D-D2, user, 3 November 2026: yes, these block Done). The mission-level approval stays the last step. Once
  objectives are reviewed one by one, D-D3 asks whether a time log should still
  clear mission approvals.
- **Interface:** a review chip beside `ChecklistStateControl` (Pending /
  Acknowledged / Work needed with its note); "Acknowledge" and "Work needed" in
  the row sheet for reviewers; pending objectives listed in "Your review is
  requested"; notifications through `taskpulse_private.notify` to reviewers
  (once per mission per day) and to the assignee on Work needed.
- A reviewer's own tick stays pending for someone else (D-D1).

**Tests:** a database harness for who may decide and the double-decision guard;
vitest for the chip rules.

## 7. Workstream E: mission page, SMART goals, Mistakes and learning

**Modules:** `tasks` and a new `modules/learning` (from `modules/_template/`).
**Migration:** 111. **Branches:** `tasks/mission-brief`,
`learning/mission-learnings`.

- Keep the three tabs (Work / Details / History); the call settled on not
  merging them. The Work tab header shows a two-line brief and SMART chips read
  from `task_detail_sections` (`description`, `smart_specific` …
  `smart_time_bound`) so the goal is visible without switching tabs.
- **Mistakes and learning** (user's choice: on the mission page). New table
  `public.mission_learnings(id, organization_id, task_id, kind ('mistake' or
  'learning'), body, author_id, created_at, updated_at, record_state)` and RPC
  `mission_learning_command` (add, edit, withdraw) for the managing director,
  project engineers, the Owner, assignees and collaborators. Anyone who can read
  the mission reads them. A `LearningPanel` on the Details tab and a count chip
  on the Work tab. Labels attach once Workstream G lands. Not a dated record,
  not in scoring; changes show in the activity feed through `audit_events`.

## 8. Workstream F: the constellation graph on Today

**Module:** `workspace-views`. **No migration.** **Branch:**
`workspace-views/constellation`.

- Keep `MissionRoadmap` (Roadmap / List switch, due filter, URL location) and
  the shell of `mission-map.tsx` (camera, zoom, pan, reduced motion, re-centre,
  the work panel, the timer button). Replace the winding-road geometry with a
  new `internal/mission-graph.ts` `layoutMissionGraph(entities, edges,
  options)`: a seeded, fixed-iteration force layout, so the same missions always
  land in the same place.
- **Nodes:** missions sized by priority and filled by progress, with a ring for
  the person's relationship (owner, assignee, collaborator, reviewer,
  observer). Opening a mission adds its Quests and Objectives as child nodes
  through the existing `loadRoadmapBranch`.
- **Edges:** Sub-missions from `task_dependencies` Subtask rows as solid
  parent-child lines; Dependency and Blocks dashed; Related dotted. Only real
  records draw edges; nothing implies a dependency that does not exist.
- **Data:** `getAssignedMissionBatch` grows into `getGraphMissions(userId)`
  with reviewer and observer missions, the relationship, and bounded edges,
  keeping the keyset batches and the "more" node. Members see their own
  missions; MD and PE get a "Whole team" toggle.
- **Accessibility:** node titles as text, a focus ring, Tab and Enter, no state
  shown by colour alone; on phones the first tap focuses and the second opens;
  reduced motion skips the settle animation.
- Library: `d3-force` (small, MIT) or a hand-written layout in the same file
  (D-F1).
- Remove `layoutMissionMap` and the road styles in `mission-map.module.css`
  only after the graph shows the same missions as the old map.

**Tests:** layout determinism and no overlap at rest in
`modules/workspace-views/__tests__/mission-map.test.ts`; a Playwright smoke test
in `tests/`.

## 9. Workstream G: workspace labels

**Module:** new `modules/labels`. **Migration:** 112. **Branch:**
`labels/foundation`.

- Tables `public.labels(id, organization_id, name, slug unique per company,
  colour_token, description, created_by, created_at, archived_at)` and
  `public.label_links(label_id, subject_kind, subject_id, organization_id,
  created_by, created_at, unique (label_id, subject_kind, subject_id))`.
  `subject_kind` starts with `task`, `mission_learning` and `meeting_point`
  (D-G1); ideas, suggestions and daily facts can follow. `colour_token` names
  a theme token, never a literal colour.
- RPCs: `label_command` (create, rename, archive; MD and PE; renaming keeps
  the id so every link survives), `label_link_command` (attach, detach; anyone
  who may edit the subject), `labels_for(subject_kind, ids)`, and
  `labelled(slug)`, which returns only subjects the caller may read.
- **Interface:** `LabelInput` (type `#` to autocomplete from existing labels or
  create one) in the mission dialog, the learning panel and the meeting-point
  editor; `LabelChips` wherever a labelled record shows; management under
  Settings > Company > Labels; a browse page `/labels` and `/labels/[slug]` in
  the More menu; a `?label=` filter on the Missions table.
- Labels feed neither scoring nor the graph (D14).

**Tests:** the boundary test; a database harness for rename-keeps-links and
company isolation.

## 10. Workstream H: Input / Process / Output documents in the Shared Drive

**Modules:** `files` and `tasks`. **Migration:** 113. **Branch:**
`files/ipo-documents`.

- Reuse the proofs pipeline that already moves uploads into the Shared Drive.
  `taskpulse_private.task_proofs` gains `kind` (`proof`, `input`, `process`,
  `output`; default `proof`). `file_subject` files the new kinds under
  `Missions/<YYYY-MM>/<Tag> - <Title>/{Input,Process,Output}/`; proofs stay
  under `Proofs/…`. `task_proof_command` accepts the kind. Who may see and add
  them stays `task_proof_allowed` (assignees, reviewers, MD, PE), plus
  collaborators and observers from Workstream A.
- `WorkFilesPanel` on the Details tab shows, for each of Input, Process and
  Output, the uploaded files (the shared `ProofFiles` list) **and** the pasted
  links that already carry `task_links.ipo_role`.
- Documents attach at the mission level (D09). Objectives keep their per-row
  links.
- **Limits to say plainly in the interface:** the service account can open only
  files inside the Shared Drive. A pasted link to someone's own Drive is stored
  as a link; the app cannot check it or show its access state.
- Error handling already exists in `modules/files`: pending, moved and trashed
  states, retries, the Reports > Data checks line, and files staying viewable
  from storage if a move fails. Nothing in the drive is shared with staff; every
  view goes through `/api/files`.

## 11. Workstream I: WhatsApp after check-in and check-out

**Modules:** `attendance` (with the check-in page composing a `reports` read),
and the `stellar-mobile` repository. **No migration.** **Branch:**
`attendance/whatsapp`.

User decision D12 (3 November 2026): draft the messages in the app; the share
opens WhatsApp on the phone and on the laptop, and **the person chooses whom to
send it to**. Check-in sends a greeting with the check-in time and a positive
note; check-out sends the daily report message. No fixed number, no template
settings, no automatic sending.

**Check-in message** (built by a pure `checkInMessage(name, capturedAt, date)`
in `modules/attendance/internal/check-in-model.ts`, exported through
`client.ts`):

```
Good morning, team! ☀️
Sahana checked in at 9:12 AM · Mon, 3 Nov.
Small steps, big progress. Let's make today count!
```

- The greeting follows the Asia/Kolkata check-in time: "Good morning" before
  12:00, "Good afternoon" before 17:00, "Good evening" after; the emoji changes
  with it (☀️ / 🌤️ / 🌙).
- The first name is the member's display name up to the first space.
- The positive note is one of a short fixed list, picked by the date so the
  same day always gives the same note and consecutive days differ: "Small
  steps, big progress. Let's make today count!", "Ready to give today my best.",
  "Here's to a productive day!", "One mission at a time. Let's go!",
  "Grateful for this team. Let's make it a great day!", "Focused, fresh and
  ready to work."
- A check-in recorded outside the office radius adds nothing to the message;
  that stays a matter for the attendance record.

**Check-out message:** the daily report text the Reports page already shares
(`dailyReport` and `dailyReportText` in `modules/reports/client.ts`, built on
`formatDailyReport`), with one line on top:

```
Checked out at 6:40 PM · 9.47 h today.

*Daily report · Sahana S*
Monday, 3 November 2026
…
```

`attendance` must not import `reports` (reports already reads attendance, so
that would create a cycle the boundary test refuses). Instead
`app/(workspace)/attendance/check-in/page.tsx` reads the member's daily report
through `reports`' public API and passes the text to `CheckInDay` as a prop.
`CheckInForm` already calls `router.refresh()` after a check-out, so the text
is re-read with the logs the member made that day.

**Share controls** in the done state of `CheckInForm` (and on "All done for
today", so the message can be sent later):

- **Send on WhatsApp**: a link to `https://wa.me/?text=<encoded message>`
  (`target="_blank"`, `rel="noopener noreferrer"`). With no number in the link,
  WhatsApp opens its own chat picker: the app on the phone, WhatsApp Desktop or
  WhatsApp Web on the laptop.
- **Share…** where `navigator.share` exists (phones): the system share sheet,
  for anyone who prefers it or uses another app.
- **Copy**, with the existing preview of WhatsApp `*bold*` runs.
- Reuse `ShareText` by moving it from
  `modules/reports/components/share-text.tsx` to `shared/ui/share-text.tsx`
  (reports imports it from there) and adding the WhatsApp link to it, so the
  Reports page gains the same button.
- Attendance is saved first and on its own (it already is:
  `attendance_check_in` commits before the screen changes). The buttons are
  shown from the saved result and never fire by themselves, so a retry or a
  WhatsApp failure cannot lose a check-in or send a message twice.

**Android app:** confirm in `stellar-mobile` that a `wa.me` link opened from
the WebView leaves the app for WhatsApp (Capacitor's external-link handling or a
`shouldOverrideUrlLoading` rule), and that `navigator.share` reaches the system
sheet. If either does not, add a small launcher/share plugin using the same
`registerPlugin` pattern as `NativePrint` (`modules/mobile/internal/native.ts`).

**Tests:** vitest for `checkInMessage` (greeting boundaries at 11:59 / 12:00
and 16:59 / 17:00 IST, the note changing day to day, first-name extraction) and
for the WhatsApp link encoding (newlines, `&`, `#`, emoji).

Editable message templates in Settings can follow later if the managing
director wants to change the wording; that would need a migration.

## 12. Workstream J: organisation chart

**Module:** `team`. **Migration:** 107 (the small `org_chart()` fix below).
**Branch:** `team/org-chart`.

**What breaks** (D13, user, 3 November 2026, with a screenshot of the live
`/team` chart): adding a second managing director broke the chart. Both
directors have no manager, so `buildOrgTree` (`modules/team/internal/org-tree.ts`)
returns two roots and `OrgChart` (`modules/team/components/org-chart.tsx`)
draws them as two separate trees side by side. Each tree is as wide as its
team, so the new director (no reports yet) sits alone at the far left, the
first director sits centred over their five reports far to the right, nothing
joins them, and the five report cards do not fit the panel, so the chart
scrolls sideways with the last card cut off.

**Fix:**

- **One leadership row.** A new pure helper `orgTiers(roots)` in
  `internal/org-tree.ts` returns `{ leaders, below }`: `leaders` are the root
  managing directors (ordered by name), `below` is the union of their reports
  plus any other root (someone whose manager was cleared). `OrgChart` draws the
  leaders side by side as one centred top row joined by a single line, and
  everyone in `below` as one tree level under that row, so the chart reads as
  "the directors, then the company". With one director it looks exactly as it
  does today.
- **People shown once.** Each person keeps their own `reports_to`; a report of
  either director appears once under the shared row. The card of each director
  still says how many people report to them.
- **Fit before scrolling.** Report cards get a narrower layout from the medium
  breakpoint (name, title, status; the role chip moves into the title line), and
  a level with more than four people wraps onto a second row instead of
  widening the chart. The box still scrolls sideways only for very wide
  companies, and starts centred on the leadership row.
- **Phones** keep the indented list; the leadership row becomes the first group
  of the list.
- **Today's status:** migration 107 makes `org_chart()` read only active
  attendance records (`record_state = 'active'`), so a withdrawn record no
  longer shows as today's status. Start from the live definition.
- New directors: migration 103 already puts new non-director members under the
  earliest active director; that stays. Moving people under the second director
  is done in Manage people as before.
- The organisation chart stays separate from mission people; nothing in
  `task_assignees` feeds it.

**Tests:** extend `modules/team/__tests__/org-tree.test.ts` for `orgTiers`: one
director (unchanged shape), two directors with and without reports, a cleared
manager, and an inactive director whose reports move up.

## 13. Workstream K: Stellar icon

**Where:** `shared/ui`, `app/`, marketing, `stellar-mobile`. **Branch:**
`shared/icon`. Postponed by the user (3 November 2026) until the asset is ready
(D15).

- Replace `STELLAR_STAR_PATHS` in `shared/ui/stellar-mark.tsx` (the one glyph
  source), `app/icon.svg` and `app/apple-icon.tsx` (and its colour allow-list in
  `__tests__/architecture/literal-colours.test.ts` if colours change).
- Check `shared/ui/splash.tsx`, `shared/ui/wallpaper.tsx`, the login and
  reset-password screens, the offline app, the marketing header and footer, and
  the fallback in `modules/settings/components/company-brand.tsx`.
- Add a web manifest only if install icons are wanted.
- Android launcher, splash and notification icons change in `stellar-mobile`.

---

## 14. Decisions

### Settled by the code or by the user

| ID | Decision | Answer |
|---|---|---|
| D01, D18 | Hierarchy; what "Submission" is | User: Objectives, Quests holding Quests, Objectives and Sub-missions, the three sections unchanged. "Submission" is Sub-mission. |
| D06 | Does Work needed affect scoring? | Recommended: it sets the tick back to No through the existing path; no new scoring rule. |
| D07 | More than one running mission timer? | No. The database already allows one per user. |
| D08 | How mission time affects scoring | As before: hours only; productivity uses attendance hours. |
| D14 | Do labels draw graph edges? | No, not initially. |
| D17 | Which per-row time fields go | Hide the per-row timer, Est. and Elapsed; keep their data. |
| D-A3 | May a zero-share Collaborator log time? | No (user, 3 Nov 2026). |
| D-B1 | Maximum Quest depth | 3 (user, 3 Nov 2026). |
| D-D2 | Do pending or Work-needed objectives block Done? | Yes (user, 3 Nov 2026). |
| D11, D12 | WhatsApp: prefilled or automatic; message text and recipient | Prefilled, drafted in the app; the person picks the chat in WhatsApp on phone or laptop. Check-in: greeting, check-in time, positive note. Check-out: the daily report message (user, 3 Nov 2026). |
| D13 | What is wrong with the org chart | Adding a second managing director splits it into two unconnected trees and overflows the panel (user, 3 Nov 2026, with screenshot). |

### Open on 3 November (recommended answer in brackets) and what was built

| ID | Question | Status |
|---|---|---|
| D-A1 | Scale editable by MD only, or MD and project engineers? (keep MD and PE) | Built as recommended (MD and PE) |
| D-A2 | May the Owner and Collaborators edit mission Details? (yes) | Built as recommended (108) |
| D-A4 | Who may transfer ownership? (MD, PE, current Owner) | Built as recommended (108) |
| D-A5 | Should anyone's read access narrow? Today every member reads every mission. (no change) | No change |
| D-C1 | Keep the per-row Links column? (yes) | Kept (110) |
| D-C2 | Show the session note in the Stop sheet? (yes) | Built (110) |
| D-D1 | Can a reviewer acknowledge their own objective? (no) | Built as recommended (114) |
| D-D3 | Stop clearing mission approval on every time log once objectives are reviewed? (yes) | Built as recommended (114) |
| D-F1 | `d3-force` or a hand-written layout? (`d3-force`) | Hand-written, no new dependency (#137) |
| D-G1 | Which records take labels first? (missions, learnings, meeting points) | Built as recommended (112) |
| D09, D10 | IPO documents at mission level, in the existing Shared Drive? (yes) | Built as recommended (113) |
| D15 | The new icon asset | Postponed by the user |
| D16 | Infrastructure ownership review | Separate assessment |

## 15. Order of work

| Step | Branch | Migration | Needs |
|---|---|---|---|
| J | `team/org-chart` | 107 | — (quick fix, can go first) |
| I | `attendance/whatsapp` + `stellar-mobile` | — | — (can go first) |
| A | `tasks/people` | 108 | — |
| B | `checklists/objectives-subquests` | 109 | — |
| C | `time-tracking/mission-timer` | 110 | — |
| D | `checklists/objective-review` | 114 | A (Observer excluded), B (both change `checklist_command`) |
| E | `tasks/mission-brief`, `learning/mission-learnings` | 111 | — |
| G | `labels/foundation` | 112 | E (learnings ship first without labels) |
| F | `workspace-views/constellation` | — | A (relationships), B (sub-quests) |
| H | `files/ipo-documents` | 113 | — |
| K | `shared/icon` | — | D15 (postponed) |

Running in parallel since 3 November 2026: J and I in the coordinating
session; A, B then C, E then G, and H each in their own cloud session with the
migration number above reserved. D and F start once A and B have merged. The
migration workflow applies any unrecorded file in version order, gaps
included, so lanes may merge in any order.

For each branch: open a PR, wait for CI, merge, then check the
`migrate-demo.yml` run before the next migration merges. A failed run is fixed
at once with a new forward migration. Finish by looking at the change on the
live demo site.

## 16. Risks and definition of done

| Risk | Mitigation |
|---|---|
| An Observer reviewer row blocks Done | Gate change ships in the same migration that gives Observer meaning (108). |
| Collaborators receive credit | Zero `share_units`; the harness checks credit shares are unchanged. |
| Nested Quests loop or double-count | Depth guard, the rollup's path argument, a nested fixture. |
| "Label" confused with mission "tag" | Separate words in code and copy; `#` only as input. |
| WhatsApp links stay inside the Android WebView | Checked and fixed in `stellar-mobile` before release. |
| Pasted Drive links cannot be verified | Said plainly in the interface; uploads are the verified path. |
| Removing row timers loses history | Interface-only removal; data and server functions stay. |
| Review workflow changes earned progress | Work needed uses the existing tick path; no scoring rule changes. |

A change is done when it works as specified, the database enforces its
permissions, existing data stays valid, CI passes, reports and scores are
unchanged unless a decision says otherwise, history and audit are kept, it works
on phone and desktop, outside-service failures leave records intact, the module
README is updated, and the user has confirmed it on the live site.
