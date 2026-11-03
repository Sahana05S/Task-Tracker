-- ===========================================================================
-- TaskPulse - Objectives and sub-quests (forward only)
--
-- User decisions (3 November 2026, update plan section 4 and D-B1): checklist
-- Items are called Objectives in the interface (database names and payloads
-- stay), and a Quest may hold Objectives, Quests (sub-quests) and
-- Sub-missions, at most three levels of Quest deep (a Quest, its sub-quest
-- and one more). Setup / Activity / Closure stay the mission's sections and
-- progress weights (migration 85) are unchanged: a Quest row still reads its
-- own list's result through checklist_node_result, whose path argument stops
-- cycles, so nested work is counted once.
--
-- 1. The triggers aa_m77_quest_items and aa_m77_quest_nesting (migration 77)
--    give way to one quest_depth_guard: rows in a Quest stay filed in its
--    single list (its Activity section), Sub-missions are allowed there, and a
--    Quest's own list may sit at most three Quest levels below the mission's
--    checklist. submission_guard stays as it is.
-- 2. checklist_command:
--    - 'delete' accepts with_children (the app has sent it since migration 69,
--      but the field list refused it) and removes, with the row, every row
--      under it and every Quest list inside it at any depth, deepest first;
--    - 'edit' refuses moving a row under one of its own rows, including rows
--      inside its Quests, with a plain message.
-- 3. copy_owned_checklist (duplicate of a Quest) skips Sub-mission rows, as
--    duplicating an ordinary row already does, so a copy never reads as a
--    second link to the same mission.
-- submission_create (migration 68) already passes a Quest's checklist to
-- checklist_command('add'); with the item-only trigger gone it is accepted.
-- No data changes: no existing Quest holds a Quest or a Sub-mission.
-- ===========================================================================
BEGIN;
SET LOCAL lock_timeout = '120s';

CREATE FUNCTION pg_temp.m109_patch(p_sig text,p_old text,p_new text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(p_sig::regprocedure); BEGIN
 IF (length(def)-length(replace(def,p_old,'')))/length(p_old)<>1 THEN
  RAISE EXCEPTION '% no longer has exactly one "%"; update migration 109',p_sig,left(p_old,120); END IF;
 EXECUTE replace(def,p_old,p_new);
END $$;

-- 1. One guard for Quest lists.
DROP TRIGGER aa_m77_quest_items ON public.checklist_nodes;
DROP TRIGGER aa_m77_quest_nesting ON public.task_checklists;
DROP FUNCTION taskpulse_private.quest_items_guard();
DROP FUNCTION taskpulse_private.quest_nesting_guard();

CREATE FUNCTION taskpulse_private.quest_depth_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE parent_list uuid; depth integer; BEGIN
 IF TG_TABLE_NAME='checklist_nodes' THEN
  IF NOT EXISTS(SELECT 1 FROM public.task_checklists c WHERE c.id=NEW.checklist_id AND c.owner_node_id IS NOT NULL) THEN RETURN NEW; END IF;
  -- New and moved rows join the Quest's single list; untouched rows of a
  -- closed mission's Quest keep their place (as in migration 77).
  IF TG_OP='INSERT' OR NEW.detail_section IS DISTINCT FROM OLD.detail_section THEN NEW.detail_section:='activity'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.owner_node_id IS NULL OR (TG_OP='UPDATE' AND NEW.owner_node_id IS NOT DISTINCT FROM OLD.owner_node_id) THEN RETURN NEW; END IF;
 SELECT n.checklist_id INTO parent_list FROM public.checklist_nodes n WHERE n.id=NEW.owner_node_id;
 -- Quest levels above the new list: 0 for the mission's own checklist.
 WITH RECURSIVE up(id,level,path) AS (
  SELECT parent_list,0,ARRAY[parent_list]
  UNION ALL SELECT n.checklist_id,u.level+1,u.path||n.checklist_id
   FROM up u JOIN public.task_checklists c ON c.id=u.id JOIN public.checklist_nodes n ON n.id=c.owner_node_id
   WHERE NOT n.checklist_id=ANY(u.path))
 SELECT max(level) INTO depth FROM up;
 IF coalesce(depth,0)+1>3 THEN
  RAISE EXCEPTION 'Quests go three levels deep; add this Quest one level up' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.quest_depth_guard() FROM PUBLIC,anon,authenticated,service_role;
-- aa_ sorts before the other row guards, as the m77 triggers did.
CREATE TRIGGER aa_m109_quest_rows BEFORE INSERT OR UPDATE OF detail_section,checklist_id ON public.checklist_nodes
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.quest_depth_guard();
CREATE TRIGGER aa_m109_quest_depth BEFORE INSERT OR UPDATE OF owner_node_id ON public.task_checklists
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.quest_depth_guard();

-- 2. checklist_command.
SELECT pg_temp.m109_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $m$neighbour uuid; BEGIN$m$,
 $m$neighbour uuid; quest_lists uuid[]; BEGIN$m$);
SELECT pg_temp.m109_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $m$WHEN 'delete' THEN ARRAY['node_id','reason']$m$,
 $m$WHEN 'delete' THEN ARRAY['node_id','reason','with_children']$m$);
SELECT pg_temp.m109_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $m$   IF change_reason IS NULL THEN RAISE EXCEPTION 'Structure correction needs a reason' USING ERRCODE='23514'; END IF;$m$,
 $m$   IF change_reason IS NULL THEN RAISE EXCEPTION 'Structure correction needs a reason' USING ERRCODE='23514'; END IF;
   -- Never under one of its own rows, including the rows inside its Quests.
   IF (p_payload->>'parent_id') IS NOT NULL AND EXISTS(WITH RECURSIVE sub(id,path) AS (SELECT n.id,ARRAY[n.id]
      UNION ALL SELECT x.id,sub.path||x.id
       FROM sub LEFT JOIN public.task_checklists q ON q.owner_node_id=sub.id
       JOIN public.checklist_nodes x ON (x.parent_node_id=sub.id OR x.checklist_id=q.id) AND NOT x.id=ANY(sub.path))
     SELECT 1 FROM sub WHERE id=(p_payload->>'parent_id')::uuid) THEN
    RAISE EXCEPTION 'A row cannot move under one of its own rows' USING ERRCODE='23514'; END IF;$m$);
SELECT pg_temp.m109_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $m$   IF EXISTS(SELECT 1 FROM public.checklist_nodes WHERE parent_node_id=n.id) AND (p_payload->>'with_children') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'This row has rows under it; remove them with it or move them first' USING ERRCODE='23514'; END IF;
   IF EXISTS(WITH RECURSIVE sub(id) AS (SELECT x.id FROM public.checklist_nodes x WHERE x.parent_node_id=n.id
      UNION SELECT x.id FROM public.checklist_nodes x JOIN sub ON x.parent_node_id=sub.id)
     SELECT 1 FROM public.task_checklists o WHERE o.owner_node_id IN (SELECT id FROM sub)) THEN
    RAISE EXCEPTION 'A Quest is inside this row; empty and remove the Quest first' USING ERRCODE='23514'; END IF;
   SELECT id INTO owned_id FROM public.task_checklists WHERE owner_node_id=n.id FOR UPDATE;
   IF owned_id IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM public.checklist_nodes WHERE checklist_id=owned_id) THEN RAISE EXCEPTION 'Remove the rows inside this Quest first.' USING ERRCODE='23514'; END IF;
    DELETE FROM public.task_checklists WHERE id=owned_id;
   END IF;
   DELETE FROM public.checklist_nodes WHERE id=n.id;$m$,
 $m$   IF (EXISTS(SELECT 1 FROM public.checklist_nodes WHERE parent_node_id=n.id)
      OR EXISTS(SELECT 1 FROM public.checklist_nodes x JOIN public.task_checklists o ON o.id=x.checklist_id WHERE o.owner_node_id=n.id))
     AND (p_payload->>'with_children') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'This row has rows under it; remove them with it or move them first' USING ERRCODE='23514'; END IF;
   -- Every Quest list inside this row at any depth, deepest first: removing a
   -- list removes its rows, so no list is left owned by a removed row.
   WITH RECURSIVE sub(id,level,path) AS (SELECT n.id,0,ARRAY[n.id]
     UNION ALL SELECT x.id,sub.level+CASE WHEN x.parent_node_id=sub.id THEN 0 ELSE 1 END,sub.path||x.id
      FROM sub LEFT JOIN public.task_checklists q ON q.owner_node_id=sub.id
       JOIN public.checklist_nodes x ON (x.parent_node_id=sub.id OR x.checklist_id=q.id) AND NOT x.id=ANY(sub.path))
   SELECT coalesce(array_agg(o.id ORDER BY s.level DESC,o.id),'{}') INTO quest_lists
    FROM sub s JOIN public.task_checklists o ON o.owner_node_id=s.id;
   PERFORM 1 FROM public.task_checklists WHERE id=ANY(quest_lists) FOR UPDATE;
   FOREACH owned_id IN ARRAY quest_lists LOOP
    DELETE FROM public.task_checklists WHERE id=owned_id;
   END LOOP;
   owned_id:=NULL;
   DELETE FROM public.checklist_nodes WHERE id=n.id;$m$);

-- 3. A duplicated Quest copies its rows but not its Sub-mission links.
SELECT pg_temp.m109_patch('taskpulse_private.copy_owned_checklist(uuid,uuid)',
 $m$SELECT x.*,0 depth FROM public.checklist_nodes x WHERE x.checklist_id=p_source AND x.parent_node_id IS NULL$m$,
 $m$SELECT x.*,0 depth FROM public.checklist_nodes x WHERE x.checklist_id=p_source AND x.parent_node_id IS NULL AND x.linked_task_id IS NULL$m$);
SELECT pg_temp.m109_patch('taskpulse_private.copy_owned_checklist(uuid,uuid)',
 $m$JOIN tree t ON x.parent_node_id=t.id WHERE x.checklist_id=p_source)$m$,
 $m$JOIN tree t ON x.parent_node_id=t.id WHERE x.checklist_id=p_source AND x.linked_task_id IS NULL)$m$);
SELECT pg_temp.m109_patch('taskpulse_private.copy_owned_checklist(uuid,uuid)',
 $m$IF (SELECT count(*) FROM public.checklist_nodes WHERE checklist_id=p_source)<>$m$,
 $m$IF (SELECT count(*) FROM public.checklist_nodes WHERE checklist_id=p_source AND linked_task_id IS NULL)<>$m$);

COMMIT;
SELECT taskpulse_private.m15_secure();
