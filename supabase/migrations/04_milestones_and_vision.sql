-- ===========================================================================
-- TaskPulse — Customisable Vision, Mission, Values & Milestones
--
-- Resolves the "milestone content is static" gap recorded in README.md and
-- .kiro/progress.md. Until now the /milestones tab rendered typed constants from
-- lib/milestones/content.ts, so changing a vision statement meant a code change
-- and a deploy. These two tables move that content into the database and put it
-- behind the same role model as the rest of the workspace.
--
-- Apply AFTER 01, 02 and 03. This migration depends on three objects they
-- create: public.users, public.get_user_role() and public.set_updated_at().
--
-- Apply with `supabase db push`, or paste the whole file into the Supabase SQL
-- Editor and run it once.
-- ===========================================================================


-- ===========================================================================
-- SECTION 1 — ENUM
--
-- The three states the checklist already displayed. Declared as an enum rather
-- than a CHECK-constrained text column to match how task_status, task_priority
-- and the rest of the taxonomies are modelled, so the TypeScript union in
-- types/tracker.ts has a single database counterpart.
-- ===========================================================================

CREATE TYPE public.milestone_status AS ENUM (
    'Planned',      -- agreed but not yet started
    'In Progress',  -- actively being delivered
    'Achieved'      -- delivered in full
);


-- ===========================================================================
-- SECTION 2 — TABLES
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- COMPANY STATEMENTS
--
-- One row per editable block on the /milestones showcase: vision, mission and
-- core values. `key_name` is the stable lookup handle the application selects
-- by, so renaming a title never breaks a query, and it is UNIQUE because each
-- block appears exactly once on the page.
--
-- Core values are held as a single row whose `statement` carries one value per
-- line in `Name: description` form. That keeps the table to the shape specified
-- — one statement, one subtext — and keeps the card to one Edit button, at the
-- cost of the values being free text rather than their own rows. If per-value
-- ordering or icons are ever wanted, split them into a `company_values` table;
-- the parser in lib/milestones/statements.ts is the only thing that would change.
-- ---------------------------------------------------------------------------
CREATE TABLE public.company_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Lowercase snake_case handle, e.g. 'vision', 'mission', 'core_values'.
    key_name VARCHAR(40) UNIQUE NOT NULL,
    title VARCHAR(80) NOT NULL,
    statement TEXT NOT NULL,
    subtext TEXT,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Who last edited it. SET NULL rather than CASCADE: losing the editor's
    -- account must not delete the organisation's vision statement.
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- COMPANY MILESTONES
--
-- Monthly organisational goals, distinct from public.tasks. A task is a unit of
-- assigned work measured in scale and hours; a milestone is an outcome the team
-- is aiming at, counted in deliverables. They are deliberately not the same
-- table — milestones carry no scale, no productivity and no effort logs, and
-- folding them into tasks would put rows into the team median that are not
-- anybody's assigned work.
--
-- NOTE ON owner_id: this is a foreign key, so an owner must be a real member.
-- The static content it replaces used free text ("Project Engineering", "Whole
-- team"), which a UUID cannot express. Team-wide milestones are therefore stored
-- with owner_id NULL and rendered as unassigned. Add an `owner_label TEXT`
-- column if naming a group rather than a person matters.
-- ---------------------------------------------------------------------------
CREATE TABLE public.company_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(120) NOT NULL,
    description TEXT,
    status public.milestone_status NOT NULL DEFAULT 'Planned',

    -- Accountable member, or NULL for a milestone the whole team carries.
    owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,

    -- Countable progress. Both NULL-free vs nullable on purpose: a milestone
    -- either has a target to count towards or it does not, and "0 of NULL" is
    -- the honest representation of an uncountable goal.
    delivered_count INT NOT NULL DEFAULT 0 CHECK (delivered_count >= 0),
    target_count INT CHECK (target_count IS NULL OR target_count > 0),

    due_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Over-delivery is permitted (delivered_count may exceed target_count): hitting
-- five of four is a real outcome and should not be rejected by a constraint. The
-- progress bar clamps at 100% for display.


-- ===========================================================================
-- SECTION 3 — INDEXES
--
-- company_statements needs none beyond the UNIQUE index on key_name, which
-- already serves the only access pattern (fetch all three, or fetch one by key).
-- ===========================================================================

-- The checklist groups by status and the navigation badge counts everything not
-- yet Achieved, so status is the one column that is filtered rather than read.
CREATE INDEX idx_company_milestones_status ON public.company_milestones(status);


-- ===========================================================================
-- SECTION 4 — updated_at MAINTENANCE
--
-- Reuses public.set_updated_at() from 01_init_schema.sql.
--
-- Only company_statements gets this trigger. company_milestones carries
-- created_at only, per specification, so milestone edits are not timestamped —
-- add an updated_at column and a matching trigger if an audit trail on
-- milestones is wanted.
-- ===========================================================================

CREATE TRIGGER trg_company_statements_set_updated_at
    BEFORE UPDATE ON public.company_statements
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ===========================================================================
-- SECTION 5 — ENABLE ROW LEVEL SECURITY
--
-- With RLS enabled and no matching policy, access is denied by default.
-- ===========================================================================

ALTER TABLE public.company_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_milestones ENABLE ROW LEVEL SECURITY;


-- ===========================================================================
-- SECTION 6 — RLS POLICIES
--
-- Read for the whole team, write for leadership. Policies are PERMISSIVE, so the
-- SELECT policy and the FOR ALL policy combine: any authenticated member can
-- read, and only the two leadership roles satisfy any write command.
--
-- WITH CHECK is stated explicitly on the write policy. PostgreSQL would infer
-- the same expression from USING, but spelling it out keeps the write boundary
-- readable — and it is what stops a project engineer from editing a row into a
-- state they could not have created.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- COMPANY STATEMENTS
-- ---------------------------------------------------------------------------

CREATE POLICY "Users can view company statements"
ON public.company_statements FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Leadership can manage company statements"
ON public.company_statements FOR ALL
TO authenticated
USING (public.get_user_role() IN ('managing_director', 'project_engineer'))
WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer'));

-- ---------------------------------------------------------------------------
-- COMPANY MILESTONES
-- ---------------------------------------------------------------------------

CREATE POLICY "Users can view company milestones"
ON public.company_milestones FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Leadership can manage company milestones"
ON public.company_milestones FOR ALL
TO authenticated
USING (public.get_user_role() IN ('managing_director', 'project_engineer'))
WITH CHECK (public.get_user_role() IN ('managing_director', 'project_engineer'));


-- ===========================================================================
-- SECTION 7 — SEED CONTENT
--
-- Carried over verbatim from lib/milestones/content.ts, which this migration
-- retires, so the page renders the same words the moment 04 is applied instead
-- of an empty shell. Replace the wording through the UI — that is the point of
-- the tables.
--
-- These statements run as the migration owner and therefore bypass RLS. Both are
-- written to be safe to re-run.
-- ===========================================================================

INSERT INTO public.company_statements (key_name, title, statement, subtext)
VALUES
    (
        'vision',
        'Vision',
        'To be the engineering partner clients trust with the work that cannot afford to go wrong.',
        'Measured delivery over hurried delivery. Every drawing, calculation and estimate should stand up to scrutiny years after it was issued.'
    ),
    (
        'mission',
        'Mission',
        'Turn every project into a documented, measurable, repeatable process.',
        'We track scale, effort and progress on every task so that capacity is a known quantity, commitments are made from evidence, and nobody carries an invisible workload.'
    ),
    (
        'core_values',
        'Core values',
        -- One value per line, `Name: description`. The application splits on the
        -- first colon; a line without one renders as a value with no elaboration.
        -- Dollar-quoted so the line breaks are literal and no escaping is needed.
        $values$Technical Rigour: Conclusions follow from calculations, not from confidence. Work is checked before it is issued.
Client Centricity: The client should never have to ask where a project stands. Progress is reported before it is requested.
Shared Ownership: Workload is distributed against the team median, not by who speaks up. Reviewers are named on every task.
Continuous Improvement: Each project leaves behind a template, a checklist or a handbook that makes the next one faster.$values$,
        'How the work gets done when nobody is watching.'
    )
-- Idempotent: re-running leaves edited statements alone rather than reverting
-- them to the seed text.
ON CONFLICT (key_name) DO NOTHING;


-- Milestones have no natural key, so ON CONFLICT cannot protect them. Seed only
-- into an empty table; once leadership has added or removed anything, re-running
-- this migration is a no-op rather than a duplicate set.
INSERT INTO public.company_milestones
    (title, description, status, delivered_count, target_count)
SELECT * FROM (VALUES
    (
        'Construction Templates',
        'Standardised drawing and specification templates covering the four most repeated structural details.',
        'In Progress'::public.milestone_status,
        2,
        4
    ),
    (
        'Handbooks',
        'Written procedure handbooks for site inspection, quality review and issue handover.',
        'In Progress'::public.milestone_status,
        1,
        3
    ),
    (
        'Client Centricity',
        'A monthly progress summary issued to every active client without being asked for it.',
        'Planned'::public.milestone_status,
        0,
        NULL::INT
    ),
    (
        'Effort Logging Discipline',
        'Every active member logging hours against tracked tasks on every working day.',
        'In Progress'::public.milestone_status,
        0,
        NULL::INT
    ),
    (
        'Zero Rotten Backlog',
        'No task left without an update for more than fourteen days at month end.',
        'Planned'::public.milestone_status,
        0,
        NULL::INT
    )
) AS seed (title, description, status, delivered_count, target_count)
WHERE NOT EXISTS (SELECT 1 FROM public.company_milestones);


-- ===========================================================================
-- NOTES CARRIED FORWARD
--
-- 1. owner_id is NULL on every seeded row. The static content named groups
--    ("Project Engineering", "Whole team") and a UUID foreign key cannot hold
--    those, so ownership is assigned through the UI once members exist.
--
-- 2. Neither table records a deletion history. Deleting a milestone is
--    permanent, and the only guard is that the two leadership roles are the only
--    ones who can do it. Add a soft-delete flag if an undo is wanted.
--
-- 3. company_milestones has no updated_at, per the specified column list, so
--    "last changed" is not recoverable for a milestone. company_statements does
--    record both updated_at and updated_by.
-- ===========================================================================
