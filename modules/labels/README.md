# labels

## What it does
Workspace labels (update plan of 3 November 2026, workstream G). A label groups
related records across the app: missions, Mistakes and learning notes and
meeting points (D-G1). In code and copy the word is **label**; "tag" stays the
mission identifier (`tasks.task_tag`), and `#` is only how a label is typed.
The managing director and project engineers create, rename, recolour and
archive labels (on `/labels` and in Settings > Company > Labels). Anyone who
may edit a record may add or remove its labels; a manager may create a new
label while typing it. Renaming keeps the label's id, so every link survives.
`/labels` lists them, `/labels/<slug>` shows what carries one (only records the
viewer may read), and `/tasks?label=<slug>` filters the Missions table.
Labels feed no score and no graph (D14).

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getLabelCatalogue()`, `getLabelsFor(kind, ids)`, `getLabelled(slug)` (each null on a failed read or before migration 112); everything in `client.ts` |
| `actions.ts` | `manageLabel(form)` (create, rename, archive, restore), `changeLabelLink(form)` (attach by id or name, detach) |
| `client.ts` | Types `Label`, `CatalogueLabel`, `LabelCatalogue`, `LabelledRecords`, `LabelledItem`, `LabelSubjectKind`, `LabelColour`; `LABEL_COLOURS`, `LABEL_COLOUR_CLASS` (theme classes per token), `LABEL_COLOUR_NAME`, `labelSlug`, `cleanLabelName`, `labelSuggestions` |
| `components/label-input.tsx` | `LabelInput`: a record's chips with remove buttons and the `#` add box with suggestions |
| `components/label-chips.tsx` | `LabelChip`, `LabelChips`: read-only chips linking to `/labels/<slug>` |
| `components/label-manager.tsx` | `LabelManager`: create / rename / colour / archive list |

Where they show: the mission's Details tab (a Labels panel and a box under
each learning note), each meeting point (through `DatedRecordModule`'s
`extras`), `/labels`, `/labels/[slug]`, Settings > Company and the Missions
page notice for `?label=`.

## Private (`internal/`)
| File | Job |
|---|---|
| `rules.ts` | Kinds, colour tokens, slug and suggestion helpers, payload mappers |
| `queries.ts` | `label_catalogue`, `labels_for`, `labelled` |
| `commands.ts` | `label_command`, `label_link_command` and their error messages |

## Database it owns
Migration 112 (`112_workspace_labels.sql`):
- `public.labels(id, organization_id, name, slug unique per company, colour_token, description, created_by, created_at, archived_at)`.
- `public.label_links(label_id, subject_kind, subject_id, organization_id, created_by, created_at)`, primary key `(label_id, subject_kind, subject_id)`; kinds `task`, `mission_learning`, `meeting_point`.
- Both company-owned, no direct grants, FORCE RLS by `m15_secure()`.
- `label_catalogue()`, `labels_for(kind, ids)`, `labelled(slug)`: every active member; links to withdrawn notes or meeting points and to other companies are never returned.
- `label_command(op, label, name, colour, description, operation)`: managing director and project engineers; idempotent; audited as `label_<op>`.
- `label_link_command(op, kind, subject, label, name, operation)`: whoever may edit the subject (mission: managers or an assignee, not archived; learning note: its author while a writer, or a manager; meeting point: managers, data managers or its author); at most 20 labels per record.
- Helpers `taskpulse_private.label_slug`, `label_json`, `label_subject_readable`, `label_subject_editable`, `label_require_member`.

Harness: `tools/test_workspace_labels_database.py`.

## Depends on
`shared/*` only. Pages pass its components into the learning and support
modules through their slots (`noteExtras`, `extras`), so neither imports it.
