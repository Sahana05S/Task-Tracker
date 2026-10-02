-- ===========================================================================
-- TaskPulse — Sheet Replacement Database Foundation
--
-- Adds the relational foundation needed to replace the Google Sheet workbook:
-- multi-assignee/reviewer tasks, reusable subtasks, checklist trees, task
-- links/assets, timers, attendance, daily stars, reports, daily facts, ideas,
-- suggestions and sales logs.
--
-- Apply after 01-06. Existing tasks.assignee_id and tasks.reviewer_id remain in
-- place as compatibility projections while the app moves to join tables.
-- ===========================================================================


-- ===========================================================================
-- SECTION 1 — ENUMS
-- ===========================================================================

CREATE TYPE public.task_assignment_role AS ENUM ('Owner', 'Collaborator', 'Support');
CREATE TYPE public.task_reviewer_role AS ENUM ('Primary', 'Secondary', 'Observer');
CREATE TYPE public.task_relation_type AS ENUM ('Dependency', 'Support', 'Carryover', 'Subtask', 'Blocks', 'Related');
CREATE TYPE public.task_link_type AS ENUM ('Folder', 'Document', 'Account', 'Flowchart', 'Engineering', 'Drawing', 'Checklist', 'Raw Link', 'Other');
CREATE TYPE public.checklist_node_type AS ENUM ('Page', 'Group', 'Item', 'Task');
CREATE TYPE public.task_timer_status AS ENUM ('Running', 'Stopped', 'Discarded');
CREATE TYPE public.task_log_source AS ENUM ('Manual', 'Timer', 'Imported');
CREATE TYPE public.attendance_status AS ENUM ('Present', 'Absent', 'Half Day', 'Holiday', 'Leave', 'Off Hours');
CREATE TYPE public.report_status AS ENUM ('Draft', 'Final');


-- ===========================================================================
-- SECTION 2 — TASK OWNERSHIP, REVIEW, RELATIONS & LINKS
-- ===========================================================================

CREATE TABLE public.task_assignees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    assignment_role public.task_assignment_role NOT NULL DEFAULT 'Collaborator',
    is_primary BOOLEAN NOT NULL DEFAULT false,
    assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(task_id, user_id)
);

CREATE TABLE public.task_reviewers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    reviewer_role public.task_reviewer_role NOT NULL DEFAULT 'Secondary',
    is_primary BOOLEAN NOT NULL DEFAULT false,
    assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    review_due_at DATE,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(task_id, user_id)
);

CREATE TABLE public.task_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    predecessor_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    successor_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    relation_type public.task_relation_type NOT NULL DEFAULT 'Dependency',
    notes TEXT,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (predecessor_task_id <> successor_task_id),
    UNIQUE(predecessor_task_id, successor_task_id, relation_type)
);

CREATE TABLE public.task_detail_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    key_name VARCHAR(60) NOT NULL,
    title VARCHAR(120) NOT NULL,
    content TEXT,
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(task_id, key_name)
);

CREATE TABLE public.task_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    link_type public.task_link_type NOT NULL DEFAULT 'Other',
    label VARCHAR(120) NOT NULL,
    url TEXT,
    storage_path TEXT,
    notes TEXT,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (url IS NOT NULL OR storage_path IS NOT NULL)
);


-- ===========================================================================
-- SECTION 3 — CHECKLIST TEMPLATES & TASK CHECKLIST TREES
-- ===========================================================================

CREATE TABLE public.checklist_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) UNIQUE NOT NULL,
    description TEXT,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.checklist_template_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
    parent_node_id UUID REFERENCES public.checklist_template_nodes(id) ON DELETE CASCADE,
    node_type public.checklist_node_type NOT NULL DEFAULT 'Item',
    title VARCHAR(180) NOT NULL,
    description TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (parent_node_id IS NULL OR parent_node_id <> id)
);

CREATE TABLE public.task_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    template_id UUID REFERENCES public.checklist_templates(id) ON DELETE SET NULL,
    title VARCHAR(180) NOT NULL,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(task_id)
);

CREATE TABLE public.checklist_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id UUID NOT NULL REFERENCES public.task_checklists(id) ON DELETE CASCADE,
    parent_node_id UUID REFERENCES public.checklist_nodes(id) ON DELETE CASCADE,
    linked_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    node_type public.checklist_node_type NOT NULL DEFAULT 'Item',
    title VARCHAR(180) NOT NULL,
    description TEXT,
    is_complete BOOLEAN NOT NULL DEFAULT false,
    sort_order INT NOT NULL DEFAULT 0,
    estimated_minutes INT CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
    elapsed_seconds INT NOT NULL DEFAULT 0 CHECK (elapsed_seconds >= 0),
    completed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (parent_node_id IS NULL OR parent_node_id <> id)
);


-- ===========================================================================
-- SECTION 4 — TIMERS, ATTENDANCE & DAILY STARS
-- ===========================================================================

CREATE TABLE public.task_timers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status public.task_timer_status NOT NULL DEFAULT 'Running',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stopped_at TIMESTAMPTZ,
    elapsed_seconds INT NOT NULL DEFAULT 0 CHECK (elapsed_seconds >= 0),
    generated_log_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (stopped_at IS NULL OR stopped_at >= started_at)
);

ALTER TABLE public.daily_task_logs
    ADD COLUMN log_source public.task_log_source NOT NULL DEFAULT 'Manual',
    ADD COLUMN source_timer_id UUID REFERENCES public.task_timers(id) ON DELETE SET NULL;

ALTER TABLE public.task_timers
    ADD CONSTRAINT task_timers_generated_log_id_fkey
    FOREIGN KEY (generated_log_id) REFERENCES public.daily_task_logs(id) ON DELETE SET NULL;

CREATE TABLE public.attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status public.attendance_status NOT NULL DEFAULT 'Present',
    check_in_at TIMESTAMPTZ,
    check_out_at TIMESTAMPTZ,
    attendance_hours NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (attendance_hours >= 0),
    off_hours NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (off_hours >= 0),
    holiday_name VARCHAR(120),
    notes TEXT,
    recorded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, attendance_date),
    CHECK (check_out_at IS NULL OR check_in_at IS NULL OR check_out_at >= check_in_at)
);

CREATE TABLE public.daily_star_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    star_date DATE NOT NULL DEFAULT CURRENT_DATE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    score NUMERIC(12, 4) NOT NULL DEFAULT 0,
    productivity_component NUMERIC(12, 4) NOT NULL DEFAULT 0,
    progress_component NUMERIC(12, 4) NOT NULL DEFAULT 0,
    checklist_component NUMERIC(12, 4) NOT NULL DEFAULT 0,
    freshness_component NUMERIC(12, 4) NOT NULL DEFAULT 0,
    attendance_component NUMERIC(12, 4) NOT NULL DEFAULT 0,
    reason TEXT,
    is_override BOOLEAN NOT NULL DEFAULT false,
    override_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(star_date)
);

CREATE TABLE public.performance_score_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    score_date DATE NOT NULL DEFAULT CURRENT_DATE,
    metric_key VARCHAR(60) NOT NULL,
    metric_value NUMERIC(12, 4) NOT NULL DEFAULT 0,
    source_table VARCHAR(60),
    source_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, score_date, metric_key, source_table, source_id)
);


-- ===========================================================================
-- SECTION 5 — SUPPORTING WORKBOOK LOGS & REPORTS
-- ===========================================================================

CREATE TABLE public.meeting_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_date DATE NOT NULL DEFAULT CURRENT_DATE,
    meeting_type VARCHAR(80),
    posted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    point TEXT NOT NULL,
    folder_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.daily_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fact_date DATE NOT NULL DEFAULT CURRENT_DATE,
    posted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    fact TEXT NOT NULL,
    folder_url TEXT,
    is_validated BOOLEAN NOT NULL DEFAULT false,
    validated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idea_date DATE NOT NULL DEFAULT CURRENT_DATE,
    posted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    idea TEXT NOT NULL,
    folder_url TEXT,
    is_validated BOOLEAN NOT NULL DEFAULT false,
    validated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suggestion_date DATE NOT NULL DEFAULT CURRENT_DATE,
    posted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    suggestion TEXT NOT NULL,
    folder_url TEXT,
    is_validated BOOLEAN NOT NULL DEFAULT false,
    validated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.sales_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
    sales_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    project_built_up_area TEXT,
    project_location TEXT,
    client_name TEXT,
    project_folder_url TEXT,
    is_new_project BOOLEAN NOT NULL DEFAULT false,
    basement_payment_received BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.report_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type VARCHAR(80) NOT NULL,
    title VARCHAR(180) NOT NULL,
    status public.report_status NOT NULL DEFAULT 'Draft',
    period_start DATE,
    period_end DATE,
    employee_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);


-- ===========================================================================
-- SECTION 6 — INDEXES
-- ===========================================================================

CREATE INDEX idx_task_assignees_task ON public.task_assignees(task_id);
CREATE INDEX idx_task_assignees_user ON public.task_assignees(user_id);
CREATE INDEX idx_task_reviewers_task ON public.task_reviewers(task_id);
CREATE INDEX idx_task_reviewers_user ON public.task_reviewers(user_id);
CREATE INDEX idx_task_dependencies_successor ON public.task_dependencies(successor_task_id);
CREATE INDEX idx_task_links_task_type ON public.task_links(task_id, link_type);
CREATE INDEX idx_checklist_template_nodes_template ON public.checklist_template_nodes(template_id);
CREATE INDEX idx_task_checklists_task ON public.task_checklists(task_id);
CREATE INDEX idx_checklist_nodes_checklist_parent ON public.checklist_nodes(checklist_id, parent_node_id);
CREATE INDEX idx_checklist_nodes_linked_task ON public.checklist_nodes(linked_task_id);
CREATE INDEX idx_task_timers_user_status ON public.task_timers(user_id, status);
CREATE INDEX idx_task_timers_task ON public.task_timers(task_id);
CREATE UNIQUE INDEX idx_task_timers_one_running_per_user
    ON public.task_timers(user_id)
    WHERE status = 'Running';
CREATE INDEX idx_attendance_records_date ON public.attendance_records(attendance_date);
CREATE INDEX idx_daily_star_records_user ON public.daily_star_records(user_id);
CREATE INDEX idx_performance_components_user_date ON public.performance_score_components(user_id, score_date);
CREATE INDEX idx_meeting_points_date ON public.meeting_points(meeting_date);
CREATE INDEX idx_daily_facts_date ON public.daily_facts(fact_date);
CREATE INDEX idx_ideas_date ON public.ideas(idea_date);
CREATE INDEX idx_suggestions_date ON public.suggestions(suggestion_date);
CREATE INDEX idx_sales_logs_date ON public.sales_logs(sale_date);
CREATE INDEX idx_report_snapshots_type_period ON public.report_snapshots(report_type, period_start, period_end);


-- ===========================================================================
-- SECTION 7 — updated_at MAINTENANCE
-- ===========================================================================

-- Migration 05 made set_updated_at() aware of task freshness decay. This version
-- keeps that task-only exception but avoids evaluating task-specific columns for
-- other tables before the function is attached to many new tables below.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF TG_TABLE_NAME = 'tasks' THEN
        IF NEW.freshness IS DISTINCT FROM OLD.freshness
           AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at
           AND NEW.progress_percentage IS NOT DISTINCT FROM OLD.progress_percentage
           AND NEW.task_productivity   IS NOT DISTINCT FROM OLD.task_productivity
           AND NEW.valid_for_metrics   IS NOT DISTINCT FROM OLD.valid_for_metrics
           AND NEW.status              IS NOT DISTINCT FROM OLD.status
           AND NEW.title               IS NOT DISTINCT FROM OLD.title
           AND NEW.task_scale          IS NOT DISTINCT FROM OLD.task_scale
           AND NEW.priority            IS NOT DISTINCT FROM OLD.priority
           AND NEW.category            IS NOT DISTINCT FROM OLD.category
           AND NEW.assignee_id         IS NOT DISTINCT FROM OLD.assignee_id
        THEN
            RETURN NEW;
        END IF;
    END IF;

    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_task_detail_sections_set_updated_at
    BEFORE UPDATE ON public.task_detail_sections
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_checklist_templates_set_updated_at
    BEFORE UPDATE ON public.checklist_templates
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_task_checklists_set_updated_at
    BEFORE UPDATE ON public.task_checklists
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_checklist_nodes_set_updated_at
    BEFORE UPDATE ON public.checklist_nodes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_task_timers_set_updated_at
    BEFORE UPDATE ON public.task_timers
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_attendance_records_set_updated_at
    BEFORE UPDATE ON public.attendance_records
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_daily_star_records_set_updated_at
    BEFORE UPDATE ON public.daily_star_records
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_meeting_points_set_updated_at
    BEFORE UPDATE ON public.meeting_points
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_daily_facts_set_updated_at
    BEFORE UPDATE ON public.daily_facts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_ideas_set_updated_at
    BEFORE UPDATE ON public.ideas
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_suggestions_set_updated_at
    BEFORE UPDATE ON public.suggestions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_sales_logs_set_updated_at
    BEFORE UPDATE ON public.sales_logs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_report_snapshots_set_updated_at
    BEFORE UPDATE ON public.report_snapshots
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ===========================================================================
-- SECTION 8 — RLS ENABLEMENT
-- ===========================================================================

ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_detail_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_template_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_timers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_star_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_score_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_snapshots ENABLE ROW LEVEL SECURITY;


-- ===========================================================================
-- SECTION 9 — RLS POLICIES
-- ===========================================================================

-- Shared read policy: the workbook was team-transparent, and the current app
-- already allows authenticated users to view team tasks/logs/snapshots.
CREATE POLICY "Users can view task assignees" ON public.task_assignees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view task reviewers" ON public.task_reviewers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view task dependencies" ON public.task_dependencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view task detail sections" ON public.task_detail_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view task links" ON public.task_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view checklist templates" ON public.checklist_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view checklist template nodes" ON public.checklist_template_nodes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view task checklists" ON public.task_checklists FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view checklist nodes" ON public.checklist_nodes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view task timers" ON public.task_timers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view attendance records" ON public.attendance_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view daily stars" ON public.daily_star_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view score components" ON public.performance_score_components FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view meeting points" ON public.meeting_points FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view daily facts" ON public.daily_facts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view ideas" ON public.ideas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view suggestions" ON public.suggestions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view sales logs" ON public.sales_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view report snapshots" ON public.report_snapshots FOR SELECT TO authenticated USING (true);

-- Leadership owns task structure, checklists, reports, stars and administrative
-- records. This mirrors the existing tasks/milestones leadership policy.
CREATE POLICY "Leadership can manage task assignees" ON public.task_assignees FOR ALL TO authenticated USING (public.get_user_role() IN ('managing_director', 'project_engineer')) WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer'));
CREATE POLICY "Leadership can manage task reviewers" ON public.task_reviewers FOR ALL TO authenticated USING (public.get_user_role() IN ('managing_director', 'project_engineer')) WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer'));
CREATE POLICY "Leadership can manage task dependencies" ON public.task_dependencies FOR ALL TO authenticated USING (public.get_user_role() IN ('managing_director', 'project_engineer')) WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer'));
CREATE POLICY "Leadership can manage task detail sections" ON public.task_detail_sections FOR ALL TO authenticated USING (public.get_user_role() IN ('managing_director', 'project_engineer')) WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer'));
CREATE POLICY "Leadership can manage task links" ON public.task_links FOR ALL TO authenticated USING (public.get_user_role() IN ('managing_director', 'project_engineer')) WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer'));
CREATE POLICY "Leadership can manage checklist templates" ON public.checklist_templates FOR ALL TO authenticated USING (public.get_user_role() IN ('managing_director', 'project_engineer')) WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer'));
CREATE POLICY "Leadership can manage checklist template nodes" ON public.checklist_template_nodes FOR ALL TO authenticated USING (public.get_user_role() IN ('managing_director', 'project_engineer')) WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer'));
CREATE POLICY "Leadership can manage task checklists" ON public.task_checklists FOR ALL TO authenticated USING (public.get_user_role() IN ('managing_director', 'project_engineer')) WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer'));
CREATE POLICY "Leadership can manage checklist nodes" ON public.checklist_nodes FOR ALL TO authenticated USING (public.get_user_role() IN ('managing_director', 'project_engineer')) WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer'));
CREATE POLICY "Leadership can manage task timers" ON public.task_timers FOR ALL TO authenticated USING (public.get_user_role() IN ('managing_director', 'project_engineer')) WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer'));
CREATE POLICY "Leadership can manage attendance records" ON public.attendance_records FOR ALL TO authenticated USING (public.get_user_role() IN ('managing_director', 'project_engineer')) WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer'));
CREATE POLICY "Leadership can manage daily stars" ON public.daily_star_records FOR ALL TO authenticated USING (public.get_user_role() IN ('managing_director', 'project_engineer')) WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer'));
CREATE POLICY "Leadership can manage score components" ON public.performance_score_components FOR ALL TO authenticated USING (public.get_user_role() IN ('managing_director', 'project_engineer')) WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer'));
CREATE POLICY "Leadership can manage report snapshots" ON public.report_snapshots FOR ALL TO authenticated USING (public.get_user_role() IN ('managing_director', 'project_engineer')) WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer'));

-- Assigned users can operate their own timers. The task relationship is checked
-- against both the legacy assignee_id and the new multi-assignee join table.
CREATE POLICY "Assignees can insert their own timers"
ON public.task_timers FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
        SELECT 1
        FROM public.tasks t
        WHERE t.id = task_id
          AND (
              t.assignee_id = auth.uid()
              OR EXISTS (
                  SELECT 1
                  FROM public.task_assignees ta
                  WHERE ta.task_id = t.id AND ta.user_id = auth.uid()
              )
          )
    )
);

CREATE POLICY "Task assignees can update assigned tasks via join table"
ON public.tasks FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.task_assignees ta
        WHERE ta.task_id = tasks.id
          AND ta.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.task_assignees ta
        WHERE ta.task_id = tasks.id
          AND ta.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update their own timers"
ON public.task_timers FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Assigned users can check off checklist nodes for their own tasks. The app
-- layer will restrict editable fields; RLS grants only row-level access.
CREATE POLICY "Assignees can update checklist nodes"
ON public.checklist_nodes FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.task_checklists tc
        JOIN public.tasks t ON t.id = tc.task_id
        WHERE tc.id = checklist_id
          AND (
              t.assignee_id = auth.uid()
              OR EXISTS (
                  SELECT 1
                  FROM public.task_assignees ta
                  WHERE ta.task_id = t.id AND ta.user_id = auth.uid()
              )
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.task_checklists tc
        JOIN public.tasks t ON t.id = tc.task_id
        WHERE tc.id = checklist_id
          AND (
              t.assignee_id = auth.uid()
              OR EXISTS (
                  SELECT 1
                  FROM public.task_assignees ta
                  WHERE ta.task_id = t.id AND ta.user_id = auth.uid()
              )
          )
    )
);

-- Users can maintain their own attendance entry for the day; leadership can
-- manage all attendance through the policy above.
CREATE POLICY "Users can insert their own attendance"
ON public.attendance_records FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own attendance"
ON public.attendance_records FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Data managers can manage supporting workbook logs; contributors can create
-- their own entries.
CREATE POLICY "Data managers can manage meeting points" ON public.meeting_points FOR ALL TO authenticated USING (public.get_user_role() IN ('managing_director', 'project_engineer', 'data_manager')) WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer', 'data_manager'));
CREATE POLICY "Data managers can manage daily facts" ON public.daily_facts FOR ALL TO authenticated USING (public.get_user_role() IN ('managing_director', 'project_engineer', 'data_manager')) WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer', 'data_manager'));
CREATE POLICY "Data managers can manage ideas" ON public.ideas FOR ALL TO authenticated USING (public.get_user_role() IN ('managing_director', 'project_engineer', 'data_manager')) WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer', 'data_manager'));
CREATE POLICY "Data managers can manage suggestions" ON public.suggestions FOR ALL TO authenticated USING (public.get_user_role() IN ('managing_director', 'project_engineer', 'data_manager')) WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer', 'data_manager'));
CREATE POLICY "Data managers can manage sales logs" ON public.sales_logs FOR ALL TO authenticated USING (public.get_user_role() IN ('managing_director', 'project_engineer', 'data_manager')) WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer', 'data_manager'));

CREATE POLICY "Users can insert their own meeting points" ON public.meeting_points FOR INSERT TO authenticated WITH CHECK (posted_by = auth.uid());
CREATE POLICY "Users can insert their own daily facts" ON public.daily_facts FOR INSERT TO authenticated WITH CHECK (posted_by = auth.uid());
CREATE POLICY "Users can insert their own ideas" ON public.ideas FOR INSERT TO authenticated WITH CHECK (posted_by = auth.uid());
CREATE POLICY "Users can insert their own suggestions" ON public.suggestions FOR INSERT TO authenticated WITH CHECK (posted_by = auth.uid());
CREATE POLICY "Users can insert their own sales logs" ON public.sales_logs FOR INSERT TO authenticated WITH CHECK (sales_by = auth.uid());


-- ===========================================================================
-- SECTION 10 — COMPATIBILITY BACKFILL HELPERS
-- ===========================================================================

-- Backfill join rows from existing task columns. Safe to re-run.
INSERT INTO public.task_assignees (task_id, user_id, assignment_role, is_primary)
SELECT id, assignee_id, 'Owner'::public.task_assignment_role, true
FROM public.tasks
ON CONFLICT (task_id, user_id) DO NOTHING;

INSERT INTO public.task_reviewers (task_id, user_id, reviewer_role, is_primary)
SELECT id, reviewer_id, 'Primary'::public.task_reviewer_role, true
FROM public.tasks
WHERE reviewer_id IS NOT NULL
ON CONFLICT (task_id, user_id) DO NOTHING;
