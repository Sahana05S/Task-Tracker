-- M07 source histories and narrow recomputation. No scoring formula, archive rewrite or policy guess.
BEGIN;
CREATE FUNCTION taskpulse_private.attendance_inputs(p_user uuid,p_from date,p_to_exclusive date,p_as_of timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE cutoff timestamptz;days jsonb;known boolean;ready boolean;period_valid boolean;reasons jsonb; BEGIN
 IF p_from IS NULL OR p_to_exclusive IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to_exclusive) OR p_to_exclusive<=p_from OR p_to_exclusive-p_from>366 OR p_as_of IS NULL OR NOT isfinite(p_as_of) OR p_as_of>clock_timestamp() THEN RAISE EXCEPTION 'Explicit valid period and nonfuture as-of instant required' USING ERRCODE='23514'; END IF;
 SELECT available_from INTO cutoff FROM taskpulse_private.input_contract;known:=p_as_of>=cutoff;
 WITH snapshots AS (
  SELECT DISTINCT ON(kind,record_id) kind,record_id,record_version,source FROM taskpulse_private.input_history
  WHERE kind IN ('attendance','effort') AND recorded_at<=p_as_of ORDER BY kind,record_id,recorded_at DESC,sequence DESC
 ), attendance AS (
  SELECT record_id,record_version,source FROM snapshots WHERE kind='attendance' AND source->>'user_id'=p_user::text AND source->>'record_state'<>'withdrawn'
 ), effort AS (
  SELECT (source->>'log_date')::date work_date,
   CASE WHEN bool_and((source->>'hours_worked')::numeric>=0 AND (source->>'hours_worked')::numeric<'Infinity'::numeric) THEN sum((source->>'hours_worked')::numeric) END hours,
   bool_and((source->>'hours_worked')::numeric>=0 AND (source->>'hours_worked')::numeric<'Infinity'::numeric) hours_valid,
   jsonb_agg(jsonb_build_object('id',record_id,'version',record_version,'taskId',source->>'task_id','timerId',source->>'source_timer_id','segmentNumber',source->'segment_number')) ids
  FROM snapshots WHERE kind='effort' AND source->>'user_id'=p_user::text AND source->>'reversed_at' IS NULL GROUP BY 1
 ), inputs AS (
  SELECT d.day::date business_date,a.record_id,a.record_version,a.source->>'status' status,
   CASE WHEN known AND (a.source->>'hours_confirmed')::boolean THEN (a.source->>'attendance_hours')::numeric END regular,
   CASE WHEN known AND (a.source->>'hours_confirmed')::boolean THEN (a.source->>'off_hours')::numeric END off_hours,
   CASE WHEN known THEN CASE WHEN e.hours_valid=false THEN NULL ELSE coalesce(e.hours,0) END END logged,
   coalesce(e.ids,'[]') ids,
   array_remove(ARRAY[CASE WHEN NOT known THEN 'history_before_input_baseline' END,
    CASE WHEN a.record_id IS NULL THEN 'attendance_missing' WHEN NOT (a.source->>'hours_confirmed')::boolean THEN 'legacy_hours_unconfirmed' END,
    CASE WHEN e.hours_valid=false THEN 'effort_hours_invalid' END],NULL) input_reasons
  FROM generate_series(p_from::timestamp,least(p_to_exclusive-1,(p_as_of AT TIME ZONE 'Asia/Kolkata')::date)::timestamp,interval '1 day') d(day)
  LEFT JOIN attendance a ON (a.source->>'attendance_date')::date=d.day::date LEFT JOIN effort e ON e.work_date=d.day::date
 ), checked AS (
  SELECT *,regular BETWEEN 0 AND 24 AND off_hours BETWEEN 0 AND 24 AND regular+off_hours<=24 numeric_ok,
   CASE WHEN status IN ('Absent','Leave') THEN regular=0 AND off_hours=0
    WHEN status IN ('Holiday','Off Hours') THEN regular=0
    WHEN status IN ('Present','Half Day') THEN true ELSE false END state_ok
  FROM inputs
 ), evaluated AS (
  SELECT *,cardinality(input_reasons)=0 AND coalesce(numeric_ok,false) AND logged IS NOT NULL available,
   input_reasons||array_remove(ARRAY[CASE WHEN regular IS NOT NULL AND NOT numeric_ok THEN 'attendance_hours_invalid' END,
    CASE WHEN numeric_ok AND NOT state_ok THEN 'attendance_state_hours_incompatible' END,
    CASE WHEN numeric_ok AND state_ok AND logged>regular+off_hours THEN 'effort_exceeds_attendance_capacity' END],NULL) all_reasons
  FROM checked
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('businessDate',business_date,'attendanceId',record_id,'attendanceVersion',record_version,'status',status,
  'attendanceHours',regular::text,'offHours',off_hours::text,'capacityHours',CASE WHEN numeric_ok AND state_ok THEN (regular+off_hours)::text END,'effortHours',logged::text,
  'effortSources',ids,'available',available,'valid',CASE WHEN available THEN state_ok AND logged<=regular+off_hours END,'reasons',all_reasons) ORDER BY business_date),'[]') INTO days FROM evaluated;
 SELECT count(*)>0 AND bool_and((d->>'available')::boolean),bool_and((d->>'valid')::boolean) INTO ready,period_valid FROM jsonb_array_elements(days) d;
 SELECT coalesce(jsonb_agg(reason ORDER BY reason),'[]') INTO reasons FROM (SELECT DISTINCT jsonb_array_elements_text(d->'reasons') reason FROM jsonb_array_elements(days) d) r;
 IF jsonb_array_length(days)=0 THEN reasons:=jsonb_build_array('no_elapsed_days'); END IF;
 RETURN jsonb_build_object('ruleVersion','m06-attendance-inputs-v2','userId',p_user,'periodStart',p_from,'periodEndExclusive',p_to_exclusive,'asOf',p_as_of,
  'historyAvailableFrom',cutoff,'historyAvailable',known,'validityAvailable',ready,'valid',CASE WHEN ready THEN period_valid END,'reasons',reasons,'days',days);
END $$;

CREATE FUNCTION taskpulse_private.contribution_inputs(p_from date,p_to_exclusive date,p_as_of timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE cutoff timestamptz;known boolean;sources jsonb;populations jsonb;factors jsonb;employees jsonb; BEGIN
 IF p_from IS NULL OR p_to_exclusive IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to_exclusive) OR p_to_exclusive<=p_from OR p_to_exclusive-p_from>366 OR p_as_of IS NULL OR NOT isfinite(p_as_of) OR p_as_of>clock_timestamp() THEN RAISE EXCEPTION 'Explicit valid period and nonfuture as-of instant required' USING ERRCODE='23514'; END IF;
 SELECT available_from INTO cutoff FROM taskpulse_private.input_contract;known:=p_as_of>=cutoff;
 WITH snapshots AS (
  SELECT DISTINCT ON(kind,record_id) kind,record_id,record_version,recorded_at,source FROM taskpulse_private.input_history
  WHERE kind IN ('fact','idea','suggestion','sale') AND recorded_at<=p_as_of ORDER BY kind,record_id,recorded_at DESC,sequence DESC
 ), dated AS (
  SELECT *,source->>CASE kind WHEN 'fact' THEN 'fact_date' WHEN 'idea' THEN 'idea_date' WHEN 'suggestion' THEN 'suggestion_date' ELSE 'sale_date' END business_date,
   source->>CASE WHEN kind='sale' THEN 'sales_by' ELSE 'posted_by' END author FROM snapshots
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',record_id,'kind',kind,'version',record_version,'attributedTo',author,'businessDate',business_date,
  'state',source->>'validation_state','validator',source->>'validated_by','validatedAt',source->>'validation_at','observedAt',recorded_at,
  'salesFields',CASE WHEN kind='sale' THEN jsonb_build_object('builtUpAreaSource',source->>'project_built_up_area','isNewProject',source->'is_new_project','basementPaymentReceived',source->'basement_payment_received') END,
  'provenanceReason',CASE WHEN author IS NULL THEN 'legacy_author_missing' WHEN source->>'validation_state'='legacy_unvalidated' THEN 'legacy_population_unknown'
   WHEN source->>'validation_state'='validated' AND (source->>'validation_at' IS NULL OR source->>'validated_by' IS NULL OR source->>'validated_by'=author) THEN 'legacy_validation_provenance_missing' END,
  'exclusionReason',CASE WHEN source->>'validation_state' IN ('rejected','withdrawn') THEN source->>'validation_state' END) ORDER BY kind,record_id),'[]') INTO sources
 FROM dated WHERE business_date::date>=p_from AND business_date::date<p_to_exclusive AND business_date::date<=(p_as_of AT TIME ZONE 'Asia/Kolkata')::date;
 SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') INTO populations FROM (SELECT s->>'kind' kind,s->>'attributedTo' author,s->>'state' state,count(*) count FROM jsonb_array_elements(sources) s GROUP BY 1,2,3) c;
 factors:=taskpulse_private.contribution_raw_inputs(sources,known);
 -- Listing source inputs for all known identities does not choose a scoring cohort.
 SELECT coalesce(jsonb_agg(jsonb_build_object('userId',u.id,'factors',taskpulse_private.contribution_raw_inputs(sources,known,u.id)) ORDER BY u.id),'[]') INTO employees FROM public.users u;
 RETURN jsonb_build_object('ruleVersion','m06-support-inputs-v2','periodStart',p_from,'periodEndExclusive',p_to_exclusive,'asOf',p_as_of,
  'historyAvailableFrom',cutoff,'historyAvailable',known,'available',false,'reasons',ARRAY['sales_field_mapping_missing'],
  'sources',sources,'populations',populations,'factors',factors,'employeeFactors',employees,
  'raw',jsonb_build_object('fact',factors->'fact'->'rawValue','idea',factors->'idea'->'rawValue','suggestion',factors->'suggestion'->'rawValue','sale',NULL),
  'coefficients',jsonb_build_object('fact',jsonb_build_array(0.75,0.38),'idea',jsonb_build_array(2,0.75),'suggestion',jsonb_build_array(2,0.75),'sale',jsonb_build_object('BO',1.5,'BN',1,'BP',0.75,'divisor',50)));
END $$;

CREATE OR REPLACE FUNCTION public.attendance_input_context(p_user uuid,p_from date,p_to_exclusive date,p_as_of timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF public.get_user_role() IS NULL OR p_user IS NULL OR NOT public.can_read_employee_details(p_user) THEN RAISE EXCEPTION 'Employee/manager detail visibility required' USING ERRCODE='42501'; END IF;
 RETURN taskpulse_private.attendance_inputs(p_user,p_from,p_to_exclusive,p_as_of);
END $$;
CREATE OR REPLACE FUNCTION public.contribution_input_context(p_from date,p_to_exclusive date,p_as_of timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated team input visibility required' USING ERRCODE='42501'; END IF;
 RETURN taskpulse_private.contribution_inputs(p_from,p_to_exclusive,p_as_of);
END $$;
CREATE TABLE taskpulse_private.performance_observations (
 revision bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,kind text NOT NULL CHECK(kind IN ('task','member','credit','log')),
 source_key text NOT NULL,entity_id uuid NOT NULL,observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),data jsonb NOT NULL);
CREATE INDEX m07_observation_lookup ON taskpulse_private.performance_observations(kind,source_key,observed_at DESC,revision DESC);
CREATE TABLE taskpulse_private.performance_contract (id boolean PRIMARY KEY DEFAULT true CHECK(id),available_from timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE FUNCTION taskpulse_private.task_observation(p_task uuid) RETURNS jsonb LANGUAGE sql SET search_path='' AS $$
 SELECT jsonb_build_object('id',t.id,'tag',t.task_tag,'category',t.category,'priority',t.priority,'status',t.status,
 'assignedDate',t.assigned_date,'dueDate',t.due_date,'completedDate',t.completed_date,'progress',t.progress_percentage::text,'scale',t.task_scale::text,
 'scaleVersion',t.scale_version::text,'shareVersion',t.participant_version::text,'creditMode',t.participant_credit_mode,'primaryAssignee',t.assignee_id,
 'shares',(SELECT jsonb_object_agg(a.user_id::text,a.share_units) FROM public.task_assignees a WHERE a.task_id=t.id),
 'participants',(SELECT jsonb_agg(DISTINCT u ORDER BY u) FROM (SELECT t.assignee_id u UNION SELECT user_id FROM public.task_assignees WHERE task_id=t.id) q),
 'progressOwner',t.progress_owner,'workRevision',t.work_revision::text,'lifecycleVersion',t.lifecycle_version::text,'deleted',false) FROM public.tasks t WHERE id=p_task;
$$;
CREATE FUNCTION taskpulse_private.capture_performance_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE entity uuid;key text;kind text;data jsonb; BEGIN
 IF TG_TABLE_NAME='tasks' THEN
  entity:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;key:=entity::text;kind:='task';
  data:=CASE WHEN TG_OP='DELETE' THEN jsonb_build_object('id',entity,'deleted',true) ELSE taskpulse_private.task_observation(entity) END;
  IF TG_OP='UPDATE' AND (NEW.task_scale,NEW.progress_percentage,NEW.priority,NEW.category,NEW.status,NEW.assigned_date,NEW.due_date,NEW.completed_date,NEW.scale_version,NEW.participant_version,NEW.progress_owner,NEW.work_revision) IS NOT DISTINCT FROM (OLD.task_scale,OLD.progress_percentage,OLD.priority,OLD.category,OLD.status,OLD.assigned_date,OLD.due_date,OLD.completed_date,OLD.scale_version,OLD.participant_version,OLD.progress_owner,OLD.work_revision) THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='task_assignees' THEN
  entity:=CASE WHEN TG_OP='DELETE' THEN OLD.task_id ELSE NEW.task_id END;key:=entity::text;kind:='task';data:=taskpulse_private.task_observation(entity);
  IF data IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 ELSIF TG_TABLE_NAME='users' THEN
  entity:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;key:=entity::text;kind:='member';
  data:=CASE WHEN TG_OP='DELETE' THEN jsonb_build_object('id',entity,'deleted',true) ELSE jsonb_build_object('id',NEW.id,'fullName',NEW.full_name,'employeeId',NEW.employee_id,'role',NEW.role,'active',NEW.is_active,'deleted',false) END;
  IF TG_OP='UPDATE' AND (NEW.full_name,NEW.employee_id,NEW.role,NEW.is_active) IS NOT DISTINCT FROM (OLD.full_name,OLD.employee_id,OLD.role,OLD.is_active) THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='task_credit_balances' THEN
  entity:=NEW.task_id;key:=NEW.task_id::text||':'||NEW.user_id::text;kind:='credit';
  data:=jsonb_build_object('taskId',NEW.task_id,'userId',NEW.user_id,'scaledCredit',NEW.scaled_credit::text);
  IF TG_OP='UPDATE' AND NEW.scaled_credit IS NOT DISTINCT FROM OLD.scaled_credit THEN RETURN NEW; END IF;
 ELSE
  entity:=NEW.id;key:=entity::text;kind:='log';
  data:=jsonb_build_object('id',NEW.id,'taskId',NEW.task_id,'userId',NEW.user_id,'businessDate',NEW.log_date,
   'hours',NEW.hours_worked::text,'appliedProgress',NEW.effective_progress_delta::text,'capturedScale',NEW.credit_scale::text,
   'capturedShares',NEW.credit_shares,'shareVersion',NEW.participant_version::text,'version',NEW.execution_version::text,'effectContract',NEW.effect_contract,'reversedAt',NEW.reversed_at);
  IF TG_OP='UPDATE' AND (NEW.hours_worked,NEW.effective_progress_delta,NEW.credit_scale,NEW.credit_shares,NEW.log_date,NEW.reversed_at,NEW.execution_version) IS NOT DISTINCT FROM (OLD.hours_worked,OLD.effective_progress_delta,OLD.credit_scale,OLD.credit_shares,OLD.log_date,OLD.reversed_at,OLD.execution_version) THEN RETURN NEW; END IF;
 END IF;
 INSERT INTO taskpulse_private.performance_observations(kind,source_key,entity_id,data) VALUES(kind,key,entity,data);
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
INSERT INTO taskpulse_private.performance_observations(kind,source_key,entity_id,data) SELECT 'task',id::text,id,taskpulse_private.task_observation(id) FROM public.tasks;
INSERT INTO taskpulse_private.performance_observations(kind,source_key,entity_id,data) SELECT 'member',id::text,id,jsonb_build_object('id',id,'fullName',full_name,'employeeId',employee_id,'role',role,'active',is_active,'deleted',false) FROM public.users;
INSERT INTO taskpulse_private.performance_observations(kind,source_key,entity_id,data) SELECT 'credit',task_id::text||':'||user_id::text,task_id,jsonb_build_object('taskId',task_id,'userId',user_id,'scaledCredit',scaled_credit::text) FROM taskpulse_private.task_credit_balances;
INSERT INTO taskpulse_private.performance_observations(kind,source_key,entity_id,data) SELECT 'log',id::text,id,jsonb_build_object('id',id,'taskId',task_id,'userId',user_id,'businessDate',log_date,'hours',hours_worked::text,'appliedProgress',effective_progress_delta::text,'capturedScale',credit_scale::text,'capturedShares',credit_shares,'shareVersion',participant_version::text,'version',execution_version::text,'effectContract',effect_contract,'reversedAt',reversed_at) FROM public.daily_task_logs;
-- The baseline is an observed current state, never an invented earning timestamp.
INSERT INTO taskpulse_private.performance_contract DEFAULT VALUES;
CREATE TRIGGER zz_m07_task_observation AFTER INSERT OR UPDATE OR DELETE ON public.tasks FOR EACH ROW EXECUTE FUNCTION taskpulse_private.capture_performance_source();
CREATE TRIGGER zz_m07_participants_observation AFTER INSERT OR UPDATE OR DELETE ON public.task_assignees FOR EACH ROW EXECUTE FUNCTION taskpulse_private.capture_performance_source();
CREATE TRIGGER zz_m07_member_observation AFTER INSERT OR UPDATE OR DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION taskpulse_private.capture_performance_source();
CREATE TRIGGER zz_m07_credit_observation AFTER INSERT OR UPDATE ON taskpulse_private.task_credit_balances FOR EACH ROW EXECUTE FUNCTION taskpulse_private.capture_performance_source();
CREATE TRIGGER zz_m07_log_observation AFTER INSERT OR UPDATE ON public.daily_task_logs FOR EACH ROW EXECUTE FUNCTION taskpulse_private.capture_performance_source();
CREATE TRIGGER m07_observation_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.performance_observations FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();

CREATE TABLE taskpulse_private.manual_credit_inputs (
 audit_id bigint PRIMARY KEY,task_id uuid NOT NULL,business_date date NOT NULL,effective_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 scaled_credit numeric,shares jsonb,scale_version bigint,share_version bigint,provenance_known boolean NOT NULL);
INSERT INTO taskpulse_private.manual_credit_inputs(audit_id,task_id,business_date,provenance_known)
 SELECT id,row_id,(occurred_at AT TIME ZONE 'Asia/Kolkata')::date,false FROM taskpulse_private.audit_events WHERE command='progress' AND table_name='tasks';
CREATE FUNCTION taskpulse_private.capture_manual_credit_input() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ DECLARE t public.tasks;shares jsonb;amount numeric;known boolean; BEGIN
 IF NEW.command<>'progress' OR NEW.table_name<>'tasks' THEN RETURN NEW; END IF;
 SELECT * INTO STRICT t FROM public.tasks WHERE id=NEW.row_id;
 SELECT v.shares INTO shares FROM taskpulse_private.participant_versions v WHERE v.task_id=t.id AND v.version=t.participant_version;
 known:=t.participant_credit_mode='configured' AND shares IS NOT NULL AND NEW.protected_changes->'before'->>'progress' IS NOT NULL AND NEW.protected_changes->'before'->>'scale' IS NOT NULL AND (NEW.protected_changes->'before'->>'scale')::numeric=t.task_scale;
 amount:=CASE WHEN known THEN ((NEW.protected_changes->'after'->>'progress')::numeric-(NEW.protected_changes->'before'->>'progress')::numeric)*t.task_scale/100 END;
 INSERT INTO taskpulse_private.manual_credit_inputs(audit_id,task_id,business_date,scaled_credit,shares,scale_version,share_version,provenance_known)
 VALUES(NEW.id,t.id,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date,amount,shares,t.scale_version,t.participant_version,known);
 RETURN NEW;
END $$;
CREATE TRIGGER m07_manual_credit AFTER INSERT ON taskpulse_private.audit_events FOR EACH ROW EXECUTE FUNCTION taskpulse_private.capture_manual_credit_input();
CREATE TRIGGER m07_manual_credit_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.manual_credit_inputs FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();

CREATE FUNCTION taskpulse_private.performance_watermark(p_as_of timestamptz) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((SELECT max(revision) FROM taskpulse_private.performance_observations WHERE observed_at<=p_as_of),0)::text||':'||coalesce((SELECT max(sequence) FROM taskpulse_private.input_history WHERE recorded_at<=p_as_of),0)::text||':'||coalesce((SELECT max(audit_id) FROM taskpulse_private.manual_credit_inputs WHERE effective_at<=p_as_of),0)::text;
$$;
CREATE FUNCTION public.performance_source_context(p_from date,p_to_exclusive date,p_as_of timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE cutoff timestamptz;known boolean;members jsonb;tasks jsonb;attendance jsonb; BEGIN
 IF public.get_user_role() IS NULL AND current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Active team or narrow service worker required' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_to_exclusive IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to_exclusive) OR p_to_exclusive<=p_from OR p_to_exclusive-p_from>366 OR p_as_of IS NULL OR NOT isfinite(p_as_of) OR p_as_of>clock_timestamp() THEN RAISE EXCEPTION 'Explicit finite period/nonfuture as-of required' USING ERRCODE='23514'; END IF;
 -- Team aggregate rights do not grant arbitrary daily other-employee attendance reads.
 IF current_setting('role',true)<>'service_role' AND public.get_user_role() NOT IN ('managing_director','project_engineer') AND
  (p_from<>date_trunc('month',p_from)::date OR p_to_exclusive<>(p_from+interval '1 month')::date OR
   (p_as_of AT TIME ZONE 'Asia/Kolkata')::date<>least(p_to_exclusive-1,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date)) THEN
  RAISE EXCEPTION 'Team inputs use canonical monthly aggregate cutoffs; detailed/daily contexts require manager or service authority' USING ERRCODE='42501';
 END IF;
 SELECT available_from INTO cutoff FROM taskpulse_private.performance_contract;known:=p_as_of>=cutoff;
 WITH latest AS (SELECT DISTINCT ON(kind,source_key) kind,revision,data FROM taskpulse_private.performance_observations WHERE observed_at<=p_as_of ORDER BY kind,source_key,observed_at DESC,revision DESC)
 SELECT coalesce(jsonb_agg(data||jsonb_build_object('revision',revision::text) ORDER BY data->>'id'),'[]') INTO members FROM latest WHERE kind='member' AND data->>'deleted'='false';
 WITH latest AS (SELECT DISTINCT ON(kind,source_key) kind,revision,data FROM taskpulse_private.performance_observations WHERE observed_at<=p_as_of ORDER BY kind,source_key,observed_at DESC,revision DESC),
 effort AS (SELECT data->>'taskId' tid,sum((data->>'hours')::numeric) FILTER(WHERE data->>'reversedAt' IS NULL) hours,
  bool_or(data->>'appliedProgress' IS NULL OR data->>'capturedScale' IS NULL) FILTER(WHERE data->>'reversedAt' IS NULL) unknown_effect FROM latest WHERE kind='log' AND (data->>'businessDate')::date<=(p_as_of AT TIME ZONE 'Asia/Kolkata')::date GROUP BY 1),
 period_events AS (
  SELECT data->>'taskId' tid,CASE WHEN (data->>'appliedProgress')::numeric=0 THEN 0 ELSE (data->>'appliedProgress')::numeric*(data->>'capturedScale')::numeric/100 END amount,data->'capturedShares' shares,
   data->>'appliedProgress' IS NOT NULL AND ((data->>'appliedProgress')::numeric=0 OR data->>'capturedScale' IS NOT NULL AND jsonb_typeof(data->'capturedShares')='object') known
  FROM latest WHERE kind='log' AND data->>'reversedAt' IS NULL AND (data->>'businessDate')::date>=p_from AND (data->>'businessDate')::date<p_to_exclusive AND (data->>'businessDate')::date<=(p_as_of AT TIME ZONE 'Asia/Kolkata')::date
  UNION ALL SELECT task_id::text,scaled_credit,shares,scaled_credit=0 OR shares IS NOT NULL FROM taskpulse_private.checklist_credit_events
   WHERE effective_at<=p_as_of AND (effective_at AT TIME ZONE 'Asia/Kolkata')::date>=p_from AND (effective_at AT TIME ZONE 'Asia/Kolkata')::date<p_to_exclusive
  UNION ALL SELECT task_id::text,scaled_credit,shares,provenance_known FROM taskpulse_private.manual_credit_inputs WHERE effective_at<=p_as_of AND business_date>=p_from AND business_date<p_to_exclusive
 ), period_credits AS (
  SELECT e.tid,s.key uid,sum(e.amount*s.value::numeric/1000000) credit FROM period_events e CROSS JOIN LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(e.shares)='object' THEN e.shares ELSE '{}' END) s WHERE e.known GROUP BY 1,2
 ), task_events AS (
  SELECT data,observed_at,revision,lag(data->>'status') OVER(PARTITION BY source_key ORDER BY observed_at,revision) prior_status
  FROM taskpulse_private.performance_observations WHERE kind='task' AND observed_at<=p_as_of
 ), completions AS (
  SELECT DISTINCT ON(data->>'id') data FROM task_events WHERE data->>'status'='Done' AND prior_status IS NOT NULL AND prior_status<>'Done' ORDER BY data->>'id',observed_at DESC,revision DESC
 )
 SELECT coalesce(jsonb_agg(t.data||jsonb_build_object('revision',t.revision::text,'taskHours',coalesce(e.hours,0)::text,'unknownEffect',coalesce(e.unknown_effect,false),
  'credits',coalesce((SELECT jsonb_object_agg(c.data->>'userId',c.data->>'scaledCredit') FROM latest c WHERE c.kind='credit' AND c.data->>'taskId'=t.data->>'id'),'{}'),
  'periodCredits',coalesce((SELECT jsonb_object_agg(uid,credit::text) FROM period_credits WHERE tid=t.data->>'id'),'{}'),
  'periodCreditUnknown',coalesce((SELECT bool_or(NOT e.known) FROM period_events e WHERE e.tid=t.data->>'id'),false),
  'completionShares',(SELECT data->'shares' FROM completions WHERE data->>'id'=t.data->>'id'),
  'completionPrimary',(SELECT data->'primaryAssignee' FROM completions WHERE data->>'id'=t.data->>'id')) ORDER BY t.data->>'id'),'[]') INTO tasks
 FROM latest t LEFT JOIN effort e ON e.tid=t.data->>'id' WHERE t.kind='task' AND t.data->>'deleted'='false';
 -- Only aggregate attendance is returned to the team; private days/notes/times/IDs remain in their authorized RPC.
 SELECT coalesce(jsonb_agg(jsonb_build_object('userId',u->>'id','hours',CASE WHEN (a->>'validityAvailable')::boolean THEN (SELECT sum((d->>'attendanceHours')::numeric)::text FROM jsonb_array_elements(a->'days') d) END,
  'offHours',CASE WHEN (a->>'validityAvailable')::boolean THEN (SELECT sum((d->>'offHours')::numeric)::text FROM jsonb_array_elements(a->'days') d) END,
  'valid',a->'valid','available',a->'validityAvailable','reasons',a->'reasons','sourceRevision',taskpulse_private.performance_watermark(p_as_of)) ORDER BY u->>'id'),'[]') INTO attendance
 FROM jsonb_array_elements(members) u CROSS JOIN LATERAL (SELECT taskpulse_private.attendance_inputs((u->>'id')::uuid,p_from,p_to_exclusive,p_as_of) a) q;
 RETURN jsonb_build_object('contract','m07-sources-v1','periodStart',p_from,'periodEndExclusive',p_to_exclusive,'asOf',p_as_of,'asOfLocalDate',(p_as_of AT TIME ZONE 'Asia/Kolkata')::date,
  'sourceWatermark',taskpulse_private.performance_watermark(p_as_of),'historyAvailable',known,'historyAvailableFrom',cutoff,
  'members',members,'tasks',tasks,'attendance',attendance,'contributions',taskpulse_private.contribution_inputs(p_from,p_to_exclusive,p_as_of));
END $$;

CREATE FUNCTION taskpulse_private.invalidate_performance() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ DECLARE entity uuid;v bigint; BEGIN
 IF TG_TABLE_NAME='performance_observations' THEN entity:=NEW.entity_id;v:=NEW.revision;
 ELSE entity:=NEW.record_id;v:=NEW.sequence; END IF;
 INSERT INTO taskpulse_private.outbox_jobs(kind,entity_id,entity_version,operation_id,payload)
 VALUES(CASE WHEN TG_TABLE_NAME='performance_observations' THEN 'performance_source_invalidated' ELSE 'performance_dated_invalidated' END,entity,v,gen_random_uuid(),jsonb_build_object('ruleVersion','m07-ten-factor-v1','observedAt',clock_timestamp(),'sourceTable',TG_TABLE_NAME));
 RETURN NEW;
END $$;
CREATE TRIGGER m07_invalidate_source AFTER INSERT ON taskpulse_private.performance_observations FOR EACH ROW EXECUTE FUNCTION taskpulse_private.invalidate_performance();
CREATE TRIGGER m07_invalidate_dated AFTER INSERT ON taskpulse_private.input_history FOR EACH ROW EXECUTE FUNCTION taskpulse_private.invalidate_performance();
ALTER TABLE taskpulse_private.outbox_jobs ADD COLUMN lease_token uuid;
CREATE TABLE taskpulse_private.performance_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid NOT NULL REFERENCES taskpulse_private.outbox_jobs(id) ON DELETE RESTRICT,
 rule_version text NOT NULL,source_watermark text NOT NULL,context jsonb NOT NULL,result jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE public.monthly_performance_snapshots ADD COLUMN calculation_rule_version text NOT NULL DEFAULT 'legacy-before-m07',ADD COLUMN calculation_context jsonb,ADD COLUMN factor_components jsonb;
ALTER TABLE public.report_snapshots ADD COLUMN calculation_rule_version text NOT NULL DEFAULT 'legacy-before-m07';
CREATE FUNCTION taskpulse_private.retain_frozen_performance() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF TG_TABLE_NAME='monthly_performance_snapshots' THEN RAISE EXCEPTION 'Frozen report/snapshot requires a separately authorized M12 revision' USING ERRCODE='23514';
 ELSIF OLD.status='Final' THEN RAISE EXCEPTION 'Frozen report/snapshot requires a separately authorized M12 revision' USING ERRCODE='23514'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER m07_retain_month BEFORE UPDATE OR DELETE ON public.monthly_performance_snapshots FOR EACH ROW EXECUTE FUNCTION taskpulse_private.retain_frozen_performance();
CREATE TRIGGER m07_retain_report BEFORE UPDATE OR DELETE ON public.report_snapshots FOR EACH ROW EXECUTE FUNCTION taskpulse_private.retain_frozen_performance();
CREATE TRIGGER m07_run_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.performance_runs FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();
CREATE TABLE taskpulse_private.performance_job_receipts (job_id uuid NOT NULL,lease_token uuid NOT NULL,request jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(job_id,lease_token));
CREATE TRIGGER m07_job_receipt_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.performance_job_receipts FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();
CREATE FUNCTION public.claim_performance_jobs(p_limit integer DEFAULT 10) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE jobs jsonb; BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Narrow performance worker only' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>25 THEN RAISE EXCEPTION 'Bounded job batch required' USING ERRCODE='23514'; END IF;
 WITH selected AS (SELECT id FROM taskpulse_private.outbox_jobs WHERE kind IN ('performance_source_invalidated','performance_dated_invalidated')
  AND available_at<=clock_timestamp() AND (status IN ('pending','blocked','failed') OR status='running' AND locked_until<clock_timestamp())
  ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit),claimed AS (
  UPDATE taskpulse_private.outbox_jobs j SET status='running',attempts=attempts+1,locked_until=clock_timestamp()+interval '5 minutes',lease_token=gen_random_uuid()
  FROM selected s WHERE j.id=s.id RETURNING j.id,j.lease_token,j.payload,j.attempts)
 SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') INTO jobs FROM claimed c;
 INSERT INTO taskpulse_private.audit_events(actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 SELECT 'service_role','claim_performance_job','outbox_jobs',(j->>'id')::uuid,ARRAY['status','attempts'],jsonb_build_object('status','running','attempt',j->'attempts'),(j->>'lease_token')::uuid FROM jsonb_array_elements(jobs) j;
 RETURN jobs;
END $$;
CREATE FUNCTION public.finish_performance_job(p_job uuid,p_lease uuid,p_result jsonb,p_error text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE j taskpulse_private.outbox_jobs;ctx jsonb;request jsonb:=jsonb_build_object('result',p_result,'error',p_error);prior jsonb; BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Narrow performance worker only' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT r.request INTO prior FROM taskpulse_private.performance_job_receipts r WHERE job_id=p_job AND lease_token=p_lease;
 IF FOUND THEN IF prior IS DISTINCT FROM request THEN RAISE EXCEPTION 'Job lease reused with different outcome' USING ERRCODE='40001'; END IF;RETURN; END IF;
 SELECT * INTO j FROM taskpulse_private.outbox_jobs WHERE id=p_job FOR UPDATE;
 IF NOT FOUND OR j.kind NOT IN ('performance_source_invalidated','performance_dated_invalidated') OR j.status<>'running' OR j.lease_token IS DISTINCT FROM p_lease OR j.locked_until<=clock_timestamp() THEN RAISE EXCEPTION 'Current job lease required' USING ERRCODE='40001'; END IF;
 IF p_error IS NOT NULL THEN
  IF p_error NOT IN ('source_query_failed','calculation_failed','source_changed','frozen_period') THEN RAISE EXCEPTION 'Safe known failure code required' USING ERRCODE='23514'; END IF;
  UPDATE taskpulse_private.outbox_jobs SET status=CASE WHEN p_error='frozen_period' THEN 'blocked' ELSE 'failed' END,last_error_code=p_error,available_at=clock_timestamp()+interval '5 minutes',locked_until=NULL,lease_token=NULL WHERE id=p_job;
  INSERT INTO taskpulse_private.audit_events(actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id) VALUES('service_role','finish_performance_job','outbox_jobs',p_job,ARRAY['status','last_error_code'],jsonb_build_object('errorCode',p_error),p_lease);
  INSERT INTO taskpulse_private.performance_job_receipts VALUES(p_job,p_lease,request,clock_timestamp());RETURN;
 END IF;
 ctx:=p_result->'context';
 IF ctx->>'ruleVersion' IS DISTINCT FROM 'm07-ten-factor-v1' OR p_result->>'status' IS NULL OR p_result->>'status' NOT IN ('complete','incomplete') OR jsonb_typeof(p_result->'members') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Versioned shared-engine output required' USING ERRCODE='23514'; END IF;
 IF ctx->>'sourceWatermark' IS DISTINCT FROM taskpulse_private.performance_watermark(clock_timestamp()) THEN RAISE EXCEPTION 'Source changed during computation; retry current observations' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM public.monthly_performance_snapshots WHERE (make_date(snapshot_year,snapshot_month,1),make_date(snapshot_year,snapshot_month,1)+interval '1 month') OVERLAPS ((ctx->>'periodStart')::date,(ctx->>'periodEndExclusive')::date)) OR EXISTS(SELECT 1 FROM public.report_snapshots WHERE status='Final' AND (period_end IS NULL OR period_end>=(ctx->>'periodStart')::date) AND (period_start IS NULL OR period_start<(ctx->>'periodEndExclusive')::date)) THEN RAISE EXCEPTION 'Frozen period recomputation requires revision' USING ERRCODE='23514'; END IF;
 INSERT INTO taskpulse_private.performance_runs(job_id,rule_version,source_watermark,context,result) VALUES(p_job,ctx->>'ruleVersion',ctx->>'sourceWatermark',ctx,p_result);
 UPDATE taskpulse_private.outbox_jobs SET status=CASE WHEN p_result->>'status'='complete' THEN 'complete' ELSE 'blocked' END,last_error_code=CASE WHEN p_result->>'status'='incomplete' THEN 'required_inputs_unavailable' END,available_at=clock_timestamp()+interval '1 hour',locked_until=NULL,lease_token=NULL WHERE id=p_job;
 INSERT INTO taskpulse_private.audit_events(actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id) VALUES('service_role','finish_performance_job','outbox_jobs',p_job,ARRAY['status'],jsonb_build_object('calculationStatus',p_result->'status','sourceWatermark',ctx->'sourceWatermark'),p_lease);
 INSERT INTO taskpulse_private.performance_job_receipts VALUES(p_job,p_lease,request,clock_timestamp());
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.performance_source_context(date,date,timestamptz),public.claim_performance_jobs(integer),public.finish_performance_job(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.performance_source_context(date,date,timestamptz) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.claim_performance_jobs(integer),public.finish_performance_job(uuid,uuid,jsonb,text) TO service_role;
COMMIT;
