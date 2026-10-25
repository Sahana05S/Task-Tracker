-- ===========================================================================
-- TaskPulse - live month reads cover the days that have ended (forward only)
--
-- User decision (DECISIONS "Last recorded data instead of warnings",
-- 25 October 2026): pages show the last recorded data, never "not available"
-- because today's attendance is not in yet. Live current-month reads now ask
-- for the month's first day up to today (exclusive), read now, so today's
-- unfinished day never makes a score, ranking or award "unavailable"
-- (shared/time/period.ts liveWindowEnd).
--
-- performance_source_context lets members (not only managers and workers)
-- read that window: it is the same canonical monthly aggregate, ending at
-- yesterday instead of today. Every other window keeps its rule; detailed and
-- daily windows still need manager or service authority.
-- ===========================================================================
BEGIN;

DO $$
DECLARE def text; fn regprocedure:='public.performance_source_context(date,date,timestamptz)'::regprocedure;
 frag text:='   (p_as_of AT TIME ZONE ''Asia/Kolkata'')::date<>least(p_to_exclusive-1,(clock_timestamp() AT TIME ZONE ''Asia/Kolkata'')::date)) THEN';
 repl text:='   (p_as_of AT TIME ZONE ''Asia/Kolkata'')::date<>least(p_to_exclusive-1,(clock_timestamp() AT TIME ZONE ''Asia/Kolkata'')::date))
  -- Migration 76: the current month through yesterday, read today, is also a canonical aggregate.
  AND NOT (p_from=date_trunc(''month'',p_from)::date AND p_to_exclusive=(clock_timestamp() AT TIME ZONE ''Asia/Kolkata'')::date
   AND p_to_exclusive>p_from AND p_to_exclusive<=(p_from+interval ''1 month'')::date
   AND (p_as_of AT TIME ZONE ''Asia/Kolkata'')::date=(clock_timestamp() AT TIME ZONE ''Asia/Kolkata'')::date) THEN'; BEGIN
 def:=pg_catalog.pg_get_functiondef(fn);
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION 'performance_source_context no longer has exactly one "%"; update migration 76',frag; END IF;
 EXECUTE replace(def,frag,repl);
END $$;

COMMIT;
SELECT taskpulse_private.m15_secure();
