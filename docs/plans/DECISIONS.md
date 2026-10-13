# Decisions to settle during M00

## M07 authorization and approved choices - 13 October 2026

The M07 pasted request authorizes the sole ten-factor engine, source adapters,
consumers and bounded recomputation. The user approved all three recommended
options in the follow-up reply on 13 October 2026. They are active under
`m07-approved-2026-10-13`; M06 contribution rules remain unchanged. See
[M07 evidence](M07-evidence.md). These approvals supersede the older open
D02/D03/D04 statements for this bounded M07 contract:

1. D02: eligible carried tasks supply as-of workload/criticality/freshness.
   Progress is actual credit earned in the requested business-date window;
   employee productivity uses that numerator and measured regular attendance in
   the same window. Log corrections use original dates/captures at the as-of
   state; manual/checklist credit uses its local effective date, without effort.
   Facts/ideas/suggestions use the approved original-date/as-of M06 populations.
   Completion counts current Done whose completion date is in the window, whether
   on time or late. Example: a scale10 task gaining20% in August and30% in
   September contributes3 scaled units in September. A September10 completion
   due September8 counts once and stays late
   in operational deadline charts. Historical anchors do not invent earning dates.
2. D03: apply normalized participant shares to criticality/freshness and completion
   as well. Criticality/freshness use as-of shares; completion uses shares captured
   when the task entered its current Done episode. No historical redistribution.
   Inactive shares are not reassigned; loading denominator is total eligible
   carried task scale including inactive portions. Two50% assignees receive.5
   criticality for High,1.5 freshness for Super Fresh and.5 completion each;
   team completion remains1. Unknown legacy shares stay unavailable.
3. D04: factor cohorts contain active as-of members with known raw values, including
   measured zero; unavailable values are excluded from that factor's median.
   Missing denominators never become zero, and missing required factors deny a
   final score. Zero attendance/team scale denominators are unavailable; invalid
   attendance denies final ranking eligibility. Exact intermediates are retained;
   display raw/median/delta/components to6 decimals and final scores to2, rounding
   halves away from zero only at display. Example: [0,1,3,missing] has median1;
   .05/8 remains.00625 and loading.30-.25 contributes2 without earlier rounding.

Sales terms remain source-unavailable under the explicitly authorized fallback.
No additional business decision is needed to finish this bounded M07 module. Final scores,
ranking and award certification remain unavailable while sales is unresolved.

## M06 authorization and approved follow-ups - 12 October 2026

Authority: the user's M06 pasted request. It supersedes the earlier no-M06
module boundary and authorizes only M06. Exact M05 approvals above/below were
re-read; none establishes attendance special states or contribution populations.
Implementation/evidence: [M06 evidence](M06-evidence.md).
The user approved both following recommendations in chat. Migration 20 activates
them after independent guarded migration 19. Earlier proposals for these bounded
choices are superseded; neither approval authorizes M07.

1. D02/D10 attendance: validity per Asia/Kolkata day, using all retained
   non-reversed task effort (every task category/state, including timer segments),
   against regular attendance plus separately recorded off-hours once. Regular
   hours exclude off-hours. Require records for each elapsed calendar day in the
   chosen period and every day to pass; spare capacity on another day cannot hide
   an excessive day. Present/Half Day require explicit measured hours, not 8/4
   defaults. Absent/Leave require both hours zero. Holiday/Off Hours have zero
   regular attendance and may record actual off-hours. Example: regular 8 + off 2
   covers effort 10; regular 8 + off 0 does not cover 8.01. This does not settle
   separate employee/award eligibility, scoring cohorts or median windows.
2. D05/D13/D10 contributions: pending as eligible unvalidated and
   rejected/withdrawn excluded. Credit the original business date using state
   actually known at the requested as-of instant. Own pending edits/withdrawals
   are allowed; MD/PE or DM can correct reviewed support records with a reason,
   atomically resetting them to pending. Every version remains. Frozen periods
   deny ordinary corrections/reviews and require a separately authorized revision.
   Example: a September 30 pending fact validated October 2 remains 0.38 when
   reading September as of September 30; an open September read as of October 2
   uses 0.75. A frozen September does not silently change. Legacy unvalidated
   membership and missing review provenance still require reconciliation.

Sales BN/BO/BP mapping is still unavailable in source evidence. The request
explicitly approves independent CRUD with unavailable raw sales, so it does not
block unrelated M06 work or require guessing a mapping. Validation timestamps
are observed server times, never forged/backdated approvals. Actual history
before migration 19's baseline cannot be reconstructed; it is explicitly unknown.


## M05 approved follow-up decisions ? 12 October 2026

The user approved both recommendations. Missing/uninitialized sections block
Done. Managers explicitly confirm intentionally empty sections. Initialized
all-N/A sections satisfy their completion gate. Empty/all-N/A percentages are
unavailable and display Not applicable; Activity does not invent zero or 100.

New checklists consistently start in manual mode. Managers may switch ownership
after reviewing sections, with an exact preview, current version and reason.
Enabling Activity ownership updates current progress atomically without earlier
credit changes; disabling retains current progress. Later checklist changes
capture prospective differences at their effective scale/share versions, while
prior log captures, earned balances and frozen reports remain unchanged. A
missing credit baseline/scale or legacy share contract remains a reconciliation
guard. Zero/unavailable progress is distinct from an unavailable baseline.

These approvals settle this part of D07/D12 only. No scoring/award missing-input
policy, historical share redistribution, M06 or provider operation is approved.


## M04 authorization and implementation choices - 12 October 2026

The subsequent pasted request authorizes M04 native details/templates and both
creation paths. Existing M01 structural rights remain manager-only; no extra
assignee/reviewer editing rights were inferred. Templates are published immutable
versions; task instructions are captured separately from editable content.

D12 did not define a valid-entry predicate. The minimal implementation follows
existing required fields: nonblank tag/title within their current limits, valid
category/priority and an active primary assignee. Deadline and scale remain
optional; Not Started and priority No do not prevent native initialization.
This is an implementation choice permitted by the M04 request, not evidence of
an unavailable workbook auto-trigger. Explicit manual mode defers initialization;
automatic mode is the default for a valid authorized save. Both use one initializer.

No source sample content becomes a default. The blank template has empty
instructions/content and uninitialized Setup/Activity/Closure scaffolds. Existing
unsectioned native templates are retained as immutable review-required snapshots;
managers must publish reviewed native versions before instantiation. Native
readiness does not imply checklist completion or provider success. M05 and real
Drive operations remain outside scope. No additional scale rule is inferred from
the earlier 1-hour/+20% decision; it remains multiplier1 and newly captured log
credit (12.5 scale ?20/100 =2.5), without restating earlier captures.

## Approved M02 follow-up and M03 - 12 October 2026

Authority: latest pasted request and subsequent answers in chat. This supersedes
older module authorization and the two pending M02 proposals below.

- Mistaken logs retain their original data, with a reasoned audited reversal of
  the known actual effect. Preserve later work and frozen periods. Unknown old
  effects and bounds conflicts require reconciliation; no destructive deletion.
- Timers split at Asia/Kolkata midnight, retain a single session and linked dated
  segments, commit/stop together and reuse receipts. Reject zero durations;
  retain short positive durations with precise numeric hours and timestamps.
- D06 answer: missing/invalid dates, future assignments and Discarded tasks have
  visible unavailable freshness. They have no fabricated freshness score.
- D07 answer: assignees/managers may pause/resume via Stopped/On-Hold; only managers
  set Carryover with a reason. Preserve assignment, first-start and deadline
  dates. Manager cancel/reopen require reasons; terminal reopening enters
  In Progress. Done still requires proven section/reviewer gates; current
  section data cannot prove them, so the M05 safeguard remains.
- D01 source resolution: workbook R6 and its status validation do not exclude OT,
  Stopped, On-Hold or Carryover independently. Apply No/Not Started/Discarded/
  below-15/missing-progress/nonpositive-or-missing-scale reasons without a
  universal hours requirement. Priority weights and six calendar states follow
  the request. Sorting ranks remain separate from weights.
- Log/scale ordering answer: a new log credits its applied progress at the scale
  recomputed after including that log's hours. The first 1-hour/+20% log at an
  hours multiplier of 1 creates scale 12.5 and earns 2.5 scaled-progress units.
  Capture that scale/version; later logs, corrections and scale changes preserve
  each earlier original capture. Source effort, scale, progress, credit and audit
  commit together.
- D08 bounded implementation: manual, sourced numeric activity count ? unit
  scale, actual task hours ?12.5?explicit multiplier, and proportional linked
  scale are evidence-backed. Overrides retain an explicit zero. New scale
  versions are prospective; original earned scales/shares and frozen reports
  are retained. Activity counts are sourced inputs, not invented native
  checklist counts. No extra family or historical reweighting is enabled.

M02 follow-up and M03 are authorized. Production, M04/M05 and the ten-factor
engine remain outside scope. No further business answer blocks this bounded
implementation; legacy reconciliation and native verification remain required.

## Approved M02 decisions - 10 October 2026

Authority: user's pasted M02 request. D03 share changes are prospective, with
an effective timestamp/version; earlier earned credit and frozen reports stay
unchanged. Historical redistribution requires separately authorized audited
correction. Non-additive completion/criticality/freshness attribution remains open.

D07 completion requires all applicable Setup, Activity and Closure items and
all required assigned-reviewer approvals. N/A does not block completion;
uninitialized checklists are not complete. Managers may cancel/reopen with an
audited reason. These approvals do not authorize M03/M05 implementation now;
terminal safeguards remain until reliable section/review enforcement exists.

M02 is authorized; M03, production migrations and deployment are not. Log
removal/retention and timer day attribution questions are pending; independent
commands can proceed while their affected operations remain safeguarded.

## Approved M01 decisions — 10 October 2026

Authority: user's pasted M01 implementation request. These entries supersede
the earlier proposals/questions only to the extent stated here.

**D03 — partially confirmed.** Participant shares are configurable, total 100%,
and default equally. They allocate additive task scale and scaled-progress
credit without inflating team totals. Logged hours stay with the actual worker.
Completion, criticality and freshness attribution remain unresolved. Historical
share changes are prospectively governed by the superseding M02 decision.
No automatic historical score/snapshot rewrite or secondary-credit backfill is
authorized; prepare a dry-run reconciliation first. Implementation precision:
integer millionths of the whole share (100%=1,000,000 units); equal allocation
uses floor(1,000,000/n), then one extra unit for the first remainder participants
sorted by UUID. This is share representation, not D04 scoring precision.

**D13 — permission boundaries confirmed.** All rights require an active
authenticated account. Managing director: administration, award overrides,
month close/revisions. Project engineer: task administration/reviews, no award
override/month close/revisions. Data manager: supporting-record administration
and validation, no structural task/award/month-close powers. Assignee: own
logs/timers, assigned progress/permitted statuses/checklist completion. Managers
control checklist structure. Assigned reviewer: review/approval only, no extra
structural rights. Anonymous/inactive: no protected writes. Contributions cannot
be self-validated and validation retains an audit trail. Detailed reports are
visible to their employee and MD/PE managers; team summaries to active team
members. Workers use narrow audited commands, no browser service-role key.

Approval of month-close authority does not define the M12 close/reopen workflow.
D07 transitions/review gates and D02/D04/D05 scoring/input policies remain open.
At M01 handoff only M01 was authorized; the later M02 authorization above
supersedes that historical boundary. Production migrations/deployment remain unauthorized.

The table below tracks remaining choices; approved portions above supersede its original proposals. Do not ask all questions at once during implementation. Group only the choices that block the active module; continue independent work. A recorded user answer supersedes the proposal below.

| ID | Decision | Evidence / proposed treatment | Blocks |
| --- | --- | --- | --- |
| D01 | Source-resolved eligibility | R6 excludes no extra OT/status category; M03 uses confirmed exclusions and approved transitions. | Implemented; M07 consumes the same contract |
| D02 | Period and as-of definition of each raw factor | Approved 13 October: carried as-of workload/criticality/freshness; actual period earned progress over same-period regular attendance; current Done completion in period including late. Team-average productivity remains unavailable; M08 selection/M12 revision rules are separate. | M07, M08, M12 |
| D03 | Remaining non-additive and period participant credit | Prospective share changes, preserved prior credit and actual-worker hours are approved. Approved 13 October: normalized as-of criticality/freshness and Done-entry captured completion shares; inactive portions retained in loading denominator. Historical redistribution still needs separate authorization. M02 preserves effective credit versions; daily non-additive trends remain safeguarded. | M03; M07/M08 |
| D04 | Median cohort, zero/missing values and numerical precision | Factor-specific cohorts required. Missing attendance does not silently become0 productivity; observed0 is distinct. Approved 13 October: active-as-of known-value cohorts including measured zero, missing excluded per factor, exact intermediates, six-decimal factors/two-decimal score display with half-away rounding. Loading stays fractional internally. | M07 |
| D05 | Contribution and sales scoring populations | M06 approves pending credit, rejected/withdrawn exclusion, original-date/as-of states and correction reset. Legacy populations/review provenance need reconciliation; BN/BO/BP mapping remains missing. Preserve coefficients without guessing sales fields. | M06 final scoring inputs; M07 |
| D06 | Approved unavailable date cases | Missing/invalid dates, future assignments and Discarded tasks remain operationally readable with unavailable freshness. | Implemented M03; missing dates require data correction |
| D07 | Approved lifecycle, section representation pending | Reasoned manager cancel/reopen/Carryover and assignee pause/resume are implemented. Assigned reviews invalidate on relevant work. Done requires initialized section evidence unavailable until M05; no implicit completion. | M05 Done evidence |
| D08 | Supported prospective scales; custom/history rules remain open | M03 supports the source-backed families, explicit multipliers/overrides/provenance and scale versions. New/custom families, legacy derivation recovery and historical reweighting require separate evidence/authorization. | M09/custom formulas; M07 historical inputs |
| D09 | Uneven split bounds, status/date copy and batch phase semantics | Actual script allows amount<=source despite prompt saying<=half. Weekly/day-count/all-team/suffix handlers are named but bodies are missing; define parameters/dates/count limits explicitly. | M09 |
| D10 | Attendance validity, day cutoff, award ties, holidays/off-hours and override effect | M06 approves per-day Asia/Kolkata regular+off capacity once and explicit special-state rules. Award eligibility/ties/no-winner/overrides remain M08 decisions; no bonus scoring. | M06, M08 |
| D11 | Drive ownership/account, destination root, scopes, template tree, reviewer sharing and native/external checklist authority | Recommended app-native checklist is canonical and Drive copy is an asset unless two-way sync is explicitly wanted. Configure provider access; do not use hardcoded script IDs as deployment defaults. | M10 |
| D12 | Auto-generation validity, tag edits, deletion/archive, historical import and duplicate inheritance | Recommended saved valid entry triggers initializer, stable tags or audited aliases, archive over destructive removal, duplication resets execution state. Existing docs say no historical import, but confirm whether that is current user intent. | M03, M04, M09 |
| D13 | Remaining close/revision workflow and closed-task fields | Role and report visibility boundaries are confirmed above, including director-only close/revision/override authority. Versioned revision mechanics, late corrections and closed-task field changes still need decisions. | M12; D07 lifecycle |

## Decision record template

```text
ID:
Question:
Evidence reviewed:
User answer / authority:
Chosen rule and units:
Effective rule version/date:
Affected modules, migrations and acceptance cases:
Status: proposed / confirmed / superseded
```

## Confirmed decisions already available

- All ten factors use raw value minus median, with the workbook's outer coefficients retained.
- Both manual/menu and automatic task creation are required.
- Existing manual/formula-derived scale mix is retained.
- Equal-weight nested checklist rollups with N/A exclusion; Activity drives task progress and Setup/Closure are separate.

Do not reopen these established decisions without a new user instruction.

## M00 evidence update — 10 October 2026

No new business decision is confirmed in this session. Inspection can settle
source facts, not discretionary policy. [M00 evidence](M00-evidence.md),
[SOURCES](SOURCES.md) and the [permission draft](M00-permissions.md) record the
distinction. Fixed cases are in fixtures/m00-confirmed.json; 23 unresolved
examples carry null expected results in fixtures/m00-blocked.json.

| Decision | New evidence / remaining block |
| --- | --- |
| D01 | Source validation explicitly includes Stopped, On-Hold, Carryover. R6 excludes No/Not Started/Discarded/<15%, no separate OT condition; app OT exclusion differs. Extra status and OT target mapping still unapproved. |
| D02 | Summary E and completion count inputs absent in XLSX. Raw source names mapped for all ten factors; continuous-window/cumulative/completion deadline semantics remain open. |
| D03 | Join participants exist with role/primary flags, no shares; workload credits primary, logs actual worker. Requires additive credit choice; question below. |
| D04 | Existing two-decimal rounding loses 0.00625 employee rate and rounds even median 1.0025. Intermediate precision invariant confirmed; exact storage/display precision, missing/zero and cohorts remain open. |
| D05 | Sales log headers map to current built-up-area text, new-project and basement-payment flags; Summary BN/BO/BP formulas/headers absent, so their scoring mapping is not confirmed. Only validated/unvalidated coefficient arithmetic is fixture-ready; booleans cannot prove pending/rejected/deleted populations. |
| D06 | Source L6 blanks missing assigned date; due-date blanks can be treated numerically by original formula. Target safe missing/future/discarded behavior still unapproved. |
| D07 | Home E6 uses Index E13; Setup/Closure are separate. Current engine has no N/A, no roles and allows complete at partial percentage. Empty/all-N/A and review/Done gates still unapproved. |
| D08 | Count(A33:A)×activity_scale; hours Sum(F33:F)×12.5×multiplier; checklist hours version lacks multiplier. Manual scale and dynamic support formula exist in sources. Enabled families/multipliers/history choices not yet approved. |
| D09 | Source uneven prompt <=half versus validation <=whole conflict confirmed. Proportional writes live formula; status/assigned/due copied by source. Four batch-duplication handlers absent. |
| D10 | O4 compares period-like logged versus imported attendance; external attendance source absent. Daily scorer uses attendance as bonus and allows invalid candidates; daily window/cutoff/special states/ties/overrides still decisions. |
| D11 | Real provider side effects in supplied scripts, none in web app. HTML dialogs/template registry/folder tree absent. Account/scopes/ownership/canonical checklist choice open. |
| D12 | Both creation modes and manual/derived scale mix remain established. No auto-trigger source found. Import/tag alias/archive/duplication criteria stay proposals. |
| D13 | Broad authenticated reads, role-based support administration and row-only task/checklist updates found. Actual grants/live state unverified. M01 rights/visibility question below; month close/reopen remains for M12. |

## Smallest next decision set

Ask these two schema/security questions after completing independent M00 work.
Do not ask the entire D01–D13 backlog now. Approval does not start M01 under the
current request; it records the contract for a later selected module.

### Q1 / D03 — Who gets credit for a shared task?

For a scale-10 task shared by two employees and completed 50%, should each get
scale 5 and scaled progress 2.5, or should each get the full scale 10 and progress
5? The latter inflates team additive totals. Recommended: normalized shares
adding to 100%, with equal shares when no manager allocation is specified;
managers can explicitly set 70/30 (scale 7/3; progress 3.5/1.5). Apply the same
shares to additive completion, criticality and freshness credit; logs stay with
their actual worker. Options: configurable normalized shares (recommended),
equal shares only, or another explicitly defined credit system. No share
default, fractional completion credit or backfill is approved yet.

### Q2 / D13 (M01 subset) — Approve the role boundary and report visibility?

Recommended command boundary is [M00-permissions](M00-permissions.md): directors
and engineers manage task structure; employees update assigned work and their
own logs/timers/attendance; data managers administer/validate supporting records;
assigned reviewers approve their assigned task's review fields without changing
scale or ownership. Managers manage checklist structure; assignees check items.
Inactive and anonymous actors cannot write protected records.

For example, a data manager can validate an idea but cannot change another
employee's task scale or override an award; a reviewer can approve a task but
cannot reassign it. Employee detailed reports/attendance should be visible to
that employee and managers, with team-level aggregate performance visible to
the team (recommended). Alternative: retain current team-wide detailed
visibility. Confirm the boundary and choose report visibility, or specify the
exception needed. Month-close/reopen roles, historical inactive read access,
final Done gates and reviewer overrides are deferred choices, not granted here.

## M01 implementation boundary (not a new business approval)

Migrations 10-11 enforce the approved permissions and share representation.
Existing tasks retain legacy mode/NULL shares; a read-only reconciliation precedes
any acknowledged conversion. Logged credit redistribution is unavailable until
historical attribution is chosen. Terminal lifecycle transitions/creation remain
unavailable pending D07/D12; routine open status/progress and review recording
continue. Daily shared progress/productivity/loading/completion/criticality trends
are unavailable pending their attribution/window rules. These are safeguards,
not invented lifecycle/scoring outcomes. See M01-evidence.md for checked boundaries.

Small next decision set, proposed only:
1. Historical shares: recommend versioned prospective changes. Example: A/B
   already earned 50/50 credit; changing to 70/30 affects work after the change,
   while the earlier credit and frozen reports retain 50/50. Restating prior live
   credit is an alternative, but cannot be silently applied.
2. Terminal lifecycle: recommend complete applicable Setup/Activity/Closure and
   assigned reviewer approval before Done, with managers cancelling/reopening
   through an audited reason. Example: Activity 100% with pending review stays
   In Progress. Empty/all-N/A sections still need an explicit interpretation in
   M05. No proposal here has been implemented as an approved rule.
