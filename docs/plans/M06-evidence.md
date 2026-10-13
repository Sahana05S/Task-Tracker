# M06 evidence - 12 October 2026

M06 and both approved follow-up policies are implemented awaiting native
verification. It is not verified or released. Local main remains at
`8ab398181ef913086b8c39615665fd04175bd37d` plus
preserved uncommitted M00-M05/user edits and this M06 work. The user's pasted
M06 request and both follow-up answers are the authority. No production
migration, deployment, M07, Drive operation, message, commit or historical
scoring redistribution occurred.

## Changes and migration

Forward migrations: `19_attendance_and_support_history.sql` and
`20_approved_attendance_and_contribution_policy.sql`, following actual migration
18. Migration 19's independent boundary was rehearsed before the answers; 20
activates approved policies without rewriting 19. Migrations 01-18 retain their
starting bytes. Migration 19 expands attendance
numeric precision and adds confirmed-input/version/state metadata, explicit
support validation states, validator/time/reason and related-task fields.
Meetings gain resolver ownership, point type, resolution/comments/status and
due/resolved dates. Legacy identity/content/asset links and frozen snapshots are
preserved. Unknown legacy resolver/status remains null. Legacy attendance values
are retained but unconfirmed; false legacy validation becomes
`legacy_unvalidated`, not fabricated pending. True flags are retained without
inventing old review timestamps.

Private immutable input snapshots capture full source revisions separately from
safe audit metadata. Source/profile foreign keys retain attribution rather than
cascading deletion; physical source deletion is blocked. Baselines are observed
at migration time, not reconstructed historical events. An explicit history
cutoff marks earlier as-of input history unavailable.

`dated_record_command` uses active database authorization, the existing command
mutex, locked rows/current versions, actor/command receipts and one transaction
for source/history/audit/outbox. Strict field allowlists block arbitrary columns.
Direct protected INSERT/UPDATE/DELETE and inherited column grants are revoked.
The existing safe audit and durable invalidation infrastructure is reused, not
replaced with a separate worker or scoring engine.

`lib/attendance/contract.ts`, `lib/support/contract.ts` and typed
`lib/support/input-context.ts` expose one dated source contract. Attendance/support
queries and server actions use the new RPCs. Failed queries throw visible errors;
missing tables do not become healthy empty datasets. Existing report actions and
employee/manager visibility remain intact. Attendance and knowledge/sales forms
show measured inputs, current versions, reasons, validation metadata, retained
history and unavailable-policy warnings. New `/meeting-points` navigation and
`/records/[kind]/[id]/history` are included in route protection. Other layouts and
the landing page remain preserved.

## Attendance and validity

Regular attendance, separately measured off-hours and actual dated task effort
are separate fields. No automatic 8-hour Present or 4-hour Half Day value is
approved. Present/Half Day accept measured hours without defaults. Absent/Leave require
both regular and off-hours zero; Holiday/Off Hours require regular zero with
actual off-hours allowed. Combined measured hours cannot exceed 24.
Entered hours must be finite/nonnegative within 0-24 for each field. Optional
check-in/out must be supplied together, be finite/on the same Asia/Kolkata day,
ordered correctly and cover the entered regular attendance duration. Records
require explicit nonfuture business dates. Inactive or forged-attribution writes
are denied at PostgreSQL, independently of UI controls.

Own attendance corrections and MD/PE administration are versioned/reasoned.
DM has no other-employee attendance/detail/history rights. Missing attendance and
legacy-unconfirmed values are null with reasons; confirmed measured zero remains
zero. Dates have a half-open period and explicit nonfuture as-of instant.
Effort snapshots incorporate actual midnight timer segments once, corrections
at their observed time and exclusion of reversed logs. They retain source IDs,
task/timer references and segment numbers; invalid legacy effort is unavailable.

The decimal comparator proves 8 <= 8 and 8.01 > 8 without display rounding.
The user approved per-day Asia/Kolkata validity: all non-reversed effort across
categories/states must fit within regular plus off-hours once. Every elapsed
calendar day in a chosen period needs confirmed attendance and every day must
pass; spare capacity on another day cannot offset excess. Known excess is
invalid, missing/legacy inputs are unavailable with reasons, and no elapsed days
is unavailable. PostgreSQL and the TypeScript reference agree on these states
and exact boundary arithmetic. The legacy live award
calculator now raises a clear guard instead of awarding under its old attendance
bonus/formula; saved awards remain readable. M07/M08 are not implemented.

## Support workflows, privacy and history

Active employees create their own facts/ideas/suggestions/sales/meeting records.
MD/PE administer support; DM administers and independently validates support.
Managers may attribute to an explicit active author. An omitted correction author
keeps the existing author, never silently changes to the manager. Unknown legacy
authors require explicit reconciliation. Independent review can record pending,
validated or rejected with server validator/time/reason; self-validation and
inactive review are denied. Reasoned administrative withdrawal retains evidence.
An asset URL is only a stored link, not proof of provider creation or access.

Authors may edit/withdraw their own pending support records. They cannot
overwrite or withdraw reviewed evidence. MD/PE and DM may correct reviewed
records with a reason, atomically resetting validation state to pending and
clearing the current reviewer/time while retaining the earlier review in history.
Legacy-unknown correction requires administration/reconciliation; withdrawn
records are not ordinarily restored. Every source/history/audit/outbox revision
commits together. Independent review can explicitly return a record to pending.

As-of reads retain each observed validation/correction/withdrawal state and
original business date. Legacy review provenance and pre-baseline history remain
explicitly unknown. Ordinary source/review edits check frozen old and new dates
and authors; saved snapshots remain unchanged. An unattributed legacy record in
a possibly frozen period is guarded conservatively. The full M12 revision flow
is outside scope. History access is scoped by each snapshot's attribution, so
an old author cannot see a later reassigned employee's private attendance notes.
Team source adapters expose metadata/populations, not attendance notes/support
content or private detailed reports. Meeting points are operational records,
not a scoring factor; source-backed point/status fields and actual task links
are available without inventing the missing external meeting-type enumeration.

## Raw inputs and source findings

Confirmed pure arithmetic: facts .75/.38 and ideas/suggestions 2/.75 on already
classified validated/eligible-unvalidated counts. Independent fixtures give 1.88
for two validated plus one eligible-unvalidated fact and 3.50 for one validated
plus two eligible-unvalidated ideas. Median subtraction belongs to M07.
The approved live state populations now use pending as eligible unvalidated and
exclude rejected/withdrawn. Credit stays on the original business date using the
state actually known at the requested as-of instant. Actual source-row fixtures
yield1.88/3.50, not only conditional arithmetic. Per-employee factors and source
totals expose raw values, counts, versions, attribution and explicit availability.
A known empty population is zero; legacy-unknown population/review provenance or
history before the baseline makes affected inputs unavailable. No M07 cohort,
median or composite calculation is chosen. Source-wide totals do not replace
per-employee inputs.

Sales preserves `(1.5*BO+BN+0.75*BP)/50` as evidence. Source headers do not map its
terms to actual business fields. Typed built-up-area source text/new-project/
basement-payment flags and independent sales CRUD are available; raw sales is
explicitly unavailable. No revenue/count proxy or guessed interpretation exists.

Both supplied workbooks are present and unchanged. Read-only Summary and support
sheet inspection confirmed coefficients/comparison and Meeting Points fields;
see SOURCES for exact anchors. External attendance workbook, 22 handler bodies,
dialog HTML/template registry/folders, previous-month/linked-checklist sources,
trigger configuration and unexplained Summary/sales subtotal definitions remain
missing. No supplied XLSX is missing. These gaps block dependent behavior only.

## Actual verification

| Check | Result |
| --- | --- |
| Focused approved attendance/support contract tests | Passed: 2 files, 16 tests; prior independent contract/permission checkpoint passed 4 files/19 tests |
| Route protection regression | Passed: 3 tests; missing new route prefixes fixed in code |
| `npm test` | Passed: 35 files, 304 tests, exit 0 |
| `npm run typecheck` | Passed, exit 0 |
| `npm run build` | Passed compilation/type checking/21 static page generations and all listed routes, exit 0 |
| `python tools/test_m06_database.py --psql <portable-pg>/psql.exe` | Passed fresh 01-20 and upgrade 01-18 to 19-20 on PostgreSQL 17.11, loopback port 15432; exit 0 |
| Baseline SHA-256 manifest | Preserved README, final QA, workspace/verification SQL, migrations 01-18 and landing page |
| `git diff --check` | Passed; existing Windows line-ending notices are not failures |
| Native Docker/Supabase availability | Docker Linux-engine named pipe unavailable; no native auth/API/browser result |

The real PostgreSQL harness checks every attendance state, measured zero/missing
and unknown legacy distinctions, paired local clocks, own/admin/inactive/spoof
boundaries, independent/self review, retained state populations/as-of reads,
typed sales/meeting fields, approved 1.88/3.50 source-row raw populations, own
pending edits/withdrawals and atomic reviewed corrections, original-date/as-of
credit, exact 8/8.01 and regular 8+off 2 versus effort 10/10.01 totals, no cross-day
offset, missing elapsed-day validity, reversal/correction history, real
Kolkata midnight timer segments and retry convergence. It also checks concurrent
review/correction (one commit, one version conflict), same-key review receipt
convergence, source/history/audit/jobs/receipt rollback on injected outbox
failure, effort capture rollback, immutable private history/source retention,
reassigned attendance privacy, anonymous denials and old-date frozen protections.
Upgrade fixtures retain existing booleans, source fields, missing meeting
ownership/status and frozen snapshots.

Unperformed: native GoTrue/session/JWT and PostgREST/direct API exercises;
signed-in multi-role browser flows; deployed migration/grant equivalence;
native workbook-engine recalculation; provider checks. Portable PostgreSQL uses
an explicit JWT-subject shim and is not evidence for those checks. Mapped sales
fixtures remain unavailable under the approved fallback, not counted as passed.
Legacy reconciliation-dependent inputs are still guarded. No dependency
upgrade/install, production SQL or environment change.

The isolated portable cluster was stopped after verification. Its two M06 test
databases remain disposable test fixtures; no production connection was used.

## Decisions and handoff

Both policy answers are approved in DECISIONS and activated/tested in migration
20. No additional business answer blocks this bounded M06 implementation. Sales
mapping remains unavailable under the expressly authorized fallback, and legacy
provenance requires reconciliation rather than guessed history. M06 is implemented
awaiting native verification; it cannot be marked verified while native checks
are unavailable. M07 must wait for its own explicit authorization.

Migrations 19-20 have been applied only to disposable test databases. Production
rollout is not authorized. Before any future rollout, inspect actual applied
migration history, reconcile legacy attendance/author/reviewer provenance, run
native authorization/API/browser checks and coordinate application/database
compatibility. Older clients' direct writes will intentionally be denied after
the new command boundary. Do not edit an already applied migration or infer
historical review times from current flags.
