-- ===========================================================================
-- TaskPulse — Daily Log Deletion Policy
--
-- Resolves gap #2 recorded at the bottom of 01_init_schema.sql.
--
-- The spec comment in `Supabase RLS Policies.sql` reads "Users can edit or
-- delete their own logs", but only a FOR UPDATE policy was ever defined. With
-- RLS enabled and no matching DELETE policy, a delete is silently refused: the
-- statement succeeds and reports zero rows affected. Only a managing_director
-- could remove a log, via the broad FOR ALL policy.
--
-- Phase 4 lets a member correct their own effort history, so the missing policy
-- is added here, scoped to rows the caller owns.
-- ===========================================================================

CREATE POLICY "Users can delete their own logs"
ON public.daily_task_logs FOR DELETE
TO authenticated
USING (user_id = auth.uid());


-- ===========================================================================
-- NOTE ON SCOPE
--
-- This grants deletion of any own log regardless of age. If effort history for
-- closed months must become immutable, tighten the predicate rather than
-- enforcing it in the application, for example:
--
--   USING (
--       user_id = auth.uid()
--       AND log_date >= date_trunc('month', CURRENT_DATE)
--   )
--
-- Application-side checks alone would not hold, because the Data API is
-- reachable directly with a user's own token.
-- ===========================================================================
