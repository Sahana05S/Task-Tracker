# TaskPulse operating guide (current local implementation)

These workflows describe the current application code. They need signed-in
staging verification before production use. Drive automation is disabled;
**Add Existing Link** saves a URL only and does not create or rename a Drive file.

## Start and review work

Managers create tasks with an assignee, priority, dates, scale mode and native
details. Manual initialization and the valid-entry automatic path create the
same native task details/checklist structure; the automatic path does not run
Drive operations. Published templates are versioned. A new copy starts at
Not Started, 0% progress, with fresh checklist state; inspect its dates,
members and details before assigning work.

Use the task's SMART and Input/Process/Output panels for native details. Setup,
Activity and Closure are separate checklist sections. Assigned members mark
permitted leaf items Yes, No or N/A. N/A is excluded from the percentage;
empty or all-N/A sections display Not applicable. A manager must explicitly
confirm an intentionally empty section. Only Activity can own task progress,
after a manager's reasoned mode switch with a preview. A switch changes current
progress but does not rewrite earlier earned credit. Done requires initialized
section evidence and current assigned-reviewer approvals; a percentage alone
does not close a task. Relevant work invalidates stale approvals.

## Record time, attendance and contributions

Use the task timer or an explicit log to enter measured effort. A timer crossing
Asia/Kolkata midnight produces dated segments. On reload, inspect the active
timer before stopping; retry an operation with the same operation identity
rather than adding a second log. Corrections and reversals retain history;
reversal removes effective credit without physically deleting the source.
Earlier captured scale and participant shares remain attached to prior credit.

Record attendance for every elapsed local day in a report period. Present and
Half Day require measured regular hours; Off Hours/Holiday may record separate
measured off-hours with zero regular hours. Absent/Leave record zero of both.
Task hours for each date must fit that date's regular plus off-hours. Missing
attendance stays Unavailable and excess effort makes the period invalid;
another day's spare hours cannot make it valid. Attendance is an award gate,
not a score bonus.

### Importing a month from the billed attendance sheet

`tools/seed_sheet_to_project.py --attendance FILE --attendance-month YYYY-MM`
imports one month tab of the billed attendance workbook (the tracker's
"Attendance Sheet Link"). Export the workbook as `.xlsx` first; a private
sheet cannot be fetched by link. Each person-day is saved with
`dated_record_command('attendance')` as the managing director, in one
transaction, so validation, input history and the audit log apply exactly as
for a manual save.

- Staff rows match profiles in the company by full name. When a name differs,
  pass `--attendance-person "Sheet Name=email or employee id"`. Unknown,
  inactive or ambiguous names stop the run before anything is written.
- Codes: `P` and `UD` are Present, `H` Half Day, `AB` Absent and `F` Holiday.
  `L` (late) is a flag, and check-in/out times are kept. A blank Sunday is a
  Holiday named Sunday. A blank date on the company holiday calendar takes
  the calendar's name. Any other blank working day, or an unknown code, stops
  the run. A status written in the sheet always wins over the calendar.
- Regular hours are the sheet's Worked Hours, rounded down to 0.01 h so they
  never exceed the check-in/out span. Off-hours are the task hours logged that
  day beyond the worked hours (zero on Absent days). The dry run lists every
  such day, and Absent days with logged hours, which will read invalid.
- Managing directors' rows are skipped; `--attendance-include-directors`
  imports them.
- Without `--yes` the tool prints the gates, the people matrix, counts per
  person and status, total hours, and the days it would create, restore
  (withdrawn rows), skip or overwrite. Existing attendance that differs from
  the sheet is refused unless `--overwrite-attendance` is given.
- The manifest (outside the repository) lists every row written, with the
  previous values of overwritten rows. `--undo MANIFEST` withdraws the created
  rows and puts overwritten rows back. It refuses if any of those rows changed
  since the import. Re-running an import that already matches writes nothing.
- After writing, the tool re-reads every person-day and prints the director's
  September performance read per member: attendance available, valid and the
  reasons.

Hosted runs use the same target gates as the task seed: a linked workdir, an
ACTIVE_HEALTHY project and the ledger count (`--allow-ledger`). The demo
project also needs `--confirm-production-ref` and the user's go-ahead.
`tools/test_attendance_import_database.py` checks the whole flow on a
disposable database with the synthetic workbook
`tools/fixtures/attendance-september-2026.xlsx`.

Authors may edit or withdraw their own pending fact, idea or suggestion.
Managers/data managers validate another person's contribution; self-validation
is denied. A reviewed correction needs a reason and resets the entry to pending
while retaining the previous review. Pending, validated, rejected and withdrawn
have distinct credit. Use the original business date and the report's as-of
time when investigating differences. Sales entries may be recorded, but the
BN/BO/BP score mapping is unresolved, so a sales factor can be Unavailable.

## Read performance and awards

Select the same month and as-of date across dashboard, employee profile and
live report before comparing them. The ten factors show raw value, factor
median, difference, weighted contribution and source/availability reasons.
Task productivity is task percentage points per logged hour; employee
productivity is credited scaled progress per regular attendance hour. Shared
task attribution uses the recorded shares. Missing source data is not a zero
score. If any required factor or valid attendance is absent, no final ranking
or certified award should be inferred from a visible subtotal.

Daily awards use month-to-date context through each Kolkata day and require
positive regular attendance that day plus valid daily/month-to-date evidence.
Exact top ties record no winner. A director may override a complete run only
to another eligible candidate, with a reason; a later recalculation needs
reaffirmation. Failed or blocked worker runs need investigation and replay in
an approved environment.

### Nightly award run

`.github/workflows/award-worker.yml` calls `POST /api/internal/awards` every
night at 00:15 Asia/Kolkata (and on demand from the Actions tab). Each call
queues due award days of the current month through yesterday and runs up to 10
jobs; the workflow repeats until a batch is empty, writes a status table to the
run summary, and fails (GitHub emails the owner) on an HTTP error or any
`failed` job. `blocked` days mean required inputs are missing (for example no
attendance); the app shows them as waiting for data, so they do not fail the run.

Switching it on takes four settings, each done by the owner:

1. GitHub repository secrets: `APP_URL` (the deployed origin) and
   `TASKPULSE_AWARD_WORKER_TOKEN` (a long random value).
2. Vercel environment variables: `TASKPULSE_AWARD_WORKER_ENABLED=production`,
   the same `TASKPULSE_AWARD_WORKER_TOKEN`, and `SUPABASE_SERVICE_ROLE_KEY`;
   redeploy afterwards.
3. The database schedule switch, once per project (owner SQL, no app command):
   `UPDATE taskpulse_private.award_policy SET schedule_enabled = true;`
   Until then the run reports "The database award schedule is off".
4. Run the workflow once by hand and read its summary.

`TASKPULSE_AWARD_WORKER_ENABLED=sandbox` remains for test environments; any
other value keeps the endpoint off.

## Reports and closed months

Live reports can be selected by period/as-of. A director may retain a draft or
close a month. When score/award evidence is missing, the close is explicitly
**Incomplete — not certified**, with reasons and no certified winner. Closing
does not invent absent sales or history. Use the retained revision selector to
view/download the same archived evidence later; exports follow the selected
revision and employee detail permissions.

For a closed-month correction, the director names the existing source record
or task attribution, exact in-month dates and reason. Only that scope is opened.
After the correction and recomputation, publishing creates a new retained
revision; the earlier revision remains selectable and visibly superseded.
Ordinary edits to unrelated closed records remain blocked. A database backup
and operational release procedure are in [the release runbook](plans/RELEASE-RUNBOOK.md).

## Database backups (Supabase Free plan)

The Free plan has no automatic Supabase backups. The GitHub Actions workflow
`.github/workflows/db-backup.yml` takes a nightly logical backup at 20:30 UTC
(02:00 Asia/Kolkata) and can be run by hand from the Actions tab (**Run
workflow**). It runs `pg_dump -Fc` with PostgreSQL 17 client tools, encrypts the
file with GPG (AES-256, symmetric), checks that it decrypts back to the same
bytes, and uploads only the encrypted file as an artifact kept for 90 days. The
job summary shows the encrypted size, the number of tables with data and the
plaintext SHA-256. Any failure (missing secret, connection, empty dump,
encryption) fails the run, so GitHub's failed-workflow email is the alert.

Repository secrets (Settings → Secrets and variables → Actions):

- `SUPABASE_DB_URL`: a Postgres connection string for the `postgres` user.
  On the Free plan the direct connection (`db.<project>.supabase.co:5432`) is
  IPv6-only, which GitHub-hosted runners cannot reach, so use the **session
  pooler** string from Project Settings → Database → Connect
  (`postgresql://postgres.<project>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`).
  Do not use the transaction pooler (port 6543); `pg_dump` needs a session.
- `BACKUP_PASSPHRASE`: a long random passphrase. Store it in a password manager
  as well; without it the backups cannot be decrypted.

Download and decrypt a backup:

1. Actions → *Nightly encrypted database backup* → pick a run → download the
   `taskpulse-db-<stamp>` artifact and unzip it.
2. Decrypt (asks for the passphrase):
   `gpg --decrypt --output taskpulse-<stamp>.dump taskpulse-<stamp>.dump.gpg`
3. Inspect: `pg_restore -l taskpulse-<stamp>.dump | less`. Restore only into a
   disposable database first (see the drill below); delete the plaintext file
   when finished.

Restore drill: with a disposable local PostgreSQL 17 or newer on loopback port
15432, run
`python tools/restore_backup_drill.py --dump taskpulse-<stamp>.dump --bin-dir <postgres bin> --port 15432`.
It recreates the database `taskpulse_backup_drill`, restores the dump, and prints
the migration ledger's latest version and a row count per table in `public`,
`taskpulse_private` and `auth`. Errors for Supabase-only extensions and roles are
counted as expected; any other restore error fails the drill.

Monthly: download the latest successful backup and keep one encrypted copy
offline (an external drive or other storage outside GitHub), because artifacts
expire after 90 days and live in the same account as the code. Note the date and
SHA-256 from the run summary next to the copy. Artifacts count toward the
repository's Actions storage quota; check usage under Settings → Billing if the
database grows.

## Health check

`GET /api/internal/health` reports background-job health for monitoring. It
needs `Authorization: Bearer <TASKPULSE_AWARD_WORKER_TOKEN>` (the same token as
the award worker) and `SUPABASE_SERVICE_ROLE_KEY` on the server. It returns 200
when nothing is wrong and 503 with the counts otherwise: failed or blocked
outbox jobs, jobs leased for more than 30 minutes, award days stale for more
than 2 days, and the time of the latest successful award job. A 503 with
`status: "unavailable"` means the endpoint or its database read is not set up,
not that the jobs are healthy.
