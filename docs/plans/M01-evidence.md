# M01 implementation evidence - 10 October 2026

Historical predecessor record. The subsequent M02 request approves prospective
share changes and completion gates. [M02 evidence](M02-evidence.md) supersedes
statements here that M02 is unauthorized or logged redistribution is blocked.
Native auth/API/browser verification remains outstanding.

State: implemented awaiting Supabase/auth/browser verification. The approved
database boundary is verified in disposable PostgreSQL; this is not a deployed
environment or production migration claim. M02 has not started.

## Authority and scope

The user's pasted M01 request approves D03 additive shares and the D13 role and
report-visibility matrix. Root AGENTS, PLAN, IMPLEMENTATION, RULES, DECISIONS,
STATUS, M00 evidence/permissions and the M01 plan were read. No narrower AGENTS
exists. Branch remains `main`, baseline HEAD
`8ab398181ef913086b8c39615665fd04175bd37d`; changes are uncommitted. Migrations
01-09 and pre-existing user files are preserved. No production connection,
migration application, deployment or provider operation was performed.

## Forward migrations and commands

- `10_permissions_and_participant_contract.sql`: transactionally replaces the
  known application's permissive RLS policies and table/column/function grants;
  checks active database identity; denies protected field changes; adds private
  audit events/command receipts, participant mode/version, integer shares and
  reviewer decisions. Public-schema CREATE rights are removed from client roles.
- `11_private_report_summary_inputs.sql`: active-only month and task aggregates
  support team charts/counts/effort without exposing individual dates, notes,
  check times, timer IDs, raw links or report payloads.
- `save_task_with_participants`: locks the task, validates active distinct
  participants, checks the participant version, commits task/participants/audit
  together, and uses actor-scoped operation receipts for retry/conflict handling.
- `set_task_participants`: normalized assignment command with parent row lock,
  mandatory version check, exact total, compatibility primary checks and explicit
  legacy acknowledgement. A repeated old version returns a conflict; callers
  needing a repeatable success response use `save_task_with_participants`.
- `record_task_review`: records only the current actor's assigned review; it
  neither changes task structure nor implements a completion gate.
- `recalculate_task_metrics`: derives protected stored metrics using all task
  hours inside the DB, while keeping the existing legacy formula. It accepts
  no caller-supplied productivity, validity or freshness values.
- Existing freshness decay moved to the private schema. Its public service-only
  wrapper checks worker/cron context and audits runs, including no-change runs.
  All definer functions pin an empty search_path and have explicit execution
  grants. No browser service-role credential was introduced.

## Effective permission contract

All client commands require an active authenticated account. Table RLS scopes
rows; invoker triggers protect fields and actor references. Only trusted owner
commands bypass field guards; no client-set bypass flag is used.

| Actor | Approved effective boundary |
| --- | --- |
| Director | Workspace administration, structural tasks/checklists, awards/score persistence and reports/month snapshots; audited overrides/revisions |
| Engineer | Structural tasks/checklists, task reviews, attendance/work administration; detailed reports readable; no award, report snapshot or month snapshot writes |
| Data manager | Supporting-record administration/independent validation; own execution when assigned; no structural task/award/month/report writes |
| Assigned member | Own assigned logs/timers, own attendance, assigned progress/open status and checklist completion; no scale/priority/ownership/shares/review/metric/score/date writes |
| Assigned reviewer | Own assigned review decision only; account's ordinary rights still apply independently |
| Anonymous/inactive | No protected writes or protected command execution; inactive profile remains self-readable for the account notice |
| Worker | Existing narrow freshness command only; direct application-table grants removed |

Detailed logs, timers, attendance, score components, monthly snapshots and
employee report payloads are readable by the employee and MD/PE managers.
Reports without an employee ID are manager-readable only because arbitrary
payloads are not an approved public aggregate. Active team members use the
approved aggregate RPCs. Audit storage is private; clients cannot forge/delete
events. Actor, operation, changed fields and protected before/after values are
retained without copying private work notes into the audit.

## Shares, precision and reconciliation

100% equals 1,000,000 integer units (one unit is 0.0001 percentage points).
Nonnegative shares must total exactly 1,000,000; zero-share participation is
permitted. Equal allocation floors 1,000,000/n and assigns remaining units to
ascending UUIDs: three participants receive 333334, 333333, 333333. This is an
implementation representation, not approval of D04 scoring precision.

New tasks seed compatible primary assignee/reviewer rows atomically and enforce
the configured invariant with deferred constraints. Existing rows remain
`legacy`, version 0, shares NULL. There is no automatic historical backfill.
Compatibility reads union the legacy primary with available join rows; missing
or disagreeing joins never remove the legacy primary.

Managers can inspect `/task-tools/participants` and
`participant_reconciliation()` before acknowledging conversion. The synthetic
upgrade preview is saved in
[m01-synthetic-reconciliation.json](fixtures/m01-synthetic-reconciliation.json):
T1 has a secondary join but no primary join; T2 has no joins. The proposed
canonical union is respectively two people (50/50) and one person (100%). These
are test findings, not an inventory of deployed employee data. Production row
counts, join anomalies and backfill candidates are unknown and still require a
read-only preflight in the intended environment before any rollout.

Changing logged credit is denied until historical attribution is approved.
Reviewer/primary-order edits preserve configured custom shares when people are
unchanged. The dashboard distributes additive scale/progress, retains actual
hours on the worker, and does not duplicate shared progress in its chart.
Individual daily shared-credit trends are explicitly unavailable: per-day
attribution/cohorts and completion/criticality attribution remain undecided.
Existing score formulas and archives are not promoted to the target contract
or rewritten. Existing score/display rounding remains a later D04/M07 concern.

## Application integration

Task create/edit and duplicate participant creation use the atomic save command.
The editor carries a version/operation key and validates exact decimal share
inputs. Task tools reuse that editor. Checklist creation/structure are managers'
controls/actions; members have completion only. Completion commands bind the
node to the requested task's checklist. Independent validation controls are
hidden for the record's author; DB checks remain authoritative. Award/report
save controls require a director. Report query helpers authorize the viewer
before fetching details. Inactive accounts receive a sign-out notice rather
than a workspace/login redirect loop.

Unresolved terminal lifecycle creation/transitions are rejected rather than
inventing Done/discard/reopen rules. Existing terminal records remain readable.
Review decisions are stored without claiming they authorize completion.

## Actual checks and limitations

Docker's engine remained unavailable. Official [EDB portable binaries](https://www.enterprisedb.com/download-postgresql-binaries)
provided PostgreSQL 17.11 on Windows. An isolated loopback cluster on port 15432
was initialized outside the repository; no .env credentials were read by tests.
The two literal disposable databases are `taskpulse_m01_fresh_test` and
`taskpulse_m01_upgrade_test`. The cluster is stopped after verification.

`tools/test_m01_database.py` applies every migration to a fresh database and
rehearses 01-09 to 10-11 with legacy tasks, joins and a snapshot. It models
Supabase's authenticated/anonymous/service roles, deliberately broad initial
table/function grants and explicit inherited column grants. Database roles,
RLS, triggers, FK/check constraints, real transactions and simultaneous
connections run in PostgreSQL. Auth users and verified JWT subjects use a local
shim; this does not test GoTrue token verification or PostgREST request handling.
Expected failures must have authorization/contract SQLSTATEs, not arbitrary SQL
syntax or missing-function errors.

Passing DB cases cover protected columns; forged user/completion/validator/timer
references; self-escalation; inactive/anonymous commands and direct writes;
cross-checklist moves; allowed engineer structure/member completion/reviewer
decisions; self-validation; private report/log/attendance reads; safe aggregates;
full private denominators; exact thirds/invalid totals; legacy acknowledgements;
logged-credit gates; reviewer edits preserving shares; stale versions; audit
tampering; narrow workers; operation-key retries/conflicts; failure rollback;
and two concurrent writers producing one commit and one version conflict.
Upgrade task/participant/snapshot values are compared before/after.

Final results: 28 files / 244 tests, typecheck, production build (20 generated
pages / 23 route entries), both DB suites and diff/preservation checks pass. The
real local catalog snapshot covers 25 tables, 16 definers and compiled policy
expressions in [m01-local-grants.json](fixtures/m01-local-grants.json). Detailed
commands and preservation checks are recorded in STATUS. Unit tests validate approved arithmetic/read shaping and regression
behavior; they are not a substitute for DB authorization tests.

Not run: native Supabase/GoTrue/PostgREST integration and browser workflows with
signed-in fixtures; Docker-based Supabase rehearsal; deployed grants/applied
history/records; production backfill; provider operations; clean dependency
installation. Local SQL success does not certify deployed owner/grant/history
state. M01 remains implemented awaiting that integration verification.

## Remaining boundaries and next steps

- D07: terminal state gates, discard/reopen behavior, all-N/A/uninitialized
  sections and review requirements. Terminal changes remain blocked.
- D03/D02: completion/criticality/freshness and historical/daily credit.
  Logged reallocations and affected daily shared-credit trends remain blocked.
- D04 and D08: final precision/cohorts and effective-dated scale changes.
  No scale formula or historical score/snapshot rewrite is authorized.
- General log/timer transactions and checklist propagation remain M02/M05.
  Non-permission copied content/support splits remain M09; this module only
  makes critical participant/permission creation atomic.
- The missing source bodies/HTML/templates/attendance/previous-month data from
  SOURCES and M00-menu-coverage remain missing. Both supplied XLSX files exist.

Next work requires a separate module instruction. Before any deployment, inspect
actual owners/grants and applied migration history, export a read-only legacy
reconciliation, review anomalies, and rehearse the same order against a native
Supabase sandbox. Neither production application nor M02 is authorized here.
