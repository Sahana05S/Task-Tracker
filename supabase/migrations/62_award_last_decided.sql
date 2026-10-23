-- Award read model: the last decided result of every day (follow-up to 22, 23 and 48).
--
-- Any write that can change a score marks every open award day of the month
-- stale and queues it again (invalidate_awards, once per day per transaction
-- since 60). award_read_model then returns status 'stale', certified false and
-- winnerId null for those days, so every award view blanked the month until the
-- next worker run: on the demo (23 October 2026) one mission deadline edit
-- turned 19 decided daily stars into "Not calculated yet".
--
-- The decision is still stored: invalidation clears the slot's effective run
-- but keeps its latest run and any director override. This adds one key per
-- day, lastDecided = {status, winnerId, runId, decidedAt, override}:
--  * the director's override, when the slot has one (an override always names
--    a winner; the day still needs reaffirmation after a change, as before);
--  * otherwise the latest run, when it is certified completed_winner or
--    completed_none;
--  * otherwise null (never decided, or the latest run blocked or failed).
-- It is filled whether or not the day is stale; views read it only for a
-- stale day and mark it "Recalculating".
--
-- Every existing key keeps its meaning (winnerId null and certified false while
-- stale), so the monthly star, the ceremony, month close and recognition points
-- stay on certified, non-stale days. No table, scoring or award rule changes.
BEGIN;

CREATE OR REPLACE FUNCTION public.award_read_model(p_from date, p_to_exclusive date, p_employee uuid DEFAULT NULL::uuid)
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
 'candidates',CASE WHEN detail THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('userId',c.user_id,'calculation',c.calculation,'gate',c.gate) ORDER BY c.user_id),'[]') FROM taskpulse_private.award_candidates c WHERE c.run_id=s.latest_run AND (p_employee IS NULL OR c.user_id=p_employee)) ELSE '[]'::jsonb END) ORDER BY s.business_date),'[]') INTO days
 FROM taskpulse_private.award_slots s LEFT JOIN taskpulse_private.award_runs r ON r.id=s.latest_run LEFT JOIN taskpulse_private.award_runs e ON e.id=s.effective_run LEFT JOIN taskpulse_private.award_overrides o ON o.id=s.override_id
 WHERE s.business_date>=p_from AND s.business_date<p_to_exclusive;
 SELECT coalesce(jsonb_agg(jsonb_build_object('date',s.business_date,'runId',r.id,'status',CASE WHEN r.id IS DISTINCT FROM s.latest_run THEN 'superseded' WHEN s.stale THEN 'stale' ELSE r.status END,'recordedStatus',r.status,
 'calculation',c.calculation,'calculationContext',r.result->'calculation'->'context','gate',c.gate,'context',r.context,'certified',r.certified,'createdAt',r.created_at) ORDER BY s.business_date,r.created_at),'[]') INTO history
 FROM taskpulse_private.award_candidates c JOIN taskpulse_private.award_runs r ON r.id=c.run_id JOIN taskpulse_private.award_slots s ON s.id=r.slot_id
 WHERE p_employee IS NOT NULL AND detail AND c.user_id=p_employee AND s.business_date>=p_from AND s.business_date<p_to_exclusive;
 RETURN jsonb_build_object('days',days,'history',history,'policy',(SELECT config FROM taskpulse_private.award_policy WHERE id),'policyApproved',(SELECT config IS NOT NULL FROM taskpulse_private.award_policy WHERE id),'scheduleEnabled',(SELECT schedule_enabled FROM taskpulse_private.award_policy WHERE id),
 'frozen',EXISTS(SELECT 1 FROM public.monthly_performance_snapshots WHERE (make_date(snapshot_year,snapshot_month,1),make_date(snapshot_year,snapshot_month,1)+interval '1 month') OVERLAPS (p_from,p_to_exclusive)) OR EXISTS(SELECT 1 FROM public.report_snapshots WHERE status='Final' AND (period_start IS NULL OR period_start<p_to_exclusive) AND (period_end IS NULL OR period_end>=p_from)),
 'sourceWatermark',taskpulse_private.performance_watermark(clock_timestamp()),
 'legacy',(SELECT coalesce(jsonb_agg(jsonb_build_object('date',star_date,'winnerId',user_id,'score',score,'ruleVersion',calculation_rule_version,'certified',certified) ORDER BY star_date),'[]') FROM public.daily_star_records WHERE star_date>=p_from AND star_date<p_to_exclusive AND (p_employee IS NULL OR user_id=p_employee)));
END $function$;

COMMIT;
SELECT taskpulse_private.m15_secure();
