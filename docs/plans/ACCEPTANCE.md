# Independent acceptance cases

## M08 approved acceptance - 13 October 2026

Complete-vector fixtures verify highest exact score, invalid attendance denial,
complete/no-eligible outcome, missing sales/population blocking, exact tie guards,
four wins beating three, shared-score count tie-break, missing coverage and
nonwinner measured-zero history. The 13 October reply approves D10; explicit
fixture choices remain independent evidence. Added cases verify the precise
approved MTD cutoff, initial versus correction as-of and exclusion of future
assignments from older windows. Real SQL
guards/retries/rollback/overrides/frozen evidence is in [M08 evidence](M08-evidence.md).
Positive complete persistence tests use an owner-only synthetic sales availability
adapter; they do not establish a business-field mapping or native delivery.

## M07 approved conformance - 13 October 2026

`__tests__/lib/performance/engine.test.ts` applies literal A02/A03/A07/A08/A09/A10
expectations to the real exact engine, including ten-term reconciliation10.10,
fractional loading and explicit missing sales. `source-fixtures.test.ts` applies
fixed3.6/1.2 earned credit,3 actual hours,.45 employee rate,.5 shared criticality
and1.5 freshness expectations to real disposable PostgreSQL source outputs and
dashboard/profile/report adapters. The 13 October D02/D03/D04 answers activate
the live policy, tested against these same literal expectations. Cases also cover
former assignee earnings, inactive denominator shares, late completion, measured
zero and factor-specific exclusion. Native API/browser checks remain outstanding.
Sales field conformance remains unavailable under the approved
fallback. SQL source/privacy/retry/rollback/frozen evidence is in M07-evidence.

## M06 approved acceptance - 12 October 2026

Independent checks are in `__tests__/lib/attendance/contract.test.ts`,
`__tests__/lib/support/contract.test.ts` and `tools/test_m06_database.py`.
Actual source-row populations now yield1.88 facts and3.50 ideas/suggestions.
Pending earns unvalidated credit; rejected/withdrawn excludes. Own pending edits/
withdrawals and manager reviewed corrections with atomic reset are tested with
original-date/as-of retention. Legacy unknown populations/provenance remain
unavailable, not guessed pending.

Exact daily validity checks8/8 and8/8.01, regular8+off2 versus effort10/10.01,
all six measured states, missing versus confirmed zero, segmented timers,
corrections/reversals and no cross-day offset. Real disposable PostgreSQL tests
cover direct/inactive/forged writes, self-validation, private history, concurrent
versions/idempotency, source/history/audit/outbox rollback and frozen protection.
Fresh01-20 and upgrade01-18 to19-20 are tested. Native Supabase/API/browser
checks are not substituted by that harness. Mapped sales acceptance remains
unavailable under the approved fallback. See [M06 evidence](M06-evidence.md).

Use fixed expected values below; do not generate expected results from the code under test. Cases with unresolved decisions remain BLOCKED, not skipped-and-passed. M00 adds source-row fixtures after field/cohort/date decisions.

M00 draft delivered 10 October 2026: [fixture schema and files](fixtures/README.md)
contain 48 confirmed/conditional arithmetic and boundary cases and 23 explicitly
blocked source/decision examples. `python docs/plans/tools/verify_fixtures.py`
passes fixture-consistency checks, not application conformance. These artifacts
are outside the application test suite; later modules must test the real code/SQL
against them. Production cohort/windows, final rounding and missing-value policy
remain D02–D05. Symbolic sales subtotals do not approve a business-field mapping.

A11/A12 below are conditional examples only: M00 executable cases replace the
word "pending" with explicitly classified "unvalidated"; pending membership is approved by the M06 follow-up; those historical M00
arithmetic fixtures alone still do not prove runtime population conformance. No pending/rejected/deleted row is silently assigned score credit.

## Numeric contract

| ID | Input | Expected |
| --- | --- | --- |
| A01 | Scale0.10; progress50% | Scaled progress0.05 |
| A02 | Task progress50%; task hours2 | Task productivity25 progress percentage points/hour |
| A03 | Employee scaled progress0.05; attendance8h | Employee productivity0.00625 before rounding; distinct from A02 |
| A04 | Priority No/Low/Medium/High/Focus | Weights0.25/0.5/0.75/1/1.2 |
| A05 | Eligible High+Medium tasks | Criticality1.75, not0.875 |
| A06 | Member assigned scale3; team10 | Loading0.3 internally;30% display |
| A07 | Loading0.30 versus median0.25 | Delta0.05; contribution40×0.05=2 |
| A08 | Median of1,3,8; median of1,3,8,10 | 3;5.5 |
| A09 | Deltas: productivity2, criticality1, loading0.05, completion2, progress80, sales1, facts−0.4, ideas2, suggestions−1, freshness−1 | Composite10.10 |
| A10 | Same raw value as median for every factor | All ten deltas0; composite0 |
| A11 | 2 validated and1 pending fact, where pending is confirmed as unvalidated | Raw1.88; delta calculated separately |
| A12 | 1 validated and2 pending ideas (same population assumption) | Raw3.50; suggestions same coefficients |
| A13 | Eligible freshness states Super Fresh, Fresh, Rotten | Raw3+2−3=2; median subtraction comes afterward |

A09 breakdown:3+0.5+2+3+1+1−0.4+2−1−1=10.10. These are already resolved deltas, so this case validates coefficients/units independently of unresolved source-date attribution.

## Lifecycle and checklist

| ID | Scenario | Expected |
| --- | --- | --- |
| B01 | Positive scale, allowed status, Medium, progress14.99/15 | Excluded/eligible, subject to confirmed category/status map |
| B02 | No priority or Not Started or Discarded or zero scale | Excluded with correct reason |
| B03 | Assigned2026-10-01, due2026-10-05; as-of10-04/10-05/10-07/10-08/10-09/10-10/10-12/10-13 | Super Fresh/Fresh/Almost Fresh/Almost Stale/Almost Stale/Stale/Stale/Rotten |
| B04 | Completion on10-07 in B03; read on10-20 | Almost Fresh; uses completion date |
| B05 | B03 overdue task logs time or edits title | Freshness unchanged for the same as-of date |
| B06 | Leaves Yes, No, N/A | 50%; N/A excluded |
| B07 | Direct groups100 and0 with different leaf counts | Parent50%; no flattened-leaf weighting |
| B08 | Setup0, Activity80, Closure0 | Task progress80%; independent setup/closure state |
| B09 | Cycle, cross-checklist parent, dangling/rootless graph | Constraint/typed error; neverNaN or recursion failure |
| B10 | Linked task Done at50% | Prevent/resolve according to D07; never contradictory complete50% |
| B11 | All-N/A or empty section | Expected result defined by D07; no silent invented100% |

## Writes, automation and permissions

| ID | Scenario | Expected |
| --- | --- | --- |
| C01 | Two concurrent progress commands | Both effective changes preserved or explicit conflict |
| C02 | Submit/retry the same log/timer-stop operation | Exactly one log and one effective progress change |
| C03 | Progress95 + requested10; progress0 − requested10 | Effective+5 and0; analytics reflects actual change |
| C04 | Source scale10 Even split; forced duplicate tag failure | Successful5+5; failed operation leaves source10 |
| C05 |20% linked proportional support; source10→20 | Support2→4; source not reduced |
| C06 | Assignee attempts direct scale/priority/ownership write | Database denies protected changes |
| C07 | Inactive/anonymous actor invokes protected command | Database denies |
| C08 | Manual details creation versus valid-entry auto trigger | Equivalent native state; retries do not duplicate records/jobs |
| C09 | Details save/reload SMART and IPO fields | Correct corresponding panels show saved values |
| C10 | Change checklist/manual progress with logged hours | Stored/derived task productivity refreshes correctly |
| C11 | Create/rename/copy provider assets | Actual provider result verified; URL insert alone is not a pass |
| C12 | Provider timeout after remote success; retry | Existing provider asset reused; no duplicate/share expansion |

## Awards, reports and periods

| ID | Scenario | Expected |
| --- | --- | --- |
| D01 | Highest score but invalid attendance | Ineligible for daily award |
| D02 | Nobody qualifies | No winner, explicit recorded reason |
| D03 | A4 daily wins; B3 wins with higher score | A is monthly winner |
| D04 | Equal win counts | Shared current performance tie-break, then approved final-tie rule |
| D05 | Dashboard/profile/award/report same context | Identical factor values and score |
| D06 | Today's snapshot and future month-end | No fabricated historical/future observation |
| D07 | Close month, edit live task scale later | Closed report unchanged |
| D08 | Authorized correction to closed month | New revision; original preserved |
| D09 | Scheduled award/recompute repeats | One effective result per date/revision; monitored failure/retry |
| D10 | Attendance8, logs8/8.01 | Boundary follows D10 decision and approved time window |

## Test layers

- Pure unit fixtures: formulas, thresholds, rollups, median/rounding and selection.
- Real database integration: grants/RLS, transactions, locks, constraints, backfill and close/revision commands.
- Browser workflows: role actions, reload/retry, selectors, nonzero reports, mobile/keyboard usability.
- Provider/scheduler sandbox: actual side effects, revoked access, replay and operational monitoring.

Passing a mock permission test does not substitute for a direct authenticated DB test. Preserve evidence of any unavailable test infrastructure.


## M05 independent acceptance evidence

B06?B11 and C10 now use fixtures/m05-rollups.json and the focused checklist suite.
Fixed expected cases cover50% with N/A excluded, unequal nested groups, Activity80
with Setup/Closure0, uninitialized/empty/all-N/A, linked progress versus lifecycle,
quality errors and intermediate thirds. PostgreSQL evaluates the same applicable
fixed fixtures independently; its command tests also cover graphs, diamonds,
permissions, concurrency, receipt replay, credit preservation, frozen-parent
rollback and current-review Done gates. See M05-evidence.md. Native auth/API and
browser layers remain unperformed; passing these cases does not certify them.

## M09 independent versus blocked acceptance - 13 October 2026

Independent transaction/permission/preview/race/rollback and single existing Done/Reopen/section/refresh safeguards are tested in tools/test_m09_database.py. Draft fixture-only cases cover all8 support modes, linked future scale with retained earnings, cycles, copy resets and atomic batches. These do not accept D09/D12 business proposals. Actual carryover/archive, activation of support/copy/batch defaults, historical import scope and original-handler equivalence remain blocked by specific decisions or missing sources. Native auth/API/browser/provider verification is outstanding.

## M09 approved acceptance - 13 October 2026

All three follow-up policies are approved. The approved PostgreSQL harness tests
all8 variants, whole-source Uneven, fractional proportional, prospective credit,
rollback/retry/races, actual carryover6/0 retaining old4, read-only archives and
preserved original/frozen records. Shared TypeScript fixtures prove no prior-
period factor change and current successor workload/earned1.2 after20% new work.
Completion and period credit survive archive; date boundaries are explicit.
Focused edge checks exercise copied Yes/N/A/linked reset, preserved template/
description, cleared other content/no asset reuse, archived derivation freeze,
running-timer protection and shared refresh. Native auth/API/browser tests remain
outstanding, source-handler parity is unavailable where missing, and import is
explicitly user-deferred rather than an implementation gap.

## M10 independent acceptance - 13 October 2026

37 mock Drive cases (31 in the focused run, all37 in the final regression) cover loss after remote/local success, marker visibility
lag/no duplicates, reserved folder ID, identity/parent mismatch, actual rename
requests, template version guard, shortcut target, partial copies, safe errors,
sharing conflicts/recovery and credential boundaries. Portable fresh/upgrade
checks additionally prove active role/version/replay, native/outbox rollback,
concurrent claims/resource fencing, verified provider link protection and retained
archive/frozen-report guards. See M10-evidence. Real Google/Supabase/browser
acceptance remains unchecked, pending D11 and approved sandbox configuration.


M10 approved follow-up (13 October 2026): the three replies settle initial D11
business choices. Forward27 and the runtime guard bind the sole supplied root,
Shared Drive/service identity, exact IPO layout, no templates, three file kinds,
manual phase, native authority and mapped new-file comments. Live ancestry checks
protect moved assets. A protected read-only bootstrap resolves actual Drive/account
identity once server credentials are securely supplied; the worker stays disabled.
Missing service identity/credentials/reviewer map and real/native verification are
technical setup, not unanswered business-policy choices. Earlier proposals are
historical. Drawing/Form are user-deferred; no production or M11. See M10-evidence
and M10-configuration for current checks, pending configuration and recovery.


## M10 live integration deferred by user - 13 October 2026

The user explicitly said "Defer real Google Drive integration and credential
setup for now." Manual asset links remain available. Provider workers, setup
diagnostics, create/copy/rename/shortcut/sharing requests and retries are unavailable
under the current explicit runtime deferral, even if sandbox environment flags
are supplied. No credentials or mappings are requested during this deferral.
Automatic initialization code is retained but provider operations stay disabled.
Native details, checklists, execution, scoring, awards and reports do not depend
on Drive credentials. This supersedes earlier requests to provision/test now.

M10's independent code and tests are documented; actual Google side effects,
account/root/Shared Drive verification, real failure trials and provider-backed
browser flows are deferred and unverified. This is not provider completion.
Approved sandbox/ownership/layout/authority/sharing choices remain recorded for
an explicit future resume. No credentials, schedules, real Drive changes,
production apply/deploy or migration rewriting occurred. M11 is the next planned
module; this handoff does not implement it, and Drive is not a prerequisite.

## M11 acceptance evidence — 13 October 2026

See [M11-evidence.md](M11-evidence.md) for passed independent tests and
disposable-database authorization/migration checks, and
[M11-view-coverage.md](M11-view-coverage.md) for sheet-by-sheet view mapping.
M11 remains implemented awaiting verification because signed-in native API and
desktop/mobile browser checks could not run. Source gaps do not become zero scores,
awards or invented historical points. The earlier M10 handoff text above does
not restrict this subsequently authorized module.

## M12 acceptance evidence — 13 October 2026

See [M12-evidence.md](M12-evidence.md). Disposable PostgreSQL fresh/upgrade
checks cover immutable revision writes, replay/conflict, concurrency, injected
rollback, director-only correction, named closed-record guards, continuing work,
legacy preservation and scoped reads. Focused output checks cover archived
exact factors, uncertified labels and revision differences. Native signed-in
Supabase/API/browser and complete certified-result tests remain outstanding;
the synthetic incomplete fixture is not scoring certification.
