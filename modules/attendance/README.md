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

## Photo check-in (migration 72)
`/attendance/check-in` replaces the sheet's AppSheet "Check in" form. Email,
date and time fill themselves, the phone shares its position (shown on an
OpenStreetMap embed; saving without it is allowed and says so) and the member
takes a photo (`capture="user"`, shrunk in the browser to a JPEG of at most
720 px). The server action uploads it to the private `attendance-photos`
bucket under `<organization>/<user>/<date>/<in|out>-<uuid>.jpg`, then runs
`attendance_check_in`, which takes the time from the database clock, flags a
position farther than the company's office radius (never refuses it) and
writes the day's record through `dated_record_command`: check-in creates it as
Present, 8 h, off-hours 0 (migration 73); check-out corrects that same record
to both check times and regular hours = out - in truncated to 2 decimals. A day
that already had a record at check-in, or one a manager changed afterwards, is
left alone (`recordExists`). The Today page
header, the phone's New menu and the attendance page link to it; matrix cells
show a camera mark and the cell editor shows both photos (10-minute signed
links), the times, a map link and an "outside office" badge. Before the
day's record exists, `policy_period_facts` reads the check-in time, so the
on-time policy sees it. Photos older than the company's retention are removed
nightly by `POST /api/internal/attendance-photos` (third step of
`.github/workflows/award-worker.yml`); the times and positions stay.

## End-of-day marking (migration 73)
Just after midnight, before the award run, the first step of
`.github/workflows/award-worker.yml` calls `POST /api/internal/attendance-autofill`
(`attendance_autofill`, service role). For every company with automatic marking
on (Settings > Company > Check-in), every active member and every ended day since
the company's start date (at most 14 days back) that has no record becomes
Present (checked in: 8 h, or out - in with both times), Holiday (a calendar
holiday's name, or "Weekly off" on the company's weekly off days, Sunday by
default) or Absent. Rows are written like a dated-record save with no actor and
the reason "Marked automatically"; frozen days are skipped, and any existing
record (active or withdrawn) is never changed.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | Server reads: `getAttendanceModuleData()`, `getTeamHolidayDates()`, `getCheckIns()` (a period's check-ins: all for managers, own otherwise), `getDayCheckIns()` (one person's day), types `AttendanceModuleData`, `AttendanceMemberSummary`, `CheckInPhoto`, `CheckInResult`; the photo clean-up worker `handleAttendancePhotoRetention()`; the end-of-day marking `handleAttendanceAutofill()`; re-exports everything in `client.ts` |
| `check-in-actions.ts` | `'use server'` `checkIn()` (upload the photo, then `attendance_check_in`; `operationId` and `photoId` make a retry replay), `loadCheckInPhotos()` (signed links for one person's day: own, or anyone's for MD/PE) |
| `actions.ts` | `'use server'` `saveAttendanceRecord()` (sets `kind=attendance` and calls the dated-record command); `fillAttendanceDay()` (one new record per listed member for a day, each with an operation id derived from the form's, so a resubmit replays; existing records are never overwritten; reports saved and skipped members) |
| `client.ts` | Matrix model and editing payload: `attendanceMatrix`, `attendanceMonth`, `monthDates`, `shiftMonth`, `cellValues`, `withStatus`, `hoursBetween`, `cellCommand`, `emptyCells`, `fillCommand`, types `AttendanceMatrixModel`, `MatrixRow`, `MatrixCell`, `CellValues`, `DayFill`; pure helpers and types: `summarizeAttendance`, `EMPTY_ATTENDANCE_SUMMARY`, `AttendanceSummary`, `defaultHoursForStatus`, `computeHoursFromCheckTimes`, `compareRecordedHours`, `dailyAttendanceValidity`, `localCheckTime`, `ATTENDANCE_INPUT_VERSION`, `canManageAttendance`, `canEditAttendanceRecord`, `ATTENDANCE_COLUMNS`, `mapAttendanceRecord(s)`; check-in helpers `compressPhoto`, `mapLink`, `mapEmbed`, `MAX_PHOTO_BYTES`, types `CheckInKind`, `CheckInMark` |
| `components/` | `AttendanceWorkspace` (the `/attendance` page body), `AttendanceMatrix` (grid or calendar, one shared editor sheet), `AttendanceCellEditor`, `AttendanceDayFill`, `CheckInDay` (the `/attendance/check-in` body), `CheckInForm`, `CheckInEvidence`, `CheckInPrompt` (Today's button) |

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
| `check-in-model.ts` | Check-in types, row mapper, map links and photo compression (client-safe) |
| `check-in.ts` | Check-in reads, photo upload/discard, the `attendance_check_in` wrapper and signed photo links |
| `photo-retention.ts` | The nightly worker that removes expired photos |

## Database it owns
| Object | Kind | Migrations |
|---|---|---|
| `attendance_records` | table | created 07; RLS policy 10; numeric hours, versions, `record_state`, history 19; approved policy 20; company scope 39-40 |
| `attendance_input_context(uuid,date,date,timestamptz)` | RPC (read) | 19, replaced 20 and 21 |
| `taskpulse_private.attendance_inputs` | private function | 21 |
| `team_holiday_dates(date,date)` | RPC (read) | 37 |
| `attendance_check_ins` | table (read: own, or the company for MD/PE) | 72 |
| `attendance_check_in(text,text,numeric,numeric,numeric,uuid)` | RPC (command) | 72 |
| `attendance_photos_due(int)`, `attendance_photos_cleared(uuid[])` | RPC (service role) | 72 |
| `attendance_autofill(date)` | RPC (service role, end-of-day marking) | 73 |
| `attendance-photos` | storage bucket and its four policies | 72 |

Writes go through `dated_record_command` (migration 19, company-scoped in 40),
which is shared with the support module's dated records. Reads also call
`observation_clock` (migration 30) via `shared/time/observation-clock`.

## Depends on
`shared/*` (including `shared/time/observation-clock` and
`shared/ui/execution-form`), the public APIs of `support` (`loadAttendanceContext`), `settings` (check-in settings),
`tasks` and `time-tracking`. Record writes use the `records` module (`writeDatedRecord`).
