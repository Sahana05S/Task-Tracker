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
  - a closed task refuses edits.
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

## Not done / risks

- The item timer is not built; whether its time counts as task hours is
  undecided.
- Migration 33 is not applied to any other project (the user's other project
  still lacks migrations 10-32).
- Native template checklists (`checklist_template_nodes`) have no links or
  estimates yet.
