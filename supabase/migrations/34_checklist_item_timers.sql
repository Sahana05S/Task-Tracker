-- ===========================================================================
-- TaskPulse - M14 checklist item timers (forward only, after 33)
--
-- The user approved timers on checklist items whose stopped time is saved as a
-- normal task log tagged with the item, so task hours, productivity and reports
-- include it with no double entry (DECISIONS, 16 October 2026).
--
--   * task_timers.checklist_node_id / daily_task_logs.checklist_node_id tag a
--     timer and the logs its stop creates with the checklist item.
--   * public.start_checklist_item_timer starts an ordinary task timer through
--     the existing atomic execution command, then tags it with the item.
--     Stopping and discarding use the unchanged stop/discard commands.
--   * A trigger copies the timer's tag onto every log segment the stop writes.
--     Tags cannot be forged on insert or changed later (only cleared when the
--     item is deleted). Item time is read from tagged, unreversed logs, so the
--     checklist row itself is never written and reviews are not invalidated.
-- ===========================================================================

ALTER TABLE public.task_timers
    ADD COLUMN checklist_node_id uuid REFERENCES public.checklist_nodes(id) ON DELETE SET NULL;
ALTER TABLE public.daily_task_logs
    ADD COLUMN checklist_node_id uuid REFERENCES public.checklist_nodes(id) ON DELETE SET NULL;
CREATE INDEX daily_task_logs_checklist_node_idx ON public.daily_task_logs(checklist_node_id) WHERE checklist_node_id IS NOT NULL;
CREATE INDEX task_timers_checklist_node_idx ON public.task_timers(checklist_node_id) WHERE checklist_node_id IS NOT NULL;

-- Logs take their item only from their source timer; the tag is immutable
-- afterwards except for ON DELETE SET NULL when the item is removed.
CREATE FUNCTION taskpulse_private.tag_item_log() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.checklist_node_id:=CASE WHEN NEW.source_timer_id IS NULL THEN NULL
   ELSE (SELECT t.checklist_node_id FROM public.task_timers t WHERE t.id=NEW.source_timer_id) END;
 ELSIF NEW.checklist_node_id IS DISTINCT FROM OLD.checklist_node_id AND NEW.checklist_node_id IS NOT NULL THEN
  RAISE EXCEPTION 'A log''s checklist item comes only from its timer' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aa_m14_tag_item_log BEFORE INSERT OR UPDATE OF checklist_node_id ON public.daily_task_logs
    FOR EACH ROW EXECUTE FUNCTION taskpulse_private.tag_item_log();

-- A timer's item is set once, by start_checklist_item_timer, while it runs.
CREATE FUNCTION taskpulse_private.guard_item_timer() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.checklist_node_id IS NOT NULL THEN
  RAISE EXCEPTION 'Start item timers through start_checklist_item_timer' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND NEW.checklist_node_id IS DISTINCT FROM OLD.checklist_node_id AND NEW.checklist_node_id IS NOT NULL
    AND (OLD.checklist_node_id IS NOT NULL OR OLD.status<>'Running' OR current_setting('taskpulse.item_timer',true) IS DISTINCT FROM NEW.id::text) THEN
  RAISE EXCEPTION 'A timer''s checklist item cannot be changed' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aa_m14_guard_item_timer BEFORE INSERT OR UPDATE OF checklist_node_id ON public.task_timers
    FOR EACH ROW EXECUTE FUNCTION taskpulse_private.guard_item_timer();

CREATE FUNCTION public.start_checklist_item_timer(p_node_id uuid,p_payload jsonb,p_operation_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tid uuid; result jsonb; timer_id uuid; timer public.task_timers; BEGIN
 SELECT c.task_id INTO tid FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE n.id=p_node_id;
 IF tid IS NULL THEN RAISE EXCEPTION 'Checklist item not found' USING ERRCODE='23514'; END IF;
 -- Same permission, status, one-running-timer and idempotency rules as task timers.
 result:=taskpulse_private.execution_command('start_timer',tid,NULL,p_payload,NULL,p_operation_id);
 timer_id:=(result->>'timerId')::uuid;
 SELECT * INTO STRICT timer FROM public.task_timers WHERE id=timer_id FOR UPDATE;
 IF timer.checklist_node_id IS DISTINCT FROM p_node_id THEN
  IF timer.checklist_node_id IS NOT NULL OR timer.status<>'Running' OR timer.task_id<>tid THEN
   RAISE EXCEPTION 'Operation key reused with different input' USING ERRCODE='40001'; END IF;
  PERFORM set_config('taskpulse.item_timer',timer_id::text,true);
  UPDATE public.task_timers SET checklist_node_id=p_node_id WHERE id=timer_id;
  PERFORM set_config('taskpulse.item_timer','',true);
 END IF;
 RETURN result||jsonb_build_object('nodeId',p_node_id);
END $$;

REVOKE ALL ON FUNCTION taskpulse_private.tag_item_log(),taskpulse_private.guard_item_timer() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.start_checklist_item_timer(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.start_checklist_item_timer(uuid,jsonb,uuid) TO authenticated;
