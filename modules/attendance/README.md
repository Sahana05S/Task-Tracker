# attendance

See `docs/ARCHITECTURE.md` for the rules.

## What it does
Records each employee's measured daily attendance (status, regular hours,
separate off-hours, check-in/out) and shows whether each elapsed Asia/Kolkata
day is valid: task effort must fit within regular attendance plus off-hours.
Attendance is a gate for scoring, not a score bonus. It also reports the dates
on which the whole active team is on holiday.

The `/attendance` page is a month matrix (members by days, `?month=YYYY-MM`,
never a month that has not started): each cell shows the status colour and
mark, the hours, a red dot where logged mission time is more than attendance
plus off-hours, and a dashed cell for an elapsed day with no record. Selecting
a day opens the cell editor (status, check-in/out with "Now" today, hours
filled with the usual 8 / 4 when the status changes, off-hours, holiday name,
note, and a reason when correcting). Managers (MD, PE) can fill one day for
everyone: a named holiday, or Present 8 h / Half Day 4 h, only for members with
no record that day. A member viewing their own month sees a calendar. Every
save goes through `dated_record_command`; nothing here adds a rule, and the
calendar holidays of company settings (migration 53) arrive through the same
records.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | Server reads: `getAttendanceModuleData()`, `getTeamHolidayDates()`, types `AttendanceModuleData`, `AttendanceMemberSummary`; re-exports everything in `client.ts` |
| `actions.ts` | `'use server'` `saveAttendanceRecord()` (sets `kind=attendance` and calls the dated-record command); `fillAttendanceDay()` (one new record per listed member for a day, each with an operation id derived from the form's, so a resubmit replays; existing records are never overwritten; reports saved and skipped members) |
| `client.ts` | Matrix model and editing payload: `attendanceMatrix`, `attendanceMonth`, `monthDates`, `shiftMonth`, `cellValues`, `withStatus`, `hoursBetween`, `cellCommand`, `emptyCells`, `fillCommand`, types `AttendanceMatrixModel`, `MatrixRow`, `MatrixCell`, `CellValues`, `DayFill`; pure helpers and types: `summarizeAttendance`, `EMPTY_ATTENDANCE_SUMMARY`, `AttendanceSummary`, `defaultHoursForStatus`, `computeHoursFromCheckTimes`, `compareRecordedHours`, `dailyAttendanceValidity`, `localCheckTime`, `ATTENDANCE_INPUT_VERSION`, `canManageAttendance`, `canEditAttendanceRecord`, `ATTENDANCE_COLUMNS`, `mapAttendanceRecord(s)` |
| `components/` | `AttendanceWorkspace` (the `/attendance` page body), `AttendanceMatrix` (grid or calendar, one shared editor sheet), `AttendanceCellEditor`, `AttendanceDayFill` |

Code that may end up in a client bundle (for example the scoring engine)
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
| `matrix.ts` | The month matrix, the month parameter, the cell editor's values and the exact command fields for a cell or a day fill |

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
`tasks` and `time-tracking`. Record writes use the `records` module (`writeDatedRecord`).
