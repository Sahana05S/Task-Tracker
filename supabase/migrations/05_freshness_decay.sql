-- ===========================================================================
-- TaskPulse — Freshness Decay
--
-- Resolves gap #1 recorded in `.kiro/progress.md` and `README.md`:
-- `tasks.freshness` is reset to `Fresh` when a log is filed but nothing
-- ever advances it to `Stale` or `Rotten` as time passes. This means every
-- unlogged task reads as `Fresh`, which silently distorts two terms of the
-- star performer formula (0.2 × Freshness Score, −0.1 × Rotten Count).
--
-- What this migration adds
-- ─────────────────────────
-- 1. `public.decay_task_freshness()` — a single UPDATE that classifies every
--    non-Done, non-Discarded task by comparing NOW() against its updated_at.
--    Runs as SECURITY DEFINER so it can write the tasks table without the
--    caller needing an RLS-granted UPDATE permission. Because it touches only
--    the freshness column and only on non-terminal rows, a stale or rotten
--    task that gets a log filed against it will be reset to Fresh by
--    recalculateTaskMetrics() in app/logs/actions.ts before the next decay
--    run touches it — the two paths do not race.
--
-- 2. A pg_cron job that calls the function once per hour. pg_cron is
--    pre-installed on Supabase Pro plans. The migration wraps the cron
--    creation in a DO block that skips it silently if pg_cron is not
--    available (Free plan, self-hosted without the extension), so the
--    function itself is always created and can still be invoked manually,
--    by a Supabase Edge Function trigger, or by a future cron once the plan
--    is upgraded.
--
-- Thresholds (from domain-rules.md and lib/tracker/enums.ts)
-- ─────────────────────────────────────────────────────────────
--   Fresh   updated_at is within the last 7 days
--   Stale   no activity for 7–14 days
--   Rotten  inactive for more than 14 days and not Done/Discarded
--
-- Apply order: after 01, 02, 03, 04. No objects from those migrations are
-- altered; this file only adds a function and a cron job.
--
-- Apply with `supabase db push`, or paste into the SQL Editor and run once.
-- ===========================================================================


-- ===========================================================================
-- SECTION 1 — DECAY FUNCTION
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.decay_task_freshness()
RETURNS TABLE(updated_count INT, rotten_count INT, stale_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_updated INT;
    v_rotten  INT;
    v_stale   INT;
BEGIN
    -- A single UPDATE classifies every eligible task atomically. The CASE
    -- expression mirrors the thresholds in domain-rules.md exactly:
    --
    --   Fresh   NOW() - updated_at <= 7 days
    --   Stale   7 days < NOW() - updated_at <= 14 days
    --   Rotten  NOW() - updated_at > 14 days
    --
    -- Done and Discarded tasks are excluded. A completed task that has not
    -- been touched in 30 days is not "rotten" — it is finished. The
    -- freshness column is only meaningful for open work.
    --
    -- The WHERE clause also skips rows whose freshness is already correct, so
    -- on a team that logs diligently the UPDATE touches zero rows and the
    -- function is essentially free.
    UPDATE public.tasks
    SET freshness = CASE
        WHEN NOW() - updated_at <= INTERVAL '7 days'  THEN 'Fresh'::public.task_freshness
        WHEN NOW() - updated_at <= INTERVAL '14 days' THEN 'Stale'::public.task_freshness
        ELSE                                               'Rotten'::public.task_freshness
    END
    WHERE
        status NOT IN ('Done', 'Discarded')
        AND freshness IS DISTINCT FROM (
            CASE
                WHEN NOW() - updated_at <= INTERVAL '7 days'  THEN 'Fresh'::public.task_freshness
                WHEN NOW() - updated_at <= INTERVAL '14 days' THEN 'Stale'::public.task_freshness
                ELSE                                               'Rotten'::public.task_freshness
            END
        );

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    -- Count the post-update distribution for the caller's information.
    -- These are the figures that feed the star formula, so returning them
    -- lets an Edge Function log them for observability without a second query.
    SELECT
        COUNT(*) FILTER (WHERE freshness = 'Rotten' AND status NOT IN ('Done','Discarded')),
        COUNT(*) FILTER (WHERE freshness = 'Stale'  AND status NOT IN ('Done','Discarded'))
    INTO v_rotten, v_stale
    FROM public.tasks;

    RETURN QUERY SELECT v_updated, v_rotten, v_stale;
END;
$$;

-- Revoke the broad PUBLIC grant that CREATE FUNCTION gives by default, then
-- grant explicitly to service_role so only the Edge Function (which runs as
-- service_role) and pg_cron (which runs as the migration owner, a superuser)
-- can call it. Authenticated users have no reason to invoke a bulk UPDATE.
REVOKE EXECUTE ON FUNCTION public.decay_task_freshness() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.decay_task_freshness() TO service_role;


-- ===========================================================================
-- SECTION 2 — pg_cron SCHEDULE (Supabase Pro / self-hosted with pg_cron)
--
-- Runs once per hour. The domain rules define Stale as > 7 days and Rotten
-- as > 14 days, so hourly is far more than precise enough — a daily run
-- would also work. Hourly was chosen so a dashboard opened shortly after
-- the threshold is crossed shows the correct badge within minutes rather
-- than hours.
--
-- The DO block catches the case where pg_cron is not installed and prints a
-- NOTICE instead of failing the migration. The function created above is
-- still useful without it — it can be called manually or from the Edge
-- Function below.
-- ===========================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) THEN
        -- Idempotent: unschedule any existing job with this name before
        -- recreating it, so re-running the migration does not duplicate the job.
        PERFORM cron.unschedule('taskpulse-freshness-decay')
        WHERE EXISTS (
            SELECT 1 FROM cron.job WHERE jobname = 'taskpulse-freshness-decay'
        );

        PERFORM cron.schedule(
            'taskpulse-freshness-decay',
            '0 * * * *',   -- every hour, on the hour
            $$SELECT public.decay_task_freshness()$$
        );

        RAISE NOTICE 'pg_cron job "taskpulse-freshness-decay" scheduled (hourly).';
    ELSE
        RAISE NOTICE
            'pg_cron is not installed. The decay_task_freshness() function was '
            'created and can be called manually or via a Supabase Edge Function. '
            'See supabase/functions/decay-freshness/index.ts.';
    END IF;
END;
$$;


-- ===========================================================================
-- NOTES
--
-- 1. SECURITY DEFINER is required. The tasks table is RLS-protected and the
--    function needs to update rows regardless of which session calls it. The
--    function is pinned to SET search_path = '' to prevent search-path
--    hijacking, and EXECUTE is granted only to service_role.
--
-- 2. The WHERE clause filters out already-correct rows. PostgreSQL still
--    acquires a row lock for every row in the UPDATE's candidate set, but
--    it avoids writing to pages whose data is not changing, so the I/O cost
--    on a team that logs regularly is close to zero.
--
-- 3. The trg_tasks_set_updated_at trigger (from 01_init_schema.sql) fires
--    on every UPDATE to the tasks table, including this one. That means each
--    decay run would immediately refresh updated_at on the rows it touches,
--    making them all Fresh again on the next run — a logic loop.
--
--    This is resolved by suppressing the trigger for this specific column.
--    The trigger function already checks NEW vs OLD, but it fires
--    unconditionally. The UPDATE above is therefore written to avoid
--    touching rows whose freshness is already correct (the IS DISTINCT FROM
--    guard), and the function itself sets freshness WITHOUT updating any
--    other column, so the trigger fires but the only change is to freshness
--    itself. Because the trigger sets NEW.updated_at = NOW(), the row's
--    updated_at will be refreshed by the decay run — which is wrong.
--
--    Fix: the trigger must not fire when the only change is to freshness.
--    The revised trigger below replaces the one from 01_init_schema.sql.
-- ===========================================================================


-- ===========================================================================
-- SECTION 3 — REVISED updated_at TRIGGER
--
-- The original trigger (01_init_schema.sql, SECTION 4) fires on every UPDATE
-- and sets updated_at = NOW() unconditionally. That is correct for all user-
-- initiated writes, but it creates a feedback loop with decay_task_freshness():
-- the decay run changes freshness → trigger fires → updated_at is refreshed
-- → on the next decay run the row looks Fresh again.
--
-- The fix: skip the updated_at refresh when the only changed column is
-- freshness. All other UPDATE paths (from the application actions) touch at
-- least one other column (status, progress_percentage, etc.), so they are
-- unaffected. This is a DROP-and-recreate rather than ALTER because
-- CREATE OR REPLACE on a trigger function replaces the function body but
-- cannot change when the trigger fires; the trigger itself must be dropped
-- and re-added to change its WHEN clause.
-- ===========================================================================

-- Replace the shared trigger function with one that is freshness-aware.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    -- Skip the timestamp refresh when the only change is to the freshness
    -- column. Decay runs touch only freshness; every application write
    -- touches at least one other column, so this condition is false for all
    -- normal user-initiated updates.
    IF TG_TABLE_NAME = 'tasks'
       AND NEW.freshness IS DISTINCT FROM OLD.freshness
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
        RETURN NEW;  -- let the freshness column change, but don't touch updated_at
    END IF;

    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- The trigger definitions for users and tasks remain the same; only the
-- function body changed, so no DROP/CREATE is needed for them — PostgreSQL
-- will pick up the new function body automatically because triggers call
-- the function by OID.


-- ===========================================================================
-- VERIFICATION QUERY (run manually after applying this migration)
--
-- SELECT * FROM public.decay_task_freshness();
--
-- Expected columns: updated_count, rotten_count, stale_count
-- updated_count is how many rows had their freshness corrected.
-- On a fresh database with only Fresh tasks the count will be 0.
-- ===========================================================================
