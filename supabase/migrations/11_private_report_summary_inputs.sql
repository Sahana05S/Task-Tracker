-- M01: monthly aggregate inputs, never raw notes, dates, check times or payloads.
BEGIN;
CREATE FUNCTION public.team_summary_inputs(p_year integer,p_month integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE first_day date; last_day date; result jsonb; BEGIN
 IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_year IS NULL OR p_year NOT BETWEEN 2026 AND 9999 OR p_month IS NULL OR p_month NOT BETWEEN 1 AND 12 THEN
  RAISE EXCEPTION 'Calendar month required' USING ERRCODE='23514'; END IF;
 first_day:=make_date(p_year,p_month,1); last_day:=(first_day+interval '1 month')::date;
 SELECT jsonb_build_object(
 'logs',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT user_id,task_id,
   sum(hours_worked) hours_worked,sum(progress_delta) progress_delta FROM public.daily_task_logs
   WHERE log_date>=first_day AND log_date<last_day GROUP BY user_id,task_id) s),'[]'::jsonb),
 'attendance',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT user_id,status,count(*) record_count,
   sum(attendance_hours) attendance_hours,sum(off_hours) off_hours FROM public.attendance_records
   WHERE attendance_date>=first_day AND attendance_date<last_day GROUP BY user_id,status) s),'[]'::jsonb),
 'report_counts',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT employee_id,count(*) report_count
   FROM public.report_snapshots GROUP BY employee_id) s),'[]'::jsonb),
 'report_summary',(SELECT jsonb_build_object('total',count(*),'final',count(*) FILTER(WHERE status='Final'),
   'draft',count(*) FILTER(WHERE status='Draft'),'employeeReports',count(*) FILTER(WHERE employee_id IS NOT NULL),
   'generalReports',count(*) FILTER(WHERE employee_id IS NULL)) FROM public.report_snapshots
   WHERE (period_start IS NULL OR period_start<last_day) AND (period_end IS NULL OR period_end>=first_day))
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.team_summary_inputs(integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.team_summary_inputs(integer,integer) TO authenticated;
CREATE FUNCTION public.task_effort_summary(p_task_id uuid)
RETURNS TABLE(hours_logged numeric,log_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
 IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT coalesce(sum(hours_worked),0),count(*) FROM public.daily_task_logs WHERE task_id=p_task_id;
END $$;
REVOKE ALL ON FUNCTION public.task_effort_summary(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.task_effort_summary(uuid) TO authenticated;
COMMIT;
