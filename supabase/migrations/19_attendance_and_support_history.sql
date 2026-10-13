-- M06 independent input integrity. Business populations/gating remain explicit guards.
BEGIN;
ALTER TABLE public.attendance_records ALTER COLUMN attendance_hours TYPE numeric,
 ALTER COLUMN off_hours TYPE numeric,
 ADD COLUMN record_version bigint NOT NULL DEFAULT 0,
 ADD COLUMN hours_confirmed boolean NOT NULL DEFAULT false,
 ADD COLUMN record_state text NOT NULL DEFAULT 'active' CHECK(record_state IN ('active','withdrawn'));
ALTER TABLE public.daily_facts ADD COLUMN record_version bigint NOT NULL DEFAULT 0, ADD COLUMN validation_state text NOT NULL DEFAULT 'pending' CHECK(validation_state IN ('legacy_unvalidated','pending','validated','rejected','withdrawn')), ADD COLUMN validation_at timestamptz, ADD COLUMN validation_reason text, ADD COLUMN related_task_id uuid REFERENCES public.tasks(id) ON DELETE RESTRICT;
ALTER TABLE public.ideas ADD COLUMN record_version bigint NOT NULL DEFAULT 0, ADD COLUMN validation_state text NOT NULL DEFAULT 'pending' CHECK(validation_state IN ('legacy_unvalidated','pending','validated','rejected','withdrawn')), ADD COLUMN validation_at timestamptz, ADD COLUMN validation_reason text, ADD COLUMN related_task_id uuid REFERENCES public.tasks(id) ON DELETE RESTRICT;
ALTER TABLE public.suggestions ADD COLUMN record_version bigint NOT NULL DEFAULT 0, ADD COLUMN validation_state text NOT NULL DEFAULT 'pending' CHECK(validation_state IN ('legacy_unvalidated','pending','validated','rejected','withdrawn')), ADD COLUMN validation_at timestamptz, ADD COLUMN validation_reason text, ADD COLUMN related_task_id uuid REFERENCES public.tasks(id) ON DELETE RESTRICT;
ALTER TABLE public.sales_logs ADD COLUMN record_version bigint NOT NULL DEFAULT 0, ADD COLUMN validation_state text NOT NULL DEFAULT 'pending' CHECK(validation_state IN ('legacy_unvalidated','pending','validated','rejected','withdrawn')), ADD COLUMN validation_at timestamptz, ADD COLUMN validation_reason text, ADD COLUMN related_task_id uuid REFERENCES public.tasks(id) ON DELETE RESTRICT;
ALTER TABLE public.meeting_points ADD COLUMN record_version bigint NOT NULL DEFAULT 0, ADD COLUMN validation_state text NOT NULL DEFAULT 'pending' CHECK(validation_state IN ('legacy_unvalidated','pending','validated','rejected','withdrawn')), ADD COLUMN validation_at timestamptz, ADD COLUMN validation_reason text, ADD COLUMN related_task_id uuid REFERENCES public.tasks(id) ON DELETE RESTRICT;
ALTER TABLE public.sales_logs ADD COLUMN validated_by uuid REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.meeting_points ADD COLUMN validated_by uuid REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.meeting_points ADD COLUMN owner_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
 ADD COLUMN point_type text, ADD COLUMN resolution text, ADD COLUMN comments text,
 ADD COLUMN resolution_status text CHECK(resolution_status IN ('Not Started','In Progress','Discarded','Done')),
 ADD COLUMN resolution_due date, ADD COLUMN resolved_on date;
-- Retained attribution must survive profile/admin operations too.
DO $$ DECLARE ref record;col text; BEGIN
 FOR ref IN SELECT c.conname,c.conrelid,c.conkey,t.relname FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE c.contype='f' AND c.confrelid='public.users'::regclass AND t.relname IN ('attendance_records','daily_facts','ideas','suggestions','sales_logs','meeting_points') LOOP
  SELECT attname INTO col FROM pg_attribute WHERE attrelid=ref.conrelid AND attnum=ref.conkey[1];
  EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I',ref.relname,ref.conname);
  EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY(%I) REFERENCES public.users(id) ON DELETE RESTRICT',ref.relname,ref.conname,col);
 END LOOP;
END $$;
CREATE FUNCTION taskpulse_private.retain_dated_source() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Dated records are retained; use a reasoned withdrawal' USING ERRCODE='23514'; END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['attendance_records','daily_facts','ideas','suggestions','sales_logs','meeting_points'] LOOP EXECUTE format('CREATE TRIGGER m06_retain_source BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION taskpulse_private.retain_dated_source()',t);END LOOP;END $$;
CREATE TABLE taskpulse_private.input_history (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, kind text NOT NULL, record_id uuid NOT NULL,
 record_version bigint NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 actor_id uuid, command text NOT NULL, reason text, source jsonb NOT NULL);
CREATE INDEX m06_input_history_lookup ON taskpulse_private.input_history(kind,record_id,recorded_at DESC,sequence DESC);
CREATE TABLE taskpulse_private.input_contract (id boolean PRIMARY KEY DEFAULT true CHECK(id), available_from timestamptz NOT NULL DEFAULT clock_timestamp());
INSERT INTO taskpulse_private.input_contract DEFAULT VALUES;
UPDATE public.daily_facts SET validation_state=CASE WHEN is_validated THEN 'validated' ELSE 'legacy_unvalidated' END;
UPDATE public.ideas SET validation_state=CASE WHEN is_validated THEN 'validated' ELSE 'legacy_unvalidated' END;
UPDATE public.suggestions SET validation_state=CASE WHEN is_validated THEN 'validated' ELSE 'legacy_unvalidated' END;
UPDATE public.sales_logs SET validation_state='legacy_unvalidated';
UPDATE public.meeting_points SET validation_state='legacy_unvalidated';
-- Resolver ownership was not stored in legacy rows; do not infer it from author.
INSERT INTO taskpulse_private.input_history(kind,record_id,record_version,command,source) SELECT 'attendance',id,record_version,'legacy_current_baseline',to_jsonb(t) FROM public.attendance_records t;
INSERT INTO taskpulse_private.input_history(kind,record_id,record_version,command,source) SELECT 'fact',id,record_version,'legacy_current_baseline',to_jsonb(t) FROM public.daily_facts t;
INSERT INTO taskpulse_private.input_history(kind,record_id,record_version,command,source) SELECT 'idea',id,record_version,'legacy_current_baseline',to_jsonb(t) FROM public.ideas t;
INSERT INTO taskpulse_private.input_history(kind,record_id,record_version,command,source) SELECT 'suggestion',id,record_version,'legacy_current_baseline',to_jsonb(t) FROM public.suggestions t;
INSERT INTO taskpulse_private.input_history(kind,record_id,record_version,command,source) SELECT 'sale',id,record_version,'legacy_current_baseline',to_jsonb(t) FROM public.sales_logs t;
INSERT INTO taskpulse_private.input_history(kind,record_id,record_version,command,source) SELECT 'meeting',id,record_version,'legacy_current_baseline',to_jsonb(t) FROM public.meeting_points t;
INSERT INTO taskpulse_private.input_history(kind,record_id,record_version,command,source)
 SELECT 'effort',id,execution_version,'legacy_current_baseline',jsonb_build_object('id',id,'user_id',user_id,'task_id',task_id,'log_date',log_date,'hours_worked',hours_worked,'reversed_at',reversed_at,'source_timer_id',source_timer_id,'segment_number',timer_segment_number) FROM public.daily_task_logs;
CREATE FUNCTION taskpulse_private.input_history_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Input history is retained; use a new reasoned revision' USING ERRCODE='23514'; END $$;
CREATE TRIGGER m06_history_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.input_history FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();
CREATE FUNCTION taskpulse_private.capture_effort_input() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ DECLARE old_user uuid;old_date date; BEGIN
 IF TG_OP='UPDATE' AND (NEW.user_id,NEW.log_date,NEW.hours_worked,NEW.reversed_at) IS NOT DISTINCT FROM (OLD.user_id,OLD.log_date,OLD.hours_worked,OLD.reversed_at) THEN RETURN NEW; END IF;
 INSERT INTO taskpulse_private.input_history(kind,record_id,record_version,actor_id,command,source)
 VALUES('effort',NEW.id,NEW.execution_version,auth.uid(),CASE WHEN TG_OP='INSERT' THEN 'effort_created' ELSE 'effort_corrected' END,
 jsonb_build_object('id',NEW.id,'user_id',NEW.user_id,'task_id',NEW.task_id,'log_date',NEW.log_date,'hours_worked',NEW.hours_worked,'reversed_at',NEW.reversed_at,'source_timer_id',NEW.source_timer_id,'segment_number',NEW.timer_segment_number));
 IF TG_OP='UPDATE' THEN old_user:=OLD.user_id;old_date:=OLD.log_date; END IF;
 INSERT INTO taskpulse_private.outbox_jobs(kind,entity_id,entity_version,operation_id,payload)
 VALUES('dated_effort_inputs_invalidated',NEW.id,NEW.execution_version,gen_random_uuid(),jsonb_build_object('user_id',NEW.user_id,'business_date',NEW.log_date,'old_user_id',old_user,'old_business_date',old_date,'rule_version','m06-inputs-v1','dependencies',ARRAY['M07','M08'])) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER m06_effort_history AFTER INSERT OR UPDATE ON public.daily_task_logs FOR EACH ROW EXECUTE FUNCTION taskpulse_private.capture_effort_input();
CREATE FUNCTION public.dated_record_command(p_kind text,p_id uuid,p_command text,p_payload jsonb,p_expected_version bigint,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  IF p_kind<>'attendance' AND p_command IN ('save','withdraw') AND NOT admin THEN RAISE EXCEPTION 'Own pending correction/withdrawal policy awaits M06 approval; managers retain administration' USING ERRCODE='23514'; END IF;
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
  IF p_id IS NOT NULL AND p_kind<>'attendance' AND before_row->>'validation_state' IN ('validated','rejected','withdrawn') THEN RAISE EXCEPTION 'Reviewed-record correction/reset policy awaits M06 approval' USING ERRCODE='23514'; END IF;
  PERFORM taskpulse_private.assert_open_date(uid,day);
  IF p_payload->>'asset_url' IS NOT NULL AND (p_payload->>'asset_url' !~ '^https?://[^[:space:]]+$' OR length(p_payload->>'asset_url')>4000) THEN RAISE EXCEPTION 'HTTP(S) asset link required' USING ERRCODE='23514'; END IF;
  IF p_payload->>'related_task_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=(p_payload->>'related_task_id')::uuid) THEN RAISE EXCEPTION 'Related task must exist' USING ERRCODE='23514'; END IF;
  body:=jsonb_build_object('id',tid,date_key,day,author_key,uid,'record_version',v);
  IF p_kind='attendance' THEN
   hours:=(p_payload->>'attendance_hours')::numeric;off_hours:=(p_payload->>'off_hours')::numeric;
   IF hours IS NULL OR off_hours IS NULL OR NOT(hours BETWEEN 0 AND 24 AND off_hours BETWEEN 0 AND 24) THEN RAISE EXCEPTION 'Explicit measured attendance/off hours 0-24 required; blank is not zero' USING ERRCODE='23514'; END IF;
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
   IF NOT admin THEN RAISE EXCEPTION 'Manager retained withdrawal authority required' USING ERRCODE='42501'; END IF;
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

CREATE FUNCTION public.dated_record_history(p_kind text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE h taskpulse_private.input_history;uid uuid;admin boolean; BEGIN
 IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated read required' USING ERRCODE='42501'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('attendance','fact','idea','suggestion','sale','meeting') THEN RAISE EXCEPTION 'Unsupported record history' USING ERRCODE='23514'; END IF;
 SELECT * INTO h FROM taskpulse_private.input_history WHERE kind=p_kind AND record_id=p_id ORDER BY sequence DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'History unavailable for that record' USING ERRCODE='23514'; END IF;
 uid:=(h.source->>CASE WHEN p_kind='attendance' THEN 'user_id' WHEN p_kind='sale' THEN 'sales_by' ELSE 'posted_by' END)::uuid;
 admin:=public.get_user_role() IN ('managing_director','project_engineer') OR (p_kind<>'attendance' AND public.get_user_role()='data_manager');
 IF NOT admin AND NOT EXISTS(SELECT 1 FROM taskpulse_private.input_history old WHERE old.kind=p_kind AND old.record_id=p_id AND old.source->>CASE WHEN p_kind='attendance' THEN 'user_id' WHEN p_kind='sale' THEN 'sales_by' ELSE 'posted_by' END=auth.uid()::text) THEN RAISE EXCEPTION 'Own history or approved administration required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_agg(jsonb_build_object('version',record_version,'recordedAt',recorded_at,'command',command,'reason',reason,'source',source) ORDER BY sequence) FROM taskpulse_private.input_history WHERE kind=p_kind AND record_id=p_id AND (admin OR source->>CASE WHEN p_kind='attendance' THEN 'user_id' WHEN p_kind='sale' THEN 'sales_by' ELSE 'posted_by' END=auth.uid()::text));
END $$;
CREATE FUNCTION public.attendance_input_context(p_user uuid,p_from date,p_to_exclusive date,p_as_of timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cutoff timestamptz;days jsonb;known boolean; BEGIN
 IF public.get_user_role() IS NULL OR p_user IS NULL OR NOT public.can_read_employee_details(p_user) THEN RAISE EXCEPTION 'Employee/manager detail visibility required' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_to_exclusive IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to_exclusive) OR p_to_exclusive<=p_from OR p_to_exclusive-p_from>366 OR p_as_of IS NULL OR NOT isfinite(p_as_of) OR p_as_of>clock_timestamp() THEN RAISE EXCEPTION 'Explicit valid period and nonfuture as-of instant required' USING ERRCODE='23514'; END IF;
 SELECT available_from INTO cutoff FROM taskpulse_private.input_contract;known:=p_as_of>=cutoff;
 WITH snapshots AS (SELECT DISTINCT ON(kind,record_id) kind,record_id,record_version,source FROM taskpulse_private.input_history WHERE kind IN ('attendance','effort') AND recorded_at<=p_as_of ORDER BY kind,record_id,recorded_at DESC,sequence DESC),
 attendance AS (SELECT record_id,record_version,source FROM snapshots WHERE kind='attendance' AND source->>'user_id'=p_user::text AND source->>'record_state'<>'withdrawn'),
 effort AS (SELECT (source->>'log_date')::date AS work_date,CASE WHEN bool_and((source->>'hours_worked')::numeric>=0 AND (source->>'hours_worked')::numeric<'Infinity'::numeric) THEN sum((source->>'hours_worked')::numeric) END AS hours,bool_and((source->>'hours_worked')::numeric>=0 AND (source->>'hours_worked')::numeric<'Infinity'::numeric) AS hours_valid,jsonb_agg(jsonb_build_object('id',record_id,'version',record_version,'taskId',source->>'task_id','timerId',source->>'source_timer_id','segmentNumber',source->'segment_number')) ids FROM snapshots WHERE kind='effort' AND source->>'user_id'=p_user::text AND source->>'reversed_at' IS NULL GROUP BY 1)
 SELECT coalesce(jsonb_agg(jsonb_build_object('businessDate',d.day::date,'attendanceId',a.record_id,'attendanceVersion',a.record_version,'status',a.source->>'status',
 'attendanceHours',CASE WHEN known AND (a.source->>'hours_confirmed')::boolean THEN a.source->>'attendance_hours' END,
 'offHours',CASE WHEN known AND (a.source->>'hours_confirmed')::boolean THEN a.source->>'off_hours' END,
 'effortHours',CASE WHEN known AND coalesce(e.hours_valid,true) THEN coalesce(e.hours,0)::text END,'effortSources',coalesce(e.ids,'[]'),
 'available',false,'valid',NULL,'reasons',array_remove(ARRAY['attendance_scope_and_special_states_unapproved',CASE WHEN NOT known THEN 'history_before_input_baseline' END,CASE WHEN e.hours_valid=false THEN 'effort_hours_invalid' END,CASE WHEN a.record_id IS NULL THEN 'attendance_missing' WHEN NOT (a.source->>'hours_confirmed')::boolean THEN 'legacy_hours_unconfirmed' END],NULL)) ORDER BY d.day),'[]') INTO days
 FROM generate_series(p_from::timestamp,least(p_to_exclusive-1,(p_as_of AT TIME ZONE 'Asia/Kolkata')::date)::timestamp,interval '1 day') d(day)
 LEFT JOIN attendance a ON (a.source->>'attendance_date')::date=d.day::date LEFT JOIN effort e ON e.work_date=d.day::date;
 RETURN jsonb_build_object('ruleVersion','m06-attendance-inputs-v1','userId',p_user,'periodStart',p_from,'periodEndExclusive',p_to_exclusive,'asOf',p_as_of,'historyAvailableFrom',cutoff,'historyAvailable',known,'validityAvailable',false,'valid',NULL,'reasons',ARRAY['attendance_scope_and_special_states_unapproved'],'days',days);
END $$;
CREATE FUNCTION public.contribution_input_context(p_from date,p_to_exclusive date,p_as_of timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cutoff timestamptz;result jsonb; BEGIN
 IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated read required' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_to_exclusive IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to_exclusive) OR p_to_exclusive<=p_from OR p_to_exclusive-p_from>366 OR p_as_of IS NULL OR NOT isfinite(p_as_of) OR p_as_of>clock_timestamp() THEN RAISE EXCEPTION 'Explicit valid period and nonfuture as-of instant required' USING ERRCODE='23514'; END IF;
 SELECT available_from INTO cutoff FROM taskpulse_private.input_contract;
 WITH snapshots AS (SELECT DISTINCT ON(kind,record_id) kind,record_id,record_version,recorded_at,source FROM taskpulse_private.input_history WHERE kind IN ('fact','idea','suggestion','sale') AND recorded_at<=p_as_of ORDER BY kind,record_id,recorded_at DESC,sequence DESC),
 dated AS (SELECT *,source->>CASE kind WHEN 'fact' THEN 'fact_date' WHEN 'idea' THEN 'idea_date' WHEN 'suggestion' THEN 'suggestion_date' ELSE 'sale_date' END AS business_date,source->>CASE WHEN kind='sale' THEN 'sales_by' ELSE 'posted_by' END author FROM snapshots),
 sources AS (SELECT * FROM dated WHERE business_date::date>=p_from AND business_date::date<p_to_exclusive AND business_date::date<=(p_as_of AT TIME ZONE 'Asia/Kolkata')::date)
 SELECT jsonb_build_object('ruleVersion','m06-support-inputs-v1','periodStart',p_from,'periodEndExclusive',p_to_exclusive,'asOf',p_as_of,'historyAvailableFrom',cutoff,'historyAvailable',p_as_of>=cutoff,
 'available',false,'reasons',ARRAY['contribution_population_and_effective_date_unapproved','sales_field_mapping_missing'],
 'sources',coalesce((SELECT jsonb_agg(jsonb_build_object('id',record_id,'kind',kind,'version',record_version,'attributedTo',author,'businessDate',business_date,'state',source->>'validation_state','validator',source->>'validated_by','validatedAt',source->>'validation_at','salesFields',CASE WHEN kind='sale' THEN jsonb_build_object('builtUpAreaSource',source->>'project_built_up_area','isNewProject',source->'is_new_project','basementPaymentReceived',source->'basement_payment_received') END,'observedAt',recorded_at,'provenanceReason',CASE WHEN author IS NULL THEN 'legacy_author_missing' WHEN source->>'validation_state'='validated' AND (source->>'validation_at' IS NULL OR source->>'validated_by' IS NULL OR source->>'validated_by'=author) THEN 'legacy_validation_provenance_missing' END) ORDER BY kind,record_id) FROM sources),'[]'),
 'factors',jsonb_build_object('fact',jsonb_build_object('rawValue',NULL,'available',false,'reasons',ARRAY['contribution_population_and_effective_date_unapproved']),'idea',jsonb_build_object('rawValue',NULL,'available',false,'reasons',ARRAY['contribution_population_and_effective_date_unapproved']),'suggestion',jsonb_build_object('rawValue',NULL,'available',false,'reasons',ARRAY['contribution_population_and_effective_date_unapproved']),'sale',jsonb_build_object('rawValue',NULL,'available',false,'reasons',ARRAY['sales_field_mapping_missing'])),
 'populations',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM (SELECT kind,author,source->>'validation_state' state,count(*) count FROM sources GROUP BY kind,author,source->>'validation_state') c),'[]'),
 'raw',jsonb_build_object('fact',NULL,'idea',NULL,'suggestion',NULL,'sale',NULL),
 'coefficients',jsonb_build_object('fact',jsonb_build_array(0.75,0.38),'idea',jsonb_build_array(2,0.75),'suggestion',jsonb_build_array(2,0.75),'sale',jsonb_build_object('BO',1.5,'BN',1,'BP',0.75,'divisor',50))) INTO result;
 RETURN result;
END $$;
REVOKE INSERT,UPDATE,DELETE ON public.attendance_records FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.daily_facts FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.ideas FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.suggestions FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.sales_logs FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.meeting_points FROM anon,authenticated;
DO $$ DECLARE t text;cols text; BEGIN FOREACH t IN ARRAY ARRAY['attendance_records','daily_facts','ideas','suggestions','sales_logs','meeting_points'] LOOP
 SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute WHERE attrelid=('public.'||t)::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE 'REVOKE INSERT('||cols||'),UPDATE('||cols||') ON public.'||t||' FROM anon,authenticated'; END LOOP; END $$;
REVOKE ALL ON taskpulse_private.input_history,taskpulse_private.input_contract FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.dated_record_command(text,uuid,text,jsonb,bigint,uuid),public.dated_record_history(text,uuid),public.attendance_input_context(uuid,date,date,timestamptz),public.contribution_input_context(date,date,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dated_record_command(text,uuid,text,jsonb,bigint,uuid),public.dated_record_history(text,uuid),public.attendance_input_context(uuid,date,date,timestamptz),public.contribution_input_context(date,date,timestamptz) TO authenticated;
COMMIT;
