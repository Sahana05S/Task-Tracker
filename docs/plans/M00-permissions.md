# M00 permission and compatibility draft

## Superseding M12 close boundary — 13 October 2026

The user approved director-only incomplete, non-certified close and bounded
correction of named existing records within exact dates. Migration 29 adds
versioned close/revision commands and PostgreSQL guards. Reports choose live or
an immutable revision; the former Freeze upsert is retired. See
[M12 evidence](M12-evidence.md). Historical proposal rows below do not grant
current permissions.

## Superseding M10 implementation boundary - 13 October 2026

Active MD/PE provider requests use the existing outbox with current actor/context,
archive and lease checks. Private credentials never join task records; verified
assets cannot use legacy label-only rename. D11 account/root/template/authority/
sharing choices remain unapproved; policy NULL and worker disabled. Configured
reviewer access is limited to mapped individual commenters on new files, pending
approval. No predecessor ACL changes, production rollout, M11 or uncertain cleanup.
See [M10 evidence](M10-evidence.md). Earlier module restrictions are historical.

## Superseding M09 approved boundary - 13 October 2026

All D09/D12 follow-ups approve active manager native copies/support/phase batches,
atomic per-preview commands and reasoned dated handoff/retained archive. Copies
reset execution/reviews and assets; prior earned shares/scales remain retained.
Archived source/detail/checklist/participant/review/log/timer records are read-only
at the database boundary; Done/reopen still require existing M05/M03 proof.
Historical import is user-deferred. See [M09 evidence](M09-evidence.md). Earlier
proposal/pending text below is historical; no production or M10/M11 authorized.


## Superseding M08 approved boundary - 13 October 2026

Directors request calculations; narrow workers alone commit complete populations
after source/version/lease checks. Only directors override; incomplete results
stay guarded. Detailed candidate history is employee/MD/PE-only, team outcomes
aggregate, inactive/anonymous writes denied. Immutable automatic evidence survives
overrides/corrections. Legacy direct award/component writes are denied. All three
D10 follow-up policies are approved and active via23; see
[M08 evidence](M08-evidence.md). No production scheduling/M09/M12.

## Superseding M07 approved boundary - 13 October 2026

The subsequent M07 request authorizes the shared engine and source/consumer/
recomputation boundary. Active team members receive aggregate source inputs;
private attendance days/notes/log rows and employee reports retain their scopes.
Workers have narrow lease/read/finish commands, with immutable outcomes and
stale/version/frozen guards. D02/D03/D04 are approved in the 13 October reply; incomplete
scores cannot certify rankings/awards or Final compiled reports. Legacy freezes
cannot be overwritten. See [M07 evidence](M07-evidence.md); no M08/production.

## Superseding M06 approved boundary - 12 October 2026

M06 adds active versioned attendance/support commands, scoped retained history,
independent support review and atomic invalidation. MD/PE administer attendance;
DM administers support without other-employee attendance/detail rights.
Self-validation/direct protected writes/physical source deletion are denied.
Both follow-ups approve daily attendance validity, pending credit with original
source-date/as-of treatment, own pending edits/withdrawals and atomic manager
reviewed correction reset. Sales mapping/legacy provenance retain guards.
See [M06 evidence](M06-evidence.md); no M07 or production rollout is authorized.

## Superseding M05 contract ? 12 October 2026

M05 replaces the temporary blanket Done and checklist-sync guards with active,
versioned database commands, explicit three-section gates and current assigned
review approvals. Managers control structure, section confirmation and reasoned
mode changes; assigned members update permitted Yes/No/N/A leaf state. Linked
completion follows the actual task. Empty/all-N/A handling and prospective credit
follow the approved M05 answers. Historical proposals below remain a baseline;
see [M05 evidence](M05-evidence.md) for the current boundary and native checks.


## Superseding M03 approval - 12 October 2026

The latest request authorizes M02 retained reversals/midnight segments and M03
lifecycle/scale commands. Actor and report rights remain M01 D13. Assigned
reviewers use task/work versions; relevant work invalidates approvals. Assignees
may pause/resume; manager cancel/reopen/Carryover require reasons. All protected
task mutations now use authorized versioned commands. Done remains guarded until
M05 can prove sections and reviews. Missing/future/discarded freshness is visibly
unavailable, per the user's follow-up answer. Source-backed derived scale and
prospective versions are implemented; old earned credit and frozen reports remain
stable. See [M03 evidence](M03-evidence.md). Earlier proposals are historical.

## Superseding M02 contract - 10 October 2026

M02 preserves the approved role matrix, including manager timer administration.
Execution writes use active database commands with locked task/entity rows,
actor/command operation receipts, append-only safe audit events and durable
invalidation jobs. Direct log/timer writes and physical history deletion are
blocked. Share changes are prospective; earlier credit/version snapshots remain.
Completion/cancel/reopen rules are now approved but terminal safeguards remain
until M03/M05 can enforce applicable sections, initialized state and reviews.
Log reversal retention and ambiguous timer day policy still need an answer.
See [M02 evidence](M02-evidence.md); historical proposals below are superseded.

## Superseding M01 approval — 10 October 2026

The table below records the historical M00 proposal. The user's M01 request now
approves the D13 matrix with these specifics: only managing directors override
awards and close/revise months; engineers administer/review tasks; data managers
administer/validate support records; assignees complete checklists, managers
manage structure; assigned reviewers approve only their reviews. All protected
writes require active authentication and contributions cannot be self-validated.
Detailed reports are employee/manager-only; active team members see aggregates.
D03 approves normalized configurable/equal-default shares for scale/progress
only, not other factors or history. See DECISIONS and the implemented
[M01 boundary/evidence](M01-evidence.md). Historical proposals below are retained
for comparison; they do not override the current implemented matrix.

This records the current boundary and a proposed command matrix. It does not
grant rights or implement SQL. Structural rights below are existing manager
rights or protected-field requirements from AGENTS; discretionary reviewer,
data-manager, visibility and close/reopen rights remain D13.

| Actor | Read today | Write today (local code/policies) | Proposed boundary / decision |
| --- | --- | --- | --- |
| Anonymous | Landing/login; workspace redirect; RLS policies target authenticated | No ordinary workspace write policy | Deny all protected commands (C07) |
| Inactive authenticated | Most authenticated SELECT policies still allow; profile guard doesn't reject | Row/role predicates usually don't check is_active | Deny protected writes at DB boundary, even if UI/API bypassed (C07); historical visibility D13 |
| Managing director | Team/workspace data | Task administration, attendance, participants, checklists, stars, reports, support validation; profiles | Retain settled administration; close/revision powers D13 |
| Project engineer | Team/workspace data | Task administration, attendance, participants, checklists, stars, reports, support validation; not full profile administration | Retain settled task management; close/revision powers D13 |
| Data manager | Team/workspace data | Supporting meeting/fact/idea/suggestion/sales administration; own assigned work and attendance | Supporting-record validation retained as proposal based on existing behavior; no structural task/award/month-close powers unless approved D13 |
| Assigned team member | Team/workspace data | Own logs/timers/attendance, assigned progress/status, checklist updates; broad row UPDATE gap; create-checklist action lacks matching INSERT policy | Own execution fields only; scale/priority/ownership/protected review/scoring fields denied (C06). Manager checklist structure, assignee completion proposed D13 |
| Reviewer (task relation, any account role) | Team/workspace data | No dedicated approval command/field protection; reviewer_role join rows exist | Assigned-task review-only permission proposed; no additional structural edit, unassigned write or award override. D07/D13 |
| System worker | Depends on credential/grants | Freshness RPC via service role/cron, no general task/award worker verified | Narrow job-specific audited commands with trusted actor context; no browser service-role key; M01/M02/M08/M10 |

All role rights are scoped to an active authenticated actor, task/record
relationship and the actual command fields. A SELECT policy does not prove
write safety. Local policies are not verified deployed grants. Direct tests
must attempt protected-column edits, cross-task checklist moves, forged user
IDs, self-validation, inactive writes and self-escalation, as well as allowed
manager/member actions. Existing generated-column protection alone is not
sufficient for stored productivity, scale, priority or score fields.

## Proposed command/data contract

- Keep stable task UUID/tag references, legacy primary assignee/reviewer reads
  and join tables while selecting canonical participants under D03.
- Add participant-share metadata only after choosing equal/configured/full
  credit semantics. Do not backfill invented shares or double team totals.
- Ordinary assignee commands: log/timer/check completion/progress/allowed
  status. Their permitted transitions depend on D07; routine authorization
  restrictions can be settled without guessing the lifecycle.
- Structural commands: manager-owned scale/priority/participants/dates/
  checklist structure. Reviewer approvals separated from ordinary content.
- Multi-write commands lock source rows consistently, check versions, and
  reuse actor/operation idempotency keys; task/log/audit records commit together.
- Source-row fixtures need source IDs, as-of local date, date window, rule
  version, units, input presence and attribution. See fixtures/README.md.
- Scores need factor cohort IDs, raw/median/delta/components and provenance.
  Missing denominators/cohorts must be explicitly unavailable until D04 resolves
  them. Do not convert unmeasured values to zero.

## Migration and precision contract

No SQL is changed in M00. Latest local migration is 09; future forward migration
would follow the latest sequence rechecked at M01 start. Applied environment
history is unknown; do not edit 01–09 or assume all have run. Migration 08 adds
one flag; 09 adds attendance_hours/payable_days/absent_days/leave_days only.

Proposed strategy: expand compatible fields, dry-run/reconcile versioned
backfill, verify records/foreign keys/primary identity, then enforce accepted
constraints. Existing scale formulas, obsolete statuses and snapshots require
explicit mapping/versioning; preserve archives with their original rules.
No historical import, tag rewrite, deletion or scale reweighting is authorized
by this draft (D08/D12/D13).

Confirmed numerical invariant: keep sufficient intermediate precision,
fractional loading and unrounded medians. Current NUMERIC(10,2) generated
scaled_progress can erase small progress; employee 0.05/8 = 0.00625 must survive
calculation. Recommended proposal for D04: exact decimal/rational calculations
for the reference contract, factor-specific explicit cohorts, round only at
approved storage/display boundaries and test PostgreSQL/TypeScript parity.
Final NUMERIC precision, rounding and zero/missing policy are unapproved.


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
