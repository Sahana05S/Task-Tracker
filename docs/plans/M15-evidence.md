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
