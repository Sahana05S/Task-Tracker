-- M05: explicit applicability, section evidence and atomic DAG propagation.
BEGIN;
ALTER TABLE public.checklist_nodes ADD COLUMN completion_state text NOT NULL DEFAULT 'No' CHECK(completion_state IN ('Yes','No','N/A'));
DROP TRIGGER m02_credit_progress ON public.tasks;
DROP TRIGGER m02_manual_metrics ON public.tasks;
ALTER TABLE public.tasks DROP COLUMN scaled_progress;
ALTER TABLE public.tasks ALTER COLUMN progress_percentage TYPE numeric;
ALTER TABLE public.tasks ADD COLUMN scaled_progress numeric GENERATED ALWAYS AS(task_scale*progress_percentage/100) STORED;
-- Atomic commands explicitly refresh metrics; retire the recursive legacy trigger.
CREATE TRIGGER m02_credit_progress AFTER UPDATE OF progress_percentage ON public.tasks FOR EACH ROW WHEN(NEW.progress_percentage IS DISTINCT FROM OLD.progress_percentage) EXECUTE FUNCTION taskpulse_private.credit_progress_change();
ALTER TABLE public.task_checklists ADD COLUMN credit_anchor numeric;
ALTER TABLE public.tasks ADD COLUMN progress_owner text NOT NULL DEFAULT 'manual' CHECK(progress_owner IN ('manual','checklist'));
CREATE TABLE public.checklist_sections (
 checklist_id uuid NOT NULL REFERENCES public.task_checklists(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('setup','activity','closure')),
 initialized boolean NOT NULL DEFAULT false, intentional_empty boolean NOT NULL DEFAULT false,
 reason text, PRIMARY KEY(checklist_id,role), CHECK(NOT intentional_empty OR initialized));
ALTER TABLE public.checklist_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY m05_section_read ON public.checklist_sections FOR SELECT TO authenticated USING(public.get_user_role() IS NOT NULL);
REVOKE ALL ON public.checklist_sections FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.checklist_sections TO authenticated;
-- Retain link identity if a source task is being deleted.
DO $$ DECLARE k record; BEGIN FOR k IN SELECT conname FROM pg_constraint WHERE conrelid='public.checklist_nodes'::regclass AND confrelid='public.tasks'::regclass LOOP EXECUTE format('ALTER TABLE public.checklist_nodes DROP CONSTRAINT %I',k.conname); END LOOP; END $$;
ALTER TABLE public.checklist_nodes ADD CONSTRAINT m05_linked_task_fk FOREIGN KEY(linked_task_id) REFERENCES public.tasks(id) ON DELETE RESTRICT;
-- No title guessing, ownership switch, earned credit or snapshot backfill.
ALTER TABLE public.checklist_nodes DISABLE TRIGGER m03_invalidate_checklist_review;
ALTER TABLE public.task_checklists DISABLE TRIGGER m03_invalidate_structure_review;
UPDATE public.checklist_nodes SET completion_state=CASE WHEN is_complete THEN 'Yes' ELSE 'No' END;
INSERT INTO public.checklist_sections(checklist_id,role,initialized)
 SELECT c.id,r,EXISTS(SELECT 1 FROM public.checklist_nodes n WHERE n.checklist_id=c.id AND n.detail_section=r AND (n.node_type IN ('Item','Task') OR n.parent_node_id IS NOT NULL))
 FROM public.task_checklists c CROSS JOIN unnest(ARRAY['setup','activity','closure']) r;
UPDATE public.task_checklists c SET credit_anchor=t.progress_percentage FROM public.tasks t WHERE t.id=c.task_id;
ALTER TABLE public.checklist_nodes ENABLE TRIGGER m03_invalidate_checklist_review;
ALTER TABLE public.task_checklists ENABLE TRIGGER m03_invalidate_structure_review;
UPDATE public.tasks t SET progress_owner='checklist' FROM public.task_checklists c WHERE c.task_id=t.id AND c.sync_progress_to_task;
CREATE TABLE taskpulse_private.checklist_credit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE RESTRICT,
 operation_id uuid NOT NULL, effective_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 progress_before numeric, progress_after numeric, scale numeric, scale_version bigint, participant_version bigint,
 shares jsonb, scaled_credit numeric NOT NULL, event_kind text NOT NULL, reason text);
CREATE TABLE taskpulse_private.checklist_projections (task_id uuid PRIMARY KEY REFERENCES public.tasks(id) ON DELETE CASCADE, result jsonb NOT NULL);
CREATE FUNCTION taskpulse_private.create_checklist_sections() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 INSERT INTO public.checklist_sections(checklist_id,role) SELECT NEW.id,unnest(ARRAY['setup','activity','closure']); RETURN NEW;
END $$;
CREATE TRIGGER m05_new_sections AFTER INSERT ON public.task_checklists FOR EACH ROW EXECUTE FUNCTION taskpulse_private.create_checklist_sections();
CREATE FUNCTION taskpulse_private.mirror_progress_owner() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 UPDATE public.tasks SET progress_owner=CASE WHEN NEW.sync_progress_to_task THEN 'checklist' ELSE 'manual' END WHERE id=NEW.task_id; RETURN NEW;
END $$;
CREATE TRIGGER m05_owner AFTER INSERT OR UPDATE OF sync_progress_to_task ON public.task_checklists FOR EACH ROW EXECUTE FUNCTION taskpulse_private.mirror_progress_owner();
CREATE FUNCTION taskpulse_private.checklist_edges() RETURNS TABLE(owner_id uuid,source_id uuid) LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT c.task_id,n.linked_task_id FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE n.linked_task_id IS NOT NULL
 UNION SELECT id,(scale_inputs->>'source_task_id')::uuid FROM public.tasks WHERE scale_mode='linked';
$$;
CREATE FUNCTION taskpulse_private.assert_checklist_graph(p_task uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF EXISTS(WITH RECURSIVE edges AS (
  SELECT * FROM taskpulse_private.checklist_edges()
  UNION SELECT successor_task_id,predecessor_task_id FROM public.task_dependencies WHERE relation_type IN ('Dependency','Blocks')
  UNION SELECT predecessor_task_id,successor_task_id FROM public.task_dependencies WHERE relation_type='Subtask'),
 chain(id,path,cycle) AS (SELECT p_task,ARRAY[p_task],false UNION ALL SELECT e.source_id,c.path||e.source_id,e.source_id=ANY(c.path) FROM chain c JOIN edges e ON e.owner_id=c.id WHERE NOT c.cycle)
 SELECT 1 FROM chain WHERE cycle) THEN RAISE EXCEPTION 'Task/checklist dependency cycle; remove the conflicting link' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION taskpulse_private.checklist_graph_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ DECLARE owner_id uuid; parent public.checklist_nodes; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 IF TG_TABLE_NAME='checklist_nodes' THEN
  SELECT task_id INTO owner_id FROM public.task_checklists WHERE id=NEW.checklist_id;
  IF NEW.parent_node_id IS NOT NULL THEN
   SELECT * INTO parent FROM public.checklist_nodes WHERE id=NEW.parent_node_id;
   IF NOT FOUND OR parent.checklist_id<>NEW.checklist_id OR parent.id=NEW.id OR parent.detail_section IS DISTINCT FROM NEW.detail_section THEN RAISE EXCEPTION 'Parent must be in the same checklist and section' USING ERRCODE='23514'; END IF;
   IF parent.linked_task_id IS NOT NULL OR parent.node_type NOT IN ('Group','Page') THEN RAISE EXCEPTION 'Choose an ordinary group or page as parent' USING ERRCODE='23514'; END IF;
  END IF;
  IF EXISTS(WITH RECURSIVE ancestors(id,path,cycle) AS (SELECT NEW.id,ARRAY[NEW.id],false UNION ALL SELECT n.parent_node_id,a.path||n.parent_node_id,n.parent_node_id=ANY(a.path) FROM ancestors a JOIN public.checklist_nodes n ON n.id=a.id WHERE n.parent_node_id IS NOT NULL AND NOT a.cycle) SELECT 1 FROM ancestors WHERE cycle) THEN RAISE EXCEPTION 'Checklist ancestor cycle' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.checklist_nodes WHERE parent_node_id=NEW.id AND (checklist_id<>NEW.checklist_id OR detail_section IS DISTINCT FROM NEW.detail_section)) THEN RAISE EXCEPTION 'Move or explicitly map the entire subtree to one section' USING ERRCODE='23514'; END IF;
  IF NEW.linked_task_id IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=NEW.linked_task_id) OR EXISTS(SELECT 1 FROM public.checklist_nodes WHERE parent_node_id=NEW.id)) THEN RAISE EXCEPTION 'Linked task must exist and be a leaf' USING ERRCODE='23514'; END IF;
  IF NEW.node_type='Task' AND NEW.linked_task_id IS NULL THEN RAISE EXCEPTION 'Select a real linked task' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='tasks' THEN owner_id:=NEW.id;
 ELSE owner_id:=CASE WHEN NEW.relation_type='Subtask' THEN NEW.predecessor_task_id ELSE NEW.successor_task_id END;
 END IF;
 PERFORM taskpulse_private.assert_checklist_graph(owner_id); RETURN NEW;
END $$;
CREATE TRIGGER m05_node_graph AFTER INSERT OR UPDATE OF parent_node_id,checklist_id,detail_section,linked_task_id,node_type ON public.checklist_nodes FOR EACH ROW EXECUTE FUNCTION taskpulse_private.checklist_graph_guard();
CREATE TRIGGER m05_scale_graph AFTER INSERT OR UPDATE OF scale_mode,scale_inputs ON public.tasks FOR EACH ROW EXECUTE FUNCTION taskpulse_private.checklist_graph_guard();
CREATE TRIGGER m05_relation_graph AFTER INSERT OR UPDATE ON public.task_dependencies FOR EACH ROW EXECUTE FUNCTION taskpulse_private.checklist_graph_guard();
CREATE FUNCTION taskpulse_private.checklist_node_result(p_node uuid,p_path uuid[] DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE n public.checklist_nodes; child record; r jsonb; errors jsonb:='[]'; total numeric:=0; cnt integer:=0; complete boolean:=true; unavailable boolean:=false; t public.tasks; BEGIN
 IF p_node=ANY(p_path) THEN RETURN jsonb_build_object('id',p_node,'progressPercentage',NULL,'isComplete',false,'applicable',true,'errors',jsonb_build_array('cycle:'||p_node)); END IF;
 SELECT * INTO n FROM public.checklist_nodes WHERE id=p_node;
 IF NOT FOUND THEN RETURN jsonb_build_object('id',p_node,'progressPercentage',NULL,'isComplete',false,'applicable',true,'errors',jsonb_build_array('missing_node:'||p_node)); END IF;
 FOR child IN SELECT id FROM public.checklist_nodes WHERE parent_node_id=p_node ORDER BY id LOOP
  r:=taskpulse_private.checklist_node_result(child.id,p_path||p_node); errors:=errors||(r->'errors');
  IF (r->>'applicable')::boolean THEN cnt:=cnt+1; total:=total+coalesce((r->>'progressPercentage')::numeric,0); unavailable:=unavailable OR r->>'progressPercentage' IS NULL; complete:=complete AND (r->>'isComplete')::boolean; END IF;
 END LOOP;
 IF n.completion_state='N/A' AND ((n.node_type='Task' AND n.linked_task_id IS NULL) OR (n.linked_task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=n.linked_task_id))) THEN errors:=errors||jsonb_build_array('linked_unavailable:'||n.id); END IF;
 IF n.completion_state='N/A' THEN RETURN jsonb_build_object('id',n.id,'progressPercentage',NULL,'isComplete',true,'applicable',false,'errors',errors); END IF;
 IF EXISTS(SELECT 1 FROM public.checklist_nodes WHERE parent_node_id=n.id) THEN
  IF n.linked_task_id IS NOT NULL THEN errors:=errors||jsonb_build_array('linked_parent:'||n.id); END IF;
  RETURN jsonb_build_object('id',n.id,'progressPercentage',CASE WHEN cnt=0 OR unavailable THEN NULL ELSE total/cnt END,'isComplete',complete,'applicable',cnt>0,'errors',errors);
 END IF;
 IF n.linked_task_id IS NOT NULL OR n.node_type='Task' THEN
  SELECT * INTO t FROM public.tasks WHERE id=n.linked_task_id;
  IF NOT FOUND OR t.progress_percentage IS NULL OR NOT(t.progress_percentage BETWEEN 0 AND 100) THEN errors:=errors||jsonb_build_array('linked_unavailable:'||n.id);
  ELSIF t.status='Done' AND t.progress_percentage<>100 THEN errors:=errors||jsonb_build_array('linked_done_mismatch:'||n.id); END IF;
  RETURN jsonb_build_object('id',n.id,'progressPercentage',t.progress_percentage,'isComplete',coalesce(t.status='Done' AND t.progress_percentage=100,false),'applicable',true,'errors',errors);
 END IF;
 IF n.node_type IN ('Page','Group') THEN
  IF n.parent_node_id IS NOT NULL THEN errors:=errors||jsonb_build_array('empty_group:'||n.id); END IF;
  RETURN jsonb_build_object('id',n.id,'progressPercentage',NULL,'isComplete',true,'applicable',false,'errors',errors);
 END IF;
 RETURN jsonb_build_object('id',n.id,'progressPercentage',CASE WHEN n.completion_state='Yes' THEN 100 ELSE 0 END,'isComplete',n.completion_state='Yes','applicable',true,'errors',errors);
END $$;
CREATE FUNCTION taskpulse_private.checklist_rollup(p_task uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE cid uuid; section_role text; init public.checklist_sections; node record; r jsonb; sections jsonb:='{}'; values jsonb:='[]'; errors jsonb:='[]'; total numeric; cnt integer; complete boolean; unavailable boolean; state text; allcomplete boolean:=true; taskprogress numeric; emptyallowed boolean; BEGIN
 SELECT id INTO cid FROM public.task_checklists WHERE task_id=p_task;
 FOR node IN SELECT n.* FROM public.checklist_nodes n WHERE checklist_id=cid ORDER BY id LOOP
  IF node.detail_section IS NULL THEN errors:=errors||jsonb_build_array('unsectioned:'||node.id); END IF;
  IF node.parent_node_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.checklist_nodes p WHERE p.id=node.parent_node_id AND p.checklist_id=cid AND p.detail_section IS NOT DISTINCT FROM node.detail_section) THEN errors:=errors||jsonb_build_array('missing_or_cross_parent:'||node.id); END IF;
  r:=taskpulse_private.checklist_node_result(node.id); errors:=errors||(r->'errors'); values:=values||(r-'errors');
 END LOOP;
 FOREACH section_role IN ARRAY ARRAY['setup','activity','closure'] LOOP
  SELECT * INTO init FROM public.checklist_sections s WHERE s.checklist_id=cid AND s.role=section_role;
  state:=CASE WHEN NOT FOUND THEN 'missing' WHEN NOT init.initialized THEN 'uninitialized' ELSE NULL END;
  total:=0;cnt:=0;complete:=true;unavailable:=false;
  FOR node IN SELECT id FROM public.checklist_nodes WHERE checklist_id=cid AND detail_section=section_role AND parent_node_id IS NULL ORDER BY id LOOP
   r:=taskpulse_private.checklist_node_result(node.id);
   IF (r->>'applicable')::boolean THEN cnt:=cnt+1;total:=total+coalesce((r->>'progressPercentage')::numeric,0);unavailable:=unavailable OR r->>'progressPercentage' IS NULL;complete:=complete AND (r->>'isComplete')::boolean; END IF;
  END LOOP;
  emptyallowed:=coalesce(init.intentional_empty,false) OR EXISTS(SELECT 1 FROM public.checklist_nodes WHERE checklist_id=cid AND detail_section=section_role AND completion_state='N/A');
  IF init.initialized AND cnt=0 AND NOT emptyallowed THEN errors:=errors||jsonb_build_array('empty_unconfirmed:'||section_role); END IF;
  complete:=coalesce(init.initialized,false) AND complete AND (cnt>0 OR emptyallowed);
  state:=coalesce(state,CASE WHEN cnt=0 THEN 'not_applicable' WHEN complete THEN 'complete' ELSE 'partial' END);
  r:=jsonb_build_object('state',state,'progressPercentage',CASE WHEN cnt=0 OR unavailable OR state IN ('missing','uninitialized') THEN NULL ELSE total/cnt END,'isComplete',complete,'applicable',cnt>0);
  sections:=sections||jsonb_build_object(section_role,r); allcomplete:=allcomplete AND complete;
 END LOOP;
 IF jsonb_array_length(errors)>0 THEN
  FOREACH section_role IN ARRAY ARRAY['setup','activity','closure'] LOOP sections:=jsonb_set(sections,ARRAY[section_role],(sections->section_role)||jsonb_build_object('state','invalid','progressPercentage',NULL,'isComplete',false)); END LOOP;
  allcomplete:=false;
 END IF;
 taskprogress:=(sections->'activity'->>'progressPercentage')::numeric;
 RETURN jsonb_build_object('contract','m05-checklist-v1','sections',sections,'taskProgress',taskprogress,'taskProgressDecimal',taskprogress::text,'overallProgressPercentage',taskprogress,'isComplete',allcomplete,'errors',errors,'nodeProgress',values);
END $$;
CREATE FUNCTION public.checklist_rollups(p_task_ids uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE result jsonb; BEGIN
 IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated read required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_object_agg(t.id::text,taskpulse_private.checklist_rollup(t.id)),'{}') INTO result FROM public.tasks t WHERE t.id=ANY(p_task_ids); RETURN result;
END $$;

CREATE OR REPLACE FUNCTION taskpulse_private.assert_progress_owner(p_task uuid,p_delta numeric) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF p_delta<>0 AND EXISTS(SELECT 1 FROM public.tasks WHERE id=p_task AND participant_credit_mode='legacy') THEN RAISE EXCEPTION 'Legacy progress credit needs participant reconciliation; log hours with zero progress' USING ERRCODE='23514'; END IF;
 IF p_delta<>0 AND EXISTS(SELECT 1 FROM public.task_checklists WHERE task_id=p_task AND sync_progress_to_task) THEN RAISE EXCEPTION 'This task owns Activity-derived progress; record hours with zero progress' USING ERRCODE='23514'; END IF;
 -- Being read by another task's checklist does not transfer this task's ownership.
END $$;
CREATE OR REPLACE FUNCTION taskpulse_private.credit_progress_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE shares jsonb; delta numeric; BEGIN
 IF EXISTS(SELECT 1 FROM public.task_checklists WHERE task_id=NEW.id AND sync_progress_to_task) THEN RETURN NEW; END IF;
 delta:=(coalesce(NEW.progress_percentage,0)-coalesce(OLD.progress_percentage,0))*coalesce(NEW.task_scale,0)/100;
 SELECT v.shares INTO shares FROM taskpulse_private.participant_versions v WHERE v.task_id=NEW.id AND v.version=NEW.participant_version;
 PERFORM taskpulse_private.apply_credit(NEW.id,delta,shares,NEW.assignee_id); RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION taskpulse_private.refresh_task_metrics(p_task uuid,p_operation uuid,p_date date) RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE tid uuid; t public.tasks; c public.task_checklists; amount numeric; total_hours numeric; v bigint; root_version bigint; rollup jsonb; prior jsonb; fingerprint jsonb; shares jsonb; delta numeric; progress numeric; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 PERFORM taskpulse_private.assert_checklist_graph(p_task);
 -- Longest distance, rather than first traversal, orders diamonds child-first.
 FOR tid IN WITH RECURSIVE ancestors(id,path,cycle) AS (
  SELECT p_task,ARRAY[p_task],false UNION ALL SELECT e.owner_id,a.path||e.owner_id,e.owner_id=ANY(a.path) FROM ancestors a JOIN taskpulse_private.checklist_edges() e ON e.source_id=a.id WHERE NOT a.cycle),
 ordered AS (SELECT id,max(cardinality(path)) depth,bool_or(cycle) cycle FROM ancestors GROUP BY id)
 SELECT id FROM ordered ORDER BY depth,id LOOP
  PERFORM taskpulse_private.assert_checklist_graph(tid);
  SELECT * INTO STRICT t FROM public.tasks WHERE id=tid FOR UPDATE;
  IF tid<>p_task AND t.status IN ('Done','Discarded') THEN RAISE EXCEPTION 'A linked parent is closed; a manager must reopen it before changing its reviewed source' USING ERRCODE='23514'; END IF;
  PERFORM taskpulse_private.assert_task_open_date(tid,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
  IF t.scale_mode<>'manual' AND t.status NOT IN ('Done','Discarded') THEN
   amount:=taskpulse_private.derive_scale(tid);
   IF amount IS DISTINCT FROM t.task_scale THEN UPDATE public.tasks SET task_scale=amount,scale_version=scale_version+1,scale_effective_at=clock_timestamp() WHERE id=tid; END IF;
  END IF;
  SELECT * INTO STRICT t FROM public.tasks WHERE id=tid;
  SELECT * INTO c FROM public.task_checklists WHERE task_id=tid FOR UPDATE;
  IF FOUND THEN
   rollup:=taskpulse_private.checklist_rollup(tid);
   fingerprint:=rollup||jsonb_build_object('sources',(SELECT coalesce(jsonb_agg(jsonb_build_array(n.id,n.completion_state,n.parent_node_id,n.detail_section,n.title,n.linked_task_id,src.work_revision,src.status) ORDER BY n.id),'[]') FROM public.checklist_nodes n LEFT JOIN public.tasks src ON src.id=n.linked_task_id WHERE n.checklist_id=c.id));
   SELECT result INTO prior FROM taskpulse_private.checklist_projections WHERE task_id=tid;
   IF prior IS DISTINCT FROM fingerprint THEN
    UPDATE public.tasks SET work_revision=work_revision+1,lifecycle_version=lifecycle_version+1 WHERE id=tid;
    UPDATE public.task_reviewers SET review_approved=false,reviewed_at=NULL,reviewed_revision=NULL WHERE task_id=tid;
    INSERT INTO taskpulse_private.checklist_projections VALUES(tid,fingerprint) ON CONFLICT(task_id) DO UPDATE SET result=excluded.result;
   END IF;
   IF c.sync_progress_to_task AND t.status NOT IN ('Done','Discarded') THEN
    progress:=(rollup->>'taskProgress')::numeric;
    IF progress IS DISTINCT FROM t.progress_percentage THEN
     delta:=CASE WHEN progress IS NULL THEN 0 WHEN progress=c.credit_anchor THEN 0 WHEN c.credit_anchor IS NULL THEN NULL ELSE (progress-c.credit_anchor)*t.task_scale/100 END;
     IF progress IS NOT NULL AND (delta IS NULL OR (delta<>0 AND t.participant_credit_mode='legacy')) THEN RAISE EXCEPTION 'Checklist credit needs a measured baseline, scale and approved participant shares; reconcile before saving' USING ERRCODE='23514'; END IF;
     SELECT pv.shares INTO shares FROM taskpulse_private.participant_versions pv WHERE pv.task_id=tid AND pv.version=t.participant_version;
     PERFORM taskpulse_private.apply_credit(tid,coalesce(delta,0),shares,t.assignee_id);
     INSERT INTO taskpulse_private.checklist_credit_events(task_id,operation_id,progress_before,progress_after,scale,scale_version,participant_version,shares,scaled_credit,event_kind)
      VALUES(tid,p_operation,c.credit_anchor,progress,t.task_scale,t.scale_version,t.participant_version,shares,coalesce(delta,0),'prospective_rollup');
     UPDATE public.tasks SET progress_percentage=progress WHERE id=tid;
     UPDATE public.task_checklists SET credit_anchor=coalesce(progress,credit_anchor) WHERE id=c.id;
    END IF;
   END IF;
  END IF;
  SELECT coalesce(sum(hours_worked),0) INTO total_hours FROM public.daily_task_logs WHERE task_id=tid AND reversed_at IS NULL;
  IF EXISTS(SELECT 1 FROM public.daily_task_logs WHERE task_id=tid AND reversed_at IS NULL AND NOT(hours_worked>=0 AND hours_worked<'Infinity'::numeric)) THEN total_hours:=NULL; END IF;
  UPDATE public.tasks SET task_productivity=CASE WHEN total_hours>0 AND total_hours<'Infinity'::numeric THEN round(progress_percentage/total_hours,2) ELSE NULL END,
   productivity_available=coalesce(total_hours>0 AND total_hours<'Infinity'::numeric AND progress_percentage IS NOT NULL,false),metric_version=metric_version+1 WHERE id=tid RETURNING metric_version INTO v;
  INSERT INTO taskpulse_private.outbox_jobs(kind,entity_id,entity_version,operation_id,payload) VALUES('task_metrics_invalidated',tid,v,p_operation,jsonb_build_object('contract','m05-checklist-v1','affected_date',p_date,'dependencies',ARRAY['M07'],'reason','atomic_graph_refresh'));
  INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
   VALUES(auth.uid(),coalesce(public.get_user_role()::text,'system'),'checklist_metric_refresh','tasks',tid,ARRAY['progress','metrics'],jsonb_build_object('source',p_task,'before_progress',t.progress_percentage,'after_progress',(SELECT progress_percentage FROM public.tasks WHERE id=tid),'metric_version',v),p_operation);
  IF tid=p_task THEN root_version:=v; END IF;
 END LOOP;
 RETURN root_version;
END $$;
CREATE FUNCTION taskpulse_private.assert_checklist_done(p_task uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$ DECLARE r jsonb; t public.tasks; BEGIN
 SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task;
 r:=taskpulse_private.checklist_rollup(p_task);
 IF NOT(r->>'isComplete')::boolean THEN RAISE EXCEPTION 'Done needs initialized, applicable Setup/Activity/Closure completion; review section summaries and errors' USING ERRCODE='23514'; END IF;
 IF t.progress_percentage IS NOT NULL AND t.progress_percentage<>100 THEN RAISE EXCEPTION 'Checklist gates passed, but current manual task progress is not 100; reconcile progress or enable Activity ownership before Done' USING ERRCODE='23514'; END IF;
 IF t.reviewer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.task_reviewers WHERE task_id=p_task AND user_id=t.reviewer_id) THEN RAISE EXCEPTION 'Reconcile the legacy primary reviewer before Done' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.task_reviewers r LEFT JOIN public.users u ON u.id=r.user_id WHERE r.task_id=p_task AND (NOT coalesce(u.is_active,false) OR NOT r.review_approved OR r.reviewed_revision IS DISTINCT FROM t.work_revision)) THEN RAISE EXCEPTION 'Done needs every assigned reviewer approval for the current work revision' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION public.checklist_command(p_task uuid,p_command text,p_payload jsonb,p_expected_version bigint,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); role public.user_role; t public.tasks; c public.task_checklists; n public.checklist_nodes; receipt taskpulse_private.command_receipts; request jsonb:=jsonb_build_array(p_task,p_command,p_payload,p_expected_version); result jsonb; node_id uuid; section_role text; change_reason text; before_state jsonb; rollup jsonb; enabled boolean; BEGIN
 SELECT u.role INTO role FROM public.users u WHERE u.id=actor AND u.is_active FOR SHARE;
 IF role IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_operation IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_command IS NULL OR p_command NOT IN ('create','add','state','edit','map','delete','section','mode') THEN RAISE EXCEPTION 'Invalid checklist command' USING ERRCODE='23514'; END IF;
 IF p_payload-(CASE p_command WHEN 'create' THEN ARRAY['title'] WHEN 'add' THEN ARRAY['title','description','section','parent_id','linked_task_id','node_type'] WHEN 'state' THEN ARRAY['node_id','state'] WHEN 'edit' THEN ARRAY['node_id','title','parent_id','linked_task_id','node_type','section','reason'] WHEN 'map' THEN ARRAY['node_id','section','reason'] WHEN 'delete' THEN ARRAY['node_id','reason'] WHEN 'section' THEN ARRAY['section','intentional_empty','reason'] WHEN 'mode' THEN ARRAY['enabled','reason','preview_progress'] END)<>'{}' THEN RAISE EXCEPTION 'Unexpected checklist fields' USING ERRCODE='23514'; END IF;
 IF p_command<>'state' AND role NOT IN ('managing_director','project_engineer') THEN RAISE EXCEPTION 'Manager controls checklist structure and ownership' USING ERRCODE='42501'; END IF;
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
  IF p_command IN ('state','edit','map','delete') THEN
   node_id:=(p_payload->>'node_id')::uuid;
   SELECT * INTO n FROM public.checklist_nodes WHERE id=node_id AND checklist_id=c.id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Item is not in this task checklist' USING ERRCODE='23514'; END IF;
  END IF;
  IF p_command='add' THEN
   IF nullif(btrim(p_payload->>'title'),'') IS NULL OR p_payload->>'node_type' IS NULL THEN RAISE EXCEPTION 'Title and node type required' USING ERRCODE='23514'; END IF;
   INSERT INTO public.checklist_nodes(checklist_id,parent_node_id,linked_task_id,node_type,title,description,detail_section) VALUES(c.id,(p_payload->>'parent_id')::uuid,(p_payload->>'linked_task_id')::uuid,(p_payload->>'node_type')::public.checklist_node_type,btrim(p_payload->>'title'),p_payload->>'description',section_role) RETURNING id INTO node_id;
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
    node_type=CASE WHEN x.id=n.id THEN coalesce((p_payload->>'node_type')::public.checklist_node_type,x.node_type) ELSE x.node_type END
    WHERE x.id IN (SELECT id FROM subtree);
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
CREATE OR REPLACE FUNCTION taskpulse_private.invalidate_reviews() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE tid uuid; BEGIN
 IF TG_TABLE_NAME='tasks' THEN
  IF NEW.status='Done' AND OLD.status<>'Done' AND (to_jsonb(NEW)-ARRAY['status','completed_date','met_deadline','freshness','freshness_reason','updated_at','eligibility_reasons','valid_for_metrics']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','completed_date','met_deadline','freshness','freshness_reason','updated_at','eligibility_reasons','valid_for_metrics']) THEN RETURN NEW; END IF;
  IF (NEW.title,NEW.description,NEW.progress_percentage,NEW.status,NEW.task_scale,NEW.priority,NEW.due_date,NEW.participant_version,NEW.scale_mode,NEW.scale_inputs,NEW.scale_override)
   IS NOT DISTINCT FROM (OLD.title,OLD.description,OLD.progress_percentage,OLD.status,OLD.task_scale,OLD.priority,OLD.due_date,OLD.participant_version,OLD.scale_mode,OLD.scale_inputs,OLD.scale_override) THEN RETURN NEW; END IF;
  tid:=NEW.id;
 ELSE
  IF TG_OP='UPDATE' AND to_jsonb(NEW)-ARRAY['updated_at','execution_version','credit_anchor'] IS NOT DISTINCT FROM to_jsonb(OLD)-ARRAY['updated_at','execution_version','credit_anchor'] THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME IN ('daily_task_logs','task_detail_sections') THEN tid:=CASE WHEN TG_OP='DELETE' THEN OLD.task_id ELSE NEW.task_id END;
  ELSIF TG_TABLE_NAME='task_checklists' THEN tid:=CASE WHEN TG_OP='DELETE' THEN OLD.task_id ELSE NEW.task_id END;
  ELSE SELECT task_id INTO tid FROM public.task_checklists WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.checklist_id ELSE NEW.checklist_id END; END IF;
 END IF;
 UPDATE public.tasks SET work_revision=work_revision+1,lifecycle_version=lifecycle_version+1 WHERE id=tid;
 UPDATE public.task_reviewers SET review_approved=false,reviewed_at=NULL,reviewed_revision=NULL WHERE task_id=tid;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE OR REPLACE FUNCTION taskpulse_private.task_command(p_task uuid,p_command text,p_payload jsonb,p_version bigint,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$ DECLARE actor uuid:=auth.uid(); role public.user_role; t public.tasks; receipt taskpulse_private.command_receipts;
 request jsonb; result jsonb; desired public.task_status; reason text; asof date:=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
 inputs jsonb; mode text; override_value numeric; amount numeric; source_id uuid; item record; BEGIN
 SELECT u.role INTO role FROM public.users u WHERE id=actor AND is_active FOR SHARE;
 IF role IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_operation IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_command NOT IN ('transition','progress','scale','review') THEN
  RAISE EXCEPTION 'Invalid task command' USING ERRCODE='23514'; END IF;
 IF (p_command='transition' AND p_payload-ARRAY['status','reason']<>'{}') OR (p_command='progress' AND p_payload-ARRAY['progress']<>'{}') OR
  (p_command='scale' AND p_payload-ARRAY['mode','inputs','override','reason','provenance']<>'{}') OR (p_command='review' AND p_payload-ARRAY['approved']<>'{}') THEN
  RAISE EXCEPTION 'Unexpected task fields' USING ERRCODE='23514'; END IF;
 request:=jsonb_build_array(p_task,p_payload,p_version);
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||p_command||p_operation::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=p_command AND operation_id=p_operation;
 IF FOUND THEN IF receipt.request<>request THEN RAISE EXCEPTION 'Operation key reused with different input' USING ERRCODE='40001'; END IF; RETURN receipt.result_payload; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task FOR UPDATE;
 asof:=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
 IF p_version IS NULL OR p_version<>t.lifecycle_version THEN RAISE EXCEPTION 'Task changed; reload before saving' USING ERRCODE='40001'; END IF;
 IF p_command='review' THEN
  IF jsonb_typeof(p_payload->'approved') IS DISTINCT FROM 'boolean' OR NOT EXISTS(SELECT 1 FROM public.task_reviewers WHERE task_id=p_task AND user_id=actor) THEN
   RAISE EXCEPTION 'Assigned reviewer and boolean decision required' USING ERRCODE='42501'; END IF;
  UPDATE public.task_reviewers SET review_approved=(p_payload->>'approved')::boolean,reviewed_at=clock_timestamp(),reviewed_revision=t.work_revision WHERE task_id=p_task AND user_id=actor;
 ELSE
  IF NOT (role IN ('managing_director','project_engineer') OR public.is_task_assignee(p_task)) THEN RAISE EXCEPTION 'Assigned actor or manager required' USING ERRCODE='42501'; END IF;
  PERFORM taskpulse_private.assert_task_open_date(p_task,asof);
  reason:=nullif(btrim(p_payload->>'reason'),'');
  IF length(coalesce(reason,''))>1000 THEN RAISE EXCEPTION 'Reason too long' USING ERRCODE='23514'; END IF;
  IF p_command='transition' THEN
   desired:=(p_payload->>'status')::public.task_status;
   IF desired IS NULL THEN RAISE EXCEPTION 'Status required' USING ERRCODE='23514'; END IF;
   IF desired='Done' THEN PERFORM taskpulse_private.assert_checklist_done(p_task); END IF;
   IF t.status IN ('Done','Discarded') AND desired<>'In Progress' THEN RAISE EXCEPTION 'Reopen terminal tasks into In Progress first' USING ERRCODE='23514'; END IF;
   IF desired='Carryover' THEN
    IF role NOT IN ('managing_director','project_engineer') THEN RAISE EXCEPTION 'Manager carryover authority required' USING ERRCODE='42501'; END IF;
    IF reason IS NULL THEN RAISE EXCEPTION 'Carryover requires a reason' USING ERRCODE='23514'; END IF;
   END IF;
   IF desired='Discarded' OR t.status IN ('Done','Discarded') OR desired='Not Started' THEN
    IF role NOT IN ('managing_director','project_engineer') THEN RAISE EXCEPTION 'Manager lifecycle authority required' USING ERRCODE='42501'; END IF;
    IF reason IS NULL THEN RAISE EXCEPTION 'Cancellation, reopening and reset require a reason' USING ERRCODE='23514'; END IF;
   END IF;
   UPDATE public.tasks SET status=desired,started_date=CASE WHEN desired='In Progress' THEN coalesce(started_date,asof) ELSE started_date END,
    reopened_at=CASE WHEN t.status IN ('Done','Discarded') AND desired='In Progress' THEN clock_timestamp() ELSE reopened_at END,
    completed_date=CASE WHEN desired='Done' THEN asof END,met_deadline=CASE WHEN desired='Done' AND due_date IS NOT NULL THEN asof<=due_date END WHERE id=p_task;
  ELSIF p_command='progress' THEN
   IF t.status IN ('Done','Discarded') THEN RAISE EXCEPTION 'Reopen before changing terminal progress' USING ERRCODE='23514'; END IF;
   amount:=(p_payload->>'progress')::numeric;
   IF amount IS NULL OR NOT(amount BETWEEN 0 AND 100) OR amount<>round(amount,2) THEN RAISE EXCEPTION 'Progress must be finite 0-100 with two decimals' USING ERRCODE='23514'; END IF;
   IF amount IS DISTINCT FROM t.progress_percentage AND t.task_scale IS NULL THEN
    RAISE EXCEPTION 'Progress credit requires a measured scale; reconcile the scale first' USING ERRCODE='23514'; END IF;
   PERFORM taskpulse_private.assert_progress_owner(p_task,amount-coalesce(t.progress_percentage,0));
   UPDATE public.tasks SET progress_percentage=amount WHERE id=p_task;
  ELSE
   IF role NOT IN ('managing_director','project_engineer') THEN RAISE EXCEPTION 'Manager scale authority required' USING ERRCODE='42501'; END IF;
   IF t.status IN ('Done','Discarded') THEN RAISE EXCEPTION 'Closed scale requires reopening or authorized historical revision' USING ERRCODE='23514'; END IF;
   mode:=p_payload->>'mode'; inputs:=p_payload->'inputs'; override_value:=(p_payload->>'override')::numeric;
   IF reason IS NULL OR nullif(btrim(p_payload->>'provenance'),'') IS NULL OR length(p_payload->>'provenance')>1000 OR jsonb_typeof(inputs) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Scale inputs, reason and source provenance required' USING ERRCODE='23514'; END IF;
   IF mode NOT IN ('manual','hours','activity_count','linked') OR mode IS NULL OR
    (mode='manual' AND (inputs-ARRAY['value']<>'{}' OR NOT inputs?'value')) OR
    (mode='hours' AND (inputs-ARRAY['multiplier']<>'{}' OR NOT inputs?'multiplier')) OR
    (mode='activity_count' AND (inputs-ARRAY['activity_count','unit_scale']<>'{}' OR NOT(inputs?'activity_count' AND inputs?'unit_scale'))) OR
    (mode='linked' AND (inputs-ARRAY['source_task_id','percentage']<>'{}' OR NOT(inputs?'source_task_id' AND inputs?'percentage'))) THEN
    RAISE EXCEPTION 'Unsupported scale formula/inputs' USING ERRCODE='23514'; END IF;
   FOR item IN SELECT key,value FROM jsonb_each(inputs-'source_task_id') LOOP
    IF jsonb_typeof(item.value)<>'number' OR NOT((item.value::text)::numeric>=0 AND (item.value::text)::numeric<'Infinity'::numeric) THEN
     RAISE EXCEPTION 'Finite nonnegative scale inputs required' USING ERRCODE='23514'; END IF;
   END LOOP;
   IF override_value IS NOT NULL AND NOT(override_value>=0 AND override_value<'Infinity'::numeric) THEN RAISE EXCEPTION 'Finite nonnegative override required' USING ERRCODE='23514'; END IF;
   IF mode='activity_count' AND (inputs->>'activity_count')::numeric<>trunc((inputs->>'activity_count')::numeric) THEN RAISE EXCEPTION 'Numeric activity count must be a whole number' USING ERRCODE='23514'; END IF;
   IF mode='linked' THEN
    source_id:=(inputs->>'source_task_id')::uuid;
    IF (inputs->>'percentage')::numeric>100 OR NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=source_id AND task_scale IS NOT NULL) THEN RAISE EXCEPTION 'Known scale source and percentage 0-100 required' USING ERRCODE='23514'; END IF;
    IF EXISTS(WITH RECURSIVE chain(id,path) AS (SELECT source_id,ARRAY[source_id] UNION ALL
      SELECT (c.scale_inputs->>'source_task_id')::uuid,chain.path||(c.scale_inputs->>'source_task_id')::uuid FROM public.tasks c JOIN chain ON c.id=chain.id
       WHERE c.scale_mode='linked' AND NOT (c.scale_inputs->>'source_task_id')::uuid=ANY(chain.path)) SELECT 1 FROM chain WHERE id=p_task) THEN
     RAISE EXCEPTION 'Linked scale cycle rejected' USING ERRCODE='23514'; END IF;
   END IF;
   UPDATE public.tasks SET scale_mode=mode,scale_inputs=inputs,scale_override=override_value,scale_provenance=p_payload->>'provenance' WHERE id=p_task;
   amount:=taskpulse_private.derive_scale(p_task);
   UPDATE public.tasks SET task_scale=amount,scale_version=scale_version+1,scale_effective_at=clock_timestamp() WHERE id=p_task;
  END IF;
  PERFORM taskpulse_private.refresh_task_metrics(p_task,p_operation,asof);
 END IF;
 UPDATE public.tasks SET lifecycle_version=lifecycle_version+1 WHERE id=p_task;
 result:=jsonb_build_object('taskId',p_task,'taskTag',t.task_tag,'version',(SELECT lifecycle_version FROM public.tasks WHERE id=p_task));
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(actor,role::text,p_command,'tasks',p_task,ARRAY[p_command],jsonb_build_object('reason',reason,
  'before',jsonb_build_object('status',t.status,'progress',t.progress_percentage,'scale',t.task_scale,'scale_version',t.scale_version),
  'after',(SELECT jsonb_build_object('status',status,'progress',progress_percentage,'scale',task_scale,'scale_version',scale_version,'work_revision',work_revision,'review_approved',CASE WHEN p_command='review' THEN p_payload->'approved' ELSE NULL END) FROM public.tasks WHERE id=p_task)),p_operation);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload) VALUES(actor,p_command,p_operation,request,p_task,result);
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION taskpulse_private.initialize_native_details(p_task uuid,p_template uuid,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
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
 UPDATE public.checklist_sections s SET initialized=true WHERE s.checklist_id=cid AND EXISTS(SELECT 1 FROM public.checklist_nodes n WHERE n.checklist_id=cid AND n.detail_section=s.role AND (n.node_type IN ('Item','Task') OR n.parent_node_id IS NOT NULL));
 PERFORM taskpulse_private.refresh_task_metrics(p_task,p_operation,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
  VALUES(auth.uid(),public.get_user_role()::text,'initialize_native_details','tasks',p_task,ARRAY['native_details'],jsonb_build_object('template_version',v.id,'existing_checklist_retained',had_checklist),p_operation);
 INSERT INTO taskpulse_private.outbox_jobs(kind,entity_id,entity_version,operation_id,payload)
  VALUES('native_details_initialized',p_task,1,p_operation,jsonb_build_object('native_ready',true,'provider_requested',false)) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('taskId',p_task,'nativeState','ready','providerState','not_requested','templateVersionId',v.id);
END $$;

CREATE OR REPLACE FUNCTION public.task_details_command(p_task uuid,p_command text,p_payload jsonb,p_expected_version bigint,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 IF p_command<>'initialize' THEN PERFORM taskpulse_private.refresh_task_metrics(p_task,p_operation,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date); END IF;
 result:=result||jsonb_build_object('version',(SELECT lifecycle_version FROM public.tasks WHERE public.tasks.id=p_task));
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload) VALUES(auth.uid(),'detail_'||p_command,p_operation,request,p_task,result);
 RETURN result;
END $$;

-- Retain M02/M03 log ordering/captures; reject nonzero requested progress even
-- when clamping at 100 would hide that a log tried to take ownership.
DO $$ DECLARE definition text; marker text:='requested:=(p_payload->>''requested_delta'')::numeric;'; BEGIN
 SELECT pg_get_functiondef('taskpulse_private.execution_command(text,uuid,uuid,jsonb,bigint,uuid)'::regprocedure) INTO definition;
 IF strpos(definition,marker)=0 THEN RAISE EXCEPTION 'Unexpected execution contract; inspect before upgrading'; END IF;
 EXECUTE replace(definition,marker,marker||' PERFORM taskpulse_private.assert_progress_owner(tid,requested);');
END $$;
CREATE TRIGGER m05_section_review AFTER INSERT OR UPDATE OR DELETE ON public.checklist_sections FOR EACH ROW EXECUTE FUNCTION taskpulse_private.invalidate_reviews();
REVOKE INSERT,UPDATE,DELETE ON public.task_checklists,public.checklist_nodes FROM anon,authenticated;
DO $$ DECLARE t text; cols text; BEGIN FOREACH t IN ARRAY ARRAY['task_checklists','checklist_nodes'] LOOP SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute WHERE attrelid=('public.'||t)::regclass AND attnum>0 AND NOT attisdropped; EXECUTE 'REVOKE INSERT('||cols||'),UPDATE('||cols||') ON public.'||t||' FROM anon,authenticated'; END LOOP; END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON taskpulse_private.checklist_credit_events,taskpulse_private.checklist_projections FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.checklist_rollups(uuid[]),public.checklist_command(uuid,text,jsonb,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.checklist_rollups(uuid[]),public.checklist_command(uuid,text,jsonb,bigint,uuid) TO authenticated;
COMMIT;
