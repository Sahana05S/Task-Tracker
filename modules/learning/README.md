# learning (Notes)

## What it does
Notes on the mission page (migration 126, 6 November 2026; it replaced the
Mistakes and learning panel of migration 111, whose table it reuses). A note is
a short text with one or more hashtags (workspace labels from the labels
module), at least one of them a **note type** (#mistake, #learning, #idea,
#decision, #risk, #blocker, #followup to start; Managers change the list in
Settings > Company > Labels). The database refuses a note without a type
hashtag, including removing its last one.

A note belongs to the mission, or to one of its Quests or objectives. The
Details tab's Notes panel (`#notes`) lists all of them, newest first, with
author, date, hashtag chips and the Quest or objective each came from, and
filters by hashtag. Each checklist row has a Notes button and a Quest's home a
"Notes on this Quest" link; both open the panel scoped to that row
(`?tab=details&notes=<row id>&noteTitle=<title>`), where new notes go on it.
The Work tab shows the count.

Only the managing director and the mission's people read notes
(`can_read_mission_work`, migration 117). The mission's Crew, Managers on it and
the managing director add notes; the author edits; the author or a manager
deletes. An archived mission's notes are read-only. Never part of a score; each
change is one `mission_note_<op>` line in Team > Activity and the mission's
History ("Added a note #mistake #client").

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getMissionNotes(taskId)` (null on a failed read or before migration 126), `getMissionNoteHashtags(taskIds)` (hashtag slugs per mission, for the Missions filter); everything in `client.ts` |
| `actions.ts` | `saveNote(form)` (add, optionally on `nodeId`; or edit with `noteId`; `labelIds` and `newLabels` repeated), `deleteNote(form)` |
| `client.ts` | Types `MissionNote`, `MissionNotes`, `NoteNodeKind`; `NOTE_MAX_LENGTH`, `NOTE_MAX_HASHTAGS`, `filterNotes`, `noteHashtagCounts`, `noteTypeLabels`, `hasNoteType`, `hashtagLine` |
| `components/notes-panel.tsx` | `NotesPanel`: list, hashtag filter, add (type chips and the `#` box), edit, delete; `scope` for one Quest or objective |
| `components/notes-count-chip.tsx` | `NotesCountChip`, the Work tab link with the count |

## Private (`internal/`)
| File | Job |
|---|---|
| `rules.ts` | Limits, filters, counts, the payload mappers |
| `queries.ts` | `mission_notes(task)`, `mission_note_hashtags(tasks)` |
| `commands.ts` | `mission_note_command` and its error messages |

## Database it owns
Migration 111 (`111_mission_learnings.sql`), extended by 117 (privacy) and 126 (`126_mission_notes.sql`):
- `public.mission_learnings(id, organization_id, task_id, checklist_node_id, kind, body, author_id, created_at, updated_at, record_state)`; no direct grants, FORCE RLS by `m15_secure()`. `checklist_node_id` (126) is a Quest or objective of the same mission (SET NULL if the row is removed); `kind` is kept for the old read (derived from #mistake / #learning, else NULL).
- Hashtags are `label_links` rows of subject kind `mission_learning` (labels module).
- `public.mission_note_command(op, task, note, node, body, labels, new_labels, operation)`: `add`, `edit`, `delete` with the hashtags in one transaction; idempotent through `command_receipts`; audited as `mission_note_<op>` with the hashtags as the reason and the Quest or objective as `node_title` (never the text). A company with no type hashtag gets the starter set on its first note.
- `public.mission_notes(task)`: `{canAdd, items[]}`, each with `canEdit`, `canDelete`, `nodeId`, `nodeTitle`, `nodeKind`, `labels`.
- `public.mission_note_hashtags(tasks)`: `{mission id: [slug]}` for readable notes.
- `taskpulse_private.note_type_check()` (deferred constraint triggers on `mission_learnings` and `label_links`), `note_starter_hashtags(org, actor)`, `note_hashtag_line(note)`, `mission_learning_writer(task)`.
- Compatibility: `mission_learnings(task)` (111/117) and `mission_learning_command(...)` (now a wrapper that writes a typed note).

Harness: `tools/test_mission_learnings_database.py`.

## Depends on
`shared/*` and the labels module's public files (`client.ts`, `components/label-chips`, `components/label-combobox`).
