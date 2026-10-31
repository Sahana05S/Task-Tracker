-- ===========================================================================
-- TaskPulse - M21 offline timers (forward only; 31 October 2026)
--
-- The Android app runs timers while the phone has no connection and sends
-- them when it is back online (DECISIONS "M21 offline mode"). Offline time
-- counts normally; managers see it marked "recorded offline" with the sync
-- time. Entries are bounded by the offline grant of migration 97 (at most
-- 72 hours old, times between the grant less five minutes and now).
--
-- 1. task_timers and daily_task_logs gain recorded_offline and synced_at. A
--    log takes them from its source timer on insert (like its checklist item,
--    migration 34) and they never change afterwards.
-- 2. The one-running-timer index skips offline timers. An offline timer is
--    Running only inside record_offline_timer, which stops it in the same
--    transaction, so a member's server timer that started after the offline
--    one ended does not block it.
-- 3. execution_command's stop takes its end time from the transaction-local
--    setting taskpulse.timer_end_at when that names the timer being stopped
--    (only the two functions below set it); otherwise it ends at
--    clock_timestamp() exactly as before. Both offline paths therefore write
--    their logs through the normal stop: Kolkata-midnight segments, open-date
--    checks, source_timer_id and the item tag, metrics, receipts and audit.
-- 4. record_offline_timer(p_task, p_node, p_started_at, p_ended_at, p_grant,
--    p_operation, p_notes): a timer run entirely offline, on the whole task
--    (p_node NULL) or on a checklist item of it. Refused if it overlaps the
--    member's own timer still running on the server.
-- 5. stop_task_timer_at(...normal stop..., p_ended_at, p_grant): stops the
--    member's own server timer at the time the phone stopped it offline.
-- Both look up their receipt first, so a replay of an operation that already
-- ran returns its stored result whatever the time now (migration 97 pattern).
-- ===========================================================================
BEGIN;

ALTER TABLE public.task_timers
 ADD COLUMN recorded_offline boolean NOT NULL DEFAULT false,
 ADD COLUMN synced_at timestamptz,
 ADD CONSTRAINT task_timers_offline_synced CHECK (recorded_offline=(synced_at IS NOT NULL));
ALTER TABLE public.daily_task_logs
 ADD COLUMN recorded_offline boolean NOT NULL DEFAULT false,
 ADD COLUMN synced_at timestamptz,
 ADD CONSTRAINT daily_task_logs_offline_synced CHECK (recorded_offline=(synced_at IS NOT NULL));

DROP INDEX public.idx_task_timers_one_running_per_user;
CREATE UNIQUE INDEX idx_task_timers_one_running_per_user ON public.task_timers(user_id)
 WHERE status='Running' AND NOT recorded_offline;

-- Logs take the offline mark only from their timer, and keep it.
CREATE FUNCTION taskpulse_private.mark_offline_log() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.recorded_offline:=coalesce((SELECT t.recorded_offline FROM public.task_timers t WHERE t.id=NEW.source_timer_id),false);
  NEW.synced_at:=CASE WHEN NEW.recorded_offline THEN (SELECT t.synced_at FROM public.task_timers t WHERE t.id=NEW.source_timer_id) END;
 ELSIF NEW.recorded_offline IS DISTINCT FROM OLD.recorded_offline OR NEW.synced_at IS DISTINCT FROM OLD.synced_at THEN
  RAISE EXCEPTION 'A log''s offline mark comes only from its timer' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aa_m21_mark_offline_log BEFORE INSERT OR UPDATE OF recorded_offline,synced_at ON public.daily_task_logs
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.mark_offline_log();

-- The stop's end time, overridable for the timer named in taskpulse.timer_end_at.
DO $$
DECLARE fn regprocedure:='taskpulse_private.execution_command(text,uuid,uuid,jsonb,bigint,uuid)'::regprocedure; def text;
 frag text:='end_at:=clock_timestamp(); seconds:=floor(extract(epoch FROM end_at-timer.started_at));';
 repl text:='end_at:=clock_timestamp();
  IF p_command=''stop_timer'' AND split_part(coalesce(current_setting(''taskpulse.timer_end_at'',true),''''),''|'',1)=timer.id::text THEN
   end_at:=split_part(current_setting(''taskpulse.timer_end_at'',true),''|'',2)::timestamptz; END IF;
  seconds:=floor(extract(epoch FROM end_at-timer.started_at));';
BEGIN
 def:=pg_catalog.pg_get_functiondef(fn);
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION '% no longer has exactly one timer end; update migration 98',fn; END IF;
 EXECUTE replace(def,frag,repl);
END $$;

-- The offline grant and time window shared by both paths. Returns the end
-- time, clamped to now. p_started_at is checked only when the phone chose it.
CREATE FUNCTION taskpulse_private.offline_timer_end(p_grant uuid,p_started_at timestamptz,p_ended_at timestamptz,p_now timestamptz)
RETURNS timestamptz LANGUAGE plpgsql SET search_path='' AS $$
DECLARE g taskpulse_private.offline_grants; end_at timestamptz; BEGIN
 SELECT * INTO g FROM taskpulse_private.offline_grants
  WHERE id=p_grant AND user_id=auth.uid() AND organization_id=public.current_organization();
 IF NOT FOUND THEN
  RAISE EXCEPTION 'This offline entry was recorded under another sign-in and cannot be sent' USING ERRCODE='42501'; END IF;
 IF p_now-g.issued_at>interval '72 hours' THEN
  RAISE EXCEPTION 'This offline entry is more than three days old and cannot be sent' USING ERRCODE='23514'; END IF;
 IF p_ended_at IS NULL OR p_ended_at<g.issued_at-interval '5 minutes' OR p_ended_at>p_now+interval '5 minutes'
  OR (p_started_at IS NOT NULL AND p_started_at<g.issued_at-interval '5 minutes') THEN
  RAISE EXCEPTION 'The time of this offline entry does not match the phone''s clock; record it again' USING ERRCODE='23514'; END IF;
 end_at:=least(p_ended_at,p_now);
 IF p_started_at IS NOT NULL AND p_started_at>=end_at THEN
  RAISE EXCEPTION 'An offline timer must end after it starts' USING ERRCODE='23514'; END IF;
 RETURN end_at;
END $$;

CREATE FUNCTION public.record_offline_timer(p_task uuid,p_node uuid,p_started_at timestamptz,p_ended_at timestamptz,p_grant uuid,p_operation uuid,
 p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); now_at timestamptz:=clock_timestamp(); end_at timestamptz;
 receipt taskpulse_private.command_receipts; request jsonb; node_task uuid; timer_id uuid; result jsonb; BEGIN
 IF actor IS NULL OR org IS NULL OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.is_active FOR SHARE) THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_task IS NULL OR p_started_at IS NULL OR p_operation IS NULL THEN
  RAISE EXCEPTION 'A mission, a start time and an operation id are required' USING ERRCODE='23514'; END IF;
 request:=jsonb_build_array(p_task,p_node,p_started_at,p_ended_at,p_grant,p_notes);
 -- An operation that already ran settles from its receipt, whatever the time now.
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||'record_offline_timer'||p_operation::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command='record_offline_timer' AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;

 end_at:=taskpulse_private.offline_timer_end(p_grant,p_started_at,p_ended_at,now_at);
 -- Same lock order as execution_command: its receipt, then domain writes.
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||'stop_timer'||p_operation::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 IF NOT EXISTS(SELECT 1 FROM public.tasks t WHERE t.id=p_task) THEN
  RAISE EXCEPTION 'Task/entity no longer exists' USING ERRCODE='23514'; END IF;
 IF p_node IS NOT NULL THEN
  SELECT c.task_id INTO node_task FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE n.id=p_node;
  IF node_task IS DISTINCT FROM p_task THEN RAISE EXCEPTION 'Checklist item not found' USING ERRCODE='23514'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.task_timers x WHERE x.user_id=actor AND x.status='Running' AND x.started_at<end_at) THEN
  RAISE EXCEPTION 'This offline timer overlaps your timer still running on the server; stop that timer first' USING ERRCODE='PT409'; END IF;

 INSERT INTO public.task_timers(task_id,user_id,started_at,recorded_offline,synced_at)
 VALUES(p_task,actor,p_started_at,true,now_at) RETURNING id INTO timer_id;
 IF p_node IS NOT NULL THEN
  PERFORM set_config('taskpulse.item_timer',timer_id::text,true);
  UPDATE public.task_timers SET checklist_node_id=p_node WHERE id=timer_id;
  PERFORM set_config('taskpulse.item_timer','',true);
 END IF;
 -- The normal stop: permission, task status, open dates, segments and logs.
 PERFORM set_config('taskpulse.timer_end_at',timer_id::text||'|'||end_at::text,true);
 result:=taskpulse_private.execution_command('stop_timer',NULL,timer_id,jsonb_build_object('notes',p_notes),0,p_operation);
 PERFORM set_config('taskpulse.timer_end_at','',true);

 result:=result||jsonb_build_object('nodeId',p_node,'startedAt',p_started_at,'endedAt',end_at,'recordedOffline',true);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,'record_offline_timer',p_operation,request,timer_id,result);
 RETURN result;
END $$;

CREATE FUNCTION public.stop_task_timer_at(p_timer_id uuid,p_payload jsonb,p_operation_id uuid,p_expected_version bigint,p_ended_at timestamptz,p_grant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); now_at timestamptz:=clock_timestamp(); end_at timestamptz;
 receipt taskpulse_private.command_receipts; request jsonb; timer public.task_timers; result jsonb; BEGIN
 IF actor IS NULL OR org IS NULL OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.is_active FOR SHARE) THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_timer_id IS NULL OR p_operation_id IS NULL THEN
  RAISE EXCEPTION 'A timer and an operation id are required' USING ERRCODE='23514'; END IF;
 request:=jsonb_build_array(p_timer_id,p_payload,p_expected_version,p_ended_at,p_grant);
 -- An operation that already ran settles from its receipt, whatever the time now.
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||'stop_timer_at'||p_operation_id::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command='stop_timer_at' AND operation_id=p_operation_id;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;

 end_at:=taskpulse_private.offline_timer_end(p_grant,NULL,p_ended_at,now_at);
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||'stop_timer'||p_operation_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT * INTO timer FROM public.task_timers WHERE id=p_timer_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Task/entity no longer exists' USING ERRCODE='23514'; END IF;
 IF timer.user_id<>actor THEN
  RAISE EXCEPTION 'Only your own timer can be stopped offline' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR timer.execution_version<>p_expected_version OR timer.status<>'Running' THEN
  RAISE EXCEPTION 'Timer changed or stopped; reload before retrying with a new key' USING ERRCODE='PT409'; END IF;
 IF end_at<=timer.started_at THEN
  RAISE EXCEPTION 'The offline stop time is before the timer started' USING ERRCODE='23514'; END IF;

 UPDATE public.task_timers SET recorded_offline=true,synced_at=now_at WHERE id=timer.id;
 PERFORM set_config('taskpulse.timer_end_at',timer.id::text||'|'||end_at::text,true);
 result:=taskpulse_private.execution_command('stop_timer',NULL,p_timer_id,p_payload,p_expected_version,p_operation_id);
 PERFORM set_config('taskpulse.timer_end_at','',true);

 result:=result||jsonb_build_object('endedAt',end_at,'recordedOffline',true);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,'stop_timer_at',p_operation_id,request,timer.id,result);
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION taskpulse_private.mark_offline_log(),
 taskpulse_private.offline_timer_end(uuid,timestamptz,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.record_offline_timer(uuid,uuid,timestamptz,timestamptz,uuid,uuid,text),
 public.stop_task_timer_at(uuid,jsonb,uuid,bigint,timestamptz,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_offline_timer(uuid,uuid,timestamptz,timestamptz,uuid,uuid,text),
 public.stop_task_timer_at(uuid,jsonb,uuid,bigint,timestamptz,uuid) TO authenticated;

SELECT taskpulse_private.m15_secure();
COMMIT;
