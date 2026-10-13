-- M02: truthful execution aggregates and prospective current-credit balances.
BEGIN;
CREATE OR REPLACE FUNCTION public.team_summary_inputs(p_year integer,p_month integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE first_day date; last_day date; result jsonb; BEGIN
 IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_year IS NULL OR p_year NOT BETWEEN 2026 AND 9999 OR p_month IS NULL OR p_month NOT BETWEEN 1 AND 12 THEN
  RAISE EXCEPTION 'Calendar month required' USING ERRCODE='23514'; END IF;
 first_day:=make_date(p_year,p_month,1); last_day:=(first_day+interval '1 month')::date;
 SELECT jsonb_build_object(
 'logs',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT user_id,task_id,
   sum(hours_worked) hours_worked,
   sum(CASE WHEN effective_progress_delta IS NOT NULL THEN effective_progress_delta
    WHEN coalesce(progress_delta,0)=0 THEN 0 END) progress_delta,
   bool_or(effective_progress_delta IS NULL AND coalesce(progress_delta,0)<>0) effect_unknown,
   credit_shares,credit_scale FROM public.daily_task_logs
   WHERE reversed_at IS NULL AND log_date>=first_day AND log_date<last_day GROUP BY user_id,task_id,credit_shares,credit_scale) s),'[]'::jsonb),
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
CREATE OR REPLACE FUNCTION public.task_effort_summary(p_task_id uuid)
RETURNS TABLE(hours_logged numeric,log_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
 IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT coalesce(sum(hours_worked),0),count(*) FROM public.daily_task_logs WHERE task_id=p_task_id AND reversed_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.task_effort_summary(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.task_effort_summary(uuid) TO authenticated;
CREATE FUNCTION public.task_credit_summary() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE result jsonb; BEGIN
 IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('task_id',task_id,'user_id',user_id,'scaled_credit',scaled_credit)),'[]')
  INTO result FROM taskpulse_private.task_credit_balances;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.task_credit_summary() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.task_credit_summary() TO authenticated;
CREATE FUNCTION public.team_task_effort_totals() RETURNS TABLE(task_id uuid,hours_logged numeric,log_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT l.task_id,sum(l.hours_worked),count(*) FROM public.daily_task_logs l WHERE l.reversed_at IS NULL GROUP BY l.task_id;
END $$;
REVOKE ALL ON FUNCTION public.team_task_effort_totals() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.team_task_effort_totals() TO authenticated;
COMMIT;
