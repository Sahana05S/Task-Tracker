import type {
  AttendanceStatus,
  ChecklistNodeType,
  MilestoneStatus,
  TaskCategory,
  TaskFreshness,
  TaskPriority,
  TaskStatus,
  UserRole,
} from '@/types/tracker';

/**
 * Runtime companions to the union types in `@/types/tracker`.
 *
 * The unions alone are compile-time only. Select menus need something to
 * iterate, and Server Actions need something to validate untrusted `FormData`
 * against, so each union gets a frozen tuple plus a type guard here.
 *
 * Every tuple is `satisfies readonly Enum[]` and every label map is
 * `satisfies Record<Enum, string>`, so adding a member to a union in
 * `types/tracker.ts` without updating this file is a compile error rather than
 * an option silently missing from a dropdown.
 *
 * Tuple order is display order, taken from `domain-rules.md`, which is not
 * always the database declaration order: priorities read Focus first here
 * because that is how the sheet presents them.
 */

/* -------------------------------------------------------------------------- */
/* Roles                                                                      */
/* -------------------------------------------------------------------------- */

export const USER_ROLES = [
  'managing_director',
  'project_engineer',
  'data_manager',
  'team_member',
] as const satisfies readonly UserRole[];

export const ROLE_LABELS = {
  managing_director: 'Managing Director',
  project_engineer: 'Project Engineer',
  data_manager: 'Data Manager',
  team_member: 'Team Member',
} satisfies Record<UserRole, string>;

/** Roles permitted to create, fully edit, or delete any task. */
export const TASK_MANAGER_ROLES = [
  'managing_director',
  'project_engineer',
] as const satisfies readonly UserRole[];

/**
 * Roles permitted to edit the organisational statements and milestones.
 *
 * The same two roles as `TASK_MANAGER_ROLES` today, declared separately rather
 * than aliased: "may reassign a task" and "may rewrite the company vision" are
 * different rights that happen to be held by the same people, and collapsing them
 * would make widening one silently widen the other. Mirrors the
 * `Leadership can manage …` policies in `04_milestones_and_vision.sql`.
 */
export const MILESTONE_MANAGER_ROLES = [
  'managing_director',
  'project_engineer',
] as const satisfies readonly UserRole[];

/** Whether a role may edit statements and milestones. */
export function canManageMilestones(role: UserRole): boolean {
  return (MILESTONE_MANAGER_ROLES as readonly UserRole[]).includes(role);
}

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

/* -------------------------------------------------------------------------- */
/* Categories                                                                 */
/* -------------------------------------------------------------------------- */

export const TASK_CATEGORIES = [
  'SD',
  'WK',
  'T',
  'PJT',
  'RSC',
  'QAC',
  'MKT',
  'ACC',
  'ITH',
  'OFM',
  'MG',
  'AD',
  'OT',
] as const satisfies readonly TaskCategory[];

/** Long-form names, transcribed from `domain-rules.md`. */
export const CATEGORY_LABELS = {
  SD: 'Skill Development',
  WK: 'Work Organizing',
  T: 'General Task',
  PJT: 'Project / Core Task',
  RSC: 'Research & Analysis',
  QAC: 'Quality & Testing',
  MKT: 'Marketing & Outreach',
  ACC: 'Accounting & Finance',
  ITH: 'InfoTech & Systems',
  OFM: 'Office / Facilities Management',
  MG: 'Management & Strategy',
  AD: 'Admin & Operations',
  OT: 'Other / Off-Hours',
} satisfies Record<TaskCategory, string>;

export function isTaskCategory(value: string): value is TaskCategory {
  return (TASK_CATEGORIES as readonly string[]).includes(value);
}

/* -------------------------------------------------------------------------- */
/* Priorities                                                                 */
/* -------------------------------------------------------------------------- */

export const TASK_PRIORITIES = [
  'Focus',
  'High',
  'Medium',
  'Low',
  'No',
] as const satisfies readonly TaskPriority[];

/**
 * Numeric weights from `domain-rules.md`, used for the criticality score in
 * Phase 5 and, here, to sort the priority column by severity instead of
 * alphabetically.
 */
export const PRIORITY_WEIGHTS = {
  Focus: 4,
  High: 3,
  Medium: 2,
  Low: 1,
  No: 0,
} satisfies Record<TaskPriority, number>;

export function isTaskPriority(value: string): value is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(value);
}

/* -------------------------------------------------------------------------- */
/* Statuses                                                                   */
/* -------------------------------------------------------------------------- */

export const TASK_STATUSES = [
  'Not Started',
  'In Progress',
  'Done',
  'Discarded',
] as const satisfies readonly TaskStatus[];

/** Pipeline order for sorting, rather than the alphabetical default. */
export const STATUS_ORDER = {
  'Not Started': 0,
  'In Progress': 1,
  Done: 2,
  Discarded: 3,
} satisfies Record<TaskStatus, number>;

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

/* -------------------------------------------------------------------------- */
/* Freshness                                                                  */
/* -------------------------------------------------------------------------- */

export const TASK_FRESHNESS_STATES = [
  'Fresh',
  'Stale',
  'Rotten',
] as const satisfies readonly TaskFreshness[];

/** Decay order, so sorting surfaces rotten work first when descending. */
export const FRESHNESS_ORDER = {
  Fresh: 0,
  Stale: 1,
  Rotten: 2,
} satisfies Record<TaskFreshness, number>;

/** Day thresholds from `domain-rules.md`, kept next to the states they define. */
export const FRESHNESS_THRESHOLD_DAYS = {
  /** Updated within this many days counts as Fresh. */
  stale: 7,
  /** Beyond this many days without completion counts as Rotten. */
  rotten: 14,
} as const;

/**
 * Classifies a task's freshness from its `updated_at` timestamp and status.
 *
 * Mirrors the CASE expression in `supabase/migrations/05_freshness_decay.sql`
 * exactly, so application code and tests produce the same result as the
 * scheduled decay job without a database round-trip.
 *
 * Done and Discarded tasks are not decayed — a completed task that has not
 * been touched in 30 days is finished, not rotten. Pass the task's status so
 * the function can skip the calculation for terminal rows and return the
 * task's current freshness value unchanged.
 *
 * @param updatedAt  The task's `updated_at` ISO 8601 timestamp.
 * @param status     The task's current status.
 * @param now        Override for the current time (useful in tests).
 */
export function computeFreshness(
  updatedAt: string,
  status: import('@/types/tracker').TaskStatus,
  now: Date = new Date(),
): TaskFreshness {
  // Terminal tasks are never decayed; their freshness carries no meaning for
  // the star formula (they are excluded from the relevant eligibility checks).
  if (status === 'Done' || status === 'Discarded') {
    return 'Fresh'; // sentinel — not used in analytics for terminal tasks
  }

  const ageMs = now.getTime() - new Date(updatedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays <= FRESHNESS_THRESHOLD_DAYS.stale) return 'Fresh';
  if (ageDays <= FRESHNESS_THRESHOLD_DAYS.rotten) return 'Stale';
  return 'Rotten';
}

export function isTaskFreshness(value: string): value is TaskFreshness {
  return (TASK_FRESHNESS_STATES as readonly string[]).includes(value);
}

/* -------------------------------------------------------------------------- */
/* Checklist node types                                                       */
/* -------------------------------------------------------------------------- */

export const CHECKLIST_NODE_TYPES = [
  'Page',
  'Group',
  'Item',
  'Task',
] as const satisfies readonly ChecklistNodeType[];

export const CHECKLIST_NODE_TYPE_LABELS = {
  Page: 'Page',
  Group: 'Group',
  Item: 'Item',
  Task: 'Linked task',
} satisfies Record<ChecklistNodeType, string>;

export function isChecklistNodeType(
  value: string,
): value is ChecklistNodeType {
  return (CHECKLIST_NODE_TYPES as readonly string[]).includes(value);
}

/* -------------------------------------------------------------------------- */
/* Milestone statuses                                                        */
/* -------------------------------------------------------------------------- */

/** Declaration order matches the `milestone_status` enum, which is also the
 *  delivery order the checklist sorts by. */
export const MILESTONE_STATUSES = [
  'Planned',
  'In Progress',
  'Achieved',
] as const satisfies readonly MilestoneStatus[];

/** Pipeline order for sorting, so in-flight work sits above what is finished. */
export const MILESTONE_STATUS_ORDER = {
  'In Progress': 0,
  Planned: 1,
  Achieved: 2,
} satisfies Record<MilestoneStatus, number>;

export function isMilestoneStatus(value: string): value is MilestoneStatus {
  return (MILESTONE_STATUSES as readonly string[]).includes(value);
}

/* -------------------------------------------------------------------------- */
/* Attendance statuses                                                        */
/* -------------------------------------------------------------------------- */

export const ATTENDANCE_STATUSES = [
  'Present',
  'Absent',
  'Half Day',
  'Holiday',
  'Leave',
  'Off Hours',
] as const satisfies readonly AttendanceStatus[];

export function isAttendanceStatus(
  value: string,
): value is AttendanceStatus {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}
