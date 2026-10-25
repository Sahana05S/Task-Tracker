-- ===========================================================================
-- TaskPulse - decide yesterday's awards every night (forward only)
--
-- User decisions (DECISIONS "Last recorded data instead of warnings",
-- 25 October 2026): pages show the last recorded result instead of "waiting
-- for data" warnings, and the causes that left days undecided are removed:
--   1. Every award run reads its sources as of when it runs (application
--      change in modules/scoring/internal/stars/calculation.ts), so the
--      first nightly run sees the 00:15 attendance fill (migration 73).
--   2. public.requeue_blocked_awards(p_from, p_through) (service role): the
--      nightly worker re-queues every award day in the window whose latest
--      run was blocked, so a day is retried instead of waiting for some later
--      record change, at most once per night (runs made since midnight India
--      time are not retried again). Frozen days and days with a director
--      override are left alone.
-- No formula, tie or eligibility rule changes. (The plan's start-date attendance
-- rule is not part of this migration: the demo has no missing days, and it is
-- left for when a member joins mid-month.)
-- ===========================================================================
BEGIN;

-- Blocked days are retried on every nightly run, one pass per active company.
CREATE FUNCTION public.requeue_blocked_awards(p_from date,p_through date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org record; s record; n integer:=0; BEGIN
 IF p_from IS NULL OR p_through IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_through) OR p_through<p_from OR p_through-p_from>62 THEN
  RAISE EXCEPTION 'A window of at most 63 days is required' USING ERRCODE='23514'; END IF;
 FOR org IN SELECT id FROM public.organizations WHERE status='active' ORDER BY created_at,id LOOP
  PERFORM set_config('taskpulse.organization',org.id::text,true);
  FOR s IN SELECT sl.business_date FROM taskpulse_private.award_slots sl
   JOIN taskpulse_private.award_runs r ON r.id=sl.latest_run
   WHERE sl.organization_id=org.id AND sl.business_date BETWEEN p_from AND p_through
    AND NOT sl.stale AND sl.override_id IS NULL AND r.status='blocked'
    AND NOT (r.result->'reasons' ? 'award_cutoff_not_reached')
    -- Once per night: a run made since midnight (India time) is not retried again, so the
    -- worker's repeat calls in one nightly run cannot loop on a day that stays blocked.
    AND r.created_at<(date_trunc('day',clock_timestamp() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')
   ORDER BY sl.business_date LOOP
   IF NOT taskpulse_private.award_date_frozen(s.business_date) THEN
    PERFORM taskpulse_private.queue_award(s.business_date,true);
    n:=n+1;
   END IF;
  END LOOP;
 END LOOP;
 PERFORM set_config('taskpulse.organization','',true);
 RETURN jsonb_build_object('requeued',n);
END $$;
REVOKE ALL ON FUNCTION public.requeue_blocked_awards(date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.requeue_blocked_awards(date,date) TO service_role;

COMMIT;
SELECT taskpulse_private.m15_secure();
