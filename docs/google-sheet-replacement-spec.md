# Google Sheet Replacement Implementation Spec

> M00 note (10 October 2026): This document describes historical or provisional
> behavior. Conflicting business rules and completion claims are superseded by
> [RULES](plans/RULES.md), [DECISIONS](plans/DECISIONS.md) and
> the [M00 conflict ledger](plans/M00-evidence.md#older-documentation-conflicts).
> Retain unrelated architecture notes. Named missing script handlers do not
> establish implemented parity. M01 has not started.

This document maps the September 2026 Google Sheet task tracker into the
TaskPulse web app. It is a planning/specification artifact only: it does not
change the public landing page, routes, database, or product behavior.

Source references used:

- `README.md` for the current stack, architecture, routes, schema, formulas, and
  known gaps.
- User-provided screenshots for dashboard, task tracker, timeline, team index,
  employee profile/charts, task detail page, and master checklist behavior.
- Attached workbook
  `3_1_2_a_Tasks Tracker - September 2026 - Saahithyaa Realtors and Builders.xlsx`
  for the 55-sheet structure, hidden templates, chart/report sheets, formulas,
  links, and custom menu names.

## 1. Current Baseline

- The app is a Next.js App Router workspace backed by Supabase, PostgreSQL RLS,
  server components, server actions, Tailwind, Shadcn/Radix primitives, and
  Recharts.
- Existing authenticated routes are `/dashboard`, `/tasks`, `/logs`,
  `/milestones`, and `/settings`; `/` is the deployed public landing page and
  must remain unchanged during the replacement work.
- Existing database coverage is limited to `users`, `tasks`, `daily_task_logs`,
  `monthly_performance_snapshots`, `company_statements`, and
  `company_milestones`.
- Current task ownership is single-assignee/single-reviewer. The replacement
  requires many assignees and many reviewers per task.
- The attached workbook contains 55 sheets, including dashboard sheets, hidden
  calculation sheets, team index, task tracker, timelines, employee reports,
  individual employee chart sheets, supporting logs, and one sheet per task.
- The `.xlsx` workbook does not include Google Apps Script code for custom menu
  actions. Those automations should be matched from sheet structure now and
  refined later if the Apps Script source becomes available.

## 2. Product Rules

- The web app replaces the Google Sheet completely; no historical workbook data
  import is required.
- Task tags such as `Sep26_OT1` are globally unique forever and must be stable
  URLs.
- Managers can assign, edit, review, and administer all task tracker records.
- A task can have any number of assignees and any number of reviewers.
- Subtasks must be reusable real tasks, not only nested checklist rows.
- Checklist progress is equal-weighted by item count. A parent reaches 100%
  only when every child item is complete.
- Daily stars are calculated automatically from app data.
- Timers are started by task assignees, continue in background/server state, and
  create task log entries automatically when stopped.
- Attendance must cover present, absent, half-day, holiday, leave, off-hours,
  check-in/out, and attendance hours.
- Keep the current application style until a later redesign is explicitly
  requested.

## 3. Roles and Permissions

| Role | App role mapping | Replacement responsibilities |
| --- | --- | --- |
| Managing Director | `managing_director` | Full access to tasks, users, reports, attendance, daily stars, timers, checklist templates, and settings. |
| Project Engineer / Manager | `project_engineer` | Can create, assign, edit, duplicate, review, and close tasks; can manage checklists and support tasks. |
| Data Manager | `data_manager` | Can maintain supporting records, reports, logs, daily facts, ideas, suggestions, and sales entries as permitted by management. |
| Team Member | `team_member` | Can view team data, work assigned tasks, start/stop own timers, submit logs, update own task progress/status where allowed, and view own profile/reports. |

RLS should keep final authority in Supabase. Application-level role checks should
exist only to provide clearer errors and hide unavailable actions.

## 4. Workbook Sheet to App Module Map

| Workbook area | Web module | Routes | Core tables/entities | Primary roles |
| --- | --- | --- | --- | --- |
| `A_Sheet_Attributes` | Workspace settings and reference data | `/settings` plus admin-only settings sections | `workspace_settings`, task category metadata, month/year settings, external folder references | Managing Director |
| `B_Summary & Analysis` | Analytics engine | Internal data layer for dashboards and reports | analytics views/functions over tasks, logs, attendance, stars, supporting entries | All view; managers freeze/administer |
| `B_Dashboard Charts` | Dashboard chart datasets | `/dashboard` | derived chart datasets, no user-edit table required | All view |
| `1_Dashboard` | Team dashboard | `/dashboard` | tasks, assignees, logs, stars, snapshots, attendance | All view; managers snapshot |
| `1_1 Perf Sub Scores Charts` | Team performance breakdown | `/dashboard` and report drilldowns | monthly/daily score components | All view |
| `1_2 Performance Analysis` | Performance scoring | Internal analytics module | productivity, loading, criticality, completion, freshness score records or computed views | All view |
| `1_3 DailyPerfLog` | Daily performance history | `/team`, `/team/[employeeId]` | `daily_star_records`, daily score components | All view; system computes |
| `C_Team Members` | Team directory | `/team` | `users`, profile metadata, roles, employee IDs | All view; directors manage |
| `1 5 Team Index` | Team index and daily star log | `/team` | users, employee report links, daily stars, current score summaries | All view |
| `2_Tasks` | Main task tracker | `/tasks` | `tasks`, `task_assignees`, `task_reviewers`, task metrics, dates, status, freshness | All view; managers edit; assignees update own work |
| `Task Timelines` | Task timeline/Gantt | `/timelines` | tasks, assignments, dates, status, freshness | All view |
| `D_Template Task Page` | Task detail template | `/tasks/[taskTag]` | task details, SMART goals, task links/assets, dependencies, logs | All view; managers edit; assignees log |
| `Sep26_*` task sheets | Task detail pages | `/tasks/[taskTag]` | one task per URL; no separate sheet/table per task | All view; managers edit; assignees log |
| Master checklist workbooks | Checklist engine | `/tasks/[taskTag]/checklist` | checklist templates, checklist pages, checklist nodes, task-linked subtasks | All view; managers edit; assignees update own checklist items if allowed |
| `2a Edit Log` | Task/system audit history | Admin/report section | `audit_events` or append-only change logs | Managers/admins view; system writes |
| `3_Meeting Points` | Meeting points | `/meeting-points` or supporting records section | `meeting_points`, meeting types, links, owners | All view; permitted contributors edit |
| `4_Daily Facts` | Daily facts | `/daily-facts` or supporting records section | `daily_facts` with poster, date, content, folder link, validation | All view; permitted contributors create |
| `5_Ideas` | Ideas log | `/ideas` or supporting records section | `ideas` with poster, date, idea, folder link, validation | All view; permitted contributors create |
| `6_Suggestions` | Suggestions log | `/suggestions` or supporting records section | `suggestions` with poster, date, suggestion, folder link, validation | All view; permitted contributors create |
| `7_Sales Log` | Sales/project log | `/sales` or supporting records section | `sales_logs` with salesperson, project/client fields, folder, flags | Managers and assigned sales users |
| `7 General Reports` | General report compilation | `/reports` | report views over task logs, attendance, support logs | All view or manager-filtered |
| `2_1 * Reports` | Employee reports | `/team/[employeeId]/reports` | employee task list, task log compilation, today/yesterday tasks, attendance/task hour summaries | Employee self; managers; transparent team view if desired |
| `1_4 * Charts Individual` | Employee analytics charts | `/team/[employeeId]` | per-employee analytics datasets | Employee self; managers; team view if desired |
| `Vision - Mission - Values` | Existing milestones/showcase | `/milestones` | existing `company_statements`, `company_milestones` | All view; leadership edit |

## 5. Custom Menu to Web Action Map

| Workbook menu/action | Web replacement | Data written | Access |
| --- | --- | --- | --- |
| `Tasks Tools > Task Timer > Run Timer` | Start timer button on task detail/grid | active timer row with task, user, started time | Assigned user; managers |
| `Tasks Tools > Task Timer > Stop Timer` | Stop timer button | closes timer and creates task log | Timer owner; managers |
| `Tasks Tools > Task Timer > Enter Time in Minutes and Hours` | Manual time entry dialog | task log row, optional timer/manual flag | Assigned user; managers |
| `Tasks Tools > Task Log` | Log update drawer/dialog | task log row with notes, hours, raw links, progress delta | Assigned user; managers |
| `Tasks Tools > Task Status` | Status/progress controls | task status/progress, completion date, met deadline | Assigned user within limits; managers |
| `Tasks Tools > Task Duplication` | Duplicate task action | new globally unique task tag, copied task metadata/checklist template as selected | Managers |
| `Tasks Tools > Task Details` | Task detail editor | task description, SMART goals, input/process/output links | Managers; limited assignee edits if approved |
| `Tasks Tools > Support Tasks` | Create linked support task action | new task plus dependency/support relation | Managers |
| `Tasks Tools > Import Tasks` | Create/bulk-create task flow | task rows and assignments | Managers |
| `Tasks Tools > Master Checklist Updates` | Checklist sync/recalculate action | checklist nodes, task progress, status summaries | Managers; system jobs |
| `Tasks Tools > Refresh Data` | Refresh/recompute analytics action | computed summaries/snapshots where persisted | Managers; system jobs |
| `Daily Facts` | Add daily fact workflow | `daily_facts` | Permitted contributors; managers validate |
| `Create Work Files` | Work asset/link creation workflow | task links/assets/folders | Managers initially; later file-provider integration |
| `Report` | Generate/freeze report action | report snapshot or derived report view | Managers |

Apps Script access is not required to start modules through task details,
checklists, timers, attendance, dashboards, and reports. It is required only for
exact parity with hidden menu-side effects if those differ from the workbook
structure.

## 6. Target Routes

| Route | Purpose |
| --- | --- |
| `/dashboard` | Team analytics, dashboard charts, star performer, performance medians. |
| `/tasks` | Main task tracker grid/cards with clickable task tags. |
| `/tasks/[taskTag]` | Sheet-equivalent task detail page. |
| `/tasks/[taskTag]/checklist` | Master checklist tree and progress rollup. |
| `/timelines` | Gantt-style task timeline grouped by assignee. |
| `/team` | Team index, profile/report links, daily star log. |
| `/team/[employeeId]` | Employee profile, assigned tasks, personal summaries, charts. |
| `/team/[employeeId]/reports` | Employee task log compilation and reports. |
| `/attendance` | Attendance log and summaries. |
| `/logs` | Existing personal effort history; should merge with timer/manual logs. |
| `/milestones` | Existing vision, mission, values, and monthly milestones. |
| `/meeting-points` | Meeting point records if kept as a first-class module. |
| `/daily-facts`, `/ideas`, `/suggestions`, `/sales`, `/reports` | Supporting modules; may be grouped under a single reports/tools area in v1 if navigation would become too crowded. |

## 7. Target Data Model Additions

The exact SQL should be implemented in later migrations after this spec is
accepted. The minimum required entities are:

- `task_assignees`: task-to-user join table with role/assignment metadata.
- `task_reviewers`: task-to-user join table for reviewer assignments.
- `task_dependencies`: directed task-to-task links for dependency/support/carryover
  relationships.
- `task_detail_fields`: task SMART goals, description sections, and structured
  input/process/output notes if not stored directly on `tasks`.
- `task_links`: typed links/assets for documents, accounts, flowcharts,
  engineering, drawings, folders, raw links, checklist links, and external work
  files.
- `checklist_templates`: reusable checklist templates.
- `checklist_pages`: named checklist sections/pages such as setup, closure, and
  checklist index.
- `checklist_nodes`: hierarchical checklist items with parent node, linked task,
  item type, completion state, estimated time, elapsed time, and sort order.
- `task_timers`: active and completed timer sessions with task, user, start/stop,
  elapsed seconds, source, and generated log reference.
- `attendance_records`: daily attendance state, check-in/out, attendance hours,
  off-hours, holiday/leave markers, and manager notes.
- `daily_star_records`: computed daily winner and component scores.
- `performance_score_components`: optional persisted score breakdowns for
  productivity, progress, loading, criticality, freshness, completions, ideas,
  suggestions, facts, and sales.
- `meeting_points`, `daily_facts`, `ideas`, `suggestions`, `sales_logs`: support
  modules from workbook tabs.
- `report_snapshots`: optional persisted report freezes for month-end reporting.
- `audit_events`: append-only system/edit log for task and report actions.

Existing tables should remain readable while migrations are introduced. Existing
`tasks.assignee_id` and `tasks.reviewer_id` can be retained temporarily as a
compatibility bridge, then treated as primary assignee/reviewer projections once
join tables are populated.

## 8. Analytics and Chart Requirements

Dashboard charts to reproduce from `1_Dashboard`:

- Performance with median.
- Task priorities.
- Task statuses.
- Task assignees.
- Task types.
- Tasks done on dates.
- Met/missed deadlines.
- Priority loading on team.
- Total progress.
- Star performer of the month.

Team performance charts from `1_1 Perf Sub Scores Charts`:

- Completions with median.
- Productivity differences with median.
- Criticality differences with median.
- Loading differences with median.
- Sales, ideas, daily facts, and suggestions scores.

Employee charts from `1_4 * Charts Individual`:

- Performance score trend.
- Productivity trend.
- Progress trend.
- Completion trend.
- Loading trend.
- Criticality trend.
- Task types.
- Task priorities.
- Task statuses.
- Task documentation.
- Task freshness.

Analytics should be implemented as pure TypeScript functions or SQL views first,
then rendered with Recharts. Persist snapshots only where a report must be frozen
for month-end review.

## 9. Implementation Modules and Order

1. Product spec and workbook mapping.
2. Database foundation migrations and TypeScript type updates.
3. Workspace navigation and route skeletons.
4. Main task tracker grid/cards.
5. Task detail page.
6. Master checklist engine.
7. Timer and automatic task log system.
8. Attendance system.
9. Team index, employee profiles, and employee reports.
10. Automatic daily star calculation.
11. Dashboard analytics and team charts.
12. Individual employee charts.
13. Task timelines.
14. Supporting logs: reports, daily facts, ideas, suggestions, sales, meeting
    points.
15. Web replacements for workbook menu automations.
16. Final QA, README updates, and Vercel readiness.

Each implementation module should be executed as a separate Goal Mode objective
and verified independently with `npm run typecheck`, `npm run build`, and focused
unit tests for any pure scoring/checklist/timer logic.

## 10. Acceptance Criteria

- The public landing page remains unchanged.
- All workbook major sheets and custom menu actions are represented by a route,
  module, table/entity, or documented later Apps Script-dependent workflow.
- Managers can administer tasks, checklists, reports, attendance, daily stars,
  timers, and support records.
- Assignees can work assigned tasks, operate timers, and generate logs without
  manager intervention.
- Task tags are globally unique links to task detail pages.
- Multi-assignee and multi-reviewer tasks are supported at the data model level.
- Checklist progress rolls up deterministically from equal-weight child items.
- Daily stars are automatic and stored for history.
- Attendance and timers feed employee reports and dashboard analytics.
- No old workbook data import is required for v1.
- TypeScript/build checks continue to pass after implementation modules.

## 11. Open Follow-Up Inputs

- Apps Script source, if available later, to exactly reproduce hidden menu
  side-effects.
- Final scoring formula for daily stars. Until specified, use a documented
  composite of productivity, scaled progress, checklist completion, freshness,
  and attendance validity.
- Whether supporting modules should be separate top-level navigation items or
  grouped under a single reports/tools area.
- Whether all employees can view everyone’s detailed reports or only managers
  plus the employee can view individual detail pages.
