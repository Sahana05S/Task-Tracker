# TaskPulse

Advanced multi-metric performance tracker for delivery teams.

TaskPulse weights every task, records the hours worked against it, and measures
each member against the team median for the month. The aim is that a progress
figure can be defended in a review rather than argued about: scaled progress is
computed by the database, productivity is derived from logged hours, and stalled
work surfaces itself.

---

## Contents

- [Stack](#stack)
- [Architecture](#architecture)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Database setup](#database-setup)
- [Domain model](#domain-model)
- [Business formulas](#business-formulas)
- [Security model](#security-model)
- [Project layout](#project-layout)
- [Scripts](#scripts)
- [Known gaps](#known-gaps)

---

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16.3.6, App Router, React 19.3 |
| Language | TypeScript 5.9 (`strict`, no `any`) |
| Styling | Tailwind CSS v4 (CSS-first `@theme`) |
| Typeface | Inter via `next/font/google`, self-hosted, exposed as `--font-inter` behind `--font-sans` |
| Components | Shadcn UI primitives over Radix |
| Icons | `lucide-react` |
| Charts | Recharts 3 |
| Backend | Supabase — PostgreSQL, Auth, Row-Level Security |
| Auth transport | `@supabase/ssr` (cookie-based sessions) |
| Toasts | Sonner |

Data loading uses React Server Components; every mutation goes through a Next.js
Server Action. Client components never write to the database directly.

Every figure in the product — hours, scaled progress, productivity rates,
percentage differentials, composite scores — renders through `.tabular`,
`.stat-figure` or `.sheet-numeric`, each of which sets a monospaced face *and*
`tabular-nums`. Tabular spacing alone is not enough: it equalises digit widths
within one family, so proportional digits still fail to line up down a column.

---

## Architecture

```
Browser
  │
  ├─ proxy.ts ................ edge: refreshes the auth session, turns
  │                            anonymous traffic away from workspace routes
  │
  ├─ app/(workspace)/layout ... second gate: requires a public.users profile
  │                            and supplies it to the shell
  │
  ├─ Server Components ........ read through modules/<name>/index.ts
  └─ Server Actions ........... write through modules/<name>/actions.ts
                                     │
                                     └─ Row-Level Security (final boundary)
```

Authorisation is enforced twice on purpose. The checks in the action layer exist
to produce a useful error message; the RLS policies are the real boundary and
hold even if the application is bypassed entirely.

### Routes

| Route | Access | Notes |
| --- | --- | --- |
| `/` | public | Marketing page. Redirects members to `/dashboard` |
| `/login` | public | Accepts `?tab=signin` / `?tab=signup` |
| `/dashboard` | authenticated | Team analytics, star performer, snapshots |
| `/tasks` | authenticated | Task grid (desktop) and cards (mobile/tablet) |
| `/tasks/[taskTag]` | authenticated | Individual task page with details, links, logs, dependencies and timers |
| `/tasks/[taskTag]/checklist` | authenticated | Master checklist tree with progress sync |
| `/logs` | authenticated | Personal effort history |
| `/timelines` | authenticated | Gantt-style task timeline grouped by assignee |
| `/team` | authenticated | Team index, profile links, reports and daily star records |
| `/team/[employeeId]` | authenticated | Employee profile, reports, logs and individual analytics charts |
| `/team/[employeeId]/reports` | authenticated | Employee report snapshots and score/star history |
| `/attendance` | authenticated | Attendance records and monthly attendance totals |
| `/task-tools` | authenticated | Web replacement for workbook custom menus and Apps Script workflows |
| `/reports` | authenticated | Saved report snapshots |
| `/daily-facts` | authenticated | Daily facts capture page |
| `/ideas` | authenticated | Ideas capture page |
| `/suggestions` | authenticated | Suggestions capture page |
| `/sales` | authenticated | Sales log support page |
| `/milestones` | authenticated | Vision, mission, values, monthly milestones. Leadership edits in place |
| `/settings` | authenticated | Account details; display name is the one editable field |

Route protection lives in **`proxy.ts`** at the project root. Next.js 16 renamed
the `middleware` file convention to `proxy` and the exported function from
`middleware` to `proxy`; the old name still runs but is deprecated. On Next.js 15
or earlier, rename the file to `middleware.ts` and export `middleware`.

---

## Local setup

Requires Node.js 22 or later and a Supabase project.

```bash
# 1. Install dependencies
npm install

# 2. Create your local environment file
cp .env.example .env.local          # macOS / Linux
Copy-Item .env.example .env.local   # Windows PowerShell

# 3. Fill in .env.local from Supabase: Project Settings → API

# 4. Apply the SQL migrations (see Database setup below)

# 5. Run the dev server
npm run dev
```

Then sign up through the app and **promote yourself to managing director** — see
[First administrator](#first-administrator).

---

## Environment variables

`.env.example` is the committed template. Copy it to `.env.local`, which is
gitignored and must never be committed.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Base URL of the Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |

The anon key is safe to expose to the browser: it carries no privileges of its
own, and every request made with it is still filtered by Row-Level Security.

> **Never** add the `service_role` key to `.env.local` or anywhere reachable from
> the client. It bypasses RLS entirely. If a future server-only job needs it, load
> it from an unprefixed variable and read it only inside server code.

---

## Database setup

Apply the migrations **in order**. Each depends on the one before it.

| Order | File | What it does |
| --- | --- | --- |
| 1 | `supabase/migrations/01_init_schema.sql` | Five enums, four tables, the `scaled_progress` generated column, indexes, the `get_user_role()` helper, RLS enablement and 11 policies |
| 2 | `supabase/migrations/02_auth_provisioning.sql` | `handle_new_user` trigger that provisions a `public.users` row on signup, plus a self-service profile update policy |
| 3 | `supabase/migrations/03_log_deletion_policy.sql` | DELETE policy so a member can remove their own effort logs |
| 4 | `supabase/migrations/04_milestones_and_vision.sql` | `milestone_status` enum, `company_statements` and `company_milestones` tables, their RLS policies, and seed content for the milestones tab |
| 5 | `supabase/migrations/05_freshness_decay.sql` | Freshness decay function so inactive open tasks age from `Fresh` to `Stale` or `Rotten` |
| 6 | `supabase/migrations/06_oauth_profile_support.sql` | Profile support for OAuth sign-in metadata |
| 7 | `supabase/migrations/07_tracker_replacement_foundation.sql` | Workbook replacement tables for multi-assignees, reviewers, task dependencies, task pages, task links, checklist templates, timers, attendance, stars, support modules, and report snapshots |
| 8 | `supabase/migrations/08_checklist_progress_sync.sql` | Checklist progress rollups and task progress synchronization helpers |
| 9 | `supabase/migrations/09_attendance_snapshot_totals.sql` | Attendance totals added to monthly performance snapshots |

Apply them with `supabase db push`, or paste each file into the Supabase SQL
Editor and run it once.

If `/milestones` shows a "Migration not applied" notice, `04` is the one that has
not been run. If task pages, checklist pages, attendance, team reports, timers, or
task tools fail because a table is missing, apply migrations `07` through `09` in
order. The page-level notices handle known optional tables where possible, but the
full tracker replacement requires every migration in the table above.

When applying migrations manually in the Supabase SQL Editor, run one file at a
time and stop on the first error. If earlier files report "already exists", check
which objects are present before continuing; do not skip ahead to later files
unless the prerequisite tables/functions exist. After applying `01` through `09`,
paste `supabase/verify_tracker_replacement.sql` into the SQL Editor; every row
should report `ok`.

`04` depends on three objects the earlier files create — `public.users`,
`get_user_role()` and `set_updated_at()` — so the order is not optional. It seeds
the vision, mission, values and five milestones, and both seed statements are safe
to re-run: statements use `ON CONFLICT DO NOTHING` so an edited one is never
reverted, and milestones only seed into an empty table.

### Why migrations 02 and 03 are separate

Both close gaps in the original specification, and both change the security
model, so they are isolated and documented rather than folded into `01`:

- **02** — the policies in `01` allow only a `managing_director` to insert into
  `public.users`. That leaves a new project with nobody able to create the first
  profile, and makes signup impossible. The trigger closes the loop the way
  Supabase recommends, running `SECURITY DEFINER` so it bypasses RLS to provision
  exactly one matching row. It never assigns a privileged role.
- **03** — the source spec's comment read "users can edit or delete their own
  logs", but only an UPDATE policy was ever defined. With RLS on and no matching
  DELETE policy, deletes were silently refused.

### First administrator

Nothing in the application can mint an administrator, by design. Sign up through
the app, then run this once against your project:

```sql
UPDATE public.users
SET role = 'managing_director'
WHERE email = 'you@example.com';
```

---

## Domain model

### Tables

| Table | Purpose |
| --- | --- |
| `users` | Profiles, keyed to `auth.users.id`. Carries `employee_id` and `role` |
| `tasks` | Work items with scale weight, progress, priority, status, freshness |
| `task_assignees` / `task_reviewers` | Multi-person task ownership and review roles |
| `task_dependencies` | Reusable task/subtask/support/carryover relationships |
| `task_detail_sections` | Structured task-page sections replacing per-task sheets |
| `task_links` | Task folders, documents, drawings, checklists and other work-file URLs |
| `task_checklists` / `checklist_nodes` | Hierarchical master checklists with progress rollup |
| `task_timers` | Background timers started/stopped by assigned members |
| `daily_task_logs` | One effort entry: hours, progress delta, notes, asset links |
| `attendance_records` | Daily attendance rows and hours |
| `daily_star_records` | Automatically computed daily star performer records |
| `monthly_performance_snapshots` | Frozen monthly statistics, one row per member per month |
| `performance_score_components` | Audit trail for daily score calculations |
| `report_snapshots` | Saved general and employee report payloads |
| `company_statements` | One editable block per showcase card: vision, mission, core values |
| `company_milestones` | Monthly organisational goals with an owner, a delivered/target count and a deadline |

A milestone is deliberately not a task. A task is a unit of assigned work measured
in scale and logged hours; a milestone is an outcome the team aims at, counted in
deliverables. Folding them together would put rows into the team median that are
nobody's assigned work.

### Taxonomies

**Roles** — `managing_director`, `project_engineer`, `data_manager`,
`team_member`

**Categories** (13) — `SD` Skill Development, `WK` Work Organizing, `T` General
Task, `PJT` Project, `RSC` Research, `QAC` Quality & Testing, `MKT` Marketing,
`ACC` Accounting, `ITH` InfoTech, `OFM` Office Maintenance, `MG` Management,
`AD` Admin, `OT` Other / Off-Hours

**Priorities** — `Focus`, `High`, `Medium`, `Low`, `No`

**Statuses** — `Not Started`, `In Progress`, `Done`, `Discarded`

**Freshness** — `Fresh`, `Stale`, `Rotten`

**Milestone statuses** — `Planned`, `In Progress`, `Achieved`. No `Discarded`: a
goal that is dropped is deleted rather than archived against anyone's record.

### Type layers

Two representations, converted at an explicit boundary:

- `types/database.ts` — snake_case wire format, and the `Database` generic that
  keeps every Supabase query result off `any`
- `types/tracker.ts` — camelCase domain models the application works with
- `modules/*/internal/mappers.ts` (and `shared/supabase/mappers.ts`) — the conversion between them

Nullability mirrors the DDL exactly. A column without `NOT NULL` is typed
`| null` even when it carries a default, because the database can still return
NULL.

---

## Business formulas

Implemented in `modules/time-tracking/internal/logs/metrics.ts` and the scoring
module (`modules/scoring/internal/`), both pure and free of React and Supabase.

### Scaled progress

```
Scaled Progress = Task Scale × (Progress % ÷ 100)
```

A `GENERATED ALWAYS ... STORED` column. PostgreSQL computes it and rejects any
write that targets it, so the reported figure is always the derived one. The
JavaScript mirror in `computeScaledProgress` exists only for previews and has
been verified to agree with the database across boundary cases.

### Task productivity

```
Task Productivity = Scaled Progress ÷ Hours Logged
```

Returns **null, not zero**, when no hours are logged. Zero productivity means
"worked and produced nothing"; no hours means the rate is undefined, and
conflating the two would drag the team median down with tasks nobody has started.

Hours spent on metric-ineligible work are excluded from the denominator. Logging
off-hours time must not lower your rate.

### Freshness states

| State | Condition |
| --- | --- |
| `Fresh` | Updated within the last 7 days, or actively logged |
| `Stale` | No activity for 7–14 days |
| `Rotten` | Inactive beyond 14 days without reaching completion |

### Metrics eligibility

A task contributes to team statistics only when **all** hold:

- hours logged > 0
- task scale > 0
- category is not `OT` (off-hours)
- status is not `Discarded`

### Team medians

Individual rates are collected across active members for the period, then
compared against the median.

```
Pᵢ                    = Σ Scaled Progressᵢ ÷ Σ Hours Loggedᵢ
Productivity Diff     = Pᵢ − Median(P)

Task Allocation %ᵢ    = (Σ Task Scaleᵢ ÷ Σ Team Task Scale) × 100
Loading Diff          = Allocation %ᵢ − Median(Allocation %)

Criticality Scoreᵢ    = mean priority weight of assigned tasks
Criticality Diff      = Criticalityᵢ − Median(Criticality)
```

Priority weights: `Focus` 4.0 · `High` 3.0 · `Medium` 2.0 · `Low` 1.0 · `No` 0.0

Medians for productivity and criticality skip members whose value is undefined
(no hours, no tasks) rather than folding them in as zero. Allocation includes
every active member, since 0% is a real share.

### Star performer of the month

```
Sᵢ = 0.4·(Productivity Diffᵢ)
   + 0.3·(Total Scaled Progressᵢ)
   + 0.2·(Freshness Scoreᵢ)
   − 0.1·(Rotten Task Countᵢ)
```

Only members with logged hours are eligible. Ties break on scaled progress, then
name, so the same inputs always produce the same winner.

**Freshness Score** is not defined by the source specification. It is implemented
as a weighted share of a member's carried tasks — `Fresh` 1.0, `Stale` 0.5,
`Rotten` 0.0 — giving a 0–1 figure that rises as a portfolio stays current.

> **Read the breakdown, not just the total.** The four terms have very different
> magnitudes: a productivity differential sits near ±1 while total scaled progress
> can reach the hundreds. At `0.3 × progress`, that term dominates, so in practice
> the award tends to mean "did the most weighted work". The dashboard prints each
> weighted term alongside the total for exactly this reason.

### Period scoping

The productivity numerator is derived from logs within the month —
`Σ (task scale × progress delta ÷ 100)` — not from the cumulative
`tasks.scaled_progress` column. Dividing a lifetime numerator by a monthly
denominator would not be a rate.

A task counts toward a member's workload for a month if it was assigned on or
before the month ended and had not already completed before it began.

---

## Security model

Row-Level Security is enabled on all four tables. With RLS on and no matching
policy, the default is refusal.

| Capability | Managing Director | Project Engineer | Data Manager | Team Member |
| --- | :-: | :-: | :-: | :-: |
| View the team task grid | ✓ | ✓ | ✓ | ✓ |
| Log effort against own assignments | ✓ | ✓ | ✓ | ✓ |
| Update status/progress on own tasks | ✓ | ✓ | ✓ | ✓ |
| Create and edit any task | ✓ | ✓ | — | — |
| Delete tasks and their effort history | ✓ | ✓ | — | — |
| Freeze a monthly performance snapshot | ✓ | — | — | — |
| Manage member profiles and roles | ✓ | — | — | — |

Additional guarantees:

- `get_user_role()` runs `SECURITY DEFINER` with `SET search_path = ''`, so it
  cannot be hijacked by a caller-controlled search path.
- A member can rename themselves but **cannot** self-promote: the profile update
  policy pins `role` and `is_active` to their current values.
- Log ownership is taken from the verified session, never from a form field.
- `redirectTo` values are validated against open redirects, rejecting `//host`,
  `https://host`, `/\host` and anything containing a scheme separator.
- Raw asset links are restricted to `http` and `https`. These render as anchors,
  so `javascript:` would otherwise be a stored XSS vector.

> Deleting a task cascades to its `daily_task_logs` rows, so the logged effort
> history goes with it. Where past hours still matter, set the status to
> `Discarded` instead.

---

## Project layout

The code is split into feature modules with one public front door each. The
rules (what may import what, and the boundary test that enforces them) are in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); each module's README lists its
public API and the tables and RPCs it owns.

```
app/                       routing only: pages, layouts and route handlers
  (workspace)/             guarded routes, wrapped in the app shell
  login/  auth/callback/   sign-in views and the OAuth callback
  api/                     report export and internal worker endpoints
  page.tsx                 marketing page / member redirect
  globals.css              Tailwind v4 theme and component classes

modules/                   one folder per feature
  auth/  tasks/  checklists/  time-tracking/  attendance/  support/
  records/  milestones/  scoring/  reports/  team/  drive/  marketing/
  workspace-views/         app shell, dashboard, Today, Timelines (the view layer)
  _template/               starting point for a new module

  <module>/index.ts        PUBLIC server reads
  <module>/client.ts       PUBLIC pure helpers and types for client components
  <module>/*actions.ts     PUBLIC 'use server' commands
  <module>/components/     PUBLIC UI
  <module>/internal/       PRIVATE queries, commands, rules, input, mappers

shared/                    kernel every module may use: Supabase clients,
                           session, form readers, time and periods, exact
                           arithmetic, enums/formatters, UI primitives

supabase/migrations/       numbered SQL migrations — apply in order
types/                     database.ts (wire), tracker.ts (domain)
proxy.ts                   edge session refresh and route guard
__tests__/                 architecture checks, acceptance tests, test stubs
```

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm test` | Vitest unit suite |
| `npm run build` | Production build (runs TypeScript) |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |

There is no `lint` script. `next lint` was removed from the CLI in Next.js 16, and ESLint is
not installed, so nothing would run. `npm run typecheck` is the static check for this project.

---

## QA checklist

Final workbook-replacement QA is tracked in `docs/final-qa-checklist.md`. Run
`npm test`, `npm run typecheck`, and `npm run build` before deployment. The
checklist also records the anonymous auth smoke test and the manual
manager/member smoke checks that require real Supabase QA accounts.

---

## Known gaps

Carried forward deliberately, each with a reason.

**Freshness is not maintained.** `tasks.freshness` is reset to `Fresh` when a task
is logged against, but nothing moves it to `Stale` or `Rotten` as time passes, so
it reads optimistically. A scheduled job comparing `updated_at` against the
thresholds above would close this. It affects two terms of the star formula, so
it matters more than it first appears.

**Metric recalculation is not atomic.** The log actions read a task, compute, then
write. Two logs filed against one task in the same instant could interleave and
lose a delta. Closing it needs
`SET progress_percentage = progress_percentage + $1`, which PostgREST cannot
express and would require an RPC.

**Aggregates are computed in application code.** PostgREST has no `GROUP BY`, so
per-task hour totals fold over a full fetch of `(task_id, hours_worked)`. Fine at
team scale; promote to a database view with `security_invoker` when the log table
outgrows a single fetch.

**Filtering and sorting are client-side.** The task grid fetches once and filters
in the browser, which makes search instant. This should move into SQL with
pagination once the table outgrows a single load.

**Duplicate `employee_id` on signup surfaces poorly.** The column is unique, and a
collision makes the provisioning trigger raise, which Supabase Auth reports as a
generic "Database error saving new user". The signup action cannot pre-check,
because the SELECT policy on `public.users` is granted to `authenticated` only and
a registering user is still anonymous.

**Milestone owners must be individuals.** `company_milestones.owner_id` is a
foreign key to `public.users`, so it can name a member but not a group. The static
content it replaced used labels like "Project Engineering" and "Whole team"; those
are now stored as a null owner and rendered as "Whole team". An `owner_label`
column would be the fix if naming a team matters.

**Core values are one text field, not rows.** `company_statements` holds them in a
single `statement` with one value per line in `Name: description` form, which keeps
the card to one Edit control. The trade is that ordering and per-value metadata are
not addressable. Splitting them into a `company_values` table would only require
changing `parseCoreValues` in `modules/milestones/internal/statements.ts`.

**Milestone edits are not timestamped.** `company_milestones` carries `created_at`
only, so there is no record of who last changed a goal or when.
`company_statements` records both `updated_at` and `updated_by`.

**Legal pages are not hosted.** The footer points privacy and terms enquiries at a
mailto address rather than linking routes that do not exist.

**Settings holds one field.** `/settings` exists and is reachable from the account
menu, but display name is all it can change. Migration `02`'s "Users can update
their own profile" policy pins `role` and `is_active` in its `WITH CHECK`, so a
member editing either would be rejected at the database rather than in the form.
Email changes belong to Supabase Auth and are not wired up. Anything more needs a
policy change, not a UI change.

**Notifications is a shell.** The bell in the workspace header is rendered and
labelled but has nothing behind it. There is no notifications table and no
producer.

**Steering files are not in `.kiro/steering/`.** They live in `steering/`, so Kiro
does not auto-load them. Their UI sections are now **two redesigns behind**:
`tech-stack.md` rule 2 and `responsive-ui-design.md` still describe the original
"sheet-faithful" look (`border-slate-200` panels, sky-tinted in-progress badges,
`17rem` sidebar), which the soft-card pass and then the current utilitarian pass
both replaced. A later phase that follows them literally would revert the UI. See
`.kiro/progress.md`.
