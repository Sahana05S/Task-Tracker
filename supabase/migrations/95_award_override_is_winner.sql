-- ===========================================================================
-- TaskPulse - a director's award override is the day's winner (forward only;
-- audit of 31 October 2026)
--
-- The override exists for the exact-tie day, whose automatic run is certified
-- as completed_none. Every consumer judged the day by that run's status, so an
-- overridden tie day read as "no winner" and the director's star never counted
-- toward the monthly star or points. One rule now, everywhere: a slot with an
-- override is a completed_winner day whose winner is the override's.
--   award_read_model      -> status 'completed_winner' when override_id is set
--   recognition_daily_wins, recognition_points -> override counts as a win
--   month_archive_command -> expected monthly counts include override days
-- Same signatures and grants; no rows change.
-- ===========================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.award_read_model(p_from date, p_to_exclusive date, p_employee uuid DEFAULT NULL::uuid, p_candidates boolean DEFAULT true, p_history boolean DEFAULT true)
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
 SELECT coalesce(jsonb_agg(jsonb_build_object('date',s.business_date,'version',s.version,'runId',s.latest_run,'status',CASE WHEN r.status='failed' THEN 'failed' WHEN s.stale THEN 'stale' WHEN o.id IS NOT NULL THEN 'completed_winner' ELSE coalesce(r.status,'missing') END,
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


CREATE OR REPLACE FUNCTION taskpulse_private.recognition_daily_wins(p_org uuid,p_from date,p_to_exclusive date)
RETURNS TABLE(business_date date,decided boolean,winner uuid)
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT g.day::date,
  coalesce(NOT s.stale AND e.certified AND e.status IN ('completed_winner','completed_none'),false),
  CASE WHEN NOT s.stale AND e.certified AND (e.status='completed_winner' OR o.id IS NOT NULL) THEN coalesce(o.user_id,e.winner_id) END
 FROM generate_series(p_from,p_to_exclusive-1,interval '1 day') g(day)
 LEFT JOIN taskpulse_private.award_slots s ON s.organization_id=p_org AND s.business_date=g.day::date
 LEFT JOIN taskpulse_private.award_runs e ON e.id=s.effective_run
 LEFT JOIN taskpulse_private.award_overrides o ON o.id=s.override_id;
$$;


CREATE OR REPLACE FUNCTION public.recognition_points(p_employee uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE role text:=public.get_user_role(); viewer uuid:=auth.uid(); org uuid; manager boolean; entries jsonb; BEGIN
 IF role IS NULL OR viewer IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 org:=public.current_organization(); manager:=role IN ('managing_director','project_engineer');
 IF p_employee IS NOT NULL AND p_employee<>viewer AND NOT manager THEN RAISE EXCEPTION 'Own entries or manager authority required' USING ERRCODE='42501'; END IF;
 IF p_employee IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_employee AND u.organization_id=org) THEN
  RAISE EXCEPTION 'A member of your company is required' USING ERRCODE='42501'; END IF;
 IF p_employee IS NOT NULL THEN
  WITH latest AS (
   SELECT DISTINCT ON (period_start) * FROM taskpulse_private.recognition_ceremonies WHERE organization_id=org ORDER BY period_start,revision_number DESC
  ), e AS (
   SELECT 'dailyStar' kind,s.business_date date,NULL::text category FROM taskpulse_private.award_slots s
   JOIN taskpulse_private.award_runs r ON r.id=s.effective_run LEFT JOIN taskpulse_private.award_overrides o ON o.id=s.override_id
   WHERE s.organization_id=org AND NOT s.stale AND r.certified AND (r.status='completed_winner' OR o.id IS NOT NULL) AND coalesce(o.user_id,r.winner_id)=p_employee
   UNION ALL
   SELECT 'categoryAward',l.period_start,a.category FROM latest l JOIN taskpulse_private.recognition_ceremony_awards a ON a.ceremony_id=l.id
   WHERE a.status='awarded' AND a.winner_id=p_employee
   UNION ALL
   SELECT 'monthlyStar',l.period_start,NULL FROM latest l WHERE l.monthly_star_winner=p_employee
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'date',date,'category',category) ORDER BY date DESC,kind,category),'[]'::jsonb) INTO entries FROM e;
 END IF;
 RETURN jsonb_build_object('policy',(SELECT config->'points' FROM taskpulse_private.recognition_policy),'entries',entries,
  'members',(WITH latest AS (
    SELECT DISTINCT ON (period_start) * FROM taskpulse_private.recognition_ceremonies WHERE organization_id=org ORDER BY period_start,revision_number DESC
   ), daily AS (
    SELECT coalesce(o.user_id,r.winner_id) uid,count(*) n FROM taskpulse_private.award_slots s
    JOIN taskpulse_private.award_runs r ON r.id=s.effective_run LEFT JOIN taskpulse_private.award_overrides o ON o.id=s.override_id
    WHERE s.organization_id=org AND NOT s.stale AND r.certified AND (r.status='completed_winner' OR o.id IS NOT NULL) GROUP BY 1
   ), cat AS (
    SELECT a.winner_id uid,jsonb_object_agg(a.category,a.n) per,sum(a.n)::integer n FROM (
     SELECT a.winner_id,a.category,count(*) n FROM latest l JOIN taskpulse_private.recognition_ceremony_awards a ON a.ceremony_id=l.id
     WHERE a.status='awarded' GROUP BY 1,2) a GROUP BY 1
   ), star AS (
    SELECT monthly_star_winner uid,count(*) n FROM latest WHERE monthly_star_winner IS NOT NULL GROUP BY 1
   )
   SELECT coalesce(jsonb_agg(jsonb_build_object('userId',u.id,'name',u.full_name,'dailyStars',coalesce(d.n,0),'categoryAwards',coalesce(c.n,0),
     'categories',coalesce(c.per,'{}'::jsonb),'monthlyStars',coalesce(m.n,0)) ORDER BY u.id),'[]'::jsonb)
   FROM public.users u LEFT JOIN daily d ON d.uid=u.id LEFT JOIN cat c ON c.uid=u.id LEFT JOIN star m ON m.uid=u.id
   WHERE u.organization_id=org AND u.is_active));
END $$;


CREATE OR REPLACE FUNCTION public.month_archive_command(p_command text, p_period date, p_payload jsonb, p_operation uuid, p_expected_version bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid:=auth.uid();period taskpulse_private.month_periods;prior taskpulse_private.month_receipts;
 request jsonb:=jsonb_build_object('command',p_command,'period',p_period,'payload',p_payload,'expectedVersion',p_expected_version);
 response jsonb;start_date date;end_date date;asof timestamptz;src jsonb;presentation jsonb;calc jsonb;awards jsonb;monthly jsonb;
 rid uuid;num integer;quality jsonb;cert text;scope jsonb;entry jsonb;row_count integer;trusted boolean;
 expected_counts jsonb;max_count integer;expected_winner text;best_num numeric;best_den numeric;score_num numeric;score_den numeric;best_ties integer;score_obj jsonb;pick record;selection_matches boolean:=true;
BEGIN
 IF current_setting('role',true)<>'authenticated' OR public.get_user_role() IS DISTINCT FROM 'managing_director' OR actor IS NULL THEN RAISE EXCEPTION 'Active managing director required' USING ERRCODE='42501';END IF;
 IF p_operation IS NULL OR p_period IS NULL OR p_period<>date_trunc('month',p_period)::date OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
  OR p_command NOT IN ('draft','close','begin_correction','revise') THEN RAISE EXCEPTION 'Explicit month, object payload and operation required' USING ERRCODE='23514';END IF;
 start_date:=p_period;end_date:=(p_period+interval '1 month')::date;
 IF start_date>(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date THEN RAISE EXCEPTION 'Future month draft is unavailable' USING ERRCODE='23514';END IF;
 IF p_command<>'draft' AND end_date>(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date THEN RAISE EXCEPTION 'Only elapsed complete months may be closed or corrected' USING ERRCODE='23514';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT * INTO prior FROM taskpulse_private.month_receipts WHERE actor_id=actor AND operation=p_operation;
 IF FOUND THEN IF prior.request IS DISTINCT FROM request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409';END IF;RETURN prior.response;END IF;
 INSERT INTO taskpulse_private.month_periods(period_start,period_end_exclusive,state) VALUES(start_date,end_date,'live') ON CONFLICT(organization_id,period_start) DO NOTHING;
 SELECT * INTO period FROM taskpulse_private.month_periods WHERE period_start=start_date FOR UPDATE;
 IF p_expected_version IS NULL OR p_expected_version<>period.version THEN RAISE EXCEPTION 'Month version changed' USING ERRCODE='PT409';END IF;
 IF p_command='begin_correction' THEN
  IF period.state<>'closed' OR period.current_revision IS NULL THEN RAISE EXCEPTION 'A closed revision is required' USING ERRCODE='23514';END IF;
  IF length(btrim(coalesce(p_payload->>'reason','')))<8 THEN RAISE EXCEPTION 'Correction reason required' USING ERRCODE='23514';END IF;
  scope:=p_payload->'scope';
  IF jsonb_typeof(scope->'records')<>'array' OR jsonb_array_length(scope->'records')=0 OR jsonb_array_length(scope->'records')>50 THEN RAISE EXCEPTION 'Named bounded correction records required' USING ERRCODE='23514';END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(scope->'records') LOOP
   IF entry->>'kind' NOT IN ('log','attendance','fact','idea','suggestion','sale','task') OR (entry->>'id')::uuid IS NULL
    OR (entry->>'from')::date<start_date OR (entry->>'through')::date>=end_date OR (entry->>'through')::date<(entry->>'from')::date
    THEN RAISE EXCEPTION 'Correction scope must name records and dates within month' USING ERRCODE='23514';END IF;
   IF NOT EXISTS(SELECT 1 FROM public.daily_task_logs WHERE id=(entry->>'id')::uuid AND entry->>'kind'='log')
    AND NOT EXISTS(SELECT 1 FROM public.attendance_records WHERE id=(entry->>'id')::uuid AND entry->>'kind'='attendance')
    AND NOT EXISTS(SELECT 1 FROM public.daily_facts WHERE id=(entry->>'id')::uuid AND entry->>'kind'='fact')
    AND NOT EXISTS(SELECT 1 FROM public.ideas WHERE id=(entry->>'id')::uuid AND entry->>'kind'='idea')
    AND NOT EXISTS(SELECT 1 FROM public.suggestions WHERE id=(entry->>'id')::uuid AND entry->>'kind'='suggestion')
    AND NOT EXISTS(SELECT 1 FROM public.sales_logs WHERE id=(entry->>'id')::uuid AND entry->>'kind'='sale')
    AND NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=(entry->>'id')::uuid AND entry->>'kind'='task')
   THEN RAISE EXCEPTION 'Correction must name an existing source record' USING ERRCODE='23514';END IF;
  END LOOP;
  UPDATE taskpulse_private.month_periods SET state='correction',version=version+1,correction_scope=scope,correction_reason=p_payload->>'reason',correction_actor=actor WHERE period_start=start_date RETURNING * INTO period;
  response:=jsonb_build_object('period',start_date,'state',period.state,'version',period.version,'currentRevision',period.current_revision);
 ELSE
  IF p_command IN ('draft','close') AND period.state<>'live' OR p_command='revise' AND period.state<>'correction' THEN RAISE EXCEPTION 'Month state does not allow command' USING ERRCODE='23514';END IF;
  IF p_command IN ('close','revise') AND length(btrim(coalesce(p_payload->>'reason','')))<8 THEN RAISE EXCEPTION 'Archive reason required' USING ERRCODE='23514';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('reason','sourceInputs','calculation','monthlySelection')) THEN RAISE EXCEPTION 'Unknown archive field' USING ERRCODE='23514';END IF;
  src:=p_payload->'sourceInputs';calc:=p_payload->'calculation';monthly:=p_payload->'monthlySelection';
  asof:=(src->>'asOf')::timestamptz;
  IF asof IS NULL OR NOT isfinite(asof) OR asof>clock_timestamp() OR asof<clock_timestamp()-interval '15 minutes'
   OR (src->>'periodStart')::date IS DISTINCT FROM start_date OR (src->>'periodEndExclusive')::date IS DISTINCT FROM end_date
   OR src->>'sourceWatermark' IS DISTINCT FROM taskpulse_private.performance_watermark(asof)
   OR src->>'sourceWatermark' IS DISTINCT FROM taskpulse_private.performance_watermark(clock_timestamp())
   OR src IS DISTINCT FROM public.performance_source_context(start_date,end_date,asof)
   THEN RAISE EXCEPTION 'Current reproducible month sources required' USING ERRCODE='PT409';END IF;
  IF calc->'context'->>'ruleVersion' IS DISTINCT FROM 'm07-ten-factor-v1' OR calc->'context'->>'sourceWatermark' IS DISTINCT FROM src->>'sourceWatermark'
   OR (calc->'context'->>'asOf')::timestamptz IS DISTINCT FROM asof OR (calc->'context'->>'periodStart')::date IS DISTINCT FROM start_date
   OR (calc->'context'->>'periodEndExclusive')::date IS DISTINCT FROM end_date OR jsonb_typeof(calc->'members')<>'array' THEN RAISE EXCEPTION 'Matching M07 calculation required' USING ERRCODE='23514';END IF;
  presentation:=public.live_presentation_context(start_date,end_date,asof,NULL);
  IF presentation->'sources'->>'sourceWatermark' IS DISTINCT FROM src->>'sourceWatermark' THEN RAISE EXCEPTION 'Presentation and score sources changed' USING ERRCODE='PT409';END IF;
  SELECT count(*) INTO row_count FROM jsonb_array_elements(calc->'members');
  IF row_count=0 OR row_count<>(SELECT count(*) FROM jsonb_array_elements(src->'members') m WHERE (m->>'active')::boolean)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(calc->'members') m WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(src->'members') s WHERE (s->>'active')::boolean AND s->>'id'=m->>'userId')
    OR (SELECT count(*) FROM jsonb_object_keys(m->'factors'))<>10)
   THEN RAISE EXCEPTION 'All active members and ten factors required' USING ERRCODE='23514';END IF;
  IF (src->>'historyAvailable' IS DISTINCT FROM 'true' OR EXISTS(SELECT 1 FROM jsonb_array_elements(src->'contributions'->'employeeFactors') f WHERE f->'factors'->'sale'->>'available' IS DISTINCT FROM 'true'))
   AND (calc->>'status'='complete' OR EXISTS(SELECT 1 FROM jsonb_array_elements(calc->'members') m WHERE m->>'status'='complete' OR m->'compositeExact' IS NOT NULL AND m->'compositeExact'<>'null'::jsonb))
   THEN RAISE EXCEPTION 'Unavailable required source cannot yield a closed score' USING ERRCODE='23514';END IF;
  IF monthly IS NULL OR jsonb_typeof(monthly)<>'object' OR monthly->>'status' NOT IN ('provisional','complete','incomplete','closed') THEN RAISE EXCEPTION 'Monthly award selection required' USING ERRCODE='23514';END IF;
  IF monthly->>'status'<>'complete' AND monthly->'winnerId' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Incomplete award cannot name a winner' USING ERRCODE='23514';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('date',s.business_date,'slotVersion',s.version,'stale',s.stale,
   'automaticRunId',s.latest_run,'effectiveRunId',s.effective_run,'automaticResult',r.result,'effectiveResult',e.result,
   'automaticCertified',r.certified,'effectiveCertified',e.certified,'overrideId',o.id,'overrideUserId',o.user_id,'overrideReason',o.reason,
   'candidates',(SELECT coalesce(jsonb_agg(jsonb_build_object('userId',c.user_id,'calculation',c.calculation,'gate',c.gate) ORDER BY c.user_id),'[]'::jsonb) FROM taskpulse_private.award_candidates c WHERE c.run_id=s.latest_run)) ORDER BY s.business_date),'[]'::jsonb) INTO awards
  FROM taskpulse_private.award_slots s LEFT JOIN taskpulse_private.award_runs r ON r.id=s.latest_run
  LEFT JOIN taskpulse_private.award_runs e ON e.id=s.effective_run LEFT JOIN taskpulse_private.award_overrides o ON o.id=s.override_id
  WHERE s.business_date>=start_date AND s.business_date<end_date;
  SELECT coalesce(jsonb_object_agg(user_id,wins),'{}'::jsonb) INTO expected_counts FROM (
   SELECT coalesce(a->>'overrideUserId',a->'effectiveResult'->>'winnerId') user_id,count(*) wins
   FROM jsonb_array_elements(awards) a WHERE a->>'stale'='false' AND a->>'effectiveCertified'='true'
    AND (a->'effectiveResult'->>'status'='completed_winner' OR a->>'overrideUserId' IS NOT NULL)
   GROUP BY 1) counted;
  IF monthly->'counts' IS DISTINCT FROM expected_counts THEN selection_matches:=false;END IF;
  SELECT max(value::text::integer) INTO max_count FROM jsonb_each(expected_counts);
  IF max_count IS NOT NULL AND max_count>0 THEN
   FOR pick IN SELECT key FROM jsonb_each(expected_counts) WHERE value::text::integer=max_count LOOP
    SELECT m->'compositeExact' INTO score_obj FROM jsonb_array_elements(calc->'members') m WHERE m->>'userId'=pick.key;
    IF score_obj IS NULL OR score_obj='null'::jsonb THEN selection_matches:=false;CONTINUE;END IF;
    score_num:=(score_obj->>'numerator')::numeric;score_den:=(score_obj->>'denominator')::numeric;
    IF score_den<=0 THEN selection_matches:=false;CONTINUE;END IF;
    IF best_den IS NULL OR score_num*best_den>best_num*score_den THEN
     best_num:=score_num;best_den:=score_den;expected_winner:=pick.key;best_ties:=1;
    ELSIF score_num*best_den=best_num*score_den THEN best_ties:=best_ties+1;END IF;
   END LOOP;
   IF best_ties>1 THEN expected_winner:=NULL;END IF;
  END IF;
  IF monthly->>'status'='complete' AND monthly->>'winnerId' IS DISTINCT FROM expected_winner THEN selection_matches:=false;END IF;
  quality:=coalesce(calc->'reasons','[]'::jsonb)||coalesce(monthly->'reasons','[]'::jsonb);
  IF NOT selection_matches THEN quality:=quality||'"monthly_selection_mismatch"'::jsonb;END IF;
  SELECT EXISTS(SELECT 1 FROM taskpulse_private.performance_runs pr WHERE pr.rule_version='m07-ten-factor-v1' AND pr.source_watermark=src->>'sourceWatermark'
   AND (pr.context->>'periodStart')::date=start_date AND (pr.context->>'periodEndExclusive')::date=end_date
   AND (pr.context->>'asOf')::timestamptz=asof AND pr.result=calc) INTO trusted;
  IF NOT trusted THEN quality:=quality||'"trusted_calculation_run_missing"'::jsonb;END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(awards))<>end_date-start_date OR EXISTS(SELECT 1 FROM jsonb_array_elements(awards) a WHERE a->>'stale'='true' OR a->>'effectiveCertified' IS DISTINCT FROM 'true') THEN
   quality:=quality||'"daily_award_evidence_incomplete"'::jsonb;
  END IF;
  IF src->>'historyAvailable' IS DISTINCT FROM 'true' THEN quality:=quality||'"history_unavailable"'::jsonb;END IF;
  cert:=CASE WHEN trusted AND selection_matches AND calc->>'status'='complete' AND monthly->>'status'='complete' AND src->>'historyAvailable'='true'
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(src->'contributions'->'employeeFactors') f WHERE f->'factors'->'sale'->>'available' IS DISTINCT FROM 'true')
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(calc->'members') m WHERE m->>'status'<>'complete' OR m->'compositeExact'='null'::jsonb)
   AND (SELECT count(*) FROM jsonb_array_elements(awards))=end_date-start_date
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(awards) a WHERE a->>'stale'='true' OR a->>'effectiveCertified' IS DISTINCT FROM 'true')
   THEN 'certified' ELSE 'incomplete_uncertified' END;
  IF cert='incomplete_uncertified' THEN monthly:=monthly||jsonb_build_object('winnerId',NULL,'status','incomplete');END IF;
  SELECT coalesce(max(revision_number),0)+1 INTO num FROM taskpulse_private.month_revisions WHERE period_start=start_date;
  INSERT INTO taskpulse_private.month_revisions(period_start,revision_number,disposition,prior_revision,as_of,cutoff_local_date,actor_id,reason,rule_version,source_watermark,source_inputs,presentation_inputs,calculation,award_evidence,monthly_selection,certification,data_quality_reasons)
  VALUES(start_date,num,CASE WHEN p_command='draft' THEN 'draft' ELSE 'closed' END,period.current_revision,asof,(asof AT TIME ZONE 'Asia/Kolkata')::date,actor,coalesce(p_payload->>'reason','Draft evidence capture'),
   'm07-ten-factor-v1',src->>'sourceWatermark',src,presentation,calc,awards,monthly,cert,quality) RETURNING id INTO rid;
  INSERT INTO taskpulse_private.month_revision_members(revision_id,user_id,result)
  SELECT rid,(m->>'userId')::uuid,m FROM jsonb_array_elements(calc->'members') m;
  IF p_command<>'draft' THEN
   UPDATE taskpulse_private.month_periods SET state='closed',version=version+1,current_revision=rid,correction_scope=NULL,correction_reason=NULL,correction_actor=NULL WHERE period_start=start_date RETURNING * INTO period;
  END IF;
  response:=jsonb_build_object('period',start_date,'state',period.state,'version',period.version,'revisionId',rid,'revisionNumber',num,'certification',cert);
 END IF;
 INSERT INTO taskpulse_private.month_receipts(actor_id,operation,request,response) VALUES(actor,p_operation,request,response);
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(actor,'managing_director','month_'||p_command,'month_periods',coalesce(rid,period.current_revision),ARRAY['state','version'],jsonb_build_object('period',start_date,'state',period.state,'revision',rid,'reason',p_payload->>'reason','scope',scope),p_operation);
 RETURN response;
END $function$;


SELECT taskpulse_private.m15_secure();
COMMIT;
