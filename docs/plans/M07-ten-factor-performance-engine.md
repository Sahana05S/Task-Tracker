# M07 — Shared ten-factor performance engine

Status: implemented awaiting native verification on 13 October 2026.
All three D02/D03/D04 follow-up recommendations are approved and active;
sales mapping remains unavailable. See [M07 evidence](M07-evidence.md).
Native verification is outstanding; no production apply/deploy/M08.

## Outcome

Replace competing formulas with one transparent versioned engine matching all ten median-relative factors and workbook units.

## Existing code and confirmed problems

lib/analytics/engine.ts has four terms; lib/stars/scoring.ts five unrelated terms. Loading/criticality differences are calculated but not scored. Employee productivity uses eligible task hours. Current scale changes restate historical logged progress.

## Implementation steps

1. Define CalculationContext with ruleVersion, periodStart/end, asOfLocalDate and approved factor cohorts. Define raw factor adapters from dated task/credit/attendance/contribution histories.
2. Implement each raw factor with the established unit and missing-data policy. Ensure shared tasks/scale history do not double-count or silently change historical credit.
3. Compute ten factor medians using approved populations, then member deltas and exact outer weighted contributions. Keep high precision until declared output boundaries.
4. Return explainable outputs per member: raw, median, delta, coefficient, contribution, eligibility/source reasons and composite sum. Make undefined data visible.
5. Replace dashboard/daily-star/report input paths with this engine. Retire obsolete weights and freshness percentages from final scoring; compatibility fields must not remain authoritative.
6. Implement deterministic recomputation for open periods, with versioned cached/persisted outputs only where justified. Prevent historical reads from using present assignment/scale/freshness state.
7. Validate workbook-derived source fixtures and independent factor-vector fixtures. Add reconciliations across all consuming surfaces.

## Data and interface contract

Pure engine accepts resolved inputs and returns CalculationResult; source adapters resolve as-of data. Attendance denominator and fractional loading are explicit typed fields. Persist ruleVersion, cohorts and calculation context with results. No second award formula.

## Acceptance and verification

- [x] Independent delta vector in ACCEPTANCE.md totals10.10 at full precision.
- [x] Members with identical raw factors have matching deltas/scores; medians are correct for odd/even cohorts.
- [x] Loading difference0.05 contributes2.0, and the UI displays it as5 percentage points.
- [x] Task productivity50/2=25 is distinguished from employee scaled progress0.05/attendance8=0.00625.
- [x] Zero/missing attendance, negative corrections, no eligible tasks and all contribution states follow the confirmed policy.
- [x] All ten contributions sum exactly to the displayed score within declared tolerance.
- [x] Changing one eligible source changes only the justified factors; closed history does not restate.

These checks describe pure-engine and disposable PostgreSQL evidence. Native
Supabase/JWT/API and signed-in role/browser checks remain unperformed; sales
business-field mapping remains unavailable. M07 is not marked Verified.

## UI / workflow integration

Provide factor breakdown data for M11. During cutover label legacy and new rule versions; do not show old/new scores as directly comparable.

## Scope boundaries

Do not add normalization beyond median subtraction or tune coefficients to match current app scores. Do not silently use monthly deltas where the approved model uses cumulative/as-of progress.

## Decisions and rollout

D02/D03/D04 are approved by the 13 October reply. D05 sales mapping and unknown
historical provenance remain guarded; native verification is outstanding. Run shadow calculations and reconcile known examples before replacing production rankings.

Use the shared definition of done in IMPLEMENTATION.md. Update STATUS.md with acceptance evidence, actual migration/revision, tests and limitations. Recheck predecessor contracts if their code has advanced. Planning proposals become authoritative only when confirmed in DECISIONS.md.
