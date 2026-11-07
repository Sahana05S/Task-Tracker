/**
 * Every workspace page, with a concrete URL for the dynamic ones.
 * `tests/e2e/public/route-inventory.spec.ts` fails when a page under app/ is
 * missing here, so new pages cannot go untested by accident.
 *
 * `audience` is who should be able to open the page:
 *   all      - any active member
 *   manager  - project engineers and the managing director (others are sent to /today)
 *   md       - the managing director only (others are sent to /today)
 */
export type Audience = 'all' | 'manager' | 'md';

export interface WorkspaceRoute {
  readonly file: string;
  readonly path: string;
  readonly audience: Audience;
}

// Placeholders for dynamic segments: the crawl expects a clean "Not found"
// page for ids that do not exist, never a crash.
const MISSING_TAG = 'QA_NO_SUCH_TAG';
const MISSING_UUID = '00000000-0000-4000-8000-000000000000';

export const WORKSPACE_ROUTES: readonly WorkspaceRoute[] = [
  { file: 'attendance/check-in', path: '/attendance/check-in', audience: 'all' },
  { file: 'attendance', path: '/attendance', audience: 'all' },
  { file: 'awards', path: '/awards', audience: 'all' },
  { file: 'daily-facts', path: '/daily-facts', audience: 'all' },
  { file: 'dashboard', path: '/dashboard', audience: 'all' },
  { file: 'guide/[topic]', path: '/guide/QA_NO_SUCH_TOPIC', audience: 'all' },
  { file: 'guide', path: '/guide', audience: 'all' },
  { file: 'hall-of-fame', path: '/hall-of-fame', audience: 'all' },
  { file: 'hr/documents/code-of-conduct', path: '/hr/documents/code-of-conduct', audience: 'all' },
  { file: 'hr/documents/letterhead', path: '/hr/documents/letterhead', audience: 'all' },
  { file: 'hr/documents', path: '/hr/documents', audience: 'all' },
  { file: 'hr', path: '/hr', audience: 'all' },
  { file: 'hr/reviews/[reviewId]', path: `/hr/reviews/${MISSING_UUID}`, audience: 'all' },
  { file: 'hr/reviews', path: '/hr/reviews', audience: 'all' },
  { file: 'ideas', path: '/ideas', audience: 'all' },
  { file: 'labels', path: '/labels', audience: 'all' },
  { file: 'labels/[slug]', path: '/labels/qa-no-such-label', audience: 'all' },
  { file: 'leaderboard', path: '/leaderboard', audience: 'all' },
  { file: 'logs', path: '/logs', audience: 'all' },
  { file: 'meeting-points', path: '/meeting-points', audience: 'all' },
  { file: 'meeting-points/[id]', path: '/meeting-points/00000000-0000-0000-0000-000000000000', audience: 'all' },
  { file: 'milestones', path: '/milestones', audience: 'all' },
  { file: 'my-salary', path: '/my-salary', audience: 'all' },
  { file: 'payroll/employees/[userId]', path: `/payroll/employees/${MISSING_UUID}`, audience: 'md' },
  { file: 'payroll/employees', path: '/payroll/employees', audience: 'md' },
  { file: 'payroll/history', path: '/payroll/history', audience: 'md' },
  { file: 'payroll', path: '/payroll', audience: 'md' },
  { file: 'payroll/settings', path: '/payroll/settings', audience: 'md' },
  { file: 'policies', path: '/policies', audience: 'all' },
  { file: 'records/[kind]/[id]/history', path: `/records/fact/${MISSING_UUID}/history`, audience: 'all' },
  { file: 'reports', path: '/reports', audience: 'all' },
  { file: 'sales', path: '/sales', audience: 'all' },
  { file: 'settings', path: '/settings', audience: 'all' },
  { file: 'suggestions', path: '/suggestions', audience: 'all' },
  { file: 'task-tools', path: '/task-tools', audience: 'all' },
  { file: 'task-tools/participants', path: '/task-tools/participants', audience: 'manager' },
  { file: 'tasks/[taskTag]/checklist/[nodeId]', path: `/tasks/${MISSING_TAG}/checklist/${MISSING_UUID}`, audience: 'all' },
  { file: 'tasks/[taskTag]/checklist/manage', path: `/tasks/${MISSING_TAG}/checklist/manage`, audience: 'all' },
  { file: 'tasks/[taskTag]/checklist', path: `/tasks/${MISSING_TAG}/checklist`, audience: 'all' },
  { file: 'tasks/[taskTag]/checklist/work', path: `/tasks/${MISSING_TAG}/checklist/work`, audience: 'all' },
  { file: 'tasks/[taskTag]', path: `/tasks/${MISSING_TAG}`, audience: 'all' },
  { file: 'tasks', path: '/tasks', audience: 'all' },
  { file: 'tasks/setup', path: '/tasks/setup', audience: 'manager' },
  { file: 'team/[employeeId]', path: '/team/QA_NO_SUCH_EMPLOYEE', audience: 'all' },
  { file: 'team/[employeeId]/personal', path: '/team/QA_NO_SUCH_EMPLOYEE/personal', audience: 'all' },
  { file: 'team/[employeeId]/reports', path: '/team/QA_NO_SUCH_EMPLOYEE/reports', audience: 'all' },
  { file: 'team/activity', path: '/team/activity', audience: 'all' },
  { file: 'team/manage', path: '/team/manage', audience: 'md' },
  { file: 'team', path: '/team', audience: 'all' },
  { file: 'timelines', path: '/timelines', audience: 'all' },
  { file: 'today', path: '/today', audience: 'all' },
];
