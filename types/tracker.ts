/**
 * TaskPulse — Domain Model Type Definitions
 *
 * Single source of truth for all domain models. Every property maps 1:1 to a
 * column in `supabase/migrations/01_init_schema.sql`, converted from snake_case
 * to camelCase.
 *
 * Nullability mirrors the DDL exactly: a column declared without NOT NULL is
 * typed as `| null`, even when it carries a DEFAULT. Defaults only apply on
 * INSERT when the column is omitted, so the database can still return NULL.
 *
 * NUMERIC columns are represented as `number`. The Supabase client parses
 * PostgreSQL NUMERIC into a JS number, which is safe here because every
 * NUMERIC in this schema has precision <= 10 and scale <= 2.
 *
 * DATE columns are ISO date strings (`YYYY-MM-DD`).
 * TIMESTAMPTZ columns are ISO 8601 timestamp strings.
 */

/* -------------------------------------------------------------------------- */
/* Enumerated types (mirror the PostgreSQL ENUMs)                             */
/* -------------------------------------------------------------------------- */

/** PostgreSQL ENUM `user_role`. */
export type UserRole =
  | 'managing_director'
  | 'project_engineer'
  | 'data_manager'
  | 'team_member';

/**
 * PostgreSQL ENUM `task_category`.
 *
 * SD  Skill Development          WK   Work Organizing
 * T   General Task               PJT  Project / Core Task
 * RSC Research & Analysis        QAC  Quality & Testing
 * MKT Marketing & Outreach       ACC  Accounting & Finance
 * ITH InfoTech & Systems         OFM  Office / Facilities Management
 * MG  Management & Strategy      AD   Admin & Operations
 * OT  Other / Off-Hours
 */
export type TaskCategory =
  | 'SD'
  | 'WK'
  | 'T'
  | 'PJT'
  | 'RSC'
  | 'QAC'
  | 'MKT'
  | 'ACC'
  | 'ITH'
  | 'OFM'
  | 'MG'
  | 'AD'
  | 'OT';

/** PostgreSQL ENUM `task_priority`. Declaration order matches the migration. */
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Focus' | 'No';

/** PostgreSQL ENUM `task_status`. Declaration order matches the migration. */
export type TaskStatus = 'Not Started' | 'In Progress' | 'Discarded' | 'Done';

/**
 * PostgreSQL ENUM `task_freshness`.
 *
 * Fresh  updated within the last 7 days, or actively logged
 * Stale  no activity for 7–14 days
 * Rotten inactive for over 14 days without reaching completion
 */
export type TaskFreshness = 'Fresh' | 'Stale' | 'Rotten';

/**
 * PostgreSQL ENUM `milestone_status`, from `04_milestones_and_vision.sql`.
 *
 * Deliberately separate from `TaskStatus`. A milestone is an organisational
 * outcome, not a unit of assigned work: it has no `Discarded` state, because a
 * goal that is dropped is deleted rather than archived against a member's record.
 */
export type MilestoneStatus = 'Planned' | 'In Progress' | 'Achieved';

/** PostgreSQL ENUM `task_assignment_role`. */
export type TaskAssignmentRole = 'Owner' | 'Collaborator' | 'Support';

/** PostgreSQL ENUM `task_reviewer_role`. */
export type TaskReviewerRole = 'Primary' | 'Secondary' | 'Observer';

/** PostgreSQL ENUM `task_relation_type`. */
export type TaskRelationType =
  | 'Dependency'
  | 'Support'
  | 'Carryover'
  | 'Subtask'
  | 'Blocks'
  | 'Related';

/** PostgreSQL ENUM `task_link_type`. */
export type TaskLinkType =
  | 'Folder'
  | 'Document'
  | 'Account'
  | 'Flowchart'
  | 'Engineering'
  | 'Drawing'
  | 'Checklist'
  | 'Raw Link'
  | 'Other';

/** PostgreSQL ENUM `checklist_node_type`. */
export type ChecklistNodeType = 'Page' | 'Group' | 'Item' | 'Task';

/** PostgreSQL ENUM `task_timer_status`. */
export type TaskTimerStatus = 'Running' | 'Stopped' | 'Discarded';

/** PostgreSQL ENUM `task_log_source`. */
export type TaskLogSource = 'Manual' | 'Timer' | 'Imported';

/** PostgreSQL ENUM `attendance_status`. */
export type AttendanceStatus =
  | 'Present'
  | 'Absent'
  | 'Half Day'
  | 'Holiday'
  | 'Leave'
  | 'Off Hours';

/** PostgreSQL ENUM `report_status`. */
export type ReportStatus = 'Draft' | 'Final';

/* -------------------------------------------------------------------------- */
/* Table row models                                                           */
/* -------------------------------------------------------------------------- */

/** Row of `public.users`. `id` is a foreign key to `auth.users.id`. */
export interface User {
  /** UUID, shared with the corresponding `auth.users` record. */
  id: string;
  /** `employee_id` — unique human-readable staff identifier. */
  employeeId: string;
  /** `full_name` */
  fullName: string;
  /** `email` — unique. */
  email: string;
  /** `role` — defaults to `'team_member'`. */
  role: UserRole;
  /** `is_active` — soft-deactivation flag; inactive users are excluded from team medians. */
  isActive: boolean;
  /** `created_at` — ISO 8601 timestamp. */
  createdAt: string;
  /** `updated_at` — ISO 8601 timestamp. */
  updatedAt: string;
}

/** Row of `public.tasks`. */
export interface Task {
  /** UUID primary key. */
  id: string;
  /** `task_tag` — unique sheet-style identifier, e.g. `"Sep26_T5"`. */
  taskTag: string;
  /** `title` */
  title: string;
  /** `category` — defaults to `'T'`. */
  category: TaskCategory;
  /** `description` — nullable. */
  description: string | null;
  /** `comments` — nullable free-text review notes. */
  comments: string | null;

  /** `assignee_id` — FK to `users.id`, ON DELETE RESTRICT. */
  assigneeId: string;
  /** `reviewer_id` — FK to `users.id`, ON DELETE SET NULL. */
  reviewerId: string | null;
  /** Multi-assignee user IDs from `task_assignees`, with `assigneeId` as fallback. */
  assigneeIds: string[];
  /** Multi-reviewer user IDs from `task_reviewers`, with `reviewerId` as fallback. */
  reviewerIds: string[];

  /** `task_scale` — assigned work weight. */
  taskScale: number | null;
  /** `progress_percentage` — constrained to the inclusive range 0–100. */
  progressPercentage: number | null;
  /**
   * `scaled_progress` — GENERATED ALWAYS AS
   * `task_scale * (progress_percentage / 100.0)` STORED.
   *
   * Read-only: PostgreSQL rejects any INSERT or UPDATE that targets it.
   * Resolves to NULL when either operand is NULL.
   */
  readonly scaledProgress: number | null;
  /** `task_productivity` — scaled progress per logged hour. */
  taskProductivity: number | null;

  /** `priority` — defaults to `'Medium'`. */
  priority: TaskPriority;
  /** `status` — defaults to `'Not Started'`. */
  status: TaskStatus;
  /** `freshness` — defaults to `'Fresh'`. */
  freshness: TaskFreshness;
  /**
   * `valid_for_metrics` — true only when hours logged > 0 and task scale > 0.
   * Tasks flagged false are excluded from team median calculations.
   */
  validForMetrics: boolean;

  /** `assigned_date` — ISO date (`YYYY-MM-DD`). */
  assignedDate: string;
  /** `due_date` — ISO date, nullable. */
  dueDate: string | null;
  /** `completed_date` — ISO date, nullable until the task reaches `'Done'`. */
  completedDate: string | null;
  /** `met_deadline` — nullable tri-state: unknown until the task is completed. */
  metDeadline: boolean | null;

  /** `created_at` — ISO 8601 timestamp. */
  createdAt: string;
  /** `updated_at` — ISO 8601 timestamp. */
  updatedAt: string;
}

/** Row of `public.daily_task_logs` — one effort entry against one task. */
export interface DailyTaskLog {
  /** UUID primary key. */
  id: string;
  /** `task_id` — FK to `tasks.id`, ON DELETE CASCADE. */
  taskId: string;
  /** `user_id` — FK to `users.id`, ON DELETE CASCADE. */
  userId: string;
  /** `log_date` — ISO date (`YYYY-MM-DD`). */
  logDate: string;
  /** `hours_worked` — constrained to >= 0. */
  hoursWorked: number;
  /** `progress_delta` — incremental percentage points added by this log. */
  progressDelta: number | null;
  /** `update_notes` — nullable. */
  updateNotes: string | null;
  /** `raw_links` — TEXT[] of asset URLs (documents, drawings, boards). */
  rawLinks: string[] | null;
  /** `log_source` — whether this came from manual entry, a timer, or import. */
  logSource: TaskLogSource;
  /** `source_timer_id` — timer session that produced this log, when applicable. */
  sourceTimerId: string | null;
  /** `created_at` — ISO 8601 timestamp. */
  createdAt: string;
}

/**
 * Row of `public.monthly_performance_snapshots` — one precomputed performance
 * record per user per month. Unique on (userId, snapshotMonth, snapshotYear).
 */
export interface MonthlyPerformanceSnapshot {
  /** UUID primary key. */
  id: string;
  /** `user_id` — FK to `users.id`, ON DELETE CASCADE. */
  userId: string;
  /** `snapshot_month` — integer 1–12. */
  snapshotMonth: number;
  /** `snapshot_year` — integer >= 2026. */
  snapshotYear: number;

  /** `total_logged_hours` — sum of `hours_worked` across the month. */
  totalLoggedHours: number | null;
  /** `total_progress` — sum of `scaled_progress` across metric-valid tasks. */
  totalProgress: number | null;
  /** `productivity_score` — total progress divided by total logged hours. */
  productivityScore: number | null;
  /** `loading_percentage_diff` — task allocation % minus the team median. */
  loadingPercentageDiff: number | null;
  /** `criticality_score` — average priority weight of assigned tasks. */
  criticalityScore: number | null;
  /** `freshness_score` — composite freshness rating for the month. */
  freshnessScore: number | null;
  attendanceHours: number | null;
  payableDays: number | null;
  absentDays: number | null;
  leaveDays: number | null;
  /** `is_star_performer` — winner of the composite monthly score. */
  isStarPerformer: boolean | null;

  /** `created_at` — ISO 8601 timestamp. */
  createdAt: string;
}

/**
 * Row of `public.company_statements` — one editable block on the milestones
 * showcase.
 */
export interface CompanyStatement {
  /** UUID primary key. */
  id: string;
  /**
   * `key_name` — stable lookup handle, unique. `'vision'`, `'mission'` and
   * `'core_values'` are the three the showcase renders; see
   * `lib/milestones/statements.ts`.
   */
  keyName: string;
  /** `title` — the heading shown on the card. */
  title: string;
  /**
   * `statement` — the headline text.
   *
   * For `core_values` this carries one value per line in `Name: description`
   * form, parsed by `parseCoreValues`.
   */
  statement: string;
  /** `subtext` — supporting elaboration, nullable. */
  subtext: string | null;
  /** `updated_at` — ISO 8601 timestamp, maintained by a trigger. */
  updatedAt: string;
  /** `updated_by` — FK to `users.id`, ON DELETE SET NULL. */
  updatedBy: string | null;
}

/** Row of `public.company_milestones` — one monthly organisational goal. */
export interface CompanyMilestone {
  /** UUID primary key. */
  id: string;
  /** `title` */
  title: string;
  /** `description` — nullable. */
  description: string | null;
  /** `status` — defaults to `'Planned'`. */
  status: MilestoneStatus;
  /**
   * `owner_id` — FK to `users.id`, ON DELETE SET NULL.
   *
   * Null means the milestone is carried by the team rather than one member. The
   * column cannot name a group, only a member.
   */
  ownerId: string | null;
  /** `delivered_count` — units delivered so far, >= 0. May exceed the target. */
  deliveredCount: number;
  /** `target_count` — units targeted, or null when the goal is not countable. */
  targetCount: number | null;
  /** `due_date` — ISO date (`YYYY-MM-DD`), nullable. */
  dueDate: string | null;
  /** `created_at` — ISO 8601 timestamp. */
  createdAt: string;
}

/** Row of `public.task_assignees` â€” multi-assignee task membership. */
export interface TaskAssignee {
  id: string;
  taskId: string;
  userId: string;
  assignmentRole: TaskAssignmentRole;
  isPrimary: boolean;
  assignedBy: string | null;
  assignedAt: string;
  createdAt: string;
}

/** Row of `public.task_reviewers` â€” multi-reviewer task membership. */
export interface TaskReviewer {
  id: string;
  taskId: string;
  userId: string;
  reviewerRole: TaskReviewerRole;
  isPrimary: boolean;
  assignedBy: string | null;
  reviewDueAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

/** Row of `public.task_dependencies` â€” reusable task/subtask relations. */
export interface TaskDependency {
  id: string;
  predecessorTaskId: string;
  successorTaskId: string;
  relationType: TaskRelationType;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** Row of `public.task_detail_sections` â€” structured task page sections. */
export interface TaskDetailSection {
  id: string;
  taskId: string;
  keyName: string;
  title: string;
  content: string | null;
  updatedBy: string | null;
  updatedAt: string;
  createdAt: string;
}

/** Row of `public.task_links` â€” task folders, documents, drawings and assets. */
export interface TaskLink {
  id: string;
  taskId: string;
  linkType: TaskLinkType;
  label: string;
  url: string | null;
  storagePath: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** Row of `public.checklist_templates`. */
export interface ChecklistTemplate {
  id: string;
  name: string;
  description: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Row of `public.checklist_template_nodes`. */
export interface ChecklistTemplateNode {
  id: string;
  templateId: string;
  parentNodeId: string | null;
  nodeType: ChecklistNodeType;
  title: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
}

/** Row of `public.task_checklists` â€” one master checklist per task. */
export interface TaskChecklist {
  id: string;
  taskId: string;
  templateId: string | null;
  title: string;
  syncProgressToTask: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Row of `public.checklist_nodes` â€” hierarchical equal-weight checklist item. */
export interface ChecklistNode {
  id: string;
  checklistId: string;
  parentNodeId: string | null;
  linkedTaskId: string | null;
  nodeType: ChecklistNodeType;
  title: string;
  description: string | null;
  isComplete: boolean;
  sortOrder: number;
  estimatedMinutes: number | null;
  elapsedSeconds: number;
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Row of `public.task_timers` â€” server-backed task timer sessions. */
export interface TaskTimer {
  id: string;
  taskId: string;
  userId: string;
  status: TaskTimerStatus;
  startedAt: string;
  stoppedAt: string | null;
  elapsedSeconds: number;
  generatedLogId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Row of `public.attendance_records`. */
export interface AttendanceRecord {
  id: string;
  userId: string;
  attendanceDate: string;
  status: AttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  attendanceHours: number;
  offHours: number;
  holidayName: string | null;
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Row of `public.daily_star_records`. */
export interface DailyStarRecord {
  id: string;
  starDate: string;
  userId: string;
  score: number;
  productivityComponent: number;
  progressComponent: number;
  checklistComponent: number;
  freshnessComponent: number;
  attendanceComponent: number;
  reason: string | null;
  isOverride: boolean;
  overrideBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Row of `public.performance_score_components`. */
export interface PerformanceScoreComponent {
  id: string;
  userId: string;
  scoreDate: string;
  metricKey: string;
  metricValue: number;
  sourceTable: string | null;
  sourceId: string | null;
  createdAt: string;
}

/** Row of `public.meeting_points`. */
export interface MeetingPoint {
  id: string;
  meetingDate: string;
  meetingType: string | null;
  postedBy: string | null;
  point: string;
  folderUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Row of `public.daily_facts`. */
export interface DailyFact {
  id: string;
  factDate: string;
  postedBy: string | null;
  fact: string;
  folderUrl: string | null;
  isValidated: boolean;
  validatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Row of `public.ideas`. */
export interface Idea {
  id: string;
  ideaDate: string;
  postedBy: string | null;
  idea: string;
  folderUrl: string | null;
  isValidated: boolean;
  validatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Row of `public.suggestions`. */
export interface Suggestion {
  id: string;
  suggestionDate: string;
  postedBy: string | null;
  suggestion: string;
  folderUrl: string | null;
  isValidated: boolean;
  validatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Row of `public.sales_logs`. */
export interface SalesLog {
  id: string;
  saleDate: string;
  salesBy: string | null;
  projectBuiltUpArea: string | null;
  projectLocation: string | null;
  clientName: string | null;
  projectFolderUrl: string | null;
  isNewProject: boolean;
  basementPaymentReceived: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Row of `public.report_snapshots`. */
export interface ReportSnapshot {
  id: string;
  reportType: string;
  title: string;
  status: ReportStatus;
  periodStart: string | null;
  periodEnd: string | null;
  employeeId: string | null;
  payload: unknown;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Server Action contract                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Standardized envelope returned by every Next.js Server Action.
 * Mandated by `steering/tech-stack.md`.
 */
export type ActionResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};
