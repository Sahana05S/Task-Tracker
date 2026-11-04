-- ===========================================================================
-- TaskPulse - several mission timers at once, merged day hours
-- (forward only; 4 November 2026)
--
-- User decisions, 4 November 2026:
-- * A person may run several mission timers at the same time (for example,
--   asked to start another mission while one is running).
-- * Each mission keeps its full time: A 09:00-13:00 logs 4 h on A and
--   B 11:00-14:00 logs 3 h on B. Task productivity and scale-by-hours stay
--   per mission and are unchanged.
-- * The day's productive hours are the MERGED time of all timers:
--   09:00-14:00 = 5 h, not 7 h. Every daily total uses the merged time.
--
-- 1. idx_task_timers_one_running_per_user (07, redefined in 98) becomes
--    idx_task_timers_one_running_per_mission: at most one running server
--    timer per person per mission. record_offline_timer no longer refuses
--    an offline span that overlaps a timer still running on the server.
-- 2. taskpulse_private.overlap_hours(tstzrange[]) is the hours counted twice
--    by overlapping timer segments (sum of lengths minus the length of their
--    union). A day's merged hours = sum(hours_worked) - overlap_hours(timer
--    segments). Manual and imported logs have no times and count as entered.
--    Subtracting the overlap keeps every day without overlaps exactly as
--    before. taskpulse_private.member_day_hours(user, date) reads it for one
--    person and day.
-- 3. The effort snapshot (capture_effort_input, migration 19) records each
--    segment's start and end, so attendance validity (attendance_inputs,
--    which attendance_input_context returns) and the live presentation can
--    merge. Earlier snapshots carry no times; no timers could overlap then,
--    so their plain sum is already the merged figure.
-- 4. attendance_inputs (21) and policy_period_facts (58, patched by 72) use
--    the merged hours instead of sum(hours_worked).
--
-- Functions are patched from their live definitions; each fragment must occur
-- exactly once. No scoring formula, award or permission change.
-- ===========================================================================
BEGIN;

CREATE FUNCTION pg_temp.m118_patch(fn regprocedure, frag text, repl text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(fn);
BEGIN
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION '% does not contain this fragment exactly once; update migration 118: %',fn,left(frag,80); END IF;
 EXECUTE replace(def,frag,repl);
END $$;

-- 1. One running timer per person per mission --------------------------------
DROP INDEX public.idx_task_timers_one_running_per_user;
CREATE UNIQUE INDEX idx_task_timers_one_running_per_mission ON public.task_timers(user_id,task_id)
 WHERE status='Running' AND NOT recorded_offline;

SELECT pg_temp.m118_patch('public.record_offline_timer(uuid,uuid,timestamptz,timestamptz,uuid,uuid,text)',
 $f$ IF EXISTS(SELECT 1 FROM public.task_timers x WHERE x.user_id=actor AND x.status='Running' AND x.started_at<end_at) THEN
  RAISE EXCEPTION 'This offline timer overlaps your timer still running on the server; stop that timer first' USING ERRCODE='PT409'; END IF;
$f$,
 $f$ -- Several timers may run at once (migration 118); the day's hours merge overlaps.
$f$);

-- 2. Merged hours ----------------------------------------------------------------
CREATE FUNCTION taskpulse_private.overlap_hours(p_segments tstzrange[]) RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
 SELECT coalesce(
  (SELECT sum(extract(epoch FROM upper(r)-lower(r))) FROM unnest(p_segments) r WHERE NOT isempty(r))
  -(SELECT sum(extract(epoch FROM upper(m)-lower(m)))
    FROM unnest((SELECT range_agg(r) FROM unnest(p_segments) r WHERE NOT isempty(r))) m),0)/3600
$$;
COMMENT ON FUNCTION taskpulse_private.overlap_hours(tstzrange[]) IS
 'Hours counted more than once by overlapping timer segments (migration 118). Merged hours = sum(hours_worked) - overlap_hours(segments).';

-- Invoker rights: callers (server jobs, tests) read through their own access.
CREATE FUNCTION taskpulse_private.member_day_hours(p_user uuid,p_date date) RETURNS numeric
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(sum(l.hours_worked)-taskpulse_private.overlap_hours(
   array_agg(tstzrange(l.timer_segment_start,l.timer_segment_end,'[)')) FILTER (WHERE l.timer_segment_start IS NOT NULL)),0)
 FROM public.daily_task_logs l
 WHERE l.user_id=p_user AND l.log_date=p_date AND l.reversed_at IS NULL
$$;
COMMENT ON FUNCTION taskpulse_private.member_day_hours(uuid,date) IS
 'A member''s productive hours on a day: timer segments merged (overlaps counted once) plus manual and imported hours as entered (migration 118).';
REVOKE ALL ON FUNCTION taskpulse_private.overlap_hours(tstzrange[]),taskpulse_private.member_day_hours(uuid,date) FROM PUBLIC,anon,authenticated,service_role;

-- 3. Effort snapshots carry the segment times ------------------------------------
SELECT pg_temp.m118_patch('taskpulse_private.capture_effort_input()',
 $f$'source_timer_id',NEW.source_timer_id,'segment_number',NEW.timer_segment_number));$f$,
 $f$'source_timer_id',NEW.source_timer_id,'segment_number',NEW.timer_segment_number,
 'timer_segment_start',NEW.timer_segment_start,'timer_segment_end',NEW.timer_segment_end));$f$);

-- 4. Daily totals use the merged hours -------------------------------------------
SELECT pg_temp.m118_patch('taskpulse_private.attendance_inputs(uuid,date,date,timestamptz)',
 $f$THEN sum((source->>'hours_worked')::numeric) END hours,$f$,
 $f$THEN sum((source->>'hours_worked')::numeric)-taskpulse_private.overlap_hours(
    array_agg(tstzrange((source->>'timer_segment_start')::timestamptz,(source->>'timer_segment_end')::timestamptz,'[)'))
     FILTER (WHERE source->>'timer_segment_start' IS NOT NULL AND source->>'timer_segment_end' IS NOT NULL)) END hours,$f$);

DO $$ BEGIN
 -- Absent only where 56/58 are applied later (the policies upgrade test); they bring their own facts.
 IF to_regprocedure('public.policy_period_facts(date,date,uuid)') IS NULL THEN RETURN; END IF;
 PERFORM pg_temp.m118_patch('public.policy_period_facts(date,date,uuid)',
  $f$SELECT l.user_id,l.log_date AS day,sum(l.hours_worked) AS hours FROM public.daily_task_logs l$f$,
  $f$SELECT l.user_id,l.log_date AS day,sum(l.hours_worked)-taskpulse_private.overlap_hours(
    array_agg(tstzrange(l.timer_segment_start,l.timer_segment_end,'[)')) FILTER (WHERE l.timer_segment_start IS NOT NULL)) AS hours
   FROM public.daily_task_logs l$f$);
END $$;

COMMIT;
SELECT taskpulse_private.m15_secure();
