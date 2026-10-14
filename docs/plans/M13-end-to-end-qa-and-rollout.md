# M13 — End-to-end acceptance and release

14 October hosted update: a signed-in local browser against the isolated test
project now renders desktop task/detail/checklist/dashboard/reports and the
mobile task list. Real Auth/API checks and a fresh 01–29 hosted install passed.
The dashboard/report near-now clock error was corrected and retested; see
[M13 evidence](M13-evidence.md). Full workflows, workers, hosted upgrade/restore
and certified scores remain open, so M13 is not complete.

Hosted test update (13 October 2026): the distinct `TaskPulse M13 Test`
project now has a fresh 01–29 install and a partial native GoTrue/PostgREST
synthetic journey. [M13 evidence](M13-evidence.md) lists the exact passing
cases and remaining browser, worker, upgrade and business-source gates. The
older “native environment unavailable” statements in this plan and its
linked release documents describe the pre-hosted baseline.

Status: release preparation completed 13 October 2026; end-to-end acceptance
incomplete. Required predecessors: M01–M09, M11, M12; M10 for full external
parity is explicitly user-deferred. See [M13 evidence](M13-evidence.md),
[readiness matrix](RELEASE-READINESS.md), [runbook](RELEASE-RUNBOOK.md) and
[operator guide](../OPERATIONS.md). The historical plan below remains the
acceptance checklist; unchecked items have not been promoted by local tests.

## Outcome

Prove the integrated system matches accepted rules, then release with verified migrations, jobs, provider configuration and rollback/recovery evidence.

## Existing code and confirmed problems

The audited repository has233 passing unit tests, but no demonstrated workbook parity, live RLS integration checks, exact deployment mapping or nonzero end-to-end award/report evidence.

## Implementation steps

1. Create a non-private test organization with director, engineer, data manager, reviewer, active/inactive members, shared tasks, N/A/nested checklists and meaningful attendance/contributions.
2. Run ACCEPTANCE.md numerical/source fixtures, actual database permission tests, concurrency/rollback/idempotency tests and browser workflows across modules.
3. Exercise a full lifecycle: valid task creation, native template, checklist work, timer/logs, attendance, validation, support split, daily award, report and month close/revision.
4. Rehearse migration from reviewed legacy schema and existing-style records; verify dry-run counts, enum/key conversions, participant credit, scale and snapshot labeling. Back up/recovery-test before production changes.
5. For M10, execute real provider sandbox tests and failure recovery; for schedulers verify timezone, credentials, repeatability and last-success monitoring.
6. Verify production build configuration, routes and deployment revision mapping. Add automated CI checks appropriate to unit/DB/browser layers without relying on production credentials.
7. Release in the agreed stages, check known live mismatches after deployment, and monitor invalid data, stale recomputations, failed jobs and award/report discrepancies.
8. Finalize user documentation, source traceability and a completion/deferral report. Any unavailable provider/source/job test remains an explicit release limitation.

## Data and interface contract

Acceptance evidence identifies tested revision, database migration state, fixture/rule version, environment and results. Deployment runbook includes backup, forward migration, smoke checks, rollback/recovery and ownership for scheduled/provider jobs.

## Acceptance and verification

- [ ] All accepted numerical cases and cross-surface reconciliations pass.
- [ ] Real member/director/inactive/anonymous DB permissions behave correctly.
- [ ] Concurrency, duplicate retries and injected failures preserve task scale/progress/log/award/report integrity.
- [ ] Freshness shows Rotten for an otherwise valid task13 days overdue and not within the3-day assignment override.
- [ ] Not Started tasks are excluded consistently from score metrics.
- [ ] Core release identifies any deferred Drive operation; full-parity release verifies real provider actions.
- [ ] The exact deployed revision and applied migrations are recorded, with no unexplained UI/code mismatch.
- [ ] Existing landing, milestones, filters and unrelated workflows pass regression smoke checks.

## UI / workflow integration

Perform browser checks at desktop/mobile widths, using seeded nonzero records and representative roles. Give users concise operational documentation for corrections, invalid attendance and job failures.

## Scope boundaries

No unsupported completion percentage or universal reliability claim. Do not treat233 old passing tests as final acceptance.

## Decisions and rollout

All decisions affecting shipped behavior must be confirmed or explicitly scoped out. Apply/publish production changes only within the user's authorization; planning this runbook does not itself deploy anything.

Use the shared definition of done in IMPLEMENTATION.md. Update STATUS.md with acceptance evidence, actual migration/revision, tests and limitations. Recheck predecessor contracts if their code has advanced. Planning proposals become authoritative only when confirmed in DECISIONS.md.
