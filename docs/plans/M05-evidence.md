# M05 evidence - 12 October 2026

M05 is implemented awaiting native verification. Work is on local main at
8ab398181ef913086b8c39615665fd04175bd37d plus preserved uncommitted M00-M04/user
changes. No commit, production migration, deployment, Drive operation or M06.
The latest pasted request and both follow-up answers authorize this scope.

## Contract and implementation

Forward migration: `18_checklist_rollups_and_propagation.sql`. Migrations01-17
were retained. It converts existing boolean values to Yes/No without changing
node identity/content and adds N/A, explicit section initialization/intentional
empty evidence, an exact-decimal progress column, visible progress ownership,
private projection/prospective credit records and narrow versioned RPCs.

The pure reference is lib/checklists/progress.ts, contract m05-checklist-v1.
Ordinary Yes/No leaves contribute100/0; N/A is excluded. Each parent averages
applicable direct children equally, without global flattening or intermediate
rounding. Setup/Activity/Closure return independent progress, applicability,
initialization and completion. Only Activity drives checklist-owned progress.
Missing/uninitialized sections block Done; manager-confirmed empty and initialized
all-N/A sections satisfy their gate with unavailable percentage/Not applicable.
Missing references, cycles, unsectioned content and inconsistent linked Done
progress return explicit quality errors, never healthy zero/NaN/Infinity.

Linked leaves use current task progress and lifecycle. At50% they cannot be
complete, and100% alone never makes the source task Done. All three section gates
and every assigned review for the current work revision are checked at the DB
boundary. Measured manual progress inconsistent with completed work must be
reconciled before Done; unmeasured all-N/A progress stays unavailable. Done records
its local completion date and retains its valid approvals; reopening/content/
checklist/source changes invalidate approvals. No reviewer override was invented.

Commands serialize domain graph changes, lock tasks/checklists, check observed
versions, scope operation receipts to actor/command and commit graph progress,
metrics, source versions, credits, safe audit and outbox together. Graph guards
reject self/cross-checklist/cross-section parents, ancestor and combined
checklist/scale/dependency cycles, dangling links and linked parents with children.
Linked identity uses RESTRICT. Explicit manager subtree corrections are atomic;
legacy titles do not assign roles. Traversal reports cycles and orders each
shared ancestor by its longest dependency distance, handling diamonds once in
child-first order. Closed/frozen parents require manager reconciliation/reopening
instead of silent historical changes. SMART/assets/relationships also propagate
review invalidation when percentages stay unchanged.

All creation paths default manual. Reviewed, reasoned manager mode switches
change the current projection with zero retrospective credit. Later changes
capture their effective scale/share versions and exact prospective delta. Missing
baseline/scale or unapproved legacy shares remain guarded. Unavailable Activity
preserves balances and the last measured anchor; it does not become zero credit.
Disabling retains current progress. Previous log captures/balances/snapshots stay
intact; no checklist command invents effort logs. Hours-only logs remain available;
nonzero requested log progress and manual edits cannot take checklist ownership.
Being linked by a parent does not transfer a child's own progress ownership.

PostgreSQL returns an exact decimal string for mode previews, avoiding JavaScript
round-trip rejection of values such as100/3. PostgreSQL stores unrounded current
progress/scaled units; existing task productivity storage uses the M03 boundary.
No final M07 cohort/rounding/scoring policy was invented.

## Application and reads

Checklist actions are thin RPC adapters. The existing checklist route provides
three section summaries, Yes/No/N/A, named task/parent selectors, explicit section
review, reasoned mode preview, legacy subtree correction and actionable errors.
No raw UUID entry is required. Task grid progress shows Activity ownership and
prevents manual editing of that owner. Done controls use the authoritative gate.

lib/checklists/read-model.ts delegates to one database rollup. Details, checklist
pages, Task Tools links, report current-checklist observations and award loader
use it; lib/checklists/sync.ts no longer writes progress after commit. Report
observations carry their contract/as-of and do not impersonate historical period
inputs. Missing/not-applicable award evidence remains explicitly unavailable
pending M08; existing scoring coefficients and award workflow are unchanged.

Planning AGENTS/PLAN/IMPLEMENTATION/RULES/DECISIONS/SOURCES/ACCEPTANCE/M05/STATUS and
the permissions handoff record the approvals and current guards. Independent
fixtures are docs/plans/fixtures/m05-rollups.json.

## Reference and reconciliation evidence

Both supplied XLSX references were read without edits/import/recalculation.
Their M00 hashes and46/55 sheet inventories match. Master Checklist Home E6
references E13, separately from Setup/Closure observations; relevant exports
include Yes/No/N/A validation. Cached values are not native recalculation proof.

Synthetic upgrade retains two original unsectioned nodes, their IDs, text,
parent/link references and booleans; true converts to Yes and false to No.
No title mapping was guessed. Explicit manager mapping is tested separately.
Existing template version payloads, credit balances and monthly snapshot rows
are unchanged by upgrade. Published native templates give identical section
structure in automatic and manual initialization, with all completion No and
manual ownership. Repeated initialization keeps an existing instance unchanged,
including when its employee month is frozen. These are fixture counts, not live
reconciliation counts. No workbook sample was imported.

Missing references remain the22 named Apps Script handler bodies,
TemplateDialog.html/BlankFilesDialog.html, full template registry/assets/folder
tree, unavailable Summary subtotal source headers/formulas and external
attendance/prior-month/carryover/linked-checklist/trigger configuration. Neither
provided workbook is missing. See SOURCES for the full ledger.

## Verification

| Check | Actual result |
| --- | --- |
| Focused checklist/detail/template tests | PASS:3 files,30 tests;18 checklist contract cases |
| Full Vitest regression suite | PASS:33 files,288 tests |
| npm run typecheck | PASS, exit0 |
| npm run build | PASS compilation/TypeScript;20 generated pages,23 routes |
| tools/test_m05_database.py | PASS PostgreSQL17.11 fresh01-18 and upgrade01-17 to18, on literal disposable loopback DBs |
| tools/test_m05_initialization.py | PASS focused final initialization/frozen no-op and exact fractional preview/storage checks, both disposable DBs |
| Preservation hashes | PASS README, final QA, migrations08/09, verification SQL and workspace file |
| git diff --check | PASS; existing LF/CRLF notices are not content errors |
| Docker native-stack recheck | NOT AVAILABLE: dockerDesktopLinuxEngine named pipe missing |

Database commands used the cached portable psql executable and port15432 on
127.0.0.1. The full harness recreates only taskpulse_m05_fresh_test and
_taskpulse_m05_upgrade_test; the focused harness changes/tests only those same
disposable databases. It reads no project credential or .env file. The final
small initialization/decimal-preview changes were checked with the focused
harness after the full migration/command suite; they are included in the
reproducible full harness for subsequent rehearsal.

Real SQL coverage includes independent expected50/80/group weighting and
empty/all-N/A cases, shared pure/PostgreSQL fixtures, exact fractional progress,
N/A transitions, typed bad legacy inputs, direct graph rejection, computational
and ancestor cycles, diamond propagation, inactivity/role/relationship/grant
checks, forged cross-task node IDs, idempotent receipts, competing observed
versions/reload, complete injected outbox-failure rollback, derived productivity,
manual/log ownership rejection, zero-credit mode switching, subsequent effective
credit, unchanged original scale captures, newly computed first-log credit2.5,
frozen-parent source rollback, Done/current-review gates, completion dates and
content-only/reopen review invalidation. All production records remain untouched.

Native GoTrue/PostgREST, signed-in browser/mobile/keyboard flows, production
migration history/grants/reconciliation, worker delivery, provider operations and
native workbook recalculation were NOT RUN. Docker/native sandbox configuration,
test accounts and browser fixtures are unavailable. PostgreSQL used a verified
subject auth shim; real roles/RLS/grants/transactions do not substitute for those
native checks. No dependency upgrade or clean npm installation was attempted.

## Remaining boundary and rollout

No further M05 business answer is required. Preserve individual legacy content
and review its explicit section roles, missing source identity, manual progress,
scale and participant shares before enabling ownership/Done. Histories whose
shares/effects are unknown stay guarded. Earlier snapshots are not restated.

Rehearse18 and the app together in a native sandbox after checking applied
migration history and inspecting real reconciliation counts. New RPC/column reads
require18 and old direct checklist writers will be denied. Take the usual backup
and review forward upgrade evidence before separately authorized rollout; no
production apply/deploy is performed here. Native verification remains the M05
completion gap. M06, M07/M08, M09 and M10 remain separate scopes. The disposable
cluster was stopped at handoff; its cache remains outside the repository.
