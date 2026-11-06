# Task Tracker project instructions

## Code layout - modules (refactor completed 18 October 2026)

The user asked for a modular codebase (facade per module, one short branch per
change). The refactor is complete and merged into `main`. Follow
`docs/ARCHITECTURE.md`:

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
- Planning docs (`docs/plans/`, including PLAN.md, IMPLEMENTATION.md, RULES,
  DECISIONS, STATUS and module evidence) and reference material (`reference/`:
  steering specs, Stitch designs, the original Apps Scripts) are gitignored here
  because this repository is public (18 October 2026, user request). They live in
  the private repo `Sahana05S/taskpulse-notes` at the same paths: run
  `bash tools/notes.sh pull` before reading them and
  `bash tools/notes.sh push "message"` after changing them. Test fixtures live in
  `__tests__/fixtures/`.

## Follow-ups - 6 November 2026 (migrations 127-128)

User decisions of 6 November 2026, after Notes:

- **No notes; labels only (129, replaces 127 and the Notes section below):** every note, note link
  and the 26 starter hashtags were deleted; the note commands are revoked; `labels_for` is the 112
  body again. A mission's labels are set in its Labels panel (Details) and the New mission form; on
  the Today map picking a label draws lines between its missions by default.
- **No rows under objectives (130):** every row that had rows under it became a Quest (deepest first,
  node ids and progress unchanged); `checklist_command` refuses add, Quest or move under a row; the
  row menu has no "Add a row under this" and no Move section. Rows go into a list (mission or Quest).
- **Quest owner requests (131):** whoever may assign a Quest may ask an active member outside the
  Crew (not a reviewer) to own it; the person accepts on Today and joins the Crew (equal shares) as
  the Quest's owner, or declines. One waiting request per Quest, no re-asking within 7 days of a
  decline, at most 10 waiting and 20 a day per sender.
- **Checklist row menu:** the same ⋯ menu on every row of Table, Board, Blocks and Outline
  (`ChecklistRowMenu`); the Table shows no links; no reason box on edit, move, link or remove (128
  drops the edit reason rule; a removal sends the row's title as its reason).
- **Activity (128):** Team > Activity and the History tab name the objective or Quest and show
  before -> after values (mission fields, lifecycle values, an objective's title and tick), only to
  those who may read the mission's work. A note's text is never copied into the audit (126 rule kept).
- **Files:** Input → Process → Output is drawn as one flow with arrows; Proofs stay under it.
- **Today map:** a sub-mission hanging from a Quest sits just beyond that Quest with a short line.
- **Speed:** no `router.refresh()` after a command that already revalidates (Next returns the
  refreshed page with the action); `getAuthState` uses `getClaims()`; the mission page reads in one
  batch and has its own `loading.tsx`.

## Notes - 6 November 2026 (migration 126)

The user replaced Mistakes and learning with one **Notes** panel (result in
`docs/UPDATE-PLAN-2026-11.md`, "Notes (6 November 2026)"). Decisions to keep:

- A note is a short text with one or more hashtags (workspace labels) and at least one **type
  hashtag**, enforced in PostgreSQL (`mission_note_command` and a deferred constraint trigger).
  Managers choose the types in Settings > Company > Labels (`labels.note_type`).
- Notes belong to a mission, a Quest or an objective (`mission_learnings.checklist_node_id`); the
  mission page lists them all and names where each came from; checklist rows and Quest homes open
  the panel scoped to that row. The author edits; the author, Managers and the MD delete.
- Starter hashtags exist once per company by slug (types #mistake #learning #idea #decision #risk
  #blocker #followup; topics, causes and impact as listed in the plan); never duplicate them.
- Privacy stays `can_read_mission_work` (117). Notes and hashtags feed no score.
- The table `mission_learnings` and the label subject kind `mission_learning` are reused;
  `mission_learning_command` and `mission_learnings(task)` remain as compatibility paths.
- "Mistakes and learning" no longer appears in the interface; hashtags are never called tags.

## Revision 2 - 5 November 2026 (migrations 121-125)

The user's "Revision 2" plan (result in `docs/UPDATE-PLAN-2026-11.md`, "Revision 2"). These
decisions replace the matching 3 and 4 November lines below (Owner/Collaborators, 3 Quest levels,
one timer per mission, four roles):

- **Mission Crew (121):** everyone on a mission (any `task_assignees` row) is Crew: logs time, marks
  Done, equal credit (shares always equal; no Lead; one internal primary row stays for
  `check_participants`). Crew changes (`task_people_command` `add_crew`/`remove_crew`) belong to
  the MD and Managers; Crew choose observers; `transfer_owner` is retired.
- **Quest owners (122):** `checklist_nodes.assignee_id` on Quest rows; inside a Quest only its
  owner, owners of ancestor Quests, the MD and Managers change rows (`can_edit_quest_list`); the
  mission's root list stays open to all Crew; nesting is unlimited (cycle-guarded).
- **Quest timers (123):** one running timer per person per Quest (`checklist_node_id`); several
  at once; `quest_time` rolls sub-Quests up; a mission timer only while the mission has no Quests;
  scoring keeps using task hours and merged day hours.
- **Mission activity (124):** `mission_activity(task, before, limit)` for the History tab, named
  from the audit rows; proofs are audited and listed.
- **Roles (125):** Managing Director, Manager, Team Member. `project_engineer` stays the internal
  code for **Manager**; `data_manager` is retired (no new assignments). No one is Manager today.
- The repository is public again (5 November 2026, user decision) because private Actions minutes
  ran out; keep CI lean.

## 4 November 2026 updates (migrations 116-120)

Follow-up requests after the 3 November work (result in `docs/UPDATE-PLAN-2026-11.md`,
"Follow-up changes"). User decisions to keep; they replace the matching 3 November lines below:

- **Checklist visibility (117):** a mission's checklist and work content (checklist, detail
  sections, links, learning notes, files, branch/review/time reads) are visible only to the
  managing director, the mission's Owner, assignees and collaborators (`task_assignees`), and its
  reviewers and observers (`task_reviewers`): `can_read_mission_work`. Project engineers see them
  only on missions they are on. Mission rows themselves stay visible company-wide. MD, Owner and
  credited assignees decide observers. **Collaborators cannot mark a mission Done; observers can
  view files but not upload or remove them.** Scoring, reports and awards read as the definer and
  are unaffected. Since 120 a project engineer who is not on a mission also cannot change its
  checklist or details, and sees its Team > Activity lines only when on it.
- **Several timers at once (118):** at most one running timer per person **per mission**. Each
  mission keeps its full logged time; every daily total (attendance validity, reports, Daily perf
  log, analytics, policies) uses the **merged** time (`member_day_hours`, `mergedSeconds`).
- **Check-out report (119):** four blocks split by company break times (morning tea 11:00, lunch
  13:00-14:00, evening tea 16:00; Settings > Company > Check-in), each listing missions and the
  block's merged productive hours.
- **Objectives:** the tick offers only **Yes and N/A**; "not done" is shown empty and is still
  stored as `'No'`. A sent-back objective shows "Changes needed".
- **Files:** one Files panel (Input, Process, Output, Proofs); upload first, links optional; the
  managing director connects the Shared Drive in Settings > Company.
- **Labels** show as chips on missions and filter the Missions page; label changes appear in Team >
  Activity (116).

## 3 November 2026 updates (migrations 107-115)

The user's 3 November calls (plan and result in `docs/UPDATE-PLAN-2026-11.md`)
were built in parallel lanes, one branch and one migration each, all merged and
live on 4 November 2026. User decisions to keep:

- **Mission people (108):** Owner, assignees, zero-share **Collaborators** (edit the
  mission, details and checklist; never log time: `is_task_worker`) and
  **Observers** (`task_reviewers.reviewer_role='Observer'`: follow only, never
  review, never block Done). The managing director, project engineers and the
  mission's Owner manage people (`task_people_command`). Task Tools copies keep
  both roles (115).
- **Checklist words and depth (109):** rows are called **Objectives** in the
  interface only (`node_type='Item'` stays). A Quest may hold Objectives, Quests and
  Sub-missions, at most **3 Quest levels**.
- **One timer per mission (110):** no timers on checklist rows (data and the offline
  RPCs stay); each session lists what was changed while it ran, on the mission's
  History tab and Reports > Mission activity.
- **Objective review (114):** Acknowledge / Work needed per objective by managers and
  non-observer reviewers; **pending or Work-needed objectives block Done**; Work
  needed un-ticks the row through the normal path (no new scoring rule); a time log
  no longer clears mission approval.
- **Mistakes and learning** live on the mission page (111). **Labels** (112) are
  never called tags (`task_tag` is the mission identifier); names are English
  letters and digits.
- **WhatsApp (no migration):** the app drafts the message and the member picks the
  chat (`wa.me/?text=`, no stored number): a greeting with the check-in time and a
  daily positive note; the daily report at check-out.
- **Org chart (107):** several top-level managing directors share one leadership row.
- IPO documents upload into the Shared Drive at mission level (113); the Today map
  is a constellation of real mission links with no new dependency.
- Everything stays in **English**. The new Stellar icon is **postponed** by the user.

## Drive file storage (go-live Part F) - 2 November 2026

The user asked for personal documents and proof files to live in the company
Shared Drive "TaskPulse Files" (Shared Drive `0AAPGxr_KsNNxUk9PVA`, service
account `stellar-files@stellar-files.iam.gserviceaccount.com`, key in the
Vercel secret `TASKPULSE_DRIVE_SERVICE_ACCOUNT_JSON`); check-in photos stay in
Supabase. This is separate from the deferred M10 mission work-folder module
(`modules/drive`), which stays off. Module `modules/files`, migration 100:
Supabase storage stays the upload inbox, the server moves each recorded file
into the drive after the response and deletes the inbox copy only once the
Drive id is recorded; every view goes through `/api/files` and `file_access`.
Nothing in the drive is shared with staff. Proof decisions (user, 2 November
2026): mission proofs visible to the mission's assignees and reviewers plus the
managing director and project engineers (built: migration 101, Proofs panel on
the mission's Work tab); sales proofs to the entry's salesperson plus those managers
(built: migration 102, a Proofs block on each Sales log entry); PDF, images and Word/Excel/PowerPoint up to 25 MB each.

## Full audit and fixes - 31 October 2026

The user asked for a check of every aspect of the app (testing, security,
logic, old features) and for the findings to be fixed. Branches
`claude/mobile-app-audit-33gcb7` (web) and `shell/user-agent` (stellar-mobile).
What changed, beyond small fixes:

- No Google sign-in (user request); accounts are invitation-only. Keep the
  Google provider off in Supabase Auth, Confirm email on, and email templates
  on `token_hash` links (modules/auth/README.md).
- No public landing page inside the Android app: the shell appends `StellarApp`
  to its User-Agent and `proxy.ts` sends a signed-out app request for `/` to
  `/login`; `NativeLandingRedirect` covers shells built before the marker.
- Migration 94: phone registration never worked (PostgreSQL rejects regex
  repetition counts above 255, so 91's `{20,4096}` failed every call);
  invitations apply only to confirmed addresses; members cannot edit their
  own `users.email`; deactivation disables phones; one push token, one owner.
- Migration 95: a director's award override counts as that day's winner
  everywhere. Migration 96: photo check-out after midnight closes yesterday's
  check-in.
- Security headers in `next.config.ts`, Next 16.4.3, worker endpoints check the
  bearer before revealing setup, emailed links use `NEXT_PUBLIC_SITE_URL`.
- When rewriting a function in a migration, start from its live definition
  (`pg_get_functiondef` on a database at the previous migration), not from the
  file that first created it: migrations 40 and later rewrite bodies in place.
- Kept on purpose, pending the user's decision: `modules/drive` (deferred, no
  UI), the legacy tables `daily_star_records`, `performance_score_components`,
  `monthly_performance_snapshots`, `checklist_templates`(`_nodes`), and the
  historical `tools/test_m0*`/`test_m13_*` evidence scripts and fixtures.

## Working from the cloud - 26 October 2026

The user works from their phone in Claude Code cloud sessions (claude.ai/code),
not from the laptop. Vercel deploys `main` to the demo site, Supabase hosts the
demo database and GitHub Actions run the backup, award and migration jobs. The
user's standing rules, which earlier lived only in the laptop's Claude memory
(a snapshot is in the notes repo, `docs/plans/claude-memory/`):

- Start each session with `bash tools/notes.sh pull`. If it cannot reach the
  private repo, say so and carry on from the code; do not invent plan contents.
- Merge your own PRs without asking (merge commit, `gh pr merge <n> --merge`)
  once CI passes, GitHub reports no conflicts and no review feedback is open.
  Never merge with failing or pending checks.
- Migrations reach the live database (Supabase project
  `bdezjektaeqxcntuxqcw` since the 1 November 2026 go-live; the old demo
  project `sbtxtsisjhuciobxykcm` is retired as a target) through
  `.github/workflows/migrate-demo.yml` when they merge to `main` (backup first,
  then each unrecorded file in order). Do not apply migrations by hand. After
  merging a migration, check that run; a failed run means the live site is
  ahead of its database, so fix it with a new forward migration at once.
- Testing stays light: `npm run typecheck`, or one focused test file when
  changing logic; CI runs the full suite and Vercel the build. Do not build
  disposable test databases locally. A database test (`tools/test_*_database.py`,
  with its line in `.github/workflows/contract-checks.yml`) is fine when a
  migration changes who may do what or a rule the user decided; prefer
  extending an existing suite, and let CI run it (user decision, 4 November
  2026, keeping the suites added for migrations 108-116). Check the result on
  the live demo site at the end.
- One short branch per change, named after the module. Every new migration ends
  with `SELECT taskpulse_private.m15_secure();` (see M15 below).
- Never commit secrets, salary figures or other private data to this
  repository; private notes go in the notes repo.
- The TaskPulse Atlas is refreshed once a day at 4:00 PM IST, never after each
  merge or push.

## Mission progress weights - 28 October 2026

The user asked that Setup and Closure count towards a mission's progress
(DECISIONS "Mission progress weights"). Progress = Activity 95% + Setup 2.5%
+ Closure 2.5%; a section with no applicable rows drops out and the others
share its weight; no applicable Activity gives no figure. It is the one
figure in `tasks.progress_percentage` (credit, productivity, reports, awards).
Migration 85 (`85_progress_weights.sql`) replaces `checklist_result`,
re-baselines current projections and recalculates open missions whose figure
changes. TypeScript mirror: `weightedOverall` in
`modules/checklists/internal/progress.ts`; fixtures in
`__tests__/fixtures/checklist-rollups.json`. Sub-missions feed their parent
through their linked row as before.

## M19 HR - 26 October 2026

The user asked for personal records, branded HR templates, performance reviews
and salary graphs (DECISIONS "M19 HR"). Modules `modules/personnel` (Personal
info tab: 10th/12th marksheets, Aadhaar card, college marksheets; visible to
the person and the managing director only; private bucket
`personal-documents`) and `modules/hr` (HR > Documents: letterhead and Code of
Conduct with acceptance; HR > Performance reviews: MD-defined metrics, the
employee's self rating, then the director's, pros and cons). My salary
(`/my-salary`) shows each member their own finalised months; incentives stay
entered by the MD and are only totalled. Download PDF is the browser's
print-to-PDF of a `.paper` sheet (no PDF library). Migrations 78-81. Reviews
never feed a performance score; none of this reaches the activity feed.

## M18 payroll - 25 October 2026

The user asked for the workbook "3_1_c_Employee Management and Info" (salary
calculation and salary records) inside TaskPulse, visible only to the
managing director (DECISIONS "M18 payroll", `docs/plans/M18-payroll.md` holds
every sheet formula). Module `modules/payroll/`, migration 74
(`74_payroll_foundation.sql`): private tables, one calculation
(`taskpulse_private.payroll_compute`), MD-only RPCs. Salary: per day =
monthly / (working days - festival holidays); calculated = per day x (days
worked + 2 paid days); days worked = P + 0.75 UD (Present under the full-day
hours) + 0.5 Half Day; in hand = MIN(calculated, monthly) - (fixed + monthly
deductions - incentives), rounded to the rupee on finalising; advance balance
= advances - "Advance" deductions. Never put salary data on `public.users`, in
audit `protected_changes` or in the activity feed. Importing real salary
figures needs its own go-ahead. Since M19 (26 October 2026, migration 79)
each member also reads their own finalised months on My salary
(`payroll_my_salary`); every other payroll read and write stays managing
director only. Incentives are entered, never computed.

## Checklist: one kind of row - 23 October 2026

The user found the master checklist confusing and approved going back to the
sheet's model (DECISIONS "Checklist one kind of row"): every row is ticked
Yes/No/N/A, and any row not linked to a mission can have rows added under it;
such a row takes the equal average of its rows and its own tick is cleared.
There is no Item/Page/Sub-mission choice, no section review (a section counts
once it has a row; an empty one is N/A and does not block Done) and no separate
structure page (`/checklist/manage` redirects). Linked missions stay, managers
only, from the row menu; rows can move under another row in the same section.
Migration 63 (`63_checklist_one_row_kind.sql`) folds existing Sub-missions in
(Activity rows under the row, Setup/Closure rows into the mission's own
Setup/Closure) without changing any valid mission's Activity progress. Tests:
`tools/test_m63_checklist_rows_database.py`, `__tests__/fixtures/checklist-rollups.json`.
The demo apply of 63 needs its own go-ahead.

## M17 sales factor mapping - 20 October 2026

The user defined the workbook's sales inputs (DECISIONS "D05 sales mapping
approved"): per member and period, BN = eligible sales_logs entries, BO = those
flagged as a new project, BP = those with the basement payment received; raw =
(1.5*BO + BN + 0.75*BP)/50, then the usual difference from the team median.
Pending and validated entries count once; rejected/withdrawn are excluded;
legacy or unattributed entries leave sales unavailable for that member until
reconciled. Migration 46 (`46_sales_factor_mapping.sql`) implements it, so the
composite score, rankings and awards are no longer blocked on sales. The M16
recognition ceremony therefore landed as migration 50 (streaks stay 45). Tests:
`tools/test_m17_sales_database.py` and the vitest cases in modules/support and
modules/scoring.

The same day the user authorized applying 45 and 46 to production after a local
rehearsal, and one production seed of the September 2026 sheet as test data
(people by email, tasks by tag, replacing the three earlier test tasks) through
`tools/seed_sheet_to_project.py`. See `docs/plans/PROD-SEED.md` for what was
actually run. Production remains otherwise off-limits.
## M16 recognition (gamification) - 19 October 2026

The user asked for a gamification layer (streaks, per-metric monthly award
ceremony, leaderboard, daily star highlight, monthly star worth most) and
approved the plan with four decisions recorded in DECISIONS "M16 recognition".
It adds no scoring rule: points are a separate currency and never feed a
performance score; everything ranks on the shared engine and M08/M12 evidence.
Sales was locked until the BN/BO/BP mapping existed; it is now mapped by
migration 46 (M17, above), so composite-based features show their normal state
once 46 is applied and the locked state is only the fallback for older databases. The module is `modules/recognition/`
(`docs/plans/M16-recognition.md`). Migrations 43-44 belong to the F3
follow-up, so recognition uses 45 (streaks) and 50 (ceremony; 46 is sales; there is no 47).
Disposable databases only; no production apply or deployment.

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

Read `docs/plans/PLAN.md`, `docs/plans/IMPLEMENTATION.md`, `docs/plans/RULES.md`, `docs/plans/DECISIONS.md`, `docs/plans/STATUS.md`, and the active module plan. Apply any narrower AGENTS.md instructions in directories you change. User instructions take precedence.

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

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
