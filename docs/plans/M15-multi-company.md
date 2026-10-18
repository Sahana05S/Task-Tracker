# M15 - Multi-company TaskPulse (SaaS) plan

Status: **plan only**. Approved direction, 17 October 2026 (DECISIONS,
"Multi-company TaskPulse"). No phase is implemented yet.

## Goal

Sell TaskPulse to other companies from one deployment. Each company sees only
its own people and data. Saahithyaa Realtors and Builders becomes company #1.

## Approved decisions

| Topic | Decision |
|---|---|
| Separation | One shared database. Every company-owned row carries `organization_id`, and PostgreSQL enforces separation in row-level security and every command. |
| Rules | The same engine for everyone (ten-factor performance, daily stars, monthly award, scale, checklist rollup). Per-company settings may vary; formulas do not. |
| Onboarding | The platform owner creates each company and its first director from an internal admin page. Self-serve sign-up and billing come later. |
| Existing data | Saahithyaa is migrated in as company #1. |

## What has to change (inventory, 17 October 2026)

- **31 public tables.** Each gets `organization_id` (or inherits it through a
  parent that has one), with the company predicate in every read and write
  policy.
- **39 private tables.** Audit, receipts, award runs, month archives, Task
  Tools reservations, performance runs and others are scoped the same way.
- **56 public functions and about 115 SECURITY DEFINER functions.** Each must
  resolve the caller's company and never read or write across companies.
  This is the largest and riskiest part.
- **Global unique rules that become per-company.** These include task tags,
  employee IDs, `TT-000001` numbering, one daily star per date, month
  periods, and snapshot/score keys.
- **One-per-system settings that become per-company.** These are the award
  policy, Task Tools policy, Drive configuration, and the presentation and
  performance contracts.
- **Timezone.** "Asia/Kolkata" appears 107 times in SQL and in 16 app files.
  It becomes a company setting (see open questions).

## M15.2 design: company scope inside commands and workers

Finding (17 October 2026): on Supabase the `postgres` role owns every table and
function and has BYPASSRLS, so row security never applied inside SECURITY
DEFINER commands. Rewriting about 77 command functions by hand is error-prone.
Instead:

1. **A non-bypass owner role.** A new NOLOGIN role, `taskpulse_definer` (no
   BYPASSRLS), owns the tables and every SECURITY DEFINER function, apart from
   a short "system" allowlist that stays with `postgres`:
   `current_organization`, `get_user_role`, `handle_new_user`, the company
   stamp trigger and the scope helpers. Every table uses FORCE ROW LEVEL
   SECURITY, so the owner is also subject to it.
2. **One scope rule.** `taskpulse_private.m15_scope()` gives the company a
   query may see:
   - a signed-in caller: their company (none if inactive);
   - an in-database loop: the `taskpulse.organization` setting;
   - a service-role worker: the `x-taskpulse-organization` request header,
     honoured only for the service role;
   - otherwise unscoped. That is a system context such as a migration, a job
     claim or the freshness decay.
   Each table has a policy for `taskpulse_definer`: rows of the scoped
   company, or every row when unscoped. Global settings tables (award, tool,
   Drive policy and the contract singletons) stay readable by all until
   M15.3.
3. **Private tables** gain `organization_id`. It is stamped by the same
   trigger from task, user, log, run, slot, job, revision or preview links
   (column-name map for links without foreign keys), otherwise from the
   scope. Award slot dates, month periods and revisions, and Task Tools tag
   reservations become unique per company.
4. **Workers.** The claim functions return each job's company. The app sends
   it as the header on every call for that job. `queue_due_awards` loops over
   active companies.
5. **Future migrations** end with `SELECT taskpulse_private.m15_secure();`.
   It re-applies ownership, FORCE RLS and policies, and a test fails if any
   table or definer function outside the allowlist is left with bypass
   ownership.

## Phases

Each phase is its own module: forward migrations only, two-company disposable
database tests, browser checks, and STATUS/evidence updates, as for M01-M14.

1. **M15.1 Tenancy foundation.**
   - `organizations` table, `users.organization_id`, and a
     `current_organization()` function.
   - `organization_id` on every company table, with existing rows backfilled to
     company #1.
   - Unique rules become per-company, and a cross-company reference guard stops
     a task linking another company's task.
   - Row-level security adds the company predicate.
   - Exit test: a second synthetic company can't see or touch company #1 via
     any table.
2. **M15.2 Commands and calculations scoped.**
   - Every RPC and private calculation (logs, timers, checklists, details, Task
     Tools, attendance, contributions, performance engine, awards, month
     archive, presentation, holidays, effort totals) runs inside the caller's
     company.
   - Exit test: the full M01-M14 database suites run unchanged for company #1,
     plus a cross-company refusal check for every command.
3. **M15.3 Company settings.**
   - Company profile: name, logo, timezone, week and holidays.
   - Per-company award policy and Task Tools policy, headline colour cut-offs,
     and the sales field mapping.
   - Defaults equal today's Saahithyaa values, so company #1 behaves exactly as
     now.
4. **M15.4 Platform admin and onboarding.**
   - A separate platform-owner role, distinct from a company's managing
     director.
   - An internal page to create a company, invite its first director,
     deactivate a company and see usage.
   - Company-branded UI and per-company invitation emails.
5. **M15.5 Per-company Google Drive.**
   - A "Connect Google Drive" button, where a company admin approves access
     through Google sign-in.
   - Uses Google's limited `drive.file` permission (only files TaskPulse
     creates), with encrypted per-company tokens.
   - The existing Drive worker runs per company. This replaces the
     single-company service-account plan; the setup guide's Part 2 is
     rewritten.
6. **M15.6 Launch preparation.**
   - Production migrations, with explicit approval at that point.
   - Saahithyaa's data moved in as company #1, and backups.
   - Monitoring, a security review of cross-company isolation, terms/privacy
     pages and Google app verification.

Later, not in M15: self-serve sign-up, billing and trials, per-company custom
domains, and data export/deletion on request.

## Open questions (not blocking M15.1)

1. **Timezones.** Will early customers all be in India? If so, the timezone
   can stay fixed for launch and become a setting later. Otherwise the 107
   timezone uses must become per-company in M15.3.
2. **One person in several companies?** The recommendation is no for launch
   (one login, one company), which keeps permissions simple.
3. **Company-specific wording.** Mission/task names, the sheet-style file
   naming and role names stay the same for everyone at launch; per-company
   labels can be a later setting.

## Effect on current work

- Production launch for Saahithyaa alone is paused, and now happens through
  M15.6.
- The quick "Create work file" panel keeps working throughout; no company
  setup is needed.
- The setup guide's sales mapping (Part 1) is still useful: it becomes
  Saahithyaa's company setting. Drive setup (Part 2) should wait for M15.5's
  "Connect Google Drive" button.
