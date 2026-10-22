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

Authors may edit or withdraw their own pending fact, idea or suggestion.
Managers/data managers validate another person's contribution; self-validation
is denied. A reviewed correction needs a reason and resets the entry to pending
while retaining the previous review. Pending, validated, rejected and withdrawn
have distinct credit. Use the original business date and the report's as-of
time when investigating differences. Sales count through the approved BN/BO/BP
mapping (migration 46): each eligible entry counts once, new projects and
basement payments add weight, rejected and withdrawn entries do not, and a
member with legacy or unattributed entries shows sales as Unavailable until
they are reconciled.

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

### Nightly policies run

The same workflow has a second step that calls `POST /api/internal/policies`
(same token) after the award step, even if that step failed. Each call
evaluates up to 20 due policy periods per company; the step repeats until
nothing remains (20 calls at most), writes a summary table and fails on a
failed company. A failed evaluation is recorded as a run with its reason and
the managing directors get one notification a day; it is never shown as "not
met". Evaluate now on a policy runs the same evaluator for the current and
previous period.

## Company settings and the activity log

Settings > Company (managing director) holds the mission-type names, meeting
types, the meeting agenda, standing missions and the holiday calendar. Each
section saves on its own with a version check. Once a calendar is saved, an
attendance entry on a listed holiday that names no status is recorded as
Holiday (nothing changes for companies without a calendar). Team > Activity
lists who changed what (managers see the company, members their own) with a
link to the mission, record history, profile or month; company-settings saves
are audited but do not appear there yet (the feed needs a forward migration
adding `organization_settings` to its rules).

## Everyday controls

- **Appearance:** Light, Dark or System from the account menu or Settings >
  Profile, remembered on that device. System follows the computer or phone
  setting. The public landing page always shows its light look.
- **Today map:** scrolling moves the page; Ctrl (⌘ on a Mac) + scroll or a
  pinch zooms; drag with a mouse or pen to pan. Re-centre brings the focused
  mission or item back into view. Vertical/Horizontal switches the road's
  direction; the choice is kept in the link (`?layout=horizontal`) and on the
  device.

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
