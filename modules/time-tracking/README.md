# time-tracking

Hours worked on missions: work logs (create, correct, reverse), task timers
(start, stop, discard, item timers on checklist rows), manual time entry, the
"Log time" drawer, the timer button, the `/logs` history page, the running-timer pill in the shell,
and the effort and productivity formulas built on logged hours.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | Server reads: `getTaskExecution` (a mission's logs and timers), `getMyLogHistory`, `getTaskEffortTotals`, `getLoggableTasksFor`, `getRunningTimers`, `getTeamRunningTimers`, `getMemberLogDates` (Today's active days), `getMemberDayHours` (unreversed hours per member-day, for the daily perf log). Also re-exports everything in `client.ts`. |
| `client.ts` | Pure formulas and helpers, safe for `'use client'`: `roundToNumericScale`, `computeScaledProgress`, `computeProductivity`, `isMetricsEligible`, `sumHours`, `aggregateEffortByTask`, `groupLogsByDate`, log/timer mappers, timer elapsed-time helpers, `canStartTimerForTask`, `canManageTimerRecord`, and types |
| `actions.ts` | `'use server'` `createTaskLog`, `updateTaskLog`, `deleteTaskLog`, `loadLoggableTasks` |
| `timer-actions.ts` | `'use server'` `startTaskTimer` (by `taskId`, or `taskTag` from older forms), `startItemTimer`, `stopTaskTimer`, `discardTaskTimer`, `discardTimerAsManager`, `enterManualTaskTime` |
| `components/` | `QuickLogTrigger` ("Log time" pill) and `QuickLogDrawer`; `TimerButton` (play/stop pill for one mission) and `RunningTimerProvider`/`useRunningTimer` (`running-timer-context.tsx`, mounted by the workspace layout with `getRunningTimers`); `LogHistory`; `timer-panels.tsx` (`TimerControl`, `TimerRecords`, `ManualTimeForm`) |

## Private (`internal/`)
| File | Job |
|---|---|
| `logs/input.ts` | Parses and validates a log entry (date grace, hours, progress delta, safe links) |
| `logs/commands.ts` | `create_task_log`, `correct_task_log`, `reverse_task_log` |
| `logs/queries.ts` | Log history, per-task effort totals, the tasks a member may log against |
| `logs/metrics.ts` | Effort and productivity formulas (`domain-rules.md`) |
| `logs/mappers.ts` | `daily_task_logs` row -> `DailyTaskLog` |
| `logs/member-log-dates.ts` | A member's unreversed log dates in a range, for Today (throws on error) |
| `logs/member-day-hours.ts` | Unreversed hours per member-day in a range, exact sums, paged (throws on error) |
| `timers/commands.ts` | Timer RPCs and the task-tag lookup they need |
| `timers/*` | Elapsed time, timer log drafts, mappers, permissions, running-timer reads (`running-timers.ts` carries the task id and execution version the timer button needs) |
| `execution.ts` | A mission's logs and timers for the details page |
| `cache.ts` | Pages to revalidate after a log or timer change |

## Database it owns
| Object | Defined in |
|---|---|
| `daily_task_logs` | `01_init_schema.sql` (later columns in 07, 12, 34) |
| `task_timers` | `07_tracker_replacement_foundation.sql` |
| `create_task_log`, `correct_task_log`, `reverse_task_log`, `start_task_timer`, `stop_task_timer`, `discard_task_timer` | `12_atomic_execution_commands.sql` |
| `start_checklist_item_timer` | `34_checklist_item_timers.sql` |

All objects are company-scoped by migrations 39-40 (M15). The timer commands
also read `tasks.id` by tag.

## Depends on
`shared/*` (including `shared/ui/running-clock`) and the public API of `tasks`
(task rules, mappers, effort type, tag normalisation).
Tasks never imports this module: the Missions page fills the task cards' slot
with `TimerButton` (`modules/workspace-views/components/missions-workspace.tsx`),
and the mission page loads `getTaskExecution` alongside the task data.

## Where time is entered
One manual entry, "Log time" (`QuickLogDrawer`): the desktop top bar, the phone
"New" menu, and the mission page's manual-time panel. One timer control,
`TimerButton`: Today's map and list, Missions cards and the mission page header.
The database allows one running timer per user, so the button shows Stop on the
running mission and is unavailable elsewhere; the top-bar pill (which reads
the same provider) links to it.
