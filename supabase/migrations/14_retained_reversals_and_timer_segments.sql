-- M02 approved retained reversal and Asia/Kolkata timer segments (12 October 2026).
-- Forward only; legacy duplicates must pass pre-12 read-only reconciliation.
BEGIN;
ALTER TABLE public.daily_task_logs ALTER COLUMN hours_worked TYPE numeric;
ALTER TABLE public.tasks ALTER COLUMN task_productivity TYPE numeric;
ALTER TABLE public.daily_task_logs ADD COLUMN timer_segment_number integer,
 ADD COLUMN timer_segment_start timestamptz, ADD COLUMN timer_segment_end timestamptz,
 ADD COLUMN timer_duration_seconds numeric;
DROP INDEX public.m02_one_log_per_timer;
CREATE UNIQUE INDEX m02_legacy_timer_link ON public.daily_task_logs(source_timer_id)
 WHERE source_timer_id IS NOT NULL AND timer_segment_number IS NULL;
CREATE UNIQUE INDEX m02_timer_segment ON public.daily_task_logs(source_timer_id,timer_segment_number)
 WHERE timer_segment_number IS NOT NULL;
ALTER TABLE public.daily_task_logs ADD CONSTRAINT timer_segment_consistent CHECK (
 CASE WHEN timer_segment_number IS NULL THEN ( timer_segment_start IS NULL AND timer_segment_end IS NULL AND timer_duration_seconds IS NULL) ELSE (source_timer_id IS NOT NULL AND timer_segment_number>=0 AND timer_segment_start IS NOT NULL AND timer_segment_end>timer_segment_start
  AND timer_segment_start IS NOT NULL AND timer_segment_end IS NOT NULL AND timer_duration_seconds IS NOT NULL AND timer_duration_seconds>0 AND timer_duration_seconds=extract(epoch FROM timer_segment_end-timer_segment_start)
  AND hours_worked=timer_duration_seconds/3600 AND log_date=(timer_segment_start AT TIME ZONE 'Asia/Kolkata')::date
  AND timer_segment_end<=((log_date+1)::timestamp AT TIME ZONE 'Asia/Kolkata')) END);
CREATE FUNCTION taskpulse_private.timer_segments(p_start timestamptz,p_end timestamptz)
RETURNS TABLE(local_date date,segment_start timestamptz,segment_end timestamptz,duration_seconds numeric,hours numeric)
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ DECLARE cursor_at timestamptz:=p_start; next_at timestamptz; BEGIN
 IF p_start IS NULL OR p_end IS NULL OR p_end<=p_start THEN RAISE EXCEPTION 'Positive timer duration required' USING ERRCODE='23514'; END IF;
 WHILE cursor_at<p_end LOOP
  local_date:=(cursor_at AT TIME ZONE 'Asia/Kolkata')::date;
  next_at:=least(p_end,((local_date+1)::timestamp AT TIME ZONE 'Asia/Kolkata'));
  segment_start:=cursor_at; segment_end:=next_at; duration_seconds:=extract(epoch FROM next_at-cursor_at); hours:=duration_seconds/3600;
  RETURN NEXT; cursor_at:=next_at;
 END LOOP;
END $$;
CREATE FUNCTION taskpulse_private.finalize_log_credit(p_log uuid) RETURNS numeric
LANGUAGE plpgsql SET search_path='' AS $$ DECLARE scale numeric; delta numeric; BEGIN
 SELECT t.task_scale,l.effective_progress_delta INTO STRICT scale,delta
 FROM public.daily_task_logs l JOIN public.tasks t ON t.id=l.task_id WHERE l.id=p_log;
 IF delta<>0 AND (scale IS NULL OR NOT(scale>=0 AND scale<'Infinity'::numeric)) THEN
  RAISE EXCEPTION 'Progress credit requires a measured scale; record hours with zero progress' USING ERRCODE='23514'; END IF;
 UPDATE public.daily_task_logs SET credit_scale=scale WHERE id=p_log;
 RETURN scale;
END $$;
CREATE OR REPLACE FUNCTION taskpulse_private.execution_command(p_command text,p_task_id uuid,p_entity_id uuid,p_payload jsonb,
 p_expected_version bigint,p_operation_id uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); role public.user_role; t public.tasks; l public.daily_task_logs; timer public.task_timers;
 receipt taskpulse_private.command_receipts; request jsonb; result jsonb; tid uuid; eid uuid;
 before_safe jsonb; after_safe jsonb; hours numeric; requested numeric; effective numeric; base numeric; target numeric;
 day date; end_at timestamptz; seconds integer; input_notes text; links text[]; reason text; version bigint; mv bigint;
 shares jsonb; share_version bigint; scale numeric; prior numeric:=0; source text; delta_changed boolean; segment_start timestamptz; segment_end timestamptz; segment_number integer; segment_ids jsonb:='[]'::jsonb; duration numeric; segment record;
BEGIN
 SELECT u.role INTO role FROM public.users u WHERE u.id=actor AND u.is_active FOR SHARE;
 IF role IS NULL OR actor IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_operation_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR
  p_command NOT IN ('create_log','correct_log','reverse_log','start_timer','stop_timer','discard_timer') THEN
  RAISE EXCEPTION 'Invalid execution command' USING ERRCODE='23514'; END IF;
 IF (p_command IN ('create_log','correct_log') AND p_payload-ARRAY['log_date','hours_worked','requested_delta','notes','raw_links','reason']<>'{}') OR
  (p_command IN ('start_timer','stop_timer','discard_timer','reverse_log') AND p_payload-ARRAY['notes','reason']<>'{}') THEN
  RAISE EXCEPTION 'Unexpected/forged fields' USING ERRCODE='23514'; END IF;
 request:=jsonb_build_array(p_task_id,p_entity_id,p_payload,p_expected_version);
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||p_command||p_operation_id::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=p_command AND operation_id=p_operation_id;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation key reused with different input' USING ERRCODE='40001'; END IF;
  RETURN receipt.result_payload;
 END IF;
 -- Order: receipt lock, task, entity. Source task IDs are command-immutable.
 IF p_command IN ('correct_log','reverse_log') THEN
  SELECT task_id INTO tid FROM public.daily_task_logs WHERE id=p_entity_id;
 ELSIF p_command IN ('stop_timer','discard_timer') THEN
  SELECT task_id INTO tid FROM public.task_timers WHERE id=p_entity_id;
 ELSE tid:=p_task_id; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT * INTO t FROM public.tasks WHERE id=tid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Task/entity no longer exists' USING ERRCODE='23514'; END IF;
 IF NOT(public.is_task_assignee(tid) OR role IN ('managing_director','project_engineer') OR
  (p_command='discard_timer' AND EXISTS(SELECT 1 FROM public.task_timers WHERE id=p_entity_id AND user_id=actor))) THEN
  RAISE EXCEPTION 'Task assignment or management permission required' USING ERRCODE='42501'; END IF;
 IF p_command IN ('create_log','start_timer','correct_log','reverse_log','stop_timer') AND t.status IN ('Done','Discarded') THEN
  RAISE EXCEPTION 'Terminal task execution requires an authorized lifecycle or report revision' USING ERRCODE='23514'; END IF;
 input_notes:=nullif(btrim(p_payload->>'notes'),''); reason:=nullif(btrim(p_payload->>'reason'),'');
 IF length(coalesce(input_notes,''))>10000 OR length(coalesce(reason,''))>1000 THEN
  RAISE EXCEPTION 'Notes/reason too long' USING ERRCODE='23514'; END IF;
 IF p_command IN ('create_log','correct_log') THEN
  IF p_payload->>'log_date' IS NULL OR p_payload->>'log_date'!~'^\d{4}-\d{2}-\d{2}$' THEN
   RAISE EXCEPTION 'Explicit ISO log date required' USING ERRCODE='23514'; END IF;
  BEGIN
   day:=(p_payload->>'log_date')::date; hours:=(p_payload->>'hours_worked')::numeric;
   requested:=(p_payload->>'requested_delta')::numeric;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
   RAISE EXCEPTION 'Invalid date/number' USING ERRCODE='23514'; END;
  IF day>(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date OR hours IS NULL OR NOT(hours BETWEEN 0 AND 24) OR
   requested IS NULL OR NOT(requested BETWEEN -100 AND 100) OR hours<>round(hours,2) OR requested<>round(requested,2) THEN
   RAISE EXCEPTION 'Hours 0-24/progress -100-100 require finite two-decimal inputs and nonfuture date' USING ERRCODE='23514'; END IF;
  IF p_payload->'raw_links' IS NOT NULL AND p_payload->'raw_links'<>'null'::jsonb THEN
   IF jsonb_typeof(p_payload->'raw_links')<>'array' THEN RAISE EXCEPTION 'Links must be an array' USING ERRCODE='23514'; END IF;
   SELECT array_agg(value) INTO links FROM jsonb_array_elements_text(p_payload->'raw_links');
   IF cardinality(links)>10 OR EXISTS(SELECT 1 FROM unnest(links) x WHERE x IS NULL OR x!~*'^https?://[^[:space:]]+$') THEN
    RAISE EXCEPTION 'At most ten HTTP(S) links required' USING ERRCODE='23514'; END IF;
  END IF;
  PERFORM taskpulse_private.assert_open_date(actor,day);
  PERFORM taskpulse_private.assert_task_open_date(tid,day);
 END IF;
 IF p_command='start_timer' THEN
  -- The existing unique partial index is the authoritative per-user constraint.
  INSERT INTO public.task_timers(task_id,user_id,notes) VALUES(tid,actor,input_notes) RETURNING id INTO eid;
  result:=jsonb_build_object('timerId',eid,'taskId',tid,'taskTag',t.task_tag,'version',0);
 ELSIF p_command IN ('stop_timer','discard_timer') THEN
  SELECT * INTO STRICT timer FROM public.task_timers WHERE id=p_entity_id FOR UPDATE;
  IF timer.user_id<>actor AND role NOT IN ('managing_director','project_engineer') THEN
   RAISE EXCEPTION 'Own timer or task manager required' USING ERRCODE='42501'; END IF;
  IF p_expected_version IS NULL OR timer.execution_version<>p_expected_version OR timer.status<>'Running' THEN
   RAISE EXCEPTION 'Timer changed or stopped; reload before retrying with a new key' USING ERRCODE='40001'; END IF;
  end_at:=clock_timestamp(); seconds:=floor(extract(epoch FROM end_at-timer.started_at));
  IF seconds<0 THEN RAISE EXCEPTION 'Timer starts in the future' USING ERRCODE='23514'; END IF;
  before_safe:=jsonb_build_object('status',timer.status,'version',timer.execution_version,'elapsed_seconds',timer.elapsed_seconds);
  eid:=timer.id;
  IF p_command='stop_timer' THEN
   duration:=extract(epoch FROM end_at-timer.started_at);
   IF duration<=0 THEN RAISE EXCEPTION 'Zero-duration stops are unavailable; keep running or discard' USING ERRCODE='23514'; END IF;
   share_version:=t.participant_version;
   SELECT v.shares INTO shares FROM taskpulse_private.participant_versions v WHERE v.task_id=tid AND v.version=share_version;
   segment_start:=timer.started_at; segment_number:=0;
   FOR segment IN SELECT * FROM taskpulse_private.timer_segments(timer.started_at,end_at) LOOP
    day:=segment.local_date; segment_start:=segment.segment_start; segment_end:=segment.segment_end; hours:=segment.hours;
    PERFORM taskpulse_private.assert_open_date(timer.user_id,day);
    PERFORM taskpulse_private.assert_task_open_date(tid,day);
    INSERT INTO public.daily_task_logs(task_id,user_id,log_date,hours_worked,progress_delta,requested_progress_delta,
     effective_progress_delta,execution_version,update_notes,log_source,source_timer_id,participant_version,credit_shares,credit_scale,effect_contract,
     timer_segment_number,timer_segment_start,timer_segment_end,timer_duration_seconds)
    VALUES(tid,timer.user_id,day,hours,0,0,0,1,coalesce(input_notes,timer.notes),'Timer',timer.id,share_version,shares,t.task_scale,'m02-effective-v1',
     segment_number,segment_start,segment_end,extract(epoch FROM segment_end-segment_start)) RETURNING * INTO l;
    segment_ids:=segment_ids||jsonb_build_array(l.id);
    INSERT INTO taskpulse_private.log_revisions(log_id,version,actor_id,operation_id,command,after_data)
     VALUES(l.id,1,actor,p_operation_id,p_command,jsonb_build_object('hours',hours,'date',day,'effective_delta',0,'participant_version',share_version,'segment',segment_number));
    segment_number:=segment_number+1; segment_start:=segment_end;
   END LOOP;
   UPDATE public.task_timers SET status='Stopped',stopped_at=end_at,elapsed_seconds=seconds,generated_log_id=(segment_ids->>0)::uuid,
    notes=coalesce(input_notes,timer.notes),execution_version=execution_version+1 WHERE id=timer.id;
   mv:=taskpulse_private.refresh_task_metrics(tid,p_operation_id,(timer.started_at AT TIME ZONE 'Asia/Kolkata')::date);
  ELSE
   IF reason IS NULL THEN RAISE EXCEPTION 'Discard reason required' USING ERRCODE='23514'; END IF;
   UPDATE public.task_timers SET status='Discarded',stopped_at=end_at,elapsed_seconds=seconds,notes=coalesce(input_notes,timer.notes),
    execution_version=execution_version+1 WHERE id=timer.id;
  END IF;
  after_safe:=jsonb_build_object('status',CASE WHEN p_command='stop_timer' THEN 'Stopped' ELSE 'Discarded' END,
   'elapsed_seconds',seconds,'version',timer.execution_version+1,'log_id',l.id);
  result:=jsonb_build_object('timerId',timer.id,'logId',CASE WHEN p_command='stop_timer' THEN (segment_ids->>0)::uuid ELSE NULL END,'taskId',tid,'taskTag',t.task_tag,'version',timer.execution_version+1,'metricVersion',mv,'logIds',segment_ids);
 ELSE
  IF p_command IN ('correct_log','reverse_log') THEN
   SELECT * INTO STRICT l FROM public.daily_task_logs WHERE id=p_entity_id FOR UPDATE;
   IF l.user_id<>actor THEN RAISE EXCEPTION 'Own log required; manager history correction is separately authorized' USING ERRCODE='42501'; END IF;
   IF p_expected_version IS NULL OR l.execution_version<>p_expected_version OR l.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Log changed/reversed; reload before correction' USING ERRCODE='40001'; END IF;
   IF reason IS NULL THEN RAISE EXCEPTION 'Correction/reversal reason required' USING ERRCODE='23514'; END IF;
   PERFORM taskpulse_private.assert_open_date(l.user_id,l.log_date);
   PERFORM taskpulse_private.assert_task_open_date(tid,l.log_date);
   IF p_command='correct_log' AND l.source_timer_id IS NOT NULL THEN
    RAISE EXCEPTION 'Timer-linked entries retain their source duration; reverse a known mistaken effect or reconcile legacy data' USING ERRCODE='23514'; END IF;
   IF p_command='reverse_log' THEN
    IF l.effective_progress_delta IS NULL THEN
     RAISE EXCEPTION 'Legacy applied effect is unknown; reconciliation required before reversal' USING ERRCODE='23514'; END IF;
    prior:=l.effective_progress_delta; base:=coalesce(t.progress_percentage,0)-prior;
    IF prior<>0 AND l.credit_scale IS NULL THEN
     RAISE EXCEPTION 'Original earned scale is unknown; reconcile before reversal' USING ERRCODE='23514'; END IF;
    IF base NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'Reversal conflicts with later manual work; reconcile without erasing it' USING ERRCODE='40001'; END IF;
    PERFORM taskpulse_private.assert_progress_owner(tid,-prior);
    UPDATE public.tasks SET progress_percentage=base WHERE id=tid;
    SELECT v.shares INTO shares FROM taskpulse_private.participant_versions v WHERE v.task_id=tid AND v.version=t.participant_version;
    PERFORM taskpulse_private.apply_credit(tid,prior*coalesce(t.task_scale,0)/100,shares,t.assignee_id);
    PERFORM taskpulse_private.apply_credit(tid,-prior*coalesce(l.credit_scale,0)/100,l.credit_shares,l.user_id);
    version:=l.execution_version+1; eid:=l.id;
    UPDATE public.daily_task_logs SET reversed_at=clock_timestamp(),execution_version=version WHERE id=eid;
    mv:=taskpulse_private.refresh_task_metrics(tid,p_operation_id,l.log_date);
    before_safe:=jsonb_build_object('hours',l.hours_worked,'date',l.log_date,'effective_delta',prior,'version',l.execution_version);
    after_safe:=jsonb_build_object('reversed',true,'reversed_effect',prior,'version',version);
    INSERT INTO taskpulse_private.log_revisions(log_id,version,actor_id,operation_id,command,before_data,after_data,reason)
     VALUES(eid,version,actor,p_operation_id,p_command,before_safe,after_safe,reason);
    INSERT INTO taskpulse_private.earned_credit_events(log_id,task_id,operation_id,actor_id,participant_version,shares,credit_scale,effective_delta,source_version)
     VALUES(eid,tid,p_operation_id,actor,l.participant_version,l.credit_shares,l.credit_scale,-prior,version);
    result:=jsonb_build_object('logId',eid,'taskId',tid,'taskTag',t.task_tag,'version',version,'metricVersion',mv,'effectiveDelta',-prior);
    INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
     VALUES(actor,role::text,p_command,'daily_task_logs',eid,ARRAY['reversed_at'],jsonb_build_object('before',before_safe,'after',after_safe,'reason',reason,'task_before',t.progress_percentage,'task_after',base),p_operation_id);
    INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
     VALUES(actor,p_command,p_operation_id,request,eid,result);
    RETURN result;
   END IF;
   before_safe:=jsonb_build_object('hours',l.hours_worked,'date',l.log_date,'requested_delta',l.requested_progress_delta,
    'effective_delta',l.effective_progress_delta,'version',l.execution_version,'participant_version',l.participant_version);
   IF requested<>0 AND EXISTS(SELECT 1 FROM taskpulse_private.participant_versions pv
    WHERE pv.task_id=tid AND pv.version=l.participant_version AND (pv.effective_at AT TIME ZONE 'Asia/Kolkata')::date>day) THEN
    RAISE EXCEPTION 'Backdated progress before the captured share version requires reconciliation' USING ERRCODE='23514'; END IF;
   delta_changed:=requested IS DISTINCT FROM coalesce(l.requested_progress_delta,l.progress_delta,0);
   IF l.effective_progress_delta IS NULL AND delta_changed THEN
    RAISE EXCEPTION 'Historical applied effect is unknown; progress correction requires audited reconciliation' USING ERRCODE='23514'; END IF;
   prior:=coalesce(l.effective_progress_delta,0);
   IF delta_changed THEN
    IF l.credit_scale IS NULL AND (prior<>0 OR requested<>0) THEN
     RAISE EXCEPTION 'Original earned scale is unknown; reconcile before progress correction' USING ERRCODE='23514'; END IF;
    base:=coalesce(t.progress_percentage,0)-prior;
    IF base NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'Prior effect cannot be reversed within bounds; preserve manual correction and reconcile' USING ERRCODE='40001'; END IF;
    target:=greatest(0,least(100,base+requested)); effective:=target-base;
    PERFORM taskpulse_private.assert_progress_owner(tid,effective-prior);
    UPDATE public.tasks SET progress_percentage=target WHERE id=tid;
    SELECT v.shares INTO shares FROM taskpulse_private.participant_versions v WHERE v.task_id=tid AND v.version=t.participant_version;
    PERFORM taskpulse_private.apply_credit(tid,-(effective-prior)*coalesce(t.task_scale,0)/100,shares,t.assignee_id);
    PERFORM taskpulse_private.apply_credit(tid,(effective-prior)*coalesce(l.credit_scale,0)/100,l.credit_shares,l.user_id);
   ELSE effective:=l.effective_progress_delta; END IF;
   -- Attribution remains the original earned version, even after share changes.
   eid:=l.id; version:=l.execution_version+1; shares:=l.credit_shares; share_version:=l.participant_version; scale:=l.credit_scale;
   UPDATE public.daily_task_logs SET log_date=day,hours_worked=hours,requested_progress_delta=requested,
    effective_progress_delta=effective,progress_delta=CASE WHEN effective IS NULL THEN progress_delta ELSE effective END,
    update_notes=input_notes,raw_links=links,execution_version=version WHERE id=eid;
  ELSE
   base:=coalesce(t.progress_percentage,0); target:=greatest(0,least(100,base+requested)); effective:=target-base;
   PERFORM taskpulse_private.assert_progress_owner(tid,effective);
   share_version:=t.participant_version; scale:=t.task_scale;
   IF requested<>0 AND EXISTS(SELECT 1 FROM taskpulse_private.participant_versions pv WHERE pv.task_id=tid AND pv.version=share_version
    AND (pv.effective_at AT TIME ZONE 'Asia/Kolkata')::date>day) THEN
    RAISE EXCEPTION 'Backdated credit before the effective share version requires reconciliation' USING ERRCODE='23514'; END IF;
   SELECT v.shares INTO shares FROM taskpulse_private.participant_versions v WHERE v.task_id=tid AND v.version=share_version;
   version:=1;
   INSERT INTO public.daily_task_logs(task_id,user_id,log_date,hours_worked,progress_delta,requested_progress_delta,
    effective_progress_delta,execution_version,update_notes,raw_links,participant_version,credit_shares,credit_scale,effect_contract)
    VALUES(tid,actor,day,hours,effective,requested,effective,version,input_notes,links,share_version,shares,scale,'m02-effective-v1') RETURNING id INTO eid;
   -- Source effort must exist before its derived scale credits this new progress.
   -- Existing logs and corrections continue to use their original captured scale.
   PERFORM taskpulse_private.refresh_task_metrics(tid,p_operation_id,day);
   scale:=taskpulse_private.finalize_log_credit(eid);
   UPDATE public.tasks SET progress_percentage=target WHERE id=tid;
  END IF;
  mv:=taskpulse_private.refresh_task_metrics(tid,p_operation_id,least(day,coalesce(l.log_date,day)));
  after_safe:=jsonb_build_object('hours',hours,'date',day,'requested_delta',requested,'effective_delta',effective,'version',version,'participant_version',share_version);
  INSERT INTO taskpulse_private.log_revisions(log_id,version,actor_id,operation_id,command,before_data,after_data,reason)
   VALUES(eid,version,actor,p_operation_id,p_command,before_safe,after_safe,reason);
  IF effective IS NOT NULL THEN
   INSERT INTO taskpulse_private.earned_credit_events(log_id,task_id,operation_id,actor_id,participant_version,shares,credit_scale,effective_delta,source_version)
    VALUES(eid,tid,p_operation_id,actor,share_version,shares,scale,effective-prior,version);
  END IF;
  result:=jsonb_build_object('logId',eid,'taskId',tid,'taskTag',t.task_tag,'version',version,'metricVersion',mv,
   'requestedDelta',requested,'effectiveDelta',effective);
 END IF;
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
  VALUES(actor,role::text,p_command,CASE WHEN p_command LIKE '%timer' THEN 'task_timers' ELSE 'daily_task_logs' END,
   eid,ARRAY['execution'],jsonb_build_object('before',before_safe,'after',coalesce(after_safe,result),'reason',reason,
    'task_before',jsonb_build_object('id',t.id,'progress',t.progress_percentage,'productivity',t.task_productivity,'metric_version',t.metric_version),
    'task_after',(SELECT jsonb_build_object('id',id,'progress',progress_percentage,'productivity',task_productivity,'metric_version',metric_version)
      FROM public.tasks WHERE id=tid)),p_operation_id);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
  VALUES(actor,p_command,p_operation_id,request,eid,result);
 RETURN result;
END $$;


REVOKE ALL ON ALL FUNCTIONS IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
