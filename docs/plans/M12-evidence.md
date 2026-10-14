# M12 month close and revision evidence — 13 October 2026

State: **implemented awaiting native and certified-path verification**. The
user's pasted M12 request supersedes older no-M12 scope notes. Two follow-up
answers approve a visibly non-certified close when evidence is incomplete and
director-authorized corrections limited to named existing records and exact
dates. No production migration, deployment, worker schedule, Drive operation,
historical import or M13 work occurred.

## Implementation

Forward migration `29_month_archive_and_revisions.sql` follows 28 and leaves
01–28 unchanged. `month_periods` tracks live, correction and closed states.
Drafts are retained `month_revisions` while a period remains live. A close or
post-correction revision inserts an immutable revision and member rows, stores
the source/score/award evidence, and advances the period pointer in one
transaction. Prior rows are never updated; a later current pointer makes the
prior revision visibly superseded. Actor, reason, Kolkata as-of, rule version,
source watermark and data-quality reasons are stored with each revision.

The command requires an active managing director, an expected period version and
an operation UUID. The receipt returns the committed response for an identical
retry; reuse with changed input conflicts. Source capture uses the existing M07
source RPC and TS calculation. PostgreSQL checks that the supplied source JSON
equals a fresh read at the captured as-of and that its watermark is still
current. Under the shared domain write lock it also captures M11 presentation
inputs and M08 daily run/effective/override/candidate evidence. Member rows
retain all ten factor results, exact raw/median/delta/contribution values,
cohorts, provenance, status and score. Manager JSON exports expose the complete
retained source/presentation evidence; employee exports expose their factor
result and a database-filtered M11 task/log/attendance/support subset.

Certification requires complete M07 results, a matching retained trusted M07
worker run, complete and current M08 daily evidence, a matching independently
checked monthly count/winner selection, and available history and sales factors.
Otherwise the archive is `incomplete_uncertified`; the stored monthly winner is
NULL. Missing sales/history cannot be relabelled as a certified zero or award.
With the present BN/BO/BP mapping and legacy provenance gaps, this certified
path has no authentic positive fixture and remains unverified.

Closed dates are guarded at the PostgreSQL boundary for log/reversal rows,
attendance, support records/reviews, private input history, source observations,
manual credit, award commands and performance-run insertion. Task assignment,
deadline, completion and archive dates are guarded without blocking current
progress/title work on a continuing task. A director can open correction only
with a reason and existing record UUIDs plus dates within the month. The exact
scope permits the existing versioned domain commands; publishing a new revision
clears it. Earlier earned credits, approvals, award runs and override records
remain retained. M08 recomputation still requires its normal current run and
override reaffirmation before a new effective win.

`/reports` now selects live context or a specific immutable revision, lists
history and exposes director draft/close/correction/revise controls. Employee
report routes and JSON/text/CSV exports select the same archived revision via
the scoped database read RPC; selected revision pages/exports do not query live
presentation or support data. The old `freezeMonthlySnapshot` action returns a
retirement error, and the Task Tools entry points to the new controls; no
upsert path remains. Revision comparison shows changed factor/score/status,
source-record IDs, award dates/counts, availability and certification. CSV
retains exact six-decimal factor displays and is formula-escaped.

## Legacy reconciliation and recovery

Existing `monthly_performance_snapshots` and `report_snapshots` retain their
original rows and `legacy-before-m07` rule labels from migration 21. The old
month table remains immutable and its direct DML grants are revoked. It is not
backfilled into M12 or certified. Old `daily_star_records` remain the M08
legacy/uncertified ledger, not effective daily wins. In the upgrade test,
pre/post JSON equality for both legacy report tables passed. Unknown historical
source provenance remains unavailable. A production rollout needs a backup,
actual migration-ledger review, forward 29 apply and native verification; if
close fails, the whole transaction rolls back. A later correction uses the
director command and a new revision. Restoring the original means selecting
that retained revision for reading, never overwriting it. Database rollback of
29 after real close is not an approved recovery procedure.

## Checks performed

- Focused archived output/ratio/revision-diff/render and export-path tests:
  **9 passed in 2 files** (including 3 M12 archive tests).
- Full regression after the final runtime changes: **53 files / 471 tests passed**.
- `npm run typecheck` and `npm run build` passed after the final runtime changes.
- Disposable PostgreSQL 17 fresh 01–29 and upgrade 01–28→29 passed after the
  final SQL changes.
  Tests cover director/member/DM denial, scoped employee reads, immutable
  reports/members, same-key retry, changed-key conflict, concurrent closes,
  injected member-insert failure rollback, closed source/award rejection, named
  correction via M06, preserved revision 1 and legacy rows, and continuing
  current work, current-month draft/close gating and delayed worker denial.
- JWT-role shim is used in database tests. It is not a native GoTrue/PostgREST
  authorization test. The calculation fixture is deliberately incomplete and
  does not certify application scoring parity; M07 has independent engine tests.

## Outstanding verification and limits

Native authenticated Supabase/PostgREST/API and signed-in desktop/mobile browser
flows were unavailable. No production database or deployment was touched.
The complete/certified path cannot be positively verified until the real
BN/BO/BP sales mapping and legacy source provenance are supplied; the current
engine correctly leaves those inputs unavailable. Real scheduler replay,
multiple-month load/volume and restoration from a backup were not tested.
M10 provider integration remains deferred by the user and does not block
manual links or the core archive. No new M12 business decision is pending;
the source mapping/provenance questions predate this module.
