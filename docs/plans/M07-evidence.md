# M07 evidence - 13 October 2026

M07 is implemented with all three approved 13 October follow-up answers active.
It awaits native verification and is not verified or released. The user's pasted M07
request supersedes the earlier no-M07 boundary. Main remains at
8ab398181ef913086b8c39615665fd04175bd37d plus preserved uncommitted M00-M06/user
edits. No production migration, deployment, M08, Drive operation or message.

## Independent engine and consumer work

`lib/performance/engine.ts` is the sole current composite engine. It implements
all ten raw-minus-factor-median deltas and coefficients 1.5/.5/40/1.5/.0125/1/1/1/1/1,
with loading fractional, criticality summed and six-state freshness weights.
Exact decimal/rational arithmetic retains medians, rates, deltas, contributions
and their sum without intermediate rounding. Approved factor presentation is
six decimals and score presentation two, half-away from zero only at display.

Each factor exposes raw/unit/availability/reasons, cohort ID and included/excluded
population, median/delta/coefficient/contribution, exact values and source
provenance. Context retains rule version, half-open period, as-of instant/Kolkata
date, windows/attribution policy, source watermark and precision policy.
Unapproved cohorts/windows/precision are explicit guards. A known subtotal is
labelled Available-factor subtotal; missing sales never becomes zero, a
renormalized weight or a complete score/ranking.

Dashboard, team/profile and report reads use the same load/resolve/calculate path.
The former four-term engine no longer scores/selects a monthly winner. The old
five-term reference is isolated in `legacy-scoring.ts` with an explicit legacy
rule identifier and historical tests; no live calculation uses it. M08 receives
the shared complete/eligible result through a narrow adapter, without new award
selection/scheduling. UI factor tables and incomplete warnings replace the old
breakdown. Existing operational task charts/layouts remain; these observations
do not certify period scoring. Team-average productivity remains unavailable
rather than inventing another aggregate formula.

Report payloads retain the shared context/factors/exact results. An incomplete
compiled report is Draft; it is not certified Final. Monthly score freezing is
guarded unless a complete ten-factor calculation exists. Frozen legacy reports
and monthly snapshots retain their original fields and cannot be overwritten by
ordinary director writes; full M12 revisions are not implemented.

## Migration, sources and recomputation

Forward migration `21_performance_sources_and_recomputation.sql` follows retained
01-20. Private immutable observations capture actual task/member/participant,
credit-balance and applied-log state, with an observed baseline cutoff. Current
state cannot impersonate a pre-baseline historical observation. Numeric sources
are decimal strings. Manual credit captures exact effective changes/current
scale/share versions; older manual events without provenance remain unknown.
Log corrections use original captured scale/shares and the applied delta, never
requested-but-clamped progress. Checklist credit uses the established captured
prospective events; mode-switch zero credit is retained, without invented effort.
Completion captures its actual observed terminal participant state.

M06 attendance and contribution logic is factored into private shared helpers;
the existing public wrappers retain active/employee/manager checks. M07's team
source RPC returns only aggregate attendance, public task state/versions,
aggregate credit and contribution metadata. It exposes no other employee's
private attendance days/check times/notes/log rows. Ordinary team requests use
canonical calendar-month aggregate cutoffs and cannot narrow to a day or move
past cutoffs to reconstruct daily attendance; MD/PE and narrow service workers
can request other contexts. Account and source revisions
support the approved factor-specific active-as-of known-value cohorts. SQL statement snapshots
and a source watermark prevent mixed/current-state substitution.

Reads calculate fresh from the requested source context, without trusting a
stale persisted cache. New M07 invalidation kinds reuse the existing outbox,
committing with source/history/audit/receipts. A narrow service-only worker entry
claims bounded leased jobs, checks stale source versions and retains immutable
runs/outcome receipts. Retries converge; source/calculation/frozen failures use
safe codes. Incomplete runs remain blocked with required_inputs_unavailable,
not falsely complete. Earlier differently scoped outbox kinds remain separate;
this module does not certify delivery for M08/M10. No scheduler/service secret,
production worker or deployment was configured. Worker APIs deny ordinary actors.

Original archives gain an explicit legacy-before-m07 metadata default; their
business values are not recalculated. New reports identify the shared engine.
Native owner/grant/schema rollout must be coordinated with the application.

Both supplied workbooks remain present and match their M00 hashes. No new source
material was supplied. Existing formula/header inspection still does not map
BN/BO/BP to business fields. The sales adapter stays unavailable under the user's
explicit fallback. Missing external attendance/template/script/prior-month/
linked-checklist/trigger sources remain recorded in SOURCES; neither XLSX is
missing. No private URL, import or native workbook recalculation occurred.

## Approved policy and verification

Focused pure/source-fixture tests passed: 2 files / 26 tests. Literal expected
results cover odd/even/unrounded medians, .30-.25 loading contribution2,
task50/2=25 versus employee.05/8=.00625, exact A09 composite10.10, identical
values/zeros, missing denominators, distinct cohorts, unsupported windows,
sales-unavailable incomplete status and exact contribution reconciliation.
Synthetic fresh/upgrade SQL source fixtures confirm period credit3.6/1.2,
employee productivity.45, shared criticality.5/freshness1.5, original-scale
corrections and manual credit with exactly3 actual task hours. They also confirm
identical dashboard/profile/report result/context shaping, including a currently
inactive account that was active in the requested as-of cohort. Their inputs are
synthetic; the live `m07-approved-2026-10-13` policy is also checked against these
literal expectations. Removed assignees retain old earnings with zero current
loading; inactive portions remain in the denominator. Late current Done tasks
count using captured completion shares. Unknown historical observations stay
unavailable. Known measured zero participates in its factor median; missing
inputs exclude only that factor. Invalid attendance denies ranking eligibility.

PostgreSQL17.11 fresh01-21 and upgrade01-20 to21 pass independent source/role/
privacy/profile compatibility, as-of scale/share/correction/review history,
completion-time share retention, source/history/outbox rollback, service lease,
stale result, incomplete outcome, immutable run/history and legacy-frozen guards.
Final checks passed: full37 files/329 tests, TypeScript and
production build (21 generated pages/all existing routes). The final SQL rehearsal
also covers identical lease-outcome retries producing one retained run, changed
retry payload denial and unchanged legacy frozen rows. Preservation hashes pass for27 baseline files including
01-20, landing, README and dependency files.
Local planning links and `git diff --check` also pass. The disposable portable
PostgreSQL cluster was stopped after testing; no production connection was used.

Unperformed: native Supabase GoTrue/JWT/PostgREST/API, signed-in multi-role browser,
deployed owner/grant/migration equivalence, real worker delivery/scheduler,
provider operations and native workbook-engine recalculation. Portable SQL uses
a subject shim, not native authentication. No native sandbox/test-account/browser
harness exists; Docker's Linux engine was previously unavailable. Missing/blocked
checks are not counted as passes.

All three choices are approved and implemented: period earned progress and
same-period regular attendance, carried as-of task factors; normalized current
criticality/freshness and Done-entry completion shares; active known-value
medians and exact intermediates. No additional business answer is needed for
this bounded M07 module. Sales mapping/legacy provenance and native checks remain
explicit limitations. M08 requires its own authorization.

Rollout: first verify 21 in a native Supabase sandbox with actual roles/JWT/API
and signed-in browser checks. Coordinate forward migration 21 and application
release, reconcile unknown legacy observations separately and configure narrow
worker credentials/delivery only with rollout authorization. Do not rewrite
01-20 or recalculate frozen archives. No production migration was applied.
