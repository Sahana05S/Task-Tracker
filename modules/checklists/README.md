# checklists

A mission's master checklist: nested pages (Page/Group/Item rows), Setup /
Activity / Closure sections, Yes/No/N/A states, per-row links and estimates,
progress rollups, and the time recorded against checklist items (item timers
save ordinary task logs tagged with the item).

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | Server reads: `loadChecklistRollups`, `getChecklistItemTime`, `getTaskEffortBreakdown`, `getEmployeeItemHours`, `getChecklistBranch`, `getFocusedChecklistItemTime`. Also re-exports everything in `client.ts`. |
| `client.ts` | Pure rules and types, safe for `'use client'`: `CHECKLIST_SECTIONS`, `computeChecklistProgress`, rollup/section types, page-tree helpers (`childrenOf`, `ancestry`, `checklistHref`, `isContainer`, `subtreeSeconds`, `formatMinutes`), `groupItemHours` |
| `actions.ts` | `'use server'` `checklistCommand` (create, add, submission, edit, state, map, delete, duplicate, section, mode) |
| `components/` | `checklist-rows.tsx` (checklist tables, row editors, page links), `RunningClock`, `ChecklistWorkspace` (bounded section/page browser), `ChecklistCreateForm` (Item/Page/Sub-mission creation) |

## Private (`internal/`)

Client helpers `checklistWorkHref`, `parseChecklistLocation` and `openChecklistRow` preserve section, page, batch and item addresses for `/checklist/work`. This workspace uses authoritative branch rollups and keeps Sub-mission ownership distinct from ordinary Pages.
| File | Job |
|---|---|
| `input.ts` | Parses a checklist command form into the RPC payload |
| `commands.ts` | Calls `checklist_command` |
| `cache.ts` | Revalidates tasks, checklist pages, Task Tools, dashboard and team |
| `progress.ts` | Section and node progress rules (contract `m05-checklist-v1`) |
| `pages.ts` | Nested page tree helpers |
| `read-model.ts` | Loads rollups through `checklist_rollups` |
| `item-time.ts` | Item timers, today's hours and per-employee item hours (`server-only`) |
| `item-hours.ts` | Groups item-tagged logs by task and item |

## Database it owns
| Object | Defined in |
|---|---|
| `task_checklists`, `checklist_nodes` | `07_tracker_replacement_foundation.sql` (pages and row details in 33-35) |
| `checklist_command` | `18_checklist_rollups_and_propagation.sql`, revised in 33 and 35 |
| `checklist_rollups` | `18_checklist_rollups_and_propagation.sql` |
| `task_effort_breakdown` | `36_task_effort_breakdown.sql` |

It also reads `daily_task_logs` and `task_timers` (time tracking) for item time.
All objects are company-scoped by migrations 39-40 (M15).

## Depends on
`shared/*` only. The tasks module depends on this one, not the other way round.
The checklist pages themselves stay in `app/(workspace)/tasks/[taskTag]/checklist`
and use the tasks public API to load the mission.

Recursive Sub-missions own separate `task_checklists.owner_node_id` checklists (41); ordinary Pages stay unchanged. `checklist_branch` returns a bounded branch with authoritative progress and ancestry. `checklist_item_seconds` (42) returns a selected item aggregate only; `focused-time.ts` combines it with at most two timer rows. These APIs preserve root mission time/scoring and inherit its owner/deadline.
