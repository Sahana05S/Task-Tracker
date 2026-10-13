# M00 evidence — 10 October 2026

Dated baseline record: the later M01 request approves D03/D13 portions and starts
M01. Its fixes/tests are in [M01-evidence.md](M01-evidence.md). Statements below
about M01 not started, absent psql/local DB, or decisions unapproved describe the
M00 inspection time, not the current session handoff.


Independent baseline work is complete. This is an inspection of local `main` at
`8ab398181ef913086b8c39615665fd04175bd37d` plus existing uncommitted changes.
It is not a certification of workbook parity or the deployed application.

## Workspace and scope

Moved `AGENTS.md`, `PLAN.md`, `IMPLEMENTATION.md` from
`Task-Tracker-Codex-Plan-Pack/` to the repository root and moved its `docs/plans/`
into the existing `docs/`. No root or narrower AGENTS instructions existed.
The pack README remains in its original folder. The root README was preserved
byte for byte, including the user's existing edits.

Pre-existing changes: README, `docs/final-qa-checklist.md`, migrations 08 and 09;
untracked workspace file, planning pack and `supabase/verify_tracker_replacement.sql`.
No application source, tests, dependency manifests or migrations were edited.
No migration, import, provider operation, deployment or M01 work was performed.

## Repository inventory

| Area | Actual implementation / evidence |
| --- | --- |
| Stack | Next.js 16.3.6 App Router, React 19.3.0, TypeScript 5.9.3, Supabase SSR/client, Recharts; Node 22.17.0, npm 10.9.2, Python 3.10.11 |
| Routes | Public `/`, `/login`, auth callback; workspace dashboard, tasks, task details, checklist, logs, timelines, attendance, team, employee profile/reports, daily facts, ideas, suggestions, sales, reports, settings, milestones, task tools. Build lists 22 route entries including not-found. |
| Task commands | `app/tasks/actions.ts`: create/edit/status/progress/delete; participant writes are separate requests. `app/logs/actions.ts`: create/edit/delete then recalculate. |
| Tools | `app/(workspace)/task-tools/actions.ts`: wrappers, generic duplication, support creation/split, details seed, URL links/rename label, report insert, snapshot wrapper. See [menu matrix](M00-menu-coverage.md). |
| Timers/checklists | Task detail timer and checklist actions; separate log/timer/task writes and application-level propagation. |
| Supporting records | Attendance actions, support actions, team star actions. Validation currently uses booleans, not a pending/rejected/deleted state history. |
| Calculations | `lib/analytics/engine.ts`, `lib/stars/scoring.ts`, `lib/logs/metrics.ts`, `lib/checklists/progress.ts`, `lib/attendance/summary.ts`; several distinct contracts today. |
| Database | Local migration files 01–09. 08 only adds checklist sync flag; 09 only adds four nullable attendance snapshot totals. Neither establishes a database rollup, snapshot revision or deployed state. |
| Scheduler | Migration 05 proposes hourly freshness pg_cron, conditionally skips when extension absent; `supabase/functions/decay-freshness/index.ts` calls the decay RPC. No daily-star scheduler/configuration was found. Live jobs not verified. |
| Providers | Supabase is the application data provider. No Drive API client, task job/outbox worker or actual create/rename/copy call found in application code. Apps Script contains real Drive operations; web forms only save links. |
| Tests | 26 Vitest files, 233 assertions; node environment, no browser suite or database integration harness/config found. `supabase/verify_tracker_replacement.sql` is an untracked read-only object/column check, not an authorization/transaction test. |

## Rule comparison and traceability

| Finding | Rule / cases / owner | Evidence and disposition |
| --- | --- | --- |
| F01: two obsolete score models | R01, R07; A07–A10, D03–D05; M07/M08 | Analytics engine uses 0.4/0.3/0.2/−0.1; daily scorer uses 0.30/0.25/0.20/0.15/0.10 and attendance bonus. Ten median deltas and contribution factors are absent. Confirmed mismatch. |
| F02: incorrect units/aggregation | R01; A02–A06; M07 | `lib/logs/metrics.ts:computeProductivity` divides scaled progress by task hours instead of task percentage points/h. Analytics uses eligible logged hours rather than attendance for employees, allocation in percentage points, average priority, weights 4/3/2/1/0. Confirmed mismatch. |
| F03: inconsistent eligibility | R02; B01/B02; M03 | Analytics excludes OT/Discarded/nonpositive scale; log metric flag additionally requires hours; task create/edit sets scale/category flag. No shared No/Not Started/15% predicate. OT/extra status choices remain D01. |
| F04: update-age freshness | R03; B03–B05; M03 | `lib/tracker/enums.ts:computeFreshness`, migration 05 use updated_at and three states; log recalc resets Fresh. Workbook has six deadline/assignment states and completed-date freeze. Confirmed mismatch. |
| F05: attribution/precision | R01; A03/A08, P01; M03/M07 | Workload accumulated at `task.assigneeId` while logs credit worker. `roundToNumericScale` rounds most rates/medians/components to two decimals. Generated scaled_progress also stores two decimals. D03/D04 block the replacement allocation/storage policy. |
| F06: checklist semantics | R04; B06–B11; M05 | Direct-child averaging already exists, but all roots feed progress, N/A/section roles absent, empty returns 0, rootless graph divides by 0; leaf completion uses `isComplete || progress>=100`. `sync.ts` reads linked percentages; daily-star loader omits them. Confirmed gaps. |
| F07: permissions | Write contract; C06/C07; M01 | Migration 01:274 and 07:518 task UPDATE policies permit rows without restricting structural columns. 07:546 similarly allows checklist row UPDATE. Role helper reads role without is_active; `requireProfile` checks existence, not activity. No protected-column or universal active-account boundary found. Actual grants/RLS exploitability not tested. |
| F08: partial writes/retries | Write contract, R06; C01–C05; M02/M09 | Split action updates source at 313 before inserting support at 324; timer stop inserts log then updates timer/task; participant replacement deletes/inserts separately; log recalc reads progress then writes. No encompassing command transaction/idempotency contract found. Failure/concurrency risks established statically, not reproduced against DB. |
| F09: details/creation/scales | R05; C08/C09; M03/M04 | Initializer uses `smart_goals`, `inputs`, `outputs`; `app/(workspace)/tasks/[taskTag]/page.tsx:86` and 271/287 expect `smart_*`, `input_*`, `output_*`. No valid-entry automatic initializer. Task scale stored as numeric with no derivation history. |
| F10: support relations | R06; C04/C05; M09 | All four scale arithmetic modes exist; proportional stores a number and Support relation rather than formula metadata. Source changes do not demonstrably update support scale. D09 needed for uneven bounds/status/date policy. |
| F11: awards | R07; D01–D04/D09; M08 | Daily candidates pass `hoursLogged>0 || attendanceValid`; invalid attendance can win. Validity helper doesn't compare logs to attendance. Analytics monthly star uses highest score, not count of eligible daily wins. Team table displays win counts but does not change selection. |
| F12: providers | R08; C11/C12; M10 | Work-file action inserts task_links; rename changes label/notes; duplicate copies existing links. No verified provider effect. Missing HTML/template resources prevent exact source replication. |
| F13: history | R08; D05–D08; M11/M12 | `app/dashboard/actions.ts:168` overwrites unique user/month snapshot via upsert. `lib/team/employee-charts.ts:96` puts current score at period.endDate if no history. No frozen input/cohort/rule version/revision contract. Migration 09 preserves attendance totals only. |

## Older documentation conflicts

The following sections are superseded as target business rules. They remain
useful descriptions of the old implementation. Linked notices were added to
older Markdown documents; README contents and all SQL were retained unchanged.

| Document / exact section | Conflict | Contract that wins |
| --- | --- | --- |
| `README.md:279–377`, Business formulas | Scaled task productivity; update-age freshness; hours eligibility; averaged criticality/4–0 weights; four-term monthly score; guessed freshness; period/cohort interpretations | R01–R03/R07; D01–D04. README is preserved; this ledger and root AGENTS establish precedence. |
| `README.md:165`, Database setup | Describes migration 08 as rollup helpers; actual local file adds only sync flag | Local migration inspection; do not rewrite already-applied SQL. |
| `README.md:488`, Known gaps | Says freshness is not maintained although migration/function now exist | Scheduler existence differs from deployment evidence; legacy update-age rule still wrong. |
| `steering/domain-rules.md`, Freshness / Productivity / Criticality / Star / Eligibility | Three states, wrong denominator, weights/mean, four-term formula, hours requirement | R01–R03/R07 |
| `steering/product-requirements.md`, Task and analytics features | Three-state freshness and incomplete score specification | Six-state R03 and ten-factor R01 |
| `steering/database-schema.md` and steering SQL files | Old four-table/three-state schema and row-only task permissions | Migrations 01–09 describe local schema; R01–R08 describe target, M01 permissions pending |
| `steering/setup-roadmap.md`, phases 1–5; `.kiro/progress.md`, phases / interpretations / known gaps | Historical completeness does not certify current rule parity; monthly-log numerator and freshness guesses are not approved rules | PLAN module gates, D02/D04, STATUS current evidence |
| `docs/google-sheet-replacement-spec.md`, sections 10/11 | Formula called unspecified and provisional five-factor composite allowed; no historical import assumed | R01/R07 settled formula; D12 still needs import scope; D13 visibility remains open |
| `docs/apps-script-workflow-map.md`, equivalents | Names alone treated as source behavior, generic duplicate/status/RLS claimed equivalent; next module suggested as Drive | Menu matrix identifies missing bodies and web approximations; PLAN dependencies govern M10 |
| `docs/final-qa-checklist.md` | Operational checklist is not independent numerical/DB acceptance evidence | ACCEPTANCE + M00 fixtures; retained existing user edits |

## Available-data quality and limitations

Existing test assertions were inspected, not just executed:
`__tests__/lib/analytics/engine.test.ts` expects eligible logged-hour employee
rates and percentage allocation; tracker freshness tests expect updated_at
7/14-day boundaries and Fresh for Done; star tests assert the five-term model;
checklist tests assert empty=0 and direct-child/linked-progress rollups.
Task-detail route tests inject `vi.fn` loaders. These explain why a green suite
coexists with rule mismatches and does not demonstrate real RLS/transaction
behavior. Original tests were preserved.

This inventory covers reference exports and local schema. It does not claim a
live-record audit: no authenticated record export, disposable database or
authenticated test identities were supplied/established.

- Tracker: 55 sheets, checklist: 46, reconciled by ordinal and functional role in SOURCES.
- Tracker has three broken defined names: `Quality_Prefix`, `Research_Task`,
  `ProjTask_Prefix`. Checklist has `TaskClosure_Status`, `Team_Members`,
  `TaskSetup_Status` as `#REF!`.
- Exported tracker contains 1 cached `#ERROR!` and 10 cached `#N/A` cells;
  checklist contains no cached error cells. Cache scan is not recalculation proof.
- Tracker contains 114 formula anchors mentioning IMPORTRANGE and 1,918
  anchors with `__xludf.DUMMYFUNCTION`; checklist has 89 such wrappers. Google
  functions/external inputs are not executable source values in this inspection.
- `B_Summary & Analysis!E4:E50`, AH4:AH50, AN4:AO50, BN6:BP51 have no
  populated cells/formula anchors in this export despite named references.
  Employee progress, assigned-work raw inputs, completion count inputs and sales
  subtotal mappings cannot be independently reconstructed. Headers BN/BO/BP
  are absent too. Do not infer scale/count or sales field mapping from names.
- Local schema requires assigned_date, permits missing due/completed dates,
  permits null scale/progress, lacks participant shares, scale versions,
  N/A/section roles and scoring cohort/revision storage. D03/D04/D06–D08 apply.
- Preserve old record/snapshot identity, precision and legacy values during a
  later additive migration; do not silently recalculate archives.

## Checks and reproducibility

| Check | Result |
| --- | --- |
| `npm test` | PASS: 26 files, 233 tests. Existing regression behavior, not target parity. |
| `npm run typecheck` | PASS: exit 0. |
| `npm run build` | PASS: compiled, TypeScript, 19 generated pages, route collection; no deployment. Used existing `.env.local`; values never printed/changed. |
| `npm ls --depth=0` | PASS exit 0; installed requested packages, two extraneous platform packages (`@emnapi/runtime`, `@img/sharp-wasm32`). No dependency changes. |
| XLSX inspection | PASS: ZIP/XML read-only extraction, SHA-256, sheet/named range/anchor/validation/cache inspection using `tools/inspect_sources.py`. Python openpyxl absent; standard-library fallback used. |
| Independent fixtures | See `fixtures/README.md` and fixture verifier result in STATUS. Verification checks fixed arithmetic only, not application conformance. |
| Scope/doc checks | PASS: six pre-existing modified/untracked files match captured SHA-256, seven old document bodies retained under notices, no additional tracked application/test/migration edits, all planning local links resolve, `git diff --check` exit 0. Git emits ordinary LF/CRLF conversion warnings. |
| Fresh install/upgrade/RLS/concurrency/rollback | NOT RUN: no DB integration harness or Supabase local config; Docker daemon unavailable (`docker info` exit 1, Linux-engine named pipe missing), psql not installed. No database started or migrated. |
| Live records/deployed commit/applied migrations/jobs | NOT VERIFIED: local commit and migration files are known; no deployed metadata/DB history or authenticated audit dataset obtained. Prior planning-pack live audit is historical evidence only. |
| Browser end-to-end | NOT RUN: no Playwright/Cypress setup or test identities. Proposed later framework: Playwright against disposable authenticated fixtures, subject to M13 implementation. No dependency installed. |
| Provider / native workbook recalculation | NOT RUN: no provider sandbox/template tree, attendance source or runnable original Google Sheets/Apps Script environment. No external operation performed. |
| `npm ci` | NOT RUN: installed dependencies available; avoided replacing workspace dependencies during a docs-only baseline. Lockfile/package versions inspected. Clean install reproducibility is still unverified. |

## Next decisions

No D01–D13 proposal was promoted to confirmed. Ask only D03 shared-task credit
and the M01 portion of D13 permissions/visibility now (worked examples in
DECISIONS). D07/D08/D12 schema details can remain nullable/unactivated proposals;
later modules must resolve them before behavior depends on them. Missing sales
and completion source mappings stay explicit blockers for corresponding M07
acceptance, not obstacles to settled permission protections.

M01 remains not started. A later user instruction must select it; approval of a
business choice alone does not authorize starting that module in this session.
