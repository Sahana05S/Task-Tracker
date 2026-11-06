# learning

## What it does
Quest notes (migration 132, user request 6 November 2026). A Crew member who makes a mistake or learns
something while working on a Quest writes it down on that Quest and tags it with ordinary company labels
(for example #mistake or #learning, which the company creates like any label). Notes and labels feed no
score.

- Entry point: the Quest row's ⋯ menu has a "Notes" item in Table, Board, Blocks and Outline (for viewers
  who may not change the row, the ⋯ opens the notes directly). A Quest row shows a small count badge only
  when it has notes. Nothing else is added to the page.
- The side panel (`QuestNotesSheet`) lists the Quest's notes newest first; each shows its labels as chips.
  Tapping a chip shows only that label's notes, with "See all #label notes" linking to `/labels/<slug>`.
  The add box takes short text and one or more labels through the normal `#` label picker (a new label
  only for Managers and the managing director). The author edits; the author, Managers and the managing
  director delete.
- `/labels/<slug>` lists the notes carrying the label grouped by mission › Quest (labels module), each
  linking to the Quest's row with its notes open (`?notes=<row id>`).
- Not built (user decision): notes on objectives or on the mission itself, a Today-map highlight, a History
  filter. Earlier Notes (migrations 111 and 126) were removed by 129; their panel, Work-tab count and
  objective buttons do not come back.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getQuestNoteCounts(taskId)` (null before 132 or on a failed read); everything in `client.ts` |
| `client.ts` | Types `QuestNote`, `QuestNotes`; `filterNotes`, `NOTE_MAX_LENGTH` |
| `actions.ts` | `loadQuestNotes(nodeId)` (notes + company labels, read when the panel opens), `questNoteCommand(form)` (add / edit / delete) |
| `components/quest-notes-sheet.tsx` | `QuestNotesSheet` (the side panel; used by the checklists row menu) |

## Private (`internal/`)
| File | Job |
|---|---|
| `rules.ts` | Payload mappers, the label filter |
| `queries.ts` | `quest_notes`, `quest_note_counts` |
| `commands.ts` | `mission_note_command` |
| `cache.ts` | Pages to refresh after a change |

## Database it owns
- `public.mission_learnings` (111, reused): `checklist_node_id` is the Quest row (126).
- Migration 132 (`132_quest_notes.sql`): the type-hashtag triggers of 126 are dropped; `mission_note_command`
  is granted again (add on a Quest of the mission by its Crew, Managers and the managing director who may
  read the mission's work; at least one label; edit by the author; delete by the author, Managers and the
  MD; audited as `mission_note_<op>` with the labels and the Quest's name, never the text);
  `quest_notes(node)` and `quest_note_counts(task)` (only for `can_read_mission_work`, 117);
  `labelled()` note items also give `listId` and `rootList`. `mission_learning_command` (111) stays revoked.
- Harness: `tools/test_mission_learnings_database.py` (111, 126, 129 and 132).

## Depends on
`shared/*`, the public API of `labels` (catalogue, `LabelPicker`, colours). The checklists module renders
`QuestNotesSheet` and reads the counts.
