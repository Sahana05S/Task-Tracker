# M09 completion evidence - 13 October 2026

**Implemented awaiting native verification.** All three follow-up answers are
approved and recorded in DECISIONS. Historical import is deferred by user.
Branch main at7764489ac6bcc13f0062e67b401c7c9738f5848b plus preserved existing
M08/user work and uncommitted M09 changes. No production apply/deploy or Drive
operation occurred; M10/M11 remain unstarted.

## Changes and approved behavior

- Added forward24_task_tools_atomic_previews.sql and
  **25_approved_task_tools_and_dated_handoffs.sql**. Migration24 is unchanged from
  independent verification;25 activates m09-approved-2026-10-13 and implements
  the approved dated archive/handoff guards and observations. Migrations01-24
  remain preserved. No source data import, tag rewrite or historical backfill.
- Durable15-minute actor-bound previews reserve unique sequence tags and capture
  source task/participants/reviews/details/checklist/linked-scale ancestor state.
  Commit locks source/domain rows, rejects changed policy/source/team/tag state,
  uses actor/operation receipts and returns an atomic result or tagged failure.
  A retry cannot create another task or reduce its source again.
- All8 Effort/Skill variants are active: Even transfers half; Uneven permits
  0 through the whole source; live Proportional permits0 through100% including
  fractional percentages without reduction; Absolute is independent0 through500.
  Effort retains category; Skill usesSD. Reductions use prospective audited
  overrides, preserving underlying inputs and captured scale/share credit.
  Proportional future scale changes propagate; cycles remain denied.
- Single, weekly, day-count, all-active-member and number/suffix copies use
  explicit new dates/counts and the approved independent-repeat scale families.
  Weekly phases are consecutive seven-calendar-day windows; day-count is explicit
  calendar days. Source is unchanged for copies. All batches commit entirely or
  roll back entirely. Done/reopen retain M05 checklist/current-review/progress
  proof, role restrictions and M03 audited reasons.
- Copy metadata description/category/priority, exact published template version,
  known shares/reviewers and current checklist layout into independent instances.
  Reset Not Started/0%/manual progress, approvals, Yes/No/N/A leaf state toNo,
  sections to uninitialized and other editable content/comments. Linked-task
  leaves become ordinary items for reassessment. No log/timer history or asset
  URLs are copied. Hours-derived copies restart atzero unless an explicit override
  exists. Source share/scale/section gaps or inactive participants require explicit
  reconciliation; no historical attribution is invented.
- Actual carryover creates a linked remaining-manual-scale task at0% in the
  current month and atomically archives the predecessor with a reason. Scale10
  at40% creates new6, retains old4 earned and preserves predecessor identity,
  original dates/progress/scale, logs, links and historical/frozen reports.
- Reasoned manager archive retains records. Database triggers make archived task,
  participant/review/detail/asset/checklist/log/timer rows read-only. No physical
  deletion or ordinary restore/revision is available. Running timers must stop
  before archive/handoff; immutable archived graph branches are skipped during
  subsequent source propagation and freshness refresh.
- Shared source observations include archive date and successor identity.
  Archives leave carried loading/criticality/freshness only when effective by
  as-of and within that window. Later archives do not change earlier-period
  factors. Actual period earnings and captured Done completion remain. A
  whole-source transfer leaving scale0 also retains previously captured period
  credit; current scale cannot erase an earlier earning. No new weighting,
  median/cohort, rounding, task-productivity or award-selection formula.
- Task Tools now uses readable selectors, units, pending/disabled fields, complete
  previews, stable retry IDs and recoverable conflicts/errors. Legacy non-atomic
  split and post-create content/URL-copy paths are removed. Refresh uses canonical
  metrics/observations/invalidation and reports queued recomputation, never a
  fabricated healthy score. Missing sales/history remain unavailable.
- Creation, visible UUID/tag/title JSON export with archive metadata, retained
  archive, import deferral and manual/native/provider status are separate.
  Archived task/detail/checklist pages and registry retain readable identity and
  successor links while suppressing ordinary edits/execution. Provider work is
  not requested and no actual files/folders are created or renamed.

## Source and menu reconciliation

[All34 actions](M09-menu-coverage.md):12 supplied handler bodies,22 missing.
Classification is19 verified portable native commands,5 partial,9 source-handler-
missing and1 user-approved historical-import deferral. Approved native parameters
replace assumptions for the four missing duplication bodies; this does not claim
original workbook/provider equivalence. Original M00 inventory remains historical.

Both supplied XLSX and the primary menu/support script hashes match M00. Missing
references remain22 bodies, TemplateDialog.html, BlankFilesDialog.html, provider
registry/folder templates, external attendance, SummaryBN/BO/BP definitions,
old-period attribution/linked-checklist evidence and installed trigger details.
The supplied B5-folder helper proves a real Drive shortcut only, not a database
carryover scale/progress/date rule. No provider reference was modified or accessed.

## Checks actually completed

| Check | Actual result |
| --- | --- |
| Focused Task Tools/performance | 6 files,66 tests passed, including literal arithmetic/date/archive and native source fixtures. |
| Full npm test | **44 files,390 tests passed.** |
| npm run typecheck | Passed. |
| npm run build | Passed, including TypeScript and22 generated static pages. |
| PostgreSQL17.11 fresh | Migrations01-25 before seed; all approved commands/cases pass. |
| PostgreSQL upgrade | Migrations01-24 plus existing seed/frozen snapshot, then25; old previews blocked and existing values/history preserved. |
| Support/precision/history | All8 variants, source10 Even5+5, Uneven7+3 and whole10+0, fractional20.5% gives2.05 then4.1 when source doubles; earlier captured earnings preserved. Cycle denied. |
| Atomicity/retries/races | Forced insertion leaves source10 and task/audit/receipt/outbox counts unchanged. Identical retries return one result. Concurrent splits/batches succeed or return40001, with unique tags. |
| Copy and batch gates | Approved phase/count/all-team/suffix batches; copied Yes/N/A/linked leaves reset, independent exact template and description preserved, other content cleared, no asset reuse. Invalid Done batch rolls back the earlier valid item; current review/section proof and reasoned reopen succeed. |
| Carryover/archives | Actual6/0 successor with old4 retained; predecessor fields unchanged apart from archive/reason/successor/version/time. Progress/review/log/checklist/detail edits, direct archive reset and deletion denied. Archived derived source stays frozen when its upstream changes. Running timer blocks archive until ended. |
| Shared reports/refresh | Old-period factor values unchanged across handoff; old earnings4 remain, successor20% earns1.2 in current period. Archive retains Done completion and period earnings; whole-transfer scale0 retains captured earnings. Refresh preserves dates/freshness/progress and queues shared work. Freshness worker runs successfully with archives. Frozen snapshots unchanged. |
| Preservation | All29 approved-turn baseline hashes match, including README/manifests/landing/final QA and migrations01-24. Existing user/M08 edits retained. |

Portable executable checks (loopback port15432, no .env/project credentials):
`python tools/test_m09_approved_database.py --psql "<portable psql path>" --port 15432`
and then `python tools/test_m09_approved_edges.py --psql "<portable psql path>" --port 15432`.
Only literal taskpulse_m09_approved_fresh_test/upgrade_test databases are recreated
by the first script. Edge checks use those installations. Earlier independent
harness/fixtures remain historical; they inject draft policy only and are not
approved conformance evidence.

Approved source fixtures: fixtures/m09-approved-fresh.json and
fixtures/m09-approved-upgrade.json. Original and approved-turn preservation
baselines are fixtures/m09-preservation-before.json and
fixtures/m09-preservation-approved-before.json. The JWT-subject shim verifies
PostgreSQL/RLS commands, not GoTrue token delivery. The old-period credit test
first proves unknown backdated shares are rejected, then seeds an owner-only
synthetic historical effective share timestamp. That fixture does not authorize
real import/backfill or certify missing business provenance.

## Remaining verification and rollout

Native Supabase/GoTrue/PostgREST authorization and installed grants, signed-in
browser preview/pending/conflict/download/archived flows, actual provider worker
operations and delivery/scheduling are unperformed: the respective configured
native test sessions/provider setup are unavailable. Source-handler/provider
parity remains unavailable where references are missing. These are verification
and source limitations, not unresolved M09 policy approvals. Import is deferred.

No further M09 business decision is required. For rollout, inspect the actual
applied migration ledger and existing data; apply only missing forward migrations
(including24 then25) to an authorized test environment, verify native roles and
browser workflows, then obtain separate production authorization. Do not edit
older migrations or assume production has run any local migration. No production
apply/deploy, Drive, M10/M11 or next-module work is authorized here. The disposable
portable cluster is stopped after verification; stored archives remain intact.
