# Independent M00 fixture contract

`m00-confirmed.json` uses invented task/member identifiers and fixed expected
results from RULES/ACCEPTANCE and inspected anchors. No private workbook rows
are committed. Expected values were not obtained from application functions.
`m00-blocked.json` lists decision-dependent examples with **null expected**
values. They are pending acceptance, never successful skips.

Run `python tools/fixtures/verify_fixtures.py` from the repository root.
It checks fixed formula arithmetic, all ten coefficients/median deltas,
freshness thresholds, and checklist weighting with Decimal. It imports no
application code and tests no SQL. Passing means the draft fixture expectations
are internally consistent; application parity remains unverified.

## Schema and provenance

Top-level `contract_version` is `m00-contract-draft-2026-10-10`; it is not an
activated scoring version. `cases` is an array of unique `id`, `kind`, `rules`,
`input`, fixed `expected`, and optional `condition`/`source`. Decimal inputs and
outputs are strings to preserve units/precision. No final rounding is implied.

Numeric cases identify measure-specific inputs: scale, progressPercent,
taskHours, attendanceHours, loadingFraction, signed deltas and weighted counts.
Explicit validated/unvalidated counts test coefficients only; they do not map
pending/rejected/deleted records (D05). Eligibility tests check confirmed
exclusions and the 15% boundary conditional on an otherwise allowed task.

Raw-score fixture members define a synthetic **already-selected** complete
cohort with identical explicit as-of/date-window/units. Their median is fully
defined within that fixture. Production cohort/date choices remain D02/D04.
The zero-centered last-five case catches accidental raw additions.

Source-row fixture families:

- Task: synthetic taskId, scale, progressPercent, priority/status/category,
  assignment/due/completion calendar dates and optional participant IDs/shares.
- Attendance: memberId, local date, attendanceHours, status and logged hours;
  missing differs from observed zero. Special states/gates remain D10.
- Contribution/sales: memberId, event/validation dates, state and weighted-count
  classification. Sales (D05, approved 20 October 2026) are flag counts over the
  member's eligible entries: A25–A27. A24 keeps the workbook arithmetic on symbolic subtotals.
- Checklist: section role, direct children, Yes/No/N/A state; nested children
  retain local equal weights. Empty/all-N/A and linked Done behavior stay D07.

## Traceability

| Cases | Contract | Later conformance owner |
| --- | --- | --- |
| A01–A13, A14–A27, P01, RAW01/RAW02 | R01 units, coefficients, medians and contributions | M07 (task rate M02/M03) |
| B01–B02 | R02 confirmed exclusions/threshold | M03 |
| B03–B05, FBOUND | R03 calendar boundaries/frozen completion | M03/M11 |
| B06–B08 | R04 N/A, direct-child weighting, section separation | M05 |
| C03–C05 | Progress clamp/write invariant and R06 arithmetic/derived relation | M02/M09; transactional/DB conformance still required |
| Every blocked case | Explicit D01–D13 dependency in fixture | Named module resolves decision and adds expected result |

Fixtures intentionally do not certify RLS, races, rollback, graph errors,
provider effects, award scheduling or archived revision preservation through
pure arithmetic. ACCEPTANCE C01–C12/D01–D10 remain future real integration gates.

## M01 superseding acceptance evidence

The M00 JSON fixtures are a dated baseline. X22 permissions is now resolved by
approved D13 and real PostgreSQL role tests; X04 additive scale/progress shares
is resolved by D03/unit/DB cases, while its other-factor/history parts remain
open. X23 engineer close/revision authority is denied; revision mechanics remain
unapproved. Do not count those historical NULL fixtures as current implementation
failures. M01 tests use fixed expected thirds 333334/333333/333333, configured
40/60 scale/progress totals, actual-worker hours and explicit allowed/denied roles.
`m01-synthetic-reconciliation.json` comes from disposable upgrade fixtures only;
it contains no production/user workbook data or approved live backfill.

M03 superseding evidence (12 October): contract/freshness/command tests and
`tools/test_m03_database.py` exercise the active M02/M03 approvals through real
adapters. The old23 pending M00 metadata examples remain a dated baseline, not23
currently unanswered questions. `m03-*-reconciliation.json` contains disposable
counts/IDs only; production counts and native Supabase/browser parity are unknown.


M05 superseding evidence (12 October): m05-rollups.json plus the checklist unit
suite and disposable DB harness settle the X12 empty/all-N/A, X13 linked Done
contradiction and X14 section/current-review gate parts of the dated M00 baseline.
The M05 follow-up approvals also settle prospective progress ownership switches.
The M00 verifier's23 NULL examples remain historical metadata, not23 current
questions or failed M05 cases. No M05 business answer remains pending; native
Supabase/API/browser and actual legacy reconciliation are still outstanding.
