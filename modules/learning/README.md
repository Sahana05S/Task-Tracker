# learning

## What it does
Mistakes and learning on the mission page (update plan of 3 November 2026,
workstream E; the user chose to keep them with the mission). Each note is a
mistake or a learning, tied to one mission. Every active member of the company
reads them on the mission's Details tab; the Work tab shows their count. The
mission's assignees, project engineers and the managing director add notes; the
author (while still one of those) or a manager edits or withdraws one. An
archived mission's notes are read-only. Not a dated record and never part of a
score; each change is one `mission_learning_<op>` line in Team > Activity.
Labels attach through the labels module (migration 112), passed in by the page.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getMissionLearnings(taskId)` (null before migration 111 or on a failed read); everything in `client.ts` |
| `actions.ts` | `saveLearning(form)` (add, or edit with `learningId`), `withdrawLearning(form)` |
| `client.ts` | Types `MissionLearning`, `MissionLearnings`, `LearningKind`; `LEARNING_KINDS`, `LEARNING_KIND_LABEL`, `LEARNING_MAX_LENGTH`, `learningCounts` |
| `components/learning-panel.tsx` | `LearningPanel`, the Details tab panel (list, add, edit, withdraw); `noteExtras` slot per note (the page puts each note's labels there) |
| `components/learning-count-chip.tsx` | `LearningCountChip`, the Work tab link with the count |

## Private (`internal/`)
| File | Job |
|---|---|
| `rules.ts` | Kinds, limits, counts, the payload mapper |
| `queries.ts` | `mission_learnings(task)` |
| `commands.ts` | `mission_learning_command` and its error messages |

## Database it owns
Migration 111 (`111_mission_learnings.sql`):
- `public.mission_learnings(id, organization_id, task_id, kind, body, author_id, created_at, updated_at, record_state)`; no direct grants, FORCE RLS by `m15_secure()`.
- `public.mission_learnings(p_task)` read: `{canAdd, items[]}`, active notes newest first, each with `canEdit`.
- `public.mission_learning_command(p_op, p_task, p_learning, p_kind, p_body, p_operation)`: `add`, `edit`, `withdraw`; idempotent through `command_receipts`; audited without the text.
- `taskpulse_private.mission_learning_writer(task)`: the write rule.
- `public.activity_feed` gains `mission_learnings` in its rules (body of migration 59 otherwise unchanged).

Harness: `tools/test_mission_learnings_database.py`.

## Depends on
`shared/*` only.
