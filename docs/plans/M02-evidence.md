# M02 implementation evidence - 10 October 2026

## Superseding approved follow-up - 12 October 2026

The user's M03 request approves the two formerly pending policies. Migration14
implements retained, reasoned log reversal of the original known actual effect,
using the same authorized execution command, row locks, versions, receipts,
credit balances, revisions, audit and refresh adapter. Frozen/unknown-effect/
manual-bound conflicts remain guarded. Original log values are retained and
`reversed_at` excludes the reversed source from effort aggregates.

Timer stops now split at Asia/Kolkata midnight using one private segment
contract. Exact NUMERIC hours, segment bounds and duration seconds preserve
short positive effort. All dated segments, the stopped session, audit, metrics
and receipt commit together. Session `generated_log_id` remains a compatible
first-segment projection; each segment links to the original session with a
unique segment number. Repeated stops return the original complete segment list.
Zero stops reject; reasoned discard remains available. Segment duration/date
edits are guarded; a mistaken segment can be reversed without deleting history.
Task productivity storage expands magnitude to accommodate short durations.

`supabase/reconcile_m02_m03.sql` is read-only and runs before migration12 or on
newer schemas. It distinguishes valid dated segments from duplicate legacy links.
The disposable duplicate fixture has one timer linked to two uncertain logs,
two unknown effects and two reverse-link exceptions; all records remain. No
production inventory or automatic merge/delete/reconciliation was performed.
New logs include their effort in derived scale before earning their progress,
as approved in the subsequent answer. The original scale/version stays captured;
missing original scale requires reconciliation before nonzero corrections or
reversals. These changes are covered by the M03 fresh/upgrade tests.
Migration12 still rejects those pre-existing duplicates. See the generated
fixtures and [M03 evidence](M03-evidence.md) for current tests and rollout limits.

M02 follow-up is implemented awaiting native verification. Its older policy
questions below are historical, superseded by the user's request. The M03
calendar/eligibility/scale contract replaces the older state limitations below.

## Historical M02 handoff - 10 October 2026

State: independent commands implemented; two policy decisions and native
Supabase/API/browser verification pending. M02 is not fully verified. No
production migration, deployment, historical redistribution or M03 work occurred.

## Authority and inspected baseline

The user's pasted M02 request approves prospective share changes (D03) and
applicable Setup/Activity/Closure plus required-reviewer completion gates (D07).
N/A does not block completion, uninitialized checklists are not complete;
managers cancel/reopen with an audited reason. These decisions are recorded in
DECISIONS/RULES/M00-permissions and do not implement the M03/M05 lifecycle.

AGENTS, PLAN, IMPLEMENTATION, RULES, DECISIONS, STATUS, M00 evidence/permissions,
M01 evidence and the M02 plan were read. Actual migrations 10/11, log/timer
commands, schema, UI/read paths and tests were inspected. Branch remains main,
HEAD `8ab398181ef913086b8c39615665fd04175bd37d`, with preserved uncommitted edits.
The latest migration at M02 start was 11; earlier migrations are unchanged.
Both supplied XLSX references remain available; no reference file was edited.
Missing script bodies/HTML/template/attendance/previous-month inputs remain as
recorded in SOURCES; they do not prevent this execution-integrity work.

## Forward migrations and commands

`12_atomic_execution_commands.sql` expands M01 receipts to actor + command +
operation-key scope and adds typed JSON results without losing old task receipts.
It adds execution versions, requested/effective delta and explicit unknown-effect
metadata; private participant versions, safe log revisions, earned-credit events,
current-credit balances and a durable outbox. It reuses M01 authorization/audit
triggers and replaces the same participant/save functions prospectively.

| Command | Implemented behavior |
| --- | --- |
| `create_task_log` | Verified active actor; assigned task or existing manager rights; immutable worker identity; validated date/hours/delta/links; locked task; log, effective progress, metric refresh, credit, audit, outbox and receipt commit together |
| `correct_task_log` | Own log on an authorized task; required reason/version; same task identity; original effect reversed before a changed request is applied; unchanged progress requests preserve current manual progress; safe before/after history retained |
| `reverse_task_log` | Deliberately rejects while removal/retention policy is pending; no destructive deletion introduced |
| `start_task_timer` | Server timestamp/actor; active task permission; existing unique running-timer-per-user constraint; receipt-backed retries |
| `stop_task_timer` | Own timer or existing MD/PE work administration; locks task then timer; server duration; exactly one generated log, stopped timer, metrics, audit and receipt in one transaction |
| `discard_task_timer` | Running timer only; own record or manager administration; required reason/version; retained timer and audit, no generated effort |

Clients cannot directly insert/update/delete logs/timers or alter audit/credit/
receipt/job records. Physical execution deletion also fails on owner/cascade
paths, preventing parent deletion from silently destroying history. Unknown or
forged fields, inactive/anonymous callers and unauthorized entities are rejected
inside the database. The actor row is locked while active rights are checked.
Receipts serialize matching actor/command/key requests; identical requests return
the original result and changed payloads raise a recoverable conflict. Task locks
precede source entity locks. Different keys competing for one source version
cannot both commit. No client-set bypass flag was introduced.

`13_execution_credit_summary.sql` returns applied-effect aggregate inputs with
captured credit scale/shares, preserves worker-attributed hours, omits reversed
rows and exposes safe current-credit/task-effort totals. Unknown nonzero old
progress is reported unavailable instead of being interpreted as produced work.
It never returns notes, raw links, credentials, raw log IDs or individual dates.
Availability metadata blocks live scoring while independent attendance/report
counts and saved employee reports remain readable, with an explicit reason.

## Progress, precision and recomputation

95 + requested10 stores applied5; 0 + requested-10 stores applied0. The existing
`progress_delta` on new logs mirrors the effective value for compatible reads;
requested input is separate. Older requested deltas are not copied into effective
columns. They remain NULL/unknown. Old rows/snapshots remain intact.

A correction reverses the stored actual effect, not the old request. Example:
95+10 applies5; a later manual change to80 survives an hours-only correction.
Changing that log's request to3 reverses5 then applies3, leaving78. If reversal
would put the base outside 0-100 (e.g. a later manual reset to0), the command
conflicts rather than consuming/reconstructing manual history. Logs are not summed
to reconstruct all task progress. Moving a log to another task is not enabled.

One private `refresh_task_metrics` adapter serves commands, compatible zero-delta
refresh and direct manual-progress triggers. Task productivity uses confirmed
R01 task percentage points / all non-reversed task hours, not scaled progress /
hours. Existing two-decimal stored productivity/legacy eligibility boundaries
remain explicit D04/M03 limitations. No employee or ten-factor scoring formula is
activated. Logging does not reset freshness to Fresh; M03 still owns full date
classification and eligibility. Manual and source writes stay transactional;
conservative invalidations can include both a progress and source version.

Checklist-owned progress and progress referenced by a syncing parent checklist
reject execution/manual progress changes until M05 supplies atomic ownership/
propagation. Hours-only entries remain available. Client changes to ownership flags and
linked ownership in syncing checklists are frozen until M05, preventing a new
owner signal from racing an execution command. Ordinary checklist content and
completion rights are retained. No post-commit checklist sync
can silently overwrite a successful execution command. Terminal transitions
remain guarded until approved completion/review/cancel rules can be enforced.

## Prospective attribution and compatibility

Participant versions carry effective timestamps and the actual normalized share
map. New execution credit captures the current version and scale; correction
credit remains on its original version. A 50/50 to70/30 change preserves earlier
50/50 work and existing balances, and affects only subsequent credit. Frozen
reports are never rewritten. Logged or progressed scale changes stay blocked
pending effective-dated scale policy D08/M03. A backdated progress log before the
known effective share version needs reconciliation rather than today's shares.
Explicitly dated hours-only entries remain available in open periods; a known
progress correction cannot move before its captured share version either.

The current-credit anchor records the M01 reading at migration time (including
its legacy primary projection), not invented historical earning dates, shares or
source effects. Subsequent manual/effective changes maintain that balance. No
old log or frozen score is restated. Snapshot/source reconstruction still needs
M07/M12. Historical non-additive and final daily/period attribution remain open.
Dashboard monthly inputs use captured shares/scale; current progress charts use
preserved balances, including former participants. Hours remain with the worker.
Unknown-effect and unsettled daily/non-additive inputs show unavailable safeguards.

Upgrade preserves task/log/snapshot identities and old values. Existing timer
state remains readable; new execution versions start at0. Duplicate legacy timer
source links make migration12 fail for reconciliation rather than silently
removing records. Applied production history/anomaly counts remain unknown.
Unbounded Final report periods conservatively block affected dates until their
periods are reconciled; snapshots/final reports block affected worker/credit
recipient corrections. Frozen-period revision control itself remains M12.

## Timer date and record-policy blockers

Existing timer draft code used UTC stop date, rounding elapsed hours to2 decimals,
and separate log/timer writes. The live M02 command calculates server duration
and retains start/stop/seconds. Safe same-day stops are enabled only when start/
stop UTC and Asia/Kolkata calendar dates agree. Cross-midnight/month/timezone
ambiguity returns an error and keeps the timer running. No split or business
cutoff is invented. Zero or positive durations rounding to0 stored hours are
rejected with keep-running/discard options; manual0-hour progress entries retain
existing behavior. A final zero-duration/day policy answer is still pending.

Removal remains blocked. Recommendation awaiting approval: retained reversal
with a required reason, excluding frozen periods until authorized revision
controls exist. A correction/deletion race cannot delete history: the correction
uses a version and the reversal rejects. This tests the safeguard, not an enabled
reversal workflow.

## Application and durable jobs

Log drawer/history, task timer/manual-time controls and task-tool execution forms
call authorized RPCs. Client operation keys survive uncertain responses in tab
session storage (request digest, UUID and original expected version only, not notes/content), while DB
receipts remain authoritative. Explicit manual log dates keep retries stable across midnight. Forms disable repeats and show typed validation,
permission, conflict and unavailable errors. Views revalidate only after a
confirmed command result. Browser behavior remains to be tested natively.

Outbox rows commit with execution and contain entity/version, operation key,
minimal invalidation payload, attempts/status/lease/error fields. They start
blocked on M03/M05/M07 dependencies. No worker grants, provider call, Google Drive
operation, award schedule or claim of successful automation is introduced.
M05/M07/M10 will implement narrow job claim/retry/complete interfaces.

## Actual verification and environment

Local disposable PostgreSQL17.11 on loopback15432 uses the cached portable
binaries/data from M01, outside the repository. Only literal M02 fresh/upgrade
and predecessor M01 test databases are recreated. Tests do not read .env or
contact the application's configured Supabase project. Auth is a verified-subject
shim; this is not GoTrue/PostgREST token or request integration.

`tools/test_m02_database.py` verifies fresh01-13 and upgrade01-11 to12-13, preserving
old requested logs/snapshots with unknown effects. Real connections test concurrent
increments/corrections, same/different-key stops, retries/conflicting payloads,
0/100 boundaries, manual corrections, validation, protected direct writes,
active/identity/membership checks, one running timer, injected failures after
source writes, rollback of task/log/timer/credit/audit/receipt/outbox, original
share attribution and safe aggregates. A real client timeout after COMMIT tests
receipt recovery. Local evidence catalog: fixtures/m02-local-evidence.json.

Final results: 31 files/255 tests, TypeScript checking, production build
(20 pages/23 routes), M02 fresh/upgrade suites and M01 predecessor replay pass.
M00 arithmetic fixtures remain 48 fixed/23 pending metadata cases. See STATUS. Native Supabase auth/API and
signed-in browser verification remain NOT RUN: Docker Linux-engine pipe is
missing, and no suitable native test stack/accounts exist. Production grants/
applied history/backfill, provider operations, clean dependency installation and
workbook parity are also unperformed. Production was not used for fault injection.
M01 native verification remains outstanding, not replaced by these SQL tests.

## Remaining answers and next boundary

1. Approve retained log reversal with a reason and frozen-period safeguard, or
   keep removal blocked. Example: removing2 hours/+5 retains the original record
   and reverses its applied effect. Recommendation: retained reversal.
2. Choose timer date attribution. Example:23:30-00:30 spans two dates.
   Recommendation: split at Asia/Kolkata midnight, reject zero-duration stops;
   otherwise retain ambiguous-session stop guards until a later decision.

All independent M02 work is complete with these bounded safeguards. M02 remains
in progress/awaiting decisions and native verification; M03 is not started.
