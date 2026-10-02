# Final QA Checklist

This checklist records the final QA gates for the full workbook-to-web task tracker replacement.

## Automated Evidence

| Requirement | Evidence |
| --- | --- |
| Landing page unchanged | `git diff -- app/page.tsx` must be empty. |
| Workspace routes build | `npm run build` must list the workspace routes without compile or prerender errors. |
| Auth-protected routes work for anonymous users | Runtime smoke against `npm run start` must return `200` for `/` and `/login`, and `307` redirects to `/login?redirectTo=...` for workspace routes. |
| Edge route guard covers every workspace route | `__tests__/lib/auth/protected-routes.test.ts` scans `app/(workspace)` and compares it with `PROTECTED_PREFIXES`. |
| Manager/member permission helpers are respected | Permission tests cover tasks, timers, attendance, support modules and task-tool workflow access. |
| Empty states are present | Dashboard charts, task grids/cards, timelines, employee charts/reports, task pages, checklist pages, attendance, logs and support pages render explicit empty-state copy. |
| Core formulas and flows pass unit coverage | Tests cover analytics, dashboard chart data, checklist progress sync, task filters/detail routes, timelines, stars, attendance, timers, support splits and task-tool workflows. |

## Commands

Run these from the project root:

```bash
npm test
npm run typecheck
npm run build
```

## Anonymous Auth Smoke

After `npm run build`, start the app with:

```bash
npm run start -- -p 3010
```

Expected responses without cookies:

| Route type | Expected |
| --- | --- |
| `/`, `/login` | `200` |
| `/dashboard`, `/tasks`, `/tasks/[taskTag]`, `/tasks/[taskTag]/checklist`, `/team`, `/team/[employeeId]/reports`, `/attendance`, `/task-tools`, `/timelines`, `/reports`, `/daily-facts`, `/ideas`, `/suggestions`, `/sales`, `/logs`, `/milestones`, `/settings` | `307` to `/login?redirectTo=...` |

## Manual Authenticated Smoke

These checks require a real manager account and a real member account in Supabase.

### Manager

- Create a task with multiple assignees and reviewers.
- Edit task metadata, priority, due date, scale and participant lists.
- Open the task page from the task tag link.
- Create task detail sections, folder/checklist links and work-file links from `/task-tools`.
- Create the master checklist, add page/group/item/task nodes, toggle progress sync and verify task progress updates.
- Create manual and split support tasks.
- Start and stop a timer for any task; confirm a task log is created automatically.
- Create or edit attendance for another employee.
- Generate team and employee report snapshots.
- Confirm manager-only controls appear on task tools, team star actions, attendance and support pages.

### Member

- Confirm manager-only task creation/edit/delete controls are hidden.
- Update status/progress only on assigned tasks.
- Start and stop a timer only on assigned tasks.
- Add/update checklist completion only when assigned.
- Create personal attendance for self only.
- Confirm team/report/task-tool manager actions are blocked or hidden.

## Latest Local Verification

Run on October 2, 2026 from `e:\Task Tracker` after the README QA/setup updates:

| Gate | Result |
| --- | --- |
| Landing page unchanged | Passed: `git diff -- app/page.tsx` returned no diff. |
| Unit tests | Passed: `npm test` completed with 26 files and 233 tests passing. |
| TypeScript | Passed: `npm run typecheck`. |
| Production build | Passed: `npm run build`; all workspace routes compiled. |
| Anonymous auth smoke | Passed on `npm run start -- -p 3015`: `/` and `/login` returned `200`; all workspace routes returned `307` to `/login?redirectTo=...`. |

## Current Live-Session Blocker

The repository does not include QA credentials (`QA_MANAGER_EMAIL`, `QA_MANAGER_PASSWORD`, `QA_MEMBER_EMAIL`, `QA_MEMBER_PASSWORD`) or a `SUPABASE_SERVICE_ROLE_KEY`. Without those, authenticated manager/member browser flows cannot be safely verified from the terminal without creating or mutating real project users. The exact next step is to provide two QA accounts, or run the Manual Authenticated Smoke section in a browser and report any failed step.
