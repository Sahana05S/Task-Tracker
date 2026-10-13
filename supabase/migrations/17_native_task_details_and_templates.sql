-- M04: native content, immutable templates and atomic shared initialization.
BEGIN;
CREATE TABLE public.task_detail_fields(key_name text PRIMARY KEY,title text NOT NULL,group_name text NOT NULL);
INSERT INTO public.task_detail_fields VALUES
 ('description','Description','description'),('smart_specific','Specific','smart'),('smart_measurable','Measurable','smart'),
 ('smart_achievable','Achievable','smart'),('smart_relevant','Relevant','smart'),('smart_time_bound','Time-Bound','smart'),
 ('input_content','Inputs','input'),('process_content','Process','process'),('output_content','Outputs','output'),('reviewer_notes','Reviewer notes','review');
CREATE TABLE public.task_detail_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),created_by uuid REFERENCES public.users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.task_detail_template_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),template_id uuid NOT NULL REFERENCES public.task_detail_templates(id),version integer NOT NULL CHECK(version>0),
 payload jsonb NOT NULL,requires_review boolean NOT NULL DEFAULT false,created_by uuid REFERENCES public.users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(template_id,version));
CREATE TABLE public.task_detail_instances(task_id uuid PRIMARY KEY REFERENCES public.tasks(id) ON DELETE RESTRICT,
 template_version_id uuid NOT NULL REFERENCES public.task_detail_template_versions(id),instructions jsonb NOT NULL,
 initialized_at timestamptz NOT NULL DEFAULT now(),initialized_by uuid REFERENCES public.users(id),
 provider_state text NOT NULL DEFAULT 'not_requested' CHECK(provider_state IN ('not_requested','pending','failed','succeeded')));
CREATE TABLE public.task_detail_review_flags(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),task_id uuid NOT NULL REFERENCES public.tasks(id),source_section_id uuid REFERENCES public.task_detail_sections(id),reason text NOT NULL,UNIQUE(source_section_id,reason));
ALTER TABLE public.tasks ADD COLUMN detail_template_preference uuid REFERENCES public.task_detail_template_versions(id);
ALTER TABLE public.task_links ADD COLUMN ipo_role text CHECK(ipo_role IN ('input','process','output','reference')),
 ADD COLUMN related_employee_id uuid REFERENCES public.users(id),ADD COLUMN related_report_id uuid REFERENCES public.report_snapshots(id);
ALTER TABLE public.task_checklists ADD COLUMN initialization_state text NOT NULL DEFAULT 'uninitialized' CHECK(initialization_state IN ('uninitialized','incomplete')),
 ADD COLUMN detail_template_version_id uuid REFERENCES public.task_detail_template_versions(id);
ALTER TABLE public.checklist_nodes ADD COLUMN detail_section text CHECK(detail_section IN ('setup','activity','closure'));
-- Pure scaffold; no private example data or completed content.
INSERT INTO public.task_detail_templates(id,name) VALUES('04000000-0000-0000-0000-000000000001','Blank native task');
INSERT INTO public.task_detail_template_versions(id,template_id,version,payload) VALUES
 ('04000000-0000-0000-0000-000000000002','04000000-0000-0000-0000-000000000001',1,'{"instructions":{},"checklist_nodes":[]}');
-- Snapshot existing native templates verbatim, without inventing section mappings.
INSERT INTO public.task_detail_templates(id,name,created_by) SELECT id,name,created_by FROM public.checklist_templates;
INSERT INTO public.task_detail_template_versions(template_id,version,payload,requires_review,created_by)
 SELECT t.id,1,jsonb_build_object('instructions','{}'::jsonb,'checklist_nodes','[]'::jsonb,'legacy_description',t.description,
 'legacy_nodes',coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.sort_order,n.id) FROM public.checklist_template_nodes n WHERE n.template_id=t.id),'[]'::jsonb)),true,t.created_by FROM public.checklist_templates t;
-- Preserve every original row; copy only unambiguous content to an empty destination.
DO $$ DECLARE s public.task_detail_sections; target text; placeholder boolean; BEGIN
 FOR s IN SELECT * FROM public.task_detail_sections ORDER BY created_at,id LOOP
  target:=CASE s.key_name WHEN 'inputs' THEN 'input_content' WHEN 'process' THEN 'process_content' WHEN 'outputs' THEN 'output_content' END;
  placeholder:=(s.key_name='smart_goals' AND s.content=E'Specific\nMeasurable\nAchievable\nRelevant\nTime-Bound') OR
   (s.key_name IN ('inputs','outputs') AND s.content=E'Document\nAccount\nFlowchart\nEngineering\nDrawing\nDependency Tasks') OR
   (s.key_name='process' AND s.content=E'Master Checklist\nDocument\nAccount\nFlowchart\nEngineering\nDrawing\nDependency Tasks') OR
   (s.key_name='task_log' AND s.content=E'Date\nUpdate\nHours Worked\nRaw Links');
  IF target IS NOT NULL AND NOT coalesce(placeholder,false) AND nullif(btrim(s.content),'') IS NOT NULL THEN
   INSERT INTO public.task_detail_sections(task_id,key_name,title,content,updated_by)
    SELECT s.task_id,target,f.title,s.content,s.updated_by FROM public.task_detail_fields f WHERE f.key_name=target ON CONFLICT(task_id,key_name) DO UPDATE SET content=excluded.content,updated_by=excluded.updated_by WHERE nullif(btrim(public.task_detail_sections.content),'') IS NULL;
   IF EXISTS(SELECT 1 FROM public.task_detail_sections d WHERE d.task_id=s.task_id AND d.key_name=target AND d.content IS DISTINCT FROM s.content) THEN
    INSERT INTO public.task_detail_review_flags(task_id,source_section_id,reason) VALUES(s.task_id,s.id,'canonical_conflict') ON CONFLICT DO NOTHING; END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.task_detail_fields f WHERE f.key_name=s.key_name) THEN
   INSERT INTO public.task_detail_review_flags(task_id,source_section_id,reason) VALUES(s.task_id,s.id,
    CASE WHEN placeholder THEN 'legacy_instruction' WHEN target IS NOT NULL THEN 'legacy_mapped_copy' ELSE 'ambiguous_legacy_text' END) ON CONFLICT DO NOTHING;
  END IF;
 END LOOP;
 INSERT INTO public.task_detail_sections(task_id,key_name,title,content)
  SELECT id,'description','Description',description FROM public.tasks WHERE nullif(btrim(description),'') IS NOT NULL ON CONFLICT(task_id,key_name) DO UPDATE SET content=excluded.content WHERE nullif(btrim(public.task_detail_sections.content),'') IS NULL;
END $$;
CREATE FUNCTION taskpulse_private.valid_detail_entry(p_task uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.tasks t JOIN public.users u ON u.id=t.assignee_id AND u.is_active WHERE t.id=p_task AND length(btrim(t.task_tag)) BETWEEN 1 AND 30 AND length(btrim(t.title)) BETWEEN 1 AND 255 AND t.category IS NOT NULL AND t.priority IS NOT NULL);
$$;
CREATE FUNCTION taskpulse_private.initialize_native_details(p_task uuid,p_template uuid,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE t public.tasks; instance public.task_detail_instances; v public.task_detail_template_versions; cid uuid; root uuid; nid uuid; parents jsonb:='{}'; n jsonb; section text; had_checklist boolean; BEGIN
 SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task FOR UPDATE;
 SELECT * INTO instance FROM public.task_detail_instances WHERE task_id=p_task;
 IF FOUND THEN
  IF p_template IS NOT NULL AND p_template<>instance.template_version_id THEN RAISE EXCEPTION 'Task already has an independent template instance; initialization cannot replace it' USING ERRCODE='23514'; END IF;
  RETURN jsonb_build_object('taskId',p_task,'nativeState','ready','providerState',instance.provider_state,'templateVersionId',instance.template_version_id);
 END IF;
 IF NOT taskpulse_private.valid_detail_entry(p_task) THEN RETURN jsonb_build_object('taskId',p_task,'nativeState','draft','providerState','not_requested'); END IF;
 IF t.status IN ('Done','Discarded') THEN RAISE EXCEPTION 'Reopen before native initialization' USING ERRCODE='23514'; END IF;
 PERFORM taskpulse_private.assert_task_open_date(p_task,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
 SELECT * INTO v FROM public.task_detail_template_versions WHERE id=coalesce(p_template,t.detail_template_preference,'04000000-0000-0000-0000-000000000002');
 IF NOT FOUND OR v.requires_review THEN RAISE EXCEPTION 'Select a published native template; legacy templates need section review' USING ERRCODE='23514'; END IF;
 INSERT INTO public.task_detail_instances(task_id,template_version_id,instructions,initialized_by) VALUES(p_task,v.id,v.payload->'instructions',auth.uid());
 INSERT INTO public.task_detail_sections(task_id,key_name,title,content,updated_by)
  SELECT p_task,key_name,title,CASE WHEN key_name='description' THEN t.description ELSE NULL END,auth.uid() FROM public.task_detail_fields ON CONFLICT(task_id,key_name) DO NOTHING;
 SELECT id INTO cid FROM public.task_checklists WHERE task_id=p_task; had_checklist:=FOUND;
 IF NOT had_checklist THEN
  INSERT INTO public.task_checklists(task_id,title,created_by,sync_progress_to_task,detail_template_version_id,initialization_state)
   VALUES(p_task,'Master checklist',auth.uid(),false,v.id,CASE WHEN jsonb_array_length(v.payload->'checklist_nodes')>0 THEN 'incomplete' ELSE 'uninitialized' END) RETURNING id INTO cid;
  FOREACH section IN ARRAY ARRAY['setup','activity','closure'] LOOP
   INSERT INTO public.checklist_nodes(checklist_id,node_type,title,detail_section,sort_order,is_complete)
    VALUES(cid,'Group',initcap(section),section,CASE section WHEN 'setup' THEN 0 WHEN 'activity' THEN 1 ELSE 2 END,false) RETURNING id INTO root;
   parents:=parents||jsonb_build_object('@'||section,root);
  END LOOP;
  FOR n IN SELECT value FROM jsonb_array_elements(v.payload->'checklist_nodes') LOOP
   INSERT INTO public.checklist_nodes(checklist_id,parent_node_id,node_type,title,description,detail_section,sort_order,is_complete)
    VALUES(cid,(parents->>coalesce(n->>'parent_key','@'||(n->>'section')))::uuid,(n->>'node_type')::public.checklist_node_type,n->>'title',n->>'description',n->>'section',coalesce((n->>'sort_order')::integer,0),false) RETURNING id INTO nid;
   parents:=parents||jsonb_build_object(n->>'key',nid);
  END LOOP;
 END IF;
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
  VALUES(auth.uid(),public.get_user_role()::text,'initialize_native_details','tasks',p_task,ARRAY['native_details'],jsonb_build_object('template_version',v.id,'existing_checklist_retained',had_checklist),p_operation);
 INSERT INTO taskpulse_private.outbox_jobs(kind,entity_id,entity_version,operation_id,payload)
  VALUES('native_details_initialized',p_task,1,p_operation,jsonb_build_object('native_ready',true,'provider_requested',false)) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('taskId',p_task,'nativeState','ready','providerState','not_requested','templateVersionId',v.id);
END $$;
CREATE FUNCTION public.publish_task_detail_template(p_template uuid,p_name text,p_payload jsonb,p_expected_version integer,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role public.user_role; tid uuid; version integer; vid uuid; n jsonb; instruction record; nodes jsonb; seen jsonb:='{}'; request jsonb:=jsonb_build_array(p_template,p_name,p_payload,p_expected_version); receipt taskpulse_private.command_receipts; result jsonb; BEGIN
 SELECT u.role INTO role FROM public.users u WHERE id=auth.uid() AND is_active FOR SHARE;
 IF role IS NULL OR role NOT IN ('managing_director','project_engineer') THEN RAISE EXCEPTION 'Active task manager required' USING ERRCODE='42501'; END IF;
 IF p_operation IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_payload-ARRAY['instructions','checklist_nodes']<>'{}' OR jsonb_typeof(p_payload->'instructions') IS DISTINCT FROM 'object' OR jsonb_typeof(p_payload->'checklist_nodes') IS DISTINCT FROM 'array' OR length(btrim(p_name)) NOT BETWEEN 1 AND 120 OR p_name IS NULL THEN RAISE EXCEPTION 'Valid named native template required' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'publish_detail_template'||p_operation::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=auth.uid() AND command='publish_detail_template' AND operation_id=p_operation;
 IF FOUND THEN IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='23514'; END IF; RETURN receipt.result_payload; END IF;
 FOR instruction IN SELECT * FROM jsonb_each(p_payload->'instructions') LOOP
  IF NOT EXISTS(SELECT 1 FROM public.task_detail_fields WHERE key_name=instruction.key) OR jsonb_typeof(instruction.value)<>'string' THEN RAISE EXCEPTION 'Unknown instruction field' USING ERRCODE='23514'; END IF;
 END LOOP;
 nodes:=p_payload->'checklist_nodes'; IF jsonb_array_length(nodes)>500 THEN RAISE EXCEPTION 'Template exceeds 500 nodes' USING ERRCODE='23514'; END IF;
 FOR n IN SELECT value FROM jsonb_array_elements(nodes) LOOP
  IF jsonb_typeof(n)<>'object' OR n-ARRAY['key','parent_key','section','node_type','title','description','sort_order']<>'{}' OR
   nullif(btrim(n->>'key'),'') IS NULL OR n->>'key' LIKE '@%' OR seen?(n->>'key') OR n->>'section' IS NULL OR n->>'section' NOT IN ('setup','activity','closure') OR
   n->>'node_type' IS NULL OR n->>'node_type' NOT IN ('Group','Item','Page') OR nullif(btrim(n->>'title'),'') IS NULL OR length(n->>'title')>180 OR
   (n->>'parent_key' IS NOT NULL AND (seen->>(n->>'parent_key')) IS DISTINCT FROM n->>'section') THEN RAISE EXCEPTION 'Nodes require unique keys, a section and earlier same-section parents' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(n->'key')<>'string' OR jsonb_typeof(n->'title')<>'string' OR (n?'description' AND jsonb_typeof(n->'description') NOT IN ('string','null')) OR (n?'parent_key' AND jsonb_typeof(n->'parent_key') NOT IN ('string','null')) OR (n?'sort_order' AND (jsonb_typeof(n->'sort_order')<>'number' OR (n->>'sort_order')::numeric<>trunc((n->>'sort_order')::numeric))) THEN RAISE EXCEPTION 'Typed node text and integer sort order required' USING ERRCODE='23514'; END IF;
  seen:=seen||jsonb_build_object(n->>'key',n->>'section');
 END LOOP;
 IF p_template IS NULL THEN
  IF coalesce(p_expected_version,0)<>0 THEN RAISE EXCEPTION 'New template starts at version zero' USING ERRCODE='40001'; END IF;
  INSERT INTO public.task_detail_templates(name,created_by) VALUES(btrim(p_name),auth.uid()) RETURNING id INTO tid; version:=1;
 ELSE
  SELECT id INTO STRICT tid FROM public.task_detail_templates WHERE id=p_template FOR UPDATE;
  IF (SELECT name FROM public.task_detail_templates WHERE id=tid)<>btrim(p_name) THEN RAISE EXCEPTION 'Template identity/name is stable' USING ERRCODE='23514'; END IF;
  SELECT max(v.version)+1 INTO version FROM public.task_detail_template_versions v WHERE template_id=tid;
  IF p_expected_version IS DISTINCT FROM version-1 THEN RAISE EXCEPTION 'Template changed; reload latest version' USING ERRCODE='40001'; END IF;
 END IF;
 INSERT INTO public.task_detail_template_versions(template_id,version,payload,created_by) VALUES(tid,version,p_payload,auth.uid()) RETURNING id INTO vid;
 result:=jsonb_build_object('templateId',tid,'templateVersionId',vid,'version',version);
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id) VALUES(auth.uid(),role::text,'publish_detail_template','task_detail_template_versions',vid,ARRAY['template_version'],jsonb_build_object('template',tid,'version',version),p_operation);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload) VALUES(auth.uid(),'publish_detail_template',p_operation,request,vid,result);
 RETURN result;
END $$;
CREATE FUNCTION public.task_details_command(p_task uuid,p_command text,p_payload jsonb,p_expected_version bigint,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role public.user_role; t public.tasks; receipt taskpulse_private.command_receipts; request jsonb:=jsonb_build_array(p_task,p_command,p_payload,p_expected_version); result jsonb; item record; link_id uuid; report_employee uuid; path text; BEGIN
 SELECT u.role INTO role FROM public.users u WHERE u.id=auth.uid() AND u.is_active FOR SHARE;
 IF role IS NULL OR role NOT IN ('managing_director','project_engineer') THEN RAISE EXCEPTION 'Active task manager required' USING ERRCODE='42501'; END IF;
 IF p_operation IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_command IS NULL OR p_command NOT IN ('initialize','save','link','relation','rename_link') THEN RAISE EXCEPTION 'Invalid detail command' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'detail_'||p_command||p_operation::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=auth.uid() AND command='detail_'||p_command AND operation_id=p_operation;
 IF FOUND THEN IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='23514'; END IF; RETURN receipt.result_payload; END IF;
 SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task FOR UPDATE;
 IF p_command='initialize' THEN
  IF p_payload-ARRAY['template_version_id']<>'{}' THEN RAISE EXCEPTION 'Unknown initialization fields' USING ERRCODE='23514'; END IF;
  -- Existing instances converge even when another initialization advanced the version.
  IF NOT EXISTS(SELECT 1 FROM public.task_detail_instances WHERE task_id=p_task) AND p_expected_version IS DISTINCT FROM t.lifecycle_version THEN RAISE EXCEPTION 'Task changed; reload' USING ERRCODE='40001'; END IF;
  result:=taskpulse_private.initialize_native_details(p_task,(p_payload->>'template_version_id')::uuid,p_operation);
 ELSE
  IF p_expected_version IS DISTINCT FROM t.lifecycle_version THEN RAISE EXCEPTION 'Task changed; reload details' USING ERRCODE='40001'; END IF;
  IF t.status IN ('Done','Discarded') THEN RAISE EXCEPTION 'Reopen before content edits' USING ERRCODE='23514'; END IF;
  PERFORM taskpulse_private.assert_task_open_date(p_task,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
  IF p_command='save' THEN
   FOR item IN SELECT * FROM jsonb_each(p_payload) LOOP
    IF NOT EXISTS(SELECT 1 FROM public.task_detail_fields WHERE key_name=item.key) OR jsonb_typeof(item.value) NOT IN ('string','null') THEN RAISE EXCEPTION 'Use canonical typed content fields' USING ERRCODE='23514'; END IF;
    INSERT INTO public.task_detail_sections(task_id,key_name,title,content,updated_by) SELECT p_task,key_name,title,p_payload->>item.key,auth.uid() FROM public.task_detail_fields WHERE key_name=item.key
     ON CONFLICT(task_id,key_name) DO UPDATE SET content=excluded.content,updated_by=auth.uid();
    IF item.key='description' THEN UPDATE public.tasks SET description=p_payload->>item.key WHERE id=p_task; END IF;
   END LOOP;
  ELSIF p_command='relation' THEN
   IF p_payload-ARRAY['other_task_id','relation_type','notes']<>'{}' OR (p_payload->>'other_task_id')::uuid=p_task OR p_payload->>'relation_type' IS NULL OR p_payload->>'relation_type' NOT IN ('Dependency','Carryover','Related') THEN RAISE EXCEPTION 'Select another task and a supported relation' USING ERRCODE='23514'; END IF;
   INSERT INTO public.task_dependencies(predecessor_task_id,successor_task_id,relation_type,notes,created_by) VALUES((p_payload->>'other_task_id')::uuid,p_task,(p_payload->>'relation_type')::public.task_relation_type,p_payload->>'notes',auth.uid())
    ON CONFLICT(predecessor_task_id,successor_task_id,relation_type) DO UPDATE SET notes=excluded.notes;
  ELSIF p_command='rename_link' THEN
   IF p_payload-ARRAY['id','label']<>'{}' OR nullif(btrim(p_payload->>'label'),'') IS NULL OR length(p_payload->>'label')>120 THEN RAISE EXCEPTION 'Valid link label required' USING ERRCODE='23514'; END IF;
   UPDATE public.task_links SET label=p_payload->>'label' WHERE id=(p_payload->>'id')::uuid AND task_id=p_task RETURNING public.task_links.id INTO link_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Select an existing task link' USING ERRCODE='23514'; END IF;
  ELSE
   IF p_payload-ARRAY['ipo_role','link_type','label','url','notes','employee_id','report_id']<>'{}' OR
    p_payload->>'ipo_role' IS NULL OR p_payload->>'ipo_role' NOT IN ('input','process','output','reference') OR nullif(btrim(p_payload->>'label'),'') IS NULL OR length(p_payload->>'label')>120 THEN RAISE EXCEPTION 'Explicit IPO role and label required' USING ERRCODE='23514'; END IF;
   IF (CASE WHEN nullif(p_payload->>'url','') IS NOT NULL THEN 1 ELSE 0 END)+(CASE WHEN p_payload->>'employee_id' IS NOT NULL THEN 1 ELSE 0 END)+(CASE WHEN p_payload->>'report_id' IS NOT NULL THEN 1 ELSE 0 END)<>1 THEN RAISE EXCEPTION 'Choose one asset URL or related record' USING ERRCODE='23514'; END IF;
   path:=p_payload->>'url';
   IF p_payload->>'employee_id' IS NOT NULL THEN SELECT '/team/'||employee_id INTO path FROM public.users WHERE id=(p_payload->>'employee_id')::uuid;
   ELSIF p_payload->>'report_id' IS NOT NULL THEN
    SELECT employee_id INTO report_employee FROM public.report_snapshots WHERE id=(p_payload->>'report_id')::uuid;
    IF NOT FOUND OR NOT public.can_read_employee_details(report_employee) THEN RAISE EXCEPTION 'Visible report required' USING ERRCODE='42501'; END IF;
    path:='/reports#report-'||(p_payload->>'report_id');
   ELSIF path IS NULL OR path!~'^https?://' THEN RAISE EXCEPTION 'HTTP(S) asset URL required' USING ERRCODE='23514'; END IF;
   INSERT INTO public.task_links(task_id,ipo_role,link_type,label,url,notes,created_by,related_employee_id,related_report_id)
    VALUES(p_task,p_payload->>'ipo_role',(p_payload->>'link_type')::public.task_link_type,p_payload->>'label',path,p_payload->>'notes',auth.uid(),(p_payload->>'employee_id')::uuid,(p_payload->>'report_id')::uuid) RETURNING public.task_links.id INTO link_id;
  END IF;
  -- Link/relationship edits also invalidate previous reviews.
  IF p_command IN ('link','relation','rename_link') THEN UPDATE public.tasks SET work_revision=work_revision+1,lifecycle_version=lifecycle_version+1 WHERE public.tasks.id=p_task;
   UPDATE public.task_reviewers SET review_approved=false,reviewed_at=NULL,reviewed_revision=NULL WHERE task_id=p_task; END IF;
  result:=jsonb_build_object('taskId',p_task,'id',link_id,'nativeState',CASE WHEN EXISTS(SELECT 1 FROM public.task_detail_instances WHERE task_id=p_task) THEN 'ready' ELSE 'not_initialized' END,'providerState','not_requested');
  INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id) VALUES(auth.uid(),role::text,'detail_'||p_command,'tasks',p_task,ARRAY['task_content'],jsonb_build_object('fields',ARRAY(SELECT jsonb_object_keys(p_payload))),p_operation);
  INSERT INTO taskpulse_private.outbox_jobs(kind,entity_id,entity_version,operation_id,payload) SELECT 'task_details_invalidated',p_task,lifecycle_version,p_operation,jsonb_build_object('provider_requested',false) FROM public.tasks WHERE public.tasks.id=p_task;
 END IF;
 result:=result||jsonb_build_object('version',(SELECT lifecycle_version FROM public.tasks WHERE public.tasks.id=p_task));
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload) VALUES(auth.uid(),'detail_'||p_command,p_operation,request,p_task,result);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.save_task_with_participants(p_task_id uuid,p_fields jsonb,p_assignees uuid[],p_reviewers uuid[],
 p_share_units integer[],p_expected_version bigint,p_accept_legacy boolean,p_operation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_role public.user_role; tid uuid; t public.tasks; receipt taskpulse_private.command_receipts; request jsonb; changed boolean; BEGIN
 SELECT role INTO actor_role FROM public.users WHERE id=auth.uid() AND is_active FOR SHARE;
 IF actor_role IS NULL OR public.get_user_role() NOT IN ('managing_director','project_engineer') THEN
   RAISE EXCEPTION 'Active task manager required' USING ERRCODE='42501'; END IF;
 IF p_operation_id IS NULL OR p_fields IS NULL OR jsonb_typeof(p_fields)<>'object' OR
   p_fields-ARRAY['task_tag','title','category','priority','due_date','task_scale','expected_lifecycle_version','description','comments','template_version_id','initialize_details']<>'{}'::jsonb THEN
   RAISE EXCEPTION 'Invalid task command' USING ERRCODE='23514'; END IF;
 IF p_fields?'initialize_details' AND jsonb_typeof(p_fields->'initialize_details') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Initialization choice must be boolean' USING ERRCODE='23514'; END IF;
 IF p_fields->>'due_date' IS NOT NULL AND p_fields->>'due_date'!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Deadline requires an ISO calendar date or null' USING ERRCODE='23514'; END IF;
 IF nullif(btrim(p_fields->>'task_tag'),'') IS NULL OR nullif(btrim(p_fields->>'title'),'') IS NULL OR
  ((p_fields->>'task_scale') IS NOT NULL AND NOT((p_fields->>'task_scale')::numeric>=0 AND (p_fields->>'task_scale')::numeric<'Infinity'::numeric)) THEN
  RAISE EXCEPTION 'Nonblank identity/title and finite nonnegative scale required' USING ERRCODE='23514'; END IF;
 request:=jsonb_build_array(p_task_id,p_fields,p_assignees,p_reviewers,p_share_units,p_expected_version,p_accept_legacy);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || p_operation_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=auth.uid() AND operation_id=p_operation_id AND command='save_task_with_participants';
 IF FOUND THEN
   IF receipt.request<>request THEN RAISE EXCEPTION 'Operation key reused with different input' USING ERRCODE='23514'; END IF;
   RETURN receipt.result;
 END IF;
 IF p_task_id IS NULL THEN
   INSERT INTO public.tasks(task_tag,title,category,priority,due_date,task_scale,assignee_id,reviewer_id,valid_for_metrics,description,comments,assigned_date)
   VALUES(p_fields->>'task_tag',p_fields->>'title',(p_fields->>'category')::public.task_category,
    (p_fields->>'priority')::public.task_priority,(p_fields->>'due_date')::date,(p_fields->>'task_scale')::numeric,
    p_assignees[1],p_reviewers[1],coalesce((p_fields->>'task_scale')::numeric>0 AND p_fields->>'category'<>'OT',false),p_fields->>'description',p_fields->>'comments',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date) RETURNING id INTO tid;
   PERFORM public.set_task_participants(tid,p_assignees,p_reviewers,p_share_units,0,true);
 ELSE
   SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task_id FOR UPDATE;
   IF p_expected_version IS NULL OR t.participant_version<>p_expected_version THEN
     RAISE EXCEPTION 'Participants changed; reload before saving' USING ERRCODE='40001'; END IF;
   IF (p_fields->>'expected_lifecycle_version')::bigint IS DISTINCT FROM t.lifecycle_version THEN
    RAISE EXCEPTION 'Task changed; reload before structural save' USING ERRCODE='40001'; END IF;
   IF p_fields->>'task_tag' IS DISTINCT FROM t.task_tag THEN RAISE EXCEPTION 'Stable tag edits require an alias policy' USING ERRCODE='23514'; END IF;
   IF p_fields?'task_scale' AND (p_fields->>'task_scale')::numeric IS DISTINCT FROM t.task_scale THEN RAISE EXCEPTION 'Use the versioned scale command for a scale change' USING ERRCODE='23514'; END IF;
   IF t.status IN ('Done','Discarded') THEN RAISE EXCEPTION 'Reopen before structural edits' USING ERRCODE='23514'; END IF;
   PERFORM taskpulse_private.assert_task_open_date(p_task_id,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
   tid:=p_task_id;
   -- Unchanged legacy participants retain unresolved historical attribution.
   changed := p_share_units IS NOT NULL OR (t.participant_credit_mode='legacy' AND p_accept_legacy) OR
     t.assignee_id IS DISTINCT FROM p_assignees[1] OR t.reviewer_id IS DISTINCT FROM p_reviewers[1] OR
     (SELECT array_agg(x ORDER BY x) FROM unnest(p_assignees) x) IS DISTINCT FROM
       (SELECT array_agg(x ORDER BY x) FROM (SELECT user_id x FROM public.task_assignees WHERE task_id=tid UNION SELECT t.assignee_id) s) OR
     coalesce((SELECT array_agg(x ORDER BY x) FROM unnest(p_reviewers) x),ARRAY[]::uuid[]) IS DISTINCT FROM
       coalesce((SELECT array_agg(x ORDER BY x) FROM (SELECT user_id x FROM public.task_reviewers WHERE task_id=tid UNION SELECT t.reviewer_id WHERE t.reviewer_id IS NOT NULL) s),ARRAY[]::uuid[]);
   IF changed THEN
     -- Editing reviewers/primary order does not silently reset custom shares.
     IF p_share_units IS NULL AND t.participant_credit_mode='configured' AND
       (SELECT array_agg(x ORDER BY x) FROM unnest(p_assignees) x) =
       (SELECT array_agg(user_id ORDER BY user_id) FROM public.task_assignees WHERE task_id=tid) THEN
       SELECT array_agg(a.share_units ORDER BY p.ordinality) INTO p_share_units FROM unnest(p_assignees) WITH ORDINALITY p(uid,ordinality)
         JOIN public.task_assignees a ON a.task_id=tid AND a.user_id=p.uid;
     END IF;
     PERFORM public.set_task_participants(tid,p_assignees,p_reviewers,p_share_units,p_expected_version,p_accept_legacy);
   END IF;
   UPDATE public.tasks SET description=CASE WHEN p_fields?'description' THEN p_fields->>'description' ELSE description END,comments=CASE WHEN p_fields?'comments' THEN p_fields->>'comments' ELSE comments END,task_tag=p_fields->>'task_tag',title=p_fields->>'title',category=(p_fields->>'category')::public.task_category,
    priority=(p_fields->>'priority')::public.task_priority,due_date=(p_fields->>'due_date')::date,task_scale=CASE WHEN p_fields?'task_scale' THEN (p_fields->>'task_scale')::numeric ELSE task_scale END WHERE id=tid;
 END IF;
 UPDATE public.tasks SET lifecycle_version=lifecycle_version+1 WHERE id=tid;
 PERFORM taskpulse_private.refresh_task_metrics(tid,p_operation_id,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(auth.uid(),actor_role::text,'save_task_with_participants','tasks',tid,ARRAY['structure','participants'],
  jsonb_build_object('before',jsonb_build_object('priority',t.priority,'scale',t.task_scale,'participant_version',t.participant_version),
  'after',(SELECT jsonb_build_object('priority',priority,'scale',task_scale,'participant_version',participant_version,'lifecycle_version',lifecycle_version) FROM public.tasks WHERE id=tid)),p_operation_id);
 INSERT INTO taskpulse_private.command_receipts(actor_id,operation_id,request,result) VALUES(auth.uid(),p_operation_id,request,tid);
 UPDATE public.tasks SET scale_inputs=jsonb_build_object('value',task_scale) WHERE id=tid AND scale_mode='manual';
 IF p_fields?'template_version_id' THEN
  IF EXISTS(SELECT 1 FROM public.task_detail_instances WHERE task_id=tid AND template_version_id IS DISTINCT FROM (p_fields->>'template_version_id')::uuid) THEN RAISE EXCEPTION 'Initialized template instances are independent; do not replace their template' USING ERRCODE='23514'; END IF;
  UPDATE public.tasks SET detail_template_preference=(p_fields->>'template_version_id')::uuid WHERE id=tid;
 END IF;
 IF p_fields?'description' THEN
  INSERT INTO public.task_detail_sections(task_id,key_name,title,content,updated_by) VALUES(tid,'description','Description',p_fields->>'description',auth.uid())
   ON CONFLICT(task_id,key_name) DO UPDATE SET content=excluded.content,updated_by=auth.uid();
 END IF;
 IF p_fields->>'initialize_details' IS NULL OR (p_fields->>'initialize_details')::boolean THEN
  PERFORM taskpulse_private.initialize_native_details(tid,(p_fields->>'template_version_id')::uuid,p_operation_id);
 END IF;
 RETURN tid;
END $$;

-- Native template versions and instruction snapshots are append-only commands.
CREATE FUNCTION taskpulse_private.immutable_template_version() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Publish a new template version; existing versions are immutable' USING ERRCODE='42501'; END $$;
CREATE TRIGGER m04_immutable_template BEFORE UPDATE OR DELETE ON public.task_detail_template_versions FOR EACH ROW EXECUTE FUNCTION taskpulse_private.immutable_template_version();
DO $$ DECLARE tbl text; col record; BEGIN
 FOREACH tbl IN ARRAY ARRAY['task_detail_fields','task_detail_templates','task_detail_template_versions','task_detail_instances','task_detail_review_flags'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',tbl);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tbl);
  EXECUTE format('CREATE POLICY m04_read ON public.%I FOR SELECT TO authenticated USING(public.get_user_role() IS NOT NULL)',tbl);
 END LOOP;
 FOREACH tbl IN ARRAY ARRAY['task_detail_sections','task_links','task_dependencies'] LOOP
  EXECUTE format('REVOKE INSERT,UPDATE,DELETE ON public.%I FROM PUBLIC,anon,authenticated,service_role',tbl);
  FOR col IN SELECT attname FROM pg_attribute WHERE attrelid=format('public.%I',tbl)::regclass AND attnum>0 AND NOT attisdropped LOOP
   EXECUTE format('REVOKE INSERT(%I),UPDATE(%I) ON public.%I FROM PUBLIC,anon,authenticated,service_role',col.attname,col.attname,tbl);
  END LOOP;
 END LOOP;
END $$;
DROP POLICY m01_read ON public.task_links;
CREATE POLICY m04_links_read ON public.task_links FOR SELECT TO authenticated USING(public.get_user_role() IS NOT NULL AND
 (related_report_id IS NULL OR EXISTS(SELECT 1 FROM public.report_snapshots r WHERE r.id=related_report_id AND public.can_read_employee_details(r.employee_id))));
REVOKE ALL ON FUNCTION public.publish_task_detail_template(uuid,text,jsonb,integer,uuid),public.task_details_command(uuid,text,jsonb,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.publish_task_detail_template(uuid,text,jsonb,integer,uuid),public.task_details_command(uuid,text,jsonb,bigint,uuid) TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
