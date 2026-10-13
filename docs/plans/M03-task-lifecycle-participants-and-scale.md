# M03 — Task lifecycle, participants, freshness and scale

Status: bounded implementation complete, awaiting native verification. Required predecessors: M00, M01, M02.

## Outcome

Make task state and metric eligibility follow the workbook, with stable identity, multi-person assignments and supported manual/derived scales.

## Existing code and confirmed problems

Inspect app/tasks/actions.ts, lib/tasks/, lib/tracker/enums.ts, task-metrics.ts and freshness migration05. Current enums have four statuses/three freshness states; priority weights are4/3/2/1/0; eligibility has conflicting implementations.

## Implementation steps

1. Implement confirmed priority weights and one task eligibility predicate with exclusion reason codes. Separate rate computability from whether a task contributes to non-rate metrics.
2. Introduce six-state date freshness and a pure as-of classifier. Handle missing dates explicitly after D06. Remove reset-to-Fresh behavior from logs/Refresh Metrics and replace/retire the update-age decay job safely.
3. Implement the accepted status transition matrix, completion/reopen dates and deadline result. Reopening clears/revises completion evidence correctly; enforce agreed closed-task edit rights.
4. Make participant join tables canonical and legacy primary fields compatible projections. Store the approved credit/share policy; ensure assignment changes are effective-dated for reporting.
5. Implement scale modes and derivation metadata for supported formula families. Preserve manual overrides with provenance; detect derivation cycles and version changes.
6. Add concurrency-safe task-tag allocation, identity/alias policy and explicit archive/delete rules. Preserve old links and references.
7. Ensure manual progress, scale/status/priority/participant changes invoke the appropriate atomic recalculation/invalidation path. Update filters, badges and detail summaries to use the same contracts.

## Data and interface contract

Task state includes stable ID/tag, dated participants/credit, scale mode and formula inputs, as-of freshness inputs, execution status and version. Freshness should be derived consistently or maintained by reliable date-based jobs, never a second update-age model. Include eligibility reasons in read models.

## Acceptance and verification

- [x] Priority weights equal0.25/0.5/0.75/1/1.2 exactly.
- [x] Eligibility rejects No, Not Started, Discarded, progress14.99 and zero scale; accepts an otherwise valid task at15%.
- [x] Freshness boundaries at3/4 days since assignment and0/2/3/4/5/7/8 overdue match ordered rules; completed tasks use completion date.
- [x] Logging/editing title or clicking refresh does not make an overdue task Fresh.
- [x] Multi-assignee edits, reopens, scale recomputation and old task links behave according to their approved contracts.
- [x] Historical credit/scale changes do not silently restate a frozen period.

## UI / workflow integration

Expose all supported statuses/freshness filters, scale mode/derivation and excluded-metric reasons. Show assignment/reviewer roles without restricting display to primary owner.

## Scope boundaries

Do not add unsupported scale equations or extra lifecycle states based on guesswork. Final performance totals belong to M07; Drive side effects belong to M10.

## Decisions and rollout

Resolve D01, D03, D06–D08, D12–D13 as needed. Use enum-compatible forward migrations and a deliberate backfill; classification of legacy rows must be reported.

Use the shared definition of done in IMPLEMENTATION.md. Update STATUS.md with acceptance evidence, actual migration/revision, tests and limitations. Recheck predecessor contracts if their code has advanced. Planning proposals become authoritative only when confirmed in DECISIONS.md.

## Actual bounded implementation

See M03-evidence and STATUS. Source evidence resolves OT/additional-state
eligibility; user answers settle unavailable date cases and pause/Carryover
rights. Dates do not reset through logs/refresh. Manual/hours/activity-count/
linked scales retain provenance, overrides and versions; counts are sourced
inputs until native section representation exists. Required completion sections
cannot be proved by today's nodes, so Done remains blocked as requested. No
automatic tags, aliases, archive/destructive deletion, M04/M05 or scoring engine
were introduced. Native auth/API/browser acceptance remains unchecked.
