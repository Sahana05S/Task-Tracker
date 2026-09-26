-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_task_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_performance_snapshots ENABLE ROW LEVEL SECURITY;

-- helper function to check role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$SELECT role FROM users WHERE id = auth.uid();$$ LANGUAGE sql SECURITY DEFINER;

----------------------------------------------------
-- USERS POLICIES
----------------------------------------------------
-- All authenticated users can view member profiles
CREATE POLICY "Users can view all member profiles"
ON users FOR SELECT
TO authenticated
USING (true);

-- Only Managing Directors can insert/update profiles
CREATE POLICY "Managing Directors can manage profiles"
ON users FOR ALL
TO authenticated
USING (get_user_role() = 'managing_director');

----------------------------------------------------
-- TASKS POLICIES
----------------------------------------------------
-- All authenticated users can view tasks
CREATE POLICY "Users can view all tasks"
ON tasks FOR SELECT
TO authenticated
USING (true);

-- Managing Directors & Project Engineers can create/update any task
CREATE POLICY "Managers can create and edit tasks"
ON tasks FOR ALL
TO authenticated
USING (get_user_role() IN ('managing_director', 'project_engineer'));

-- Assignees can update progress and status of their own tasks
CREATE POLICY "Assignees can update their assigned tasks"
ON tasks FOR UPDATE
TO authenticated
USING (assignee_id = auth.uid())
WITH CHECK (assignee_id = auth.uid());

----------------------------------------------------
-- DAILY TASK LOGS POLICIES
----------------------------------------------------
-- All users can view task logs (for team transparency)
CREATE POLICY "Users can view all daily logs"
ON daily_task_logs FOR SELECT
TO authenticated
USING (true);

-- Team members can create logs for themselves
CREATE POLICY "Users can insert their own logs"
ON daily_task_logs FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can edit or delete their own logs
CREATE POLICY "Users can edit their own logs"
ON daily_task_logs FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

-- Managing Directors can manage all logs
CREATE POLICY "Directors can manage all logs"
ON daily_task_logs FOR ALL
TO authenticated
USING (get_user_role() = 'managing_director');

----------------------------------------------------
-- MONTHLY PERFORMANCE SNAPSHOTS POLICIES
----------------------------------------------------
-- All users can view performance snapshots
CREATE POLICY "Users can view performance snapshots"
ON monthly_performance_snapshots FOR SELECT
TO authenticated
USING (true);

-- Only Managing Directors can compute/insert performance snapshots
CREATE POLICY "Directors can write performance snapshots"
ON monthly_performance_snapshots FOR ALL
TO authenticated
USING (get_user_role() = 'managing_director');