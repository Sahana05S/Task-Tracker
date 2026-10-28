-- Compares migration 87's live_presentation_context with the deployed one on
-- the demo data, inside a transaction that is rolled back. Prints only
-- whether the results are equal, their sizes and timings; no rows.
\pset pager off
BEGIN;
SET LOCAL statement_timeout = '180s';
CREATE FUNCTION pg_temp.live_new(p_from date,p_to_exclusive date,p_as_of timestamptz,p_employee uuid DEFAULT NULL,p_series boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE role text:=public.get_user_role();sources jsonb;cutoff timestamptz;known boolean;tasks jsonb;checklists jsonb;assets jsonb;relations jsonb;logs jsonb;contributions jsonb;attendance jsonb;series jsonb;detail_user uuid;watermark text;task_ids text[];employee_tasks text[];BEGIN
 IF role IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'Active authenticated viewer required' USING ERRCODE='42501';END IF;
 IF p_employee IS NOT NULL AND NOT public.can_read_employee_details(p_employee) THEN RAISE EXCEPTION 'Employee/manager detail access required' USING ERRCODE='42501';END IF;
 IF p_employee IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_employee) THEN RAISE EXCEPTION 'Employee required' USING ERRCODE='23514';END IF;
 IF p_from IS NULL OR p_to_exclusive IS NULL OR p_to_exclusive<=p_from OR p_to_exclusive-p_from>62 OR p_as_of IS NULL OR p_as_of>clock_timestamp() OR NOT isfinite(p_as_of) THEN RAISE EXCEPTION 'Bounded nonfuture live context required' USING ERRCODE='23514';END IF;
 sources:=taskpulse_private.presentation_performance_sources(p_from,p_to_exclusive,p_as_of);
 SELECT available_from INTO cutoff FROM taskpulse_private.presentation_contract;known:=p_as_of>=cutoff;
 detail_user:=CASE WHEN p_employee IS NOT NULL THEN p_employee WHEN role IN ('managing_director','project_engineer') THEN NULL ELSE auth.uid() END;
 -- Migration 87: the employee's missions are listed once, not re-read for every history row.
 IF p_employee IS NOT NULL THEN
  SELECT coalesce(array_agg(s->>'id'),'{}') INTO employee_tasks FROM jsonb_array_elements(sources->'tasks') s
   WHERE s->'participants'?p_employee::text OR s->'periodCredits'?p_employee::text;
 END IF;
 -- Latest version of each row found by its keys first; only those rows' sources are read.
 WITH keys AS(SELECT DISTINCT ON(kind,row_id) sequence FROM taskpulse_private.presentation_history WHERE recorded_at<=p_as_of ORDER BY kind,row_id,recorded_at DESC,sequence DESC),
 latest AS(SELECT h.kind,h.row_id,h.task_id,h.sequence,h.source FROM keys k JOIN taskpulse_private.presentation_history h ON h.sequence=k.sequence),selected AS(
 SELECT t.* FROM latest t WHERE kind='tasks' AND coalesce(source->>'deleted','false')='false' AND
 (p_employee IS NULL OR t.row_id::text=ANY(employee_tasks))
 ) SELECT coalesce(jsonb_agg(source ORDER BY row_id),'[]'),coalesce(array_agg(source->>'id'),'{}') INTO tasks,task_ids FROM selected WHERE known;
 WITH keys AS(SELECT DISTINCT ON(kind,row_id) sequence FROM taskpulse_private.presentation_history WHERE recorded_at<=p_as_of ORDER BY kind,row_id,recorded_at DESC,sequence DESC),
 latest AS(SELECT h.kind,h.row_id,h.task_id,h.source FROM keys k JOIN taskpulse_private.presentation_history h ON h.sequence=k.sequence)
 SELECT coalesce(jsonb_agg(source||jsonb_build_object('taskId',task_id) ORDER BY row_id) FILTER(WHERE kind='checklist'),'[]'),
 coalesce(jsonb_agg(source ORDER BY row_id) FILTER(WHERE kind='task_links' AND (source->>'related_report_id' IS NULL OR EXISTS(SELECT 1 FROM public.report_snapshots r WHERE r.id=(source->>'related_report_id')::uuid AND public.can_read_employee_details(r.employee_id)))),'[]'),
 coalesce(jsonb_agg(source ORDER BY row_id) FILTER(WHERE kind='task_dependencies'),'[]') INTO checklists,assets,relations
 FROM latest WHERE known AND coalesce(source->>'deleted','false')='false' AND task_id::text=ANY(task_ids);
 WITH latest AS(SELECT DISTINCT ON(kind,record_id) kind,record_id,source FROM taskpulse_private.input_history WHERE recorded_at<=p_as_of ORDER BY kind,record_id,recorded_at DESC,sequence DESC)
 SELECT coalesce(jsonb_agg(source) FILTER(WHERE kind='effort' AND source->>'reversed_at' IS NULL AND (detail_user IS NULL OR source->>'user_id'=detail_user::text) AND (source->>'log_date')::date>=p_from AND (source->>'log_date')::date<p_to_exclusive AND (source->>'log_date')::date<=(p_as_of AT TIME ZONE 'Asia/Kolkata')::date),'[]'),
 coalesce(jsonb_agg(jsonb_build_object('kind',kind,'source',source)) FILTER(WHERE kind IN ('fact','idea','suggestion','sale','meeting') AND (detail_user IS NULL OR source->>CASE WHEN kind='sale' THEN 'sales_by' WHEN kind='meeting' THEN 'posted_by' ELSE 'posted_by' END=detail_user::text) AND
 (source->>CASE kind WHEN 'fact' THEN 'fact_date' WHEN 'idea' THEN 'idea_date' WHEN 'suggestion' THEN 'suggestion_date' WHEN 'sale' THEN 'sale_date' ELSE 'meeting_date' END)::date>=p_from AND
 (source->>CASE kind WHEN 'fact' THEN 'fact_date' WHEN 'idea' THEN 'idea_date' WHEN 'suggestion' THEN 'suggestion_date' WHEN 'sale' THEN 'sale_date' ELSE 'meeting_date' END)::date<least(p_to_exclusive,(p_as_of AT TIME ZONE 'Asia/Kolkata')::date+1)),'[]') INTO logs,contributions FROM latest;
 SELECT coalesce(jsonb_agg(taskpulse_private.attendance_inputs(u.id,p_from,p_to_exclusive,p_as_of)),'[]') INTO attendance FROM public.users u WHERE (detail_user IS NULL OR u.id=detail_user) AND (u.is_active OR u.id=p_employee);
 SELECT coalesce(jsonb_agg(jsonb_build_object('date',day::date,'sources',taskpulse_private.presentation_performance_sources(p_from,day::date+1,least(p_as_of,((day::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata')-interval '1 millisecond'))) ORDER BY day),'[]') INTO series
 FROM generate_series(p_from::timestamp,least(p_to_exclusive-1,(p_as_of AT TIME ZONE 'Asia/Kolkata')::date)::timestamp,interval '1 day') day WHERE p_employee IS NOT NULL AND p_series;
 SELECT coalesce(max(sequence),0)::text INTO watermark FROM taskpulse_private.presentation_history WHERE recorded_at<=p_as_of;
 RETURN jsonb_build_object('contract','m11-live-presentation-v1','sources',sources,'presentationAvailable',known,'presentationAvailableFrom',cutoff,'presentationWatermark',watermark,
 'scope',CASE WHEN p_employee IS NOT NULL THEN 'employee_detail' WHEN detail_user IS NULL THEN 'manager_team_detail' ELSE 'team_summary_with_own_details' END,'detailUserId',detail_user,
 'tasks',tasks,'checklists',checklists,'assets',assets,'relations',relations,'logs',logs,'contributions',contributions,'attendance',attendance,'series',series);
END $$;

\echo '== director, whole team'
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM public.users WHERE role='managing_director' AND is_active ORDER BY created_at LIMIT 1), 'role','authenticated')::text, true) IS NOT NULL AS acting;
SELECT public.live_presentation_context(date_trunc('month',now())::date, current_date, now(), NULL, false) = pg_temp.live_new(date_trunc('month',now())::date, current_date, now(), NULL, false) AS same,
       octet_length(public.live_presentation_context(date_trunc('month',now())::date, current_date, now(), NULL, false)::text) AS bytes;
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) SELECT public.live_presentation_context(date_trunc('month',now())::date, current_date, now(), NULL, false);
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) SELECT pg_temp.live_new(date_trunc('month',now())::date, current_date, now(), NULL, false);

\echo '== director, one member'
SELECT public.live_presentation_context(date_trunc('month',now())::date, current_date, now(), (SELECT u.id FROM public.users u JOIN public.task_assignees a ON a.user_id=u.id WHERE u.role NOT IN ('managing_director','project_engineer') AND u.is_active GROUP BY u.id ORDER BY count(*) DESC LIMIT 1), false) = pg_temp.live_new(date_trunc('month',now())::date, current_date, now(), (SELECT u.id FROM public.users u JOIN public.task_assignees a ON a.user_id=u.id WHERE u.role NOT IN ('managing_director','project_engineer') AND u.is_active GROUP BY u.id ORDER BY count(*) DESC LIMIT 1), false) AS same,
       octet_length(public.live_presentation_context(date_trunc('month',now())::date, current_date, now(), (SELECT u.id FROM public.users u JOIN public.task_assignees a ON a.user_id=u.id WHERE u.role NOT IN ('managing_director','project_engineer') AND u.is_active GROUP BY u.id ORDER BY count(*) DESC LIMIT 1), false)::text) AS bytes;
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) SELECT public.live_presentation_context(date_trunc('month',now())::date, current_date, now(), (SELECT u.id FROM public.users u JOIN public.task_assignees a ON a.user_id=u.id WHERE u.role NOT IN ('managing_director','project_engineer') AND u.is_active GROUP BY u.id ORDER BY count(*) DESC LIMIT 1), false);
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) SELECT pg_temp.live_new(date_trunc('month',now())::date, current_date, now(), (SELECT u.id FROM public.users u JOIN public.task_assignees a ON a.user_id=u.id WHERE u.role NOT IN ('managing_director','project_engineer') AND u.is_active GROUP BY u.id ORDER BY count(*) DESC LIMIT 1), false);

\echo '== earlier as-of (third day of the month), director'
SELECT public.live_presentation_context(date_trunc('month',now())::date, current_date, date_trunc('month',now())+interval '3 days', NULL, false) = pg_temp.live_new(date_trunc('month',now())::date, current_date, date_trunc('month',now())+interval '3 days', NULL, false) AS same;

\echo '== member, own view'
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT u.id FROM public.users u JOIN public.task_assignees a ON a.user_id=u.id WHERE u.role NOT IN ('managing_director','project_engineer') AND u.is_active GROUP BY u.id ORDER BY count(*) DESC LIMIT 1), 'role','authenticated')::text, true) IS NOT NULL AS acting;
SELECT public.live_presentation_context(date_trunc('month',now())::date, current_date, now(), NULL, false) = pg_temp.live_new(date_trunc('month',now())::date, current_date, now(), NULL, false) AS same;
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) SELECT public.live_presentation_context(date_trunc('month',now())::date, current_date, now(), NULL, false);
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) SELECT pg_temp.live_new(date_trunc('month',now())::date, current_date, now(), NULL, false);
ROLLBACK;
