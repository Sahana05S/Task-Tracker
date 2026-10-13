# M05 — Checklist rollups, N/A and linked-task propagation

Status: implemented awaiting native verification. Required predecessors: M02, M03, M04.

The 12 October 2026 request and both follow-up approvals supersede the earlier
proposal. See [completion evidence](M05-evidence.md), DECISIONS and STATUS.

## Outcome

Reproduce the master-checklist semantics with safe nested rollups and independently tracked Setup, Activity and Closure.

## Existing code and confirmed problems

lib/checklists/progress.ts averages all roots and has no N/A; rootless data returnsNaN. sync.ts updates task progress without productivity recalculation. Task-detail calculation supports linked percentages but stars/daily.ts omits them.

## Implementation steps

1. Add explicit section role and item applicability/state. Preserve old boolean item values through conversion. Represent unknown/not-initialized separately from a deliberate all-N/A section.
2. Implement one rollup function that averages applicable direct children at each level, excludes N/A and uses the agreed linked-task percentage/completion contract.
3. Return separate section progress/state and activity task progress. Apply agreed setup/closure/reviewer gates to lifecycle rather than inferring Closed from one global percentage.
4. Reject parent links across checklists, self-links, ancestor cycles and task-to-checklist dependency cycles. Define missing/deleted linked-task handling; prevent recursion failures and silent discarded nodes.
5. Make propagation deterministic for shared subtasks and multiple parents. Process dependencies in valid order; visited-set protection alone must not hide a cycle or stale shared-parent result.
6. Update task progress and all affected derived metrics atomically or through a versioned reliable command/job. Distinguish checklist-owned progress from manual mode and avoid two writers fighting.
7. Use the same checklist read model in task details, awards, reports and tools. Provide templates and independent setup/closure update actions; do not globally auto-complete applicable work.

## Data and interface contract

Rollup result: setupProgress/state, activityProgress/state, closureProgress/state, taskProgress, data-quality errors and calculation version. LinkedTaskSnapshot includes the agreed as-of progress/status. N/A and graph constraints are database-backed.

## Acceptance and verification

- [x] Applicable leaves100,0,N/A yield50; N/A is absent from the denominator.
- [x] Two direct groups at100 and0 yield50 regardless of their different leaf counts.
- [x] Setup0, Activity80, Closure0 yields task progress80, not26.67.
- [x] A missing/cyclic/rootless structure returns a typed error or approved safe state, neverNaN or infinite recursion.
- [x] Linked complete/progress disagreement is prevented or resolved according to D07 and tested.
- [x] Changing a shared child refreshes all parents without stale productivity; ordinary assignee permissions remain enforced.
- [x] Task details, daily award and reports return identical checklist values for the same inputs.

## UI / workflow integration

Provide Yes/No/N/A controls, three section summaries, linked-task selector and clear sync mode. Retain native template creation and remove inconsistent default sync settings.

## Scope boundaries

Do not average Setup/Closure into task progress or flatten nested leaf weights. External Google Sheets copies are not canonical unless explicitly agreed in D11.

## Decisions and rollout

D07 decides empty/all-N/A and Done semantics; D11 decides native versus external authority. Migrate with a preview mapping old roots to section roles; do not assign roles solely by fragile free-text titles.

Use the shared definition of done in IMPLEMENTATION.md. Update STATUS.md with acceptance evidence, actual migration/revision, tests and limitations. Recheck predecessor contracts if their code has advanced. Planning proposals become authoritative only when confirmed in DECISIONS.md.


## Remaining verification

- [ ] Native Supabase authentication/PostgREST and signed-in browser workflows.
- [ ] Actual environment migration history/grants and production reconciliation.

Local PostgreSQL uses an auth-subject shim; it does not satisfy the native check.
Independent rollups, graph/permission/transaction checks are recorded in evidence.
No production apply, rollout, scoring or M06 is part of this module.
