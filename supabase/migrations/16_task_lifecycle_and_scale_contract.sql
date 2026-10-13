-- M03: date/eligibility contract, protected lifecycle commands and prospective scales.
BEGIN;
ALTER TABLE public.tasks ALTER COLUMN freshness DROP NOT NULL;
ALTER TABLE public.tasks ALTER COLUMN task_productivity DROP DEFAULT;
ALTER TABLE public.tasks ADD COLUMN lifecycle_version bigint NOT NULL DEFAULT 0,
 ADD COLUMN work_revision bigint NOT NULL DEFAULT 0, ADD COLUMN started_date date,
 ADD COLUMN reopened_at timestamptz, ADD COLUMN eligibility_reasons text[] NOT NULL DEFAULT '{}',
 ADD COLUMN freshness_reason text, ADD COLUMN productivity_available boolean NOT NULL DEFAULT false,
 ADD COLUMN scale_mode text NOT NULL DEFAULT 'manual' CHECK(scale_mode IN ('manual','hours','activity_count','linked')),
 ADD COLUMN scale_inputs jsonb NOT NULL DEFAULT '{}', ADD COLUMN scale_override numeric,
 ADD COLUMN scale_provenance text NOT NULL DEFAULT 'legacy stored value',
 ADD COLUMN scale_version bigint NOT NULL DEFAULT 0, ADD COLUMN scale_effective_at timestamptz NOT NULL DEFAULT clock_timestamp();
-- Change defaults before backfill DML queues deferred participant checks.
ALTER TABLE public.tasks ALTER COLUMN scale_provenance SET DEFAULT 'New manual input';
ALTER TABLE public.task_reviewers ADD COLUMN reviewed_revision bigint;
-- Preserve numeric input values and identity; expand intermediate precision.
ALTER TABLE public.tasks DROP COLUMN scaled_progress;
ALTER TABLE public.tasks ALTER COLUMN task_scale TYPE numeric;
ALTER TABLE public.tasks ADD COLUMN scaled_progress numeric GENERATED ALWAYS AS (task_scale*progress_percentage/100) STORED;
UPDATE public.tasks SET scale_inputs=jsonb_build_object('value',task_scale);
CREATE TABLE taskpulse_private.scale_versions (
 task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE RESTRICT, version bigint NOT NULL,
 effective_at timestamptz NOT NULL, value numeric, mode text NOT NULL, inputs jsonb NOT NULL,
 override_value numeric, provenance text NOT NULL, PRIMARY KEY(task_id,version));
INSERT INTO taskpulse_private.scale_versions SELECT id,0,scale_effective_at,task_scale,scale_mode,scale_inputs,scale_override,scale_provenance FROM public.tasks;

CREATE FUNCTION taskpulse_private.priority_weight(p public.task_priority) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE p WHEN 'No' THEN 0.25 WHEN 'Low' THEN 0.5 WHEN 'Medium' THEN 0.75 WHEN 'High' THEN 1 WHEN 'Focus' THEN 1.2 END;
$$;
CREATE FUNCTION taskpulse_private.eligibility_reasons(p_priority public.task_priority,p_status public.task_status,p_progress numeric,p_scale numeric)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT array_remove(ARRAY[CASE WHEN p_priority='No' THEN 'priority_no' END,
  CASE WHEN p_status='Not Started' THEN 'not_started' END,CASE WHEN p_status='Discarded' THEN 'discarded' END,
  CASE WHEN p_progress IS NULL THEN 'progress_missing' WHEN p_progress<15 THEN 'progress_below_15' END,
  CASE WHEN p_scale IS NULL OR NOT(p_scale<'Infinity'::numeric) THEN 'scale_missing' WHEN p_scale<=0 THEN 'scale_nonpositive' END],NULL);
$$;
CREATE FUNCTION taskpulse_private.freshness_result(p_assigned date,p_due date,p_completed date,p_status public.task_status,p_asof date)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ DECLARE ref date:=coalesce(p_completed,p_asof); state text; reason text; BEGIN
 IF p_status='Discarded' THEN reason:='discarded_unavailable';
 ELSIF ref IS NULL OR p_assigned IS NULL OR p_due IS NULL OR NOT pg_catalog.isfinite(ref) OR NOT pg_catalog.isfinite(p_assigned) OR NOT pg_catalog.isfinite(p_due) THEN reason:='missing_or_invalid_dates';
 ELSIF p_status='Done' AND p_completed IS NULL THEN reason:='completion_date_missing';
 ELSIF p_assigned>ref THEN reason:='future_assignment';
 ELSIF p_completed>p_asof THEN reason:='inconsistent_dates';
 ELSE state:=CASE WHEN ref-p_assigned<=3 THEN 'Super Fresh' WHEN ref<=p_due THEN 'Fresh'
  WHEN ref-p_due<=2 THEN 'Almost Fresh' WHEN ref-p_due<=4 THEN 'Almost Stale' WHEN ref-p_due<=7 THEN 'Stale' ELSE 'Rotten' END; END IF;
 RETURN jsonb_build_object('state',state,'reason',reason);
END $$;
CREATE FUNCTION taskpulse_private.task_state() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ DECLARE f jsonb; BEGIN
 IF TG_OP='INSERT' AND NEW.scale_mode='manual' AND NEW.scale_inputs='{}' THEN NEW.scale_inputs:=jsonb_build_object('value',NEW.task_scale); END IF;
 NEW.eligibility_reasons:=taskpulse_private.eligibility_reasons(NEW.priority,NEW.status,NEW.progress_percentage,NEW.task_scale);
 NEW.valid_for_metrics:=cardinality(NEW.eligibility_reasons)=0;
 f:=taskpulse_private.freshness_result(NEW.assigned_date,NEW.due_date,NEW.completed_date,NEW.status,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
 NEW.freshness:=(f->>'state')::public.task_freshness; NEW.freshness_reason:=f->>'reason';
 RETURN NEW;
END $$;
CREATE TRIGGER z_m03_task_state BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION taskpulse_private.task_state();

CREATE FUNCTION taskpulse_private.invalidate_reviews() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE tid uuid; BEGIN
 IF TG_TABLE_NAME='tasks' THEN
  IF (NEW.title,NEW.description,NEW.progress_percentage,NEW.status,NEW.task_scale,NEW.priority,NEW.due_date,NEW.participant_version,NEW.scale_mode,NEW.scale_inputs,NEW.scale_override)
   IS NOT DISTINCT FROM (OLD.title,OLD.description,OLD.progress_percentage,OLD.status,OLD.task_scale,OLD.priority,OLD.due_date,OLD.participant_version,OLD.scale_mode,OLD.scale_inputs,OLD.scale_override) THEN RETURN NEW; END IF;
  tid:=NEW.id;
 ELSE
  IF TG_OP='UPDATE' AND to_jsonb(NEW)-ARRAY['updated_at','execution_version'] IS NOT DISTINCT FROM to_jsonb(OLD)-ARRAY['updated_at','execution_version'] THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME IN ('daily_task_logs','task_detail_sections') THEN tid:=CASE WHEN TG_OP='DELETE' THEN OLD.task_id ELSE NEW.task_id END;
  ELSIF TG_TABLE_NAME='task_checklists' THEN tid:=CASE WHEN TG_OP='DELETE' THEN OLD.task_id ELSE NEW.task_id END;
  ELSE SELECT task_id INTO tid FROM public.task_checklists WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.checklist_id ELSE NEW.checklist_id END; END IF;
 END IF;
 UPDATE public.tasks SET work_revision=work_revision+1,lifecycle_version=lifecycle_version+1 WHERE id=tid;
 UPDATE public.task_reviewers SET review_approved=false,reviewed_at=NULL,reviewed_revision=NULL WHERE task_id=tid;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER m03_invalidate_review AFTER UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION taskpulse_private.invalidate_reviews();
CREATE TRIGGER m03_invalidate_log_review AFTER INSERT OR UPDATE ON public.daily_task_logs FOR EACH ROW EXECUTE FUNCTION taskpulse_private.invalidate_reviews();
CREATE TRIGGER m03_invalidate_checklist_review AFTER INSERT OR UPDATE OR DELETE ON public.checklist_nodes FOR EACH ROW EXECUTE FUNCTION taskpulse_private.invalidate_reviews();
CREATE TRIGGER m03_invalidate_structure_review AFTER INSERT OR UPDATE OR DELETE ON public.task_checklists FOR EACH ROW EXECUTE FUNCTION taskpulse_private.invalidate_reviews();

CREATE FUNCTION taskpulse_private.capture_scale_version() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF TG_OP='INSERT' OR NEW.scale_version<>OLD.scale_version THEN
  INSERT INTO taskpulse_private.scale_versions VALUES(NEW.id,NEW.scale_version,NEW.scale_effective_at,NEW.task_scale,NEW.scale_mode,NEW.scale_inputs,NEW.scale_override,NEW.scale_provenance);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER m03_scale_version AFTER INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION taskpulse_private.capture_scale_version();

CREATE FUNCTION taskpulse_private.derive_scale(p_task uuid) RETURNS numeric LANGUAGE plpgsql SET search_path='' AS $$ DECLARE t public.tasks; amount numeric; BEGIN
 SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task;
 IF t.scale_override IS NOT NULL THEN RETURN t.scale_override; END IF;
 IF t.scale_mode='manual' THEN RETURN (t.scale_inputs->>'value')::numeric;
 ELSIF t.scale_mode='hours' THEN SELECT coalesce(sum(hours_worked),0)*12.5*(t.scale_inputs->>'multiplier')::numeric INTO amount
  FROM public.daily_task_logs WHERE task_id=p_task AND reversed_at IS NULL;
 ELSIF t.scale_mode='activity_count' THEN amount:=(t.scale_inputs->>'activity_count')::numeric*(t.scale_inputs->>'unit_scale')::numeric;
 ELSE SELECT task_scale*(t.scale_inputs->>'percentage')::numeric/100 INTO amount FROM public.tasks WHERE id=(t.scale_inputs->>'source_task_id')::uuid;
 END IF;
 IF amount IS NULL OR NOT(amount>=0 AND amount<'Infinity'::numeric) THEN RAISE EXCEPTION 'Scale source is unmeasured or invalid; reconcile its source' USING ERRCODE='23514'; END IF;
 RETURN amount;
END $$;
CREATE OR REPLACE FUNCTION taskpulse_private.refresh_task_metrics(p_task uuid,p_operation uuid,p_date date) RETURNS bigint
LANGUAGE plpgsql SET search_path='' AS $$ DECLARE tid uuid; amount numeric; total_hours numeric; v bigint; root_version bigint; t public.tasks; BEGIN
 -- All domain command entrypoints take this lock before task locks. Graph updates serialize.
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 FOR tid IN WITH RECURSIVE dependants(id,path) AS (
  SELECT p_task,ARRAY[p_task] UNION ALL SELECT c.id,d.path||c.id FROM public.tasks c JOIN dependants d
   ON c.scale_mode='linked' AND c.scale_inputs->>'source_task_id'=d.id::text WHERE NOT c.id=ANY(d.path))
  SELECT id FROM dependants ORDER BY cardinality(path),id LOOP
  SELECT * INTO STRICT t FROM public.tasks WHERE id=tid FOR UPDATE;
  IF t.status IN ('Done','Discarded') AND tid<>p_task THEN
   INSERT INTO taskpulse_private.outbox_jobs(kind,entity_id,entity_version,operation_id,payload)
    VALUES('closed_scale_dependency_changed',tid,t.metric_version,p_operation,jsonb_build_object('source',p_task,'reason','closed_state_retained')) ON CONFLICT DO NOTHING;
   CONTINUE;
  END IF;
  IF t.scale_mode<>'manual' AND t.status NOT IN ('Done','Discarded') THEN
   amount:=taskpulse_private.derive_scale(tid);
   IF amount IS DISTINCT FROM t.task_scale THEN
    PERFORM taskpulse_private.assert_task_open_date(tid,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
    UPDATE public.tasks SET task_scale=amount,scale_version=scale_version+1,scale_effective_at=clock_timestamp() WHERE id=tid;
   END IF;
  END IF;
  SELECT coalesce(sum(hours_worked),0) INTO total_hours FROM public.daily_task_logs WHERE task_id=tid AND reversed_at IS NULL;
  IF EXISTS(SELECT 1 FROM public.daily_task_logs WHERE task_id=tid AND reversed_at IS NULL AND NOT(hours_worked>=0 AND hours_worked<'Infinity'::numeric)) THEN total_hours:=NULL; END IF;
  UPDATE public.tasks SET task_productivity=CASE WHEN total_hours>0 AND total_hours<'Infinity'::numeric THEN round(progress_percentage/total_hours,2) ELSE NULL END,
   productivity_available=coalesce(total_hours>0 AND total_hours<'Infinity'::numeric AND progress_percentage IS NOT NULL,false),metric_version=metric_version+1 WHERE id=tid RETURNING metric_version INTO v;
  INSERT INTO taskpulse_private.outbox_jobs(kind,entity_id,entity_version,operation_id,payload)
   VALUES('task_metrics_invalidated',tid,v,p_operation,jsonb_build_object('contract','m03-task-state-v1','affected_date',p_date,'dependencies',ARRAY['M05','M07'],'reason','task_state_changed'));
  IF tid=p_task THEN root_version:=v; END IF;
 END LOOP;
 RETURN root_version;
END $$;
-- M02 trigger still guards deletion, metric metadata and checklist ownership.
CREATE OR REPLACE FUNCTION taskpulse_private.guard_execution_task() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF TG_OP='DELETE' AND (EXISTS(SELECT 1 FROM public.daily_task_logs WHERE task_id=OLD.id) OR EXISTS(SELECT 1 FROM public.task_timers WHERE task_id=OLD.id)) THEN
  RAISE EXCEPTION 'Execution history must be retained; archive policy pending' USING ERRCODE='23514'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE FUNCTION taskpulse_private.task_command(p_task uuid,p_command text,p_payload jsonb,p_version bigint,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$ DECLARE actor uuid:=auth.uid(); role public.user_role; t public.tasks; receipt taskpulse_private.command_receipts;
 request jsonb; result jsonb; desired public.task_status; reason text; asof date:=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
 inputs jsonb; mode text; override_value numeric; amount numeric; source_id uuid; item record; BEGIN
 SELECT u.role INTO role FROM public.users u WHERE id=actor AND is_active FOR SHARE;
 IF role IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_operation IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_command NOT IN ('transition','progress','scale','review') THEN
  RAISE EXCEPTION 'Invalid task command' USING ERRCODE='23514'; END IF;
 IF (p_command='transition' AND p_payload-ARRAY['status','reason']<>'{}') OR (p_command='progress' AND p_payload-ARRAY['progress']<>'{}') OR
  (p_command='scale' AND p_payload-ARRAY['mode','inputs','override','reason','provenance']<>'{}') OR (p_command='review' AND p_payload-ARRAY['approved']<>'{}') THEN
  RAISE EXCEPTION 'Unexpected task fields' USING ERRCODE='23514'; END IF;
 request:=jsonb_build_array(p_task,p_payload,p_version);
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||p_command||p_operation::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=p_command AND operation_id=p_operation;
 IF FOUND THEN IF receipt.request<>request THEN RAISE EXCEPTION 'Operation key reused with different input' USING ERRCODE='40001'; END IF; RETURN receipt.result_payload; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task FOR UPDATE;
 asof:=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
 IF p_version IS NULL OR p_version<>t.lifecycle_version THEN RAISE EXCEPTION 'Task changed; reload before saving' USING ERRCODE='40001'; END IF;
 IF p_command='review' THEN
  IF jsonb_typeof(p_payload->'approved') IS DISTINCT FROM 'boolean' OR NOT EXISTS(SELECT 1 FROM public.task_reviewers WHERE task_id=p_task AND user_id=actor) THEN
   RAISE EXCEPTION 'Assigned reviewer and boolean decision required' USING ERRCODE='42501'; END IF;
  UPDATE public.task_reviewers SET review_approved=(p_payload->>'approved')::boolean,reviewed_at=clock_timestamp(),reviewed_revision=t.work_revision WHERE task_id=p_task AND user_id=actor;
 ELSE
  IF NOT (role IN ('managing_director','project_engineer') OR public.is_task_assignee(p_task)) THEN RAISE EXCEPTION 'Assigned actor or manager required' USING ERRCODE='42501'; END IF;
  PERFORM taskpulse_private.assert_task_open_date(p_task,asof);
  reason:=nullif(btrim(p_payload->>'reason'),'');
  IF length(coalesce(reason,''))>1000 THEN RAISE EXCEPTION 'Reason too long' USING ERRCODE='23514'; END IF;
  IF p_command='transition' THEN
   desired:=(p_payload->>'status')::public.task_status;
   IF desired IS NULL THEN RAISE EXCEPTION 'Status required' USING ERRCODE='23514'; END IF;
   IF desired='Done' THEN RAISE EXCEPTION 'Done requires initialized Setup, Activity and Closure evidence; M05 representation is not yet available' USING ERRCODE='23514'; END IF;
   IF t.status IN ('Done','Discarded') AND desired<>'In Progress' THEN RAISE EXCEPTION 'Reopen terminal tasks into In Progress first' USING ERRCODE='23514'; END IF;
   IF desired='Carryover' THEN
    IF role NOT IN ('managing_director','project_engineer') THEN RAISE EXCEPTION 'Manager carryover authority required' USING ERRCODE='42501'; END IF;
    IF reason IS NULL THEN RAISE EXCEPTION 'Carryover requires a reason' USING ERRCODE='23514'; END IF;
   END IF;
   IF desired='Discarded' OR t.status IN ('Done','Discarded') OR desired='Not Started' THEN
    IF role NOT IN ('managing_director','project_engineer') THEN RAISE EXCEPTION 'Manager lifecycle authority required' USING ERRCODE='42501'; END IF;
    IF reason IS NULL THEN RAISE EXCEPTION 'Cancellation, reopening and reset require a reason' USING ERRCODE='23514'; END IF;
   END IF;
   UPDATE public.tasks SET status=desired,started_date=CASE WHEN desired='In Progress' THEN coalesce(started_date,asof) ELSE started_date END,
    reopened_at=CASE WHEN t.status IN ('Done','Discarded') AND desired='In Progress' THEN clock_timestamp() ELSE reopened_at END,
    completed_date=NULL,met_deadline=NULL WHERE id=p_task;
  ELSIF p_command='progress' THEN
   IF t.status IN ('Done','Discarded') THEN RAISE EXCEPTION 'Reopen before changing terminal progress' USING ERRCODE='23514'; END IF;
   amount:=(p_payload->>'progress')::numeric;
   IF amount IS NULL OR NOT(amount BETWEEN 0 AND 100) OR amount<>round(amount,2) THEN RAISE EXCEPTION 'Progress must be finite 0-100 with two decimals' USING ERRCODE='23514'; END IF;
   IF amount IS DISTINCT FROM t.progress_percentage AND t.task_scale IS NULL THEN
    RAISE EXCEPTION 'Progress credit requires a measured scale; reconcile the scale first' USING ERRCODE='23514'; END IF;
   PERFORM taskpulse_private.assert_progress_owner(p_task,amount-coalesce(t.progress_percentage,0));
   UPDATE public.tasks SET progress_percentage=amount WHERE id=p_task;
  ELSE
   IF role NOT IN ('managing_director','project_engineer') THEN RAISE EXCEPTION 'Manager scale authority required' USING ERRCODE='42501'; END IF;
   IF t.status IN ('Done','Discarded') THEN RAISE EXCEPTION 'Closed scale requires reopening or authorized historical revision' USING ERRCODE='23514'; END IF;
   mode:=p_payload->>'mode'; inputs:=p_payload->'inputs'; override_value:=(p_payload->>'override')::numeric;
   IF reason IS NULL OR nullif(btrim(p_payload->>'provenance'),'') IS NULL OR length(p_payload->>'provenance')>1000 OR jsonb_typeof(inputs) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Scale inputs, reason and source provenance required' USING ERRCODE='23514'; END IF;
   IF mode NOT IN ('manual','hours','activity_count','linked') OR mode IS NULL OR
    (mode='manual' AND (inputs-ARRAY['value']<>'{}' OR NOT inputs?'value')) OR
    (mode='hours' AND (inputs-ARRAY['multiplier']<>'{}' OR NOT inputs?'multiplier')) OR
    (mode='activity_count' AND (inputs-ARRAY['activity_count','unit_scale']<>'{}' OR NOT(inputs?'activity_count' AND inputs?'unit_scale'))) OR
    (mode='linked' AND (inputs-ARRAY['source_task_id','percentage']<>'{}' OR NOT(inputs?'source_task_id' AND inputs?'percentage'))) THEN
    RAISE EXCEPTION 'Unsupported scale formula/inputs' USING ERRCODE='23514'; END IF;
   FOR item IN SELECT key,value FROM jsonb_each(inputs-'source_task_id') LOOP
    IF jsonb_typeof(item.value)<>'number' OR NOT((item.value::text)::numeric>=0 AND (item.value::text)::numeric<'Infinity'::numeric) THEN
     RAISE EXCEPTION 'Finite nonnegative scale inputs required' USING ERRCODE='23514'; END IF;
   END LOOP;
   IF override_value IS NOT NULL AND NOT(override_value>=0 AND override_value<'Infinity'::numeric) THEN RAISE EXCEPTION 'Finite nonnegative override required' USING ERRCODE='23514'; END IF;
   IF mode='activity_count' AND (inputs->>'activity_count')::numeric<>trunc((inputs->>'activity_count')::numeric) THEN RAISE EXCEPTION 'Numeric activity count must be a whole number' USING ERRCODE='23514'; END IF;
   IF mode='linked' THEN
    source_id:=(inputs->>'source_task_id')::uuid;
    IF (inputs->>'percentage')::numeric>100 OR NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=source_id AND task_scale IS NOT NULL) THEN RAISE EXCEPTION 'Known scale source and percentage 0-100 required' USING ERRCODE='23514'; END IF;
    IF EXISTS(WITH RECURSIVE chain(id,path) AS (SELECT source_id,ARRAY[source_id] UNION ALL
      SELECT (c.scale_inputs->>'source_task_id')::uuid,chain.path||(c.scale_inputs->>'source_task_id')::uuid FROM public.tasks c JOIN chain ON c.id=chain.id
       WHERE c.scale_mode='linked' AND NOT (c.scale_inputs->>'source_task_id')::uuid=ANY(chain.path)) SELECT 1 FROM chain WHERE id=p_task) THEN
     RAISE EXCEPTION 'Linked scale cycle rejected' USING ERRCODE='23514'; END IF;
   END IF;
   UPDATE public.tasks SET scale_mode=mode,scale_inputs=inputs,scale_override=override_value,scale_provenance=p_payload->>'provenance' WHERE id=p_task;
   amount:=taskpulse_private.derive_scale(p_task);
   UPDATE public.tasks SET task_scale=amount,scale_version=scale_version+1,scale_effective_at=clock_timestamp() WHERE id=p_task;
  END IF;
  PERFORM taskpulse_private.refresh_task_metrics(p_task,p_operation,asof);
 END IF;
 UPDATE public.tasks SET lifecycle_version=lifecycle_version+1 WHERE id=p_task;
 result:=jsonb_build_object('taskId',p_task,'taskTag',t.task_tag,'version',(SELECT lifecycle_version FROM public.tasks WHERE id=p_task));
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(actor,role::text,p_command,'tasks',p_task,ARRAY[p_command],jsonb_build_object('reason',reason,
  'before',jsonb_build_object('status',t.status,'progress',t.progress_percentage,'scale',t.task_scale,'scale_version',t.scale_version),
  'after',(SELECT jsonb_build_object('status',status,'progress',progress_percentage,'scale',task_scale,'scale_version',scale_version,'work_revision',work_revision,'review_approved',CASE WHEN p_command='review' THEN p_payload->'approved' ELSE NULL END) FROM public.tasks WHERE id=p_task)),p_operation);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload) VALUES(actor,p_command,p_operation,request,p_task,result);
 RETURN result;
END $$;
CREATE FUNCTION public.task_lifecycle_command(p_task_id uuid,p_command text,p_payload jsonb,p_expected_version bigint,p_operation_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT taskpulse_private.task_command(p_task_id,p_command,p_payload,p_expected_version,p_operation_id); $$;
REVOKE ALL ON FUNCTION public.task_lifecycle_command(uuid,text,jsonb,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.task_lifecycle_command(uuid,text,jsonb,bigint,uuid) TO authenticated;
-- Retire unversioned approvals. Compatibility name returns a clear error.
CREATE OR REPLACE FUNCTION public.record_task_review(p_task_id uuid,p_approved boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 RAISE EXCEPTION 'Use versioned task_lifecycle_command review' USING ERRCODE='23514'; END $$;
-- Same scheduler/Edge RPC, now calendar-derived; no updated_at-age model remains.
CREATE OR REPLACE FUNCTION public.decay_task_freshness() RETURNS TABLE(updated_count integer,rotten_count integer,stale_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE owner_name name; row_data record; operation uuid:=gen_random_uuid(); BEGIN
 SELECT pg_get_userbyid(relowner) INTO owner_name FROM pg_class WHERE oid='taskpulse_private.audit_events'::regclass;
 IF current_setting('role',true)<>'service_role' AND session_user<>owner_name THEN RAISE EXCEPTION 'Trusted freshness worker required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 updated_count:=0; rotten_count:=0; stale_count:=0;
 FOR row_data IN SELECT t.id FROM public.tasks t WHERE (freshness,freshness_reason) IS DISTINCT FROM
  ((taskpulse_private.freshness_result(t.assigned_date,t.due_date,t.completed_date,t.status,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date)->>'state')::public.task_freshness,
   taskpulse_private.freshness_result(t.assigned_date,t.due_date,t.completed_date,t.status,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date)->>'reason') ORDER BY t.id FOR UPDATE LOOP
  PERFORM taskpulse_private.refresh_task_metrics(row_data.id,operation,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
  updated_count:=updated_count+1;
  IF (SELECT freshness FROM public.tasks WHERE id=row_data.id)='Rotten' THEN rotten_count:=rotten_count+1; END IF;
  IF (SELECT freshness FROM public.tasks WHERE id=row_data.id)='Stale' THEN stale_count:=stale_count+1; END IF;
 END LOOP;
 INSERT INTO taskpulse_private.audit_events(actor_role,command,table_name,changed_fields,protected_changes,operation_id)
  VALUES(CASE WHEN current_setting('role',true)='service_role' THEN 'service_role' ELSE 'cron_owner' END,'calendar_freshness_refresh','tasks',ARRAY['freshness'],jsonb_build_object('updated_count',updated_count,'as_of',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date),operation);
 RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.decay_task_freshness() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.decay_task_freshness() TO service_role;
-- Legacy records get derived current-state classification only; no log/report rewrite.
UPDATE public.tasks SET valid_for_metrics=valid_for_metrics;
-- Initialize current rate availability from measured source hours, never from eligibility.
-- No progress/log/credit/snapshot values are backfilled by this current-state update.
UPDATE public.tasks t SET task_productivity=CASE WHEN effort.hours>0 AND effort.hours<'Infinity'::numeric AND effort.valid_hours
 THEN round(t.progress_percentage/effort.hours,2) ELSE NULL END,
 productivity_available=coalesce(effort.hours>0 AND effort.hours<'Infinity'::numeric AND effort.valid_hours AND t.progress_percentage IS NOT NULL,false)
FROM (SELECT t0.id,coalesce(sum(l.hours_worked),0) AS hours,
 coalesce(bool_and(l.hours_worked>=0 AND l.hours_worked<'Infinity'::numeric),true) AS valid_hours
 FROM public.tasks t0 LEFT JOIN public.daily_task_logs l ON l.task_id=t0.id AND l.reversed_at IS NULL GROUP BY t0.id) effort WHERE t.id=effort.id;
-- Force protected changes through atomic commands (remove inherited column grants too).
REVOKE INSERT,UPDATE,DELETE ON public.tasks FROM anon,authenticated;
DO $$ DECLARE cols text; BEGIN SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute WHERE attrelid='public.tasks'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE 'REVOKE INSERT('||cols||'),UPDATE('||cols||') ON public.tasks FROM anon,authenticated'; END $$;
REVOKE ALL ON taskpulse_private.scale_versions FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.save_task_with_participants(p_task_id uuid,p_fields jsonb,p_assignees uuid[],p_reviewers uuid[],
 p_share_units integer[],p_expected_version bigint,p_accept_legacy boolean,p_operation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_role public.user_role; tid uuid; t public.tasks; receipt taskpulse_private.command_receipts; request jsonb; changed boolean; BEGIN
 SELECT role INTO actor_role FROM public.users WHERE id=auth.uid() AND is_active FOR SHARE;
 IF actor_role IS NULL OR public.get_user_role() NOT IN ('managing_director','project_engineer') THEN
   RAISE EXCEPTION 'Active task manager required' USING ERRCODE='42501'; END IF;
 IF p_operation_id IS NULL OR p_fields IS NULL OR jsonb_typeof(p_fields)<>'object' OR
   p_fields-ARRAY['task_tag','title','category','priority','due_date','task_scale','expected_lifecycle_version','description','comments']<>'{}'::jsonb THEN
   RAISE EXCEPTION 'Invalid task command' USING ERRCODE='23514'; END IF;
 IF p_fields->>'due_date' IS NOT NULL AND p_fields->>'due_date'!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Deadline requires an ISO calendar date or null' USING ERRCODE='23514'; END IF;
 IF nullif(btrim(p_fields->>'task_tag'),'') IS NULL OR nullif(btrim(p_fields->>'title'),'') IS NULL OR
  ((p_fields->>'task_scale') IS NOT NULL AND NOT((p_fields->>'task_scale')::numeric>=0 AND (p_fields->>'task_scale')::numeric<'Infinity'::numeric)) THEN
  RAISE EXCEPTION 'Nonblank identity/title and finite nonnegative scale required' USING ERRCODE='23514'; END IF;
 request:=jsonb_build_array(p_task_id,p_fields,p_assignees,p_reviewers,p_share_units,p_expected_version,p_accept_legacy);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || p_operation_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=auth.uid() AND operation_id=p_operation_id AND command='save_task_with_participants';
 IF FOUND THEN
   IF receipt.request<>request THEN RAISE EXCEPTION 'Operation key reused with different input' USING ERRCODE='23514'; END IF;
   RETURN receipt.result;
 END IF;
 IF p_task_id IS NULL THEN
   INSERT INTO public.tasks(task_tag,title,category,priority,due_date,task_scale,assignee_id,reviewer_id,valid_for_metrics,description,comments,assigned_date)
   VALUES(p_fields->>'task_tag',p_fields->>'title',(p_fields->>'category')::public.task_category,
    (p_fields->>'priority')::public.task_priority,(p_fields->>'due_date')::date,(p_fields->>'task_scale')::numeric,
    p_assignees[1],p_reviewers[1],coalesce((p_fields->>'task_scale')::numeric>0 AND p_fields->>'category'<>'OT',false),p_fields->>'description',p_fields->>'comments',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date) RETURNING id INTO tid;
   PERFORM public.set_task_participants(tid,p_assignees,p_reviewers,p_share_units,0,true);
 ELSE
   SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task_id FOR UPDATE;
   IF p_expected_version IS NULL OR t.participant_version<>p_expected_version THEN
     RAISE EXCEPTION 'Participants changed; reload before saving' USING ERRCODE='40001'; END IF;
   IF (p_fields->>'expected_lifecycle_version')::bigint IS DISTINCT FROM t.lifecycle_version THEN
    RAISE EXCEPTION 'Task changed; reload before structural save' USING ERRCODE='40001'; END IF;
   IF p_fields->>'task_tag' IS DISTINCT FROM t.task_tag THEN RAISE EXCEPTION 'Stable tag edits require an alias policy' USING ERRCODE='23514'; END IF;
   IF p_fields?'task_scale' AND (p_fields->>'task_scale')::numeric IS DISTINCT FROM t.task_scale THEN RAISE EXCEPTION 'Use the versioned scale command for a scale change' USING ERRCODE='23514'; END IF;
   IF t.status IN ('Done','Discarded') THEN RAISE EXCEPTION 'Reopen before structural edits' USING ERRCODE='23514'; END IF;
   PERFORM taskpulse_private.assert_task_open_date(p_task_id,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
   tid:=p_task_id;
   -- Unchanged legacy participants retain unresolved historical attribution.
   changed := p_share_units IS NOT NULL OR (t.participant_credit_mode='legacy' AND p_accept_legacy) OR
     t.assignee_id IS DISTINCT FROM p_assignees[1] OR t.reviewer_id IS DISTINCT FROM p_reviewers[1] OR
     (SELECT array_agg(x ORDER BY x) FROM unnest(p_assignees) x) IS DISTINCT FROM
       (SELECT array_agg(x ORDER BY x) FROM (SELECT user_id x FROM public.task_assignees WHERE task_id=tid UNION SELECT t.assignee_id) s) OR
     coalesce((SELECT array_agg(x ORDER BY x) FROM unnest(p_reviewers) x),ARRAY[]::uuid[]) IS DISTINCT FROM
       coalesce((SELECT array_agg(x ORDER BY x) FROM (SELECT user_id x FROM public.task_reviewers WHERE task_id=tid UNION SELECT t.reviewer_id WHERE t.reviewer_id IS NOT NULL) s),ARRAY[]::uuid[]);
   IF changed THEN
     -- Editing reviewers/primary order does not silently reset custom shares.
     IF p_share_units IS NULL AND t.participant_credit_mode='configured' AND
       (SELECT array_agg(x ORDER BY x) FROM unnest(p_assignees) x) =
       (SELECT array_agg(user_id ORDER BY user_id) FROM public.task_assignees WHERE task_id=tid) THEN
       SELECT array_agg(a.share_units ORDER BY p.ordinality) INTO p_share_units FROM unnest(p_assignees) WITH ORDINALITY p(uid,ordinality)
         JOIN public.task_assignees a ON a.task_id=tid AND a.user_id=p.uid;
     END IF;
     PERFORM public.set_task_participants(tid,p_assignees,p_reviewers,p_share_units,p_expected_version,p_accept_legacy);
   END IF;
   UPDATE public.tasks SET description=CASE WHEN p_fields?'description' THEN p_fields->>'description' ELSE description END,comments=CASE WHEN p_fields?'comments' THEN p_fields->>'comments' ELSE comments END,task_tag=p_fields->>'task_tag',title=p_fields->>'title',category=(p_fields->>'category')::public.task_category,
    priority=(p_fields->>'priority')::public.task_priority,due_date=(p_fields->>'due_date')::date,task_scale=CASE WHEN p_fields?'task_scale' THEN (p_fields->>'task_scale')::numeric ELSE task_scale END WHERE id=tid;
 END IF;
 UPDATE public.tasks SET lifecycle_version=lifecycle_version+1 WHERE id=tid;
 PERFORM taskpulse_private.refresh_task_metrics(tid,p_operation_id,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(auth.uid(),actor_role::text,'save_task_with_participants','tasks',tid,ARRAY['structure','participants'],
  jsonb_build_object('before',jsonb_build_object('priority',t.priority,'scale',t.task_scale,'participant_version',t.participant_version),
  'after',(SELECT jsonb_build_object('priority',priority,'scale',task_scale,'participant_version',participant_version,'lifecycle_version',lifecycle_version) FROM public.tasks WHERE id=tid)),p_operation_id);
 INSERT INTO taskpulse_private.command_receipts(actor_id,operation_id,request,result) VALUES(auth.uid(),p_operation_id,request,tid);
 UPDATE public.tasks SET scale_inputs=jsonb_build_object('value',task_scale) WHERE id=tid AND scale_mode='manual';
 RETURN tid;
END $$;



CREATE OR REPLACE FUNCTION public.is_task_assignee(p_task_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.get_user_role() IS NOT NULL AND EXISTS(SELECT 1 FROM public.tasks t WHERE t.id=p_task_id AND
  (EXISTS(SELECT 1 FROM public.task_assignees a WHERE a.task_id=t.id AND a.user_id=auth.uid()) OR
   (t.participant_credit_mode='legacy' AND t.assignee_id=auth.uid())));
$$;
REVOKE EXECUTE ON FUNCTION public.set_task_participants(uuid,uuid[],uuid[],integer[],bigint,boolean) FROM authenticated;
CREATE TRIGGER m03_invalidate_content_review AFTER INSERT OR UPDATE OR DELETE ON public.task_detail_sections FOR EACH ROW EXECUTE FUNCTION taskpulse_private.invalidate_reviews();
ALTER TABLE public.daily_task_logs ADD COLUMN scale_version bigint;
CREATE FUNCTION taskpulse_private.capture_log_scale() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 SELECT scale_version INTO NEW.scale_version FROM public.tasks WHERE id=NEW.task_id;
 RETURN NEW;
END $$;
CREATE TRIGGER m03_log_scale BEFORE INSERT ON public.daily_task_logs FOR EACH ROW EXECUTE FUNCTION taskpulse_private.capture_log_scale();
CREATE OR REPLACE FUNCTION taskpulse_private.finalize_log_credit(p_log uuid) RETURNS numeric
LANGUAGE plpgsql SET search_path='' AS $$ DECLARE scale numeric; version bigint; delta numeric; BEGIN
 SELECT t.task_scale,t.scale_version,l.effective_progress_delta INTO STRICT scale,version,delta
 FROM public.daily_task_logs l JOIN public.tasks t ON t.id=l.task_id WHERE l.id=p_log;
 IF delta<>0 AND (scale IS NULL OR NOT(scale>=0 AND scale<'Infinity'::numeric)) THEN
  RAISE EXCEPTION 'Progress credit requires a measured scale; record hours with zero progress' USING ERRCODE='23514'; END IF;
 UPDATE public.daily_task_logs SET credit_scale=scale,scale_version=version WHERE id=p_log;
 RETURN scale;
END $$;
-- Missing captured scale must never fall back to today's scale in aggregate reads.
CREATE OR REPLACE FUNCTION public.team_summary_inputs(p_year integer,p_month integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE first_day date; last_day date; result jsonb; BEGIN
 IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_year IS NULL OR p_year NOT BETWEEN 2026 AND 9999 OR p_month IS NULL OR p_month NOT BETWEEN 1 AND 12 THEN
  RAISE EXCEPTION 'Calendar month required' USING ERRCODE='23514'; END IF;
 first_day:=make_date(p_year,p_month,1); last_day:=(first_day+interval '1 month')::date;
 SELECT jsonb_build_object(
 'logs',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT user_id,task_id,
   sum(hours_worked) hours_worked,
   sum(CASE WHEN effective_progress_delta IS NOT NULL THEN effective_progress_delta
    WHEN coalesce(progress_delta,0)=0 THEN 0 END) progress_delta,
   bool_or((effective_progress_delta IS NULL AND coalesce(progress_delta,0)<>0) OR
    (coalesce(effective_progress_delta,0)<>0 AND credit_scale IS NULL)) effect_unknown,
   credit_shares,credit_scale FROM public.daily_task_logs
   WHERE reversed_at IS NULL AND log_date>=first_day AND log_date<last_day GROUP BY user_id,task_id,credit_shares,credit_scale) s),'[]'::jsonb),
 'attendance',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT user_id,status,count(*) record_count,
   sum(attendance_hours) attendance_hours,sum(off_hours) off_hours FROM public.attendance_records
   WHERE attendance_date>=first_day AND attendance_date<last_day GROUP BY user_id,status) s),'[]'::jsonb),
 'report_counts',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT employee_id,count(*) report_count
   FROM public.report_snapshots GROUP BY employee_id) s),'[]'::jsonb),
 'report_summary',(SELECT jsonb_build_object('total',count(*),'final',count(*) FILTER(WHERE status='Final'),
   'draft',count(*) FILTER(WHERE status='Draft'),'employeeReports',count(*) FILTER(WHERE employee_id IS NOT NULL),
   'generalReports',count(*) FILTER(WHERE employee_id IS NULL)) FROM public.report_snapshots
   WHERE (period_start IS NULL OR period_start<last_day) AND (period_end IS NULL OR period_end>=first_day))
 ) INTO result;
 RETURN result;
END $$;
-- Preserve old update-age implementation only as inaccessible historical code.
REVOKE ALL ON FUNCTION taskpulse_private.decay_task_freshness() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
