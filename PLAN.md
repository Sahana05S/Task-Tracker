# Task Tracker implementation plan

## Goal

Make the existing TaskPulse application implement the agreed workbook model correctly, while retaining usable web workflows. The work includes numerical parity, reliable writes, database permissions, nested checklists, task tools, attendance/contributions, awards, Drive automation and reproducible reports.

Baseline: reviewed commit `8ab398181ef913086b8c39615665fd04175bd37d`; 233 unit tests and TypeScript checking passed during the audit. No database integration, provider integration or deployment-equivalence claim follows from that result.

M00 local recheck, 10 October 2026: the same commit plus existing working-tree
edits passes 233 tests, typecheck and production build. Independent inspection,
source inventory, conflict ledger and fixture draft are in
[M00 evidence](docs/plans/M00-evidence.md). Business/source/environment blockers
remain recorded, so full parity is not verified. The later M01 request approves
D03 additive shares/D13 permissions; M01 is implemented with local PostgreSQL
verification, awaiting native Supabase/auth/browser checks. See
[M01 evidence](docs/plans/M01-evidence.md). M02 independent commands are implemented with record/date safeguards; see
[M02 evidence](docs/plans/M02-evidence.md). The 12 October request approves
its retained reversal/midnight follow-up and M03; bounded implementation is in
[M03 evidence](docs/plans/M03-evidence.md). Native verification remains outstanding. The subsequent M04 request authorizes
native details/templates/initialization; see [M04 evidence](docs/plans/M04-evidence.md).
M05 is implemented with the exact approved empty/N/A and prospective switching
rules. M06 commands/history and both approved follow-up policies are implemented;
native checks remain outstanding, and sales mapping/legacy provenance are guarded.
See [M06 evidence](docs/plans/M06-evidence.md). The subsequent M07 request
authorizes shared engine/source/consumer/recomputation work; the 13 October
follow-up approves D02/D03/D04 policy activation. Native verification remains outstanding. See [M07 evidence](docs/plans/M07-evidence.md).
The subsequent 13 October request and all three approved D10 answers authorize
M08 award work and policy activation. Native verification remains outstanding;
production scheduling/rollout and M09 remain
unauthorized. See [M08 evidence](docs/plans/M08-evidence.md).

## Module breakdown and dependencies

| Module | Deliverable | Required predecessors |
| --- | --- | --- |
| [M00](docs/plans/M00-baseline-and-rule-contract.md) | Source inventory, authoritative rules and independent fixtures | None |
| [M01](docs/plans/M01-schema-and-permissions.md) | Compatible schema, database-enforced permissions, migration tests | M00; unresolved schema choices isolated |
| [M02](docs/plans/M02-atomic-commands-logs-and-timers.md) | Transactional commands, correct logs/timers, audit and retry safety | M01 |
| [M03](docs/plans/M03-task-lifecycle-participants-and-scale.md) | Lifecycle, freshness, eligibility, assignments and scale modes | M00, M01, M02 |
| [M04](docs/plans/M04-details-templates-and-creation.md) | Structured SMART/IPO data, templates, manual and automatic creation | M03 |
| [M05](docs/plans/M05-checklist-engine-and-sync.md) | N/A-aware trees, separate setup/activity/closure, linked-task sync | M02, M03, M04 |
| [M06](docs/plans/M06-attendance-and-contribution-records.md) | Valid attendance and facts/ideas/suggestions/sales/meeting records | M01, M02, M03 |
| [M07](docs/plans/M07-ten-factor-performance-engine.md) | One ten-factor median-relative score engine | M03, M05, M06; scoring decisions resolved |
| [M08](docs/plans/M08-daily-and-monthly-awards.md) | Attendance-gated daily awards and count-based monthly winner | M07 |
| [M09](docs/plans/M09-task-tools-duplication-and-carryover.md) | Safe support splits, duplication, carryover and complete tool workflows | M02, M03, M04, M05 |
| [M10](docs/plans/M10-drive-and-file-automation.md) | Actual provider-backed folder/file operations | M01, M02, M04, M09; provider configuration available |
| [M11](docs/plans/M11-dashboard-profiles-timelines-and-reports.md) | Consistent charts, profiles, timelines and live reports | M07, M08, M09 |
| [M12](docs/plans/M12-month-close-and-report-revisions.md) | Versioned close/reopen workflow and reproducible frozen reports | M02, M07, M08, M11 |
| [M13](docs/plans/M13-end-to-end-qa-and-rollout.md) | Integrated evidence, migration rehearsal and controlled release | M01–M09, M11, M12; M10 when included in release |

## Recommended execution order

M00 → M01 → M02 → M03 → M04 → M05 → M06 → M07 → M08 → M09 → M11 → M12 → M13.

M10 is a separate integration track after its prerequisites. Include it before final full-parity signoff; a core-correctness release can ship earlier with Drive operations explicitly marked unavailable. No promise of completion dates or durations is made in this draft.

## Release boundaries

1. **Data integrity baseline:** M00–M03. Close permission gaps, partial-write risks and incorrect lifecycle rules. This does not yet certify performance scores.
2. **Workbook scoring parity:** M04–M08. Validate details/checklists, attendance/contributions, ten factors and awards. Switch production scoring only after independent fixtures pass.
3. **Operational parity:** M09, M11, M12. Complete task workflows, coherent presentation and month-close history.
4. **External automation:** M10. Real Drive actions and verified retry/recovery behavior; distinguish native checklist state from any external spreadsheet copy.
5. **Acceptance and rollout:** M13. Verify the exact deployed revision, database migration state and jobs; carry forward any explicitly deferred feature as a limitation.

## Coverage map

| Workbook concern | Owner |
| --- | --- |
| Sheet attributes, enums, thresholds and rule documentation | M00, M03 |
| Main task register and task timelines | M03, M11 |
| Individual task pages, SMART, IPO and templates | M04 |
| Master checklist workbook | M05 |
| Edit log, timers and daily task logs | M02 |
| Attendance and report validity | M06 |
| Facts, ideas, suggestions, sales and meeting points | M06 |
| Summary/analysis and performance subscores | M07 |
| Daily performance log, team index and awards | M08, M11 |
| Weekly/day-count/all-member/suffix duplication | M09 |
| Eight effort/skill support variants and carryover | M09 |
| Work folders, templates, blank files and rename | M10 |
| Dashboard, employee charts and report compilation | M11 |
| Period close, report freezes and revisions | M12 |
| Vision/mission/values and milestones | Preserve existing; regression checks M13 |

## Scope controls

Keep the current application; do not rewrite from scratch. Existing database records must remain readable and migrations must preserve their identity. A live-system backfill is distinct from importing historical workbook data. Historical workbook import is a decision, not a prerequisite imposed by this plan.

Keep reference formulas and app rule changes traceable. Reconcile conflicting old documentation in M00. Add no extra scoring component or changed coefficient without a recorded user decision. A UI button and a backend side effect require separate acceptance evidence.

## Completion gate

Every module needs demonstrated behavior, focused regression coverage, applicable database checks and a status entry. Full parity additionally needs all workbook menu actions mapped to implemented behavior or explicitly accepted deferral; every score component reconciles across surfaces; archived history remains reproducible; providers/jobs work in their configured environments.


## M05 current implementation ? 12 October 2026

The M05 request and follow-up approvals authorize bounded checklist semantics.
Migration18 plus its app callers replace the earlier Done/sync dependency guards
with explicit Setup/Activity/Closure evidence, current reviews and atomic graph
commands. New checklists default manual; managers review section initialization,
preview and reason before ownership switches. Prior credit/captured scale/shares
and frozen reports remain intact; later checklist effects are prospective.

See docs/plans/M05-evidence.md and STATUS.md for exact checks and reconciliation.
Native Supabase auth/API/browser and deployed data remain unverified. M06, scoring,
provider execution, production migrations and deployment remain outside scope.

## M09 independent implementation - 13 October 2026

The current M09 request authorizes the native framework and verification in
[migration24](supabase/migrations/24_task_tools_atomic_previews.sql). Production
policy remains NULL. Durable previews, actor-bound operation receipts, locked
source fingerprints and atomic rollback build on M02 through M05. Single approved
lifecycle/section/refresh commands are available; draft copies/batches and dated
handoff/archive require D09/D12 answers. No original-handler equivalence is
claimed for 22 missing bodies, or provider parity for native-only tools. See
[workflow inventory](docs/plans/M09-menu-coverage.md) and
[evidence](docs/plans/M09-evidence.md). No M10/M11 or rollout is authorized.

## M09 follow-up approvals - 13 October 2026

The user answered all three M09 questions: "Approve recommended bounds and copy
defaults", "Approve calendar phases and atomic batches", and "Approve remaining-
work handoff, archive and import deferral". This expressly supersedes the earlier
M09 pending-policy notes, but does not authorize production apply/deploy, Drive
operations, M10/M11 or a scoring/award formula change. Forward25 activates the
exact D09/D12 contract after24; the earlier draft tests remain historical evidence.

M09 is implemented awaiting native verification with migrations24-25. Exact
approved defaults are in DECISIONS, independent source results and checks in
M09-evidence, and all34 actions in M09-menu-coverage. Historical import is user-
deferred; missing source/provider parity remains explicit. Do not activate by
editing24;25 supplies the approved write/observation/dated population safeguards.
No M10/M11 or production rollout is authorized.

## M10 independent implementation - 13 October 2026

The subsequent M10 pasted request supersedes historical no-M10 boundaries.
Forward26 reuses the outbox for provider jobs and verified assets, with typed
server auth/API/recovery and distinct UI workflows. Independent tests passed;
D11 and sandbox/native/provider verification remain open. No default policy or
worker was activated. See docs/plans/M10-evidence.md and M10-configuration.md.
No production changes or M11.


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

## M11 current state — 13 October 2026

The separately authorized M11 has been implemented in code with forward migration
28. It awaits native signed-in browser/API verification; no rollout or M12 work
has begun. See `docs/plans/STATUS.md`, `M11-evidence.md` and
`M11-view-coverage.md`. M10 provider integration remains deferred by the user.

## M12 current state — 13 October 2026

The subsequent M12 request and two follow-up answers authorize immutable month
archives and narrowly scoped corrections. Forward migration 29 and report/export
selection are implemented in the local workspace, with disposable PostgreSQL and
app regression checks. Certified close is unavailable while sales/history inputs
are missing, and native Supabase/browser verification remains outstanding. See
`docs/plans/M12-evidence.md`. No production apply, deployment, Drive operation,
worker activation or M13 work occurred. Earlier “no M12” statements are historical.
