# Decisions to settle during M00

## M13 source/certification answers — 13 October 2026

The user answered the two M13 source questions:

1. Keep sales, final rankings and certified awards **Unavailable** while the
   original per-employee BN/BO/BP definitions are missing. The user will
   supply the source definitions later. Nearby sales-log labels and the BQ
   combination formula are not an approved field mapping.
2. Keep older records with unproven owner, share/scale, business date or review
   history **non-certified**. A dated source export or record-by-record
   reconciliation is required to establish provenance. No legacy status or
   attribution may be inferred from a current row or old snapshot.

These answers affirm the existing guarded fallback and do not approve
synthetic sales values for real data or a production release.

## M12 approved month archive policies — 13 October 2026

The user's M12 request retains director-only close and correction authority.
Two follow-up answers approve:

1. An incomplete month may be closed as an explicitly non-certified archive.
   Missing sales, history, score, attendance or award evidence remains unavailable
   with reasons and no certified winner. This preserves September's known rows
   without fabricating the missing ten-factor result.
2. A director may authorize correction only for named existing source record
   UUIDs (log/reversal, attendance, fact, idea, suggestion, sale) or a named
   task's dated attribution, within explicit dates inside that month and with
   a reason. Every other closed-month record remains locked. A corrected
   September 30 attendance row does not unlock unrelated September records.

The archive captures the M07 result/source inputs and retained M08 award runs;
it does not approve another formula. Legacy snapshots keep their old rule labels.
The BN/BO/BP sales mapping and legacy provenance remain unresolved and prevent
certified current historical results. No further M12 business choice is pending.

## M08 authorization and approved D10 choices - 13 October 2026

Authority: user's M08 pasted request. Independent selection, atomic evidence,
invalidation, sandbox worker/schedule integration, read models and tests are
authorized. The user approved all three recommended options after independent
work and checks were complete. The following bounded policies are now active:

1. Daily context/gates: month-to-date through the selected Kolkata day,
   finalized just after midnight using an initial end-of-day source cutoff.
   Active-as-of candidates need positive regular attendance that day and valid
   day/report-window records. Known invalid attendance excludes; missing evidence
   blocks comparison. Open corrections create new observed revisions while
   preserving award date/window and the same M07 as-of rules. Every elapsed day,
   including holidays/no-winner days, needs a recorded outcome. Example: October12
   compares October1-12 earned credit/attendance, not only October12 logs.
2. Exact ties: no winner for exact highest daily score ties and final
   monthly ties after equal counts/current exact shared scores. Retain tied IDs
   and reasons; no alphabetic selection or rounded comparison. Zero effective
   wins means no monthly winner. Example: four wins each and exactly10.10 each
   records a tied month without choosing arbitrarily.
3. Overrides: director-only reasoned choice among complete eligible
   candidates; replace the effective daily winner/count and retain automatic
   evidence. No incomplete/failed/stale override. After corrections, fresh
   complete calculation plus director reaffirmation is required before an old
   override counts again. Example: replacing A with B removes A's one effective
   win and gives B one; never count both.

Policy `m08-approved-2026-10-13` is activated by forward23 after independent22.
Initial cutoff is23:59:59.999 Asia/Kolkata; initial observation is at that cutoff,
while retained correction revisions use their newly observed as-of time. The
same M07 factor/cohort/share rules apply; later-assigned tasks cannot enter an
earlier report window. Scheduling remains disabled until separately configured
in a sandbox or explicitly authorized for rollout. Fixture choices are not approval.
Unresolved sales is covered by the authorized blocked-run fallback, not a new
question. See [M08 evidence](M08-evidence.md).

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
| D10 | Attendance validity, day cutoff, award ties, holidays/off-hours and override effect | M06 approves per-day Asia/Kolkata regular+off capacity once and explicit special-state rules. M08 follow-up approves MTD/day-positive attendance/report gates, end-of-day
cutoff, exact no-winner ties and eligible director override count replacement/
reaffirmation. No bonus scoring or production scheduling. | M06, M08 |
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

## M09 outstanding choices - 13 October 2026 (proposals only)

No new business rule is approved by the M09 request beyond its expressly
confirmed support arithmetic/category and prior recorded M01 through M08 decisions.
The independent framework keeps `tool_policy.config` NULL. Disposable tests inject
`m09-draft-fixture-only`, then restore NULL; passing them proves technical behavior,
not approved inheritance. Questions below bundle only related choices:

1. **D09/D12 support and copy inheritance.** Recommended Uneven 0 through whole source
   (matching actual validation, correcting the misleading half prompt), Absolute
   0 through 500 and Proportional 0 through 100%. Even/Uneven use a reasoned prospective override
   while keeping the original scale family and earlier earned captures. New work
   starts Not Started/0%, manual progress, with no logs/timers/approvals or asset
   links. Copy source category/priority/description, exact published template and
   current checklist structure; reset all leaves (including N/A) to No, convert
   linked-task leaves to ordinary items for reassessment, uninitialize sections,
   clear other editable content/comments. Regular copies retain known shares and
   assigned reviewers; support uses one selected active assignee at 100%. Explicit
   new assignment/deadline dates replace inherited old dates; no missing deadline
   is invented. Hours-derived copies start zero without an existing explicit
   override; other scale families retain their measured inputs/override. Example:
   scale10 Even creates5 and reduces the source to5, preserving previous earnings.
2. **D12 phase/batch semantics.** Recommended weekly=count contiguous seven-calendar-
   day phases; day-count=count phases of explicitly chosen calendar days; all-team=
   one independent task per active member; number/suffix=count independent copies
   on the explicitly chosen dates with numbered title suffixes. Phases repeat the
   source's applicable scale family rather than dividing it; source unchanged.
   Recommended all-or-nothing batches including Done/Reopen: one stale task or
   failed checklist/review gate rejects the entire batch and identifies its tag.
   Example: Nov1 weekly2 produces Nov1 to 7 and Nov8 to 14. These source handlers are
   missing, so these are newly defined native parameters, not replication claims.
3. **D12 dated handoff/archive/import scope.** Recommended carry earlier unfinished
   work into the current started month as remaining manual scale and 0% new progress;
   source identity/dates/earned credit/history and old reports remain retained.
   A reasoned dated handoff prevents further source execution and avoids duplicate
   current carried workload; it does not erase actual period earnings. Example:
   scale10 at40% produces new scale6 at0%, retaining old earned4. Recommend retained
   manager archive with a reason instead of deletion, and defer historical import
   until provenance/source mapping is explicitly requested. Archive population and
   write-boundary activation remain pending; no current scoring policy is changed.

None of these recommendations is a user-approved deferral or activation. Actual
carryover/archive execution remains blocked even in draft fixture configuration.

## M09 follow-up approvals - 13 October 2026

The user answered all three M09 questions: "Approve recommended bounds and copy
defaults", "Approve calendar phases and atomic batches", and "Approve remaining-
work handoff, archive and import deferral". This expressly supersedes the earlier
M09 pending-policy notes, but does not authorize production apply/deploy, Drive
operations, M10/M11 or a scoring/award formula change. Forward25 activates the
exact D09/D12 contract after24; the earlier draft tests remain historical evidence.

Approved D09: Uneven 0 through the whole source; Absolute 0 through500; live
Proportional 0 through100%, including exact fractional percentages. Even/Uneven
use audited prospective source overrides, preserving formula inputs and earlier
credit. Skill usesSD; Effort retains source category.

Approved D12 copy contract: Not Started/0%/manual progress, explicit new dates,
no logs/timers/approvals/assets; retained metadata description/category/priority,
exact published template version and current checklist layout. All leaves,
including N/A, reset toNo; linked leaves become ordinary items; sections become
uninitialized; other editable content/comments clear. Copies preserve known
shares/reviewers; support has one chosen active assignee at100%. Hours-derived
copies restart atzero unless an explicit override exists. No historical share
reassignment, hidden alias, scale reweighting or provider-file copying is granted.

Approved D12 phases: consecutive seven-calendar-day weekly periods; explicit
calendar-day/count phases; all-team one independent task per active member;
number/suffix counted independent copies on explicit dates. Each repeats the
applicable source scale family and does not reduce the source. All batches are
atomic, with failing tags and existing Done/review/reopen gates.

Approved D12 handoff/archive: earlier unfinished measured work carries into the
current month as new remaining manual scale and0% progress. New task relationship
and reasoned dated predecessor archive commit together. Predecessor identity,
original dates/earnings/source records and earlier-period reports are retained;
ordinary writes are blocked, and it leaves subsequent carried workload. Example:
10 at40% becomes new6 at0% with old4 earned intact. Current carried loading,
criticality and freshness exclude an archive effective within that report window
and known at its as-of date; retained period earnings and actual Done completion
remain counted, and later archive dates do not alter earlier-period factors.
Reasoned manager archive replaces physical removal. Historical import is
**deferred by user** until explicitly requested with source mapping/provenance.
No general restore/revision authority or reconstructed historical provenance is
invented. Active timers must be stopped before archival to avoid stranding effort.

## D11 implementation proposal and outstanding setup - 13 October 2026

The M10 request authorizes independent code/tests and asks for missing setup
afterward; it does not answer D11. No ownership/root/template/sharing/checklist
authority decision is recorded as approved. Forward26 defaults to NULL policy.
The adapter supports organization Shared Drive/service identity or organization
OAuth with an explicit approved scope; native canonical checklists only; mapped
commenter access on new files or no added sharing; explicit employee/task/role
paths, registry versions and supported kinds; manual/optional auto initialization.
Recommended initial configuration and exact questions are in M10-configuration
and M10-evidence. No consent/Picker UI, automatic legacy-folder adoption or
external checklist sync is inferred. D09/D12/M07/M08 approvals remain unchanged.


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


## M13 hours display format approved by user - 15 October 2026

The user selected "2 decimals + \"<0.01 h\" (Recommended)". It settles only the
display part of D04's precision question for hours:

- Every on-screen hours value shows two decimals, keeping each surface's
  existing unit convention.
- A non-zero value that would round to 0.00 shows as `<0.01` (or `>-0.01`).
- The Logs seconds special case is removed.
- The text report export uses the same format.
- CSV/JSON exports keep exact stored values for reconciliation.

Stored precision (unbounded `numeric`), every calculation, and the approved
six-decimal factor and two-decimal score displays are unchanged. Implemented by
`formatHours` in `lib/tracker/format.ts`.

## Dashboard cleanup approved by user - 15 October 2026

The user approved the proposed dashboard structure ("ok do it") together with
the recommended answers to its three open points:

1. **Open overdue.** The figure counts open, unarchived work due before the
   live as-of date. Previously it counted everything due before month end,
   which showed 14 mid-month when 0 tasks were actually past due. Past months
   keep the period-end boundary. A carryover-archived predecessor is no longer
   counted as open.
2. **Scaled-credit tile.** It shows two decimals. Six-decimal factor values
   (D04) remain in Calculation details.
3. **Per-member inputs.** They follow the existing presentation scope: a
   member sees only their own breakdown, and managers see the team.

Plain wording replaces raw reason codes on the dashboard. The codes stay in
Calculation details, exports and data. No calculation, permission or
availability safeguard changed otherwise.


## M14 nested checklist pages approved by user - 16 October 2026

The user shared screen recordings of their Google Sheets tracker and asked for
every feature in TaskPulse, with a seamless UI. They highlighted that every
master-checklist row can be a "page" with its own rows, nesting as deep as
needed. Their answers to the follow-up questions:

1. **Checklist pages, not separate tasks.** A Page row opens its own checklist
   page (result, progress, back link, breadcrumb, rows). It stays part of the
   parent task: no separate task tag, participants or scoring. The approved
   M05 rollup is unchanged (each parent weights applicable direct children
   equally; an empty page has no applicable work).
2. **Assignees and managers build the checklist.** Active task assignees may
   create the checklist and add, edit and remove rows. Section mapping, section
   gate confirmation, the progress-owner switch and links to real tasks remain
   manager-only. Edit and removal reasons are still required.
3. **Links and time per row.** Rows carry up to ten http(s) links and an
   estimated time in whole minutes.
4. **Item timer: elapsed time comes from a timer on the item.** In a later
   reply the user decided that "stopping an item timer should save a normal
   task log for that task, tagged with the item, so task hours, productivity
   and reports include it." Item time is therefore never a second, separate
   hours figure: it is the sum of that item's tagged, unreversed task logs,
   and a page shows its whole subtree.
5. **Rest of the sheet: audit, then fix gaps.** After the checklist pages, each
   sheet feature is compared with the app and the gaps are listed for the user
   to prioritize.

## Missions headline strip approved by user - 16 October 2026

The sheet tracker's Tasks header shows team leaders and three coloured team
figures. The user approved the recommended answers to three questions:

1. **Colours.** Red/amber/green bands from the sheet's cut-offs:
   - allocation spread: green up to 5%, amber above 5% up to 7%, red above
     7% (lower is better);
   - team average productivity: red below 4, amber 4 to below 7, green 7 and
     up;
   - team average progress: red below 50%, amber 50% to below 75%, green 75%
     and up.
2. **Leaders reuse the dashboard's shared-engine figures.** "Critical team
   member" is the highest criticality score, "Most productive" the highest
   productivity, and "Most loaded" the largest loading difference above the
   team median. Missing values show "Unavailable", and a tie names nobody.
   Allocation spread is the dashboard's spread.
3. **Averages run over the month's tracked tasks.** These are tasks carried in
   the period that are not archived or Discarded. Team average progress is
   their mean progress %. Team average productivity is their mean task
   productivity over tasks with logged hours.

Implementation choice, consistent with the dashboard's per-member presentation
scope (15 October entry): leader names and values show only with the manager
team-detail scope. Members see the aggregate team figures and a note that
leaders are visible to managers. No calculation, permission or scoring rule
changed; the strip only presents existing figures.

## Team Index holiday marks, report validity and item hours - 17 October 2026

The user said "Do them yourself" for the remaining sheet-parity gaps 4 and 5.
These display choices change no attendance, award, scoring or permission
rule, and can be revised:

- **Holiday "H" in the daily star log.** TaskPulse has no company holiday
  calendar. Holidays are recorded per member as attendance status Holiday. A
  date shows "H" (and counts in "Holidays (n)") when every active member has
  an active Holiday record that day. `team_holiday_dates` (migration 37)
  returns those dates only, so members see the marker without reading other
  people's attendance.
- **Report validity.** The sheet's "Reports Validity" column shows "Valid"
  when the member's live month calculation is complete. Otherwise it shows
  "Incomplete", with the existing unavailable-input reason.
- **Hours by checklist item.** Employee reports list the employee's
  item-timer hours by task and item for the period, up to the as-of date.
  These are part of task hours, not additional hours. The breakdown uses
  logs the viewer may already read on that report. Report exports are
  unchanged.

## Quick "Create work file" approved by user - 17 October 2026

The user chose the quick option for the sheet's "Create Work Files" ahead of
the full Google Drive setup. They asked for a plain step-by-step guide for
anything only they can do: `docs/setup/WHAT-I-NEED-FROM-YOU.md` covers the
sales BN/BO/BP screenshots and the Drive provisioning steps.

- Each open mission shows assignees and managers a "Create work file" panel:
  - shortcuts to a new Google Doc, Sheet or Slides file in the person's own
    account (docs.new, sheets.new, slides.new);
  - the suggested sheet-style name `[Task tag] - [Title]`;
  - a form to save the file's link under Inputs, Process or Outputs.
- The panel says TaskPulse saves the link only. It never claims to create,
  rename or share the Google file (AGENTS rule on Drive representation).
- Assignees may now add ordinary http(s) work-file links to their own tasks.
  In the sheet the task owner fills these columns, so this matches the
  sheet's practice. Linking a related employee or report, and all other
  detail commands, stay manager-only (migration 38).
- The full Drive integration remains deferred until the user completes the
  guide's Part 2 and asks to resume it.

## Multi-company TaskPulse approved by user - 17 October 2026

The user said selling TaskPulse to other companies is a real goal, and chose
the recommended answer to each of four questions:

1. **Separation:** one shared database. Every company-owned row carries its
   company, and PostgreSQL enforces separation.
2. **Rules:** the same engine and formulas for every company; per-company
   settings may vary.
3. **Onboarding:** the platform owner creates each company and its first
   director. Self-serve sign-up and billing come later.
4. **Existing data:** Saahithyaa becomes company #1 and its data is migrated
   in.

`docs/plans/M15-multi-company.md` holds the phased plan (M15.1-M15.6) and the
open questions (timezones, one person in several companies, per-company
wording). Production launch now happens through M15.6. Drive moves to a
per-company "Connect Google Drive" (OAuth, `drive.file`) in M15.5, replacing
the single-company service-account setup. Implementation has not started and
awaits the user's go-ahead.
