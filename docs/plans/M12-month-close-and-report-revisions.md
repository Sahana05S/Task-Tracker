# M12 — Month close, snapshots and report revisions

Status: draft, not started. Required predecessors: M02, M07, M08, M11.

## Outcome

Make closed-period reports reproducible and preserve original evidence when late corrections require a new revision.

## Existing code and confirmed problems

app/dashboard/actions.ts calls an upsert keyed by user/month/year, so Freeze can overwrite old values. Snapshot payload lacks the complete ten-factor context. Current records and new scale/assignment states can change reconstructed history.

## Implementation steps

1. Define period lifecycle and authorized close/reopen/revision commands. Decide which source edits are locked versus recorded as late corrections, using D13.
2. Store immutable close revisions with ruleVersion, asOf/cutoff, exact calculation inputs or immutable source references, cohorts/medians/components, award counts/winners and data-quality state.
3. Close all member/report/award rows for a revision in one transaction. Idempotent close returns the prior revision; concurrent close/edit must not produce a mixed snapshot.
4. Late corrections create an audited reopen/new revision workflow; retain the original report and show differences. Do not overwrite historical results with an upsert.
5. Make reports choose live or frozen revision explicitly. Preserve old-model snapshots with a legacy rule label rather than presenting them as new-model results.
6. Add reconciliation/export and recovery behavior for incomplete legacy snapshots. Document restoration from backup and tested forward correction paths.
7. Ensure recomputation jobs honor closed state and revision IDs, including scheduled daily awards and provider-linked changes.

## Data and interface contract

PeriodRevision identifies organization/period/revision, status, cutoff, ruleVersion, actor, timestamps, source watermark/checksum and reason. Member snapshots contain all ten raw/median/delta/coefficient/contribution values and award evidence. Exact storage layout follows tested volume needs.

## Acceptance and verification

- [ ] Rerunning close cannot overwrite an existing closed revision.
- [ ] Editing live scale/logs after close does not change that revision's report.
- [ ] Authorized correction creates revision2 with reason/diff while revision1 remains readable.
- [ ] Unauthorized reopen/closed-period write is rejected at database level.
- [ ] Concurrent close and correction produces one consistent revision or a clear conflict.
- [ ] Exports reproduce archived totals, medians and award counts independently.

## UI / workflow integration

Rename misleading Freeze action if it remains a refreshable draft. Present Close Month, revision history and authorized correction controls with clear live/frozen labels.

## Scope boundaries

Do not silently recalculate old snapshots under the new formula or block all routine work because one period is closed. Define scope-specific locking.

## Decisions and rollout

Resolve D13; prepare a legacy-snapshot migration report. Validate close/reopen in a disposable database and document recovery before production use.

Use the shared definition of done in IMPLEMENTATION.md. Update STATUS.md with acceptance evidence, actual migration/revision, tests and limitations. Recheck predecessor contracts if their code has advanced. Planning proposals become authoritative only when confirmed in DECISIONS.md.
