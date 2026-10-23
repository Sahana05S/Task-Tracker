-- Migration 68: Sub-missions are real missions linked under a parent mission
-- (user decision, 23 October 2026).
--
-- A Sub-mission has every feature of a mission: its own tag, assignees, due
-- date, status, timer and checklist, and it is listed in Missions. In the
-- parent it is a row linked to it (checklist_nodes.linked_task_id), so its
-- progress feeds that row and the row is complete only when the Sub-mission is
-- Done at 100% (the existing linked-row rule; no new formula). The parent link
-- is also recorded as a 'Subtask' dependency (predecessor = parent), which the
-- dependency graph already understands, so pages can say "Part of ...".
--
-- public.submission_create does it in one transaction: the mission through
-- create_task_with_scale (manager rights, tag allocation, participants and an
-- hours scale), its starting progress of 0, the linked row through
-- checklist_command('add'), and the dependency. It is idempotent by operation.

BEGIN;
SET LOCAL lock_timeout = '120s';

CREATE FUNCTION public.submission_create(p_parent_task uuid,p_checklist uuid,p_section text,p_parent_node uuid,
 p_payload jsonb,p_expected_version bigint,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); parent public.tasks; receipt taskpulse_private.command_receipts; request jsonb; child uuid;
 assignees uuid[]; reviewers uuid[]; shares integer[]; n integer; each_share integer; v bigint; row_result jsonb; result jsonb; BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.is_active AND u.role IN ('managing_director','project_engineer')) THEN
  RAISE EXCEPTION 'Only managing directors and project engineers can create sub-missions' USING ERRCODE='42501'; END IF;
 IF p_operation IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR nullif(btrim(p_payload->>'title'),'') IS NULL
  OR p_section IS NULL OR p_section NOT IN ('setup','activity','closure') THEN
  RAISE EXCEPTION 'A sub-mission needs a title and a phase' USING ERRCODE='23514'; END IF;
 request:=jsonb_build_array(p_parent_task,p_checklist,p_section,p_parent_node,p_payload,p_expected_version);
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||'submission_create'||p_operation::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command='submission_create' AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation key reused with different input' USING ERRCODE='23514'; END IF;
  RETURN receipt.result_payload;
 END IF;

 SELECT * INTO parent FROM public.tasks WHERE id=p_parent_task FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Parent mission not found' USING ERRCODE='23514'; END IF;
 IF parent.archived_effective_date IS NOT NULL OR parent.status IN ('Done','Discarded') THEN
  RAISE EXCEPTION 'Reopen the mission before adding sub-missions' USING ERRCODE='23514'; END IF;

 -- People default to the parent's; shares are equal.
 assignees:=coalesce((SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(p_payload->'assignee_ids') x),
  (SELECT array_agg(a.user_id ORDER BY a.is_primary DESC,a.user_id) FROM public.task_assignees a WHERE a.task_id=parent.id),
  ARRAY[coalesce(parent.assignee_id,actor)]);
 reviewers:=coalesce((SELECT array_agg(r.user_id ORDER BY r.is_primary DESC,r.user_id) FROM public.task_reviewers r WHERE r.task_id=parent.id),'{}');
 n:=cardinality(assignees); each_share:=1000000/n;
 shares:=array_fill(each_share,ARRAY[n]); shares[1]:=each_share+(1000000-each_share*n);

 child:=public.create_task_with_scale(
  jsonb_build_object('task_tag',NULL,'title',btrim(p_payload->>'title'),'category',parent.category,'priority',parent.priority,
   'due_date',coalesce(nullif(p_payload->>'due_date','')::date,parent.due_date)),
  assignees,reviewers,shares,false,jsonb_build_object('mode','hours','inputs',jsonb_build_object('multiplier',1)),
  md5(p_operation::text||':task')::uuid);
 IF (SELECT progress_percentage FROM public.tasks WHERE id=child) IS NULL THEN
  SELECT lifecycle_version INTO v FROM public.tasks WHERE id=child;
  PERFORM public.task_lifecycle_command(child,'progress',jsonb_build_object('progress',0),v,md5(p_operation::text||':progress')::uuid);
 END IF;

 row_result:=public.checklist_command(p_parent_task,'add',jsonb_build_object('checklist_id',p_checklist,'title',btrim(p_payload->>'title'),
  'section',p_section,'parent_id',p_parent_node,'linked_task_id',child),p_expected_version,md5(p_operation::text||':row')::uuid);
 INSERT INTO public.task_dependencies(predecessor_task_id,successor_task_id,relation_type,created_by)
  VALUES(p_parent_task,child,'Subtask',actor);

 result:=row_result||jsonb_build_object('subMissionId',child,'subMissionTag',(SELECT task_tag FROM public.tasks WHERE id=child),
  'version',(SELECT lifecycle_version FROM public.tasks WHERE id=p_parent_task));
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
  VALUES(actor,'submission_create',p_operation,request,child,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.submission_create(uuid,uuid,text,uuid,jsonb,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.submission_create(uuid,uuid,text,uuid,jsonb,bigint,uuid) TO authenticated;

COMMIT;
SELECT taskpulse_private.m15_secure();
