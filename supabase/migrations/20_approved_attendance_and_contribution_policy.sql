-- M06 follow-up approvals: daily validity, source-date/as-of credit and own pending corrections.
-- Migration19 is retained; no historical values or frozen snapshots are rewritten.
BEGIN;
CREATE OR REPLACE FUNCTION public.dated_record_command(p_kind text,p_id uuid,p_command text,p_payload jsonb,p_expected_version bigint,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();role public.user_role;admin boolean;table_name text;date_key text;author_key text;body_key text;body jsonb;before_row jsonb;after_row jsonb;uid uuid;day date;tid uuid:=coalesce(p_id,gen_random_uuid());v bigint;reason text;state text;receipt taskpulse_private.command_receipts;request jsonb:=jsonb_build_array(p_kind,p_id,p_command,p_payload,p_expected_version);result jsonb;cols text;vals text;item record;check_in timestamptz;check_out timestamptz;hours numeric;off_hours numeric; BEGIN
 SELECT u.role INTO role FROM public.users u WHERE u.id=actor AND u.is_active FOR SHARE;
 IF role IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('attendance','fact','idea','suggestion','sale','meeting') OR p_command IS NULL OR p_command NOT IN ('save','validate','withdraw') OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_operation IS NULL THEN RAISE EXCEPTION 'Invalid dated record command' USING ERRCODE='23514'; END IF;
 admin:=role IN ('managing_director','project_engineer') OR (p_kind<>'attendance' AND role='data_manager');
 table_name:=CASE p_kind WHEN 'attendance' THEN 'attendance_records' WHEN 'fact' THEN 'daily_facts' WHEN 'idea' THEN 'ideas' WHEN 'suggestion' THEN 'suggestions' WHEN 'sale' THEN 'sales_logs' ELSE 'meeting_points' END;
 date_key:=CASE p_kind WHEN 'attendance' THEN 'attendance_date' WHEN 'fact' THEN 'fact_date' WHEN 'idea' THEN 'idea_date' WHEN 'suggestion' THEN 'suggestion_date' WHEN 'sale' THEN 'sale_date' ELSE 'meeting_date' END;
 author_key:=CASE p_kind WHEN 'attendance' THEN 'user_id' WHEN 'sale' THEN 'sales_by' ELSE 'posted_by' END;
 body_key:=CASE p_kind WHEN 'fact' THEN 'fact' WHEN 'idea' THEN 'idea' WHEN 'suggestion' THEN 'suggestion' WHEN 'meeting' THEN 'point' ELSE 'notes' END;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||'dated_'||p_kind||p_command||p_operation::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command='dated_'||p_kind||'_'||p_command AND operation_id=p_operation;
 IF FOUND THEN IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='40001'; END IF;RETURN receipt.result_payload; END IF;
 IF p_id IS NOT NULL THEN
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',table_name) INTO before_row USING p_id;
  IF before_row IS NULL THEN RAISE EXCEPTION 'Record no longer exists' USING ERRCODE='23514'; END IF;
  IF p_expected_version IS DISTINCT FROM (before_row->>'record_version')::bigint THEN RAISE EXCEPTION 'Record changed; reload before saving' USING ERRCODE='40001'; END IF;
  IF NOT admin AND (before_row->>author_key)::uuid IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Own record or administration rights required' USING ERRCODE='42501'; END IF;
  IF p_kind<>'attendance' AND p_command IN ('save','withdraw') AND NOT admin AND before_row->>'validation_state'<>'pending' THEN RAISE EXCEPTION 'Authors may edit/withdraw only their own pending records' USING ERRCODE='42501'; END IF;
  IF before_row->>author_key IS NULL AND (EXISTS(SELECT 1 FROM public.monthly_performance_snapshots WHERE snapshot_year=extract(year FROM (before_row->>date_key)::date) AND snapshot_month=extract(month FROM (before_row->>date_key)::date)) OR EXISTS(SELECT 1 FROM public.report_snapshots WHERE status='Final' AND (period_start IS NULL OR period_start<=(before_row->>date_key)::date) AND (period_end IS NULL OR period_end>=(before_row->>date_key)::date))) THEN RAISE EXCEPTION 'Unattributed legacy record may belong to a frozen period; reconciliation/revision required' USING ERRCODE='23514'; END IF;
  PERFORM taskpulse_private.assert_open_date((before_row->>author_key)::uuid,(before_row->>date_key)::date);
 ELSE
  IF p_command<>'save' OR coalesce(p_expected_version,0)<>0 THEN RAISE EXCEPTION 'New records use save and version zero' USING ERRCODE='23514'; END IF;
 END IF;
 reason:=nullif(btrim(p_payload->>'reason'),'');
 IF length(coalesce(reason,''))>1000 OR (p_id IS NOT NULL AND reason IS NULL) THEN RAISE EXCEPTION 'Changes require a concise reason' USING ERRCODE='23514'; END IF;
 v:=coalesce((before_row->>'record_version')::bigint,0)+1;
 IF p_command='save' THEN
  IF p_payload-(ARRAY['business_date','author_id','content','reason']||CASE p_kind
   WHEN 'attendance' THEN ARRAY['attendance_status','attendance_hours','off_hours','check_in_at','check_out_at','holiday_name']
   WHEN 'sale' THEN ARRAY['asset_url','related_task_id','project_built_up_area','project_location','client_name','is_new_project','basement_payment_received']
   WHEN 'meeting' THEN ARRAY['asset_url','related_task_id','meeting_type','owner_id','point_type','resolution','comments','resolution_status','resolution_due','resolved_on']
   ELSE ARRAY['asset_url','related_task_id'] END)<>'{}' THEN RAISE EXCEPTION 'Unexpected fields for this record kind' USING ERRCODE='23514'; END IF;
  IF p_payload->>'business_date' IS NULL OR p_payload->>'business_date'!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Explicit ISO business date required' USING ERRCODE='23514'; END IF;
  day:=(p_payload->>'business_date')::date;uid:=CASE WHEN p_id IS NULL THEN coalesce((p_payload->>'author_id')::uuid,actor) ELSE coalesce((p_payload->>'author_id')::uuid,(before_row->>author_key)::uuid) END;
  IF uid IS NULL THEN RAISE EXCEPTION 'Legacy author is unknown; explicit manager reconciliation required' USING ERRCODE='23514'; END IF;
  IF day IS NULL OR NOT isfinite(day) OR day>(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date THEN RAISE EXCEPTION 'Explicit valid local business date required; future records need separate scheduling policy' USING ERRCODE='23514'; END IF;
  IF (NOT admin AND uid<>actor) OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=uid AND is_active) THEN RAISE EXCEPTION 'Active permitted record attribution required' USING ERRCODE='42501'; END IF;
  IF p_id IS NOT NULL AND p_kind<>'attendance' AND before_row->>'validation_state'='withdrawn' THEN RAISE EXCEPTION 'Withdrawn records retain history; restoration requires separate authorization' USING ERRCODE='23514'; END IF;
  PERFORM taskpulse_private.assert_open_date(uid,day);
  IF p_payload->>'asset_url' IS NOT NULL AND (p_payload->>'asset_url' !~ '^https?://[^[:space:]]+$' OR length(p_payload->>'asset_url')>4000) THEN RAISE EXCEPTION 'HTTP(S) asset link required' USING ERRCODE='23514'; END IF;
  IF p_payload->>'related_task_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=(p_payload->>'related_task_id')::uuid) THEN RAISE EXCEPTION 'Related task must exist' USING ERRCODE='23514'; END IF;
  body:=jsonb_build_object('id',tid,date_key,day,author_key,uid,'record_version',v);
  IF p_kind='attendance' THEN
   hours:=(p_payload->>'attendance_hours')::numeric;off_hours:=(p_payload->>'off_hours')::numeric;
   IF hours IS NULL OR off_hours IS NULL OR NOT(hours BETWEEN 0 AND 24 AND off_hours BETWEEN 0 AND 24) THEN RAISE EXCEPTION 'Explicit measured attendance/off hours 0-24 required; blank is not zero' USING ERRCODE='23514'; END IF;
   IF hours+off_hours>24 OR (p_payload->>'attendance_status' IN ('Absent','Leave') AND (hours<>0 OR off_hours<>0)) OR (p_payload->>'attendance_status' IN ('Holiday','Off Hours') AND hours<>0) THEN RAISE EXCEPTION 'Attendance state must match measured regular/off hours; total cannot exceed a local day' USING ERRCODE='23514'; END IF;
   check_in:=(p_payload->>'check_in_at')::timestamptz;check_out:=(p_payload->>'check_out_at')::timestamptz;
   IF (check_in IS NULL)<>(check_out IS NULL) OR (check_in IS NOT NULL AND (NOT isfinite(check_in) OR NOT isfinite(check_out) OR (check_in AT TIME ZONE 'Asia/Kolkata')::date<>day OR (check_out AT TIME ZONE 'Asia/Kolkata')::date<>day OR check_out<check_in OR hours>extract(epoch FROM check_out-check_in)/3600)) THEN RAISE EXCEPTION 'Check times must form a consistent local-day pair covering entered attendance hours' USING ERRCODE='23514'; END IF;
   IF p_payload->>'attendance_status' IS NULL THEN RAISE EXCEPTION 'Attendance status required' USING ERRCODE='23514'; END IF;
   body:=body||jsonb_build_object('status',(p_payload->>'attendance_status')::public.attendance_status,'attendance_hours',hours,'off_hours',off_hours,'check_in_at',check_in,'check_out_at',check_out,'recorded_by',actor,'notes',p_payload->>'content','holiday_name',p_payload->>'holiday_name','hours_confirmed',true,'record_state','active');
   IF p_id IS NULL AND EXISTS(SELECT 1 FROM public.attendance_records WHERE user_id=uid AND attendance_date=day) THEN RAISE EXCEPTION 'Attendance exists; select the dated record and its current version for correction' USING ERRCODE='40001'; END IF;
  ELSE
   IF p_kind<>'sale' AND nullif(btrim(p_payload->>'content'),'') IS NULL THEN RAISE EXCEPTION 'Record content required' USING ERRCODE='23514'; END IF;
   body:=body||jsonb_build_object(body_key,p_payload->>'content','validation_state','pending','validated_by',NULL,'validation_at',NULL,'validation_reason',NULL,'related_task_id',(p_payload->>'related_task_id')::uuid);
   IF p_kind IN ('fact','idea','suggestion') THEN body:=body||jsonb_build_object('folder_url',p_payload->>'asset_url','is_validated',false);
   ELSIF p_kind='sale' THEN
    IF jsonb_typeof(p_payload->'is_new_project') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_payload->'basement_payment_received') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Explicit sales flags required' USING ERRCODE='23514'; END IF;
    body:=body||jsonb_build_object('project_built_up_area',p_payload->>'project_built_up_area','project_location',p_payload->>'project_location','client_name',p_payload->>'client_name','project_folder_url',p_payload->>'asset_url','is_new_project',(p_payload->>'is_new_project')::boolean,'basement_payment_received',(p_payload->>'basement_payment_received')::boolean);
   ELSE
    IF p_payload->>'point_type' IS NOT NULL AND p_payload->>'point_type' NOT IN ('Blocking Issue','Concern','Lessons Learned','Work Improvement','General Point') THEN RAISE EXCEPTION 'Choose a source-backed point type' USING ERRCODE='23514'; END IF;
    IF p_payload->>'resolved_on' IS NOT NULL AND (NOT isfinite((p_payload->>'resolved_on')::date) OR (p_payload->>'resolved_on')::date>(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date) OR p_payload->>'resolution_due' IS NOT NULL AND NOT isfinite((p_payload->>'resolution_due')::date) THEN RAISE EXCEPTION 'Finite meeting dates required; resolved-on cannot be a future observation' USING ERRCODE='23514'; END IF;
    IF p_payload->>'owner_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=(p_payload->>'owner_id')::uuid AND is_active) THEN RAISE EXCEPTION 'Meeting owner must be active' USING ERRCODE='23514'; END IF;
    body:=body||jsonb_build_object('folder_url',p_payload->>'asset_url','meeting_type',p_payload->>'meeting_type','owner_id',CASE WHEN p_payload?'owner_id' THEN (p_payload->>'owner_id')::uuid ELSE (before_row->>'owner_id')::uuid END,'point_type',p_payload->>'point_type','resolution',p_payload->>'resolution','comments',p_payload->>'comments','resolution_status',coalesce(p_payload->>'resolution_status',before_row->>'resolution_status',CASE WHEN p_id IS NULL THEN 'Not Started' END),'resolution_due',(p_payload->>'resolution_due')::date,'resolved_on',(p_payload->>'resolved_on')::date);
   END IF;
  END IF;
 ELSE
  IF p_payload-ARRAY['state','reason']<>'{}' OR p_id IS NULL THEN RAISE EXCEPTION 'State and reason only for existing records' USING ERRCODE='23514'; END IF;
  IF p_command='validate' THEN
   IF p_kind='attendance' OR NOT admin OR (before_row->>author_key)::uuid IS NULL OR (before_row->>author_key)::uuid=actor THEN RAISE EXCEPTION 'Independent support validator required; self-validation denied' USING ERRCODE='42501'; END IF;
   state:=p_payload->>'state';IF state IS NULL OR state NOT IN ('pending','validated','rejected') OR before_row->>'validation_state'='withdrawn' THEN RAISE EXCEPTION 'Choose pending, validated or rejected for a retained active record' USING ERRCODE='23514'; END IF;
   body:=jsonb_build_object('validation_state',state,'validated_by',actor,'validation_at',clock_timestamp(),'validation_reason',reason,'record_version',v);
   IF p_kind IN ('fact','idea','suggestion') THEN body:=body||jsonb_build_object('is_validated',state='validated'); END IF;
  ELSE
   IF NOT admin AND (p_kind='attendance' OR before_row->>'validation_state'<>'pending') THEN RAISE EXCEPTION 'Own pending support or approved administration required for withdrawal' USING ERRCODE='42501'; END IF;
   body:=jsonb_build_object('record_version',v,CASE WHEN p_kind='attendance' THEN 'record_state' ELSE 'validation_state' END,'withdrawn');
   IF p_kind IN ('fact','idea','suggestion') THEN body:=body||jsonb_build_object('is_validated',false); END IF;
  END IF;
 END IF;
 SELECT string_agg(format('%I',key),','),string_agg(format('(jsonb_populate_record(NULL::public.%I,$1)).%I',table_name,key),',') INTO cols,vals FROM jsonb_object_keys(body) key;
 IF p_id IS NULL THEN EXECUTE format('INSERT INTO public.%I(%s) SELECT %s RETURNING to_jsonb(%I.*)',table_name,cols,vals,table_name) INTO after_row USING body;
 ELSE
  SELECT string_agg(format('%I=(jsonb_populate_record(NULL::public.%I,$1)).%I',key,table_name,key),',') INTO cols FROM jsonb_object_keys(body) key;
  EXECUTE format('UPDATE public.%I SET %s WHERE id=$2 RETURNING to_jsonb(%I.*)',table_name,cols,table_name) INTO after_row USING body,p_id;
 END IF;
 INSERT INTO taskpulse_private.input_history(kind,record_id,record_version,actor_id,command,reason,source) VALUES(p_kind,tid,v,actor,p_command,reason,after_row);
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id) VALUES(actor,role::text,'dated_'||p_kind||'_'||p_command,table_name,tid,ARRAY(SELECT jsonb_object_keys(body)),jsonb_build_object('version',v,'old_author',before_row->author_key,'old_date',before_row->date_key,'author',after_row->author_key,'date',after_row->date_key,'state',after_row->'validation_state','reason',reason),p_operation);
 INSERT INTO taskpulse_private.outbox_jobs(kind,entity_id,entity_version,operation_id,payload) VALUES('dated_record_inputs_invalidated',tid,v,p_operation,jsonb_build_object('kind',p_kind,'author_id',after_row->author_key,'business_date',after_row->date_key,'old_author_id',before_row->author_key,'old_business_date',before_row->date_key,'observed_at',clock_timestamp(),'rule_version','m06-inputs-v1','dependencies',ARRAY['M07','M08']));
 result:=jsonb_build_object('id',tid,'version',v,'state',coalesce(after_row->>'validation_state',after_row->>'record_state'));
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload) VALUES(actor,'dated_'||p_kind||'_'||p_command,p_operation,request,tid,result);RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.attendance_input_context(p_user uuid,p_from date,p_to_exclusive date,p_as_of timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cutoff timestamptz;days jsonb;known boolean;ready boolean;period_valid boolean;reasons jsonb; BEGIN
 IF public.get_user_role() IS NULL OR p_user IS NULL OR NOT public.can_read_employee_details(p_user) THEN RAISE EXCEPTION 'Employee/manager detail visibility required' USING ERRCODE='42501'; END IF;
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

-- Pure source arithmetic only: no eligibility cohort, median subtraction or composite score.
-- NULL p_user is a source-wide total; each employee also has an explicit factor input.
CREATE FUNCTION taskpulse_private.contribution_raw_inputs(p_sources jsonb,p_known boolean,p_user uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k text;validated bigint;pending bigint;unknown boolean;reasons text[];result jsonb:='{}';raw numeric; BEGIN
 FOREACH k IN ARRAY ARRAY['fact','idea','suggestion','sale'] LOOP
  SELECT count(*) FILTER(WHERE s->>'state'='validated'),count(*) FILTER(WHERE s->>'state'='pending'),
   coalesce(bool_or(s->>'state' NOT IN ('rejected','withdrawn') AND
    (s->>'attributedTo' IS NULL OR s->>'state'='legacy_unvalidated' OR
     (s->>'state'='validated' AND (s->>'validatedAt' IS NULL OR s->>'validator' IS NULL OR s->>'validator'=s->>'attributedTo')))),false)
   INTO validated,pending,unknown FROM jsonb_array_elements(p_sources) s
   WHERE s->>'kind'=k AND (p_user IS NULL OR s->>'attributedTo'=p_user::text OR s->>'attributedTo' IS NULL);
  reasons:=array_remove(ARRAY[CASE WHEN NOT p_known THEN 'history_before_input_baseline' END,
   CASE WHEN unknown THEN 'legacy_population_or_validation_provenance_missing' END,
   CASE WHEN k='sale' THEN 'sales_field_mapping_missing' END],NULL);
  raw:=CASE WHEN cardinality(reasons)=0 THEN validated*CASE WHEN k='fact' THEN 0.75 ELSE 2 END+pending*CASE WHEN k='fact' THEN 0.38 ELSE 0.75 END END;
  result:=result||jsonb_build_object(k,jsonb_build_object('available',cardinality(reasons)=0,'rawValue',raw,'validatedCount',validated,'eligibleUnvalidatedCount',pending,'reasons',reasons));
 END LOOP;RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.contribution_input_context(p_from date,p_to_exclusive date,p_as_of timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cutoff timestamptz;known boolean;sources jsonb;populations jsonb;factors jsonb;employees jsonb; BEGIN
 IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated team input visibility required' USING ERRCODE='42501'; END IF;
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
REVOKE ALL ON FUNCTION taskpulse_private.contribution_raw_inputs(jsonb,boolean,uuid) FROM PUBLIC,anon,authenticated,service_role;
-- CREATE OR REPLACE preserves the narrow authenticated grants from migration19.
COMMIT;

