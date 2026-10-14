-- M12: immutable month evidence and narrowly authorized corrections.
-- This migration is forward-only. It does not transform legacy snapshots.
BEGIN;

CREATE TABLE taskpulse_private.month_periods (
 period_start date PRIMARY KEY,
 period_end_exclusive date NOT NULL,
 state text NOT NULL CHECK (state IN ('live','correction','closed')),
 version bigint NOT NULL DEFAULT 0,
 current_revision uuid,
 correction_scope jsonb,
 correction_reason text,
 correction_actor uuid REFERENCES public.users(id),
 CHECK (period_start=date_trunc('month',period_start)::date AND period_end_exclusive=(period_start+interval '1 month')::date)
);
CREATE TABLE taskpulse_private.month_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 period_start date NOT NULL REFERENCES taskpulse_private.month_periods(period_start),
 revision_number integer NOT NULL,
 disposition text NOT NULL CHECK (disposition IN ('draft','closed')),
 prior_revision uuid REFERENCES taskpulse_private.month_revisions(id),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 as_of timestamptz NOT NULL,
 cutoff_local_date date NOT NULL,
 actor_id uuid NOT NULL REFERENCES public.users(id),
 reason text NOT NULL,
 rule_version text NOT NULL,
 source_watermark text NOT NULL,
 source_inputs jsonb NOT NULL,
 presentation_inputs jsonb NOT NULL,
 calculation jsonb NOT NULL,
 award_evidence jsonb NOT NULL,
 monthly_selection jsonb NOT NULL,
 certification text NOT NULL CHECK (certification IN ('certified','incomplete_uncertified')),
 data_quality_reasons jsonb NOT NULL,
 UNIQUE(period_start,revision_number),
 CHECK (jsonb_typeof(source_inputs)='object' AND jsonb_typeof(presentation_inputs)='object' AND jsonb_typeof(calculation)='object' AND jsonb_typeof(award_evidence)='array')
);
ALTER TABLE taskpulse_private.month_periods ADD CONSTRAINT month_current_revision_fk FOREIGN KEY(current_revision) REFERENCES taskpulse_private.month_revisions(id);
CREATE TABLE taskpulse_private.month_revision_members (
 revision_id uuid NOT NULL REFERENCES taskpulse_private.month_revisions(id),
 user_id uuid NOT NULL REFERENCES public.users(id),
 result jsonb NOT NULL,
 PRIMARY KEY(revision_id,user_id)
);
CREATE TABLE taskpulse_private.month_receipts (
 actor_id uuid NOT NULL REFERENCES public.users(id),operation uuid NOT NULL,
 request jsonb NOT NULL,response jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_id,operation)
);
CREATE TRIGGER m12_revision_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.month_revisions FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();
CREATE TRIGGER m12_member_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.month_revision_members FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();
CREATE TRIGGER m12_receipt_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.month_receipts FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();

CREATE FUNCTION taskpulse_private.month_edit_allowed(p_kind text,p_id uuid,p_date date) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(
  SELECT 1 FROM taskpulse_private.month_periods m
  WHERE m.period_start=date_trunc('month',p_date)::date AND m.state='correction'
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(m.correction_scope->'records','[]'::jsonb)) s
   WHERE s->>'kind'=p_kind AND (s->>'id')::uuid=p_id
   AND p_date BETWEEN (s->>'from')::date AND (s->>'through')::date)
 );
$$;
CREATE FUNCTION taskpulse_private.month_guard_date(p_kind text,p_id uuid,p_date date) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p taskpulse_private.month_periods;BEGIN
 IF p_date IS NULL THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT * INTO p FROM taskpulse_private.month_periods WHERE period_start=date_trunc('month',p_date)::date FOR UPDATE;
 IF FOUND AND p.state<>'live' AND NOT taskpulse_private.month_edit_allowed(p_kind,p_id,p_date) THEN
  RAISE EXCEPTION 'Closed period source requires a director-authorized named correction' USING ERRCODE='23514';
 END IF;
END $$;
CREATE FUNCTION taskpulse_private.month_source_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k text;date_field text;old_date date;new_date date;rid uuid;BEGIN
 k:=CASE TG_TABLE_NAME WHEN 'daily_task_logs' THEN 'log' WHEN 'attendance_records' THEN 'attendance'
  WHEN 'daily_facts' THEN 'fact' WHEN 'ideas' THEN 'idea' WHEN 'suggestions' THEN 'suggestion'
  WHEN 'sales_logs' THEN 'sale' WHEN 'tasks' THEN 'task' END;
 date_field:=CASE k WHEN 'log' THEN 'log_date' WHEN 'attendance' THEN 'attendance_date'
  WHEN 'fact' THEN 'fact_date' WHEN 'idea' THEN 'idea_date' WHEN 'suggestion' THEN 'suggestion_date'
  WHEN 'sale' THEN 'sale_date' END;
 rid:=coalesce((to_jsonb(NEW)->>'id')::uuid,(to_jsonb(OLD)->>'id')::uuid);
 IF k='task' THEN
  IF TG_OP='UPDATE' THEN
   IF OLD.assigned_date IS DISTINCT FROM NEW.assigned_date THEN
    PERFORM taskpulse_private.month_guard_date(k,rid,OLD.assigned_date);
    PERFORM taskpulse_private.month_guard_date(k,rid,NEW.assigned_date);
   END IF;
   IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
    PERFORM taskpulse_private.month_guard_date(k,rid,OLD.due_date);
    PERFORM taskpulse_private.month_guard_date(k,rid,NEW.due_date);
   END IF;
   IF OLD.completed_date IS DISTINCT FROM NEW.completed_date THEN
    PERFORM taskpulse_private.month_guard_date(k,rid,OLD.completed_date);
    PERFORM taskpulse_private.month_guard_date(k,rid,NEW.completed_date);
   END IF;
   IF OLD.archived_effective_date IS DISTINCT FROM NEW.archived_effective_date THEN
    PERFORM taskpulse_private.month_guard_date(k,rid,OLD.archived_effective_date);
    PERFORM taskpulse_private.month_guard_date(k,rid,NEW.archived_effective_date);
   END IF;
  ELSIF TG_OP='INSERT' THEN
   PERFORM taskpulse_private.month_guard_date(k,rid,NEW.assigned_date);
   PERFORM taskpulse_private.month_guard_date(k,rid,NEW.due_date);
   PERFORM taskpulse_private.month_guard_date(k,rid,NEW.completed_date);
   PERFORM taskpulse_private.month_guard_date(k,rid,NEW.archived_effective_date);
  ELSIF TG_OP='DELETE' THEN
   PERFORM taskpulse_private.month_guard_date(k,rid,OLD.assigned_date);
  END IF;
 ELSE
  IF TG_OP<>'INSERT' THEN old_date:=(to_jsonb(OLD)->>date_field)::date;PERFORM taskpulse_private.month_guard_date(k,rid,old_date);END IF;
  IF TG_OP<>'DELETE' THEN new_date:=(to_jsonb(NEW)->>date_field)::date;PERFORM taskpulse_private.month_guard_date(k,rid,new_date);END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['daily_task_logs','attendance_records','daily_facts','ideas','suggestions','sales_logs','tasks'] LOOP
  EXECUTE format('CREATE TRIGGER m12_month_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION taskpulse_private.month_source_guard()',t);
 END LOOP;
END $$;
-- Retained private source observations and credits must obey the same date boundary.
CREATE FUNCTION taskpulse_private.month_private_source_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d date;k text;rid uuid;BEGIN
 IF TG_TABLE_NAME='performance_observations' THEN
  k:=CASE WHEN NEW.kind='log' THEN 'log' WHEN NEW.kind='task' THEN 'task' ELSE NULL END;
  d:=CASE WHEN NEW.kind='log' THEN (NEW.data->>'businessDate')::date ELSE NULL END;
  rid:=NEW.entity_id;
 ELSIF TG_TABLE_NAME='manual_credit_inputs' THEN k:='task';d:=NEW.business_date;rid:=NEW.task_id;
 ELSE
  k:=CASE NEW.kind WHEN 'effort' THEN 'log' WHEN 'attendance' THEN 'attendance'
   WHEN 'fact' THEN 'fact' WHEN 'idea' THEN 'idea' WHEN 'suggestion' THEN 'suggestion' WHEN 'sale' THEN 'sale' ELSE NULL END;
  d:=CASE k WHEN 'log' THEN (NEW.source->>'log_date')::date WHEN 'attendance' THEN (NEW.source->>'attendance_date')::date
   WHEN 'fact' THEN (NEW.source->>'fact_date')::date WHEN 'idea' THEN (NEW.source->>'idea_date')::date
   WHEN 'suggestion' THEN (NEW.source->>'suggestion_date')::date WHEN 'sale' THEN (NEW.source->>'sale_date')::date END;
  rid:=NEW.record_id;
 END IF;
 IF k IS NOT NULL THEN PERFORM taskpulse_private.month_guard_date(k,rid,d);END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER m12_observation_guard BEFORE INSERT ON taskpulse_private.performance_observations FOR EACH ROW EXECUTE FUNCTION taskpulse_private.month_private_source_guard();
CREATE TRIGGER m12_input_guard BEFORE INSERT ON taskpulse_private.input_history FOR EACH ROW EXECUTE FUNCTION taskpulse_private.month_private_source_guard();
CREATE TRIGGER m12_credit_guard BEFORE INSERT ON taskpulse_private.manual_credit_inputs FOR EACH ROW EXECUTE FUNCTION taskpulse_private.month_private_source_guard();
CREATE FUNCTION taskpulse_private.month_run_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 IF EXISTS(SELECT 1 FROM taskpulse_private.month_periods p WHERE p.state='closed'
  AND p.period_start<(NEW.context->>'periodEndExclusive')::date AND p.period_end_exclusive>(NEW.context->>'periodStart')::date)
 THEN RAISE EXCEPTION 'Frozen period performance job requires revision' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER m12_performance_run_guard BEFORE INSERT ON taskpulse_private.performance_runs FOR EACH ROW EXECUTE FUNCTION taskpulse_private.month_run_guard();

CREATE OR REPLACE FUNCTION taskpulse_private.award_date_frozen(p_date date) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM taskpulse_private.month_periods WHERE period_start=date_trunc('month',p_date)::date AND state='closed')
 OR EXISTS(SELECT 1 FROM public.monthly_performance_snapshots WHERE snapshot_year=extract(year FROM p_date) AND snapshot_month=extract(month FROM p_date))
 OR EXISTS(SELECT 1 FROM public.report_snapshots WHERE status='Final' AND (period_start IS NULL OR period_start<=p_date) AND (period_end IS NULL OR period_end>=p_date));
$$;

CREATE FUNCTION public.month_archive_command(p_command text,p_period date,p_payload jsonb,p_operation uuid,p_expected_version bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 IF FOUND THEN IF prior.request IS DISTINCT FROM request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='40001';END IF;RETURN prior.response;END IF;
 INSERT INTO taskpulse_private.month_periods(period_start,period_end_exclusive,state) VALUES(start_date,end_date,'live') ON CONFLICT(period_start) DO NOTHING;
 SELECT * INTO period FROM taskpulse_private.month_periods WHERE period_start=start_date FOR UPDATE;
 IF p_expected_version IS NULL OR p_expected_version<>period.version THEN RAISE EXCEPTION 'Month version changed' USING ERRCODE='40001';END IF;
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
   THEN RAISE EXCEPTION 'Current reproducible month sources required' USING ERRCODE='40001';END IF;
  IF calc->'context'->>'ruleVersion' IS DISTINCT FROM 'm07-ten-factor-v1' OR calc->'context'->>'sourceWatermark' IS DISTINCT FROM src->>'sourceWatermark'
   OR (calc->'context'->>'asOf')::timestamptz IS DISTINCT FROM asof OR (calc->'context'->>'periodStart')::date IS DISTINCT FROM start_date
   OR (calc->'context'->>'periodEndExclusive')::date IS DISTINCT FROM end_date OR jsonb_typeof(calc->'members')<>'array' THEN RAISE EXCEPTION 'Matching M07 calculation required' USING ERRCODE='23514';END IF;
  presentation:=public.live_presentation_context(start_date,end_date,asof,NULL);
  IF presentation->'sources'->>'sourceWatermark' IS DISTINCT FROM src->>'sourceWatermark' THEN RAISE EXCEPTION 'Presentation and score sources changed' USING ERRCODE='40001';END IF;
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
    AND a->'effectiveResult'->>'status'='completed_winner'
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
END $$;

CREATE FUNCTION public.month_archive_read(p_period date,p_revision integer DEFAULT NULL,p_employee uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE role text:=public.get_user_role();r taskpulse_private.month_revisions;members jsonb;detail boolean;presentation jsonb;viewer uuid;BEGIN
 IF role IS NULL OR p_period IS NULL OR p_period<>date_trunc('month',p_period)::date THEN RAISE EXCEPTION 'Active actor and exact period required' USING ERRCODE='42501';END IF;
 detail:=role IN ('managing_director','project_engineer') OR p_employee=auth.uid();
 IF p_employee IS NOT NULL AND NOT detail THEN RAISE EXCEPTION 'Employee or manager archive details only' USING ERRCODE='42501';END IF;
 IF p_revision IS NULL THEN SELECT x.* INTO r FROM taskpulse_private.month_revisions x JOIN taskpulse_private.month_periods p ON p.current_revision=x.id WHERE p.period_start=p_period;
 ELSE SELECT * INTO r FROM taskpulse_private.month_revisions WHERE period_start=p_period AND revision_number=p_revision;END IF;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('userId',m.user_id,'result',m.result) ORDER BY m.user_id),'[]'::jsonb) INTO members FROM taskpulse_private.month_revision_members m
 WHERE m.revision_id=r.id AND (p_employee IS NULL AND role IN ('managing_director','project_engineer') OR m.user_id=coalesce(p_employee,auth.uid()));
 viewer:=coalesce(p_employee,auth.uid());
 IF role IN ('managing_director','project_engineer') AND p_employee IS NULL THEN presentation:=r.presentation_inputs;
 ELSE
  WITH allowed AS (SELECT s->>'id' id FROM jsonb_array_elements(r.presentation_inputs->'sources'->'tasks') s
   WHERE s->'participants'?viewer::text OR s->'periodCredits'?viewer::text)
  SELECT jsonb_build_object('contract','m12-scoped-presentation-v1','presentationAvailable',r.presentation_inputs->'presentationAvailable',
   'tasks',(SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM jsonb_array_elements(r.presentation_inputs->'tasks') t WHERE t->>'id' IN (SELECT id FROM allowed)),
   'checklists',(SELECT coalesce(jsonb_agg(c),'[]'::jsonb) FROM jsonb_array_elements(r.presentation_inputs->'checklists') c WHERE c->>'taskId' IN (SELECT id FROM allowed)),
   'assets',(SELECT coalesce(jsonb_agg(a),'[]'::jsonb) FROM jsonb_array_elements(r.presentation_inputs->'assets') a WHERE a->>'task_id' IN (SELECT id FROM allowed) AND a->>'related_report_id' IS NULL),
   'relations',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM jsonb_array_elements(r.presentation_inputs->'relations') x WHERE x->>'task_id' IN (SELECT id FROM allowed)),
   'logs',(SELECT coalesce(jsonb_agg(l),'[]'::jsonb) FROM jsonb_array_elements(r.presentation_inputs->'logs') l WHERE l->>'user_id'=viewer::text),
   'contributions',(SELECT coalesce(jsonb_agg(c),'[]'::jsonb) FROM jsonb_array_elements(r.presentation_inputs->'contributions') c WHERE coalesce(c->'source'->>'posted_by',c->'source'->>'sales_by')=viewer::text),
   'attendance',(SELECT coalesce(jsonb_agg(a),'[]'::jsonb) FROM jsonb_array_elements(r.presentation_inputs->'attendance') a WHERE a->>'userId'=viewer::text)) INTO presentation;
 END IF;
 RETURN jsonb_build_object('id',r.id,'period',r.period_start,'revisionNumber',r.revision_number,'disposition',r.disposition,
  'superseded',EXISTS(SELECT 1 FROM taskpulse_private.month_periods p WHERE p.period_start=r.period_start AND p.current_revision IS DISTINCT FROM r.id AND p.current_revision IS NOT NULL),
  'asOf',r.as_of,'cutoffLocalDate',r.cutoff_local_date,'recordedAt',r.recorded_at,'reason',CASE WHEN role IN ('managing_director','project_engineer') THEN r.reason END,'ruleVersion',r.rule_version,'sourceWatermark',r.source_watermark,
  'certification',r.certification,'dataQualityReasons',r.data_quality_reasons,'members',members,
  'calculationContext',r.calculation->'context','sourceInputs',CASE WHEN role IN ('managing_director','project_engineer') AND p_employee IS NULL THEN r.source_inputs END,
  'presentationInputs',presentation,
  'awardEvidence',CASE WHEN role IN ('managing_director','project_engineer') AND p_employee IS NULL THEN r.award_evidence ELSE '[]'::jsonb END,
  'monthlySelection',r.monthly_selection);
END $$;
CREATE FUNCTION public.month_archive_history(p_period date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
BEGIN
 IF public.get_user_role() IS NULL OR p_period IS NULL OR p_period<>date_trunc('month',p_period)::date THEN RAISE EXCEPTION 'Active actor and month required' USING ERRCODE='42501';END IF;
 RETURN (SELECT jsonb_build_object('state',coalesce((SELECT state FROM taskpulse_private.month_periods WHERE period_start=p_period),'live'),
  'version',coalesce((SELECT version FROM taskpulse_private.month_periods WHERE period_start=p_period),0),
  'revisions',coalesce(jsonb_agg(jsonb_build_object('number',r.revision_number,'disposition',r.disposition,'certification',r.certification,'recordedAt',r.recorded_at,'asOf',r.as_of,'reason',CASE WHEN public.get_user_role() IN ('managing_director','project_engineer') THEN r.reason END) ORDER BY r.revision_number),'[]'::jsonb))
 FROM taskpulse_private.month_revisions r WHERE r.period_start=p_period);
END $$;
REVOKE INSERT,UPDATE,DELETE ON public.monthly_performance_snapshots FROM anon,authenticated,service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.month_archive_command(text,date,jsonb,uuid,bigint),public.month_archive_read(date,integer,uuid),public.month_archive_history(date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.month_archive_command(text,date,jsonb,uuid,bigint),public.month_archive_read(date,integer,uuid),public.month_archive_history(date) TO authenticated;
COMMIT;
