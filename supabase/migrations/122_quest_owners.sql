-- ===========================================================================
-- TaskPulse - Quest owners and unlimited Quest nesting (forward only;
-- 5 November 2026)
--
-- User decisions (5 November 2026): a Quest's owner edits it and everything
-- inside it, as do the owners of the Quests above it, the managing director
-- and Managers (project_engineer); Crew can create a sub-Quest inside a Quest
-- they can edit and give it to themselves or any Crew member. Quests nest
-- without a level limit.
--
-- 1. checklist_nodes.assignee_id: a Quest row's owner (one of the mission's
--    Crew). Existing Quests take the Quest list's creator when they are Crew,
--    else the mission's primary. New Quest lists without an owner (duplicates,
--    Task Tools copies, submission_create) get the same default from a
--    trigger on task_checklists.
-- 2. quest_depth_guard keeps the rule that rows in a Quest join its single
--    list and drops the three-level limit (109). The ancestor walk keeps its
--    path array, and checklist_command still refuses moving a row under one of
--    its own rows, so no cycle can form.
-- 3. taskpulse_private.can_edit_quest_list(checklist): the managing director,
--    a Manager who may read the mission's work (120), all Crew for the
--    mission's own checklist, and inside a Quest only Crew who own that Quest
--    or a Quest above it (walking owner_node_id with a path array).
-- 4. checklist_command:
--    - add, state, edit, delete, duplicate, submission and reorder inside a
--      Quest's list need can_edit_quest_list; a Quest's owner may also edit,
--      reorder or remove the Quest row itself in the list above;
--    - submission takes assignee_id (Crew only; default the actor when Crew);
--    - new 'assign' {node_id, assignee_id} sets or changes a Quest's owner
--      (Crew only), allowed to whoever may edit inside that Quest; audited as
--      checklist_assign with the new owner's name as its reason.
--    Objective review rules (114) are unchanged. Rows at the mission's root
--    stay editable by all Crew, as before.
-- 5. checklist_branch returns assigneeId and canEditQuest on Quest rows and
--    canEdit for the list it reads.
-- No scoring, progress or award change.
-- ===========================================================================
BEGIN;
SET LOCAL lock_timeout = '120s';

CREATE FUNCTION pg_temp.m122_patch(fn regprocedure, frag text, repl text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(fn);
BEGIN
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION '% does not contain this fragment exactly once; update migration 122: %',fn,left(frag,80); END IF;
 EXECUTE replace(def,frag,repl);
END $$;

-- 1. The owner column ------------------------------------------------------
ALTER TABLE public.checklist_nodes ADD COLUMN assignee_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
CREATE INDEX checklist_nodes_assignee_idx ON public.checklist_nodes(assignee_id) WHERE assignee_id IS NOT NULL;
COMMENT ON COLUMN public.checklist_nodes.assignee_id IS 'Owner of a Quest row (migration 122): one of the mission''s Crew.';

-- Crew: anyone on the mission's task_assignees (or its legacy single assignee), active.
CREATE FUNCTION taskpulse_private.is_crew(p_task uuid, p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_user IS NOT NULL AND EXISTS(SELECT 1 FROM public.tasks t JOIN public.users u ON u.id=p_user AND u.is_active
  WHERE t.id=p_task AND (EXISTS(SELECT 1 FROM public.task_assignees a WHERE a.task_id=t.id AND a.user_id=p_user)
   OR (t.participant_credit_mode='legacy' AND t.assignee_id=p_user)));
$$;

-- A Quest's default owner: the preferred person when Crew, else the mission's primary.
CREATE FUNCTION taskpulse_private.default_quest_owner(p_task uuid, p_preferred uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(
  CASE WHEN taskpulse_private.is_crew(p_task,p_preferred) THEN p_preferred END,
  (SELECT a.user_id FROM public.task_assignees a WHERE a.task_id=p_task AND a.is_primary ORDER BY a.assigned_at,a.user_id LIMIT 1),
  (SELECT t.assignee_id FROM public.tasks t WHERE t.id=p_task),
  (SELECT a.user_id FROM public.task_assignees a WHERE a.task_id=p_task ORDER BY a.assigned_at,a.user_id LIMIT 1));
$$;

-- Backfill, one row at a time with the checklist-state marker so the owner
-- does not count as a checklist change that clears mission approvals.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT n.id,taskpulse_private.default_quest_owner(o.task_id,o.created_by) who
   FROM public.checklist_nodes n JOIN public.task_checklists o ON o.owner_node_id=n.id WHERE n.assignee_id IS NULL LOOP
  CONTINUE WHEN r.who IS NULL;
  PERFORM set_config('taskpulse.checklist_state',r.id::text,true);
  UPDATE public.checklist_nodes SET assignee_id=r.who WHERE id=r.id;
 END LOOP;
 PERFORM set_config('taskpulse.checklist_state','',true);
END $$;

-- New Quest lists whose row has no owner yet take the default.
CREATE FUNCTION taskpulse_private.quest_default_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE who uuid; marker text:=coalesce(current_setting('taskpulse.checklist_state',true),''); BEGIN
 IF NEW.owner_node_id IS NULL OR EXISTS(SELECT 1 FROM public.checklist_nodes WHERE id=NEW.owner_node_id AND assignee_id IS NOT NULL) THEN RETURN NULL; END IF;
 who:=taskpulse_private.default_quest_owner(NEW.task_id,NEW.created_by);
 IF who IS NULL THEN RETURN NULL; END IF;
 PERFORM set_config('taskpulse.checklist_state',NEW.owner_node_id::text,true);
 UPDATE public.checklist_nodes SET assignee_id=who WHERE id=NEW.owner_node_id;
 PERFORM set_config('taskpulse.checklist_state',marker,true);
 RETURN NULL;
END $$;
CREATE TRIGGER zz_m122_quest_owner AFTER INSERT ON public.task_checklists
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.quest_default_owner();

-- 2. Quests nest without a level limit ------------------------------------
CREATE OR REPLACE FUNCTION taskpulse_private.quest_depth_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='checklist_nodes' THEN
  IF NOT EXISTS(SELECT 1 FROM public.task_checklists c WHERE c.id=NEW.checklist_id AND c.owner_node_id IS NOT NULL) THEN RETURN NEW; END IF;
  -- New and moved rows join the Quest's single list; untouched rows of a
  -- closed mission's Quest keep their place (as in migration 77).
  IF TG_OP='INSERT' OR NEW.detail_section IS DISTINCT FROM OLD.detail_section THEN NEW.detail_section:='activity'; END IF;
  RETURN NEW;
 END IF;
 -- 122: no level limit. A Quest list may not sit inside itself.
 IF NEW.owner_node_id IS NULL OR (TG_OP='UPDATE' AND NEW.owner_node_id IS NOT DISTINCT FROM OLD.owner_node_id) THEN RETURN NEW; END IF;
 IF EXISTS(WITH RECURSIVE up(id,path) AS (
   SELECT n.checklist_id,ARRAY[n.checklist_id] FROM public.checklist_nodes n WHERE n.id=NEW.owner_node_id
   UNION ALL SELECT n.checklist_id,u.path||n.checklist_id
    FROM up u JOIN public.task_checklists c ON c.id=u.id JOIN public.checklist_nodes n ON n.id=c.owner_node_id
    WHERE NOT n.checklist_id=ANY(u.path))
  SELECT 1 FROM up WHERE id=NEW.id) THEN
  RAISE EXCEPTION 'A Quest cannot sit inside itself' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.quest_depth_guard() FROM PUBLIC,anon,authenticated,service_role;

-- 3. Who edits a list -----------------------------------------------------
CREATE FUNCTION taskpulse_private.can_edit_quest_list(p_checklist uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH RECURSIVE up(list_id,owner,path) AS (
  SELECT c.id,n.assignee_id,ARRAY[c.id] FROM public.task_checklists c
   LEFT JOIN public.checklist_nodes n ON n.id=c.owner_node_id WHERE c.id=p_checklist
  UNION ALL
  SELECT p.id,pn.assignee_id,u.path||p.id
   FROM up u JOIN public.task_checklists c ON c.id=u.list_id
   JOIN public.checklist_nodes n ON n.id=c.owner_node_id
   JOIN public.task_checklists p ON p.id=n.checklist_id
   LEFT JOIN public.checklist_nodes pn ON pn.id=p.owner_node_id
   WHERE NOT p.id=ANY(u.path))
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.task_checklists c WHERE c.id=p_checklist AND (
   public.get_user_role()='managing_director'
   OR (public.get_user_role()='project_engineer' AND taskpulse_private.can_read_mission_work(c.task_id))
   OR (public.is_task_assignee(c.task_id) AND (c.owner_node_id IS NULL OR EXISTS(SELECT 1 FROM up WHERE up.owner=auth.uid())))));
$$;
REVOKE ALL ON FUNCTION taskpulse_private.is_crew(uuid,uuid),taskpulse_private.default_quest_owner(uuid,uuid),
 taskpulse_private.quest_default_owner(),taskpulse_private.can_edit_quest_list(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- 4. checklist_command (live definition: 114, patched by 120) --------------
SELECT pg_temp.m122_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $f$'submission','reorder','review') THEN RAISE EXCEPTION 'Invalid checklist command'$f$,
 $f$'submission','reorder','review','assign') THEN RAISE EXCEPTION 'Invalid checklist command'$f$);
SELECT pg_temp.m122_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $f$WHEN 'submission' THEN ARRAY['title','description','section','parent_id','priority']$f$,
 $f$WHEN 'submission' THEN ARRAY['title','description','section','parent_id','priority','assignee_id'] WHEN 'assign' THEN ARRAY['node_id','assignee_id']$f$);
SELECT pg_temp.m122_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $f$IF p_command IN ('create','add','edit','delete','duplicate','submission') AND NOT($f$,
 $f$IF p_command IN ('create','add','edit','delete','duplicate','submission','assign') AND NOT($f$);
SELECT pg_temp.m122_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $f$IF p_command IN ('state','edit','map','delete','duplicate','reorder','review') THEN$f$,
 $f$IF p_command IN ('state','edit','map','delete','duplicate','reorder','review','assign') THEN$f$);
SELECT pg_temp.m122_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $f$  IF role NOT IN ('managing_director','project_engineer') AND ((p_command='add' AND p_payload->>'linked_task_id' IS NOT NULL)$f$,
 $f$  -- 122: inside a Quest, its owner, the owners of the Quests above it and managers.
  -- A Quest's owner may also edit, reorder or remove the Quest row itself.
  IF p_command IN ('add','state','edit','delete','duplicate','submission','reorder') AND c.owner_node_id IS NOT NULL
     AND NOT taskpulse_private.can_edit_quest_list(c.id)
     AND NOT (p_command IN ('edit','reorder','delete') AND EXISTS(SELECT 1 FROM public.task_checklists o WHERE o.owner_node_id=n.id AND taskpulse_private.can_edit_quest_list(o.id))) THEN
   RAISE EXCEPTION 'Only this Quest''s owner, the owners of the Quests above it and managers change it' USING ERRCODE='42501'; END IF;
  IF p_command='submission' AND (p_payload->>'assignee_id') IS NOT NULL AND NOT taskpulse_private.is_crew(p_task,(p_payload->>'assignee_id')::uuid) THEN
   RAISE EXCEPTION 'A Quest''s owner must be one of the mission''s Crew' USING ERRCODE='23514'; END IF;
  IF role NOT IN ('managing_director','project_engineer') AND ((p_command='add' AND p_payload->>'linked_task_id' IS NOT NULL)$f$);
SELECT pg_temp.m122_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $f$INSERT INTO public.checklist_nodes(checklist_id,parent_node_id,node_type,title,description,detail_section,priority,sort_order) VALUES(c.id,(p_payload->>'parent_id')::uuid,'Page',$f$,
 $f$INSERT INTO public.checklist_nodes(checklist_id,parent_node_id,assignee_id,node_type,title,description,detail_section,priority,sort_order) VALUES(c.id,(p_payload->>'parent_id')::uuid,
    coalesce((p_payload->>'assignee_id')::uuid,taskpulse_private.default_quest_owner(p_task,actor)),'Page',$f$);
SELECT pg_temp.m122_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $f$  ELSIF p_command='review' THEN$f$,
 $f$  ELSIF p_command='assign' THEN
   -- 122: set or change a Quest's owner; whoever may edit inside the Quest may.
   SELECT o.id INTO owned_id FROM public.task_checklists o WHERE o.owner_node_id=n.id;
   IF owned_id IS NULL THEN RAISE EXCEPTION 'Only a Quest has an owner' USING ERRCODE='23514'; END IF;
   IF NOT taskpulse_private.can_edit_quest_list(owned_id) THEN
    RAISE EXCEPTION 'Only this Quest''s owner, the owners of the Quests above it and managers assign it' USING ERRCODE='42501'; END IF;
   IF (p_payload->>'assignee_id') IS NULL OR NOT taskpulse_private.is_crew(p_task,(p_payload->>'assignee_id')::uuid) THEN
    RAISE EXCEPTION 'A Quest''s owner must be one of the mission''s Crew' USING ERRCODE='23514'; END IF;
   change_reason:=left((SELECT 'Owner: '||u.full_name||' ('||n.title||')' FROM public.users u WHERE u.id=(p_payload->>'assignee_id')::uuid),1000);
   PERFORM set_config('taskpulse.checklist_state',n.id::text,true);
   UPDATE public.checklist_nodes SET assignee_id=(p_payload->>'assignee_id')::uuid WHERE id=n.id;
   PERFORM set_config('taskpulse.checklist_state','',true);
  ELSIF p_command='review' THEN$f$);
SELECT pg_temp.m122_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $f$'type',n.node_type,'state',n.completion_state)$f$,
 $f$'type',n.node_type,'state',n.completion_state,'assignee',n.assignee_id)$f$);
SELECT pg_temp.m122_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $f$'state',x.completion_state,'review',x.review_state)$f$,
 $f$'state',x.completion_state,'review',x.review_state,'assignee',x.assignee_id)$f$);

-- 5. checklist_branch (live definition: 41, patched by 63, 71 and 117) -----
SELECT pg_temp.m122_patch('public.checklist_branch(uuid,uuid,uuid,text,integer,integer)',
 $f$'ownedChecklistId',owned.id,'isSubMission',owned.id IS NOT NULL,$f$,
 $f$'ownedChecklistId',owned.id,'isSubMission',owned.id IS NOT NULL,'assigneeId',CASE WHEN owned.id IS NOT NULL THEN n.assignee_id END,'canEditQuest',CASE WHEN owned.id IS NOT NULL THEN taskpulse_private.can_edit_quest_list(owned.id) END,$f$);
SELECT pg_temp.m122_patch('public.checklist_branch(uuid,uuid,uuid,text,integer,integer)',
 $f$'rows',rows,'ancestors',ancestors,$f$,
 $f$'rows',rows,'ancestors',ancestors,'canEdit',CASE WHEN c.id IS NOT NULL THEN taskpulse_private.can_edit_quest_list(c.id) ELSE false END,$f$);

COMMIT;
SELECT taskpulse_private.m15_secure();
