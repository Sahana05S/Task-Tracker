# checklists

A mission's master checklist: one kind of row, nested as deep as needed (the
sheet's Checklist Home and "[ChL]" tabs), in Setup / Activity / Closure
sections, with Yes/No/N/A states, per-row links, progress rollups, and the
time recorded against checklist rows before 3 November 2026 (item timers
saved ordinary task logs tagged with the row; since then time is kept by the
mission timer only, and the per-row timer, Est. and Elapsed columns are gone
from every view, update plan section 5; the data and `getChecklistItemTime`
reads stay).

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
Quests (sub-quests) and Sub-missions, **at most three levels of Quest** deep
(D-B1). `quest_depth_guard` replaces migration 77's item-only triggers: rows in
a Quest stay in its single list and a fourth Quest level is refused; the add
row stops offering Quest at the third level (`MAX_QUEST_LEVEL`).
`checklist_node_result` reads each Quest's own list through its path argument,
so nested work counts once and the weights of migration 85 are unchanged; the
TypeScript mirror reads a Quest's list from `ChecklistProgressNode.quest`.
`delete` with `with_children` removes every Quest list inside the row at any
depth (Sub-missions stay missions of their own); `edit` refuses moving a row
under one of its own rows; duplicating a Quest skips Sub-mission rows.

Tests: `__tests__/fixtures/checklist-rollups.json` (nested-quest cases) and
`tools/test_checklist_subquests_database.py`.

Four views (user decision, 23 October 2026), switched by `ChecklistViewSwitch`
and kept in `?view=` plus per-device memory (phones start on Blocks): **Table**
(the sheet), **Board** (Setup / Activity / Closure side by side as columns of
cards), **Blocks** (card grids per phase; Quests and sub-missions larger) and
**Outline** (every level as one collapsible list; a level is read only when
opened, through `loadChecklistRows`). Every view ticks with the same one-tap
control.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | Server reads: `loadChecklistRollups`, `getChecklistItemTime`, `getTaskEffortBreakdown`, `getEmployeeItemHours`, `getChecklistBranch`, `getUnmappedRootRows`, `getFocusedChecklistItemTime`, `getRunningChecklistTimers`. Also re-exports everything in `client.ts`. |
| `client.ts` | Pure rules and types, safe for `'use client'`: `CHECKLIST_SECTIONS`, `computeChecklistProgress`, rollup/section types, tree helpers (`childrenOf`, `ancestry`, `isContainer`, `subtreeSeconds`, `formatMinutes`), `groupItemHours`, table rules (`rowKind`, `stateChoices`, `opensTable`, `pageResult`, `sectionStatus`, `checklistIssues`, `SECTION_TITLES`), addresses (`checklistWorkHref`, `parseChecklistLocation`, `openChecklistRow`) |
| `actions.ts` | `'use server'` `checklistCommand` (create, add, edit, state, map, delete, duplicate, mode); a version conflict returns `errorCode: 'conflict'` |
| `components/` | `ChecklistWorkspace` (checklist home: Setup / Activity / Closure tables; the table of the rows under one row; manager progress source and "Rows without a section"), `ChecklistTable`, `ChecklistStateControl` + `ChecklistVersionProvider` (one-tap Yes / No / N/A, commands queued so each sends the latest mission version), `ChecklistRowActions` (row menu sheet: add under this, edit, move, link to a mission for managers, duplicate, remove), `ChecklistAddRow`, `checklist-rows.tsx` (completion controls) |

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

## Database it owns
| Object | Defined in |
|---|---|
| `task_checklists`, `checklist_nodes` | `07_tracker_replacement_foundation.sql` (row details in 33-35; one kind of row in 63) |
| `checklist_command` | `18_checklist_rollups_and_propagation.sql`, revised in 33, 35, 41, 43, 63, 66, 67, 69, 85 (wording) and 109 (delete with nested Quests, edit loop check) |
| `quest_depth_guard` (`aa_m109_quest_rows`, `aa_m109_quest_depth`), `submission_guard`, `copy_owned_checklist` | 109 (replaces 77's `quest_items_guard` / `quest_nesting_guard`); 41 and 67; 41, patched in 109 |
| `checklist_follows_activity` trigger (`aa_m66_follow_activity`) | `66_progress_follows_activity.sql` (also patches `refresh_task_metrics`) |
| `checklist_rollups`, `checklist_result`, `checklist_node_result` | 18 and 41; replaced in 63; Quest rows in 67; section weights in 85 |
| `checklist_branch` | 41, patched in 63 (opens any non-linked row) |
| `checklist_sections` | 18; kept for older readers, no longer read by the rollup (63) |
| `task_effort_breakdown` | `36_task_effort_breakdown.sql` |

It also reads `daily_task_logs` and `task_timers` (time tracking) for item time.
All objects are company-scoped by migrations 39-40 (M15).

## Depends on
`shared/*` only. The tasks module depends on this one, not the other way round.
The checklist pages themselves stay in `app/(workspace)/tasks/[taskTag]/checklist`
and use the tasks public API to load the mission.

`checklist_branch` returns a bounded branch with authoritative progress and ancestry. `checklist_item_seconds` (42) returns a selected item aggregate only; `focused-time.ts` combines it with at most two timer rows. Migration 63 folded every Sub-mission's rows into its mission (Activity rows under the Sub-mission's row; Setup/Closure rows under a row of the same name in the mission's own Setup/Closure) and keeps `task_checklists.owner_node_id` only as a column that must be NULL.
