-- Recursive Sub-missions: independently owned checklists, one root task and credit ledger.
BEGIN;
ALTER TABLE public.task_checklists ADD COLUMN owner_node_id uuid UNIQUE REFERENCES public.checklist_nodes(id) ON DELETE RESTRICT;
ALTER TABLE public.task_checklists DROP CONSTRAINT task_checklists_task_id_key;
CREATE UNIQUE INDEX task_checklists_one_root ON public.task_checklists(task_id) WHERE owner_node_id IS NULL;
ALTER TABLE public.task_checklists ADD CONSTRAINT submission_never_owns_task_progress CHECK(owner_node_id IS NULL OR NOT sync_progress_to_task);
ALTER TABLE public.checklist_nodes ADD COLUMN priority smallint NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 3);
CREATE INDEX checklist_branch_order ON public.checklist_nodes(checklist_id,detail_section,parent_node_id,priority DESC,sort_order,id);
INSERT INTO taskpulse_private.m15_org_refs(table_schema,table_name,column_name,ref_schema,ref_table)
 VALUES('public','task_checklists','owner_node_id','public','checklist_nodes') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION taskpulse_private.mirror_progress_owner() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.owner_node_id IS NULL THEN UPDATE public.tasks SET progress_owner=CASE WHEN NEW.sync_progress_to_task THEN 'checklist' ELSE 'manual' END WHERE id=NEW.task_id; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION taskpulse_private.submission_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE parent public.checklist_nodes; owner_task uuid; BEGIN
 IF TG_TABLE_NAME='task_checklists' THEN
  IF TG_OP='UPDATE' AND (NEW.task_id,NEW.owner_node_id) IS DISTINCT FROM (OLD.task_id,OLD.owner_node_id) THEN RAISE EXCEPTION 'Checklist ownership is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.owner_node_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO parent FROM public.checklist_nodes WHERE id=NEW.owner_node_id;
  SELECT task_id INTO owner_task FROM public.task_checklists WHERE id=parent.checklist_id;
  IF owner_task IS DISTINCT FROM NEW.task_id OR parent.checklist_id=NEW.id OR parent.node_type<>'Page' OR parent.linked_task_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.checklist_nodes WHERE parent_node_id=parent.id) THEN
   RAISE EXCEPTION 'Sub-mission must own an ordinary empty Page row in the same mission' USING ERRCODE='23514'; END IF;
  IF EXISTS(WITH RECURSIVE ancestors(id,path) AS (
   SELECT parent.checklist_id,ARRAY[parent.checklist_id]
   UNION ALL SELECT n.checklist_id,a.path||n.checklist_id FROM ancestors a JOIN public.task_checklists c ON c.id=a.id JOIN public.checklist_nodes n ON n.id=c.owner_node_id WHERE NOT n.checklist_id=ANY(a.path))
   SELECT 1 FROM ancestors WHERE id=NEW.id) THEN RAISE EXCEPTION 'Sub-mission ownership cycle' USING ERRCODE='23514'; END IF;
 ELSE
  IF TG_OP='UPDATE' AND NEW.checklist_id<>OLD.checklist_id THEN RAISE EXCEPTION 'Move within this checklist; checklist identity is immutable' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.task_checklists WHERE owner_node_id=NEW.parent_node_id) THEN RAISE EXCEPTION 'Open the Sub-mission checklist to add work' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.task_checklists WHERE owner_node_id=NEW.id) AND (NEW.node_type<>'Page' OR NEW.linked_task_id IS NOT NULL OR NEW.completion_state<>'No') THEN
   RAISE EXCEPTION 'Sub-mission type and completion follow its owned checklist' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ab_submission_owner BEFORE INSERT OR UPDATE ON public.task_checklists FOR EACH ROW EXECUTE FUNCTION taskpulse_private.submission_guard();
CREATE TRIGGER ab_submission_node BEFORE INSERT OR UPDATE ON public.checklist_nodes FOR EACH ROW EXECUTE FUNCTION taskpulse_private.submission_guard();

-- Task-level operations always select the root. Joined node reads intentionally
-- continue across owned checklists for dependencies, date guards and fingerprinting.
DO $$ DECLARE f record; definition text; patched text; BEGIN
 FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','taskpulse_private') AND p.prokind='f' LOOP
  definition:=pg_get_functiondef(f.sig); patched:=definition;
  patched:=replace(patched,'FROM public.task_checklists WHERE task_id=','FROM public.task_checklists WHERE owner_node_id IS NULL AND task_id=');
  patched:=replace(patched,'FROM public.task_checklists c WHERE task_id=','FROM public.task_checklists c WHERE c.owner_node_id IS NULL AND task_id=');
  IF patched<>definition THEN EXECUTE patched; END IF;
 END LOOP;
END $$;

CREATE FUNCTION taskpulse_private.checklist_result(p_checklist uuid,p_path uuid[] DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE section_role text; init public.checklist_sections; node record; r jsonb; sections jsonb:='{}'; vals jsonb:='[]'; errors jsonb:='[]'; total numeric; cnt integer; complete boolean; unavailable boolean; state text; allcomplete boolean:=true; taskprogress numeric; emptyallowed boolean; BEGIN
 IF p_checklist=ANY(p_path) THEN RETURN jsonb_build_object('errors',jsonb_build_array('checklist_cycle:'||p_checklist),'isComplete',false,'taskProgress',NULL,'nodeProgress','[]'::jsonb,'sections','{}'::jsonb); END IF;
 FOR node IN SELECT n.* FROM public.checklist_nodes n WHERE checklist_id=p_checklist LOOP
  IF node.detail_section IS NULL THEN errors:=errors||jsonb_build_array('unsectioned:'||node.id); END IF;
  IF node.parent_node_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.checklist_nodes p WHERE p.id=node.parent_node_id AND p.checklist_id=p_checklist AND p.detail_section IS NOT DISTINCT FROM node.detail_section) THEN errors:=errors||jsonb_build_array('missing_or_cross_parent:'||node.id); END IF;
 END LOOP;
 FOREACH section_role IN ARRAY ARRAY['setup','activity','closure'] LOOP
  SELECT * INTO init FROM public.checklist_sections s WHERE s.checklist_id=p_checklist AND s.role=section_role;
  state:=CASE WHEN NOT FOUND THEN 'missing' WHEN NOT init.initialized THEN 'uninitialized' ELSE NULL END;
  total:=0;cnt:=0;complete:=true;unavailable:=false;
  FOR node IN SELECT id FROM public.checklist_nodes WHERE checklist_id=p_checklist AND detail_section=section_role AND parent_node_id IS NULL ORDER BY id LOOP
   r:=taskpulse_private.checklist_node_result(node.id,p_path||p_checklist); errors:=errors||(r->'errors'); vals:=vals||coalesce(r->'nodeProgress','[]'::jsonb)||(r-ARRAY['errors','nodeProgress']);
   complete:=complete AND (r->>'isComplete')::boolean;
   IF (r->>'applicable')::boolean THEN cnt:=cnt+1;total:=total+coalesce((r->>'progressPercentage')::numeric,0);unavailable:=unavailable OR r->>'progressPercentage' IS NULL; END IF;
  END LOOP;
  emptyallowed:=coalesce(init.intentional_empty,false) OR EXISTS(SELECT 1 FROM public.checklist_nodes WHERE checklist_id=p_checklist AND detail_section=section_role AND completion_state='N/A');
  IF init.initialized AND cnt=0 AND NOT emptyallowed THEN errors:=errors||jsonb_build_array('empty_unconfirmed:'||section_role); END IF;
  complete:=coalesce(init.initialized,false) AND complete AND (cnt>0 OR emptyallowed);
  state:=coalesce(state,CASE WHEN cnt=0 THEN 'not_applicable' WHEN complete THEN 'complete' ELSE 'partial' END);
  r:=jsonb_build_object('state',state,'progressPercentage',CASE WHEN cnt=0 OR unavailable OR state IN ('missing','uninitialized') THEN NULL ELSE total/cnt END,'isComplete',complete,'applicable',cnt>0);
  sections:=sections||jsonb_build_object(section_role,r);allcomplete:=allcomplete AND complete;
 END LOOP;
 IF jsonb_array_length(errors)>0 THEN
  FOREACH section_role IN ARRAY ARRAY['setup','activity','closure'] LOOP sections:=jsonb_set(sections,ARRAY[section_role],(sections->section_role)||jsonb_build_object('state','invalid','progressPercentage',NULL,'isComplete',false)); END LOOP;allcomplete:=false;
 END IF;
 taskprogress:=(sections->'activity'->>'progressPercentage')::numeric;
 RETURN jsonb_build_object('contract','m05-checklist-v1','sections',sections,'taskProgress',taskprogress,'taskProgressDecimal',taskprogress::text,'overallProgressPercentage',taskprogress,'isComplete',allcomplete,'errors',errors,'nodeProgress',vals);
END $$;

CREATE OR REPLACE FUNCTION taskpulse_private.checklist_node_result(p_node uuid,p_path uuid[] DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE n public.checklist_nodes; child record; r jsonb; owned uuid; errors jsonb:='[]'; vals jsonb:='[]'; total numeric:=0; cnt integer:=0; complete boolean:=true; unavailable boolean:=false; t public.tasks; BEGIN
 IF p_node=ANY(p_path) THEN RETURN jsonb_build_object('id',p_node,'progressPercentage',NULL,'isComplete',false,'applicable',true,'errors',jsonb_build_array('cycle:'||p_node),'nodeProgress',vals); END IF;
 SELECT * INTO n FROM public.checklist_nodes WHERE id=p_node;
 IF NOT FOUND THEN RETURN jsonb_build_object('id',p_node,'progressPercentage',NULL,'isComplete',false,'applicable',true,'errors',jsonb_build_array('missing_node:'||p_node),'nodeProgress',vals); END IF;
 SELECT id INTO owned FROM public.task_checklists WHERE owner_node_id=n.id;
 IF owned IS NOT NULL THEN
  r:=taskpulse_private.checklist_result(owned,p_path||p_node);
  RETURN jsonb_build_object('id',n.id,'progressPercentage',r->'taskProgress','isComplete',r->'isComplete','applicable',true,'errors',r->'errors','nodeProgress',r->'nodeProgress');
 END IF;
 FOR child IN SELECT id FROM public.checklist_nodes WHERE parent_node_id=p_node ORDER BY id LOOP
  r:=taskpulse_private.checklist_node_result(child.id,p_path||p_node);errors:=errors||(r->'errors');vals:=vals||coalesce(r->'nodeProgress','[]'::jsonb)||(r-ARRAY['errors','nodeProgress']);
  complete:=complete AND (r->>'isComplete')::boolean;
  IF (r->>'applicable')::boolean THEN cnt:=cnt+1;total:=total+coalesce((r->>'progressPercentage')::numeric,0);unavailable:=unavailable OR r->>'progressPercentage' IS NULL; END IF;
 END LOOP;
 IF n.completion_state='N/A' AND ((n.node_type='Task' AND n.linked_task_id IS NULL) OR (n.linked_task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=n.linked_task_id))) THEN errors:=errors||jsonb_build_array('linked_unavailable:'||n.id); END IF;
 IF n.completion_state='N/A' THEN RETURN jsonb_build_object('id',n.id,'progressPercentage',NULL,'isComplete',true,'applicable',false,'errors',errors,'nodeProgress',vals); END IF;
 IF EXISTS(SELECT 1 FROM public.checklist_nodes WHERE parent_node_id=n.id) THEN
  IF n.linked_task_id IS NOT NULL THEN errors:=errors||jsonb_build_array('linked_parent:'||n.id); END IF;
  RETURN jsonb_build_object('id',n.id,'progressPercentage',CASE WHEN cnt=0 OR unavailable THEN NULL ELSE total/cnt END,'isComplete',complete,'applicable',cnt>0,'errors',errors,'nodeProgress',vals);
 END IF;
 IF n.linked_task_id IS NOT NULL OR n.node_type='Task' THEN
  SELECT * INTO t FROM public.tasks WHERE id=n.linked_task_id;
  IF NOT FOUND OR t.progress_percentage IS NULL OR NOT(t.progress_percentage BETWEEN 0 AND 100) THEN errors:=errors||jsonb_build_array('linked_unavailable:'||n.id);
  ELSIF t.status='Done' AND t.progress_percentage<>100 THEN errors:=errors||jsonb_build_array('linked_done_mismatch:'||n.id); END IF;
  RETURN jsonb_build_object('id',n.id,'progressPercentage',t.progress_percentage,'isComplete',coalesce(t.status='Done' AND t.progress_percentage=100,false),'applicable',true,'errors',errors,'nodeProgress',vals);
 END IF;
 IF n.node_type IN ('Page','Group') THEN
  IF n.parent_node_id IS NOT NULL THEN errors:=errors||jsonb_build_array('empty_group:'||n.id); END IF;
  RETURN jsonb_build_object('id',n.id,'progressPercentage',NULL,'isComplete',true,'applicable',false,'errors',errors,'nodeProgress',vals);
 END IF;
 RETURN jsonb_build_object('id',n.id,'progressPercentage',CASE WHEN n.completion_state='Yes' THEN 100 ELSE 0 END,'isComplete',n.completion_state='Yes','applicable',true,'errors',errors,'nodeProgress',vals);
END $$;
CREATE OR REPLACE FUNCTION taskpulse_private.checklist_rollup(p_task uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT taskpulse_private.checklist_result((SELECT id FROM public.task_checklists WHERE task_id=p_task AND owner_node_id IS NULL));
$$;

CREATE OR REPLACE FUNCTION public.checklist_command(p_task uuid,p_command text,p_payload jsonb,p_expected_version bigint,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); role public.user_role; t public.tasks; c public.task_checklists; n public.checklist_nodes; receipt taskpulse_private.command_receipts; request jsonb:=jsonb_build_array(p_task,p_command,p_payload,p_expected_version); result jsonb; node_id uuid; section_role text; change_reason text; before_state jsonb; rollup jsonb; enabled boolean; owned_id uuid; copy_row record; BEGIN
 SELECT u.role INTO role FROM public.users u WHERE u.id=actor AND u.is_active FOR SHARE;
 IF role IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_operation IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_command IS NULL OR p_command NOT IN ('create','add','state','edit','map','delete','section','mode','duplicate','submission') THEN RAISE EXCEPTION 'Invalid checklist command' USING ERRCODE='23514'; END IF;
 IF (p_payload-'checklist_id')-(CASE p_command WHEN 'create' THEN ARRAY['title'] WHEN 'submission' THEN ARRAY['title','description','section','parent_id','priority'] WHEN 'add' THEN ARRAY['title','description','section','parent_id','linked_task_id','node_type','links','estimated_minutes','priority'] WHEN 'state' THEN ARRAY['node_id','state'] WHEN 'edit' THEN ARRAY['node_id','title','parent_id','linked_task_id','node_type','section','reason','links','estimated_minutes','priority'] WHEN 'map' THEN ARRAY['node_id','section','reason'] WHEN 'delete' THEN ARRAY['node_id','reason'] WHEN 'duplicate' THEN ARRAY['node_id'] WHEN 'section' THEN ARRAY['section','intentional_empty','reason'] WHEN 'mode' THEN ARRAY['enabled','reason','preview_progress'] END)<>'{}' THEN RAISE EXCEPTION 'Unexpected checklist fields' USING ERRCODE='23514'; END IF;
 -- M14: assignees build and maintain their own checklist pages; section mapping,
 -- section gates and progress ownership stay with managers.
 IF p_command IN ('map','section','mode') AND role NOT IN ('managing_director','project_engineer') THEN RAISE EXCEPTION 'Manager controls section mapping, gates and progress ownership' USING ERRCODE='42501'; END IF;
 IF p_command IN ('create','add','edit','delete','duplicate','submission') AND NOT(role IN ('managing_director','project_engineer') OR public.is_task_assignee(p_task)) THEN RAISE EXCEPTION 'Assigned actor or manager required for checklist structure' USING ERRCODE='42501'; END IF;
 IF p_command='state' AND NOT(role IN ('managing_director','project_engineer') OR public.is_task_assignee(p_task)) THEN RAISE EXCEPTION 'Assigned actor required for completion' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||'checklist_'||p_command||p_operation::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command='checklist_'||p_command AND operation_id=p_operation;
 IF FOUND THEN IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='40001'; END IF; RETURN receipt.result_payload; END IF;
 SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task FOR UPDATE;
 IF p_expected_version IS DISTINCT FROM t.lifecycle_version THEN RAISE EXCEPTION 'Task changed; reload checklist and try again' USING ERRCODE='40001'; END IF;
 IF t.status IN ('Done','Discarded') THEN RAISE EXCEPTION 'Manager must reopen before checklist edits' USING ERRCODE='23514'; END IF;
 PERFORM taskpulse_private.assert_task_open_date(p_task,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
 SELECT * INTO c FROM public.task_checklists WHERE task_id=p_task AND ((p_payload->>'checklist_id' IS NULL AND owner_node_id IS NULL) OR id=(p_payload->>'checklist_id')::uuid) FOR UPDATE;
 IF p_payload->>'checklist_id' IS NOT NULL AND c.id IS NULL THEN RAISE EXCEPTION 'Checklist does not belong to this mission' USING ERRCODE='23514'; END IF;
 IF c.owner_node_id IS NOT NULL AND p_command IN ('create','mode') THEN RAISE EXCEPTION 'Only the root checklist controls mission progress' USING ERRCODE='23514'; END IF;
 IF p_payload?'priority' AND ((p_payload->>'priority') IS NULL OR (p_payload->>'priority') !~ '^[0-3]$') THEN RAISE EXCEPTION 'Priority must be 0 to 3' USING ERRCODE='23514'; END IF;
 change_reason:=nullif(btrim(p_payload->>'reason'),'');
 IF length(coalesce(change_reason,''))>1000 THEN RAISE EXCEPTION 'Reason too long' USING ERRCODE='23514'; END IF;
 before_state:=taskpulse_private.checklist_rollup(p_task);
 IF p_command='create' THEN
  IF c.id IS NOT NULL THEN RAISE EXCEPTION 'Checklist already exists' USING ERRCODE='23514'; END IF;
  INSERT INTO public.task_checklists(task_id,title,created_by,sync_progress_to_task,credit_anchor) VALUES(p_task,coalesce(nullif(btrim(p_payload->>'title'),''),'Master checklist'),actor,false,t.progress_percentage) RETURNING * INTO c;
 ELSE
  IF c.id IS NULL THEN RAISE EXCEPTION 'Initialize a checklist first' USING ERRCODE='23514'; END IF;
  section_role:=p_payload->>'section';
  IF p_command IN ('add','map','section','edit','submission') AND (section_role IS NULL OR section_role NOT IN ('setup','activity','closure')) THEN RAISE EXCEPTION 'Choose Setup, Activity or Closure explicitly' USING ERRCODE='23514'; END IF;
  IF p_command IN ('state','edit','map','delete','duplicate') THEN
   node_id:=(p_payload->>'node_id')::uuid;
   SELECT * INTO n FROM public.checklist_nodes WHERE id=node_id AND checklist_id=c.id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Item is not in this task checklist' USING ERRCODE='23514'; END IF;
  END IF;
  IF role NOT IN ('managing_director','project_engineer') AND ((p_command='add' AND p_payload->>'linked_task_id' IS NOT NULL) OR (p_command='edit' AND (p_payload->>'linked_task_id')::uuid IS DISTINCT FROM n.linked_task_id)) THEN RAISE EXCEPTION 'Manager controls links to real tasks' USING ERRCODE='42501'; END IF;
  IF p_command='submission' THEN
   IF nullif(btrim(p_payload->>'title'),'') IS NULL THEN RAISE EXCEPTION 'Sub-mission title required' USING ERRCODE='23514'; END IF;
   INSERT INTO public.checklist_nodes(checklist_id,parent_node_id,node_type,title,description,detail_section,priority,sort_order) VALUES(c.id,(p_payload->>'parent_id')::uuid,'Page',btrim(p_payload->>'title'),p_payload->>'description',section_role,coalesce((p_payload->>'priority')::smallint,1),coalesce((SELECT max(x.sort_order)+1 FROM public.checklist_nodes x WHERE x.checklist_id=c.id AND x.parent_node_id IS NOT DISTINCT FROM (p_payload->>'parent_id')::uuid),0)) RETURNING id INTO node_id;
   INSERT INTO public.task_checklists(task_id,owner_node_id,title,created_by,sync_progress_to_task) VALUES(p_task,node_id,btrim(p_payload->>'title'),actor,false) RETURNING id INTO owned_id;
  ELSIF p_command='add' THEN
   IF nullif(btrim(p_payload->>'title'),'') IS NULL OR p_payload->>'node_type' IS NULL THEN RAISE EXCEPTION 'Title and node type required' USING ERRCODE='23514'; END IF;
   INSERT INTO public.checklist_nodes(checklist_id,parent_node_id,linked_task_id,node_type,title,description,detail_section,links,estimated_minutes,priority,sort_order) VALUES(c.id,(p_payload->>'parent_id')::uuid,(p_payload->>'linked_task_id')::uuid,(p_payload->>'node_type')::public.checklist_node_type,btrim(p_payload->>'title'),p_payload->>'description',section_role,taskpulse_private.checklist_links(p_payload->'links'),taskpulse_private.checklist_estimate(p_payload->'estimated_minutes'),coalesce((p_payload->>'priority')::smallint,0),coalesce((SELECT max(s.sort_order)+1 FROM public.checklist_nodes s WHERE s.checklist_id=c.id AND s.parent_node_id IS NOT DISTINCT FROM (p_payload->>'parent_id')::uuid),0)) RETURNING id INTO node_id;
  ELSIF p_command='state' THEN
   IF p_payload->>'state' IS NULL OR p_payload->>'state' NOT IN ('Yes','No','N/A') OR EXISTS(SELECT 1 FROM public.checklist_nodes WHERE parent_node_id=n.id) OR n.node_type IN ('Group','Page') THEN RAISE EXCEPTION 'Yes/No/N/A applies only to leaves; parents roll up their children' USING ERRCODE='23514'; END IF;
   IF n.linked_task_id IS NOT NULL AND p_payload->>'state'<>'N/A' AND p_payload->>'state'<>'No' THEN RAISE EXCEPTION 'Linked completion follows the real task; use No to restore applicability' USING ERRCODE='23514'; END IF;
   UPDATE public.checklist_nodes SET completion_state=p_payload->>'state',is_complete=p_payload->>'state'='Yes',completed_by=CASE WHEN p_payload->>'state'='Yes' THEN actor END,completed_at=CASE WHEN p_payload->>'state'='Yes' THEN clock_timestamp() END WHERE id=n.id;
  ELSIF p_command='map' THEN
   IF change_reason IS NULL OR n.parent_node_id IS NOT NULL THEN RAISE EXCEPTION 'Map a legacy root with a reason; its entire subtree follows that explicit role' USING ERRCODE='23514'; END IF;
   -- One statement maps descendants; defer graph trigger until every row is mapped.
   WITH RECURSIVE subtree(id) AS (SELECT n.id UNION SELECT x.id FROM public.checklist_nodes x JOIN subtree s ON x.parent_node_id=s.id)
   UPDATE public.checklist_nodes SET detail_section=section_role WHERE id IN (SELECT id FROM subtree);
  ELSIF p_command='edit' THEN
   IF change_reason IS NULL THEN RAISE EXCEPTION 'Structure correction needs a reason' USING ERRCODE='23514'; END IF;
   WITH RECURSIVE subtree(id) AS (SELECT n.id UNION SELECT x.id FROM public.checklist_nodes x JOIN subtree s ON x.parent_node_id=s.id)
   UPDATE public.checklist_nodes x SET detail_section=section_role,
    title=CASE WHEN x.id=n.id THEN coalesce(nullif(btrim(p_payload->>'title'),''),x.title) ELSE x.title END,
    parent_node_id=CASE WHEN x.id=n.id THEN (p_payload->>'parent_id')::uuid ELSE x.parent_node_id END,
    linked_task_id=CASE WHEN x.id=n.id THEN (p_payload->>'linked_task_id')::uuid ELSE x.linked_task_id END,
    node_type=CASE WHEN x.id=n.id THEN coalesce((p_payload->>'node_type')::public.checklist_node_type,x.node_type) ELSE x.node_type END,
    links=CASE WHEN x.id=n.id AND p_payload?'links' THEN taskpulse_private.checklist_links(p_payload->'links') ELSE x.links END,
    priority=CASE WHEN x.id=n.id AND p_payload?'priority' THEN (p_payload->>'priority')::smallint ELSE x.priority END,
    estimated_minutes=CASE WHEN x.id=n.id AND p_payload?'estimated_minutes' THEN taskpulse_private.checklist_estimate(p_payload->'estimated_minutes') ELSE x.estimated_minutes END
    WHERE x.id IN (SELECT id FROM subtree);
  ELSIF p_command='duplicate' THEN
   -- M14: copy a row or page with everything inside it, right after the original.
   -- Copies start as fresh work (No); rows linked to real tasks are not copied.
   IF n.linked_task_id IS NOT NULL THEN RAISE EXCEPTION 'Rows linked to real tasks cannot be duplicated' USING ERRCODE='23514'; END IF;
   IF n.detail_section IS NULL THEN RAISE EXCEPTION 'Map this row to a section before duplicating it' USING ERRCODE='23514'; END IF;
   UPDATE public.checklist_nodes SET sort_order=sort_order+1 WHERE checklist_id=c.id AND parent_node_id IS NOT DISTINCT FROM n.parent_node_id AND sort_order>n.sort_order;
   CREATE TEMP TABLE m14_copy ON COMMIT DROP AS
    WITH RECURSIVE subtree(id) AS (SELECT n.id UNION ALL SELECT x.id FROM public.checklist_nodes x JOIN subtree s ON x.parent_node_id=s.id WHERE x.linked_task_id IS NULL)
    SELECT id AS old_id,gen_random_uuid() AS new_id FROM subtree;
   INSERT INTO public.checklist_nodes(id,checklist_id,parent_node_id,linked_task_id,node_type,title,description,is_complete,completion_state,sort_order,estimated_minutes,links,detail_section,priority)
    SELECT m.new_id,x.checklist_id,CASE WHEN x.id=n.id THEN x.parent_node_id ELSE p.new_id END,NULL,x.node_type,
     CASE WHEN x.id=n.id THEN left(x.title,173)||' (copy)' ELSE x.title END,x.description,false,'No',
     CASE WHEN x.id=n.id THEN x.sort_order+1 ELSE x.sort_order END,x.estimated_minutes,x.links,x.detail_section,x.priority
    FROM m14_copy m JOIN public.checklist_nodes x ON x.id=m.old_id LEFT JOIN m14_copy p ON p.old_id=x.parent_node_id;
   SELECT new_id INTO node_id FROM m14_copy WHERE old_id=n.id;
   FOR copy_row IN SELECT m.new_id,child.* FROM m14_copy m JOIN public.task_checklists child ON child.owner_node_id=m.old_id LOOP
    INSERT INTO public.task_checklists(task_id,owner_node_id,title,created_by,sync_progress_to_task) VALUES(p_task,copy_row.new_id,copy_row.title,actor,false) RETURNING id INTO owned_id;
    PERFORM taskpulse_private.copy_owned_checklist(copy_row.id,owned_id);
   END LOOP;
   DROP TABLE m14_copy;
  ELSIF p_command='delete' THEN
   IF change_reason IS NULL OR EXISTS(SELECT 1 FROM public.checklist_nodes WHERE parent_node_id=n.id) THEN RAISE EXCEPTION 'Delete an individual leaf with a reason; preserve or move its children first' USING ERRCODE='23514'; END IF;
   DELETE FROM public.checklist_nodes WHERE id=n.id;
  ELSIF p_command='section' THEN
   IF change_reason IS NULL OR jsonb_typeof(p_payload->'intentional_empty') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Section review needs an explicit empty decision and reason' USING ERRCODE='23514'; END IF;
   IF (p_payload->>'intentional_empty')::boolean AND EXISTS(SELECT 1 FROM public.checklist_nodes WHERE checklist_id=c.id AND detail_section=section_role AND (node_type IN ('Item','Task') OR EXISTS(SELECT 1 FROM public.task_checklists owned WHERE owned.owner_node_id=public.checklist_nodes.id))) THEN RAISE EXCEPTION 'This section contains work; mark irrelevant leaves N/A or confirm initialized work' USING ERRCODE='23514'; END IF;
   UPDATE public.checklist_sections SET initialized=true,intentional_empty=(p_payload->>'intentional_empty')::boolean,reason=change_reason WHERE checklist_id=c.id AND checklist_sections.role=section_role;
  ELSIF p_command='mode' THEN
   IF change_reason IS NULL OR jsonb_typeof(p_payload->'enabled') IS DISTINCT FROM 'boolean' OR NOT p_payload?'preview_progress' THEN RAISE EXCEPTION 'Mode switch needs a reason and reviewed preview' USING ERRCODE='23514'; END IF;
   rollup:=taskpulse_private.checklist_rollup(p_task);enabled:=(p_payload->>'enabled')::boolean;
   IF (p_payload->>'preview_progress')::numeric IS DISTINCT FROM (rollup->>'taskProgress')::numeric THEN RAISE EXCEPTION 'Preview changed; reload before switching' USING ERRCODE='40001'; END IF;
   IF enabled AND (jsonb_array_length(rollup->'errors')>0 OR EXISTS(SELECT 1 FROM public.checklist_sections WHERE checklist_id=c.id AND NOT initialized)) THEN RAISE EXCEPTION 'Review all sections and correct references before enabling Activity progress' USING ERRCODE='23514'; END IF;
   UPDATE public.task_checklists SET sync_progress_to_task=enabled,credit_anchor=coalesce((rollup->>'taskProgress')::numeric,t.progress_percentage,credit_anchor) WHERE id=c.id;
   INSERT INTO taskpulse_private.checklist_credit_events(task_id,operation_id,progress_before,progress_after,scale,scale_version,participant_version,scaled_credit,event_kind,reason) VALUES(p_task,p_operation,t.progress_percentage,CASE WHEN enabled THEN (rollup->>'taskProgress')::numeric ELSE t.progress_percentage END,t.task_scale,t.scale_version,t.participant_version,0,'mode_switch',change_reason);
  END IF;
  IF p_command IN ('add','map','edit','submission','duplicate') THEN UPDATE public.checklist_sections SET initialized=true,intentional_empty=false WHERE checklist_id=c.id AND checklist_sections.role=section_role AND EXISTS(SELECT 1 FROM public.checklist_nodes WHERE checklist_id=c.id AND detail_section=section_role AND (node_type IN ('Item','Task') OR parent_node_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.task_checklists owned WHERE owned.owner_node_id=public.checklist_nodes.id))); END IF;
 END IF;
 PERFORM taskpulse_private.refresh_task_metrics(p_task,p_operation,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
 UPDATE public.tasks SET lifecycle_version=lifecycle_version+1 WHERE id=p_task;
 result:=jsonb_build_object('taskId',p_task,'taskTag',t.task_tag,'checklistId',c.id,'ownedChecklistId',owned_id,'nodeId',node_id,'version',(SELECT lifecycle_version FROM public.tasks WHERE id=p_task),'rollup',taskpulse_private.checklist_result(c.id),'rootRollup',taskpulse_private.checklist_rollup(p_task));
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id) VALUES(actor,role::text,'checklist_'||p_command,'task_checklists',c.id,ARRAY[p_command],jsonb_build_object('before',before_state,'after',result->'rollup','node_id',node_id,'reason',change_reason,'state',p_payload->'state','node_before',jsonb_build_object('id',n.id,'parent',n.parent_node_id,'section',n.detail_section,'linked_task',n.linked_task_id,'type',n.node_type,'state',n.completion_state),'node_after',(SELECT jsonb_build_object('id',x.id,'parent',x.parent_node_id,'section',x.detail_section,'linked_task',x.linked_task_id,'type',x.node_type,'state',x.completion_state) FROM public.checklist_nodes x WHERE x.id=node_id)),p_operation);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload) VALUES(actor,'checklist_'||p_command,p_operation,request,p_task,result);
 RETURN result;
END $$;

CREATE FUNCTION taskpulse_private.copy_owned_checklist(p_source uuid,p_target uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE n record; owner public.task_checklists; ids jsonb:='{}'; nid uuid; cid uuid; target_task uuid; BEGIN
 SELECT task_id INTO STRICT target_task FROM public.task_checklists WHERE id=p_target;
 FOR n IN WITH RECURSIVE tree AS (
  SELECT x.*,0 depth FROM public.checklist_nodes x WHERE x.checklist_id=p_source AND x.parent_node_id IS NULL
  UNION ALL SELECT x.*,t.depth+1 FROM public.checklist_nodes x JOIN tree t ON x.parent_node_id=t.id WHERE x.checklist_id=p_source)
 SELECT * FROM tree ORDER BY depth,sort_order,id LOOP
  nid:=gen_random_uuid();ids:=ids||jsonb_build_object(n.id,nid);
  INSERT INTO public.checklist_nodes(id,checklist_id,parent_node_id,node_type,title,description,detail_section,sort_order,estimated_minutes,links,priority)
   VALUES(nid,p_target,(ids->>n.parent_node_id::text)::uuid,CASE WHEN n.node_type='Task' THEN 'Item'::public.checklist_node_type ELSE n.node_type END,n.title,n.description,n.detail_section,n.sort_order,n.estimated_minutes,n.links,n.priority);
  SELECT * INTO owner FROM public.task_checklists WHERE owner_node_id=n.id;
  IF FOUND THEN
   INSERT INTO public.task_checklists(task_id,owner_node_id,title,created_by,sync_progress_to_task) VALUES(target_task,nid,owner.title,auth.uid(),false) RETURNING id INTO cid;
   PERFORM taskpulse_private.copy_owned_checklist(owner.id,cid);
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.checklist_nodes WHERE checklist_id=p_source)<>(SELECT count(*) FROM public.checklist_nodes WHERE checklist_id=p_target) THEN RAISE EXCEPTION 'Source checklist structure is incomplete/cyclic' USING ERRCODE='23514'; END IF;
 UPDATE public.checklist_sections SET initialized=false,intentional_empty=false,reason=NULL WHERE checklist_id=p_target;
END $$;

CREATE OR REPLACE FUNCTION taskpulse_private.clone_tool_structure(p_source uuid,p_target uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE source_c uuid;target_c uuid; BEGIN
 UPDATE public.task_detail_sections dst SET content=CASE WHEN dst.key_name='description' THEN (SELECT description FROM public.tasks WHERE id=p_source) ELSE NULL END WHERE dst.task_id=p_target;
 SELECT id INTO source_c FROM public.task_checklists WHERE task_id=p_source AND owner_node_id IS NULL;
 SELECT id INTO target_c FROM public.task_checklists WHERE task_id=p_target AND owner_node_id IS NULL;
 IF source_c IS NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE c.task_id=p_source AND n.detail_section IS NULL) THEN RAISE EXCEPTION 'Source checklist needs section reconciliation before copying' USING ERRCODE='23514'; END IF;
 -- New tool targets have only their template root; no owned checklist is discarded.
 IF EXISTS(SELECT 1 FROM public.task_checklists WHERE task_id=p_target AND owner_node_id IS NOT NULL) THEN RAISE EXCEPTION 'Copy target must have no existing Sub-missions' USING ERRCODE='23514'; END IF;
 DELETE FROM public.checklist_nodes WHERE checklist_id=target_c;
 PERFORM taskpulse_private.copy_owned_checklist(source_c,target_c);
 UPDATE public.task_checklists SET sync_progress_to_task=false,initialization_state='uninitialized',credit_anchor=0 WHERE id=target_c;
END $$;

CREATE FUNCTION public.checklist_branch(p_task uuid,p_checklist uuid DEFAULT NULL,p_parent uuid DEFAULT NULL,p_section text DEFAULT 'activity',p_offset integer DEFAULT 0,p_limit integer DEFAULT 30) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.tasks; c public.task_checklists; selected_rollup jsonb; root_rollup jsonb; rows jsonb; ancestors jsonb; total integer; BEGIN
 IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated read required' USING ERRCODE='42501'; END IF;
 IF p_section NOT IN ('setup','activity','closure') OR p_section IS NULL OR p_offset<0 OR p_offset IS NULL OR p_limit<1 OR p_limit>100 OR p_limit IS NULL THEN RAISE EXCEPTION 'Invalid checklist branch' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task;
 SELECT * INTO c FROM public.task_checklists WHERE task_id=p_task AND ((p_checklist IS NULL AND owner_node_id IS NULL) OR id=p_checklist);
 IF p_checklist IS NOT NULL AND c.id IS NULL THEN RAISE EXCEPTION 'Checklist does not belong to this mission' USING ERRCODE='23514'; END IF;
 IF p_parent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.checklist_nodes WHERE id=p_parent AND checklist_id=c.id AND detail_section=p_section AND node_type IN ('Page','Group') AND NOT EXISTS(SELECT 1 FROM public.task_checklists WHERE owner_node_id=p_parent)) THEN RAISE EXCEPTION 'Choose a page in this checklist and section' USING ERRCODE='23514'; END IF;
 selected_rollup:=taskpulse_private.checklist_result(c.id);root_rollup:=CASE WHEN c.owner_node_id IS NULL THEN selected_rollup ELSE taskpulse_private.checklist_rollup(p_task) END;
 SELECT count(*) INTO total FROM public.checklist_nodes WHERE checklist_id=c.id AND detail_section=p_section AND parent_node_id IS NOT DISTINCT FROM p_parent;
 WITH page AS (SELECT * FROM public.checklist_nodes WHERE checklist_id=c.id AND detail_section=p_section AND parent_node_id IS NOT DISTINCT FROM p_parent ORDER BY priority DESC,sort_order,id LIMIT p_limit OFFSET p_offset)
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',n.id,'checklistId',n.checklist_id,'parentNodeId',n.parent_node_id,'linkedTaskId',n.linked_task_id,'nodeType',n.node_type,'title',n.title,'description',n.description,'isComplete',coalesce((v.value->>'isComplete')::boolean,false),'section',n.detail_section,'completionState',n.completion_state,'sortOrder',n.sort_order,'estimatedMinutes',n.estimated_minutes,'links',n.links,'elapsedSeconds',seconds.total,
  'completedBy',n.completed_by,'completedAt',n.completed_at,'createdAt',n.created_at,'updatedAt',n.updated_at,'ownedChecklistId',owned.id,'isSubMission',owned.id IS NOT NULL,'priority',n.priority,'childCount',(SELECT count(*) FROM public.checklist_nodes x WHERE (owned.id IS NULL AND x.parent_node_id=n.id) OR (owned.id IS NOT NULL AND x.checklist_id=owned.id AND x.parent_node_id IS NULL AND x.detail_section='activity')),
  'progressPercentage',v.value->'progressPercentage','applicable',coalesce((v.value->>'applicable')::boolean,true)) ORDER BY n.priority DESC,n.sort_order,n.id),'[]') INTO rows
 FROM page n LEFT JOIN public.task_checklists owned ON owned.owner_node_id=n.id
 LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(selected_rollup->'nodeProgress') WHERE value->>'id'=n.id::text LIMIT 1) v ON true
 CROSS JOIN LATERAL (WITH RECURSIVE subtree(id) AS (
  SELECT n.id UNION SELECT x.id FROM subtree s JOIN public.checklist_nodes x ON x.parent_node_id=s.id OR x.checklist_id IN (SELECT id FROM public.task_checklists WHERE owner_node_id=s.id))
  SELECT coalesce(round(sum(l.hours_worked)*3600),0)::bigint total FROM public.daily_task_logs l WHERE l.task_id=p_task AND l.reversed_at IS NULL AND l.checklist_node_id IN (SELECT id FROM subtree)) seconds;
 WITH RECURSIVE chain AS (
  SELECT n.id,n.checklist_id,n.title,n.parent_node_id,ARRAY[n.id] path,0 depth FROM public.checklist_nodes n WHERE n.id=coalesce(p_parent,c.owner_node_id)
  UNION ALL SELECT n.id,n.checklist_id,n.title,n.parent_node_id,a.path||n.id,a.depth+1 FROM chain a JOIN public.task_checklists current_c ON current_c.id=a.checklist_id JOIN public.checklist_nodes n ON n.id=coalesce(a.parent_node_id,current_c.owner_node_id) WHERE NOT n.id=ANY(a.path))
 SELECT coalesce(jsonb_agg(jsonb_build_object('nodeId',a.id,'checklistId',a.checklist_id,'title',a.title,'ownedChecklistId',owned.id) ORDER BY a.depth DESC),'[]') INTO ancestors FROM chain a LEFT JOIN public.task_checklists owned ON owned.owner_node_id=a.id;
 RETURN jsonb_build_object('taskId',p_task,'taskVersion',t.lifecycle_version,'checklist',CASE WHEN c.id IS NOT NULL THEN jsonb_build_object('id',c.id,'taskId',c.task_id,'ownerNodeId',c.owner_node_id,'title',c.title) END,'rows',rows,'ancestors',ancestors,'section',p_section,'parentNodeId',p_parent,'hasMore',p_offset+p_limit<total,'nextCursor',CASE WHEN p_offset+p_limit<total THEN p_offset+p_limit END,'rollup',selected_rollup,'rootRollup',root_rollup);
END $$;
REVOKE ALL ON FUNCTION public.checklist_branch(uuid,uuid,uuid,text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.checklist_branch(uuid,uuid,uuid,text,integer,integer) TO authenticated;

-- State writes invalidate reviews through the final root projection, without
-- altering a table's trigger state or taking table DDL locks in user commands.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('taskpulse_private.invalidate_reviews()'::regprocedure) INTO definition;
 definition:=replace(definition,'BEGIN','BEGIN IF TG_TABLE_NAME=''checklist_nodes'' THEN IF TG_OP=''UPDATE'' THEN IF current_setting(''taskpulse.checklist_state'',true)=NEW.id::text THEN RETURN NEW; END IF; END IF; END IF;');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.checklist_command(uuid,text,jsonb,bigint,uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,$m$UPDATE public.checklist_nodes SET completion_state=p_payload->>'state'$m$, $m$PERFORM set_config('taskpulse.checklist_state',n.id::text,true); UPDATE public.checklist_nodes SET completion_state=p_payload->>'state'$m$);
 definition:=replace(definition,'WHERE id=n.id;'||chr(10)||'  ELSIF p_command=''map''',$m$WHERE id=n.id; PERFORM set_config('taskpulse.checklist_state','',true);$m$||chr(10)||'  ELSIF p_command=''map''');
 EXECUTE definition;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.submission_guard(),taskpulse_private.checklist_result(uuid,uuid[]),taskpulse_private.copy_owned_checklist(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
SELECT taskpulse_private.m15_secure();
