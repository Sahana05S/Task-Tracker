# Implementation workflow and architecture

## How the Markdown files work together

PLAN.md is the roadmap. RULES.md is the calculation contract. DECISIONS.md is the decision log. Module plans define bounded implementation work. STATUS.md is the evidence and handoff record. AGENTS.md tells Codex to use these files consistently.

Do not use a single long chat as the only specification. At the start of each module, read its plan and status. At completion, update the files so the next Codex session can continue without guessing.

## Module workflow

1. Check the current branch, commit, working tree, dependencies and actual migration sequence. Preserve unrelated modifications. Read applicable AGENTS.md files.
2. Read the rule contract, required predecessor evidence, and affected source files. Reconfirm baseline findings if the code has changed.
3. List module acceptance cases and affected decisions. Implement independent work while blocking only the ambiguous behavior.
4. Introduce additive schema changes first when needed, with compatibility reads/backfills. Migrate existing rows deliberately; never silently discard values because the old model differs.
5. Implement database commands and pure calculations before attaching UI controls. Add independent expected-result tests and real database tests for transaction/RLS behavior.
6. Connect server actions and components to those contracts. Remove duplicate calculations only after their replacements are wired everywhere.
7. Run focused tests, typecheck and relevant build checks. Exercise the workflow in a test environment under more than one role. Record failures and missing infrastructure honestly.
8. Review the diff for scope, security, units, migration compatibility and inaccessible UI controls. Update docs and status with evidence and any remaining blocker.

## Proposed architecture

Keep Next.js App Router, Supabase/PostgreSQL, the existing design system and Recharts. The paths below are proposed ownership boundaries, not a mandate to move working files just for aesthetics.

| Layer | Responsibilities |
| --- | --- |
| `lib/domain/` or compatible existing modules | Units, lifecycle, eligibility, scale, checklist and scoring contracts; side-effect-free functions. |
| PostgreSQL functions / transactional service commands | Authorized writes, row locking, unique constraints, event/audit insertion, idempotency. |
| `lib/analytics/` | Shared calculation inputs/outputs and period-aware source queries. |
| `lib/checklists/` | Rollups and propagation using the agreed setup/activity/closure model. |
| `lib/stars/` | Award selection from the shared engine, persisted daily runs and monthly counts. |
| `lib/integrations/drive/` plus worker/Edge Function | Provider requests, credential lifecycle, durable jobs and retries. |
| Server actions | Parse input, resolve identity, call one authorized command, return typed result, revalidate affected views. |
| Components/routes | Render domain outputs and actionable errors; do not independently calculate scores. |

## Units and numerical precision

Use explicit names such as `progressPercent`, `loadingFraction`, `scaledProgress`, `attendanceHours` and `taskProgressPointsPerHour`. PostgreSQL NUMERIC precision and TypeScript rounding must be documented together. Two-decimal rounding is inappropriate for every intermediate: a 40× loading difference term can change materially if loading is rounded first. Preserve precise intermediate values; format at display boundaries. Avoid persisting the same derived value independently in multiple places without a reliable recomputation contract.

## Database migration strategy

- Audit fresh install and upgrade from the reviewed migration sequence, including any changes that have since landed.
- Expand schema and deploy compatible reads/writes, backfill with a dry-run report, verify counts/references, then enforce constraints and retire legacy fields later.
- Every backfill must be rerunnable with a version and a reconciliation summary. Preserve old enum values until conversion and older-client compatibility are handled.
- Protect generated columns and controlled fields. Verify real column/RPC privileges in addition to RLS row predicates.
- For enum/type changes, account for transaction restrictions and deployment order; test the actual PostgreSQL version used by the project.
- Existing archives/snapshots are not automatically recalculated under new rules. Preserve them with their old version or explicitly create a new revision.

## Transaction and retry contract

All dependent database writes commit or roll back together. Acquire locks in consistent order. Each retryable user command has an idempotency key scoped to actor/operation; retries return the prior result instead of duplicating task/log/award records. Reject conflicting versions with a recoverable message. Provider calls cannot be in a database transaction: use an outbox/job record and replay-safe provider identifiers.

## Validation and evidence

M08 selects from M07 results without another score formula. Migration22 retains
all candidate/run/override evidence and scopes director requests and service
commits to `award_command`. Source versions, leases, receipts, invalidation and
safe audit are atomic. The sandbox endpoint is disabled by default; code is not
native delivery evidence. The 13 October D10 approvals are active in forward23:
MTD/end-of-day/day attendance gates, exact no-winner ties and eligible reasoned
director overrides replacing counts, with reaffirmation after corrections. Legacy
winner rows remain uncertified and never become employee daily score points.

M07 uses `lib/performance/` for the sole composite engine and source/report/award
adapter contract. Exact values persist as numerator/denominator strings; numeric
fields are compatibility projections. The 13 October approved D02/D03/D04
policy uses period earnings, as-of tasks, normalized/captured shares and
known-value active cohorts. Exact factor display is six decimals; composite
display is two, half-away from zero. Fixture inputs remain synthetic evidence.
Migration21 records observed source history and narrow outbox recomputation;
fresh reads never substitute a stale score cache. Frozen legacy rows are retained.
Native worker/API/browser delivery remains separate verification. See M07 evidence.

M06 approved input contracts are `m06-attendance-inputs-v2` and
`m06-support-inputs-v2`; migration 20 supersedes the guarded v1 adapters. They expose source IDs/versions, attribution, period,
as-of instant, history cutoff and explicit unavailable reasons. Their versions
identify source preparation, not an approved scoring engine. Immutable full
snapshots are private; audit events contain only safe change metadata.
`tools/test_m06_database.py` rehearses migrations 01-20 and 01-18 to 19-20 on
loopback disposable PostgreSQL. Its JWT-subject shim does not certify native
Supabase authentication, PostgREST or signed-in browser behavior. See
[M06 evidence](docs/plans/M06-evidence.md) for results and remaining sales/provenance/native gates. Source invalidation
outbox event v1 retains its payload; approved calculation inputs are v2.

M00 fixtures are documentation artifacts in `docs/plans/fixtures/`, checked by
`python docs/plans/tools/verify_fixtures.py`. The verifier imports no application
code and validates hand-authored expected arithmetic and boundary cases only.
Later implementation tests must consume these expected values through the
real domain/SQL adapter and report conformance separately. Blocked cases carry
decision IDs and null expected results. Do not count them as passed.

M00 proposes Playwright for later browser coverage because no browser harness
exists today. No browser dependency or production command was added in M00.
The contract identifier `m00-contract-draft-2026-10-10` is a planning version;
it must never be persisted as an approved production scoring version.

Use the existing Vitest suite for unit regressions. Add PostgreSQL/Supabase integration tests for authorization and multi-write behavior, and browser end-to-end tests for representative role workflows. Select the browser test framework based on repository support in M00; do not claim it already exists.

Default local checks: `npm ci`, `npm test`, `npm run typecheck`, and `npm run build` with documented safe build configuration. Run focused tests during implementation, then the required suite at module completion. A missing database, provider sandbox or environment variable is an unperformed check, not a pass. Never put production secrets in test fixtures.

Evidence per module: revision, changed areas, migration names, acceptance IDs, commands/results, UI result if relevant, unresolved decisions and environment limitations. Keep the evidence concise and reproducible.

## Shared definition of done

- Acceptance criteria demonstrate the requested behavior and affected regression paths.
- Business rules are not silently replaced by current code or improvised defaults.
- Database authorization and retry/failure behavior are checked where writes changed.
- Current and historical periods reconcile in matching units; missing data is distinguished from measured zero.
- Documentation and status reflect the implementation, rather than claiming every advertised feature is complete.
- Deployment effects and remaining operational setup are stated clearly.

## M01 handoff boundary

Migrations 10-11 and application command integration implement only approved
permissions/additive shares. Existing tasks remain legacy; no historical credit
or snapshot backfill is automatic. Share units use exact integers, independently
of undecided score precision. Legacy score formulas remain provisional, not the
ten-factor target. M02/M05/M09 still own general log/timer/sync/split/content-copy
transactions. Terminal/daily shared-credit and logged redistribution safeguards
are temporary blockers for unresolved decisions. Coordinate the new app and
10-11 rollout: old direct participant/metric write paths will be denied by the
new boundary. Rehearse native Supabase/auth/browser behavior before release;
production application and deployment remain unauthorized.


## M02 handoff boundary

Migrations 12-13 supersede M01 direct execution writes and its logged-share gate.
Roll out application command callers and these migrations together after native
sandbox rehearsal. No production rollout is authorized. New logs distinguish
requested from effective progress; old effects remain unknown until authorized
reconciliation. Current credit is anchored to the M01 reading, then maintained
prospectively; this is not a reconstructed historical scoring dataset. Source
versions retain original shares/scale for corrections. Recompute and invalidation
are in the source transaction; outbox processing remains M05/M07/M10 work.
Log reversal and ambiguous timer date attribution remain explicit policy blockers.
Terminal/checklist propagation and logged scale changes retain safeguards until
M03/M05/D08 supply reliable contracts. Native auth/API/browser checks are still
required; local PostgreSQL is separate evidence. See M02-evidence and STATUS.

## M03 handoff boundary - 12 October 2026

Forward migrations14/15/16 implement approved M02 policies and the bounded M03
contract. Apply enum expansion15 in a committed step before16; rehearse schema
and compatible application together in a native sandbox. No production apply/
deploy is authorized. New task fields/read lists, versioned task/review commands,
expanded NUMERIC precision and segment indexes require coordinated rollout.
Run the read-only preflight before12 on older installations; unresolved legacy
duplicates/effects are retained and blocked, never automatically repaired.
Legacy scales retain manual provenance; new derivation metadata is prospective.
Stable UUIDs/tags and primary projections remain. Activity counts are explicit
sourced inputs until M05, not averages/counts of the old unsectioned checklist.
Done remains guarded. Calendar worker uses the same service-only public RPC;
repository/disposable verification does not prove a deployed job was replaced.
M04/M05/M07 and provider/scoring activation are not authorized by this work.

## M04 handoff boundary - 12 October 2026

Migration17 and its application callers require coordinated native sandbox
rehearsal. Task saves now accept template preference/initialization mode and call
the shared native initializer after valid participant writes in the same
transaction. Details/assets/relationships use versioned manager commands; old
direct writes are denied. Public task identities and report permissions survive.

Template publication creates immutable versions; existing instances retain their
instruction snapshot/content/checklist independently. Legacy native templates are
snapshotted with their original unsectioned nodes pending review. Meaningful
section content is retained, unambiguous IPO fields fill only empty destinations,
and conflicts/aggregate free text remain review flags. This does not reconstruct
missing spreadsheet dialogs/triggers or import workbook examples. Native event
outbox rows are separate from provider requests; M04 queues no Drive jobs. Done,
checklist synchronization, advanced duplication and report revisions retain their
later-module guards. Native Supabase/auth/API/browser checks remain outstanding;
no production apply/deploy or M05 implementation is authorized by M04.


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

## M10 external transaction boundary - 13 October 2026

Provider requests join native initialization atomically in the existing outbox.
Remote calls occur outside transactions, preceded by persisted intent, followed
by metadata verification. Identities/reservations and resource leases fence
replays; uncertain native responses require read-only reconciliation. Partial
creation and sharing remain separate evidence. D11 is unapproved and policy NULL.
See docs/plans/M10-evidence.md for exact checks and real-provider limitations.


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

## M11 implementation boundary — 13 October 2026

The subsequent M11 request supersedes the older handoff sentence above. The
single M07 calculation result now feeds M11 surfaces and report exports. M08
remains the sole award policy. Migration 28 is forward-only, unapplied outside
disposable test databases. Consult `docs/plans/M11-evidence.md` for tests,
permission scope, open verification and M10/M12 boundaries.

## M12 implementation boundary — 13 October 2026

The user authorized M12 after M11 and approved non-certified incomplete close
and named-record/exact-date correction scope. Migration 29 introduces immutable
revision evidence, actor/version/idempotency commands and closed-source guards;
the report selector and exports read a chosen retained revision. Missing M07/M08
evidence remains visibly unavailable. See `docs/plans/M12-evidence.md` for
disposable tests, native verification gaps and recovery. No production migration,
deployment, schedule, Drive operation or M13 work is authorized.
