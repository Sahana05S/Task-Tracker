-- Read-only preflight, compatible with migration 07+ (including pre-12 duplicates).
-- Run only in the explicitly selected environment; this file changes no data.
DO $$ DECLARE owner_name name; BEGIN
 SELECT pg_get_userbyid(relowner) INTO owner_name FROM pg_class WHERE oid='public.daily_task_logs'::regclass;
 IF current_user<>owner_name AND public.get_user_role() IS DISTINCT FROM 'managing_director'::public.user_role AND public.get_user_role() IS DISTINCT FROM 'project_engineer'::public.user_role THEN
  RAISE EXCEPTION 'Full manager/owner source access is required; an employee RLS subset cannot certify reconciliation' USING ERRCODE='42501'; END IF;
END $$;
WITH duplicate_links AS (
 SELECT source_timer_id,count(*) AS link_count,array_agg(id ORDER BY id) AS log_ids
 FROM public.daily_task_logs WHERE source_timer_id IS NOT NULL
 GROUP BY source_timer_id HAVING
  count(*) FILTER(WHERE to_jsonb(daily_task_logs)->>'timer_segment_number' IS NULL)>1
  OR (count(*) FILTER(WHERE to_jsonb(daily_task_logs)->>'timer_segment_number' IS NULL)>0 AND count(*) FILTER(WHERE to_jsonb(daily_task_logs)->>'timer_segment_number' IS NOT NULL)>0)
  OR count(to_jsonb(daily_task_logs)->>'timer_segment_number')<>count(DISTINCT to_jsonb(daily_task_logs)->>'timer_segment_number')
), timer_exceptions AS (
 SELECT l.id AS log_id,l.source_timer_id,
  CASE WHEN t.id IS NULL THEN 'missing_timer'
   WHEN t.task_id<>l.task_id OR t.user_id<>l.user_id THEN 'worker_or_task_mismatch'
   WHEN to_jsonb(l)->>'timer_segment_number' IS NULL AND t.generated_log_id IS DISTINCT FROM l.id THEN 'legacy_reverse_link_mismatch'
  END AS reason
 FROM public.daily_task_logs l LEFT JOIN public.task_timers t ON t.id=l.source_timer_id WHERE l.source_timer_id IS NOT NULL
), tasks_preview AS (
 SELECT t.id,t.task_tag,t.scaled_progress AS stored_scaled_progress,t.task_scale*t.progress_percentage/100 AS proposed_scaled_progress,t.valid_for_metrics AS stored_eligible,
  (priority<>'No' AND status NOT IN ('Not Started','Discarded') AND coalesce(progress_percentage>=15,false) AND coalesce(task_scale>0 AND task_scale<'Infinity'::numeric,false)) AS proposed_eligible,
  CASE WHEN status='Discarded' THEN 'discarded_unavailable'
   WHEN due_date IS NULL OR assigned_date IS NULL OR NOT isfinite(due_date) OR NOT isfinite(assigned_date) OR NOT isfinite(completed_date) THEN 'missing_or_invalid_dates'
   WHEN status='Done' AND completed_date IS NULL THEN 'completion_date_missing'
   WHEN assigned_date>coalesce(completed_date,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date) THEN 'future_assignment'
   WHEN completed_date>(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date THEN 'inconsistent_dates' END AS date_exception,
  to_jsonb(t)->>'scale_mode' AS scale_mode
 FROM public.tasks t
)
SELECT jsonb_build_object(
 'scope','read-only selected database; no automatic reconciliation',
 'as_of',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date,
 'duplicate_timer_links',coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM duplicate_links d),'[]'::jsonb),
 'timer_link_exceptions',coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM timer_exceptions e WHERE reason IS NOT NULL),'[]'::jsonb),
 'legacy_unknown_effect_count',(SELECT count(*) FROM public.daily_task_logs l WHERE to_jsonb(l)->>'effective_progress_delta' IS NULL),
 'invalid_effort_count',(SELECT count(*) FROM public.daily_task_logs WHERE NOT(hours_worked>=0 AND hours_worked<'Infinity'::numeric)),
 'task_count',(SELECT count(*) FROM tasks_preview),
 'precision_projection_changes',coalesce((SELECT jsonb_agg(jsonb_build_object('task_id',id,'stored',stored_scaled_progress,'proposed',proposed_scaled_progress)) FROM tasks_preview WHERE stored_scaled_progress IS DISTINCT FROM proposed_scaled_progress),'[]'::jsonb),
 'eligibility_changes',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM tasks_preview p WHERE stored_eligible IS DISTINCT FROM proposed_eligible),'[]'::jsonb),
 'date_exceptions',coalesce((SELECT jsonb_agg(jsonb_build_object('task_id',id,'task_tag',task_tag,'reason',date_exception)) FROM tasks_preview WHERE date_exception IS NOT NULL),'[]'::jsonb),
 'snapshot_count',(SELECT count(*) FROM public.monthly_performance_snapshots),
 'cron_catalog_present',to_regclass('cron.job') IS NOT NULL,
 'deployed_job_replacement_verified',false,
 'blocked_policy','Duplicate legacy links and unknown effects require individually authorized reconciliation; preserve all records.'
);
