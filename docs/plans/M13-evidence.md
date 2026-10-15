# M13 end-to-end acceptance and release preparation — 13 October 2026

## Clock, restore and browser acceptance investigation — 15 October 2026 (later)

Scope: the follow-up investigations on branch `m13-verification`. Only
`ngpmwzksekkpvrgoqngk` was used. It was not reset, and no retained evidence was
removed. **Tested revision: `28efe3deadc3b111f14917ea505ad392c3d1cb23`**, which supersedes `2c1d084` in the next
section. Its checks are listed in the final section of STATUS.md.

### 1. Clock fixes: database-authoritative as-of (migration 30)

- Measured skew between the app host and the hosted database was under ~1.5–3.5 s
  in 3 samples, with the database timestamp inside each request window.
- The 10-second margin **did omit valid records from live views**. In the
  browser, an attendance record saved for 12 October showed as *Missing record*
  on the immediate reload and appeared about 10 s later. Persisted results did
  not silently omit records: M07 `finish_performance_job` and archive commit
  compare the watermark with `clock_timestamp()` and raise `40001`. A write in
  the gap therefore forced a retry (M07, after 5 minutes) or a refused close.
  The M08 award commit validates only the watermark at its stated as-of, which
  is the intended as-of observation semantics.
- Fix: forward migration `30_observation_clock.sql` adds
  `public.observation_clock()`, which returns `clock_timestamp()`; only
  `authenticated` and `service_role` may execute it. `lib/presentation/clock.ts`
  takes the default as-of from it, truncated to milliseconds so it never
  exceeds the database clock. This now drives live pages and export
  (`liveViewContext`), attendance, support inputs, archive capture and both
  workers. If the function is unavailable, it falls back to the old margin.
  Explicit as-of values are still rejected after the database clock. No
  database nonfuture, cutoff, 15-minute archive or watermark check changed.
  Callers that rebuild a context from a validated as-of now pass it as `now`,
  so an app clock behind the database cannot falsely reject it.
- Evidence:
  - New and updated unit tests: `observation-clock`, `archive-clock`,
    `jobs-clock`, `stars/jobs`, `attendance-clock`.
  - Local PG18: upgrade 29→30 on a copy of the exact hosted-data clone; fresh
    install 01–30; `anon` denied, `authenticated`/`service_role` allowed;
    re-applying fails atomically.
  - Hosted: `supabase db push` (dry run listed only 30) brought the ledger to
    30.
  - Browser: attendance saved for 11 October showed `Present 8 0 0 Valid` on the
    immediate reload.
  - The opt-in hosted worker test passed: a real M07 lease recorded its result
    1.1 s after its database as-of, versus 8.8 s for the earlier margin-based
    runs, and remains `blocked`/`required_inputs_unavailable`.

### 2. PG17→PG18 restore failure: root cause was the restore procedure

- The constraint is `daily_task_logs.timer_segment_consistent` (migration 14),
  specifically `hours_worked = timer_duration_seconds/3600`. The retained
  clone log shows: `new row for relation "daily_task_logs" violates check
  constraint "timer_segment_consistent"`, with `hours_worked` =
  `0.0007447833333333333`. The earlier local adjustment replaced the equality
  with `abs(hours_worked*3600 - timer_duration_seconds) < 1e-15` in the clone
  only.
- Cause: **the restore procedure, not schema behaviour, migration compatibility
  or the PostgreSQL version.**
  - Hosted PG17.11 stores `0.00074478333333333333`, and `2.681220/3600` gives
    the same value on both PG17.11 and PG18.3, so the CHECK holds on both.
  - The Supabase CLI prints numbers nested inside `jsonb` as float64
    (`0.0007447833333333333`), and the harness also parsed them with Python
    floats. Once rounded, the value fails the CHECK on **both** versions.
  - The earlier verifier parsed both sides the same way, so its "68 tables
    equal" result could not detect numeric precision loss in any table.
- Corrected rehearsal (`tools/test_m13_hosted_restore_exact.py`), with hosted
  access read-only:
  - Each table was captured as `jsonb` text with an md5 digest taken in the
    same hosted statement.
  - It was imported into a fresh, **unmodified** 01–29 PG18 schema. The timer
    CHECK definition is identical to hosted, and every row passed every CHECK.
  - All 68 tables plus the 7 synthetic Auth rows have byte-identical canonical
    digests to hosted, and the constraint-definition digest matches.
  - A same-version PG18 `pg_dump -Fc`/`pg_restore --exit-on-error` round trip of
    that clone also matches every digest; FKs and CHECKs are re-validated on
    restore.
  - The original modified clone and its files remain as superseded evidence.
- Not covered: this is a logical rehearsal of application tables. It is not a
  Supabase Auth/Storage/config backup or PITR. A PG17→PG17 restore was not
  possible: only PG18 binaries are installed. A direct `pg_dump` of the hosted
  database was not possible either: there is no database password in the test
  configuration, and `supabase db dump` needs Docker.

### 3. Browser acceptance (`tools/test_m13_hosted_core_browser.py`)

- Setup:
  - Sessions came from one-time admin magic-link tokens (no email sent,
    synthetic passwords unchanged).
  - A temporary `next dev` pointed at the test project and was opened on
    `localhost`, because on `127.0.0.1` Next 16 refuses the HMR socket
    cross-origin and keeps reloading the page.
  - Each phase checks state before acting. New bounded synthetic records:
    `M13-F87E37-UI1`, `TT-000007`, a fact, attendance for 11–12 October, logs,
    and a timer.
- Final run on the tested revision: all eight phases passed (`task`,
  `checklist`, `timerlog`, `attendance`, `contribution`, `tools`, `reports`,
  `parity`). A fresh task, `M13-F87E37-UI2`, then repeated create-after-refusal
  and the full checklist → 50% rollup → refused premature Done → N/A →
  Activity-derived 100% → refused pre-review Done → reviewer approval → Done
  path. Its participant version stayed at 1, so the assignees and reviewer came
  from the create that followed the refusal. Every step was verified after a
  reload. Representative refusals showed visible errors and kept the typed
  input: duplicate tag, closed-month log/attendance, Absent with hours,
  non-existent correction record, closed-month duplicate, Done-task edits.
  Role checks: authors had no self-review control and unassigned members no
  approval control. Parity: status matched for A's 6 tasks across tracker,
  profile and timeline (deadline-less `TT-000007` appears under Undated), and
  the own profile at 390 px matched the director's view.
- Application defects found and fixed:
  1. **Form reset after a refused command (data-loss risk).** React 19 resets
     any `<form action>` after every action, including refused ones. In the
     task dialog this cleared the typed fields and unchecked the controlled
     assignee/reviewer boxes in the DOM while React state still held them.
     The resubmitted task `M13-F87E37-UI1` was created with **only the director
     as assignee and no reviewer**; its participants were then corrected
     through the edit dialog. The same reset cleared all ~30 `ExecutionForm`
     forms after any refusal. Fix: a default-prevented `onSubmit` dispatches in
     a transition (React then skips its reset), `ExecutionForm` resets only on
     success, and the `action` prop is kept. Without it, a pre-hydration click
     natively `GET`-submitted form contents into the URL; this regression was
     caught by the harness and fixed.
  2. **Live views omitted just-saved records**: item 1.
  3. **Horizontal page overflow.** At 390 px, nine pages scrolled sideways,
     including the profile by 556 px. At 1365 px, the director's `/tasks` page
     overflowed by 314 px. Causes:
     - grid items' `min-width: auto` in implicit tracks;
     - an unwrapped contribution table;
     - `sr-only` spans and Radix's hidden native `<select>`s (absolutely
       positioned) escaping unpositioned scroll wrappers;
     - an unconstrained related-task `<select>`.

     Fix: base rule `.grid > * { min-width: 0 }`, one table wrapper, three
     `relative` scroll wrappers, and `max-w-full` on the details-editor
     controls. Measured result: 0 px on 20 workspace pages for member and
     director at 390 px and director at 1365 px. The `parity` phase now
     asserts 0 px on the profile.
  4. **Mis-encoded text from `7764489`.** There were 19 `Â·`/`â€“`/`â€”`
     sequences in 6 files and 10 separators lost to a literal `?` in 3 files
     (for example "Template instructions ? Blank native task ? version 1"),
     plus `Saving?` instead of `Saving…`. All are restored;
     `source-encoding.test.ts` guards against the mojibake.
  5. **UTC default dates.** The task page's manual-time date defaulted to the
     UTC day, so it pre-filled yesterday between 00:00 and 05:30 IST. It now
     uses `kolkataDate()`.
  6. **Contribution records showed `· Unknown`.** `record_state` exists only on
     attendance. The suffix now appears only when present.
- Findings left open (no approved rule):
  - Hours display precision differs by surface: `0.00` on the task, the
    float-truncated `0.0007447833333333333` under Recorded effort, and the exact
    20-digit value in the validity table. Display precision is undecided under
    D04.
  - Task Tools previews a closed-month duplicate as committable and refuses it
    only at commit, consuming a `TT-` number each time (`TT-000004`–`000006`).
- Carryover commit through the UI is **not testable now**: no open prior-month
  predecessor exists, and September is closed. A same-month carryover correctly
  cannot be committed. The command-level carryover in the 15 October journey
  remains the evidence.

## Final verification and candidate identity — 15 October 2026

Release candidate: `2c1d08438c890ab1a8dc95bab74bf3d8046f2688` on branch
`m13-verification` (parent `e805e6a`, which committed the hosted continuation
below). It supersedes the "final candidate identity" placeholder in the next
section. Not merged, tagged, deployed or applied to production.

Candidate change: `lib/attendance/queries.ts` still passed the app's immediate
clock to `attendance_input_context`, which raises 23514 for
`p_as_of > clock_timestamp()` (migrations 20/21). This is the same near-now
defect class fixed for archive capture and the M07/M08 workers. It now uses
`LIVE_AS_OF_LAG_MS`, and `__tests__/lib/attendance/attendance-clock.test.ts`
fails without the fix and passes with it. It was found by code review and was
not observed on the hosted attendance page. `stars/read-model.ts` compares its
clock only locally and Task Tools' `checklistAsOf` is a stored label, so neither
needs the margin.

Checks on the candidate tree:

- Full `vitest run`: 56 files / 476 tests passed. The 2 skipped tests are the
  opt-in hosted integration file, which needs process-only test credentials.
- Focused clock regressions (archive, M07 jobs, M08 jobs, presentation context,
  attendance) passed.
- `npm run typecheck` and `npm run build` (Next 16.3.6, 24 static pages)
  passed.
- Lint was not run: the repository has no ESLint config or lint script.
- Hosted read-only `verify` phase of `tools/test_m13_hosted_archive_browser.py`
  ran on `ngpmwzksekkpvrgoqngk` (`TaskPulse M13 Test`, confirmed by name, status
  and isolated workdir link before use). It passed: revision 2 rendered on
  desktop and at 390 px; at 390 px the member also saw task
  `M13-F87E37-JOURNEY` detail ("Inspect synthetic site") and its checklist
  ("Acceptance steps", "Journey Yes"). Director/own CSV export returned 200 and
  another member/data manager received 403. Retained revisions 1 and 2 are
  `incomplete_uncertified`, their source inputs differ, and no winner is named.
  The harness's only hosted writes were rotating the seven synthetic users'
  passwords. The fact fixture already existed and no close/correction/revise ran.
- Direct hosted reads: ledger 29, September `closed` (version 3), 2 revisions,
  9 tasks (the journey, split, duplicate and carryover tasks are included). The
  award day 13 Oct job had 2 attempts and 14 Oct had 3. Every award run has
  `certified=false` and `winner_id=null`. Final state is `blocked` with
  `required_inputs_unavailable`, and earlier `failed` runs are retained. Two
  M07 runs (`m07-ten-factor-v1`) delivered `blocked` with
  `required_inputs_unavailable`. One pre-fix M07 job remains `failed` with
  `source_query_failed`; the claim function still selects failed jobs, so it is
  retryable, and it was not rerun. Invalidation jobs that were never leased sit
  in the claimable `blocked` state. The worker was not rerun, because the
  durable rows already show delivery, retry and replay.

Classification of the issues found during M13:

- Application defects, fixed with regressions: archive capture, M07 recompute
  and M08 revision near-now clock; attendance input context (latent, same class).
- Test-harness issues, corrected: assuming blank detail/checklist rows were
  absent; the browser reload exceeding Playwright's 30 s default.
- Environment limits, unresolved: Docker is absent for `supabase db dump`, and
  the PG17.11→PG18.3 timer numeric CHECK difference affects only the local clone.

## Hosted continuation — 15 October 2026

This continuation used only `ngpmwzksekkpvrgoqngk` (`TaskPulse M13 Test`),
the existing isolated CLI workdir and seven synthetic Auth accounts. The
starting working tree was clean at `7e6d914e6d5c840f216e55d01946e2ba924f00a2`,
which supersedes the older `7764489`/uncommitted baseline below. The app's
`.env.local`, original project, production, Drive workers and existing hosted
test rows were not reset. Local migrations 01–29 and the hosted 29-row ledger
were unchanged. New M13 tests use temporary process-only test credentials;
none are printed or stored in the repository.

`tools/test_m13_hosted_journey.py` ran real GoTrue/PostgREST commands and
checked resulting rows. A managing director created an automatically
initialized task; SMART/IPO edits and a manual asset URL persisted, while an
assignee's structural edit failed. Assigned work set Yes/No/N/A leaves and
produced the expected 50% nested Activity rollup. Premature Done failed;
after all applicable leaves, 100% manual progress and the assigned reviewer's
current approval, Done persisted with its completion date. Another member's
review and cross-task checklist write failed. A real timer stop linked its
retained log; a separate log was corrected and reversed without deletion.
Approved native Task Tools preview/commit split 3 of 10 scale units, created a
reset duplicate, and handed 6 remaining units from a 40%-complete prior-month
task to a new 0%-progress carryover. This fixture used one test-only SQL update
to date the synthetic carryover predecessor in September. The earlier native
attendance/independent fact validation and inactive/anonymous/role denials
remain in the preceding section; they were not rerun without cause.

The signed-in archive browser journey closed September as `incomplete_uncertified`,
opened a director correction naming one existing fact and exactly 12 September,
then published revision 2 after a reasoned native fact correction. The two
retained source inputs differ; both remain non-certified and name no winner.
Director and employee CSV exports returned 200 for the employee, while another
member and the data manager received 403. Revision 2 was rendered at desktop
and mobile width. The earlier desktop task/checklist/dashboard/report and mobile
task-list smoke remains valid; full click-through on every UI form, profile and
timeline is still open. A Next development-server reload after successful
close/revise exceeded Playwright's navigation timeout; database state and a
fresh signed-in verification phase established the committed result. It is not
counted as a successful reload/error-recovery UI check.

Two real near-now worker/archive defects surfaced against the hosted database.
Month capture and recomputation used the app host's immediate clock, which the
database rejected as future; the M08 revision worker had the same exposure.
They now share the existing ten-second observation margin from M11. Focused
clock regressions cover archive and recomputation, and the award worker test
covers revision time. A leased M07 job completed with an `incomplete` shared
engine result; its durable outbox state is `blocked` with
`required_inputs_unavailable`. The sandbox-only award endpoint used an
ephemeral token/service key and a child-process worker flag, rejected a forged
token, and delivered a blocked, uncertified, winnerless day. On 13 October's
synthetic award, a controlled `source_query_failed` lease was retained, then
delivered on attempt 2 as `blocked` with `required_inputs_unavailable` and no
winner. Re-requesting the 14 October day exposed the near-now revision clock
failure; after the margin fix, that retained failed job recovered on attempt 3
to the same blocked/no-winner state. The next endpoint delivery returned zero
outcomes. Direct hosted reads confirmed both dates have `certified=false`,
`winner=null`, durable blocked jobs and no successful fabricated award.
The permanent schedule and all Drive flags remain off.

Hosted-source recovery captured the seven synthetic Auth identities (without
password hashes) and 68 application tables to a private temporary directory.
Fresh 01–29 migration install and a separate local PostgreSQL 18 application-
table import passed, with JSON-normalized equality for all 68 tables, seven
Auth IDs and two immutable month revisions. The original unmodified restore
failed on `daily_task_logs.timer_segment_consistent`: hosted PG17.11 and local
PG18.3 divide the retained timer duration with different numeric precision.
Only the local clone received a 1e-15-second-equivalent tolerance check before
the successful import; no repository/hosted constraint was changed. This proves
a bounded synthetic table recovery, **not** a complete Supabase Auth/config/
Storage backup or PITR, and not unmodified PG18 schema parity. `supabase db dump`
could not run because Docker's Linux engine is absent. A hosted legacy upgrade
still needs a separately isolated hosted predecessor; the current project was
not reset or rolled back to 28. The prior local PG17 01–28→29 upgrade evidence
remains separate and passed.

At the time of this note, M13 code/tests/docs are a reviewed diff from clean
`7e6d914`; final candidate identity and checks appear in the latest STATUS and
readiness entry. BN/BO/BP and older-record provenance still prevent certified
sales, final ranking and awards. No production operation or Drive call occurred.

## Signed-in browser and live-clock correction — 14 October 2026

The fresh hosted test project was used by a temporary local Next.js process,
with test URL/anon key supplied only through that process environment; the
repository `.env.local` and original project link stayed unchanged. The
terminal browser harness resets one synthetic test password in memory,
launches a private headless Edge session and stops its local server afterward.
It passed signed-in desktop task list, task detail, nested checklist, dashboard
and reports rendering, plus a mobile-width task list. These are route/render
smokes with synthetic data, not complete click-through acceptance of every
workflow or a deployed app revision. No credentials or tokens were printed.

The first dashboard/reports pass found HTTP 500 from a strict PostgreSQL
nonfuture-as-of check. With synthetic Auth, the hosted live-context RPC rejected
the app host's immediate “now” (SQLSTATE 23514), while requests five and thirty
seconds earlier passed. The app now uses a ten-second lag for **default** live
observations and passes the chosen report/profile as-of through the supporting
contribution query. Explicit historical as-of input is not shifted. The final
hosted browser pass rendered dashboard and reports successfully. One earlier
expanded run was interrupted by `ERR_NETWORK_IO_SUSPENDED`, and a cold dev-server
run briefly returned 404; both are local runner limits, not passing workflow
evidence. The final reproducible pass used the Next webpack dev mode.

Focused presentation/team tests passed (12/12), full unit suite passed
(53 files, 472 tests), typecheck and production build passed (24 static pages).
The build read the unchanged local `.env.local`, whereas the browser process
used the hosted test backend. No migration was changed or applied to the
original project. Remaining native/browser/worker, hosted upgrade/restore and
sales/legacy certification gates below still apply.

## Hosted Supabase follow-up — 13 October 2026

The user supplied a new, disposable `TaskPulse M13 Test` project. The CLI
confirmed its healthy ref `ngpmwzksekkpvrgoqngk` differs from the existing app
project `sbtxtsisjhuciobxykcm` before any write. The app's `.env.local` and
repository Supabase link still point to the existing project and were not
changed. An isolated CLI work directory linked only to the test project held
SHA-256-identical copies of migrations 01–29. Its remote migration ledger was
empty before push; a dry run listed exactly 01–29; `supabase db push` installed
all 29 successfully. The remote ledger then contained 29 migrations and zero
profiles/tasks before synthetic seeding. No production migration, deployment,
worker, Drive call or live data import occurred.

`tools/test_m13_hosted_auth.py` now rechecks the exact test-project identity,
isolated link, migration count and synthetic-only profile set before every
run. Supabase CLI supplies test-project keys in process memory; the script
never prints or stores keys, passwords or tokens. It created seven synthetic
Auth users (director, engineer, data manager, reviewer, two active assignees,
one inactive account), two tasks, one one-hour/+20% log, a nested checklist,
one measured attendance row and one independently reviewed fact. Latest
rerun passed with real GoTrue tokens through PostgREST:

- Active role lookup; inactive role unavailable; member role self-escalation,
  member month command, protected task priority, cross-task and anonymous logs denied.
  A disallowed direct PATCH may return HTTP 204 with zero affected rows, so
  the harness also verifies the protected value remains unchanged.
- Director/engineer task creation, 50/50 shares, stable same-operation create
  and log retries. The shared task retained scale 10, 20% progress, one log,
  one hour and captured equal shares.
- Manager checklist structure/explicit empty Setup, assigned member Yes/N/A
  leaves, and 50% applicable nested Activity rollup.
- Employee measured eight-hour attendance; detail context readable by that
  employee and director, denied to another member and data manager.
- Member fact creation, self-validation denial and data-manager validation
  with retained reviewer identity.
- Current-month live presentation RPC with a database-sourced nonfuture as-of.

The first attendance-context attempt used a future as-of instant and correctly
received SQLSTATE 23514; the harness was fixed to use the hosted database's
current timestamp. The final rerun passed. This is **partial native API
acceptance**; the later signed-in browser smoke is described above. It is not
complete M13 acceptance.
Native timer, log correction/reversal, lifecycle/Done, all support variants,
Task Tools, worker delivery, awards, month close/revisions and full UI desktop/mobile
workflows remain unrun here. The hosted project is a fresh install; a real hosted
legacy upgrade and restore were not tested. Sales BN/BO/BP and legacy provenance
still block certified outputs. Drive remains user-deferred. The historical
pre-hosted snapshot below records what was known before this follow-up; its
statements that native infrastructure/accounts were missing are superseded.

**State: release preparation complete; end-to-end acceptance incomplete.** The
user authorized test-environment work only. No production migration, deploy,
worker activation, Drive operation or historical import occurred. Current
revision is `main` at `7764489ac6bcc13f0062e67b401c7c9738f5848b` plus
uncommitted changes, so an exact deployable application revision is still
missing. Local migrations are numbered 01–29; 01–29 were left unchanged by M13.

## Work and findings

- [RELEASE-READINESS](RELEASE-READINESS.md) distinguishes implementation,
  unit tests, PostgreSQL JWT-role-shim tests, native Supabase/API, signed-in
  browser, delivered workers, blocked scoring and user-deferred Drive. It is
  based on actual M00–M12 evidence, not promoted module summaries.
- [RELEASE-RUNBOOK](RELEASE-RUNBOOK.md) records staged target identification,
  backup/restore, migration ordering, compatibility, native acceptance, smoke,
  worker gates, monitoring and recovery. [Operator guide](../OPERATIONS.md)
  covers the requested user workflows and unavailable states.
- `.github/workflows/contract-checks.yml` adds app unit/type/build and
  PostgreSQL shim fresh/upgrade/restore jobs. The defined CI service is
  PostgreSQL 16; the passing local rehearsal used portable PostgreSQL 17.
  This CI workflow was added locally; no remote CI run occurred, and its name
  explicitly excludes native acceptance.
- `tools/test_m13_recovery.py` limits itself to loopback port 15432 and the
  fixed M12 synthetic source database, then backs it up and restores a separate
  disposable database. It verifies nine table row digests and the revision
  chain. This is a tested logical-restore procedure, not a production/PITR test.
- [Synthetic native fixture specification](fixtures/m13-native-scenario.json)
  records seven test roles, shared 50/50 work, nested N/A checklist,
  attendance boundaries and expected unavailable/correction outcomes. It is
  explicitly **not seeded** because the native environment is unavailable.
  The existing M12 harness supplies synthetic director, engineer, data manager,
  active/inactive members, tasks, report rows and named corrections. Earlier
  M02–M11 harnesses cover shared work, nested/N/A checklists, timed segments,
  support modes, awards and snapshots individually. There is **no single
  signed-in native seed/journey**; the exact fixture to create there is listed
  in RELEASE-READINESS. Existing synthetic coverage cannot be called end-to-end.
- Read-only XLSX ZIP/XML recheck confirmed the existing BN/BO/BP gap. The main
  tracker SHA-256 matches M00. BN1/BO1 are blank, BN6/BO6/BP6 have no source
  formula, BP1/BP2 label and calculate a sales median, and BQ6 combines the
  unresolved BN/BO/BP columns. The other supplied checklist workbook hash also
  matches. No source records were imported or private rows printed.
- Static coverage recheck counted all 34 numbered menu rows in the M09 ledger
  and inspected the current Task Tools page/actions. Timer/log, native details,
  template, manual link and report controls are present; the old freeze wrapper
  delegates to the retired M12 action, while `/reports` links to retained
  archive controls. The M10 provider ledger remains a deferred capability and
  the M11 ledger covers the identified workbook view roles. This is a static
  traceability check, not a successful click-through or missing-handler parity.

## Actual local checks

| Layer / environment | Result | Boundary |
| --- | --- | --- |
| `docker info`, `supabase status` | Unavailable: Docker Linux-engine named pipe is absent | Local GoTrue/PostgREST/browser/worker stack could not start; linked project is unclassified and untouched |
| `python tools/test_m12_database.py --psql <portable PG17 psql> --port 15432` | PASS, fresh 01–29 and upgrade 01–28→29 | Synthetic rows, JWT-role shim; replay, denial, conflict, rollback, immutable revisions/legacy preservation; no native tokens |
| `python tools/test_m13_recovery.py --bin-dir <portable PG17 bin> --port 15432` | PASS, logical backup and separate restore; 9 table digests, 4 retained revisions | Disposable local PG17; no production backup/PITR/live traffic |
| Read-only workbook cell/hash recheck | PASS for source integrity; mapping still unavailable | Workbook formula inspection is not a business definition for BN/BO/BP |
| Static coverage ledger | 34/34 M09 menu rows present; Task Tools entry points inspected | Missing handler bodies/provider parity and signed-in behavior remain unverified |
| Final `npm test` | PASS, 53 files / 471 tests | Unit and mocked-route regression, not signed-in end-to-end |
| Final `npm run typecheck` | PASS, exit 0 | Static TypeScript check |
| Final `npm run build` | PASS, compiled, typed and 24 static pages generated | Used local `.env.local`; staging configuration unverified |
| GitHub Actions workflow | Not run remotely | New CI definition, runner compatibility unverified |
| Native Supabase/auth/API, signed-in desktop/mobile, delivered award worker | Not run | No isolated native environment; cannot substitute shim or mocked route tests |
| Real complete certified award/archive | Not run | BN/BO/BP mapping and legacy provenance unresolved; synthetic adapter from M08 is not real certification |

The existing database harness provides representative synthetic upgrade records
and explicit legacy report JSON preservation. It does **not** reconcile counts
or exceptions against an actual deployed database, and it does not establish
duplicate timer-log links or missing scale/share history counts in production.
The M03 reconciliation artifacts remain the local duplicate-link evidence.
No confirmed application behavior defect surfaced in this independent M13
rehearsal; the first recovery-script run correctly refused PostgreSQL's
`127.0.0.1/32` rendering, and its strict endpoint check was adjusted before the
passing final rehearsal. No application formula or policy was changed.

## Remaining gates and decisions

Native project identity, test accounts and safe synthetic seeding are missing;
therefore role/API/browser/worker-delivery and certified-path acceptance remain
open. No production promotion should be inferred from this document. The user
answered both M13 source questions: keep BN/BO/BP-dependent sales/final scores
and awards Unavailable until definitions are supplied later, and keep older
records without dated provenance non-certified. These are recorded in DECISIONS;
they affirm the existing guarded behavior and do not certify any data. Drive
and import remain explicitly deferred. See RELEASE-READINESS for the missing
source fields and the runbook for steps before later production authorization.
