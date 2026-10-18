# attendance

See `docs/ARCHITECTURE.md` for the rules.

## What it does
Records each employee's measured daily attendance (status, regular hours,
separate off-hours, check-in/out) and shows whether each elapsed Asia/Kolkata
day is valid: task effort must fit within regular attendance plus off-hours.
Attendance is a gate for scoring, not a score bonus. It also reports the dates
on which the whole active team is on holiday.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | Server reads: `getAttendanceModuleData()`, `getTeamHolidayDates()`, types `AttendanceModuleData`, `AttendanceMemberSummary`; re-exports everything in `client.ts` |
| `actions.ts` | `'use server'` `saveAttendanceRecord()` (sets `kind=attendance` and calls the dated-record command) |
| `client.ts` | Pure helpers and types: `summarizeAttendance`, `EMPTY_ATTENDANCE_SUMMARY`, `AttendanceSummary`, `defaultHoursForStatus`, `computeHoursFromCheckTimes`, `compareRecordedHours`, `dailyAttendanceValidity`, `localCheckTime`, `ATTENDANCE_INPUT_VERSION`, `canManageAttendance`, `canEditAttendanceRecord`, `ATTENDANCE_COLUMNS`, `mapAttendanceRecord(s)` |
| `components/` | `AttendanceWorkspace` (the `/attendance` page body), `AttendanceRecordEditor` (record/correct form) |

Code that may end up in a client bundle (for example `lib/analytics/engine`)
imports `client.ts`, never `index.ts`: `index.ts` pulls in `server-only`.

## Private (`internal/`)
| File | Job |
|---|---|
| `queries.ts` | Members, attendance records and per-member input contexts for a period |
| `holidays.ts` | `team_holiday_dates` RPC (null when the database predates migration 37) |
| `contract.ts` | Exact-decimal hour validity rules and local check-time parsing |
| `summary.ts` | Period totals (payable days, hours) |
| `permissions.ts` | Who may manage or edit attendance (UI messages; the database is the real boundary) |
| `mappers.ts` | `attendance_records` row -> `AttendanceRecord` |

## Database it owns
| Object | Kind | Migrations |
|---|---|---|
| `attendance_records` | table | created 07; RLS policy 10; numeric hours, versions, `record_state`, history 19; approved policy 20; company scope 39-40 |
| `attendance_input_context(uuid,date,date,timestamptz)` | RPC (read) | 19, replaced 20 and 21 |
| `taskpulse_private.attendance_inputs` | private function | 21 |
| `team_holiday_dates(date,date)` | RPC (read) | 37 |

Writes go through `dated_record_command` (migration 19, company-scoped in 40),
which is shared with the support module's dated records. Reads also call
`observation_clock` (migration 30) via `shared/time/observation-clock`.

## Depends on
`shared/*` (including `shared/time/observation-clock` and
`shared/ui/execution-form`), the public APIs of `support` (`loadAttendanceContext`),
`tasks` and `time-tracking`, and, until those areas become modules,
`components/missions/mission-ui` and `app/records/actions` (`writeDatedRecord`).
