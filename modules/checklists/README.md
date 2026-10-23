# checklists

A mission's master checklist: one kind of row, nested as deep as needed (the
sheet's Checklist Home and "[ChL]" tabs), in Setup / Activity / Closure
sections, with Yes/No/N/A states, per-row links and estimates, progress
rollups, and the time recorded against checklist items (item timers save
ordinary task logs tagged with the item).

Since migration 63 (user decisions, 23 October 2026) any row that is not linked
to a mission can have rows added under it. A row with rows under it takes their
equal average and opens their table; its own tick is cleared when the first row
goes under it. A section counts once it has a row; an empty section is N/A and
does not block Done. Sub-missions, the Page/Group/Item choice, the section
review step and the separate structure page are gone.

Since migration 64 (user decision, 23 October 2026) every mission with a
checklist takes its progress from Activity; the manual/Activity switch is gone
and `mode` refuses to switch it off. Rows added after 100% lower progress at
once. When a change cannot be credited yet (no scale, no anchor, legacy shares)
progress still follows and the credit waits, anchor kept, until reconciled.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | Server reads: `loadChecklistRollups`, `getChecklistItemTime`, `getTaskEffortBreakdown`, `getEmployeeItemHours`, `getChecklistBranch`, `getUnmappedRootRows`, `getFocusedChecklistItemTime`, `getRunningChecklistTimers`. Also re-exports everything in `client.ts`. |
| `client.ts` | Pure rules and types, safe for `'use client'`: `CHECKLIST_SECTIONS`, `computeChecklistProgress`, rollup/section types, tree helpers (`childrenOf`, `ancestry`, `isContainer`, `subtreeSeconds`, `formatMinutes`), `groupItemHours`, table rules (`rowKind`, `stateChoices`, `opensTable`, `pageResult`, `sectionStatus`, `checklistIssues`, `SECTION_TITLES`), addresses (`checklistWorkHref`, `parseChecklistLocation`, `openChecklistRow`) |
| `actions.ts` | `'use server'` `checklistCommand` (create, add, edit, state, map, delete, duplicate, mode) |
| `components/` | `ChecklistWorkspace` (checklist home: Setup / Activity / Closure tables; the table of the rows under one row; manager progress source and "Rows without a section"), `ChecklistTable`, `ChecklistStateControl` + `ChecklistVersionProvider` (one-tap Yes / No / N/A, commands queued so each sends the latest mission version), `ChecklistRowActions` (row menu sheet: add under this, edit, move, link to a mission for managers, duplicate, remove), `ChecklistAddRow`, `checklist-rows.tsx` (item timer and completion controls) |

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
| `checklist_command` | `18_checklist_rollups_and_propagation.sql`, revised in 33, 35, 41, 43, 63 and 64 |
| `checklist_follows_activity` trigger (`aa_m64_follow_activity`) | `64_progress_follows_activity.sql` (also patches `refresh_task_metrics`) |
| `checklist_rollups`, `checklist_result`, `checklist_node_result` | 18 and 41; replaced in 63 |
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
