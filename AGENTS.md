# Task Tracker project instructions

## Code layout - modules (refactor completed 18 October 2026)

The user asked for a modular codebase (facade per module, one short branch per
change). The refactor is complete on `refactor/base` (not yet merged into
`main`). Follow `docs/ARCHITECTURE.md`:

- Code lives in `app/` (routing only), `modules/<name>/` and `shared/`. There is
  no `lib/` or `components/` any more; do not recreate them.
- Other code uses only a module's public files (`index.ts`, `client.ts`,
  `*actions.ts`, `components/`), never `internal/`. Client components and pure
  helpers import `client.ts`. Each module's README lists its public API and the
  tables/RPCs it owns; update it when either changes.
- Pages, routes and components never call `.from()`/`.rpc()`; data access
  belongs in a module's `internal/`.
- New work: put it in the owning module (start from `modules/_template/`), on a
  short branch named after the module. `__tests__/architecture/boundaries.test.ts`
  must pass.

## M15 multi-company direction - 17 October 2026

The user wants to sell TaskPulse to other companies. They approved one shared
database with enforced company separation, the same rules with per-company
settings, platform-owner onboarding, and Saahithyaa as company #1. See
`docs/plans/M15-multi-company.md` and DECISIONS. Production work now goes
through M15.6.

On 17 October 2026 the user authorized M15.1 (tenancy foundation) and said
early customers will be in India, so Asia/Kolkata stays fixed for launch.
Forward migration 39 is applied only to disposable databases and the M13 test
project; see `docs/plans/M15-evidence.md`. Later M15 phases (M15.2 onward) need
the user's go-ahead. Until M15.2 lands, SECURITY DEFINER commands still read
across companies, so no second real company may be onboarded.

M15.2 (migration 40) closes that gap: tables and commands are owned by the
non-bypass role `taskpulse_definer`, with FORCE RLS scoped by
`taskpulse_private.m15_scope()`. **Every new migration must end with
`SELECT taskpulse_private.m15_secure();`**, so new tables and functions are
re-owned and scoped. New company-owned tables need an `organization_id`
column. Workers must send each job's company in the `x-taskpulse-organization`
header (`shared/supabase/worker.ts`). See `docs/plans/M15-evidence.md`.

## M14 nested checklist pages — 16 October 2026

The user asked for every feature of their Google Sheets tracker. They approved
nested checklist pages (pages, not separate tasks), assignee-built checklists,
and per-row links and estimates. See DECISIONS "M14 nested checklist pages"
and `docs/plans/M14-evidence.md`. Item timers save ordinary task logs tagged
with the item (user decision). Migrations 33-34 are applied only to disposable
databases and the M13 test project. Production migrations and deployment
remain unauthorized.

## Superseding M13 authorization — 13 October 2026

The user's subsequent pasted M13 request authorizes integrated acceptance,
disposable test-environment work and release preparation, superseding the older
no-M13 line below. Read `docs/plans/M13-evidence.md`,
`docs/plans/RELEASE-READINESS.md`, `docs/plans/RELEASE-RUNBOOK.md` and STATUS for
the actual checks and outstanding gates. No production migrations, deployment,
worker activation, Drive integration or historical import are authorized.
Native Supabase/auth/browser verification and real scoring certification remain
outstanding until their identified environment/source blockers are resolved.

## Current M11 authorization (13 October 2026)

The user's subsequent M06–M11 requests supersede the older module stop line
below. M11 dashboard/profile/timeline/live-report work is implemented awaiting
native verification; read `docs/plans/M11-evidence.md`,
`docs/plans/M11-view-coverage.md` and STATUS.md for the exact current boundary.
Migration 28 is forward only and has run only in disposable databases. M10 real
Google Drive integration remains explicitly deferred by the user; M12, provider
operations, production migrations and deployment remain outside authorization.
Preserve the recorded M07/M08 rules and earlier user edits.

## Current module authorization (13 October 2026)

The planning files are now at the repository root and `docs/plans/`. Read
`docs/plans/M00-evidence.md` and `docs/plans/STATUS.md` before continuing.
README business-formula sections and historical steering/spec instructions are
superseded where listed in the M00 conflict ledger. Preserve useful unrelated
documentation and pre-existing user edits. Synthetic M00 fixture verification
does not certify application conformance. The user's subsequent pasted request
authorizes M01; the subsequent M02 pasted request authorizes atomic log/timer
commands and disposable-database testing. The 12 October request additionally
authorizes retained reversals, Asia/Kolkata timer segments and M03 lifecycle/
freshness/scale work, with the recorded follow-up answers, including new log
credit at its recomputed scale. The subsequent M04 pasted request authorizes
canonical native details, versioned templates and both initialization paths.
The subsequent M05 pasted request and both follow-up answers authorize bounded checklist rollups, N/A, propagation and completion gates. The subsequent M06 pasted request authorizes attendance, supporting-record commands/history and typed dated inputs. Both M06 follow-up answers approve daily validity, pending contribution credit with source-date/as-of treatment and reasoned correction rights. See the exact approvals in DECISIONS.md and M06-evidence.md; sales mapping and legacy provenance remain unavailable. Do not apply production migrations, deploy, start M07 or perform Drive operations. Read the approved D03/D13 entries
in DECISIONS.md; partial approval does not settle other attribution rules.

The subsequent M07 pasted request authorizes the shared ten-factor engine,
source histories, score consumers and bounded recomputation. It supersedes the
earlier no-M07 instruction. The 13 October follow-up approves D02 period earnings/as-of tasks, D03 normalized/captured completion shares and D04 known-value cohorts/exact arithmetic with six-decimal factors/two-decimal score display. See DECISIONS for exact scope. Do not apply production migrations,
deploy, start M08 or perform Drive operations. See M07-evidence.md and STATUS.

## Read before implementation

The subsequent 13 October M08 request authorizes independent award selection,
atomic commands, retained candidate evidence and sandbox worker integration. It
supersedes earlier no-M08 instructions. M07's exact approvals remain unchanged;
D10 daily MTD/end-of-day/participation/report gates, no-winner exact ties and
director eligible override/count replacement with reaffirmation after corrections
are approved in the subsequent 13 October reply. Forward23 activates them after22;
sales/history completeness and native verification retain safeguards. No production
apply/deploy/scheduling, M09, Drive operations or M12 workflow.

Read `PLAN.md`, `IMPLEMENTATION.md`, `docs/plans/RULES.md`, `docs/plans/DECISIONS.md`, `docs/plans/STATUS.md`, and the active module plan. Apply any narrower AGENTS.md instructions in directories you change. User instructions take precedence.

This is an existing Next.js/Supabase app. Improve it incrementally. Complete the module the user has selected; do not silently expand a single-module task into the entire roadmap.

## Source of business truth

- Explicit user decisions outrank existing code, README formulas and old generated specs.
- Confirmed workbook/script rules and their approved corrections are in RULES.md. Do not retain the current four-term dashboard or five-term daily-star formulas as the target model.
- All ten performance factors are median-relative differences. Do not substitute a different weighting system, percentage deviation, percentile or z-score.
- Preserve the distinction between task productivity and employee productivity, 0–100 progress and 0–1 loading, setup/activity/closure, and manual/derived scale.
- Treat undecided behavior as an explicit decision, not an invitation to invent a formula. Mark the affected acceptance criteria blocked and proceed with unrelated work.

## Implementation rules

- Preserve unrelated behavior and the public landing page. Reuse the current stack and compatible components.
- Use new forward migrations after the latest migration actually present. Do not rewrite migrations already applied to any environment.
- Enforce permissions in PostgreSQL/RPCs, not only hidden buttons or server-action checks. Reject inactive users at the actual write boundary.
- Critical related database writes must commit together. Use row locks/version checks and idempotency for logs, splits, assignments, awards and month revisions.
- PostgreSQL and TypeScript must agree on business units and rounding. Keep meaningful intermediate precision; round for storage/display according to the rule contract.
- Use one domain calculation contract across dashboards, awards, profiles, reports and snapshots. A second independent scoring formula is not acceptable.
- Expose provider job failures and missing inputs as such. Do not render them as healthy zero values or successful automation.
- Never represent saving a URL as creating or renaming the actual Drive file/folder.
- Keep tokens/credentials server-side; do not print secrets or put them in documentation, fixtures, commits or client bundles.
- Treat existing tests as regression coverage, not authoritative business specifications. Replace assertions only when a confirmed rule changes, and add independent expected-result cases.
- Do not make unrelated dependency upgrades, mass formatting changes or cosmetic redesigns.

## Finish each module

Run the focused tests, `npm run typecheck`, and a production build when the changed code affects build/runtime behavior. For database changes run fresh-install, upgrade, authorization and rollback/failure tests in a disposable database. If an environment is unavailable, report the exact unperformed checks; do not claim they passed.

Update STATUS.md and the active module's completion evidence. Explain what changed, why, checks performed, remaining risks and migration/deployment steps. Preserve existing user changes. Do not publish, merge or apply production migrations unless that action is within the user's current authorization.

## M09 current authorization - 13 October 2026

The subsequent pasted M09 request authorizes Task Tools inventory, durable
previews, atomic support/copy/batch framework and disposable testing. It
supersedes the historical no-M09 boundary. D09 bounds and D12 inheritance,
phase/handoff/archive/import policy remain undecided; draft fixture policy is
never business approval. Complete independent work, then obtain the smallest
necessary choices. No production apply/deploy, Drive operations, M10/M11 or
scoring/award policy change is authorized. Read M09-evidence and STATUS.

## M09 follow-up approvals - 13 October 2026

The user answered all three M09 questions: "Approve recommended bounds and copy
defaults", "Approve calendar phases and atomic batches", and "Approve remaining-
work handoff, archive and import deferral". This expressly supersedes the earlier
M09 pending-policy notes, but does not authorize production apply/deploy, Drive
operations, M10/M11 or a scoring/award formula change. Forward25 activates the
exact D09/D12 contract after24; the earlier draft tests remain historical evidence.

## Superseding M10 authorization - 13 October 2026

The subsequent pasted M10 request authorizes independent server Drive
implementation, the existing outbox adapter and disposable tests. It supersedes
earlier no-M10/Drive module boundaries. D11 is unresolved: account/root/templates,
sharing and checklist authority have no approved defaults. Policy remains NULL
and worker disabled. See M10-evidence and M10-configuration. Real side effects
require explicit approved sandbox setup. No production apply/deploy/workers/
sharing, M11, historical import or scoring/award/carryover policy changes.


## Approved M10 follow-up - 13 October 2026

The user selected "Shared Drive + dedicated service account (Recommended)" and
"Native checklists + reviewer comments (Recommended)". The supplied sandbox
root is `13G0w_T5i6cKUMiREETYlpH9Z_3G-RyGH`.

Approved exact initial phase:
- Only that sandbox folder; no existing business-folder mutations or broader sharing.
- `[Employee ID]/[Task Tag] - [Task Title]/{Input,Process,Output}`.
- No templates initially; Docs/Sheets/Slides only. Drawing/Form are deferred by user.
- Manual initialization during sandbox tests. The existing automatic native hook
  stays implemented but disabled for provider operations until sandbox tests pass.
- Native checklists are canonical; external copies are assets, with no two-way sync.
- Approved mapped reviewer commenter access only on newly created/copied files,
  with notifications suppressed. No predecessor/folder/public/domain ACL changes.

The selected recommended service identity uses the explicit `drive` scope,
constrained to the approved sandbox by database policy and live parent checks.
Actual account principal, Shared Drive ID, credentials and reviewer-email map
remain unconfigured. Folder Shared Drive membership is unverified; it is not
inferred from the URL. No production or M11 authorization was added.


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

## Superseding M12 authorization — 13 October 2026

The subsequent M12 pasted request authorizes month-close/revision code and
disposable checks. The user approved non-certified incomplete archives and
director correction limited to named existing records and exact dates. Forward
migration 29 and report/export selection are in the local workspace; see
`docs/plans/M12-evidence.md`. Earlier no-M12 statements are historical. No
production apply, deployment, worker activation, Drive operation or M13 work is
authorized. Native signed-in verification and a positive certified-path fixture
remain outstanding while sales/history sources are unavailable.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
