-- M09 independent native framework. Policy is null until D09/D12 approval.
BEGIN;
ALTER TABLE public.tasks ADD COLUMN archived_effective_date date,ADD COLUMN archive_reason text,ADD COLUMN handoff_successor_id uuid REFERENCES public.tasks(id) ON DELETE RESTRICT;
CREATE TABLE taskpulse_private.tool_policy(id boolean PRIMARY KEY DEFAULT true CHECK(id),config jsonb);
INSERT INTO taskpulse_private.tool_policy DEFAULT VALUES;
CREATE TABLE taskpulse_private.tool_previews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL REFERENCES public.users(id),command text NOT NULL,request jsonb NOT NULL,plan jsonb NOT NULL,fingerprints jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '15 minutes');
CREATE SEQUENCE taskpulse_private.tools_tag_sequence;
CREATE TABLE taskpulse_private.tool_tag_reservations(task_tag text PRIMARY KEY,preview_id uuid NOT NULL REFERENCES taskpulse_private.tool_previews(id));
CREATE TABLE taskpulse_private.tool_lineage(task_id uuid PRIMARY KEY REFERENCES public.tasks(id) ON DELETE RESTRICT,source_task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE RESTRICT,command text NOT NULL,preview_id uuid NOT NULL REFERENCES taskpulse_private.tool_previews(id),operation_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TRIGGER m09_preview_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.tool_previews FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();
CREATE TRIGGER m09_lineage_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.tool_lineage FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();
CREATE TRIGGER m09_reservation_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.tool_tag_reservations FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();

CREATE FUNCTION taskpulse_private.tool_fingerprint(p_task uuid) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT md5(jsonb_build_object('task',to_jsonb(t),
 'participants',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.user_id),'[]') FROM public.task_assignees a WHERE task_id=p_task),
 'reviewers',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.user_id),'[]') FROM public.task_reviewers a WHERE task_id=p_task),
 'instance',(SELECT to_jsonb(i) FROM public.task_detail_instances i WHERE task_id=p_task),
 'details',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.key_name),'[]') FROM public.task_detail_sections d WHERE task_id=p_task),
 'checklist',(SELECT to_jsonb(c) FROM public.task_checklists c WHERE task_id=p_task),
 'sections',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.role),'[]') FROM public.checklist_sections s JOIN public.task_checklists c ON c.id=s.checklist_id WHERE c.task_id=p_task),
 'nodes',(SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.id),'[]') FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE c.task_id=p_task))::text)
 FROM public.tasks t WHERE t.id=p_task;
$$;
CREATE FUNCTION taskpulse_private.tool_tag() RETURNS text LANGUAGE plpgsql SET search_path='' AS $$ DECLARE tag text;n text;BEGIN
 LOOP n:=nextval('taskpulse_private.tools_tag_sequence')::text;tag:='TT-'||lpad(n,greatest(6,length(n)),'0');
  EXIT WHEN NOT EXISTS(SELECT 1 FROM public.tasks WHERE task_tag=tag) AND NOT EXISTS(SELECT 1 FROM taskpulse_private.tool_tag_reservations WHERE task_tag=tag);
 END LOOP;RETURN tag;
END $$;
CREATE FUNCTION public.task_tools_preview(p_command text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role text:=public.get_user_role();actor uuid:=auth.uid();policy jsonb;t public.tasks;ids uuid[];tid uuid;fingerprints jsonb:='{}';items jsonb:='[]';item jsonb;new_tag text;pid uuid:=gen_random_uuid();
 count integer:=1;span integer:=1;start_date date;due date;assigned date;assignees uuid[];reviewers uuid[];shares integer[];idx integer;amount numeric;source_after numeric;source_before numeric;mode text;kind text;target date;scale_mode text;inputs jsonb;override_scale numeric;template uuid;reasons jsonb:='[]';inheritance jsonb;
BEGIN
 SELECT u.role::text INTO role FROM public.users u WHERE u.id=actor AND u.is_active FOR SHARE;
 IF role IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501';END IF;
 IF p_command IS NULL OR p_command NOT IN ('support','duplicate','weekly','day_count','all_team','number_suffix','carryover','bulk_done','bulk_reopen','section','refresh','archive') OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Supported operation and object inputs required' USING ERRCODE='23514';END IF;
 IF role NOT IN ('managing_director','project_engineer') AND p_command NOT IN ('bulk_done','refresh') THEN RAISE EXCEPTION 'Task manager required' USING ERRCODE='42501';END IF;
 IF p_payload-ARRAY['sourceTaskId','taskIds','startDate','dueDate','count','phaseDays','suffix','supportKind','splitMode','amount','percentage','assigneeId','reason','section','intentionalEmpty','targetMonth']<>'{}' THEN RAISE EXCEPTION 'Unexpected tool parameters' USING ERRCODE='23514';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT config INTO policy FROM taskpulse_private.tool_policy WHERE id;
 IF p_command IN ('bulk_done','bulk_reopen','section','refresh','archive') THEN SELECT array_agg(v::uuid ORDER BY v) INTO ids FROM jsonb_array_elements_text(p_payload->'taskIds') v;
 ELSE ids:=ARRAY[(p_payload->>'sourceTaskId')::uuid];END IF;
 IF ids IS NULL OR cardinality(ids)=0 OR cardinality(ids)>100 OR cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'Select 1-100 distinct tasks' USING ERRCODE='23514';END IF;
 FOREACH tid IN ARRAY ids LOOP
  SELECT * INTO t FROM public.tasks WHERE id=tid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected task missing' USING ERRCODE='23503';END IF;
  IF role NOT IN ('managing_director','project_engineer') AND NOT public.is_task_assignee(tid) THEN RAISE EXCEPTION 'Assigned actor required' USING ERRCODE='42501';END IF;
  fingerprints:=fingerprints||jsonb_build_object(tid,taskpulse_private.tool_fingerprint(tid));
 END LOOP;
 IF p_command IN ('support','duplicate','weekly','day_count','all_team','number_suffix','carryover') THEN
  FOR tid IN WITH RECURSIVE chain(id,path) AS (SELECT t.id,ARRAY[t.id] UNION ALL SELECT (a.scale_inputs->>'source_task_id')::uuid,c.path||(a.scale_inputs->>'source_task_id')::uuid FROM chain c JOIN public.tasks a ON a.id=c.id WHERE a.scale_mode='linked' AND a.scale_inputs->>'source_task_id' IS NOT NULL AND NOT (a.scale_inputs->>'source_task_id')::uuid=ANY(c.path)) SELECT id FROM chain LOOP fingerprints:=fingerprints||jsonb_build_object(tid,taskpulse_private.tool_fingerprint(tid));END LOOP;
  IF policy IS NULL THEN reasons:=reasons||'"task_tool_policy_unapproved"'::jsonb;END IF;
  start_date:=coalesce((p_payload->>'startDate')::date,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);due:=(p_payload->>'dueDate')::date;
  IF NOT isfinite(start_date) OR due IS NOT NULL AND NOT isfinite(due) THEN RAISE EXCEPTION 'Finite calendar dates required' USING ERRCODE='23514';END IF;
  IF p_command IN ('weekly','day_count','number_suffix') THEN count:=(p_payload->>'count')::integer;END IF;
  IF p_command='weekly' THEN span:=7;ELSIF p_command='day_count' THEN span:=(p_payload->>'phaseDays')::integer;END IF;
  IF count IS NULL OR count<1 OR count>100 OR span IS NULL OR span<1 OR span>366 THEN RAISE EXCEPTION '1-100 copies and 1-366 calendar days per phase required' USING ERRCODE='23514';END IF;
  SELECT array_agg(u ORDER BY primary_first DESC,u) INTO assignees FROM (SELECT u,bool_or(primary_first) primary_first FROM (SELECT t.assignee_id u,true primary_first UNION ALL SELECT user_id,is_primary FROM public.task_assignees WHERE task_id=t.id) raw GROUP BY u) p;
  SELECT array_agg(u ORDER BY u) INTO reviewers FROM (SELECT t.reviewer_id u WHERE t.reviewer_id IS NOT NULL UNION SELECT user_id FROM public.task_reviewers WHERE task_id=t.id) p;
  SELECT array_agg(a.share_units ORDER BY x.n) INTO shares FROM unnest(assignees) WITH ORDINALITY x(uid,n) LEFT JOIN public.task_assignees a ON a.task_id=t.id AND a.user_id=x.uid;
  IF cardinality(assignees)=1 THEN shares:=ARRAY[1000000];ELSIF shares IS NULL OR array_position(shares,NULL) IS NOT NULL OR (SELECT sum(s) FROM unnest(shares) s)<>1000000 THEN reasons:=reasons||'"participant_share_reconciliation_required"'::jsonb;END IF;
  source_before:=t.task_scale;amount:=t.task_scale;scale_mode:=t.scale_mode;inputs:=t.scale_inputs;override_scale:=t.scale_override;
  IF p_command='all_team' THEN SELECT array_agg(id ORDER BY id) INTO assignees FROM public.users WHERE is_active;count:=cardinality(assignees);fingerprints:=fingerprints||jsonb_build_object('@team',md5(to_jsonb(assignees)::text));END IF;
  IF p_command='support' THEN
   mode:=p_payload->>'splitMode';kind:=p_payload->>'supportKind';
   IF mode IS NULL OR mode NOT IN ('split-even','split-uneven','proportional','absolute') OR kind IS NULL OR kind NOT IN ('effort','skill') THEN RAISE EXCEPTION 'Explicit support kind/mode required' USING ERRCODE='23514';END IF;
   IF mode<>'absolute' AND (source_before IS NULL OR NOT(source_before>=0 AND source_before<'Infinity'::numeric)) THEN RAISE EXCEPTION 'Source scale is unavailable' USING ERRCODE='23514';END IF;
   IF mode='split-even' THEN amount:=source_before/2;source_after:=source_before-amount;
   ELSIF mode='split-uneven' THEN amount:=(p_payload->>'amount')::numeric;IF amount IS NULL OR NOT(amount>=0 AND amount<=source_before/CASE WHEN policy->>'unevenMaximum'='half' THEN 2 ELSE 1 END) THEN RAISE EXCEPTION 'Uneven amount exceeds source bound' USING ERRCODE='23514';END IF;source_after:=source_before-amount;
   ELSIF mode='proportional' THEN amount:=(p_payload->>'percentage')::numeric;IF amount IS NULL OR NOT(amount>=0 AND amount<=100) THEN RAISE EXCEPTION 'Percentage requires 0-100' USING ERRCODE='23514';END IF;inputs:=jsonb_build_object('source_task_id',t.id,'percentage',amount);amount:=source_before*amount/100;
   ELSE amount:=(p_payload->>'amount')::numeric;IF amount IS NULL OR NOT(amount>=0 AND amount<=500) THEN RAISE EXCEPTION 'Absolute scale requires 0-500' USING ERRCODE='23514';END IF;END IF;
   scale_mode:=CASE WHEN mode='proportional' THEN 'linked' ELSE 'manual' END;IF mode<>'proportional' THEN inputs:=jsonb_build_object('value',amount);END IF;override_scale:=NULL;
   assignees:=ARRAY[(p_payload->>'assigneeId')::uuid];shares:=ARRAY[1000000];
  ELSIF p_command='carryover' THEN
   reasons:=reasons||'"archive_handoff_contract_pending"'::jsonb;
   target:=(p_payload->>'targetMonth'||'-01')::date;
   IF target IS NULL OR target<>date_trunc('month',start_date)::date OR target<>date_trunc('month',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date)::date OR date_trunc('month',t.assigned_date)::date>=target OR t.status IN ('Done','Discarded') OR t.progress_percentage IS NULL OR source_before IS NULL THEN RAISE EXCEPTION 'Carryover requires unfinished measured earlier-period work and the current target month' USING ERRCODE='23514';END IF;
   amount:=source_before*(100-t.progress_percentage)/100;scale_mode:='manual';inputs:=jsonb_build_object('value',amount);override_scale:=NULL;
  ELSIF scale_mode='hours' AND override_scale IS NULL THEN amount:=0;END IF;
  SELECT template_version_id INTO template FROM public.task_detail_instances WHERE task_id=t.id;template:=coalesce(template,t.detail_template_preference,'04000000-0000-0000-0000-000000000002');
  IF count IS NULL OR count<1 OR count>100 THEN RAISE EXCEPTION 'Batch requires 1-100 active participants/tasks' USING ERRCODE='23514';END IF;
  IF due IS NOT NULL AND due<start_date THEN RAISE EXCEPTION 'Deadline precedes assignment' USING ERRCODE='23514';END IF;
  IF amount IS NULL THEN reasons:=reasons||'"scale_source_reconciliation_required"'::jsonb;END IF;
  IF EXISTS(SELECT 1 FROM unnest(assignees||coalesce(reviewers,ARRAY[]::uuid[])) uid LEFT JOIN public.users u ON u.id=uid WHERE u.id IS NULL OR NOT u.is_active) THEN reasons:=reasons||'"inactive_or_missing_participant"'::jsonb;END IF;
  IF EXISTS(SELECT 1 FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE c.task_id=t.id AND n.detail_section IS NULL) THEN reasons:=reasons||'"checklist_section_reconciliation_required"'::jsonb;END IF;
  IF source_after IS NOT NULL OR p_command='carryover' THEN IF nullif(btrim(p_payload->>'reason'),'') IS NULL THEN reasons:=reasons||'"reason_required"'::jsonb;END IF;END IF;
  FOR idx IN 1..count LOOP
   assigned:=CASE WHEN p_command IN ('weekly','day_count') THEN start_date+(idx-1)*span ELSE start_date END;
   new_tag:=taskpulse_private.tool_tag();
   item:=jsonb_build_object('taskTag',new_tag,'title',left(t.title||CASE WHEN p_command='support' THEN ' - '||initcap(kind)||' Support' WHEN p_command='carryover' THEN ' - Carryover' WHEN p_command='number_suffix' THEN ' '||coalesce(p_payload->>'suffix','')||' '||idx ELSE ' (Copy '||idx||')' END,255),
    'category',CASE WHEN p_command='support' AND kind='skill' THEN 'SD' ELSE t.category::text END,'priority',t.priority,'assignedDate',assigned,'dueDate',CASE WHEN p_command IN ('weekly','day_count') THEN assigned+span-1 ELSE due END,
    'scale',amount::text,'scaleMode',scale_mode,'scaleInputs',inputs,'scaleOverride',override_scale,'assignees',CASE WHEN p_command='all_team' THEN to_jsonb(ARRAY[assignees[idx]]) ELSE to_jsonb(assignees) END,
    'reviewers',coalesce(to_jsonb(reviewers),'[]'),'shares',CASE WHEN p_command='all_team' THEN '[1000000]'::jsonb ELSE to_jsonb(shares) END,'templateVersionId',template,'sourceTaskId',t.id);
   items:=items||jsonb_build_array(item);
  END LOOP;
 ELSE
  IF p_command='archive' THEN reasons:=reasons||'"archive_handoff_contract_pending"'::jsonb;END IF;
  IF (p_command IN ('archive') OR cardinality(ids)>1) AND policy IS NULL THEN reasons:=reasons||'"task_tool_policy_unapproved"'::jsonb;END IF;
  FOREACH tid IN ARRAY ids LOOP SELECT * INTO t FROM public.tasks WHERE id=tid;items:=items||jsonb_build_array(jsonb_build_object('taskId',tid,'taskTag',t.task_tag,'title',t.title,'version',t.lifecycle_version,'category',t.category,'assignedDate',t.assigned_date,'dueDate',t.due_date,'scale',t.task_scale::text,'scaleMode',t.scale_mode));END LOOP;
 END IF;
 inheritance:=jsonb_build_object('execution','Not Started / 0%; no logs, timers or approvals','template','captured published version; new independent instance','checklist','current structure; reset leaves to No; linked leaves become ordinary reviewable items; sections uninitialized; manual progress','editableContent','description only; other current content cleared','assetLinks','none; no provider operation','scale','supported family retained; hours reset unless an explicit override; carryover remaining manual snapshot');
 INSERT INTO taskpulse_private.tool_previews(id,actor_id,command,request,plan,fingerprints) VALUES(pid,actor,p_command,p_payload,jsonb_build_object('id',pid,'command',p_command,'expiresAt',clock_timestamp()+interval '15 minutes','policyId',policy->>'id','policyFingerprint',md5(policy::text),'ready',jsonb_array_length(reasons)=0,'reasons',reasons,'items',items,'sourceScaleBefore',source_before::text,'sourceScaleAfter',source_after::text,'inheritance',inheritance),fingerprints);
 FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP IF item->>'taskId' IS NULL THEN INSERT INTO taskpulse_private.tool_tag_reservations VALUES(item->>'taskTag',pid);END IF;END LOOP;
 RETURN (SELECT plan FROM taskpulse_private.tool_previews WHERE id=pid);
END $$;

CREATE FUNCTION taskpulse_private.clone_tool_structure(p_source uuid,p_target uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE source_c public.task_checklists;target_c uuid;nodes jsonb:='{}';n record;nid uuid;BEGIN
 UPDATE public.task_detail_sections dst SET content=CASE WHEN dst.key_name='description' THEN (SELECT description FROM public.tasks WHERE id=p_source) ELSE NULL END WHERE dst.task_id=p_target;
 SELECT * INTO source_c FROM public.task_checklists WHERE task_id=p_source;
 SELECT id INTO target_c FROM public.task_checklists WHERE task_id=p_target;
 IF source_c.id IS NULL THEN RETURN;END IF;
 IF EXISTS(SELECT 1 FROM public.checklist_nodes WHERE checklist_id=source_c.id AND detail_section IS NULL) THEN RAISE EXCEPTION 'Source checklist needs section reconciliation before copying' USING ERRCODE='23514';END IF;
 DELETE FROM public.checklist_nodes WHERE checklist_id=target_c;
 FOR n IN WITH RECURSIVE tree AS (SELECT a.*,0 depth FROM public.checklist_nodes a WHERE checklist_id=source_c.id AND parent_node_id IS NULL UNION ALL SELECT a.*,t.depth+1 FROM public.checklist_nodes a JOIN tree t ON a.parent_node_id=t.id WHERE a.checklist_id=source_c.id) SELECT * FROM tree ORDER BY depth,sort_order,id LOOP
  nid:=gen_random_uuid();nodes:=nodes||jsonb_build_object(n.id,nid);
  INSERT INTO public.checklist_nodes(id,checklist_id,parent_node_id,node_type,title,description,detail_section,sort_order,is_complete,completion_state)
  VALUES(nid,target_c,(nodes->>n.parent_node_id::text)::uuid,CASE WHEN n.node_type='Task' THEN 'Item'::public.checklist_node_type ELSE n.node_type END,n.title,n.description,n.detail_section,n.sort_order,false,'No');
 END LOOP;
 IF (SELECT count(*) FROM public.checklist_nodes WHERE checklist_id=source_c.id)<>(SELECT count(*) FROM public.checklist_nodes WHERE checklist_id=target_c) THEN RAISE EXCEPTION 'Source checklist structure is incomplete/cyclic' USING ERRCODE='23514';END IF;
 UPDATE public.checklist_sections SET initialized=false,intentional_empty=false,reason=NULL WHERE checklist_id=target_c;
 UPDATE public.task_checklists SET sync_progress_to_task=false,initialization_state='uninitialized',credit_anchor=0 WHERE id=target_c;
END $$;
CREATE FUNCTION public.task_tools_command(p_preview uuid,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();role text:=public.get_user_role();p taskpulse_private.tool_previews;receipt taskpulse_private.command_receipts;policy jsonb;k text;fingerprint text;t public.tasks;item jsonb;target uuid;result jsonb:='[]';operation uuid;assignees uuid[];reviewers uuid[];shares integer[];state jsonb;cid uuid;BEGIN
 SELECT u.role::text INTO role FROM public.users u WHERE u.id=actor AND u.is_active FOR SHARE;
 IF role IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501';END IF;
 IF p_operation IS NULL THEN RAISE EXCEPTION 'Operation required' USING ERRCODE='23514';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command='task_tools' AND operation_id=p_operation;
 IF FOUND THEN IF receipt.request IS DISTINCT FROM to_jsonb(p_preview) THEN RAISE EXCEPTION 'Operation reused with another preview' USING ERRCODE='40001';END IF;RETURN receipt.result_payload;END IF;
 SELECT * INTO p FROM taskpulse_private.tool_previews WHERE id=p_preview FOR SHARE;
 IF NOT FOUND OR p.actor_id<>actor THEN RAISE EXCEPTION 'Own Task Tools preview required' USING ERRCODE='42501';END IF;
 IF p.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Preview expired; prepare a new preview' USING ERRCODE='40001';END IF;
 IF NOT(p.plan->>'ready')::boolean THEN RAISE EXCEPTION 'Preview contains unresolved policy/source decisions' USING ERRCODE='23514';END IF;
 SELECT config INTO policy FROM taskpulse_private.tool_policy WHERE id;
 IF p.plan->>'policyId' IS DISTINCT FROM policy->>'id' OR p.plan->>'policyFingerprint' IS DISTINCT FROM md5(policy::text) THEN RAISE EXCEPTION 'Policy changed; preview again' USING ERRCODE='40001';END IF;
 FOR k,fingerprint IN SELECT key,value FROM jsonb_each_text(p.fingerprints) LOOP
  IF k='@team' THEN IF fingerprint IS DISTINCT FROM (SELECT md5(to_jsonb(array_agg(id ORDER BY id))::text) FROM public.users WHERE is_active) THEN RAISE EXCEPTION 'Active team changed; preview again' USING ERRCODE='40001';END IF;
  ELSE PERFORM 1 FROM public.tasks WHERE id=k::uuid FOR UPDATE;IF fingerprint IS DISTINCT FROM taskpulse_private.tool_fingerprint(k::uuid) THEN RAISE EXCEPTION 'Source changed; preview again' USING ERRCODE='40001';END IF;END IF;
 END LOOP;
 IF role NOT IN ('managing_director','project_engineer') AND p.command NOT IN ('bulk_done','refresh') THEN RAISE EXCEPTION 'Task manager required' USING ERRCODE='42501';END IF;
 IF p.command IN ('support','duplicate','weekly','day_count','all_team','number_suffix','carryover','archive') OR jsonb_array_length(p.plan->'items')>1 THEN IF policy IS NULL THEN RAISE EXCEPTION 'Task Tool policy unapproved' USING ERRCODE='23514';END IF;END IF;
 IF p.command IN ('archive','carryover') THEN RAISE EXCEPTION 'Dated archive/handoff contract requires approval and activation before execution' USING ERRCODE='23514';END IF;
 IF p.command='support' AND p.plan->>'sourceScaleAfter' IS NOT NULL THEN
  SELECT * INTO t FROM public.tasks WHERE id=(p.request->>'sourceTaskId')::uuid;
  PERFORM public.task_lifecycle_command(t.id,'scale',jsonb_build_object('mode',t.scale_mode,'inputs',t.scale_inputs,'override',(p.plan->>'sourceScaleAfter')::numeric,'reason',p.request->>'reason','provenance','M09 support split preserving prior earned credit'),t.lifecycle_version,md5(p_operation::text||':reduce')::uuid);
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p.plan->'items') LOOP
  BEGIN
  operation:=md5(p_operation::text||coalesce(item->>'taskTag',item->>'taskId'))::uuid;
  IF p.command IN ('support','duplicate','weekly','day_count','all_team','number_suffix','carryover') THEN
   IF EXISTS(SELECT 1 FROM public.tasks WHERE task_tag=item->>'taskTag') THEN RAISE EXCEPTION 'Preview tag already used; prepare a new preview' USING ERRCODE='40001';END IF;
   SELECT array_agg(v::uuid) INTO assignees FROM jsonb_array_elements_text(item->'assignees') v;SELECT coalesce(array_agg(v::uuid),ARRAY[]::uuid[]) INTO reviewers FROM jsonb_array_elements_text(item->'reviewers') v;SELECT array_agg(v::integer) INTO shares FROM jsonb_array_elements_text(item->'shares') v;
   target:=public.save_task_with_participants(NULL,jsonb_build_object('task_tag',item->>'taskTag','title',item->>'title','category',item->>'category','priority',item->>'priority','task_scale',(item->>'scale')::numeric,'due_date',item->>'dueDate','description',(SELECT description FROM public.tasks WHERE id=(item->>'sourceTaskId')::uuid),'template_version_id',item->>'templateVersionId','initialize_details',true),assignees,reviewers,shares,NULL,false,operation);
   PERFORM taskpulse_private.assert_task_open_date(target,(item->>'assignedDate')::date);
   UPDATE public.tasks SET assigned_date=(item->>'assignedDate')::date WHERE id=target;
   PERFORM taskpulse_private.clone_tool_structure((item->>'sourceTaskId')::uuid,target);
   SELECT * INTO t FROM public.tasks WHERE id=target;
   PERFORM public.task_lifecycle_command(target,'scale',jsonb_build_object('mode',item->>'scaleMode','inputs',item->'scaleInputs','override',item->'scaleOverride','reason',coalesce(p.request->>'reason','New copied task'),'provenance','M09 previewed source scale family'),t.lifecycle_version,md5(operation::text||':scale')::uuid);
   INSERT INTO public.task_dependencies(predecessor_task_id,successor_task_id,relation_type,notes,created_by) VALUES((item->>'sourceTaskId')::uuid,target,CASE WHEN p.command='support' THEN 'Support' WHEN p.command='carryover' THEN 'Carryover' ELSE 'Related' END::public.task_relation_type,'M09 native lineage; no provider asset copied',actor);
   INSERT INTO taskpulse_private.tool_lineage VALUES(target,(item->>'sourceTaskId')::uuid,p.command,p.id,p_operation,clock_timestamp());
   result:=result||jsonb_build_array(jsonb_build_object('taskId',target,'taskTag',item->>'taskTag','status','created'));
  ELSE
   target:=(item->>'taskId')::uuid;SELECT * INTO t FROM public.tasks WHERE id=target;
   IF role NOT IN ('managing_director','project_engineer') AND NOT public.is_task_assignee(target) THEN RAISE EXCEPTION 'Assigned actor required' USING ERRCODE='42501';END IF;
   IF p.command IN ('bulk_done','bulk_reopen') THEN PERFORM public.task_lifecycle_command(target,'transition',jsonb_build_object('status',CASE WHEN p.command='bulk_done' THEN 'Done' ELSE 'In Progress' END,'reason',p.request->>'reason'),t.lifecycle_version,operation);
   ELSIF p.command='section' THEN
    IF (p.request->>'intentionalEmpty')::boolean THEN SELECT id INTO cid FROM public.task_checklists WHERE task_id=target;IF EXISTS(SELECT 1 FROM public.checklist_nodes WHERE checklist_id=cid AND detail_section=p.request->>'section' AND node_type IN ('Item','Task')) THEN RAISE EXCEPTION 'Applicable work cannot be auto-completed' USING ERRCODE='23514';END IF;END IF;
    PERFORM public.checklist_command(target,'section',jsonb_build_object('section',p.request->>'section','intentional_empty',(p.request->>'intentionalEmpty')::boolean,'reason',p.request->>'reason'),t.lifecycle_version,operation);
   ELSIF p.command='refresh' THEN
    PERFORM taskpulse_private.assert_task_open_date(target,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
    PERFORM taskpulse_private.refresh_task_metrics(target,operation,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
    INSERT INTO taskpulse_private.performance_observations(kind,source_key,entity_id,data) VALUES('task',target::text,target,taskpulse_private.task_observation(target));
   ELSIF p.command='archive' THEN
    IF NOT coalesce((policy->>'archive')::boolean,false) OR nullif(btrim(p.request->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Approved archive policy and reason required' USING ERRCODE='23514';END IF;
    PERFORM taskpulse_private.assert_task_open_date(target,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
    UPDATE public.tasks SET archived_effective_date=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date,archive_reason=p.request->>'reason',lifecycle_version=lifecycle_version+1 WHERE id=target;
   END IF;
   result:=result||jsonb_build_array(jsonb_build_object('taskId',target,'taskTag',t.task_tag,'status',CASE WHEN p.command='refresh' THEN 'shared_recomputation_queued' ELSE 'committed' END));
  END IF;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION '%: %',item->>'taskTag',SQLERRM USING ERRCODE=SQLSTATE;END;
 END LOOP;
 IF p.command='carryover' THEN
  SELECT * INTO t FROM public.tasks WHERE id=(p.request->>'sourceTaskId')::uuid;PERFORM taskpulse_private.assert_task_open_date(t.id,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
  IF nullif(btrim(p.request->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Carryover handoff reason required' USING ERRCODE='23514';END IF;
  UPDATE public.tasks SET archived_effective_date=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date,archive_reason=p.request->>'reason',handoff_successor_id=target,lifecycle_version=lifecycle_version+1 WHERE id=t.id;
 END IF;
 state:=jsonb_build_object('previewId',p.id,'items',result,'status','committed','providerState','not_requested');
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id) VALUES(actor,role,'task_tools_'||p.command,'tool_previews',p.id,ARRAY['native_workflow'],jsonb_build_object('itemCount',jsonb_array_length(result),'providerRequested',false),p_operation);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload) VALUES(actor,'task_tools',p_operation,to_jsonb(p.id),p.id,state);
 RETURN state;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.task_tools_preview(text,jsonb),public.task_tools_command(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.task_tools_preview(text,jsonb),public.task_tools_command(uuid,uuid) TO authenticated;
COMMIT;
