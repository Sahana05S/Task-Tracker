# M06 — Attendance and contribution records

Status: implemented awaiting native verification on 12 October 2026. Required
predecessors M01-M05 were inspected, including exact M05 approvals in DECISIONS.
See [M06 evidence](M06-evidence.md). Both follow-up policies are approved; sales mapping/legacy provenance and native
verification remain outstanding; no production migration/deployment/M07 is authorized.

## Independent completion and remaining gates

- [x] Migrations 19-20 after preserved 01-18; schema/code/source inspection.
- [x] Active versioned attendance/support commands, safe audit, private retained
  history, actor receipts, frozen-date checks and atomic invalidation jobs.
- [x] Explicit measured attendance/off-hours, local clocks/dates, all six states,
  actual segmented effort totals and missing/legacy distinctions.
- [x] Typed source adapters with IDs/versions/attribution/period/as-of, populations
  and explicit availability/error reasons; no duplicated score engine.
- [x] Typed facts/ideas/suggestions/sales and usable Meeting Points with validation
  metadata, retained correction/history and existing approved role boundaries.
- [x] Confirmed 1.88/3.50 arithmetic and actual source-row populations; sales CRUD with
  unavailable raw mapping; meeting points excluded from factors.
- [x] Focused/full tests, typecheck/build and real PostgreSQL fresh/upgrade,
  authorization, concurrency/retry/rollback/as-of/frozen checks.
- [x] Approved daily validity, special-state rules and off-hours counted once.
- [x] Approved pending/rejected/withdrawn populations, original business-date/as-of
  credit, own pending edit/withdraw and atomic manager reviewed correction reset.
- [x] Retain the expressly approved unavailable sales mapping fallback; actual
  BN/BO/BP business-term confirmation remains unavailable. No guessed terms.
- [ ] Native Supabase authentication/PostgREST/direct API and signed-in browser
  checks. Portable PostgreSQL does not certify these.

## Outcome

Provide trustworthy attendance/report validity and dated facts, ideas, suggestions, sales and meeting records as inputs to the shared scoring model.

## Existing code and confirmed problems

Before M06, attendance/support CRUD lacked retained dated inputs, the live star
path used hours OR attendanceValid, and meeting_points had no complete route.
M06 now provides authorized commands/history and Meeting Points navigation;
the old live award path is guarded until the shared M07/M08 engine exists.

## Implementation steps

1. Implement explicit attendance-state/hour rules and the approved local date policy. Validate duration/check-in/out consistency and distinguish attendance, task effort and off-hours.
2. Implement the report-validity comparison with its exact time window and special-state policy. Return reasons for missing attendance, excessive logged hours and incompatible records.
3. Complete supporting-record flows with author, business date, content/assets, validation state/reviewer/effective date and audit history. Define pending versus rejected before scoring.
4. Map sales fields to the workbook terms, preserving original coefficients and divisor. Validate required flags/amount/count fields in typed inputs rather than relying on unchecked generic forms.
5. Complete a usable Meeting Points workflow or explicitly document an accepted navigation location. Keep meeting records out of the score unless a user-approved rule adds them.
6. Create as-of contribution queries so validation/deletion corrections do not silently rewrite locked history. Notify/invalidate affected score dates through the reliable job contract.
7. Wire all support modules to the score-input adapter contract consumed by M07, with known zero distinct from missing/error.

## Data and interface contract

Read model exposes attendanceHours, offHours, loggedHours, reportValidity/reasons and factor raw inputs with period/as-of provenance. Supporting entries have typed validation history and author permissions. A failed source query is not converted into an empty healthy dataset.

## Acceptance and verification

- [x] Attendance8 versus effort8/8.01 exercises the approved exact daily boundary.
- [x] Every attendance state has explicit measured expectations and invalid-state guards.
- [x] Unauthorized attribution/review and self-validation are denied in PostgreSQL.
- [x] Actual validated/pending populations yield1.88/3.50; rejected/withdrawn excludes.
- [ ] Sales terms mapped to actual fields: source definitions remain missing;
  the authorized unavailable-raw fallback is implemented and tested.
- [x] Original-date/effective-as-of history and frozen protections pass; HTTP(S)
  link format is checked. A URL does not establish provider success.
- [ ] Native provider/link availability verification remains M10, not a M06 pass.

## UI / workflow integration

Show separate effort and attendance totals, validity reasons, validation controls and contribution scoring status. Include meeting navigation if retained as a first-class feature.

## Scope boundaries

Do not treat attendance as a0.1 score bonus or add meeting points as an eleventh factor. No arbitrary new validation weights.

## Decisions and rollout

Resolve D02, D05, D10, D13. Preserve existing entries and expose incomplete records for correction rather than dropping them from backfills.

Use the shared definition of done in IMPLEMENTATION.md. Update STATUS.md with acceptance evidence, actual migration/revision, tests and limitations. Recheck predecessor contracts if their code has advanced. Planning proposals become authoritative only when confirmed in DECISIONS.md.
