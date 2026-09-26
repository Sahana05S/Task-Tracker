-- ===========================================================================
-- TaskPulse — Initial Schema Migration
--
-- Engine: PostgreSQL (Supabase)
-- Source specs: steering/database-schema.md
--                steering/Table Definitions.sql
--                steering/Supabase RLS Policies.sql
--
-- Run order matters: enums -> tables -> indexes -> triggers -> helper
-- function -> RLS enablement -> policies.
--
-- Apply with `supabase db push`, or paste the whole file into the Supabase
-- SQL Editor and run it once.
-- ===========================================================================


-- ===========================================================================
-- SECTION 1 — CUSTOM TYPES & ENUMS
-- ===========================================================================

CREATE TYPE public.user_role AS ENUM (
    'managing_director',
    'project_engineer',
    'data_manager',
    'team_member'
);

CREATE TYPE public.task_category AS ENUM (
    'SD',  -- Skill Development
    'WK',  -- Work Organizing
    'T',   -- General Task
    'PJT', -- Project / Core Task
    'RSC', -- Research & Analysis
    'QAC', -- Quality & Testing
    'MKT', -- Marketing & Outreach
    'ACC', -- Accounting & Finance
    'ITH', -- InfoTech & Systems
    'OFM', -- Office / Facilities Management
    'MG',  -- Management & Strategy
    'AD',  -- Admin & Operations
    'OT'   -- Other / Off-Hours
);

CREATE TYPE public.task_priority AS ENUM ('Low', 'Medium', 'High', 'Focus', 'No');

CREATE TYPE public.task_status AS ENUM ('Not Started', 'In Progress', 'Discarded', 'Done');

CREATE TYPE public.task_freshness AS ENUM ('Fresh', 'Stale', 'Rotten');


-- ===========================================================================
-- SECTION 2 — TABLES
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- USERS / PROFILES
-- Mirrors auth.users. `id` is both the primary key and the FK to Supabase Auth,
-- which lets RLS policies compare directly against auth.uid().
-- ---------------------------------------------------------------------------
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_id VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    role public.user_role NOT NULL DEFAULT 'team_member',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- TASKS
-- ---------------------------------------------------------------------------
CREATE TABLE public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_tag VARCHAR(30) UNIQUE NOT NULL, -- e.g., "Sep26_T5"
    title VARCHAR(255) NOT NULL,
    category public.task_category NOT NULL DEFAULT 'T',
    description TEXT,
    comments TEXT,

    -- Ownership & Review
    -- RESTRICT on assignee: a user with live tasks cannot be deleted until
    -- their work is reassigned, which protects historical metrics.
    assignee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    reviewer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,

    -- Metrics & Progress
    task_scale NUMERIC(10, 2) DEFAULT 0.00,
    progress_percentage NUMERIC(5, 2) DEFAULT 0.00 CHECK (progress_percentage BETWEEN 0 AND 100),

    -- Generated stored column: Scaled Progress = Task Scale x (Progress % / 100)
    -- Maintained by PostgreSQL; INSERT/UPDATE against this column is rejected.
    scaled_progress NUMERIC(10, 2) GENERATED ALWAYS AS (task_scale * (progress_percentage / 100.0)) STORED,

    task_productivity NUMERIC(10, 2) DEFAULT 0.00,

    -- Status & Freshness
    priority public.task_priority NOT NULL DEFAULT 'Medium',
    status public.task_status NOT NULL DEFAULT 'Not Started',
    freshness public.task_freshness NOT NULL DEFAULT 'Fresh',
    -- True only when hours logged > 0 AND task scale > 0. Excludes placeholder
    -- and off-hours entries from team median calculations.
    valid_for_metrics BOOLEAN NOT NULL DEFAULT true,

    -- Dates & Milestones
    assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    completed_date DATE,
    met_deadline BOOLEAN,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- DAILY TASK EFFORT LOGS
-- ---------------------------------------------------------------------------
CREATE TABLE public.daily_task_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    hours_worked NUMERIC(5, 2) NOT NULL CHECK (hours_worked >= 0),
    progress_delta NUMERIC(5, 2) DEFAULT 0.00,
    update_notes TEXT,
    raw_links TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- MONTHLY PERFORMANCE SNAPSHOTS (Medians & Differentials)
-- One precomputed row per user per month.
-- ---------------------------------------------------------------------------
CREATE TABLE public.monthly_performance_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    snapshot_month INT NOT NULL CHECK (snapshot_month BETWEEN 1 AND 12),
    snapshot_year INT NOT NULL CHECK (snapshot_year >= 2026),

    total_logged_hours NUMERIC(10, 2) DEFAULT 0.00,
    total_progress NUMERIC(10, 2) DEFAULT 0.00,
    productivity_score NUMERIC(10, 2) DEFAULT 0.00,
    loading_percentage_diff NUMERIC(5, 2) DEFAULT 0.00,
    criticality_score NUMERIC(5, 2) DEFAULT 0.00,
    freshness_score NUMERIC(5, 2) DEFAULT 0.00,
    is_star_performer BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, snapshot_month, snapshot_year)
);


-- ===========================================================================
-- SECTION 3 — INDEXES FOR FAST QUERYING & GRID RENDERING
-- ===========================================================================

CREATE INDEX idx_tasks_assignee ON public.tasks(assignee_id);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_freshness ON public.tasks(freshness);
CREATE INDEX idx_daily_logs_user_date ON public.daily_task_logs(user_id, log_date);
CREATE INDEX idx_daily_logs_task ON public.daily_task_logs(task_id);


-- ===========================================================================
-- SECTION 4 — updated_at MAINTENANCE
--
-- NOTE: This section is an addition beyond the source specs. The `updated_at`
-- columns default to NOW() on INSERT but nothing advances them on UPDATE, so
-- without this trigger they would silently report the creation time forever.
-- Freshness calculations depend on accurate update timestamps. Drop this
-- section if you prefer to set `updated_at` from the application layer.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_set_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_tasks_set_updated_at
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ===========================================================================
-- SECTION 5 — RLS HELPER FUNCTION
--
-- SECURITY DEFINER is required: the function reads public.users, which is
-- itself RLS-protected. Running it as the definer bypasses those policies and
-- avoids infinite policy recursion.
--
-- `SET search_path = ''` pins resolution so the function cannot be hijacked by
-- a caller-controlled search_path; every object below is fully qualified.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT role FROM public.users WHERE id = auth.uid();
$$;


-- ===========================================================================
-- SECTION 6 — ENABLE ROW LEVEL SECURITY
--
-- With RLS enabled and no matching policy, access is denied by default.
-- ===========================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_task_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_performance_snapshots ENABLE ROW LEVEL SECURITY;


-- ===========================================================================
-- SECTION 7 — RLS POLICIES
--
-- Policies are PERMISSIVE, so a row is allowed when ANY policy for that
-- command grants it. Write-capable policies below spell out WITH CHECK
-- explicitly. PostgreSQL would infer the same expression from USING, but
-- stating it keeps the write boundary readable.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- USERS
-- ---------------------------------------------------------------------------

-- All authenticated users can view member profiles.
CREATE POLICY "Users can view all member profiles"
ON public.users FOR SELECT
TO authenticated
USING (true);

-- Only Managing Directors can insert, update, or delete profiles.
CREATE POLICY "Managing Directors can manage profiles"
ON public.users FOR ALL
TO authenticated
USING (public.get_user_role() = 'managing_director')
WITH CHECK (public.get_user_role() = 'managing_director');

-- ---------------------------------------------------------------------------
-- TASKS
-- ---------------------------------------------------------------------------

-- All authenticated users can view tasks.
CREATE POLICY "Users can view all tasks"
ON public.tasks FOR SELECT
TO authenticated
USING (true);

-- Managing Directors & Project Engineers can create/update/delete any task.
CREATE POLICY "Managers can create and edit tasks"
ON public.tasks FOR ALL
TO authenticated
USING (public.get_user_role() IN ('managing_director', 'project_engineer'))
WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer'));

-- Assignees can update progress and status on their own tasks. WITH CHECK
-- repeats the predicate so an assignee cannot hand a task to someone else.
CREATE POLICY "Assignees can update their assigned tasks"
ON public.tasks FOR UPDATE
TO authenticated
USING (assignee_id = auth.uid())
WITH CHECK (assignee_id = auth.uid());

-- ---------------------------------------------------------------------------
-- DAILY TASK LOGS
-- ---------------------------------------------------------------------------

-- All users can view task logs (team transparency).
CREATE POLICY "Users can view all daily logs"
ON public.daily_task_logs FOR SELECT
TO authenticated
USING (true);

-- Users can create logs for themselves only.
CREATE POLICY "Users can insert their own logs"
ON public.daily_task_logs FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can edit their own logs, and cannot reassign one to another user.
CREATE POLICY "Users can edit their own logs"
ON public.daily_task_logs FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Managing Directors can manage all logs.
CREATE POLICY "Directors can manage all logs"
ON public.daily_task_logs FOR ALL
TO authenticated
USING (public.get_user_role() = 'managing_director')
WITH CHECK (public.get_user_role() = 'managing_director');

-- ---------------------------------------------------------------------------
-- MONTHLY PERFORMANCE SNAPSHOTS
-- ---------------------------------------------------------------------------

-- All users can view performance snapshots.
CREATE POLICY "Users can view performance snapshots"
ON public.monthly_performance_snapshots FOR SELECT
TO authenticated
USING (true);

-- Only Managing Directors can compute/write performance snapshots.
CREATE POLICY "Directors can write performance snapshots"
ON public.monthly_performance_snapshots FOR ALL
TO authenticated
USING (public.get_user_role() = 'managing_director')
WITH CHECK (public.get_user_role() = 'managing_director');


-- ===========================================================================
-- KNOWN GAPS CARRIED OVER FROM THE SPEC — resolve in Phase 2 (Auth)
--
-- 1. No INSERT path for the first user. Only a managing_director can insert
--    into public.users, so a brand-new project has nobody who can create the
--    first profile. Either seed one row with the service_role key, or add a
--    SECURITY DEFINER trigger on auth.users that provisions public.users on
--    signup. Left out here because it changes the auth model.
--
-- 2. No DELETE policy for a user's own daily logs. The spec's comment says
--    "edit or delete", but only a FOR UPDATE policy was defined, so non-director
--    deletes are denied. Add a FOR DELETE policy on public.daily_task_logs
--    USING (user_id = auth.uid()) if self-service deletion is intended.
--
-- 3. valid_for_metrics is a plain column with no enforcement. The rule
--    "hours logged > 0 AND task scale > 0" is not expressible as a row-level
--    CHECK because hours live in daily_task_logs. Enforce it in the Phase 4
--    recalculation logic.
-- ===========================================================================
