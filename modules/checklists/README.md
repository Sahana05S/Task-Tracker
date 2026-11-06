# checklists

A mission's master checklist: one kind of row, nested as deep as needed (the
sheet's Checklist Home and "[ChL]" tabs), in Setup / Activity / Closure
sections, ticked Yes or N/A (an unticked row is empty), per-row links, progress rollups, and the
time recorded against checklist rows before 3 November 2026 (item timers
saved ordinary task logs tagged with the row; since then time is kept by the
mission timer only, and the per-row timer, Est. and Elapsed columns are gone
from every view, update plan section 5; the data and `getChecklistItemTime`
reads stay). Since migration 123 (5 November 2026) Quests carry timers again: a Quest
row in `ChecklistTable` and a Quest's home in `ChecklistWorkspace` show a
Start/Stop through the `questTimer` slot (`QuestTimerSlot`), which the checklist
page fills with time-tracking's `TimerButton`, so this module never imports
time-tracking (that would close the cycle tasks > checklists > time-tracking >
tasks). Ordinary rows have no timer.

Since migration 63 (user decisions, 23 October 2026) any row that is not linked
to a mission can have rows added under it. A row with rows under it takes their
equal average and opens their table; its own tick is cleared when the first row
goes under it. A section counts once it has a row; an empty section is N/A and
does not block Done. Sub-missions, the Page/Group/Item choice, the section
review step and the separate structure page are gone.

Since migration 66 (user decision, 23 October 2026) every mission with a
checklist takes its progress from Activity; the manual/Activity switch is gone
and `mode` refuses to switch it off. Rows added after 100% lower progress at
once. When a change cannot be credited yet (no scale, no anchor, legacy shares)
progress still follows and the credit waits, anchor kept, until reconciled.

Since migration 85 (user decision, 28 October 2026) the progress a checklist
gives its mission weighs Activity 95%, Setup 2.5% and Closure 2.5%
(`PROGRESS_WEIGHTS`, `weightedOverall` in `internal/progress.ts`, mirroring
`checklist_result`). A section with no applicable rows drops out and the
others share its weight, so Activity alone still reaches 100. No applicable
Activity gives no figure (progress stays as it was). Done still needs every
phase complete, which is 100. A sub-mission row reads the sub-mission's own
weighted progress.

Since migration 67 (user decision, 23 October 2026) a row can also be a
**Quest**: a page with its own list of items (an owned `task_checklists` row,
created by the `submission` command from the add row's Item / Quest switch).
Since migration 77 (user decision, 25 October 2026) a Quest has no Setup /
Activity / Closure of its own: every row in it is filed in one list (stored as
its Activity section, which the rollup reads), so a Quest row's progress is the
equal average of its items and it is complete when every item is done or N/A.
It opens as its own checklist home (`?checklist=<id>`), titled "Objectives",
with each Quest above it in the breadcrumb (Quest › Sub-quest). Quests of
closed missions keep any Setup / Closure rows they had.

Since migration 109 (user decisions, 3 November 2026) the interface calls a
ticked row an **Objective** (the database still stores `node_type = 'Item'`,
and `rowKind()` still returns `'item'`), and a Quest may hold Objectives,
Quests (sub-quests) and Sub-missions, at first at most three levels of Quest
deep (D-B1; the limit was lifted by 122, below). `quest_depth_guard` replaces
migration 77's item-only triggers: rows in a Quest stay in its single list.
`checklist_node_result` reads each Quest's own list through its path argument,
so nested work counts once and the weights of migration 85 are unchanged; the
TypeScript mirror reads a Quest's list from `ChecklistProgressNode.quest`.
`delete` with `with_children` removes every Quest list inside the row at any
depth (Sub-missions stay missions of their own); `edit` refuses moving a row
under one of its own rows; duplicating a Quest skips Sub-mission rows.

**Quest owners, no level limit (migration 122, user decisions 5 November 2026).**
Each Quest row has an owner, `checklist_nodes.assignee_id`, one of the
mission's Crew (`taskpulse_private.is_crew`). Inside a Quest's list only its
owner, the owners of the Quests above it, the managing director and Managers
(project engineers who may read the mission's work) add, tick, edit, move,
duplicate or remove rows (`taskpulse_private.can_edit_quest_list`, which walks
`owner_node_id` up with a path array); the mission's own list stays open to all
Crew. A Quest's owner may also rename, reorder or remove the Quest row itself.
`submission` takes `assignee_id` (Crew only; default the creator when Crew, else
the mission's primary), and `assign {node_id, assignee_id}` changes the owner
(audited as `checklist_assign`, shown in Team > Activity as "Assigned a Quest").
New Quest lists made by duplicates or Task Tools copies take the default owner
(trigger `zz_m122_quest_owner`). The three-level limit is gone
(`MAX_QUEST_LEVEL` removed); `quest_depth_guard` now only refuses a Quest list
inside itself. `checklist_branch` returns `assigneeId` and `canEditQuest` on
Quest rows and `canEdit` for the list; the page passes it as `listEditable`, so
rows a viewer may not change are read-only. The owner shows as a chip in Table,
Board, Blocks and Outline (`QuestOwnerChip` in `ObjectiveDetails`) and on Quest
stars of the Today map; the add row, the Outline's add line (now with a Quest
option) and the row menu's Assign section pick from the Crew
(`components/quest-owner.tsx`). Objective review rules (114) are unchanged.

Tests: `__tests__/fixtures/checklist-rollups.json` (nested-quest cases) and
`tools/test_checklist_subquests_database.py`.

Four views (user decision, 23 October 2026), switched by `ChecklistViewSwitch`
and kept in `?view=` plus per-device memory (phones start on Blocks): **Table**
(the sheet), **Board** (Setup / Activity / Closure side by side as columns of
cards), **Blocks** (card grids per phase; Quests and sub-missions larger) and
**Outline** (every level as one collapsible list; a level is read only when
opened, through `loadChecklistRows`). Every view ticks with the same one-tap
control.

Since 4 November 2026 (user decisions) **only Yes and N/A** are offered: "No"
means nothing. An unticked objective is shown empty ("Not done" for screen
readers) and tapping the chosen choice again clears it, which sends the stored
not-done value `'No'` (`NOT_DONE`; still the `completion_state` default and
read as not done by the rollup, so no migration and progress is unchanged). A
linked sub-mission offers only N/A (clearing restores it). Every view, Today's
item work included, shows **the same objective details** through
`components/objective-details.tsx`: `ObjectiveTick` (tick + review chip) and
`ObjectiveDetails` (one-line description that opens, the reviewer's note,
Quest / sub-mission tag and status, rows inside, progress with its status,
links as icons). Statuses say **Not started** at 0%, **Changes needed** when an
objective inside was sent back, **In progress** only once something is done,
then Complete / Not applicable (`rowStatus`, `sectionStatus`): section headers
in every view, Quest and parent rows, and the mission Work tab's checklist
summary. `getObjectiveReviews` adds to each sent-back objective the rows above
it (its `trail`, read from `checklist_nodes` / `task_checklists.owner_node_id`,
bounded) so `sentBackIndex` can mark them.

Since migration 114 (plan section 6, user decisions 3 November 2026) each
objective has its own review: ticking **Yes** leaves it **Pending** when the
mission has a Primary or Secondary reviewer (otherwise there is nothing to
review), and any later tick change resets it. The managing director, project
engineers and the mission's Primary / Secondary reviewers (never Observers, and
never on their own tick) **Acknowledge** it or send it back as **Work needed**
with a note; Work needed clears the tick (the stored `'No'`) through the ordinary state
update and the objective shows **Changes needed** with the note, so progress and credit follow with no new scoring rule. Pending or Work
needed objectives block Done (`assert_checklist_done`); the mission-level
approval stays the last step, and a new time log no longer clears it (the
`m03_invalidate_log_review` trigger is gone). Each decision is an audit event
(`checklist_review`, the decision and note as its reason) and reaches the
activity log. Reviewers hear about ticks waiting for them once per mission per
day; the mission's assignees hear about Work needed. A chip beside the tick
(`ObjectiveReviewChip`) shows Pending / Acknowledged / Changes needed and opens
the review sheet for those who decide; `ObjectiveReviewNote` shows the note; the mission page lists the objectives waiting for the viewer under
"Your review is requested".

Notes (126) were removed by the user on 6 November 2026 (migration 129): rows and Quest homes have no
Notes link any more.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | Server reads: `getObjectiveReviews` (114), `loadChecklistRollups`, `getChecklistItemTime`, `getTaskEffortBreakdown`, `getEmployeeItemHours`, `getChecklistBranch`, `getUnmappedRootRows`, `getFocusedChecklistItemTime`, `getRunningChecklistTimers`. Also re-exports everything in `client.ts`. |
| `client.ts` | Pure rules and types, safe for `'use client'`: `CHECKLIST_SECTIONS`, `computeChecklistProgress`, rollup/section types, tree helpers (`childrenOf`, `ancestry`, `isContainer`, `subtreeSeconds`, `formatMinutes`), `groupItemHours`, table rules (`rowKind`, `stateChoices`, `NOT_DONE`, `nextCompletionState`, `completionWords`, `rowStatus`, `opensTable`, `pageResult`, `sectionStatus`, `checklistIssues`, `SECTION_TITLES`), addresses (`checklistWorkHref`, `parseChecklistLocation`, `openChecklistRow`), objective review rules (`reviewChip`, `canDecideObjective`, `mayReviewObjectives`, `reviewStateAfterTick`, `reviewDecisionError`, `blockingReviews`, `reviewsAwaiting`, `parseObjectiveReviews`, `sentBackIndex`, `NO_REVIEWS`) |
| `actions.ts` | `'use server'` `checklistCommand` (create, add, edit, state, map, delete, duplicate, mode, review, submission, assign); a version conflict returns `errorCode: 'conflict'`. `loadChecklistRows` (Outline), `loadObjectiveReviews` (Today's item work) |
| `components/` | `ChecklistWorkspace` (checklist home: Setup / Activity / Closure tables, with a `questTimer` slot for Quest timers; the table of the rows under one row; manager progress source and "Rows without a section"), `ChecklistTable`, `ChecklistStateControl` + `ChecklistVersionProvider` (one-tap Yes / N/A, tap again to clear; commands queued so each sends the latest mission version), `objective-details.tsx` (`ObjectiveTick`, `ObjectiveDetails`, `ObjectiveRowStatus`, `ObjectiveLinks`: the same details in every view; the Table shows no links since 6 November 2026), `ChecklistItemWork` (Today), `ChecklistRowActions` (row menu sheet: add under this, edit, move, link to a mission for managers, duplicate, remove; no reason box since 6 November 2026, a removal keeps the row's title as its reason) and `ChecklistRowMenu` (the same menu with the Table's permission check, on every row of Board, Blocks and Outline), `ChecklistAddRow`, `quest-owner.tsx` (`QuestCrewProvider`, `QuestOwnerSelect`, `AssignQuestForm`, 122), `checklist-rows.tsx` (shared command fields), `objective-review.tsx` (`ObjectiveReviewProvider`, `ObjectiveReviewChip` with the review sheet, `ObjectiveReviewNote`, `useRowChangesNeeded` / `useSectionChangesNeeded`, `ObjectiveReviewQueue` for the mission page) |

## Private (`internal/`)

Work happens at `/tasks/[tag]/checklist`: without `parent` it is the checklist home with three tables in sheet order (Setup, Activity = Checklist Index, Closure); with `parent` it is the table of the rows under that row. `/checklist/manage`, `/checklist/[nodeId]` and `/checklist/work` redirect into it. Client helpers `checklistWorkHref`, `parseChecklistLocation` and `openChecklistRow` preserve section, row, batch and item addresses.
| File | Job |
|---|---|
| `input.ts` | Parses a checklist command form into the RPC payload |
| `commands.ts` | Calls `checklist_command` |
| `cache.ts` | Revalidates tasks, checklist pages, Task Tools, dashboard and team |
| `progress.ts` | Section and node progress rules (contract `m05-checklist-v1`, rules of migration 63) |
| `pages.ts` | Tree helpers |
| `read-model.ts` | Loads rollups through `checklist_rollups` |
| `branch.ts` | Bounded branch read (`checklist_branch`) and the unmapped top-level rows |
| `item-time.ts` | Item timers, today's hours and per-employee item hours (`server-only`) |
| `item-hours.ts` | Groups item-tagged logs by task and item |
| `table.ts` | Pure rules for the checklist tables (row kinds, completion choices, page result, readable rollup issues) |
| `focused-time.ts` | Bounded item-time reads: one item's aggregate, or the running timers for a table |
| `review.ts` | Objective review rules and the `checklist_reviews` payload parser (114) |
| `review-read.ts` | Calls `checklist_reviews`; adds the rows above each sent-back objective (`trail`) |

## Database it owns
| Object | Defined in |
|---|---|
| `task_checklists`, `checklist_nodes` | `07_tracker_replacement_foundation.sql` (row details in 33-35; one kind of row in 63) |
| `checklist_command` | `18_checklist_rollups_and_propagation.sql`, revised in 33, 35, 41, 43, 63, 66, 67, 69, 85 (wording), 109 (delete with nested Quests, edit loop check), 114 (`review`), 120 (project engineers only on their missions) and 122 (Quest owners, `assign`) |
| `checklist_nodes.assignee_id`; `taskpulse_private.is_crew`, `default_quest_owner`, `can_edit_quest_list`, `quest_default_owner` (trigger `zz_m122_quest_owner` on `task_checklists`) | `122_quest_owners.sql` |
| `quest_depth_guard` (`aa_m109_quest_rows`, `aa_m109_quest_depth`), `submission_guard`, `copy_owned_checklist` | 109 (replaces 77's `quest_items_guard` / `quest_nesting_guard`; no level limit since 122); 41 and 67; 41, patched in 109 |
| `checklist_nodes.review_state`, `reviewed_by`, `reviewed_at`, `review_note`; trigger `zz_m114_review_follows_tick`; `checklist_reviews(task)`; the objective check in `assert_checklist_done` | `114_objective_review.sql` |
| `checklist_follows_activity` trigger (`aa_m66_follow_activity`) | `66_progress_follows_activity.sql` (also patches `refresh_task_metrics`) |
| `checklist_rollups`, `checklist_result`, `checklist_node_result` | 18 and 41; replaced in 63; Quest rows in 67; section weights in 85 |
| `checklist_branch` | 41, patched in 63 (opens any non-linked row), 71 (linked tags) and 122 (`assigneeId`, `canEditQuest`, `canEdit`); since 117 it, `checklist_reviews`, `checklist_item_seconds` and `task_effort_breakdown` raise 42501 unless the caller may read the mission's work (`can_read_mission_work`, owned by modules/tasks); the `checklist_nodes`, `task_checklists` and `checklist_sections` read policies use the same rule |
| `checklist_sections` | 18; kept for older readers, no longer read by the rollup (63) |
| No rows under a row: every row with rows under it became a Quest (deepest first, ids and figures unchanged); `checklist_command` refuses `add`, `submission` and `edit` with a `parent_id` ("Rows cannot go under an objective"); the row menu has no "Add a row under this" or Move (user decision, 6 November 2026) | `130_rows_under_objectives_to_quests.sql` |
| `task_effort_breakdown` | `36_task_effort_breakdown.sql` |

It also reads `daily_task_logs` and `task_timers` (time tracking) for item time.
`review-read.ts` reads `checklist_nodes` (id, parent, list, section) and
`task_checklists.owner_node_id` for the rows above sent-back objectives.
All objects are company-scoped by migrations 39-40 (M15).

## Depends on
`shared/*` only. The tasks module depends on this one, not the other way round.
The checklist pages themselves stay in `app/(workspace)/tasks/[taskTag]/checklist`
and use the tasks public API to load the mission.

`checklist_branch` returns a bounded branch with authoritative progress and ancestry. `checklist_item_seconds` (42) returns a selected item aggregate only; `focused-time.ts` combines it with at most two timer rows. Migration 63 folded every Sub-mission's rows into its mission (Activity rows under the Sub-mission's row; Setup/Closure rows under a row of the same name in the mission's own Setup/Closure) and keeps `task_checklists.owner_node_id` only as a column that must be NULL.
