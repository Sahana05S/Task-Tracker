# M15 evidence - multi-company TaskPulse

Plan: `docs/plans/M15-multi-company.md`. Decisions: DECISIONS, "Multi-company
TaskPulse approved by user" (17 October 2026). The user authorized M15.1 on
17 October 2026 and said early customers will be in India, so Asia/Kolkata
stays fixed for launch.

## M15.1 tenancy foundation

### What changed

Forward migration `39_organizations_tenancy_foundation.sql`, after 38:

- **Companies.** It adds `public.organizations` (name, slug, active or
  suspended, one default) and company #1, "Saahithyaa Realtors and Builders"
  (default).
- **Company column.** `organization_id` is added to the 30 company-owned public
  tables, which is every public table except `organizations` and the global
  `task_detail_fields` catalog.
  - It is backfilled to company #1 with user triggers off, so assigning a
    company is not treated as work and does not reset reviews.
  - It is indexed, and NOT NULL everywhere except `users`. An account without
    a company must be inactive (check constraint).
- **Stamping and guarding writes.** The `aaa_m15_organization` trigger on every
  table runs as SECURITY DEFINER, so parent lookups are not hidden by the
  caller's row security.
  - It fills `organization_id` from the row's parent references. The 73
    links between company-owned tables are discovered from foreign keys and
    stored in `taskpulse_private.m15_org_refs`. If no parent is found it uses
    the caller's company, and with exactly one company it uses that one.
  - It refuses rows whose references point at different companies, and moving
    a row between companies.
  - It refuses any signed-in write or delete of another company's row. That
    includes writes made inside SECURITY DEFINER commands, so a director of
    company B cannot change company A's checklist through `checklist_command`.
  - Company membership on `users` cannot be changed by a signed-in caller.
- **Row-level security.** One RESTRICTIVE `m15_company` policy per table adds
  `organization_id = current_organization()` to every existing permissive
  policy. On `users`, a person can also read their own row.
- **Per-company unique rules.** Task tags, employee IDs, checklist template
  names, company statement keys and daily star dates are now unique per
  company. Email stays globally unique (one login, one company).
- **Company-aware functions.**
  - `public.current_organization()` returns the caller's company only for an
    active account in an active company.
  - `get_user_role()` now also requires an active company, so a suspended
    company is refused by every command.
  - `can_read_employee_details()` now also requires the same company.
- **Provisioning.** `handle_new_user()` takes the company only from server-set
  `raw_app_meta_data.organization_id`; user-editable metadata cannot choose a
  company.
  - With no company named, the account joins the default company (today's
    behaviour for Saahithyaa).
  - With an unknown or inactive company, it is created inactive with no
    company and sees only itself.
  - M15.4 replaces open sign-up with invitations.

App: `types/database.ts` gains `organizations` and `current_organization`.
The three direct inserts (report snapshots, Task Tools reports, milestones)
are stamped by the trigger before row security checks them.

### Checks

- `tools/test_m15_database.py`, two companies, on a disposable local
  PostgreSQL 18 database: fresh install 01-39 and upgrade 38->39 with real
  pre-upgrade activity (checklist item, log, review approval). All passed:
  - the upgrade keeps every table's row count, assigns all rows to company #1,
    and leaves work revision, lifecycle version and review approval unchanged;
  - company B members join from app metadata, and employee IDs and task tags
    repeat across companies; a duplicate tag inside one company is refused
    (23505);
  - user metadata cannot choose a company; an unknown company leaves the
    account inactive, seeing only itself and no tasks, and it cannot be
    activated without a company;
  - across all 30 tables, each of four callers (both directors, both members)
    sees only their own company's rows and company;
  - `can_read_employee_details` is false across companies, and `anon` is
    refused;
  - refused: cross-company assignee and dependency inserts (owner and
    director), `checklist_command` on another company's task, direct
    update/delete of another company's task, and moving a user to another
    company;
  - each company's own commands still work (`create_task_log` for B,
    `checklist_command` for A) and stamp the right company;
  - a suspended company has no role, sees nothing, and its commands are
    refused.
- `tools/test_m14_database.py` with migration 39 included (fresh 01-39;
  upgrade adds 39): all 50 checks passed. Those checks cover checklists,
  nesting, duplicates, item timers, effort totals, team holidays and
  work-file links.
- Unit tests (507 passed; 2 opt-in hosted skipped) and typecheck passed.
- M13 test project: a dry run listed only 39, then `supabase db push` applied
  it. Afterwards: 1 company, 30 company-owned tables, no task or user without a
  company.
- The browser regression and production build results are recorded in STATUS.

### Remaining risks and next steps

- **Reads inside commands (M15.2).** SECURITY DEFINER functions such as the
  performance engine, awards, presentation, month archive, Task Tools,
  holidays and effort totals still read every company's rows, and private
  tables have no company yet. Cross-company writes are already blocked. M15.2
  must land before a second real company is onboarded.
- **Open sign-up** still joins the default company, as before. M15.4 replaces
  it with invitations.
- **New companies** have no seeded company statements or templates yet
  (M15.3/M15.4).
- **Production:** migrations 10-39 are still unapplied there and need explicit
  approval (M15.6).

## M15.2 company scope inside commands and workers

### What changed

Forward migration `40_company_scoped_commands.sql`, after 39. The design is
in the plan's "M15.2 design" section.

- **Why it was needed.** On Supabase `postgres` owns everything and has
  BYPASSRLS, which was confirmed on the hosted test project. So no SECURITY
  DEFINER command was subject to row security.
- **Non-bypass owner.** The NOLOGIN, non-bypass role `taskpulse_definer` now
  owns all 71 tables and every function in `public` and `taskpulse_private`,
  except 7 system functions: `current_organization`, `get_user_role`,
  `handle_new_user`, `m15_organization`, `m15_scope`, `m15_unscoped` and
  `m15_secure`.
  - All tables use FORCE ROW LEVEL SECURITY, with one `m15_scope` policy for
    `taskpulse_definer`.
  - The role is a member of `service_role` only for privileges such as
    executing `auth.uid()`, which `postgres` cannot grant on Supabase. Role
    attributes (BYPASSRLS) are not inherited, and no policy targets
    `service_role`.
- **One scope rule.** `taskpulse_private.m15_scope()` returns, in order:
  - the signed-in caller's company;
  - else the `taskpulse.organization` setting;
  - else the `x-taskpulse-organization` header, honoured only for a
    service-role JWT;
  - else unscoped, meaning a system context with no signed-in user.
  A signed-in caller without an active company sees nothing.
- **Private tables.** 31 company-owned private tables gain `organization_id`,
  backfilled to company #1.
  - They are stamped through 97 links (foreign keys plus a column-name map
    for polymorphic ids) or from the scope.
  - `audit_write` now records the audited row's company directly; its AFTER
    trigger sees the stamped row.
  - A private system row may stay company-less only when its link points at a
    company-less record, such as an org-less sign-up. Scoped readers never
    see those rows.
- **Per-company keys.**
  - Award slot dates and Task Tools tag reservations are now unique per
    company.
  - Month periods and their revisions are keyed per company, with the
    revision foreign key made composite.
  - The two `ON CONFLICT` targets that named the old keys
    (`queue_award`, `month_archive_command`) are patched.
- **Trusted-caller checks.** `guard_write`, `guard_checklist_owner_signal` and
  `decay_task_freshness` trusted "caller is the table owner". They now also
  trust `postgres` and `supabase_admin`, as before the ownership move.
- **Workers.**
  - `claim_award_jobs`, `claim_performance_jobs` and `claim_drive_jobs` add
    each job's `organizationId`.
  - `queue_due_awards` runs one scoped pass per active company.
  - The app's award, Drive and performance runners send each job's calls
    through a per-company client (`lib/supabase/worker.ts`).
- **Future migrations.** `taskpulse_private.m15_secure()` is idempotent and
  re-applies ownership, FORCE RLS, policies and the stamp trigger. Every later
  migration must end with `SELECT taskpulse_private.m15_secure();`.
- **Hosted deadlock fix.** The migration now takes every table lock up front,
  in one fixed order. Without that it deadlocked twice on the hosted test
  project against live PostgREST requests from running dev servers. Both
  attempts rolled back cleanly.

### Checks

- `tools/test_m15_database.py` (two companies; fresh 01-40 and upgrade
  38->39->40): all 27 checks passed, including:
  - 15 read commands (presentation, performance and contribution sources,
    awards, month archive, effort, holidays, credit summary, attendance
    context, Drive read model, rollups, reconciliation, team summary), called
    by both roles of both companies, return none of the other company's IDs;
  - a worker with the company header sees only that company; an unscoped
    system read sees all; a signed-in caller sending the header still sees
    only their own company;
  - `queue_due_awards` reports one pass per company; `queue_award` creates
    one slot per company for the same date and stays idempotent within a
    company; claimed jobs carry `organizationId`;
  - private records (log revisions, credit events) carry their company;
  - `m15_secure()` is idempotent and secures a table and function added
    later; no bypass-owned table or definer command remains;
  - M15.1 isolation and suspension checks still pass, and another company's
    task is now invisible inside commands (refused as not found).
- `tools/test_m14_database.py` with 40 (fresh 01-40; upgrade through 40): all
  51 checks passed.
- Unit tests, including the new `__tests__/lib/stars/jobs-company.test.ts`
  (each award job uses its company's client; the claim stays unscoped), passed.
- Hosted M13 test project: migration 40 applied after a dry run listing only
  40. Afterwards 0 unsecured tables, 7 allowlisted postgres functions,
  `taskpulse_definer` without BYPASSRLS, and no company-less audit rows.
- Browser regression and build results: see STATUS.

### Remaining risks

- The Task Tools number sequence (`TT-…`) is shared by all companies. Tags
  stay unique per company, but a new company's first number won't be 1
  (M15.3).
- Settings singletons (award, tool and Drive policy, and the contracts) are
  still shared by all companies (M15.3).
- Open sign-up still joins the default company (M15.4).
- Every future migration must call `m15_secure()`.
