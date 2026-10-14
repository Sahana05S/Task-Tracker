-- M08: retained award evidence, service-only calculation commits and durable jobs.
-- No production scheduler is enabled. D10 policy activation requires approval.
BEGIN;
CREATE TABLE taskpulse_private.award_policy (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),config jsonb,schedule_enabled boolean NOT NULL DEFAULT false,
 available_from timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO taskpulse_private.award_policy DEFAULT VALUES;
CREATE TABLE taskpulse_private.award_slots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_date date UNIQUE NOT NULL,
 version bigint NOT NULL DEFAULT 1,latest_run uuid,effective_run uuid,override_id uuid,stale boolean NOT NULL DEFAULT true
);
CREATE TABLE taskpulse_private.award_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slot_id uuid NOT NULL REFERENCES taskpulse_private.award_slots(id),
 slot_version bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 status text NOT NULL CHECK(status IN ('completed_winner','completed_none','blocked','failed')),
 rule_version text NOT NULL DEFAULT 'm08-shared-performance-v1',policy_id text,source_watermark text,
 context jsonb NOT NULL,result jsonb NOT NULL,winner_id uuid REFERENCES public.users(id),
 certified boolean NOT NULL DEFAULT false,job_id uuid REFERENCES taskpulse_private.outbox_jobs(id),
 CHECK((status='completed_winner')=(winner_id IS NOT NULL)),CHECK(NOT certified OR status IN ('completed_winner','completed_none'))
);
ALTER TABLE taskpulse_private.award_slots ADD FOREIGN KEY(latest_run) REFERENCES taskpulse_private.award_runs(id);
ALTER TABLE taskpulse_private.award_slots ADD FOREIGN KEY(effective_run) REFERENCES taskpulse_private.award_runs(id);
CREATE TABLE taskpulse_private.award_candidates (
 run_id uuid NOT NULL REFERENCES taskpulse_private.award_runs(id),user_id uuid NOT NULL REFERENCES public.users(id),
 calculation jsonb NOT NULL,gate jsonb NOT NULL,PRIMARY KEY(run_id,user_id)
);
CREATE TABLE taskpulse_private.award_overrides (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),run_id uuid NOT NULL REFERENCES taskpulse_private.award_runs(id),
 user_id uuid NOT NULL REFERENCES public.users(id),actor_id uuid NOT NULL REFERENCES public.users(id),
 reason text NOT NULL CHECK(length(btrim(reason))>=8),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE taskpulse_private.award_slots ADD FOREIGN KEY(override_id) REFERENCES taskpulse_private.award_overrides(id);
CREATE TABLE taskpulse_private.award_receipts (
 actor_key text NOT NULL,operation uuid NOT NULL,request jsonb NOT NULL,response jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor_key,operation)
);
CREATE UNIQUE INDEX m08_active_delivery ON taskpulse_private.outbox_jobs(kind,entity_id)
 WHERE kind='award_daily' AND status IN ('pending','running','failed','blocked');
CREATE TRIGGER m08_runs_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.award_runs FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();
CREATE TRIGGER m08_candidates_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.award_candidates FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();
CREATE TRIGGER m08_overrides_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.award_overrides FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();
CREATE TRIGGER m08_receipts_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.award_receipts FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();

-- Legacy records remain identifiable and retain all original values/identities.
ALTER TABLE public.daily_star_records ADD COLUMN calculation_rule_version text NOT NULL DEFAULT 'legacy-five-factor-before-m07',ADD COLUMN certified boolean NOT NULL DEFAULT false;
CREATE TRIGGER m08_legacy_award_immutable BEFORE UPDATE OR DELETE ON public.daily_star_records FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();
REVOKE INSERT,UPDATE,DELETE ON public.daily_star_records,public.performance_score_components FROM authenticated,anon,service_role;
DO $$ DECLARE t text;c text;BEGIN
 FOREACH t IN ARRAY ARRAY['daily_star_records','performance_score_components'] LOOP
  SELECT string_agg(quote_ident(attname),',') INTO c FROM pg_attribute WHERE attrelid=('public.'||t)::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT (%s),UPDATE (%s) ON public.%I FROM authenticated,anon,service_role',c,c,t);
 END LOOP;
END $$;

CREATE FUNCTION taskpulse_private.award_date_frozen(p_date date) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.monthly_performance_snapshots WHERE snapshot_year=extract(year FROM p_date) AND snapshot_month=extract(month FROM p_date))
 OR EXISTS(SELECT 1 FROM public.report_snapshots WHERE status='Final' AND (period_start IS NULL OR period_start<=p_date) AND (period_end IS NULL OR period_end>=p_date));
$$;
CREATE FUNCTION taskpulse_private.queue_award(p_date date,p_invalidate boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
 DECLARE s taskpulse_private.award_slots;j uuid;BEGIN
 IF taskpulse_private.award_date_frozen(p_date) THEN RAISE EXCEPTION 'Frozen award requires a separate revision' USING ERRCODE='23514'; END IF;
 INSERT INTO taskpulse_private.award_slots(business_date) VALUES(p_date) ON CONFLICT(business_date) DO NOTHING;
 SELECT * INTO s FROM taskpulse_private.award_slots WHERE business_date=p_date FOR UPDATE;
 IF p_invalidate THEN UPDATE taskpulse_private.award_slots SET version=version+1,stale=true,effective_run=NULL WHERE id=s.id RETURNING * INTO s; END IF;
 IF NOT s.stale THEN RETURN jsonb_build_object('date',p_date,'status','current','runId',s.latest_run,'version',s.version); END IF;
 INSERT INTO taskpulse_private.outbox_jobs(kind,entity_id,entity_version,operation_id,payload,status)
 VALUES('award_daily',s.id,s.version,gen_random_uuid(),jsonb_build_object('businessDate',p_date,'awardRuleVersion','m08-shared-performance-v1'),'pending')
 ON CONFLICT(kind,entity_id) WHERE kind='award_daily' AND status IN ('pending','running','failed','blocked')
 DO UPDATE SET entity_version=EXCLUDED.entity_version,status=CASE WHEN taskpulse_private.outbox_jobs.status='running' THEN 'running' ELSE 'pending' END,
 available_at=CASE WHEN taskpulse_private.outbox_jobs.status='running' THEN taskpulse_private.outbox_jobs.available_at ELSE clock_timestamp() END
 RETURNING id INTO j;
 RETURN jsonb_build_object('date',p_date,'status','queued','jobId',j,'version',s.version);
END $$;
CREATE FUNCTION taskpulse_private.invalidate_awards() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE s record;BEGIN
 -- Conservative invalidation covers every observed open award day. Fresh reads do
 -- not certify an old winner while any source/cohort correction is unresolved.
 FOR s IN SELECT business_date,id FROM taskpulse_private.award_slots ORDER BY business_date LOOP
  IF NOT taskpulse_private.award_date_frozen(s.business_date) THEN
   PERFORM taskpulse_private.queue_award(s.business_date,true);
   INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
   VALUES(auth.uid(),coalesce(public.get_user_role()::text,'system'),'invalidate_award','award_slots',s.id,ARRAY['stale','version'],jsonb_build_object('sourceTable',TG_TABLE_NAME),gen_random_uuid());
  END IF;
 END LOOP;RETURN NEW;
END $$;
CREATE TRIGGER m08_observation_invalidation AFTER INSERT ON taskpulse_private.performance_observations FOR EACH ROW EXECUTE FUNCTION taskpulse_private.invalidate_awards();
CREATE TRIGGER m08_dated_invalidation AFTER INSERT ON taskpulse_private.input_history FOR EACH ROW EXECUTE FUNCTION taskpulse_private.invalidate_awards();

CREATE FUNCTION public.award_command(p_command text,p_payload jsonb,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<award_command>>
DECLARE worker boolean:=current_setting('role',true)='service_role';actor uuid:=auth.uid();role text:=public.get_user_role();actor_key text;
 request jsonb:=jsonb_build_object('command',p_command,'payload',p_payload);prior taskpulse_private.award_receipts;
 d date;s taskpulse_private.award_slots;j taskpulse_private.outbox_jobs;policy jsonb;response jsonb;r uuid;
 result jsonb;ctx jsonb;candidate jsonb;source jsonb;expected_ids jsonb;actual_ids jsonb;winner uuid;status text;reason text;
 cutoff timestamptz;begin_date date;end_date date;v bigint;override_row taskpulse_private.award_overrides;
 day_source jsonb;attendance jsonb;day_attendance jsonb;gate_state text;
BEGIN
 IF p_operation IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Operation and object payload required' USING ERRCODE='23514'; END IF;
 IF NOT worker AND role IS DISTINCT FROM 'managing_director' THEN RAISE EXCEPTION 'Active managing director or narrow worker required' USING ERRCODE='42501'; END IF;
 IF worker AND p_command NOT IN ('request','commit','fail') OR NOT worker AND p_command NOT IN ('request','override') THEN RAISE EXCEPTION 'Command outside actor boundary' USING ERRCODE='42501'; END IF;
 actor_key:=CASE WHEN worker THEN 'service:'||p_command ELSE actor::text||':'||p_command END;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT * INTO prior FROM taskpulse_private.award_receipts WHERE award_receipts.actor_key=award_command.actor_key AND operation=p_operation;
 IF FOUND THEN IF prior.request IS DISTINCT FROM request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='40001'; END IF;RETURN prior.response; END IF;
 SELECT config INTO policy FROM taskpulse_private.award_policy WHERE id;
 IF p_command='request' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k<>'date') THEN RAISE EXCEPTION 'Request field not allowed' USING ERRCODE='23514'; END IF;
  d:=(p_payload->>'date')::date;
  IF d IS NULL OR NOT isfinite(d) OR d>(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date THEN RAISE EXCEPTION 'Nonfuture Kolkata business date required' USING ERRCODE='23514'; END IF;
  response:=taskpulse_private.queue_award(d);
 ELSIF p_command IN ('commit','fail') THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('jobId','leaseToken','expectedVersion','result','errorCode')) THEN RAISE EXCEPTION 'Worker field not allowed' USING ERRCODE='23514'; END IF;
  SELECT * INTO j FROM taskpulse_private.outbox_jobs WHERE id=(p_payload->>'jobId')::uuid FOR UPDATE;
  IF NOT FOUND OR j.kind<>'award_daily' OR j.status<>'running' OR j.lease_token IS DISTINCT FROM (p_payload->>'leaseToken')::uuid OR j.locked_until<=clock_timestamp() THEN RAISE EXCEPTION 'Current award lease required' USING ERRCODE='40001'; END IF;
  SELECT * INTO s FROM taskpulse_private.award_slots WHERE id=j.entity_id FOR UPDATE;d:=s.business_date;
  IF p_command='fail' THEN
   reason:=p_payload->>'errorCode';IF reason IS NULL OR reason NOT IN ('source_query_failed','calculation_failed','source_changed','frozen_period') THEN RAISE EXCEPTION 'Known safe failure required' USING ERRCODE='23514'; END IF;
   result:=jsonb_build_object('reasons',jsonb_build_array(reason),'candidates','[]'::jsonb);status:='failed';ctx:=jsonb_build_object('businessDate',d);
  ELSE
   IF s.version IS DISTINCT FROM (p_payload->>'expectedVersion')::bigint THEN RAISE EXCEPTION 'Award source version changed' USING ERRCODE='40001'; END IF;
   IF taskpulse_private.award_date_frozen(d) THEN RAISE EXCEPTION 'Frozen award requires separate revision' USING ERRCODE='23514'; END IF;
   result:=p_payload->'result';ctx:=result->'context';status:=result->>'status';winner:=(result->>'winnerId')::uuid;
   IF status IS NULL OR status NOT IN ('completed_winner','completed_none','blocked') OR ctx->>'businessDate' IS DISTINCT FROM d::text OR jsonb_typeof(result->'candidates') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Versioned award result required' USING ERRCODE='23514'; END IF;
   IF (status='completed_winner') IS DISTINCT FROM (winner IS NOT NULL) THEN RAISE EXCEPTION 'Winner/status mismatch' USING ERRCODE='23514'; END IF;
   IF policy IS NULL THEN
    IF status<>'blocked' OR NOT (result->'reasons' ? 'award_policy_unapproved') THEN RAISE EXCEPTION 'Award policy is unapproved' USING ERRCODE='23514'; END IF;
   ELSE
    begin_date:=CASE WHEN policy->>'window'='month_to_date' THEN date_trunc('month',d)::date ELSE d END;end_date:=d+1;
    cutoff:=((d+(policy->>'cutoffDayOffset')::integer)::timestamp+make_interval(hours=>(policy->>'cutoffHour')::integer,mins=>(policy->>'cutoffMinute')::integer)) AT TIME ZONE 'Asia/Kolkata';
    IF ctx->>'awardRuleVersion' IS DISTINCT FROM 'm08-shared-performance-v1' OR ctx->>'policyId' IS DISTINCT FROM policy->>'id' OR (ctx->>'cutoff')::timestamptz IS DISTINCT FROM cutoff OR (ctx->>'periodStart')::date IS DISTINCT FROM begin_date OR (ctx->>'periodEndExclusive')::date IS DISTINCT FROM end_date OR ctx->>'asOf' IS NULL OR NOT isfinite((ctx->>'asOf')::timestamptz) OR (ctx->>'asOf')::timestamptz>clock_timestamp() THEN RAISE EXCEPTION 'Approved exact award context required' USING ERRCODE='23514'; END IF;
    IF (ctx->>'asOf')::timestamptz<cutoff THEN
     IF status<>'blocked' OR NOT (result->'reasons' ? 'award_cutoff_not_reached') THEN RAISE EXCEPTION 'Cutoff not reached' USING ERRCODE='23514'; END IF;
    ELSE
     IF ctx->>'sourceWatermark' IS DISTINCT FROM taskpulse_private.performance_watermark(clock_timestamp()) THEN RAISE EXCEPTION 'Award sources changed' USING ERRCODE='40001'; END IF;
     source:=public.performance_source_context(begin_date,end_date,(ctx->>'asOf')::timestamptz);
     SELECT coalesce(jsonb_agg(m->>'id' ORDER BY m->>'id'),'[]') INTO expected_ids FROM jsonb_array_elements(source->'members') m WHERE (m->>'active')::boolean;
     SELECT coalesce(jsonb_agg(c->>'userId' ORDER BY c->>'userId'),'[]') INTO actual_ids FROM jsonb_array_elements(result->'candidates') c;
     IF expected_ids IS DISTINCT FROM actual_ids OR EXISTS(SELECT 1 FROM jsonb_array_elements(result->'candidates') c WHERE c->'calculation'->>'userId' IS DISTINCT FROM c->>'userId' OR c->'gate'->>'userId' IS DISTINCT FROM c->>'userId') THEN RAISE EXCEPTION 'Entire active-as-of candidate population required' USING ERRCODE='23514'; END IF;
     IF status<>'blocked' THEN
      IF result->'calculation'->>'status' IS DISTINCT FROM 'complete' OR NOT (source->>'historyAvailable')::boolean OR
       EXISTS(SELECT 1 FROM jsonb_array_elements(source->'contributions'->'employeeFactors') f WHERE (f->'factors'->'sale'->>'available')::boolean IS DISTINCT FROM true) OR
       EXISTS(SELECT 1 FROM jsonb_array_elements(result->'candidates') c WHERE c->'calculation'->>'status' IS DISTINCT FROM 'complete' OR c->'calculation'->'compositeExact' IS NULL OR c->'calculation'->'compositeExact'='null'::jsonb OR c->'gate'->>'state' NOT IN ('eligible','ineligible')) THEN RAISE EXCEPTION 'Complete actual source-backed shared calculation required' USING ERRCODE='23514'; END IF;
      day_source:=public.performance_source_context(d,end_date,(ctx->>'asOf')::timestamptz);
      FOR candidate IN SELECT value FROM jsonb_array_elements(result->'candidates') LOOP
       IF (SELECT count(*) FROM jsonb_object_keys(candidate->'calculation'->'factors'))<>10 OR EXISTS(SELECT 1 FROM jsonb_each(candidate->'calculation'->'factors') f WHERE (f.value->>'available')::boolean IS DISTINCT FROM true) THEN RAISE EXCEPTION 'All ten factor results required' USING ERRCODE='23514'; END IF;
       SELECT a INTO attendance FROM jsonb_array_elements(source->'attendance') a WHERE a->>'userId'=candidate->>'userId';
       SELECT a INTO day_attendance FROM jsonb_array_elements(day_source->'attendance') a WHERE a->>'userId'=candidate->>'userId';
       gate_state:=CASE WHEN attendance->>'valid'='false' OR day_attendance->>'valid'='false' THEN 'ineligible'
        WHEN attendance->>'available' IS DISTINCT FROM 'true' OR day_attendance->>'available' IS DISTINCT FROM 'true' OR attendance->>'valid' IS DISTINCT FROM 'true' OR day_attendance->>'valid' IS DISTINCT FROM 'true' THEN 'unavailable'
        WHEN (policy->>'requirePositiveDayAttendance')::boolean AND coalesce((day_attendance->>'hours')::numeric,0)<=0 THEN 'ineligible' ELSE 'eligible' END;
       IF gate_state='unavailable' OR candidate->'gate'->>'state' IS DISTINCT FROM gate_state THEN RAISE EXCEPTION 'Actual attendance/report-validity gate required' USING ERRCODE='23514'; END IF;
      END LOOP;
      IF winner IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'candidates') c WHERE c->>'userId'=winner::text AND c->'gate'->>'state'='eligible' AND (c->'calculation'->>'eligibleForRanking')::boolean) THEN RAISE EXCEPTION 'Eligible complete winner required' USING ERRCODE='23514'; END IF;
     END IF;
    END IF;
   END IF;
  END IF;
  INSERT INTO taskpulse_private.award_runs(slot_id,slot_version,status,policy_id,source_watermark,context,result,winner_id,certified,job_id)
  VALUES(s.id,s.version,status,policy->>'id',ctx->>'sourceWatermark',ctx,result,winner,status IN ('completed_winner','completed_none'),j.id) RETURNING id INTO r;
  INSERT INTO taskpulse_private.award_candidates(run_id,user_id,calculation,gate)
  SELECT r,(c->>'userId')::uuid,c->'calculation',c->'gate' FROM jsonb_array_elements(result->'candidates') c;
  -- A prior override is retained as evidence. Recompute never silently reapplies it.
  IF NOT taskpulse_private.award_date_frozen(d) THEN
   UPDATE taskpulse_private.award_slots SET latest_run=r,effective_run=CASE WHEN status IN ('completed_winner','completed_none') AND override_id IS NULL THEN r END,stale=status='failed' OR override_id IS NOT NULL WHERE id=s.id;
  END IF;
  UPDATE taskpulse_private.outbox_jobs SET status=CASE WHEN award_command.status='failed' THEN 'failed' WHEN award_command.status='blocked' OR s.override_id IS NOT NULL THEN 'blocked' ELSE 'complete' END,
   last_error_code=CASE WHEN award_command.status='failed' THEN reason WHEN s.override_id IS NOT NULL THEN 'override_revalidation_required' WHEN award_command.status='blocked' THEN 'required_inputs_unavailable' END,
   available_at=clock_timestamp()+interval '5 minutes',locked_until=NULL,lease_token=NULL WHERE id=j.id;
  response:=jsonb_build_object('date',d,'runId',r,'status',status,'winnerId',winner,'version',s.version);
 ELSE
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('date','runId','expectedVersion','userId','reason')) THEN RAISE EXCEPTION 'Override field not allowed' USING ERRCODE='23514'; END IF;
  IF policy IS NULL OR policy->>'override' IS DISTINCT FROM 'eligible_complete_replace' THEN RAISE EXCEPTION 'Override count/incomplete policy unapproved' USING ERRCODE='23514'; END IF;
  d:=(p_payload->>'date')::date;SELECT * INTO s FROM taskpulse_private.award_slots WHERE business_date=d FOR UPDATE;
  IF NOT FOUND OR s.version IS DISTINCT FROM (p_payload->>'expectedVersion')::bigint OR s.latest_run IS DISTINCT FROM (p_payload->>'runId')::uuid THEN RAISE EXCEPTION 'Current award version required' USING ERRCODE='40001'; END IF;
  IF taskpulse_private.award_date_frozen(d) THEN RAISE EXCEPTION 'Frozen override requires separate revision' USING ERRCODE='23514'; END IF;
  IF (s.stale AND NOT EXISTS(SELECT 1 FROM taskpulse_private.award_runs WHERE id=s.latest_run AND slot_version=s.version AND certified)) OR NOT EXISTS(SELECT 1 FROM taskpulse_private.award_runs WHERE id=s.latest_run AND certified) THEN RAISE EXCEPTION 'Complete current automatic result required' USING ERRCODE='23514'; END IF;
  winner:=(p_payload->>'userId')::uuid;reason:=btrim(p_payload->>'reason');
  IF reason IS NULL OR length(reason)<8 OR NOT EXISTS(SELECT 1 FROM taskpulse_private.award_candidates WHERE run_id=s.latest_run AND user_id=winner AND gate->>'state'='eligible' AND calculation->>'status'='complete' AND (calculation->>'eligibleForRanking')::boolean) THEN RAISE EXCEPTION 'Reason and eligible complete candidate required' USING ERRCODE='23514'; END IF;
  INSERT INTO taskpulse_private.award_overrides(run_id,user_id,actor_id,reason) VALUES(s.latest_run,winner,actor,reason) RETURNING * INTO override_row;
  UPDATE taskpulse_private.award_slots SET override_id=override_row.id,effective_run=s.latest_run,stale=false,version=version+1 WHERE id=s.id RETURNING version INTO v;
  response:=jsonb_build_object('date',d,'status','overridden','winnerId',winner,'version',v,'runId',s.latest_run);
 END IF;
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(CASE WHEN worker THEN NULL ELSE actor END,CASE WHEN worker THEN 'service_role' ELSE role END,'award_'||p_command,'award_slots',coalesce(s.id,(SELECT id FROM taskpulse_private.award_slots WHERE business_date=d)),ARRAY['award_revision'],jsonb_build_object('status',response->'status','businessDate',d),p_operation);
 INSERT INTO taskpulse_private.award_receipts(actor_key,operation,request,response) VALUES(actor_key,p_operation,request,response);
 RETURN response;
END $$;

CREATE FUNCTION public.claim_award_jobs(p_limit integer DEFAULT 10) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE jobs jsonb;BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Narrow award worker only' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>50 THEN RAISE EXCEPTION 'Bounded award batch required' USING ERRCODE='23514'; END IF;
 WITH selected AS (SELECT id FROM taskpulse_private.outbox_jobs WHERE kind='award_daily' AND (status IN ('pending','failed') AND available_at<=clock_timestamp() OR status='running' AND locked_until<clock_timestamp()) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit),
 claimed AS (UPDATE taskpulse_private.outbox_jobs j SET status='running',attempts=attempts+1,lease_token=gen_random_uuid(),locked_until=clock_timestamp()+interval '5 minutes' FROM selected q WHERE j.id=q.id RETURNING j.*)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'leaseToken',c.lease_token,'date',s.business_date,'version',s.version)),'[]') INTO jobs FROM claimed c JOIN taskpulse_private.award_slots s ON s.id=c.entity_id;
 INSERT INTO taskpulse_private.audit_events(actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 SELECT 'service_role','claim_award_job','outbox_jobs',(j->>'id')::uuid,ARRAY['status'],jsonb_build_object('status','running'),(j->>'leaseToken')::uuid FROM jsonb_array_elements(jobs) j;
 RETURN jobs;
END $$;
CREATE FUNCTION public.queue_due_awards(p_from date,p_through date,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE p taskpulse_private.award_policy;d date;cutoff timestamptz;queued jsonb:='[]';BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Narrow award schedule only' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_through IS NULL OR p_through<p_from OR p_through-p_from>31 OR p_operation IS NULL THEN RAISE EXCEPTION 'Explicit bounded schedule range required' USING ERRCODE='23514'; END IF;
 SELECT * INTO p FROM taskpulse_private.award_policy WHERE id;
 IF NOT p.schedule_enabled OR p.config IS NULL THEN RETURN jsonb_build_object('enabled',false,'reason','schedule_not_configured','queued','[]'::jsonb); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 FOR d IN SELECT generate_series(p_from::timestamp,p_through::timestamp,interval '1 day')::date LOOP
  cutoff:=((d+(p.config->>'cutoffDayOffset')::integer)::timestamp+make_interval(hours=>(p.config->>'cutoffHour')::integer,mins=>(p.config->>'cutoffMinute')::integer)) AT TIME ZONE 'Asia/Kolkata';
  IF cutoff<=clock_timestamp() AND NOT taskpulse_private.award_date_frozen(d) THEN queued:=queued||jsonb_build_array(public.award_command('request',jsonb_build_object('date',d),md5(p_operation::text||d::text)::uuid)); END IF;
 END LOOP;RETURN jsonb_build_object('enabled',true,'queued',queued);
END $$;
CREATE FUNCTION public.award_policy_context() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$ BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Narrow award worker only' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object('policy',config,'scheduleEnabled',schedule_enabled,'availableFrom',available_from) FROM taskpulse_private.award_policy WHERE id);
END $$;
CREATE FUNCTION public.award_read_model(p_from date,p_to_exclusive date,p_employee uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE detail boolean;days jsonb;history jsonb;BEGIN
 IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated award visibility required' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_to_exclusive IS NULL OR p_to_exclusive<=p_from OR p_to_exclusive-p_from>366 THEN RAISE EXCEPTION 'Explicit bounded award window required' USING ERRCODE='23514'; END IF;
 detail:=public.get_user_role() IN ('managing_director','project_engineer') OR p_employee=auth.uid();
 IF p_employee IS NOT NULL AND NOT detail THEN RAISE EXCEPTION 'Employee or manager score history only' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('date',s.business_date,'version',s.version,'runId',s.latest_run,'status',CASE WHEN r.status='failed' THEN 'failed' WHEN s.stale THEN 'stale' ELSE coalesce(r.status,'missing') END,
 'certified',coalesce(e.certified,false) AND NOT s.stale,'winnerId',CASE WHEN NOT s.stale THEN coalesce(o.user_id,e.winner_id) END,
 'automaticWinnerId',r.winner_id,'override',o.id IS NOT NULL,'overrideReason',o.reason,'overrideBy',o.actor_id,
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
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.award_command(text,jsonb,uuid),public.claim_award_jobs(integer),public.queue_due_awards(date,date,uuid),public.award_policy_context(),public.award_read_model(date,date,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.award_command(text,jsonb,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.claim_award_jobs(integer),public.queue_due_awards(date,date,uuid),public.award_policy_context() TO service_role;
GRANT EXECUTE ON FUNCTION public.award_read_model(date,date,uuid) TO authenticated;
COMMIT;
