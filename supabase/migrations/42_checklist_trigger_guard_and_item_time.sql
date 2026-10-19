-- Forward compatibility guard and bounded focused-item time read after41.
BEGIN;
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('taskpulse_private.invalidate_reviews()'::regprocedure) INTO definition;
 definition:=replace(definition,
  'IF TG_TABLE_NAME=''checklist_nodes'' AND TG_OP=''UPDATE'' AND current_setting(''taskpulse.checklist_state'',true)=NEW.id::text THEN RETURN NEW; END IF;',
  'IF TG_TABLE_NAME=''checklist_nodes'' THEN IF TG_OP=''UPDATE'' THEN IF current_setting(''taskpulse.checklist_state'',true)=NEW.id::text THEN RETURN NEW; END IF; END IF; END IF;');
 EXECUTE definition;
END $$;

-- One item's team-wide aggregate; no raw logs or all-node breakdown is returned.
CREATE FUNCTION public.checklist_item_seconds(p_task uuid,p_node uuid) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id JOIN public.tasks t ON t.id=c.task_id WHERE n.id=p_node AND t.id=p_task) THEN
  RAISE EXCEPTION 'Checklist item is unavailable in this mission' USING ERRCODE='42501';
 END IF;
 RETURN (SELECT coalesce(round(sum(l.hours_worked)*3600),0) FROM public.daily_task_logs l WHERE l.task_id=p_task AND l.checklist_node_id=p_node AND l.reversed_at IS NULL);
END $$;
REVOKE ALL ON FUNCTION public.checklist_item_seconds(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.checklist_item_seconds(uuid,uuid) TO authenticated;
SELECT taskpulse_private.m15_secure();
COMMIT;
SELECT taskpulse_private.m15_secure();
