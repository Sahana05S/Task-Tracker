-- ===========================================================================
-- TaskPulse - indexes for the award read model (forward only)
--
-- /reports still failed on the demo site after migration 82, now with
-- "Award read failed: canceling statement due to statement timeout".
-- public.award_read_model (migration 62) runs, for every award day of the
-- month, two lookups of the day's latest award job in outbox_jobs and one of
-- its last certified run in award_runs. Neither had a usable index: the only
-- outbox_jobs index is partial (active award jobs), and award_runs had none on
-- slot_id. Both tables grow with every recheck, so each read scanned them
-- about sixty times. The Daily report's per-member history also reads
-- award_candidates by user.
-- No function or data changes.
-- ===========================================================================
BEGIN;
CREATE INDEX IF NOT EXISTS m83_outbox_jobs_entity ON taskpulse_private.outbox_jobs(entity_id,kind,created_at DESC);
CREATE INDEX IF NOT EXISTS m83_award_runs_slot ON taskpulse_private.award_runs(slot_id,created_at DESC);
CREATE INDEX IF NOT EXISTS m83_award_candidates_user ON taskpulse_private.award_candidates(user_id,run_id);
ANALYZE taskpulse_private.outbox_jobs;
ANALYZE taskpulse_private.award_runs;
ANALYZE taskpulse_private.award_candidates;
COMMIT;
SELECT taskpulse_private.m15_secure();
