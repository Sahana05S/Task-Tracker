# M04 evidence - 12 October 2026

State: implemented awaiting native Supabase authentication/API/signed-in browser
verification. No production migration, deployment, M05, scoring change, provider
request or Google Drive operation occurred. Existing user edits remain.

## Authority, predecessor and source evidence

Read the M04 pasted request, root AGENTS/PLAN/IMPLEMENTATION, RULES/DECISIONS/
STATUS/SOURCES and M01/M02/M03 evidence and active plan. Actual latest migration
at start:16. Inspected existing detail/action/read/panel/checklist/template paths
and10-16 authorization/receipts/versions/audit/outbox boundaries. No narrower
AGENTS files or delegation authorization exists; no subagents were used.

The original chat answer explicitly approved new-log progress at newly recomputed
scale. DECISIONS records multiplier1, hours?12.5 and progress0-100; first1h/+20%
earns12.5?20/100=2.5. Migration14 captures after source effort/recompute and16
adds scale-version capture. They are unchanged in M04. Disposable M04 tests
reconfirm2.5 after automatic initialization. No extra multiplier/history rule
was inferred. Native predecessor verification remains outstanding.

Both supplied XLSX files remain present; no spreadsheet was edited/imported.
Missing22 menu handler bodies, TemplateDialog.html/BlankFilesDialog.html,
external template registry/assets/folder tree, source formula/header gaps,
attendance/prior-month/linked-checklist/trigger configuration remain in SOURCES.
M04 native correctness does not claim recovered missing script behavior.

## Migration and canonical contract

New forward migration: `17_native_task_details_and_templates.sql`;10-16 remain
unchanged. New native field/template/version/instance/review tables reuse the
existing sections, links, dependencies, task checklist and node structures.
Canonical TypeScript schema is `lib/tasks/details-contract.ts`; SQL field keys
mirror it for database validation. Individual description/SMART/IPO/reviewer
fields share actions, editors and panels. The old raw-key editor/aggregate-label
initializer and type/notes-based IPO heuristics are removed.

Links record an explicit IPO role separately from asset type. Related employees
and reports use actual IDs and stable routes/anchors; report-link SELECT also
checks the existing employee/manager visibility. Ambiguous legacy links remain
visible outside IPO sections. Dependencies and Carryover use real task relations.
Link/relationship changes invalidate old review approval. New HTTP(S) assets are
validated; unsafe legacy href schemes are displayed as retained labels.

Manager-only public detail/template commands check active actor, field allowlist,
optimistic lifecycle/template version, receipt reuse and consistent global/task
locks. Save/source/detail/checklist/audit/outbox writes are transactional. Direct
section/link/dependency and native template/instance writes are revoked, including
inherited column grants. Existing M01 report/role boundaries and M03 Done guard
remain. Routine selectors display task/member/report names and template versions,
not raw UUIDs or section keys.

## Manual and automatic behavior

The valid-entry predicate follows existing required tag/title/category/priority/
active-primary-assignee fields. Dates and scale are optional; status/metric
eligibility are independent. DECISIONS labels this permitted implementation choice,
not an unavailable workbook auto-trigger decision. Automatic is the default
creation mode; explicit manual mode defers initialization and retains template
preference. A valid saved create/update invokes the same private initializer as
explicit initialization. An incomplete legacy draft returns draft/no native
instance or initialization/provider event. Invalid saves are rejected atomically.

One instance per task, one existing-compatible checklist, missing canonical
sections and incomplete template nodes are created. Repeated saves, same-key
retries and competing manual/automatic calls converge without resets or duplicate
instances/nodes/native events. A differing initialized template cannot replace
an existing independent instance. Native readiness is displayed separately from
provider_state; M04 uses not_requested and enqueues zero external jobs. Saving
an existing URL is expressly labeled as saving a link.

## Templates and legacy reconciliation

Publishing creates a new immutable version under manager authority and a checked
expected version. Instructions never populate editable completed content. A blank
native default contains empty instructions and no task/sample content; Setup/
Activity/Closure scaffold nodes are uninitialized. Reviewed template items start
incomplete. Existing checklist state/nodes are retained instead of overwritten.
No N/A/section rollup, sync engine or completion proof was implemented.

Existing native templates are snapshotted with original descriptions/nodes and
requires_review=true because their sections are unmeasured. They are not silently
reinterpreted or populated from private workbooks. Managers publish a reviewed
native version through structured instruction/node editors; existing instances
retain the chosen version and copied instructions independently.

Backfill preserves original meaningful rows/IDs. `inputs/process/outputs` copy
unambiguous content only into empty canonical destinations; exact old generated
instruction lists stay retained as instructions, not claimed SMART/IPO content.
Aggregate SMART/task-summary/carryover/custom text and conflicting canonical
values remain visible with review flags. Task description maps without replacing
meaningful canonical description. No task/link ID or snapshot content is rewritten.

Synthetic upgrade results:1 canonical conflict,1 ambiguous aggregate,2 retained
mapped-copy flags,2 retained generated-instruction flags,1 unsectioned native
template needing review. The existing
snapshot and T1/T2 identities survived. Actual production counts are unknown.
Artifact: [m04-local-evidence.json](fixtures/m04-local-evidence.json).

## Verification and limitations

Focused tests:3 files/16 cases. Full regressions:33 files/276 cases.
`npm run typecheck`:passed. Production build passed compilation/types and20 pages/23 routes, with no
deployment. `tools/test_m04_database.py --psql <portable-psql> --port15432`:passed
fresh01-17 and seeded upgrade01-16?17 in literal loopback disposable databases.
Real SQL roles/grants/RLS/constraints/transactions cover all canonical values,
IPO roles, private report links, active manager/unauthorized/direct edits,
manual/automatic equivalence, Not Started/drafts, immutable instance versions,
concurrent/repeated initialization, repeated saves, midway source rollback,
zero provider requests, old links/snapshots and the M03 scale-credit regression.
JWT-subject shim tests are not native authentication/API/browser passes.

Docker recheck still fails: dockerDesktopLinuxEngine named pipe missing. No
native Supabase test stack/config/accounts or signed-in browser fixtures are
available; native API/browser checks were not run. Production grants/applied
history/backfill/jobs and native workbook/provider equivalence remain unverified.
No dependency upgrade or clean npm installation was performed.

M05 Done remains blocked. Unsectioned legacy templates/ambiguous content need
individual review; no active-module business answer is required for independent
M04 scope. M09 content duplication is guarded before creating a copy because the
old post-save direct copy would collide with initialized sections or bypass the
new command boundary. No atomic M09 copy/split engine was added. Frozen periods
and closed-task content edits retain their guards. Provider execution remains M10.

Rehearse17 plus app together in a native sandbox before any separately authorized
rollout. Old direct detail writes will be denied; new reads/RPCs require17. Stop
the disposable cluster at handoff; retain cached test data outside the repository.
M04 is implemented awaiting native verification; do not start M05 automatically.
