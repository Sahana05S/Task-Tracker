# labels

## What it does
Workspace labels (update plan of 3 November 2026, workstream G). A label groups
related records across the app: missions, notes (the learning module) and
meeting points (D-G1). In code and copy the word is **label**; "tag" stays the
mission identifier (`tasks.task_tag`), and `#` is only how a label is typed.
The managing director and project engineers create, rename, recolour and
archive labels (on `/labels` and in Settings > Company > Labels). Anyone who
may edit a record may add or remove its labels; a manager may create a new
label while typing it. Renaming keeps the label's id, so every link survives.
`/labels` lists them, `/labels/<slug>` shows what carries one (only records the
viewer may read), and `/tasks?label=<slug>` filters the Missions table.
Labels feed no score (D14). On the Today map they only highlight (5 November
2026): a hashtag picker lists `label_catalogue()`, and choosing one marks the
missions, notes' missions, opened Quests and objectives whose notes carry it
(migration 126) and linked sub-mission rows that carry it,
through `labels_for` and `labelled(slug)` (so only what the viewer may read),
with optional faint "label link" lines kept apart from the stored mission
relations; label links never become `task_dependencies` and never move a star.

Show and filter (user decision, 4 November 2026): a mission's labels show as
chips wherever it appears (Missions cards and table rows, the mission page
header, Today's list rows, the open mission on the map, and as text under each
mission star), each chip opening `/labels/<slug>`. Each page reads them in one
batch (`labels_for('task', ids)`; Today once per batch of missions). The
Missions page has a Labels filter beside the others: several labels, a mission
matches when it carries any of them, combined with the other filters and kept
in the URL as `?label=a&label=b` (an older `?label=a` still works). The New
mission form takes labels too; they are attached through `label_link_command`
once the mission exists, and a refused one never undoes the mission. A meeting
point on a label page links to its card on Meeting Points
(`/meeting-points?date=<day>#record-<id>`, the period holding that day).

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getLabelCatalogue()`, `getLabelsFor(kind, ids)`, `getLabelled(slug)` (each null on a failed read or before migration 112); everything in `client.ts` |
| `actions.ts` | `manageLabel(form)` (create, rename, archive, restore), `changeLabelLink(form)` (attach by id or name, detach) |
| `client.ts` | Types `Label`, `CatalogueLabel`, `LabelCatalogue`, `LabelledRecords`, `LabelledItem`, `LabelSubjectKind`, `LabelColour`; `LABEL_COLOURS`, `LABEL_COLOUR_CLASS` (theme classes per token), `LABEL_COLOUR_NAME`, `labelSlug`, `cleanLabelName`, `labelSuggestions` |
| `components/label-input.tsx` | `LabelInput`: a record's chips with remove buttons and the `#` add box with suggestions |
| `components/label-chips.tsx` | `LabelChip`, `LabelChips`: read-only chips linking to `/labels/<slug>` (`max` shows a "+n" for tight places) |
| `components/label-combobox.tsx` | `LabelCombobox`: the `#` add box with suggestions (reports a choice; used by `LabelInput`, `LabelPicker` and the Notes panel); optional `placeholder` / `ariaLabel` |
| `components/label-picker.tsx` | `LabelPicker` (labels chosen before the record exists), `attachPickedLabels(kind, id, picks, path)` |
| `components/label-filter.tsx` | `LabelFilter`: several labels by slug, for a list's filters (Missions) |
| `components/label-manager.tsx` | `LabelManager`: create / rename / colour / archive list, and "Make note type" (migration 126) |

Where they show: the mission's Details tab (a Labels panel, and each note's
hashtags in the Notes panel), the mission page header, Missions cards and table rows
(and the Labels filter and New mission field), Today's list and map, each
meeting point (through `DatedRecordModule`'s `extras`), `/labels`,
`/labels/[slug]` and Settings > Company.

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
- `label_command(op, label, name, colour, description, operation)`: managing director and project engineers; idempotent; audited as `label_<op>` with the label's name as the reason ("#Crane", since 116).
- `label_link_command(op, kind, subject, label, name, operation)`: whoever may edit the subject (mission: managers or an assignee, not archived; learning note: its author while a writer, or a manager; meeting point: managers, data managers or its author); at most 20 labels per record. Since migration 116 each link it actually adds or removes is audited as `label_link_attach` / `label_link_detach` (row = the label, `task_id` = the record's mission, reason = "#name"); replays and unchanged links write nothing.
- Team > Activity (migration 116): `activity_feed` lists `labels` (Company: Created / Renamed / Archived / Restored a label, linking to `/labels`) and `label_links` (Missions: Added / Removed a label, linking to the mission, seen by the mission's people).
- Helpers `taskpulse_private.label_slug`, `label_json`, `label_subject_readable`, `label_subject_editable`, `label_require_member`.

Migration 126 (Notes, owned by the learning module) adds:
- `labels.note_type` (in `label_json` as `noteType`); `label_command` ops `note_type_on` / `note_type_off` (managers; audited as `label_note_type_<on|off>`).
- 26 starter hashtags per company, created once by slug (types, topics, causes, impact; see the learning README).
- `labelled(slug)`: a note item also has `taskId`, `nodeId` and `nodeTitle`; the label page groups them as "Notes".
- A note's last type hashtag cannot be detached (deferred constraint trigger).

Harness: `tools/test_workspace_labels_database.py`.

## Depends on
`shared/*` only. `tasks` (cards, table, filters, New mission form),
`workspace-views` (Today) and `learning` (Notes) import its `client.ts` and
`components/`. Pages pass its components into the support module through its
`extras` slot.
