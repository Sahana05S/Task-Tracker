-- USERS / PROFILES TABLE
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_id VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    role user_role NOT NULL DEFAULT 'team_member',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TASKS TABLE
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_tag VARCHAR(30) UNIQUE NOT NULL, -- e.g., "Sep26_T5"
    title VARCHAR(255) NOT NULL,
    category task_category NOT NULL DEFAULT 'T',
    description TEXT,
    comments TEXT,
    
    -- Ownership & Review
    assignee_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Metrics & Progress
    task_scale NUMERIC(10, 2) DEFAULT 0.00,
    progress_percentage NUMERIC(5, 2) DEFAULT 0.00 CHECK (progress_percentage BETWEEN 0 AND 100),
    scaled_progress NUMERIC(10, 2) GENERATED ALWAYS AS (task_scale * (progress_percentage / 100.0)) STORED,
    task_productivity NUMERIC(10, 2) DEFAULT 0.00,
    
    -- Status & Freshness
    priority task_priority NOT NULL DEFAULT 'Medium',
    status task_status NOT NULL DEFAULT 'Not Started',
    freshness task_freshness NOT NULL DEFAULT 'Fresh',
    valid_for_metrics BOOLEAN NOT NULL DEFAULT true,
    
    -- Dates & Milestones
    assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    completed_date DATE,
    met_deadline BOOLEAN,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DAILY TASK EFFORT LOGS TABLE
CREATE TABLE daily_task_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    hours_worked NUMERIC(5, 2) NOT NULL CHECK (hours_worked >= 0),
    progress_delta NUMERIC(5, 2) DEFAULT 0.00,
    update_notes TEXT,
    raw_links TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- MONTHLY PERFORMANCE SNAPSHOTS (Medians & Differentials)
CREATE TABLE monthly_performance_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

-- INDEXES FOR FAST QUERYING & GRID RENDERING
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_freshness ON tasks(freshness);
CREATE INDEX idx_daily_logs_user_date ON daily_task_logs(user_id, log_date);
CREATE INDEX idx_daily_logs_task ON daily_task_logs(task_id);