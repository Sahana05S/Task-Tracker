# time-tracking

Hours worked on missions: work logs (create, correct, reverse), timers on
Quests and on missions without Quests (start, stop, discard; migration 123),
manual time entry, the
"Log time" drawer, the timer button, the `/logs` history page, the running-timer pill in the shell,
and the effort and productivity formulas built on logged hours.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | Server reads: `getTaskExecution` (a mission's logs and timers), `getTimerSessionActivity` (what each stopped session covered, migration 110), `getMyLogHistory`, `getTaskEffortTotals`, `getLoggableTasksFor`, `getRunningTimers` (with each Quest timer's `nodeId` and `questTitle`), `getQuestMissionIds` (missions with Quests, for `RunningTimerProvider`), `getQuestTimes` (a mission's Quests with own and sub-Quest-inclusive logged seconds, `quest_time`, migration 123), `getTeamRunningTimers`, `getMemberLogDates` (Today's active days), `getMemberDayHours` (productive hours per member-day, overlapping timers merged, for the daily perf log), `getMemberDaySessions` (one member's day: timer segments and running timers with mission, start, end and note, plus manual entries; for the check-out report's time blocks). Also re-exports everything in `client.ts`. |
| `client.ts` | Pure formulas and helpers, safe for `'use client'`: `roundToNumericScale`, `computeScaledProgress`, `computeProductivity`, `isMetricsEligible`, `sumHours` (per mission), `mergedDayHours` (one person's productive hours: overlapping timer segments counted once, migration 118), `aggregateEffortByTask`, `groupLogsByDate`, log/timer mappers, timer elapsed-time helpers, `canStartTimerForTask`, `canManageTimerRecord`, session wording (`sessionSummary`, `describeSessionEvent`, `mapSessionActivity`), `runningTimerLabel` ("TAG › Quest"), `questTree` (Quests with their sub-Quests in reading order), and types (`QuestTime`) |
| `actions.ts` | `'use server'` `createTaskLog`, `updateTaskLog`, `deleteTaskLog`, `loadLoggableTasks` |
| `timer-actions.ts` | `'use server'` `startTaskTimer` (by `taskId`, or `taskTag` from older forms), `startItemTimer` (a Quest timer by `nodeId`, migration 123; non-Quest rows are refused), `stopTaskTimer`, `discardTaskTimer`, `discardTimerAsManager`, `enterManualTaskTime`; for the Android app's offline queue (M21), `recordOfflineTimer` (a timer run offline, whole mission or a checklist row) and `stopTimerAt` (a server timer stopped offline), both taking an object with the offline grant and a persistent operation id |
| `components/` | `QuickLogTrigger` ("Log time" pill) and `QuickLogDrawer`; `TimerButton` (play/stop pill for one Quest with `nodeId`, or for a mission without Quests) and `RunningTimerProvider`/`useRunningTimers`/`useRunningTimer(taskId, nodeId?)`/`useMissionHasQuests` (`running-timer-context.tsx`, mounted by the workspace layout with `getRunningTimers` and `getQuestMissionIds`); `QuestTimerList` (`quest-timers.tsx`: a mission's Quests with their time and a timer each); `LogHistory`; `timer-panels.tsx` (`TimerControl`, `TimerRecords` grouped by Quest with `groupTimersByQuest`, `ManualTimeForm`) |

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
| `timers/commands.ts` | Timer RPCs (including the offline `record_offline_timer` and `stop_task_timer_at`) and the task-tag lookup they need |
| `timers/*` | Elapsed time, timer log drafts, mappers, permissions, running-timer reads (`running-timers.ts` carries the task id and execution version the timer button needs) |
| `execution.ts` | A mission's logs and timers for the details page |
| `cache.ts` | Pages to revalidate after a log or timer change |

## Database it owns
| Object | Defined in |
|---|---|
| `daily_task_logs` | `01_init_schema.sql` (later columns in 07, 12, 34, 98) |
| `task_timers` | `07_tracker_replacement_foundation.sql` (later columns in 12, 34, 98) |
| `create_task_log`, `correct_task_log`, `reverse_task_log`, `start_task_timer`, `stop_task_timer`, `discard_task_timer` | `12_atomic_execution_commands.sql` |
| `start_checklist_item_timer` | `34_checklist_item_timers.sql` |
| `record_offline_timer`, `stop_task_timer_at` | `98_offline_timers.sql` |
| `timer_session_activity` (read only) | `110_timer_session_activity.sql` |
| `taskpulse_private.overlap_hours`, `taskpulse_private.member_day_hours` | `118_concurrent_timers.sql` |
| `idx_task_timers_one_running_per_quest` (replaces 118's per-mission index), `quest_time` (read only); `start_checklist_item_timer`, `timer_session_activity` (adds `node_id`, `quest_title`) and `execution_command` rewritten | `123_quest_timers.sql` |

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
Several missions' timers may run at once, one per mission (migration 118), so
the button shows Stop on each running mission and Start everywhere else; the
top-bar pill (which reads the same provider) links to the one timer, or reads
"2 timers running" and lists each.

## Offline timers (M21, migration 98)
The Android app sends timers recorded offline under an offline grant
(attendance module, migration 97). Both RPCs reuse the normal stop inside
`execution_command`, which ends at the time named by the transaction-local
`taskpulse.timer_end_at` for that timer, so the logs are the usual
Kolkata-midnight segments with `source_timer_id` and the checklist row tag.
Timers and their logs carry `recorded_offline` and `synced_at`. Since
migration 118 an offline timer may overlap the member's timers still running on
the server (the day's hours merge overlaps); the one-running-timer-per-mission
index skips offline timers, which run only inside their recording transaction.

## One mission timer and the session report (3 November 2026)
Update plan section 5 (decisions D07, D17, D-C1, D-C2). The per-row timer is
gone from every screen (checklist table, cards, outline, the row panel and
Today's roadmap), and the Est. and Elapsed columns are hidden; the Links
column stays. The data stays: `estimated_minutes`, `elapsed_seconds`,
`daily_task_logs.checklist_node_id` and `task_timers.checklist_node_id`, and
`getTaskEffortBreakdown` still shows past time per row.
`start_checklist_item_timer`, `record_offline_timer` with a row and
`startItemTimer` stay on the server for older clients and the Android offline
queue. Since 4 November 2026 (migration 118) several missions' timers may run
at once; see "Several timers at once" below.

`TimerButton`'s Stop opens a sheet with the session note (`task_timers.notes`,
sent as `notes` to `stop_task_timer`, which keeps the start note when none is
sent). On the History tab each stopped session in `TimerRecords` says
"During this session: …", from `timer_session_activity` (migration 110): the
commands that timer's owner ran on the mission and its checklists between
start and stop. Managers read every session, members their own, as for
`task_timers`, and only on missions whose work they may read (migration 117:
the managing director and the mission's people; anyone else gets 42501). Timer logs still add hours only (`effective_progress_delta = 0`);
no score changes. Tests: `tools/test_timer_session_activity_database.py`.

## Several timers at once (4 November 2026, migration 118)
User decisions: a person may run several mission timers at the same time; each
mission keeps its full time (A 09:00-13:00 logs 4 h on A, B 11:00-14:00 logs
3 h on B); the day's productive hours are the merged time (09:00-14:00 = 5 h).
`idx_task_timers_one_running_per_mission` allows at most one running server
timer per person per mission (since 123, per person per Quest; the 23505
message reads "This timer is already running"). Every daily total merges overlapping timer segments and adds
manual and imported hours as entered: in SQL `taskpulse_private.overlap_hours`
(sum of segment lengths minus their union), used by `member_day_hours`,
attendance validity (`attendance_inputs`, so `attendance_input_context`, scoring
and stars) and `policy_period_facts`; in TypeScript `shared/time/intervals.ts`
(`mergedSeconds`, `overlapSeconds`) and `mergedDayHours`, used by team analytics
hours, `getMemberDayHours` (Daily perf log), the daily report, My effort log and
the log compilation. The effort snapshots (`capture_effort_input`) now carry
`timer_segment_start`/`timer_segment_end`; older snapshots had no overlaps, so
their plain sum is already merged. Task productivity, scale-by-hours and every
per-mission figure keep the full time.

## Quest timers (5 November 2026, migration 123)
User decisions: a mission with Quests is timed on its Quests. One running timer
per person per Quest (`idx_task_timers_one_running_per_quest`, keyed by person,
mission and Quest, the mission timer being the "no Quest" slot); several people
can time the same Quest; one person can time several Quests at once, and the
day's hours still merge overlaps (118). A mission with no Quests keeps its
mission timer; `start_task_timer` is refused once a mission has Quests, and a
mission timer already running is never touched (it can still be stopped).
`start_checklist_item_timer` accepts Quest rows only (a row that owns a Quest
list) and needs the mission's Crew or a manager, like every timer; the Quest is
set on insert (`taskpulse.quest_timer`), so the same Quest twice by one person
is refused with "Your timer is already running on this Quest".
`record_offline_timer` is unchanged, so time recorded offline is never lost.
`quest_time(task)` gives each Quest's own seconds and its total including
everything inside it and its sub-Quests (recursive on `owner_node_id` with a
path array); only those who may read the mission's work (117) read it.
Scoring keeps reading total task hours; historical timer records are kept.

Screens: a Start/Stop on each Quest row of the checklist table and on a
Quest's home (supplied by the checklist page through `questTimer`, since
checklists may not import this module), on an open Quest in Today's graph, and
in the mission page's Time panel (`QuestTimerList`); the mission-level
`TimerButton` hides on missions with Quests (`useMissionHasQuests`) unless a
mission timer is still running. The running-timer pill reads "TAG › Quest".
The History tab and Reports > Mission activity group sessions by Quest.
Tests: `tools/test_timer_session_activity_database.py` (migration 123 part).
