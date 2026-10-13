# M09 — Task Tools, support splitting, duplication and carryover

Status: draft, not started. Required predecessors: M02, M03, M04, M05.

## Outcome

Make every Task Tools action a truthful, complete workflow, with transaction-safe support splits and explicit coverage of missing workbook menu variants.

## Existing code and confirmed problems

Inspect task-tools/actions.ts/components, workflows.ts, support-split.ts and supplied script bodies. Current split reduces source before new-task insert; proportional support stores a one-time value; duplicate support rows copy old URLs; weekly/day/all-team/suffix controls are absent.

## Implementation steps

1. Implement previewable Even/Uneven/Proportional/Absolute support commands for Effort and Skill, using approved bounds/status/date rules. Persist linked proportional derivation so source scale changes propagate.
2. Perform source/new task/participants/reviewers/dependency/detail/checklist changes in one authorized transaction. Guard retries, stale source versions and duplicate tags.
3. Complete single duplication plus approved weekly phases, day-count phases, all-member and number/suffix batches. Define dates/counts/tag allocation/inheritance in preview before creation.
4. Make carryover a linked task relationship across periods, with explicit progress/scale/credit policy. Preserve predecessor identity and reports; optional Drive shortcuts are queued for M10.
5. Implement bulk Done/Reopen/protected-Done behaviors with database enforcement and per-item results. Connect setup/closure/empty-checklist menu equivalents to M05 contracts, not blanket unchecked completion.
6. Separate create, collect/export tags, archive/remove-redundant and optional import. If import is in scope, implement staged validation, preview, duplicate handling and provenance; do not force historical import based only on a menu name.
7. Make Refresh Metrics a shared recompute/invalidation command that never resets date freshness. Replace raw UUID/section-key inputs with selectors and label each workflow implemented/partial/unavailable honestly.

## Data and interface contract

Batch command includes operationId, source versions, explicit inheritance and planned tag/date/scale changes. Response provides committed items or truthful atomic/per-item failure semantics decided upfront. Metadata copy, provider file copy and shared link reuse are separate policies.

## Acceptance and verification

- [ ] Source10 Even yields5+5 and any forced insert failure leaves source10.
- [ ] Proportional20% of10 gives2 without reducing source; approved linked mode changes to4 when source becomes20.
- [ ] Absolute support adds its independent scale without reducing source; Skill category isSD.
- [ ] Duplicate retries/batches do not repeat splits or collide task tags.
- [ ] Each named menu action has a verified web implementation or explicit approved deferral.
- [ ] Copies follow agreed reset/inheritance rules and never silently link a new task to another task's private folder.
- [ ] Refresh does not change task freshness or fabricate progress.

## UI / workflow integration

Use workflow cards with source selectors, preview, clear units and retryable failures. Allow review of batch item count/dates before save. Show native completion and provider jobs separately.

## Scope boundaries

Do not claim exact missing-handler semantics without user decisions. External files are handled by M10. Historical import is optional pending D12.

## Decisions and rollout

D08/D09/D12 resolve scale/batch/import choices. Validate limits and transactions in a disposable environment; a preview must match the actual committed command.

Use the shared definition of done in IMPLEMENTATION.md. Update STATUS.md with acceptance evidence, actual migration/revision, tests and limitations. Recheck predecessor contracts if their code has advanced. Planning proposals become authoritative only when confirmed in DECISIONS.md.
