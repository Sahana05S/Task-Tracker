-- Compares migration 90's award_read_model with the deployed one for every
-- member on the demo data, inside a transaction that is rolled back.
\pset pager off
BEGIN;
SET LOCAL statement_timeout = '300s';
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM public.users WHERE role='managing_director' AND is_active ORDER BY created_at LIMIT 1), 'role','authenticated')::text, true) IS NOT NULL AS acting;
CREATE FUNCTION pg_temp.arm_new(p_from date, p_to_exclusive date, p_employee uuid DEFAULT NULL::uuid, p_candidates boolean DEFAULT true, p_history boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE detail boolean;days jsonb;history jsonb;BEGIN
 IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated award visibility required' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_to_exclusive IS NULL OR p_to_exclusive<=p_from OR p_to_exclusive-p_from>366 THEN RAISE EXCEPTION 'Explicit bounded award window required' USING ERRCODE='23514'; END IF;
 detail:=public.get_user_role() IN ('managing_director','project_engineer') OR p_employee=auth.uid();
 IF p_employee IS NOT NULL AND NOT detail THEN RAISE EXCEPTION 'Employee or manager score history only' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('date',s.business_date,'version',s.version,'runId',s.latest_run,'status',CASE WHEN r.status='failed' THEN 'failed' WHEN s.stale THEN 'stale' ELSE coalesce(r.status,'missing') END,
 'certified',coalesce(e.certified,false) AND NOT s.stale,'winnerId',CASE WHEN NOT s.stale THEN coalesce(o.user_id,e.winner_id) END,
 'automaticWinnerId',r.winner_id,
 'lastDecided',CASE WHEN o.id IS NOT NULL THEN jsonb_build_object('status','completed_winner','winnerId',o.user_id,'runId',o.run_id,'decidedAt',o.created_at,'override',true)
  WHEN r.certified AND r.status IN ('completed_winner','completed_none') THEN jsonb_build_object('status',r.status,'winnerId',r.winner_id,'runId',r.id,'decidedAt',r.created_at,'override',false) END,'override',o.id IS NOT NULL,'reaffirmationRequired',s.stale AND o.id IS NOT NULL AND coalesce(r.certified AND r.slot_version=s.version,false),'overrideReason',o.reason,'overrideBy',o.actor_id,
 'context',r.context,'reasons',r.result->'reasons','lastRunAt',r.created_at,'lastSuccessAt',(SELECT max(created_at) FROM taskpulse_private.award_runs WHERE slot_id=s.id AND certified),
 'jobStatus',(SELECT status FROM taskpulse_private.outbox_jobs WHERE entity_id=s.id AND kind='award_daily' ORDER BY created_at DESC LIMIT 1),
 'lastError',(SELECT last_error_code FROM taskpulse_private.outbox_jobs WHERE entity_id=s.id AND kind='award_daily' ORDER BY created_at DESC LIMIT 1),
 'candidates',CASE WHEN detail AND p_candidates THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('userId',c.user_id,'calculation',c.calculation,'gate',c.gate) ORDER BY c.user_id),'[]') FROM taskpulse_private.award_candidates c WHERE c.run_id=s.latest_run AND (p_employee IS NULL OR c.user_id=p_employee)) ELSE '[]'::jsonb END) ORDER BY s.business_date),'[]') INTO days
 FROM taskpulse_private.award_slots s LEFT JOIN taskpulse_private.award_runs r ON r.id=s.latest_run LEFT JOIN taskpulse_private.award_runs e ON e.id=s.effective_run LEFT JOIN taskpulse_private.award_overrides o ON o.id=s.override_id
 WHERE s.business_date>=p_from AND s.business_date<p_to_exclusive;
 SELECT coalesce(jsonb_agg(jsonb_build_object('date',s.business_date,'runId',r.id,'status',CASE WHEN r.id IS DISTINCT FROM s.latest_run THEN 'superseded' WHEN s.stale THEN 'stale' ELSE r.status END,'recordedStatus',r.status,
 'calculation',c.calculation,'calculationContext',r.result->'calculation'->'context','gate',c.gate,'context',r.context,'certified',r.certified,'createdAt',r.created_at) ORDER BY s.business_date,r.created_at),'[]') INTO history
 FROM taskpulse_private.award_candidates c JOIN taskpulse_private.award_runs r ON r.id=c.run_id JOIN taskpulse_private.award_slots s ON s.id=r.slot_id
 WHERE p_history AND p_employee IS NOT NULL AND detail AND c.user_id=p_employee AND r.id=s.latest_run AND s.business_date>=p_from AND s.business_date<p_to_exclusive;
 RETURN jsonb_build_object('days',days,'history',history,'policy',(SELECT config FROM taskpulse_private.award_policy WHERE id),'policyApproved',(SELECT config IS NOT NULL FROM taskpulse_private.award_policy WHERE id),'scheduleEnabled',(SELECT schedule_enabled FROM taskpulse_private.award_policy WHERE id),
 'frozen',EXISTS(SELECT 1 FROM public.monthly_performance_snapshots WHERE (make_date(snapshot_year,snapshot_month,1),make_date(snapshot_year,snapshot_month,1)+interval '1 month') OVERLAPS (p_from,p_to_exclusive)) OR EXISTS(SELECT 1 FROM public.report_snapshots WHERE status='Final' AND (period_start IS NULL OR period_start<p_to_exclusive) AND (period_end IS NULL OR period_end>=p_from)),
 'sourceWatermark',taskpulse_private.performance_watermark(clock_timestamp()),
 'legacy',(SELECT coalesce(jsonb_agg(jsonb_build_object('date',star_date,'winnerId',user_id,'score',score,'ruleVersion',calculation_rule_version,'certified',certified) ORDER BY star_date),'[]') FROM public.daily_star_records WHERE star_date>=p_from AND star_date<p_to_exclusive AND (p_employee IS NULL OR user_id=p_employee)));
END $function$;
\echo '== this month: every member'
SELECT count(*) AS members,
 count(*) FILTER (WHERE (o-'history') = (n-'history')) AS rest_same,
 count(*) FILTER (WHERE n->'history' = coalesce((SELECT jsonb_agg(h ORDER BY ord) FROM jsonb_array_elements(o->'history') WITH ORDINALITY x(h,ord) WHERE h->>'status'<>'superseded'),'[]'::jsonb)) AS history_is_old_minus_superseded,
 sum(jsonb_array_length(o->'history')) AS old_rows, sum(jsonb_array_length(n->'history')) AS new_rows
FROM (SELECT public.award_read_model(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date, u.id, false, true) o, pg_temp.arm_new(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date, u.id, false, true) n FROM public.users u) q;
\echo '== last month: every member'
SELECT count(*) AS members,
 count(*) FILTER (WHERE (o-'history') = (n-'history')) AS rest_same,
 count(*) FILTER (WHERE n->'history' = coalesce((SELECT jsonb_agg(h ORDER BY ord) FROM jsonb_array_elements(o->'history') WITH ORDINALITY x(h,ord) WHERE h->>'status'<>'superseded'),'[]'::jsonb)) AS history_is_old_minus_superseded,
 sum(jsonb_array_length(o->'history')) AS old_rows, sum(jsonb_array_length(n->'history')) AS new_rows
FROM (SELECT public.award_read_model((date_trunc('month',now())-interval '1 month')::date, date_trunc('month',now())::date, u.id, false, true) o, pg_temp.arm_new((date_trunc('month',now())-interval '1 month')::date, date_trunc('month',now())::date, u.id, false, true) n FROM public.users u) q;
\echo '== team read (no employee) unchanged'
SELECT public.award_read_model(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date, NULL, true, true) = pg_temp.arm_new(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date, NULL, true, true) AS same;
\echo '== member report read, one member: time and size before and after'
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) SELECT public.award_read_model(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date, (SELECT user_id FROM taskpulse_private.award_candidates GROUP BY 1 ORDER BY count(*) DESC LIMIT 1), false, true);
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) SELECT pg_temp.arm_new(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date, (SELECT user_id FROM taskpulse_private.award_candidates GROUP BY 1 ORDER BY count(*) DESC LIMIT 1), false, true);
SELECT octet_length(public.award_read_model(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date, (SELECT user_id FROM taskpulse_private.award_candidates GROUP BY 1 ORDER BY count(*) DESC LIMIT 1), false, true)::text) AS before_bytes,
       octet_length(pg_temp.arm_new(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date, (SELECT user_id FROM taskpulse_private.award_candidates GROUP BY 1 ORDER BY count(*) DESC LIMIT 1), false, true)::text) AS after_bytes;
ROLLBACK;
