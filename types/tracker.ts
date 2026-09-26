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
  /** `is_star_performer` — winner of the composite monthly score. */
  isStarPerformer: boolean | null;

  /** `created_at` — ISO 8601 timestamp. */
  createdAt: string;
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
