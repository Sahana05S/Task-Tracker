-- Compares migration 88's attendance_inputs with the deployed one for every
-- member on the demo data, inside a transaction that is rolled back. Prints
-- only counts of equal and different results and timings; no rows.
\pset pager off
BEGIN;
SET LOCAL statement_timeout = '180s';
CREATE FUNCTION pg_temp.attendance_new(p_user uuid,p_from date,p_to_exclusive date,p_as_of timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE cutoff timestamptz;days jsonb;known boolean;ready boolean;period_valid boolean;reasons jsonb; BEGIN
 IF p_from IS NULL OR p_to_exclusive IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to_exclusive) OR p_to_exclusive<=p_from OR p_to_exclusive-p_from>366 OR p_as_of IS NULL OR NOT isfinite(p_as_of) OR p_as_of>clock_timestamp() THEN RAISE EXCEPTION 'Explicit valid period and nonfuture as-of instant required' USING ERRCODE='23514'; END IF;
 SELECT available_from INTO cutoff FROM taskpulse_private.input_contract;known:=p_as_of>=cutoff;
 -- Migration 88: the latest version of each record is found from its keys (the
 -- m06_input_history_lookup index); only those versions' sources are read.
 WITH keys AS (
  SELECT DISTINCT ON(kind,record_id) sequence FROM taskpulse_private.input_history
  WHERE kind IN ('attendance','effort') AND recorded_at<=p_as_of ORDER BY kind,record_id,recorded_at DESC,sequence DESC
 ), snapshots AS (
  SELECT h.kind,h.record_id,h.record_version,h.source FROM keys k JOIN taskpulse_private.input_history h ON h.sequence=k.sequence
 ), attendance AS (
  SELECT record_id,record_version,source FROM snapshots WHERE kind='attendance' AND source->>'user_id'=p_user::text AND source->>'record_state'<>'withdrawn'
 ), effort AS (
  SELECT (source->>'log_date')::date work_date,
   CASE WHEN bool_and((source->>'hours_worked')::numeric>=0 AND (source->>'hours_worked')::numeric<'Infinity'::numeric) THEN sum((source->>'hours_worked')::numeric) END hours,
   bool_and((source->>'hours_worked')::numeric>=0 AND (source->>'hours_worked')::numeric<'Infinity'::numeric) hours_valid,
   jsonb_agg(jsonb_build_object('id',record_id,'version',record_version,'taskId',source->>'task_id','timerId',source->>'source_timer_id','segmentNumber',source->'segment_number') ORDER BY record_id) ids
  FROM snapshots WHERE kind='effort' AND source->>'user_id'=p_user::text AND source->>'reversed_at' IS NULL GROUP BY 1
 ), inputs AS (
  SELECT d.day::date business_date,a.record_id,a.record_version,a.source->>'status' status,
   CASE WHEN known AND (a.source->>'hours_confirmed')::boolean THEN (a.source->>'attendance_hours')::numeric END regular,
   CASE WHEN known AND (a.source->>'hours_confirmed')::boolean THEN (a.source->>'off_hours')::numeric END off_hours,
   CASE WHEN known THEN CASE WHEN e.hours_valid=false THEN NULL ELSE coalesce(e.hours,0) END END logged,
   coalesce(e.ids,'[]') ids,
   array_remove(ARRAY[CASE WHEN NOT known THEN 'history_before_input_baseline' END,
    CASE WHEN a.record_id IS NULL THEN 'attendance_missing' WHEN NOT (a.source->>'hours_confirmed')::boolean THEN 'legacy_hours_unconfirmed' END,
    CASE WHEN e.hours_valid=false THEN 'effort_hours_invalid' END],NULL) input_reasons
  FROM generate_series(p_from::timestamp,least(p_to_exclusive-1,(p_as_of AT TIME ZONE 'Asia/Kolkata')::date)::timestamp,interval '1 day') d(day)
  LEFT JOIN attendance a ON (a.source->>'attendance_date')::date=d.day::date LEFT JOIN effort e ON e.work_date=d.day::date
 ), checked AS (
  SELECT *,regular BETWEEN 0 AND 24 AND off_hours BETWEEN 0 AND 24 AND regular+off_hours<=24 numeric_ok,
   CASE WHEN status IN ('Absent','Leave') THEN regular=0 AND off_hours=0
    WHEN status IN ('Holiday','Off Hours') THEN regular=0
    WHEN status IN ('Present','Half Day') THEN true ELSE false END state_ok
  FROM inputs
 ), evaluated AS (
  SELECT *,cardinality(input_reasons)=0 AND coalesce(numeric_ok,false) AND logged IS NOT NULL available,
   input_reasons||array_remove(ARRAY[CASE WHEN regular IS NOT NULL AND NOT numeric_ok THEN 'attendance_hours_invalid' END,
    CASE WHEN numeric_ok AND NOT state_ok THEN 'attendance_state_hours_incompatible' END,
    CASE WHEN numeric_ok AND state_ok AND logged>regular+off_hours THEN 'effort_exceeds_attendance_capacity' END],NULL) all_reasons
  FROM checked
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('businessDate',business_date,'attendanceId',record_id,'attendanceVersion',record_version,'status',status,
  'attendanceHours',regular::text,'offHours',off_hours::text,'capacityHours',CASE WHEN numeric_ok AND state_ok THEN (regular+off_hours)::text END,'effortHours',logged::text,
  'effortSources',ids,'available',available,'valid',CASE WHEN available THEN state_ok AND logged<=regular+off_hours END,'reasons',all_reasons) ORDER BY business_date),'[]') INTO days FROM evaluated;
 SELECT count(*)>0 AND bool_and((d->>'available')::boolean),bool_and((d->>'valid')::boolean) INTO ready,period_valid FROM jsonb_array_elements(days) d;
 SELECT coalesce(jsonb_agg(reason ORDER BY reason),'[]') INTO reasons FROM (SELECT DISTINCT jsonb_array_elements_text(d->'reasons') reason FROM jsonb_array_elements(days) d) r;
 IF jsonb_array_length(days)=0 THEN reasons:=jsonb_build_array('no_elapsed_days'); END IF;
 RETURN jsonb_build_object('ruleVersion','m06-attendance-inputs-v2','userId',p_user,'periodStart',p_from,'periodEndExclusive',p_to_exclusive,'asOf',p_as_of,
  'historyAvailableFrom',cutoff,'historyAvailable',known,'validityAvailable',ready,'valid',CASE WHEN ready THEN period_valid END,'reasons',reasons,'days',days);
END $$;

\echo '== every member, this month to today, read now'
SELECT count(*) AS members,
       count(*) FILTER (WHERE taskpulse_private.attendance_inputs(u.id,date_trunc('month',now())::date,current_date,now()) = pg_temp.attendance_new(u.id,date_trunc('month',now())::date,current_date,now())) AS same
 FROM public.users u;
\echo '== every member, last month, read now'
SELECT count(*) AS members,
       count(*) FILTER (WHERE taskpulse_private.attendance_inputs(u.id,(date_trunc('month',now())::date-interval '1 month')::date,date_trunc('month',now())::date,now()) = pg_temp.attendance_new(u.id,(date_trunc('month',now())::date-interval '1 month')::date,date_trunc('month',now())::date,now())) AS same
 FROM public.users u;
\echo '== every member, this month, read at the third day'
SELECT count(*) AS members,
       count(*) FILTER (WHERE taskpulse_private.attendance_inputs(u.id,date_trunc('month',now())::date,current_date,date_trunc('month',now())::date+interval '3 days') = pg_temp.attendance_new(u.id,date_trunc('month',now())::date,current_date,date_trunc('month',now())::date+interval '3 days')) AS same
 FROM public.users u;
\echo '== where they differ, does sorting the work-log ids explain it'
SELECT count(*) FILTER (WHERE taskpulse_private.attendance_inputs(u.id,date_trunc('month',now())::date,current_date,now()) <> pg_temp.attendance_new(u.id,date_trunc('month',now())::date,current_date,now())) AS differ
 FROM public.users u;
\echo '== time, deployed, every member'
EXPLAIN (ANALYZE, COSTS OFF) SELECT count(taskpulse_private.attendance_inputs(u.id,date_trunc('month',now())::date,current_date,now())) FROM public.users u;
\echo '== time, migration 88, every member'
EXPLAIN (ANALYZE, COSTS OFF) SELECT count(pg_temp.attendance_new(u.id,date_trunc('month',now())::date,current_date,now())) FROM public.users u;
\echo '== input history size'
SELECT kind, count(*) AS versions, count(DISTINCT record_id) AS records FROM taskpulse_private.input_history GROUP BY 1 ORDER BY 2 DESC;
ROLLBACK;
