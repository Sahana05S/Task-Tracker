-- ===========================================================================
-- TaskPulse - Move a row to another list: the mission's main list or a Quest
-- (forward only; 7 November 2026)
--
-- User request (7 November 2026): the row menu gets "Move to Quest…", which
-- moves an objective, a Quest (with its whole list) or a sub-mission row into
-- the mission's main list, any Quest of the mission, or a new Quest created
-- on the spot in the row's current list.
--
-- 1. checklist_command 'move' {node_id, target_list_id} or
--    {node_id, new_quest:{title, assignee_id}} (plus checklist_id, the row's
--    current list, as every command):
--    - a new Quest is created first in the row's current list, in the row's
--      section, exactly as 'submission' creates one (owner: Crew only, default
--      the actor when Crew), and the row then moves into it;
--    - the row goes to the top level of the target list, at the end, in its
--      Activity section (a Quest is one list of objectives, 122; moved back to
--      the main list it stays in Activity). Its node id stays, so logs,
--      timers, objective reviews, Quest notes and a linked sub-mission keep
--      pointing at it; a Quest's own list moves with it;
--    - refused: into the list it is already in, into itself or one of its own
--      Quests, into another mission's list, on a Done or Discarded mission
--      (the usual check), and unless the actor may change both lists
--      (can_edit_quest_list, 122);
--    - the normal path follows: refresh_task_metrics recomputes the mission's
--      rollup (each Quest's figure is computed from its list), lifecycle_version
--      moves, reviews are invalidated as for any edit. Progress may change as
--      after any structural edit. Audited as checklist_move with the titles of
--      both lists (from_list, to_list); idempotent through p_operation.
-- 2. submission_guard keeps refusing a row that changes list, except for the
--    one row the command names in the transaction-local setting
--    taskpulse.row_move, and only to a top-level place in a list of the same
--    mission that is not inside the row itself.
-- 3. checklist_move_targets(task): the mission's main list and every Quest
--    list (title, owner, the list holding it, whether the caller may change
--    it), for the row menu. Private to those who may read the mission's work.
-- 4. Team > Activity and the mission's History show the move as
--    "List: <from> -> <to>".
-- No scoring rule changes.
-- ===========================================================================
BEGIN;
SET LOCAL lock_timeout = '120s';

CREATE FUNCTION pg_temp.m133_patch(fn regprocedure, frag text, repl text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(fn);
BEGIN
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION '% does not contain this fragment exactly once; update migration 133: %',fn,left(frag,80); END IF;
 EXECUTE replace(def,frag,repl);
END $$;

-- A list's name for people: the main list, or its Quest's title.
CREATE FUNCTION taskpulse_private.checklist_list_title(p_checklist uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN c.owner_node_id IS NULL THEN 'Main list' ELSE coalesce(n.title,c.title) END
 FROM public.task_checklists c LEFT JOIN public.checklist_nodes n ON n.id=c.owner_node_id WHERE c.id=p_checklist;
$$;
REVOKE ALL ON FUNCTION taskpulse_private.checklist_list_title(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- 2. The identity guard lets exactly the named row move (live definition: 41, patched by 67 and 77).
SELECT pg_temp.m133_patch('taskpulse_private.submission_guard()',
 $f$IF TG_OP='UPDATE' AND NEW.checklist_id<>OLD.checklist_id THEN RAISE EXCEPTION 'Move within this checklist; checklist identity is immutable' USING ERRCODE='23514'; END IF;$f$,
 $f$IF TG_OP='UPDATE' AND NEW.checklist_id<>OLD.checklist_id THEN
   -- 133: only checklist_command 'move', for the one row it names, to the top level of a list of the same mission.
   IF coalesce(current_setting('taskpulse.row_move',true),'')<>NEW.id::text OR NEW.parent_node_id IS NOT NULL
      OR (SELECT x.task_id FROM public.task_checklists x WHERE x.id=NEW.checklist_id) IS DISTINCT FROM (SELECT x.task_id FROM public.task_checklists x WHERE x.id=OLD.checklist_id) THEN
    RAISE EXCEPTION 'Move within this checklist; checklist identity is immutable' USING ERRCODE='23514'; END IF;
   IF EXISTS(WITH RECURSIVE up(list_id,path) AS (
     SELECT NEW.checklist_id,ARRAY[NEW.checklist_id]
     UNION ALL SELECT x.checklist_id,u.path||x.checklist_id
      FROM up u JOIN public.task_checklists q ON q.id=u.list_id JOIN public.checklist_nodes x ON x.id=q.owner_node_id
      WHERE NOT x.checklist_id=ANY(u.path))
    SELECT 1 FROM up u JOIN public.task_checklists q ON q.id=u.list_id WHERE q.owner_node_id=NEW.id) THEN
    RAISE EXCEPTION 'A Quest cannot move into itself or one of its own Quests' USING ERRCODE='23514'; END IF;
  END IF;$f$);

-- 1. checklist_command 'move' (live definition: 114, patched by 120, 122, 128 and 130) --------
SELECT pg_temp.m133_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $f$quest_lists uuid[]; BEGIN$f$,
 $f$quest_lists uuid[]; move_target public.task_checklists; move_from text; move_to text; BEGIN$f$);
SELECT pg_temp.m133_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $f$'submission','reorder','review','assign') THEN RAISE EXCEPTION 'Invalid checklist command'$f$,
 $f$'submission','reorder','review','assign','move') THEN RAISE EXCEPTION 'Invalid checklist command'$f$);
SELECT pg_temp.m133_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $f$WHEN 'assign' THEN ARRAY['node_id','assignee_id']$f$,
 $f$WHEN 'assign' THEN ARRAY['node_id','assignee_id'] WHEN 'move' THEN ARRAY['node_id','target_list_id','new_quest']$f$);
SELECT pg_temp.m133_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $f$IF p_command IN ('create','add','edit','delete','duplicate','submission','assign') AND NOT($f$,
 $f$IF p_command IN ('create','add','edit','delete','duplicate','submission','assign','move') AND NOT($f$);
SELECT pg_temp.m133_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $f$IF p_command IN ('state','edit','map','delete','duplicate','reorder','review','assign') THEN$f$,
 $f$IF p_command IN ('state','edit','map','delete','duplicate','reorder','review','assign','move') THEN$f$);
SELECT pg_temp.m133_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $f$  ELSIF p_command='assign' THEN$f$,
 $f$  ELSIF p_command='move' THEN
   -- 133: move a row (objective, Quest with its list, sub-mission row) to the top level of another
   -- list of this mission, at the end, in Activity; or into a new Quest made here first.
   IF ((p_payload->>'target_list_id') IS NULL)=(jsonb_typeof(p_payload->'new_quest') IS DISTINCT FROM 'object') THEN
    RAISE EXCEPTION 'Choose one list or a new Quest to move this row into' USING ERRCODE='23514'; END IF;
   IF NOT taskpulse_private.can_edit_quest_list(c.id) THEN
    RAISE EXCEPTION 'Only this Quest''s owner, the owners of the Quests above it and managers move rows out of it' USING ERRCODE='42501'; END IF;
   move_from:=taskpulse_private.checklist_list_title(c.id);
   IF jsonb_typeof(p_payload->'new_quest')='object' THEN
    IF (p_payload->'new_quest')-ARRAY['title','assignee_id']<>'{}' THEN RAISE EXCEPTION 'Unexpected checklist fields' USING ERRCODE='23514'; END IF;
    IF nullif(btrim(p_payload->'new_quest'->>'title'),'') IS NULL THEN RAISE EXCEPTION 'Quest title required' USING ERRCODE='23514'; END IF;
    IF length(btrim(p_payload->'new_quest'->>'title'))>500 THEN RAISE EXCEPTION 'Keep the Quest title under 500 characters' USING ERRCODE='23514'; END IF;
    IF (p_payload->'new_quest'->>'assignee_id') IS NOT NULL AND NOT taskpulse_private.is_crew(p_task,(p_payload->'new_quest'->>'assignee_id')::uuid) THEN
     RAISE EXCEPTION 'A Quest''s owner must be one of the mission''s Crew' USING ERRCODE='23514'; END IF;
    INSERT INTO public.checklist_nodes(checklist_id,parent_node_id,assignee_id,node_type,title,detail_section,priority,sort_order)
     VALUES(c.id,NULL,coalesce((p_payload->'new_quest'->>'assignee_id')::uuid,taskpulse_private.default_quest_owner(p_task,actor)),'Page',
      btrim(p_payload->'new_quest'->>'title'),coalesce(n.detail_section,'activity'),1,
      coalesce((SELECT max(x.sort_order)+1 FROM public.checklist_nodes x WHERE x.checklist_id=c.id AND x.parent_node_id IS NULL),0))
     RETURNING id INTO neighbour;
    INSERT INTO public.task_checklists(task_id,owner_node_id,title,created_by,sync_progress_to_task)
     VALUES(p_task,neighbour,btrim(p_payload->'new_quest'->>'title'),actor,false) RETURNING * INTO move_target;
    UPDATE public.checklist_sections SET initialized=true,intentional_empty=false WHERE checklist_id=c.id AND checklist_sections.role=coalesce(n.detail_section,'activity');
   ELSE
    SELECT * INTO move_target FROM public.task_checklists WHERE id=(p_payload->>'target_list_id')::uuid FOR UPDATE;
    IF NOT FOUND OR move_target.task_id<>p_task THEN RAISE EXCEPTION 'That list belongs to another mission' USING ERRCODE='23514'; END IF;
    IF move_target.id=c.id THEN RAISE EXCEPTION 'This row is already in that list' USING ERRCODE='23514'; END IF;
    IF EXISTS(WITH RECURSIVE up(list_id,path) AS (
      SELECT move_target.id,ARRAY[move_target.id]
      UNION ALL SELECT x.checklist_id,u.path||x.checklist_id
       FROM up u JOIN public.task_checklists q ON q.id=u.list_id JOIN public.checklist_nodes x ON x.id=q.owner_node_id
       WHERE NOT x.checklist_id=ANY(u.path))
     SELECT 1 FROM up u JOIN public.task_checklists q ON q.id=u.list_id WHERE q.owner_node_id=n.id) THEN
     RAISE EXCEPTION 'A Quest cannot move into itself or one of its own Quests' USING ERRCODE='23514'; END IF;
    IF NOT taskpulse_private.can_edit_quest_list(move_target.id) THEN
     RAISE EXCEPTION 'Only that Quest''s owner, the owners of the Quests above it and managers move rows into it' USING ERRCODE='42501'; END IF;
   END IF;
   IF EXISTS(SELECT 1 FROM public.checklist_nodes x WHERE x.parent_node_id=n.id) THEN
    RAISE EXCEPTION 'Rows cannot go under an objective; add a Quest and put the rows in it' USING ERRCODE='23514'; END IF;
   move_to:=taskpulse_private.checklist_list_title(move_target.id);
   owned_id:=move_target.id;
   PERFORM set_config('taskpulse.row_move',n.id::text,true);
   UPDATE public.checklist_nodes SET checklist_id=move_target.id,parent_node_id=NULL,detail_section='activity',
     sort_order=coalesce((SELECT max(x.sort_order)+1 FROM public.checklist_nodes x WHERE x.checklist_id=move_target.id AND x.parent_node_id IS NULL),0)
    WHERE id=n.id;
   PERFORM set_config('taskpulse.row_move','',true);
   UPDATE public.checklist_sections SET initialized=true,intentional_empty=false WHERE checklist_id=move_target.id AND checklist_sections.role='activity';
   neighbour:=NULL;
  ELSIF p_command='assign' THEN$f$);
-- The audit row names both lists (Team > Activity and History show "List: from -> to").
SELECT pg_temp.m133_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $f$'decision',p_payload->'decision',$f$,
 $f$'decision',p_payload->'decision','from_list',move_from,'to_list',move_to,$f$);

-- 3. Where a row may move -------------------------------------------------------
CREATE FUNCTION public.checklist_move_targets(p_task uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated read required' USING ERRCODE='42501'; END IF;
 IF NOT taskpulse_private.can_read_mission_work(p_task) THEN
  RAISE EXCEPTION 'This checklist is private to the mission''s people' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
   'checklistId',c.id,'nodeId',c.owner_node_id,'parentChecklistId',n.checklist_id,
   'title',taskpulse_private.checklist_list_title(c.id),'assigneeId',n.assignee_id,'assigneeName',u.full_name,
   'canEdit',taskpulse_private.can_edit_quest_list(c.id),'sortOrder',n.sort_order)
   ORDER BY c.owner_node_id IS NOT NULL,n.priority DESC,n.sort_order,n.id)
  FROM public.task_checklists c
  LEFT JOIN public.checklist_nodes n ON n.id=c.owner_node_id
  LEFT JOIN public.users u ON u.id=n.assignee_id
  WHERE c.task_id=p_task),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.checklist_move_targets(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.checklist_move_targets(uuid) TO authenticated;

-- 4. "List: from -> to" in Team > Activity and the mission's History -------------
SELECT pg_temp.m133_patch('public.activity_feed(date,date,text,uuid,jsonb,integer)',
 $f$'state', CASE WHEN a.command = 'checklist_state'$f$,
 $f$'list', CASE WHEN a.command = 'checklist_move'
              THEN jsonb_build_object('before', a.protected_changes -> 'from_list', 'after', a.protected_changes -> 'to_list') END,
            'state', CASE WHEN a.command = 'checklist_state'$f$);
SELECT pg_temp.m133_patch('public.mission_activity(uuid,jsonb,integer)',
 $f$'state', CASE WHEN l.command = 'checklist_state'$f$,
 $f$'list', CASE WHEN l.command = 'checklist_move'
          THEN jsonb_build_object('before', l.pc -> 'from_list', 'after', l.pc -> 'to_list') END,
        'state', CASE WHEN l.command = 'checklist_state'$f$);

COMMIT;
SELECT taskpulse_private.m15_secure();
