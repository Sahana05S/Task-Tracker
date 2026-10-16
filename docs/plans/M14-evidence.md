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
    a closed task refuses item timers.
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
