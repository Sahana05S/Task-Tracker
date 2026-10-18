-- ===========================================================================
-- TaskPulse - M14 duplicate checklist rows (forward only, after 34)
--
-- The user's sheet tracker has a "Duplicate Item" action. checklist_command
-- gains 'duplicate': it copies a row or page with everything inside it,
-- directly after the original, with " (copy)" on the copied row's title.
--   * Assignees and managers may duplicate (same rule as add/edit/delete).
--   * Copies start as fresh work: completion No, no completer, no item time.
--   * Links and estimates are copied; rows linked to real tasks are skipped,
--     and a linked row itself cannot be duplicated (no double-linked tasks).
-- Everything else is copied unchanged from migration 33.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.checklist_command(p_task uuid,p_command text,p_payload jsonb,p_expected_version bigint,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); role public.user_role; t public.tasks; c public.task_checklists; n public.checklist_nodes; receipt taskpulse_private.command_receipts; request jsonb:=jsonb_build_array(p_task,p_command,p_payload,p_expected_version); result jsonb; node_id uuid; section_role text; change_reason text; before_state jsonb; rollup jsonb; enabled boolean; BEGIN
 SELECT u.role INTO role FROM public.users u WHERE u.id=actor AND u.is_active FOR SHARE;
 IF role IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_operation IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_command IS NULL OR p_command NOT IN ('create','add','state','edit','map','delete','section','mode','duplicate') THEN RAISE EXCEPTION 'Invalid checklist command' USING ERRCODE='23514'; END IF;
 IF p_payload-(CASE p_command WHEN 'create' THEN ARRAY['title'] WHEN 'add' THEN ARRAY['title','description','section','parent_id','linked_task_id','node_type','links','estimated_minutes'] WHEN 'state' THEN ARRAY['node_id','state'] WHEN 'edit' THEN ARRAY['node_id','title','parent_id','linked_task_id','node_type','section','reason','links','estimated_minutes'] WHEN 'map' THEN ARRAY['node_id','section','reason'] WHEN 'delete' THEN ARRAY['node_id','reason'] WHEN 'duplicate' THEN ARRAY['node_id'] WHEN 'section' THEN ARRAY['section','intentional_empty','reason'] WHEN 'mode' THEN ARRAY['enabled','reason','preview_progress'] END)<>'{}' THEN RAISE EXCEPTION 'Unexpected checklist fields' USING ERRCODE='23514'; END IF;
 -- M14: assignees build and maintain their own checklist pages; section mapping,
 -- section gates and progress ownership stay with managers.
 IF p_command IN ('map','section','mode') AND role NOT IN ('managing_director','project_engineer') THEN RAISE EXCEPTION 'Manager controls section mapping, gates and progress ownership' USING ERRCODE='42501'; END IF;
 IF p_command IN ('create','add','edit','delete','duplicate') AND NOT(role IN ('managing_director','project_engineer') OR public.is_task_assignee(p_task)) THEN RAISE EXCEPTION 'Assigned actor or manager required for checklist structure' USING ERRCODE='42501'; END IF;
 IF p_command='state' AND NOT(role IN ('managing_director','project_engineer') OR public.is_task_assignee(p_task)) THEN RAISE EXCEPTION 'Assigned actor required for completion' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||'checklist_'||p_command||p_operation::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command='checklist_'||p_command AND operation_id=p_operation;
 IF FOUND THEN IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='40001'; END IF; RETURN receipt.result_payload; END IF;
 SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task FOR UPDATE;
 IF p_expected_version IS DISTINCT FROM t.lifecycle_version THEN RAISE EXCEPTION 'Task changed; reload checklist and try again' USING ERRCODE='40001'; END IF;
 IF t.status IN ('Done','Discarded') THEN RAISE EXCEPTION 'Manager must reopen before checklist edits' USING ERRCODE='23514'; END IF;
 PERFORM taskpulse_private.assert_task_open_date(p_task,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
 SELECT * INTO c FROM public.task_checklists WHERE task_id=p_task FOR UPDATE;
 change_reason:=nullif(btrim(p_payload->>'reason'),'');
 IF length(coalesce(change_reason,''))>1000 THEN RAISE EXCEPTION 'Reason too long' USING ERRCODE='23514'; END IF;
 before_state:=taskpulse_private.checklist_rollup(p_task);
 IF p_command='create' THEN
  IF c.id IS NOT NULL THEN RAISE EXCEPTION 'Checklist already exists' USING ERRCODE='23514'; END IF;
  INSERT INTO public.task_checklists(task_id,title,created_by,sync_progress_to_task,credit_anchor) VALUES(p_task,coalesce(nullif(btrim(p_payload->>'title'),''),'Master checklist'),actor,false,t.progress_percentage) RETURNING * INTO c;
 ELSE
  IF c.id IS NULL THEN RAISE EXCEPTION 'Initialize a checklist first' USING ERRCODE='23514'; END IF;
  section_role:=p_payload->>'section';
  IF p_command IN ('add','map','section','edit') AND (section_role IS NULL OR section_role NOT IN ('setup','activity','closure')) THEN RAISE EXCEPTION 'Choose Setup, Activity or Closure explicitly' USING ERRCODE='23514'; END IF;
  IF p_command IN ('state','edit','map','delete','duplicate') THEN
   node_id:=(p_payload->>'node_id')::uuid;
   SELECT * INTO n FROM public.checklist_nodes WHERE id=node_id AND checklist_id=c.id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Item is not in this task checklist' USING ERRCODE='23514'; END IF;
  END IF;
  IF role NOT IN ('managing_director','project_engineer') AND ((p_command='add' AND p_payload->>'linked_task_id' IS NOT NULL) OR (p_command='edit' AND (p_payload->>'linked_task_id')::uuid IS DISTINCT FROM n.linked_task_id)) THEN RAISE EXCEPTION 'Manager controls links to real tasks' USING ERRCODE='42501'; END IF;
  IF p_command='add' THEN
   IF nullif(btrim(p_payload->>'title'),'') IS NULL OR p_payload->>'node_type' IS NULL THEN RAISE EXCEPTION 'Title and node type required' USING ERRCODE='23514'; END IF;
   INSERT INTO public.checklist_nodes(checklist_id,parent_node_id,linked_task_id,node_type,title,description,detail_section,links,estimated_minutes,sort_order) VALUES(c.id,(p_payload->>'parent_id')::uuid,(p_payload->>'linked_task_id')::uuid,(p_payload->>'node_type')::public.checklist_node_type,btrim(p_payload->>'title'),p_payload->>'description',section_role,taskpulse_private.checklist_links(p_payload->'links'),taskpulse_private.checklist_estimate(p_payload->'estimated_minutes'),coalesce((SELECT max(s.sort_order)+1 FROM public.checklist_nodes s WHERE s.checklist_id=c.id AND s.parent_node_id IS NOT DISTINCT FROM (p_payload->>'parent_id')::uuid),0)) RETURNING id INTO node_id;
  ELSIF p_command='state' THEN
   IF p_payload->>'state' IS NULL OR p_payload->>'state' NOT IN ('Yes','No','N/A') OR EXISTS(SELECT 1 FROM public.checklist_nodes WHERE parent_node_id=n.id) OR n.node_type IN ('Group','Page') THEN RAISE EXCEPTION 'Yes/No/N/A applies only to leaves; parents roll up their children' USING ERRCODE='23514'; END IF;
   IF n.linked_task_id IS NOT NULL AND p_payload->>'state'<>'N/A' AND p_payload->>'state'<>'No' THEN RAISE EXCEPTION 'Linked completion follows the real task; use No to restore applicability' USING ERRCODE='23514'; END IF;
   ALTER TABLE public.checklist_nodes DISABLE TRIGGER m03_invalidate_checklist_review;
ALTER TABLE public.task_checklists DISABLE TRIGGER m03_invalidate_structure_review;
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
   INSERT INTO public.checklist_nodes(id,checklist_id,parent_node_id,linked_task_id,node_type,title,description,is_complete,completion_state,sort_order,estimated_minutes,links,detail_section)
    SELECT m.new_id,x.checklist_id,CASE WHEN x.id=n.id THEN x.parent_node_id ELSE p.new_id END,NULL,x.node_type,
     CASE WHEN x.id=n.id THEN left(x.title,173)||' (copy)' ELSE x.title END,x.description,false,'No',
     CASE WHEN x.id=n.id THEN x.sort_order+1 ELSE x.sort_order END,x.estimated_minutes,x.links,x.detail_section
    FROM m14_copy m JOIN public.checklist_nodes x ON x.id=m.old_id LEFT JOIN m14_copy p ON p.old_id=x.parent_node_id;
   SELECT new_id INTO node_id FROM m14_copy WHERE old_id=n.id;
   DROP TABLE m14_copy;
  ELSIF p_command='delete' THEN
   IF change_reason IS NULL OR EXISTS(SELECT 1 FROM public.checklist_nodes WHERE parent_node_id=n.id) THEN RAISE EXCEPTION 'Delete an individual leaf with a reason; preserve or move its children first' USING ERRCODE='23514'; END IF;
   DELETE FROM public.checklist_nodes WHERE id=n.id;
  ELSIF p_command='section' THEN
   IF change_reason IS NULL OR jsonb_typeof(p_payload->'intentional_empty') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Section review needs an explicit empty decision and reason' USING ERRCODE='23514'; END IF;
   IF (p_payload->>'intentional_empty')::boolean AND EXISTS(SELECT 1 FROM public.checklist_nodes WHERE checklist_id=c.id AND detail_section=section_role AND node_type IN ('Item','Task')) THEN RAISE EXCEPTION 'This section contains work; mark irrelevant leaves N/A or confirm initialized work' USING ERRCODE='23514'; END IF;
   UPDATE public.checklist_sections SET initialized=true,intentional_empty=(p_payload->>'intentional_empty')::boolean,reason=change_reason WHERE checklist_id=c.id AND checklist_sections.role=section_role;
  ELSIF p_command='mode' THEN
   IF change_reason IS NULL OR jsonb_typeof(p_payload->'enabled') IS DISTINCT FROM 'boolean' OR NOT p_payload?'preview_progress' THEN RAISE EXCEPTION 'Mode switch needs a reason and reviewed preview' USING ERRCODE='23514'; END IF;
   rollup:=taskpulse_private.checklist_rollup(p_task);enabled:=(p_payload->>'enabled')::boolean;
   IF (p_payload->>'preview_progress')::numeric IS DISTINCT FROM (rollup->>'taskProgress')::numeric THEN RAISE EXCEPTION 'Preview changed; reload before switching' USING ERRCODE='40001'; END IF;
   IF enabled AND (jsonb_array_length(rollup->'errors')>0 OR EXISTS(SELECT 1 FROM public.checklist_sections WHERE checklist_id=c.id AND NOT initialized)) THEN RAISE EXCEPTION 'Review all sections and correct references before enabling Activity progress' USING ERRCODE='23514'; END IF;
   UPDATE public.task_checklists SET sync_progress_to_task=enabled,credit_anchor=coalesce((rollup->>'taskProgress')::numeric,t.progress_percentage,credit_anchor) WHERE id=c.id;
   INSERT INTO taskpulse_private.checklist_credit_events(task_id,operation_id,progress_before,progress_after,scale,scale_version,participant_version,scaled_credit,event_kind,reason) VALUES(p_task,p_operation,t.progress_percentage,CASE WHEN enabled THEN (rollup->>'taskProgress')::numeric ELSE t.progress_percentage END,t.task_scale,t.scale_version,t.participant_version,0,'mode_switch',change_reason);
  END IF;
  IF p_command IN ('add','map','edit') THEN UPDATE public.checklist_sections SET initialized=true,intentional_empty=false WHERE checklist_id=c.id AND checklist_sections.role=section_role AND EXISTS(SELECT 1 FROM public.checklist_nodes WHERE checklist_id=c.id AND detail_section=section_role AND (node_type IN ('Item','Task') OR parent_node_id IS NOT NULL)); END IF;
 END IF;
 PERFORM taskpulse_private.refresh_task_metrics(p_task,p_operation,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
 UPDATE public.tasks SET lifecycle_version=lifecycle_version+1 WHERE id=p_task;
 result:=jsonb_build_object('taskId',p_task,'taskTag',t.task_tag,'checklistId',c.id,'nodeId',node_id,'version',(SELECT lifecycle_version FROM public.tasks WHERE id=p_task),'rollup',taskpulse_private.checklist_rollup(p_task));
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id) VALUES(actor,role::text,'checklist_'||p_command,'task_checklists',c.id,ARRAY[p_command],jsonb_build_object('before',before_state,'after',result->'rollup','node_id',node_id,'reason',change_reason,'state',p_payload->'state','node_before',jsonb_build_object('id',n.id,'parent',n.parent_node_id,'section',n.detail_section,'linked_task',n.linked_task_id,'type',n.node_type,'state',n.completion_state),'node_after',(SELECT jsonb_build_object('id',x.id,'parent',x.parent_node_id,'section',x.detail_section,'linked_task',x.linked_task_id,'type',x.node_type,'state',x.completion_state) FROM public.checklist_nodes x WHERE x.id=node_id)),p_operation);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload) VALUES(actor,'checklist_'||p_command,p_operation,request,p_task,result);
 RETURN result;
END $$;
