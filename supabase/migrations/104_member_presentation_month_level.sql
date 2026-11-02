-- 104: team members see team figures at month level only (security audit, 2 November 2026).
--
-- live_presentation_context (82/87) returned the team-wide performance sources for any
-- window of up to 62 days and any past as-of, to every active role. Its private source
-- reader (28) was copied from performance_source_context without the rule that team
-- members read team inputs only for canonical month windows (21, widened by 76), so a
-- member could ask for a single past day and read every colleague's attendance hours,
-- which attendance_records RLS and attendance_input_context refuse. The user chose
-- "month level only": for a team member, any other window or as-of now carries no
-- attendance figures and no hours for missions the member is not on, and the per-day
-- series (the profile charts) is returned to managers only. Managers are unchanged.
--
-- Rewritten from the live definition at 103 (pg_get_functiondef). Function only; no
-- data is changed. m15_secure() runs inside the transaction, so a failed securing step
-- also leaves no ledger row.

BEGIN;

CREATE OR REPLACE FUNCTION public.live_presentation_context(p_from date, p_to_exclusive date, p_as_of timestamp with time zone, p_employee uuid DEFAULT NULL::uuid, p_series boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE role text:=public.get_user_role();sources jsonb;cutoff timestamptz;known boolean;tasks jsonb;checklists jsonb;assets jsonb;relations jsonb;logs jsonb;contributions jsonb;attendance jsonb;series jsonb;detail_user uuid;watermark text;task_ids text[];employee_tasks text[];BEGIN
 IF role IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'Active authenticated viewer required' USING ERRCODE='42501';END IF;
 IF p_employee IS NOT NULL AND NOT public.can_read_employee_details(p_employee) THEN RAISE EXCEPTION 'Employee/manager detail access required' USING ERRCODE='42501';END IF;
 IF p_employee IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_employee) THEN RAISE EXCEPTION 'Employee required' USING ERRCODE='23514';END IF;
 IF p_from IS NULL OR p_to_exclusive IS NULL OR p_to_exclusive<=p_from OR p_to_exclusive-p_from>62 OR p_as_of IS NULL OR p_as_of>clock_timestamp() OR NOT isfinite(p_as_of) THEN RAISE EXCEPTION 'Bounded nonfuture live context required' USING ERRCODE='23514';END IF;
 sources:=taskpulse_private.presentation_performance_sources(p_from,p_to_exclusive,p_as_of);
 -- Migration 104: a team member sees team figures only at month level: the whole month read once it has ended,
 -- or this month through yesterday read today (the windows 21 and 76 allow). For any other window or as-of,
 -- nobody's attendance or other people's mission hours are returned; both come from records members may not
 -- read (attendance_records, daily_task_logs), and a one-day window would otherwise show them day by day.
 IF role NOT IN ('managing_director','project_engineer') AND NOT (
  p_from=date_trunc('month',p_from)::date AND (
   (p_to_exclusive=(p_from+interval '1 month')::date AND (p_as_of AT TIME ZONE 'Asia/Kolkata')::date>=p_to_exclusive-1)
   OR (p_to_exclusive=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date AND p_to_exclusive>p_from
       AND p_to_exclusive<=(p_from+interval '1 month')::date
       AND (p_as_of AT TIME ZONE 'Asia/Kolkata')::date=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date))) THEN
  sources:=sources||jsonb_build_object(
   'attendance',coalesce((SELECT jsonb_agg(a||'{"hours":null,"offHours":null,"available":false,"valid":null,"reasons":["team_month_level_only"]}'::jsonb)
     FROM jsonb_array_elements(sources->'attendance') a),'[]'::jsonb),
   'tasks',coalesce((SELECT jsonb_agg(CASE WHEN coalesce(t->'participants','[]'::jsonb)?auth.uid()::text THEN t ELSE t||'{"taskHours":null}'::jsonb END)
     FROM jsonb_array_elements(sources->'tasks') t),'[]'::jsonb));
 END IF;
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
 -- The per-day series is a run of day-by-day team figures, so only managers receive it (migration 104).
 SELECT coalesce(jsonb_agg(jsonb_build_object('date',day::date,'sources',taskpulse_private.presentation_performance_sources(p_from,day::date+1,least(p_as_of,((day::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata')-interval '1 millisecond'))) ORDER BY day),'[]') INTO series
 FROM generate_series(p_from::timestamp,least(p_to_exclusive-1,(p_as_of AT TIME ZONE 'Asia/Kolkata')::date)::timestamp,interval '1 day') day WHERE p_employee IS NOT NULL AND p_series AND role IN ('managing_director','project_engineer');
 SELECT coalesce(max(sequence),0)::text INTO watermark FROM taskpulse_private.presentation_history WHERE recorded_at<=p_as_of;
 RETURN jsonb_build_object('contract','m11-live-presentation-v1','sources',sources,'presentationAvailable',known,'presentationAvailableFrom',cutoff,'presentationWatermark',watermark,
 'scope',CASE WHEN p_employee IS NOT NULL THEN 'employee_detail' WHEN detail_user IS NULL THEN 'manager_team_detail' ELSE 'team_summary_with_own_details' END,'detailUserId',detail_user,
 'tasks',tasks,'checklists',checklists,'assets',assets,'relations',relations,'logs',logs,'contributions',contributions,'attendance',attendance,'series',series);
END $function$;

SELECT taskpulse_private.m15_secure();
COMMIT;
