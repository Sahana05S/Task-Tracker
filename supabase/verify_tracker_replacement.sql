-- ===========================================================================
-- TaskPulse — Tracker Replacement Verification
--
-- Paste this into the Supabase SQL Editor after applying migrations 01-09.
-- It is read-only. Every `status` value should be `ok`.
-- ===========================================================================

WITH required_objects(kind, name, resolved_name) AS (
    VALUES
        ('table', 'public.users', to_regclass('public.users')::text),
        ('table', 'public.tasks', to_regclass('public.tasks')::text),
        ('table', 'public.daily_task_logs', to_regclass('public.daily_task_logs')::text),
        ('table', 'public.monthly_performance_snapshots', to_regclass('public.monthly_performance_snapshots')::text),
        ('table', 'public.company_statements', to_regclass('public.company_statements')::text),
        ('table', 'public.company_milestones', to_regclass('public.company_milestones')::text),
        ('table', 'public.task_assignees', to_regclass('public.task_assignees')::text),
        ('table', 'public.task_reviewers', to_regclass('public.task_reviewers')::text),
        ('table', 'public.task_dependencies', to_regclass('public.task_dependencies')::text),
        ('table', 'public.task_detail_sections', to_regclass('public.task_detail_sections')::text),
        ('table', 'public.task_links', to_regclass('public.task_links')::text),
        ('table', 'public.task_checklists', to_regclass('public.task_checklists')::text),
        ('table', 'public.checklist_nodes', to_regclass('public.checklist_nodes')::text),
        ('table', 'public.task_timers', to_regclass('public.task_timers')::text),
        ('table', 'public.attendance_records', to_regclass('public.attendance_records')::text),
        ('table', 'public.daily_star_records', to_regclass('public.daily_star_records')::text),
        ('table', 'public.performance_score_components', to_regclass('public.performance_score_components')::text),
        ('table', 'public.report_snapshots', to_regclass('public.report_snapshots')::text),
        ('type', 'public.task_assignment_role', to_regtype('public.task_assignment_role')::text),
        ('type', 'public.task_reviewer_role', to_regtype('public.task_reviewer_role')::text),
        ('type', 'public.task_timer_status', to_regtype('public.task_timer_status')::text),
        ('function', 'public.handle_new_user()', to_regprocedure('public.handle_new_user()')::text),
        ('function', 'public.decay_task_freshness()', to_regprocedure('public.decay_task_freshness()')::text)
),
required_columns(table_name, column_name) AS (
    VALUES
        ('public.daily_task_logs', 'log_source'),
        ('public.daily_task_logs', 'source_timer_id'),
        ('public.task_checklists', 'sync_progress_to_task'),
        ('public.monthly_performance_snapshots', 'attendance_hours'),
        ('public.monthly_performance_snapshots', 'payable_days'),
        ('public.monthly_performance_snapshots', 'absent_days'),
        ('public.monthly_performance_snapshots', 'leave_days')
),
object_checks AS (
    SELECT
        kind,
        name,
        CASE WHEN resolved_name IS NULL THEN 'missing' ELSE 'ok' END AS status
    FROM required_objects
),
column_checks AS (
    SELECT
        'column' AS kind,
        required_columns.table_name || '.' || required_columns.column_name AS name,
        CASE
            WHEN information_schema.columns.column_name IS NULL THEN 'missing'
            ELSE 'ok'
        END AS status
    FROM required_columns
    LEFT JOIN information_schema.columns
        ON information_schema.columns.table_schema = split_part(required_columns.table_name, '.', 1)
       AND information_schema.columns.table_name = split_part(required_columns.table_name, '.', 2)
       AND information_schema.columns.column_name = required_columns.column_name
),
policy_checks AS (
    SELECT
        'policy' AS kind,
        required.policy_name AS name,
        CASE WHEN pg_policies.policyname IS NULL THEN 'missing' ELSE 'ok' END AS status
    FROM (
        VALUES
            ('task_assignees', 'Users can view task assignees'),
            ('task_assignees', 'Leadership can manage task assignees'),
            ('tasks', 'Task assignees can update assigned tasks via join table'),
            ('task_timers', 'Assignees can insert their own timers'),
            ('attendance_records', 'Users can insert their own attendance'),
            ('report_snapshots', 'Leadership can manage report snapshots')
    ) AS required(table_name, policy_name)
    LEFT JOIN pg_policies
        ON pg_policies.schemaname = 'public'
       AND pg_policies.tablename = required.table_name
       AND pg_policies.policyname = required.policy_name
)
SELECT * FROM object_checks
UNION ALL
SELECT * FROM column_checks
UNION ALL
SELECT * FROM policy_checks
ORDER BY status DESC, kind, name;
