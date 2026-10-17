# M14 evidence - nested checklist pages

Authorized by the user's 16 October 2026 request and answers (see DECISIONS,
"M14 nested checklist pages"). Work is on `m13-verification`.

## What changed

- **Migration 33 (`33_nested_checklist_pages.sql`, forward only after 32).**
  - Adds `checklist_nodes.links text[]` (at most ten).
  - Adds the private validators `checklist_links(jsonb)` (http/https only, at
    most 2048 characters each) and `checklist_estimate(jsonb)` (whole minutes
    0-100000). Both are revoked from client roles.
  - Replaces `checklist_command`:
    - `add` and `edit` accept `links` and `estimated_minutes`. An edit that
      omits a key keeps the stored value.
    - New rows get the next `sort_order` among their siblings.
    - Active assignees may `create`, `add`, `edit` and `delete`.
    - `map`, `section` and `mode`, and any change to `linked_task_id`, stay
      manager-only.
    - Every other rule is copied unchanged from migration 18.
- **Routes.**
  - `/tasks/[tag]/checklist` now lists each section's top-level rows. Every row
    links to its own page and shows the number of items inside, its estimate,
    elapsed time and links.
  - New `/tasks/[tag]/checklist/[nodeId]`: breadcrumb through every ancestor,
    back link to the parent, Result OPEN/CLOSED/N/A, rollup progress, the
    direct rows, and add/edit/remove forms for assignees and managers.
- **Shared code.**
  - `components/checklists/checklist-rows.tsx` holds the rows and forms.
  - `lib/checklists/pages.ts` holds the pure helpers.
  - The action passes `links` and `estimated_minutes` when the form has them.

- **Item timers (migration 34, `34_checklist_item_timers.sql`).**
  - `task_timers.checklist_node_id` and `daily_task_logs.checklist_node_id`
    tag a timer and its logs with the item. Both columns are
    `ON DELETE SET NULL`; deleting an item keeps its logged hours.
  - `public.start_checklist_item_timer(node, payload, operation)` starts an
    ordinary task timer through the unchanged `execution_command`, then tags
    it. Permission, closed-task, one-running-timer and idempotency rules are
    therefore identical to task timers. Replaying a key for another item is
    refused.
  - Stop and discard use the existing commands. A `BEFORE INSERT` trigger
    copies the timer's tag onto every log segment the stop writes.
  - Tags cannot be forged on insert, changed later or put on manual logs.
  - Item time is read from tagged, unreversed logs (`lib/checklists/item-time.ts`),
    so the checklist row is never written and reviews are not invalidated.
  - UI: an "Item timer" panel on each item or page page (start with an
    optional note, live clock, "Stop and log time", "Discard timer"), compact
    Start/Stop on leaf rows, and "Elapsed"/"Logged here" totals, which include
    the items inside a page. The Mission details timer panel also shows and
    stops item timers, because they are task timers.

- **Duplicate rows (migration 35, `35_duplicate_checklist_rows.sql`).**
  This is the sheet's "Duplicate Item". `checklist_command` gains
  `duplicate` (payload `node_id` only; assignees and managers):
  - It copies the row, or the page with everything inside it, directly after
    the original. Later siblings shift down one place, and the copied row's
    title gets " (copy)".
  - Copies start as fresh work: completion No, no completer, no item time.
    Links, estimates, descriptions and types are copied.
  - Rows linked to real tasks are skipped inside a copied page. A linked row,
    or an unmapped legacy row, cannot be duplicated.
  - The rest of the command is copied unchanged from migration 33. These copy
    defaults follow the sheet's behaviour and change no scoring rule.
  - UI: a "Duplicate" button in every row's edit panel and on each page's
    edit panel.
- **Task owner on the checklist home.** The hero lists the task's assignees,
  as the sheet's Checklist Home shows "Task Owner".
- **Tooling.** `tsconfig.json` and `vitest.config.mts` exclude `.claude/`.
  Session worktrees under `.claude/worktrees` are separate checkouts and must
  not be type-checked or tested as part of this one.

- **Team-wide effort totals (migration 36, `36_task_effort_breakdown.sql`).**
  - Logs are readable only by their author and managers (`m01_read`), so a
    member summing visible logs saw only their own share of item time.
  - `public.task_effort_breakdown(task)` is a SECURITY DEFINER aggregate like
    `task_effort_summary`. It returns only the Asia/Kolkata `today`,
    `today_hours` and `by_node` seconds, from unreversed logs, for any active
    account.
  - Item "Logged here"/"Elapsed" now use it. Mission details gains "Hours
    worked today" (gap 3), the sheet's figure next to total hours.
  - Running timers still follow the timer read rules, so members see only
    their own.
- **Missions headline strip (gap 2; DECISIONS "Missions headline strip").**
  - `lib/analytics/headline.ts` (pure, unit-tested) and
    `components/tasks/mission-headline.tsx` show critical team member, most
    productive and most loaded (managers only), plus allocation spread and
    team average productivity and progress in the approved red/amber/green
    bands, open monthly goals and links to Milestones and
    Vision-Mission-Values.
  - The strip streams in with Suspense, because the live month presentation
    takes several seconds; the mission list never waits for it.

- **Team Index and employee reports (gaps 4-5; DECISIONS "Team Index holiday
  marks, report validity and item hours").**
  - Migration 37 (`37_team_holiday_dates.sql`) adds `team_holiday_dates(from,
    to)`. It is a SECURITY DEFINER, dates-only function over at most 63 days:
    a date counts when every active member has an active Holiday record.
  - The daily star log shows "Holidays (n)" and an "H" badge on those dates.
  - Team Index gains a "Report validity" column: Valid or Incomplete, from the
    member's live calculation status.
  - Employee reports gain "Hours by checklist item": grouped by task and
    item, with links to each item's checklist page
    (`lib/checklists/item-hours.ts`, unit-tested).

- **Quick "Create work file" (migration 38, `38_assignee_work_file_links.sql`).**
  - `public.task_details_command` keeps migration 26's wrapper. For an active
    non-manager it routes 'link' to `taskpulse_private.assignee_work_file_link`:
    assignee only, http(s) URL only (at most 2048 characters), no related
    employee or report.
  - It keeps the manager path's validation, version and status checks, review
    invalidation, audit, outbox notice, metric refresh and receipt.
  - `components/tasks/work-file-creator.tsx` shows the panel on Mission
    details.
  - `docs/setup/WHAT-I-NEED-FROM-YOU.md` is the user's guide. Its PowerShell
    key step was tested with a fake key: Next.js loads the stored value as
    valid JSON.

## Checks

- `tools/test_m14_database.py` on a disposable local PostgreSQL 18 cluster
  (loopback, port 15432), run on a fresh install (01-33) and an upgrade
  (01-32 with data, then 33). It verifies:
  - existing nodes are byte-identical after the upgrade;
  - assignee nested add, edit and delete;
  - a 50%/75% rollup through two levels;
  - link and estimate validation and unexpected fields;
  - manager-only controls; non-assignee, data-manager, inactive and
    cross-checklist refusals;
  - direct table writes are refused, and refused commands leave no rows;
  - a closed task refuses edits;
  - item timers (fresh install 01-34 and upgrade 33->34 with an existing
    plain timer and log preserved untagged): tag on start, idempotent replay,
    refusal of key reuse for another item, non-assignee and unknown items,
    forged or changed tags on timers and logs, untagged manual logs; stop
    writes tagged `Timer` logs counted once in task hours; discard logs
    nothing; reversal keeps the tag; deleting an item keeps its hours;
    a closed task refuses item timers;
  - duplicate (fresh install 01-35 and upgrade 34->35): an assignee copies a
    page with its subtree right after it; copies reset to No; linked rows are
    skipped; replay is idempotent; linked rows, unmapped legacy rows,
    non-assignees, data managers and extra fields are refused;
  - effort breakdown (fresh 01-36 and upgrade 35->36): a member who cannot
    read another member's logs gets the same team totals for today and per
    item; reversed logs are excluded; inactive and anon callers are refused.
  - team holiday dates (fresh 01-37 and upgrade 36->37), in a rolled-back
    transaction: a date counts only with every active member on an active
    Holiday record (not when one member differs or a record is withdrawn); a
    member who can read only their own attendance gets the date; ranges over
    63 days, inactive and anon callers are refused.
  - work-file links (fresh 01-38 and upgrade 37->38): an assignee adds a URL
    link; reviews reset; replay is idempotent; related employees or reports,
    bad URLs, missing labels, unknown roles, extra fields, non-assignees, data
    managers, inactive accounts, other detail commands and closed tasks are
    refused; the manager related-record path is unchanged.
  All passed.
- Unit tests: `lib/checklists/__tests__/pages.test.ts` plus the full suite.
  Typecheck and the production build passed.
- Hosted M13 **test** project only:
  - The dry run listed only 33; `supabase db push` then applied it.
  - New browser phase `nested` (assignee A on synthetic mission
    `M13-F87E37-UI4`): Page > sub-page > items with a link and an estimate;
    Yes/No rolls the sub-page up to 50% with Result OPEN; the edited estimate
    persists; breadcrumb and back links work; no overflow at 390 px;
    non-assignee B can read but gets no edit controls. Passed.
  - Results of the full rerun of the 11 core phases are recorded in STATUS.

- Migration 34 was then applied to the test project the same way, after a
  dry run listing only 34. The `nested` phase now also starts an item timer
  on an item's page, sees it running after reload, stops it with a note, and
  finds "Logged here" on the item, "Elapsed" on its row and the note on the
  mission's activity. The test project's logs confirm `Timer` logs tagged
  with the item.

## Not done / risks

- Reports do not yet break hours down by checklist item (the tag is stored,
  so this can be added).
- Migrations 33-34 are not applied to any other project (the user's other project
  still lacks migrations 10-32).
- Native template checklists (`checklist_template_nodes`) have no links or
  estimates yet.
