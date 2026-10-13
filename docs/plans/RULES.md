# Business rule contract

## M07 approved shared engine - 13 October 2026

`m07-ten-factor-v1` implements the exact confirmed ten-term median-difference
formula below. Contexts require explicit factor windows/cohorts/attribution and
precision. Exact rational results and provenance are retained; absent sources
or unapproved choices are unavailable, never zero. Sales mapping is unresolved;
other known components remain visible as a labelled subtotal without final score,
ranking or award certification. The 13 October reply approves D02/D03/D04:
period earned credit / same-period regular attendance; eligible carried as-of
workload/criticality/freshness; current Done completion in period including late.
Criticality/freshness use normalized as-of shares, completion uses Done-entry
shares; inactive shares are not redistributed and remain in the loading
denominator. Medians include active-as-of known values, including measured zero,
and exclude unavailable inputs per factor. Zero denominators stay unavailable;
invalid attendance denies ranking eligibility. Keep exact intermediates; display
factors to six decimals and scores to two with half-away-from-zero rounding.
Historical proposals below do not override these approvals. The current app consumes one
shared engine; legacy four/five-term formulas no longer provide current scores.
Frozen report values retain their original rules. See [M07 evidence](M07-evidence.md).

## M06 confirmed inputs and approved policy - 12 October 2026

The M06 request and both follow-up answers approve dated inputs, daily validity
and source-date/as-of contribution credit, not a second score engine.
`m06-attendance-inputs-v2` and `m06-support-inputs-v2` supersede guarded v1 adapters
in migration 20. Earlier proposals for these choices are superseded.

Attendance hours, separate off-hours and actual task effort remain distinct.
Present/Half Day use explicit measured hours, without 8/4 defaults. Absent/Leave
require both zero; Holiday/Off Hours require regular hours zero and allow actual
off-hours. Entered durations are finite/nonnegative and combined hours cannot
exceed a local day's 24 hours. Optional local check times must form a consistent
same-day pair covering entered regular attendance.

Each Asia/Kolkata day checks all non-reversed task effort, across task categories
and states, <= regular attendance + separately measured off-hours once. Actual
midnight timer segments enter their dated totals once; corrections/reversals use
retained as-of history. Every elapsed calendar day in the selected period needs
a confirmed record and every day must pass. Spare hours on another day cannot
hide excess. Missing/legacy-unconfirmed input or no elapsed days is unavailable,
never measured zero; known excess is invalid. Attendance is an eligibility gate,
not a score bonus. Saved awards remain readable; live awards stay guarded until
the shared M07/M08 engine exists. These modules are not authorized here.

Facts use .75 x validated + .38 x pending; ideas/suggestions use 2 x validated +
.75 x pending. Rejected/withdrawn earns no credit. Credit uses the original
business date and state known at the requested as-of time. Two validated plus
one pending fact yields1.88; one validated plus two pending ideas yields3.50.
Source-wide and per-employee raw inputs do not choose scoring cohorts/medians.
A known empty population is zero. Legacy false validation remains
`legacy_unvalidated`, not invented pending; true flags remain without fabricated
review times. Affected inputs are unavailable until population/provenance is
reconciled. History before the observed migration baseline is unknown.

Active authors create own records and may edit/withdraw own pending support.
MD/PE administer attendance/support; DM administers support without other-employee
attendance/detail rights. Independent review requires an actual different author;
self-validation and inactive writes are denied at PostgreSQL. Reasoned manager/DM
corrections of reviewed support atomically reset current validation to pending,
retaining earlier content/review. Withdrawn evidence is retained without ordinary
restoration. Frozen old/new author periods deny ordinary source/review edits and
preserve saved reports; full revision controls belong to M12.

Sales preserves (1.5 x BO + BN + .75 x BP) / 50, but BN/BO/BP business mapping
is unavailable. Typed source fields and independent CRUD work; raw sales remains
null with reasons under the authorized fallback. Meeting points are operational,
not an eleventh factor. A stored asset link does not imply provider creation.
See DECISIONS and [M06 evidence](M06-evidence.md) for approvals and actual checks.

## M05 checklist contract ? approved 12 October 2026

`m05-checklist-v1`: Yes=100, No=0, N/A excluded; parents weight applicable direct
children equally, retaining intermediate precision. Only Activity drives owned
task progress. Setup, Activity and Closure independently gate Done along with
current assigned reviews. Empty/all-N/A handling and prospective mode switches
follow the approved M05 entry in DECISIONS; earlier empty-section proposals below
are superseded. Linked progress 100 does not mean lifecycle Done. Inconsistent
Done/progress and missing/invalid references are explicit quality errors.


Status: confirmed items below come from the user's decisions and inspected workbook/script formulas. Proposed boundaries are marked explicitly. Settle the decision register before implementing affected ambiguous behavior.

## Authority and provenance

M01 approved boundaries (10 October 2026): configurable normalized shares,
equal by default, allocate scale and scaled-progress only; hours remain worker
attributed. Other task-factor/historical attribution stays D03. Detailed reports
are restricted to the employee and managers, with aggregate team summaries for
active members. Protected writes require active authentication and the D13
role/record/field boundary, including no self-validation. See the approved
decision entries and M01 evidence; no scoring/lifecycle formula is activated.

Order: current explicit user instruction → recorded user decision → confirmed workbook/script behavior → agreed implementation proposal. Current app code and old generated docs are not evidence that a rule was approved.

The user has specified: both manual/menu and automatic task creation; retain the existing mixture of manual and formula-derived scales; all ten score factors median-relative. Median-relative means subtraction (`value − team median`), as the workbook formulas show, not division by the median.

M02 approvals: shares change prospectively with effective versions; old earned
credit/frozen reports remain stable. Completion requires applicable Setup,
Activity, Closure and required reviews; N/A is excluded, uninitialized is not
complete. Managers cancel/reopen with audited reasons. Terminal enforcement
still depends on M03/M05. Requested log progress and actually applied progress
are distinct; analytics must use the applied effect when known, never infer it
for old clamped records. Corrections preserve manual progress and history.

## M03 active contract - 12 October 2026

The new request and two follow-up answers approve retained log reversals and
Asia/Kolkata timer segmentation, precise short effort, and M03 implementation.
D01 source resolution adds no OT or Stopped/On-Hold/Carryover category exclusion.
Missing/future dates and Discarded freshness are unavailable (D06 approved).
Assignees may pause/resume; manager Carryover/cancel/reopen require reasons and
preserve assignment/start/deadline dates. Done cannot proceed without proven
Setup/Activity/Closure and review evidence; M05 representation remains absent.
Scale families implemented from source evidence are manual, sourced numeric
activity count ? unit scale, hours ?12.5?explicit multiplier and proportional
linked scale. Record provenance, overrides and prospective scale versions.
Original credit is never reweighted by today's scale/shares. The user approved
including a new log's effort in derived scale before crediting that same log's
progress: 1 hour at multiplier 1 gives scale 12.5; +20% earns 2.5 units. Capture
the newly effective scale/version atomically. Unknown original scale is
unavailable and requires reconciliation; it cannot fall back to today's scale.

The task rate uses actual progress points / actual non-reversed effort; its
availability is separate from non-rate eligibility. Exact NUMERIC source hours,
scales and scaled-progress intermediates preserve small positive values. Existing
task rate storage rounds to two decimals, with expanded magnitude; this is not
approval of universal D04 scoring precision. Existing archived scores are retained;
legacy composites remain provisional, not the ten-factor target. Legacy award
calculation rejects unavailable/new freshness states rather than fabricating a
percentage mapping. No new award scheduler or scoring engine is activated.

## M04 native detail contract - 12 October 2026

Canonical content fields are description, the five individual smart_* fields,
input_content, process_content, output_content and reviewer_notes. Actions,
editors and panels use lib/tasks/details-contract.ts; SQL mirrors and constrains
these fields. Asset type and explicit IPO role are separate. Unclassified legacy
links remain visible for review. Dependencies/Carryover reference actual task
UUIDs; employee/report references respect existing visibility.

Initialization inserts missing native records once, captures an immutable
published template version and separate instructions, preserves existing content
and checklists, and enqueues only a native invalidation event. Valid saved entry
uses existing required identity/title/category/priority/active-assignee fields;
optional deadline/scale and metric eligibility do not enter the predicate.
Repeated saves/initialization do not repopulate or reset task content. Template
instructions never count as completed SMART content or checklist execution.
Native readiness and provider state are distinct; M04 requests no provider work.
Blank and setup-template nodes remain uninitialized/incomplete; Done is guarded
until M05 supplies proven completion sections. Legacy originals are retained;
unambiguous IPO copies fill only empty destinations and conflicts/aggregate
free text remain flagged instead of guessed.

## R01 — Units and scoring formula

Progress is 0–100. Loading used in scoring is a fraction 0–1; show ×100 with a percent label in the UI. Scaled progress is `scale × progressPercent / 100`.

For each of the ten raw factors, calculate `delta = memberRaw − medianRaw` over the cohort defined for that factor and time window. The composite is:

```text
1.5 × productivityDelta
+ 0.5 × criticalityDelta
+ 40 × loadingFractionDelta
+ 1.5 × completionDelta
+ 0.0125 × progressDelta
+ salesDelta
+ factsDelta
+ ideasDelta
+ suggestionsDelta
+ freshnessDelta
```

Workbook source: `1_2 Performance Analysis!L3`. The original workbook directly adds raw values for the final five factors; the approved target corrects ALL ten to median differences. Keep that correction explicit in tests and migration versioning.

Priority raw weights: No 0.25, Low 0.5, Medium 0.75, High 1, Focus 1.2. Criticality is a sum of eligible task weights, not their mean. Loading is assigned scale / team assigned scale, not percentage points. Define multi-assignee credit before applying that fraction (D03).

Task productivity is task progress percentage points / task logged hours (`D_Template Task Page!G11`). Employee productivity uses scaled progress / attendance hours (`B_Summary & Analysis!K4`). These are different measures; never swap their labels or denominators.

Workbook raw contribution formulas: facts = 0.75×validated + 0.38×unvalidated; ideas = 2×validated + 0.75×unvalidated; suggestions = 2×validated + 0.75×unvalidated. M06 approval makes pending eligible and rejected/withdrawn excluded; legacy unknowns require reconciliation. Sales: the workbook contains `(1.5×BO + 1×BN + 0.75×BP)/50`; map BN/BO/BP to their actual business fields in M00 rather than guessing from column letters.

Freshness raw score is the sum of eligible task-state scores: Super Fresh +3, Fresh +2, Almost Fresh +1, Almost Stale −1, Stale −2, Rotten −3. Completion is a count-based factor in the workbook; period, deadline qualification and attribution need D02/D03 evidence.

Do not prematurely round medians/deltas/components. Record the precision policy and zero/missing-data cohort policy (D04) before enabling final scores.

## R02 — Metric eligibility

Workbook `2_Tasks!R6`: priority No → excluded; Not Started → excluded; Discarded → excluded; progress >=15 → eligible; otherwise excluded. Preserve the approved zero-scale exclusion as well.

Candidate canonical predicate: positive scale AND priority != No AND status not Not Started/Discarded AND progress >=15. D01 source resolution in M03 adds no OT-only exclusion: the workbook often excludes it through No priority, whereas the legacy app excluded the category outright. Stopped, On-Hold and Carryover use the same source exclusions. Do not require logged hours for all task metrics just because productivity requires a denominator.

Use one eligibility contract with reason codes. The stored flag, dashboard, reports, daily stars, support splits and task edits must agree. Some operational displays intentionally include ineligible work; label them separately.

## R03 — Date-based freshness

Reference date = completion date if present, otherwise the requested as-of local date. Calculate days since assignment and days overdue from calendar dates.

Apply in order:

1. Days since assignment <=3: Super Fresh.
2. Reference date <= due date: Fresh.
3. Overdue <=2 days: Almost Fresh.
4. Overdue <=4 days: Almost Stale.
5. Overdue <=7 days: Stale.
6. Otherwise: Rotten.

Source: `2_Tasks!L6`. Completed tasks use their completion date; logging/editing never resets the deadline or freshness. Approved D06 leaves missing/invalid/future dates and Discarded freshness unavailable; blanks are never date zero. The app needs all six display/filter states. Historical reports classify at their own as-of date.

## R04 — Checklist semantics

Ordinary applicable leaf items are Yes=100, No=0; N/A items are excluded. Linked real-task leaves use the agreed linked-task progress/completion contract. Each parent averages its direct applicable children equally, so nested groups are not flattened into global leaf weighting.

Store section roles: Setup, Activity/Checklist Index, Closure. Task progress comes from Activity only. Setup and Closure progress/state are independent and influence OPEN/CLOSED workflow according to D07. Source: master checklist `Checklist Home!E6` refers to `E13` (Checklist Index), not an average of E11:E13.

No children, no applicable children, missing references, cycles and shared-task relationships need explicit safe results. Reject malformed input before propagation. Linked task percentage and completion cannot contradict each other (e.g. complete=true at50%). N/A transitions preserve history.

## R05 — Creation, scales and task identity

Support BOTH explicit creation and automatic generation from a valid task entry. An incomplete draft does not trigger external files or consume irreversible operations. Both paths use the same idempotent initialization service.

Preserve manual scale and formula-derived scale. The workbook includes activity-count and logged-hours formulas, including hours ×12.5×multiplier. Store derivation metadata and effective-dated scale changes; do not silently convert everything to a fixed number. Supported formula families and historical behavior are D08.

Keep task identity stable even when the title changes. Existing task tags remain resolvable. Auto-generation must use a concurrency-safe sequence, not row position or `MAX+1` without locking. Tag edit policy is D12.

## R06 — Support splitting

Source script confirms Effort and Skill variants for Even, Uneven, Proportional and Absolute.

- Even: support = source/2; reduce source by support.
- Uneven: support = approved amount within source scale; reduce source by support. Script UI says <=half but actual validation allows <=whole; D09 resolves this conflict.
- Proportional: support remains derived from source×percentage/100; source is not reduced. Store a relation instead of a one-time number.
- Absolute: standalone support scale; source is not reduced. Script permits0–500; make bounds explicit in validation.
- Effort retains source category; Skill uses SD. Completion/status copying, assigned dates and scale/credit behavior require D09. Do not accidentally create a Done task with0% progress.

Apply all source/new-task/participant/dependency changes atomically. Retries must not split twice.

## R07 — Attendance and awards

Daily winner is selected from eligible members using the shared ten-factor score. Attendance/report validity gates eligibility; it is not a substitute scoring bonus. The workbook compares logged task hours <= attendance hours (`B_Summary & Analysis!O4`). M06 approves per-day Asia/Kolkata validity and the special-state rules above; M08 eligibility/ties remain separate.

Monthly award = most eligible daily wins; tie-break = current shared performance score. Final exact tie/no-winner cases and overrides are D10. Corrections invalidate/recompute affected open award dates with an audit trail; frozen periods use M12 revision controls.

## R08 — Provider operations and reports

Saving a URL is a manual link operation. Real creation/copy/rename/share operations must call the provider and persist its file identity, job status and verified result. Automatic jobs reuse the same task initialization request as manual creation. Retry without duplicate files and without broadening permissions unexpectedly.

Live reports use the shared engine. Frozen reports preserve their inputs or reproducible source revision, rule version, as-of date, factor cohorts, raw values, medians, deltas, score and award selection. Current state must not impersonate historical observations.

## Versioned decisions

M00 inspection version: `m00-contract-draft-2026-10-10`. Confirmed formula
coefficients, units and boundaries are executable draft fixtures; source
population, time-window and final precision choices remain unapproved.
See [source mapping](SOURCES.md#ten-factor-source-contract) for all ten factors
and [evidence](M00-evidence.md) for discrepancies. Production `workbook-parity-v1`
is not activated or certified.

The Excel exports independently confirm R01's outer coefficients, priority and
freshness maps, R02's 15%/No/status exclusions, R03's date boundaries, task versus
employee productivity denominators, R04's Activity-only reference and the
contribution coefficients. The approved all-ten-median correction comes from
the supplied planning contract, not the original workbook's final five raw
terms. The loading scale numerator remains the supplied target contract:
`Task_Alloc_Counts` cells are absent, so its workbook derivation cannot be
revalidated here. Sales and completion subtotal formulas are also absent;
no field or deadline mapping is silently approved by this inspection.

Contribution fixtures use explicitly classified **validated/unvalidated**
counts. They do not establish that pending, rejected or deleted rows belong to
either population. Progress raw source points to `Progress_Numbers`; its
aggregation/window is D02, and percentage progress must not be substituted
for scaled progress without a decision. Missing/zero denominators, empty/all-N/A
sections, future assignments and exact ties remain blocked cases.

Numerical policy already confirmed: keep loading fractional, median subtraction
and intermediate precision; no universal two-decimal rounding. Proposed final
storage/display precision and factor cohorts are D04. Additive credit/source
schema and permission boundaries are documented in M00-permissions.md.

Use a named rule version such as `workbook-parity-v1` only when its dependent decisions are resolved. Record user-approved changes in DECISIONS.md and fixtures. Never retroactively reinterpret old snapshots without a new revision.
