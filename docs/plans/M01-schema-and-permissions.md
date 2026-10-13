# M01 — Schema compatibility and database permissions

Status: implemented awaiting native Supabase/auth/browser verification. The user
authorized M01 after approving the D03/D13 portions. Independent M00 work and
missing sources remain documented; no M02/production rollout is authorized.
See [M01 evidence](M01-evidence.md).

## Outcome

Close the authorization gaps and establish additive schema contracts for the remaining modules, preserving existing records and older reads during migration.

## Existing code and confirmed problems

Inspect supabase/migrations01–09, types/database.ts, types/tracker.ts, lib/auth/profile.ts and role/permission helpers. Existing assignee task UPDATE policies authorize rows but do not protect scale/priority/assignment columns; checklist INSERT is manager-only while an assignee creation action exists.

## Implementation steps

1. Inspect actual table/column/function grants and RLS policies. Define readable fields and commands for director, engineer, data manager, ordinary member, reviewer, inactive and anonymous identities.
2. Replace blanket assignee writes with vetted command functions or genuinely enforced column/trigger restrictions. Enforce actor identity, active account, task membership and allowed status transitions inside the database.
3. Add the minimal accepted participant/share/version/review fields, audit and command receipts. Unapproved section/N/A, scale-history, provider-job and scoring/snapshot version contracts remain with their later modules.
4. Use the approved participant share representation for new/configured tasks. Preview legacy reconciliation before conversion; preserve existing NULL shares and primary/join compatibility reads. Verify exact totals and matching primaries for configured tasks.
5. Restrict protected fields and generated columns; secure SECURITY DEFINER functions with explicit search_path, narrow execute grants and internal actor checks. Do not grant generic service-role access to client code.
6. Add graph/foreign-key/uniqueness/check constraints where possible; identify recursive graph checks for M05. Update generated types and schema-error handling.
7. Test fresh installation, upgrade of existing schema, backfill repeatability and real authenticated direct API/RPC writes in a disposable database.

## Data and interface contract

Database permissions are the real boundary. Every write command declares allowed actor roles and fields. Additive schema migrations must name conversion/backfill rules, null/default behavior and contract owner. Keep private data out of seed files.

## Acceptance and verification

- [x] Assignee cannot directly change scale, priority, ownership, protected review fields or computed score columns.
- [x] Inactive/anonymous identities cannot use protected write commands even when bypassing UI.
- [x] Managers retain authorized operations; data managers and reviewers get only documented rights.
- [x] Checklist create rights in UI, action and DB agree; cross-task node changes are denied.
- [x] Existing tasks/participants remain readable after upgrade; row counts and foreign keys reconcile.
- [x] Fresh install and upgrade tests pass under the real grants, not mocked permission predicates.

## UI / workflow integration

Keep controls consistent with database permissions and show useful denial messages. Do not reveal editable controls for unavailable operations.

## Scope boundaries

Do not implement all scoring/Drive workflows here or rewrite old applied migrations. Read access policies must follow the agreed visibility decision rather than an invented blanket restriction.

## Decisions and rollout

D03, D07, D08, D12, D13 may affect detailed schema. Land settled security protections first. Verify expand/contract deployment order and test rollback/recovery without deleting production records.

Use the shared definition of done in IMPLEMENTATION.md. Update STATUS.md with acceptance evidence, actual migration/revision, tests and limitations. Recheck predecessor contracts if their code has advanced. Planning proposals become authoritative only when confirmed in DECISIONS.md.

- [ ] Native Supabase/GoTrue/PostgREST and signed-in browser workflow verification;
  local PostgreSQL role/JWT-shim tests do not claim to cover these.

Implementation: 10_permissions_and_participant_contract.sql and
11_private_report_summary_inputs.sql. No earlier migration was edited in M01.
Deferred contracts and outstanding checks are detailed in M01-evidence.md.
