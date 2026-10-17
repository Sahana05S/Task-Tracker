-- ===========================================================================
-- TaskPulse - M14 task effort breakdown (forward only, after 35)
--
-- Logs are readable only by their author and managers (m01_read), so a member
-- summing visible logs would see only their own share. Task totals already come
-- from the SECURITY DEFINER aggregate task_effort_summary. This adds the same
-- kind of aggregate for two sheet figures:
--   * hours worked today on the task (Asia/Kolkata business date), and
--   * logged seconds per checklist item (item timers, migration 34).
-- Only totals are returned, never per-person rows, so it exposes no more than
-- task_effort_summary already does. Reversed logs are excluded.
-- ===========================================================================

CREATE FUNCTION public.task_effort_breakdown(p_task_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE today date:=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date; BEGIN
 IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
  'today',today,
  'today_hours',(SELECT coalesce(sum(l.hours_worked),0) FROM public.daily_task_logs l WHERE l.task_id=p_task_id AND l.reversed_at IS NULL AND l.log_date=today),
  'by_node',(SELECT coalesce(jsonb_object_agg(x.checklist_node_id,x.seconds),'{}'::jsonb) FROM (
    SELECT l.checklist_node_id,round(sum(l.hours_worked)*3600)::bigint AS seconds FROM public.daily_task_logs l
    WHERE l.task_id=p_task_id AND l.reversed_at IS NULL AND l.checklist_node_id IS NOT NULL GROUP BY l.checklist_node_id) x));
END $$;
REVOKE ALL ON FUNCTION public.task_effort_breakdown(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.task_effort_breakdown(uuid) TO authenticated;
