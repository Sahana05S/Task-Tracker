# Stellar

Multi-metric performance tracker for delivery teams (The TaskPulse project).


Stellar weights every mission, records the hours worked against it, and
measures each member against the team median for the month. Progress, scores,
awards and payroll are computed in the database, so the same figure appears on
every page, report and export.

Members join by invitation only. The managing director invites an email
address; the person accepts with that address and a password. There is no
self-service sign-up and no Google sign-in.

---

## Contents

- [Stack](#stack)
- [Architecture](#architecture)
- [Routes](#routes)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Database and migrations](#database-and-migrations)
- [Business rules](#business-rules)
- [Project layout](#project-layout)
- [Scripts and tests](#scripts-and-tests)
- [Android app](#android-app)
- [Known limitations](#known-limitations)

---

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16.4, App Router, React 19.3 |
| Language | TypeScript 5.9 (`strict`) |
| Styling | Tailwind CSS v4 (CSS-first `@theme`), light and dark themes |
| Typeface | Plus Jakarta Sans via `next/font/google` |
| Components | shadcn/ui primitives over Radix |
| Charts | Recharts 3 |
| Backend | Supabase: PostgreSQL, Auth, Storage, Edge Functions, pg_cron |
| Auth transport | `@supabase/ssr` (cookie sessions) |
| Hosting | Vercel (deploys `main`), GitHub Actions for migrations, backups and workers |
| Phone app | Capacitor shell, [Sahana05S/stellar-mobile](https://github.com/Sahana05S/stellar-mobile) |

Pages read through React Server Components; every change goes through a Server
Action that calls a PostgreSQL function (RPC). Client components never write to
the database directly.

---

## Architecture

```
Browser or Android app
  │
  ├─ proxy.ts ................ refreshes the session, turns anonymous traffic
  │                            away from workspace routes, sends a signed-out
  │                            app request for / to sign-in
  │
  ├─ app/(workspace)/layout ... second gate: requires an active profile
  │
  ├─ Server Components ........ read through modules/<name>/index.ts
  └─ Server Actions ........... write through modules/<name>/actions.ts
                                     │
                                     └─ PostgreSQL RPCs and row-level security
                                        (the real permission boundary)
```

Permissions are enforced in the database. Every table has row-level security
forced on, tables and commands belong to the non-bypass role
`taskpulse_definer`, and every row is scoped to its company
(`taskpulse_private.m15_scope()`, migration 40). Checks in the application only
produce clearer error messages.


The module rules (what may import what) are in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and
`__tests__/architecture/boundaries.test.ts` enforces them.

---

## Routes

`tests/e2e/routes.ts` is the authoritative list of workspace pages, and a test
fails when a page is missing from it. In summary:

| Area | Routes | Who |
| --- | --- | --- |
| Public | `/` (landing; members go to `/today`), `/login`, `/reset-password`, `/auth/callback` | anyone |
| Daily work | `/today`, `/tasks`, `/tasks/[taskTag]` and its checklist, `/logs`, `/timelines`, `/milestones`, `/guide` | members |
| Records | `/attendance`, `/attendance/check-in`, `/daily-facts`, `/ideas`, `/suggestions`, `/sales`, `/meeting-points`, `/records/...` history | members |
| Team | `/dashboard`, `/team`, `/team/[employeeId]` (reports, personal info), `/team/activity`, `/leaderboard`, `/awards`, `/hall-of-fame` | members; detail by role |
| Management | `/tasks/setup`, `/task-tools`, `/policies`, `/reports`, `/settings` | managers for edits |
| Directors only | `/team/manage`, `/payroll` and its pages | managing director |
| HR and pay | `/hr` (documents, reviews), `/my-salary` | each member sees their own |

---

## Local setup

Requires Node.js 22 or later and a Supabase project of your own.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in `.env.local` (see below), apply `supabase/migrations` in order to your
own project, then start the dev server:

```bash
npm run dev
```

To get the first account, create a user in the Supabase dashboard with
`raw_app_meta_data` `{"taskpulse_provisioned": true}`, then set that profile's
role to `managing_director` in `public.users`. Everyone else joins through
Team > Manage people > Invite.

---

## Environment variables

`.env.example` is the committed template; `.env.local` is gitignored.

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | app | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | app | Public anon key (row-level security still applies) |
| `NEXT_PUBLIC_SITE_URL` | app | The live site's origin, used in emailed links. Falls back to Vercel's production host |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Used only by the bearer-protected `/api/internal/*` worker endpoints |
| `TASKPULSE_AWARD_WORKER_TOKEN`, `TASKPULSE_AWARD_WORKER_ENABLED` | server only | Worker endpoint token and switch (`sandbox` or `production`) |

GitHub Actions secrets for backups, migrations, workers, push and deploys are
listed in [docs/OPERATIONS.md](docs/OPERATIONS.md). Never put the service-role
key in a `NEXT_PUBLIC_` variable.

---

## Database and migrations

- `supabase/migrations/` holds numbered, forward-only migrations. Never edit
  one that has been applied anywhere; add a new one.
- Every new migration ends with `SELECT taskpulse_private.m15_secure();` so new
  tables and functions are re-owned and company-scoped.
- The live database (Supabase project `bdezjektaeqxcntuxqcw` since the
  1 November 2026 go-live) receives migrations only through the **Apply
  migrations to the live database** workflow when they merge to `main` (backup
  first). See [docs/OPERATIONS.md](docs/OPERATIONS.md#live-database-migrations).
- CI runs the disposable-PostgreSQL suites listed in
  `.github/workflows/contract-checks.yml`, each applying every migration from
  scratch.

Supabase Auth settings the app relies on: **Confirm email** on (an invitation
is applied only to a confirmed address), email templates using `token_hash`
links, the site URL set to the live site, and the Google provider disabled.
Details are in [modules/auth/README.md](modules/auth/README.md).

---

## Business rules

Each rule lives with its module, in PostgreSQL with a TypeScript mirror where
the browser needs one:

| Rule | Where |
| --- | --- |
| Mission progress (Activity 95%, Setup 2.5%, Closure 2.5%) | [modules/checklists](modules/checklists/README.md), migration 85 |
| Ten-factor performance score (median-relative differences) and daily/monthly stars | [modules/scoring](modules/scoring/README.md) |
| Sales factor (BN, BO, BP mapping) | [modules/support](modules/support/README.md), migration 46 |
| Recognition: streaks, ceremony, points | [modules/recognition](modules/recognition/README.md) |
| Attendance, photo check-in, auto-marking | [modules/attendance](modules/attendance/README.md) |
| Payroll (managing director only) and My salary | [modules/payroll](modules/payroll/README.md) |
| Month close and revisions | [modules/reports](modules/reports/README.md) |

All business dates use Asia/Kolkata.

---

## Project layout

```
app/                     routing only: pages, layouts, route handlers
  (workspace)/           signed-in pages inside the app shell
  api/                   report exports and bearer-protected worker endpoints
modules/<name>/          one folder per feature, for example tasks, checklists,
                         time-tracking, attendance, scoring, recognition,
                         payroll, hr, personnel, notifications, mobile
  index.ts               public server reads
  client.ts              public pure helpers and types
  *actions.ts            public 'use server' commands
  components/            public UI
  internal/              private queries, commands, rules
  README.md              public API and the tables/RPCs it owns
shared/                  kernel: Supabase clients, session, time, exact maths, UI
supabase/migrations/     forward-only SQL migrations
supabase/functions/      Edge Functions (send-push, decay-freshness)
tools/                   database test suites and seed/import tools
proxy.ts                 edge session refresh and route guard
```

---

## Scripts and tests

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit and contract suite |
| `npm run test:coverage` | Vitest with coverage |
| `npm run test:e2e` | Playwright; see [tests/e2e/README.md](tests/e2e/README.md) |
| `npm run build` | Production build |

There is no lint script: Next.js 16 removed `next lint` and ESLint is not
installed, so `npm run typecheck` is the static check.

---

## Android app

The Android app is a Capacitor shell that loads this site, so every Vercel
deploy reaches phones without a new APK. The web side of the bridge (push
registration, notification taps, back button, printing, status bar) is
[modules/mobile](modules/mobile/README.md). The shell appends `StellarApp` to
its User-Agent, and the site uses it to show sign-in instead of the public
landing page.

---

## Known limitations

- Google Drive integration is deferred by the owner. `modules/drive` keeps the
  approved design, but provider operations are disabled and no page shows it.
- `daily_star_records`, `performance_score_components` and
  `monthly_performance_snapshots` are tables from the original tracker. Nothing
  writes to them any more; the employee reports page still shows them as history.
- Older planning documents, evidence and reference material live in the
  private notes repository, not here.
