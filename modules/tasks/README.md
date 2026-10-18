# tasks

Missions (tasks): creating and editing them with their assignees, reviewers and
participant shares; the lifecycle (status, progress, scale, review); native
details (Input/Process/Output sections, asset links, related tasks, templates);
the `/tasks` workspace and mission details page; and Task Tools (batch
operations that are previewed first and committed atomically).

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | Server reads: `getTaskWorkspaceData`, `resolveTaskDetailRouteState`, `getTaskDetailData`, `normalizeTaskTagParam`, `getNativeTemplates`, `getNativeDetailState`, `getVisibleReportChoices`, `getParticipantReconciliation`. Also re-exports everything in `client.ts`. |
| `client.ts` | Pure rules and types, safe for `'use client'`: task contract (`PRIORITY_WEIGHTS`, `FRESHNESS_SCORES`, `eligibilityReasons`, `classifyFreshness`, `scaleValue`), details contract (`DETAIL_FIELDS`, `ipoLinks`, ...), permissions (`canManageTasks`, `canUpdateTaskOwnFields`, `isAssignedToTask`), shares, mappers (`mapTask`, `TASK_COLUMNS`), Task Tools workflows and types |
| `actions.ts` | `'use server'` task commands: `createTask`, `updateTask`, `updateTaskStatus`, `updateTaskProgress`, `changeTaskLifecycle`, `recordTaskReview`, `deleteTask` |
| `detail-actions.ts` | `'use server'` native-details commands: `initializeTaskDetails`, `saveTaskDetails`, `addTaskAsset`, `addTaskRelation`, `renameNativeLink`, `publishNativeTemplate` |
| `tool-actions.ts` | `'use server'` Task Tools: `previewTaskTool`, `commitTaskTool` |
| `components/` | `TaskWorkspace`, `TaskDialog`, `MissionHeadline`, `NewTaskButton`, `TaskLifecyclePanel`, `TaskReviewForm`, `WorkFileCreator`, native details editor/template manager, Task Tools forms, and `detail/` (the mission details page panels) |

## Private (`internal/`)
| File | Job |
|---|---|
| `input.ts` | Parses and validates the task and scale forms |
| `commands.ts` | Task writes: save with participants, lifecycle command, delete, tag lookup |
| `details-commands.ts` | Native-details and template RPCs |
| `cache.ts` | Which pages to revalidate after each kind of change |
| `queries.ts` | `/tasks` workspace data (tasks and members) |
| `effort.ts` | `TaskEffort` totals type and `EMPTY_EFFORT` |
| `detail.ts` | Mission details page data (task, people, sections, links, dependencies, checklist rollup, effort totals) |
| `native-details.ts` | Templates, detail instances, review flags, report choices |
| `reconciliation.ts` | Legacy participant reconciliation preview |
| `contract.ts` | Task rules: weights, freshness, eligibility, scale |
| `details-contract.ts` | Native detail fields and IPO roles |
| `permissions.ts` | Role/assignment checks (UI messages; RLS and RPCs are the real boundary) |
| `filters.ts` | Workspace filtering and sorting |
| `shares.ts` | Participant share units |
| `mappers.ts`, `credit-summary.ts` | Database row -> domain model |
| `tools/` | Task Tools contract, support split, workbook workflow list, preview/commit RPCs |

## Database it owns
| Object | Defined in |
|---|---|
| `tasks` | `01_init_schema.sql` (later columns in 07, 10, 16, 17, 25) |
| `task_assignees`, `task_reviewers`, `task_links`, `task_dependencies` | `07_tracker_replacement_foundation.sql` |
| `task_detail_templates`, `task_detail_template_versions`, `task_detail_instances`, `task_detail_sections`, `task_detail_review_flags` | `17_native_task_details_and_templates.sql` |
| `save_task_with_participants` | 10, revised in 12, 16, 17 |
| `task_lifecycle_command` | `16_task_lifecycle_and_scale_contract.sql` |
| `task_details_command` | 17, revised in 18, 26, 38 |
| `publish_task_detail_template` | `17_native_task_details_and_templates.sql` |
| `task_tools_preview`, `task_tools_command` | 24, revised in 25 (preview also 31, 32) |
| `participant_reconciliation` | `10_permissions_and_participant_contract.sql` |

All of these are company-scoped by migrations 39-40 (M15).

## Depends on
`shared/*`, the public API of `checklists` (rollups and checklist types), and
these areas that are not modules yet: `lib/analytics/headline` (mission
headline), `components/missions`, `components/tracker`.

Tasks does not import time-tracking (time-tracking depends on tasks). The task
cards take a `LogHoursAction` slot that the `/tasks` page fills, and the mission
page loads logs and timers from time-tracking itself.
