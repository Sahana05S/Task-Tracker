-- Migration 63: one kind of checklist row (user decisions, 23 October 2026).
--
-- The workbook's Master Checklist had one idea: every row is ticked Yes/No/N/A,
-- and any row can become a page of its own rows, nested as deep as needed
-- (DECISIONS "M14 nested checklist pages"). The app had grown Page, Group and
-- Sub-mission rows (a Sub-mission owning its own Setup/Activity/Closure), an
-- Item that could never get rows under it, and a manager "confirm initialized
-- work" step per section. From here:
--
-- 1. Any row that is not linked to a mission can have rows under it. A row with
--    rows under it takes the equal average of its applicable rows; its own
--    Yes/No/N/A is ignored and cleared when the first row is added under it.
--    A row with nothing under it is ticked Yes/No/N/A as before.
-- 2. Sub-missions are folded in: an owned checklist's Activity rows go under
--    its row, its Setup/Closure rows go into the mission's own Setup/Closure
--    under a row named after it (so they still gate Done), and the owned
--    checklist is removed. Node ids are kept, so item logs and timers stay.
-- 3. A section counts as soon as it has a row; an empty section is N/A and
--    does not block Done. checklist_sections stays for older readers but is no
--    longer read by the rollup. A mission with no checklist still blocks Done.
-- 4. The "Setup"/"Activity"/"Closure" groups that native initialisation used
--    as section roots are dissolved where they are the only root of their
--    section, and new missions no longer get them.
-- 5. checklist_command refuses 'submission' and 'section'; 'add' no longer
--    needs a node type; 'state' refuses rows with rows under them.
--
-- Activity progress of every mission whose rollup was valid before is checked
-- to be unchanged, and checklist projections that were current are
-- re-baselined, so no credit moves and no reviewer approval is revoked by the
-- migration itself. Deployed functions are patched by replacing one known
-- fragment (as 52, 53 and 61 do); the two pure rollup reads are replaced.

BEGIN;
SET LOCAL lock_timeout = '120s';

CREATE FUNCTION pg_temp.m63_patch(p_sig text,p_old text,p_new text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(p_sig::regprocedure); BEGIN
 IF (length(def)-length(replace(def,p_old,'')))/length(p_old)<>1 THEN
  RAISE EXCEPTION '% no longer has exactly one "%"; update migration 63',p_sig,left(p_old,120); END IF;
 EXECUTE replace(def,p_old,p_new);
END $$;

-- A. Snapshot every mission's rollup and whether its projection is current,
-- using the definitions that are still deployed.
CREATE TEMP TABLE m63_before ON COMMIT DROP AS
 SELECT t.id task_id,taskpulse_private.checklist_rollup(t.id) rollup,
  (SELECT p.result FROM taskpulse_private.checklist_projections p WHERE p.task_id=t.id) IS NOT DISTINCT FROM
  (taskpulse_private.checklist_rollup(t.id)||jsonb_build_object('sources',(SELECT coalesce(jsonb_agg(jsonb_build_array(n.id,n.completion_state,n.parent_node_id,n.detail_section,n.title,n.linked_task_id,src.work_revision,src.status) ORDER BY n.id),'[]') FROM public.checklist_nodes n LEFT JOIN public.tasks src ON src.id=n.linked_task_id WHERE n.checklist_id=c.id))) was_current
 FROM public.tasks t JOIN public.task_checklists c ON c.task_id=t.id AND c.owner_node_id IS NULL;
DO $$ BEGIN
 IF position($m$fingerprint:=rollup||jsonb_build_object('sources',(SELECT coalesce(jsonb_agg(jsonb_build_array(n.id,n.completion_state,n.parent_node_id,n.detail_section,n.title,n.linked_task_id,src.work_revision,src.status) ORDER BY n.id),'[]') FROM public.checklist_nodes n LEFT JOIN public.tasks src ON src.id=n.linked_task_id WHERE n.checklist_id=c.id));$m$
   IN pg_catalog.pg_get_functiondef('taskpulse_private.refresh_task_metrics(uuid,uuid,date)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'refresh_task_metrics fingerprint changed; update migration 63'; END IF;
END $$;

-- B. Guards. Sub-mission triggers go; any non-linked row may be a parent.
-- Data moves below must not revoke approvals, bump revisions per row, or be
-- refused for archived missions (their figures are checked unchanged in I).
DROP TRIGGER ab_submission_node ON public.checklist_nodes;
DROP TRIGGER ab_submission_owner ON public.task_checklists;
SELECT pg_temp.m63_patch('taskpulse_private.checklist_graph_guard()',
 $m$IF parent.linked_task_id IS NOT NULL OR parent.node_type NOT IN ('Group','Page') THEN RAISE EXCEPTION 'Choose an ordinary group or page as parent' USING ERRCODE='23514'; END IF;$m$,
 $m$IF parent.linked_task_id IS NOT NULL OR parent.node_type='Task' THEN RAISE EXCEPTION 'A row linked to a mission cannot have rows under it' USING ERRCODE='23514'; END IF;$m$);
ALTER TABLE public.checklist_nodes DISABLE TRIGGER m03_invalidate_checklist_review;
ALTER TABLE public.checklist_nodes DISABLE TRIGGER zz_m11_checklist;
ALTER TABLE public.checklist_nodes DISABLE TRIGGER a_m09_archive_read_only;
ALTER TABLE public.task_checklists DISABLE TRIGGER m03_invalidate_structure_review;
ALTER TABLE public.task_checklists DISABLE TRIGGER zz_m11_checklist;
ALTER TABLE public.task_checklists DISABLE TRIGGER a_m09_archive_read_only;
ALTER TABLE public.checklist_sections DISABLE TRIGGER m05_section_review;
ALTER TABLE public.checklist_sections DISABLE TRIGGER zz_m11_checklist;
ALTER TABLE public.checklist_sections DISABLE TRIGGER a_m09_archive_read_only;

CREATE TEMP TABLE m63_touched(task_id uuid PRIMARY KEY) ON COMMIT DROP;

-- C. Section-root groups: a root Page/Group titled after its section that is
-- the only root row there is the section itself. Its rows move up a level
-- (the section average of one root equals that root's average), and it goes
-- unless a log or timer points at it.
DO $$ DECLARE g record; BEGIN
 FOR g IN SELECT n.id,n.checklist_id,n.detail_section,c.task_id FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id
  WHERE n.parent_node_id IS NULL AND n.linked_task_id IS NULL AND n.node_type IN ('Page','Group') AND lower(btrim(n.title))=n.detail_section
   AND NOT EXISTS(SELECT 1 FROM public.task_checklists o WHERE o.owner_node_id=n.id)
   AND NOT EXISTS(SELECT 1 FROM public.checklist_nodes s WHERE s.checklist_id=n.checklist_id AND s.parent_node_id IS NULL AND s.detail_section=n.detail_section AND s.id<>n.id) LOOP
  UPDATE public.checklist_nodes SET parent_node_id=NULL WHERE parent_node_id=g.id;
  IF NOT EXISTS(SELECT 1 FROM public.daily_task_logs WHERE checklist_node_id=g.id) AND NOT EXISTS(SELECT 1 FROM public.task_timers WHERE checklist_node_id=g.id) THEN
   DELETE FROM public.checklist_nodes WHERE id=g.id; END IF;
  INSERT INTO m63_touched VALUES(g.task_id) ON CONFLICT DO NOTHING;
 END LOOP;
END $$;

-- D. Fold Sub-missions, outermost first. Activity roots go under the owner row
-- and take its section; Setup/Closure roots go under a row named after the
-- owner in the parent checklist's Setup/Closure. One UPDATE per checklist, so
-- the graph trigger sees the final state.
DO $$ DECLARE o record; wrap_setup uuid; wrap_closure uuid; BEGIN
 LOOP
  SELECT c.id owned,n.id owner,n.title,n.detail_section,n.checklist_id parent,p.task_id INTO o
   FROM public.task_checklists c JOIN public.checklist_nodes n ON n.id=c.owner_node_id JOIN public.task_checklists p ON p.id=n.checklist_id
   WHERE p.owner_node_id IS NULL ORDER BY c.id LIMIT 1;
  EXIT WHEN NOT FOUND;
  wrap_setup:=NULL; wrap_closure:=NULL;
  IF EXISTS(SELECT 1 FROM public.checklist_nodes WHERE checklist_id=o.owned AND detail_section='setup') THEN
   INSERT INTO public.checklist_nodes(checklist_id,node_type,title,detail_section,sort_order)
    VALUES(o.parent,'Item',o.title,'setup',coalesce((SELECT max(sort_order)+1 FROM public.checklist_nodes WHERE checklist_id=o.parent AND parent_node_id IS NULL),0)) RETURNING id INTO wrap_setup;
  END IF;
  IF EXISTS(SELECT 1 FROM public.checklist_nodes WHERE checklist_id=o.owned AND detail_section='closure') THEN
   INSERT INTO public.checklist_nodes(checklist_id,node_type,title,detail_section,sort_order)
    VALUES(o.parent,'Item',o.title,'closure',coalesce((SELECT max(sort_order)+1 FROM public.checklist_nodes WHERE checklist_id=o.parent AND parent_node_id IS NULL),0)) RETURNING id INTO wrap_closure;
  END IF;
  UPDATE public.checklist_nodes SET checklist_id=o.parent,
   parent_node_id=CASE WHEN parent_node_id IS NOT NULL THEN parent_node_id
    WHEN detail_section='activity' THEN o.owner WHEN detail_section='setup' THEN wrap_setup WHEN detail_section='closure' THEN wrap_closure END,
   detail_section=CASE WHEN detail_section='activity' THEN o.detail_section ELSE detail_section END
   WHERE checklist_id=o.owned;
  UPDATE public.checklist_nodes SET completion_state='N/A',is_complete=false,completed_by=NULL,completed_at=NULL
   WHERE id=o.owner AND NOT EXISTS(SELECT 1 FROM public.checklist_nodes WHERE parent_node_id=o.owner);
  DELETE FROM public.task_checklists WHERE id=o.owned;
  INSERT INTO m63_touched VALUES(o.task_id) ON CONFLICT DO NOTHING;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.task_checklists WHERE owner_node_id IS NOT NULL) THEN RAISE EXCEPTION 'A Sub-mission could not be folded into its mission'; END IF;
END $$;

-- E. Rows with rows under them carry no state of their own. A parent marked
-- N/A excluded its whole subtree, so its rows become N/A instead; an empty
-- Page/Group was not applicable, so it becomes an N/A row.
WITH RECURSIVE na_parent AS (
  SELECT n.id FROM public.checklist_nodes n WHERE n.completion_state='N/A' AND EXISTS(SELECT 1 FROM public.checklist_nodes x WHERE x.parent_node_id=n.id)),
 subtree(id) AS (SELECT x.id FROM public.checklist_nodes x JOIN na_parent p ON x.parent_node_id=p.id
  UNION SELECT x.id FROM public.checklist_nodes x JOIN subtree s ON x.parent_node_id=s.id)
UPDATE public.checklist_nodes n SET completion_state='N/A',is_complete=false,completed_by=NULL,completed_at=NULL
 WHERE n.id IN (SELECT id FROM subtree) AND n.linked_task_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.checklist_nodes x WHERE x.parent_node_id=n.id);
UPDATE public.checklist_nodes n SET completion_state='N/A',is_complete=false,completed_by=NULL,completed_at=NULL
 WHERE n.node_type IN ('Page','Group') AND n.completion_state<>'N/A' AND NOT EXISTS(SELECT 1 FROM public.checklist_nodes x WHERE x.parent_node_id=n.id);
UPDATE public.checklist_nodes n SET completion_state='No',is_complete=false,completed_by=NULL,completed_at=NULL
 WHERE (n.completion_state<>'No' OR n.is_complete) AND EXISTS(SELECT 1 FROM public.checklist_nodes x WHERE x.parent_node_id=n.id);

-- F. Rollup: one kind of row; sections are the average of their root rows.
CREATE OR REPLACE FUNCTION taskpulse_private.checklist_node_result(p_node uuid,p_path uuid[] DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE n public.checklist_nodes; child record; r jsonb; errors jsonb:='[]'; vals jsonb:='[]'; total numeric:=0; cnt integer:=0; children integer:=0; complete boolean:=true; unavailable boolean:=false; t public.tasks; BEGIN
 IF p_node=ANY(p_path) THEN RETURN jsonb_build_object('id',p_node,'progressPercentage',NULL,'isComplete',false,'applicable',true,'errors',jsonb_build_array('cycle:'||p_node),'nodeProgress',vals); END IF;
 SELECT * INTO n FROM public.checklist_nodes WHERE id=p_node;
 IF NOT FOUND THEN RETURN jsonb_build_object('id',p_node,'progressPercentage',NULL,'isComplete',false,'applicable',true,'errors',jsonb_build_array('missing_node:'||p_node),'nodeProgress',vals); END IF;
 FOR child IN SELECT id FROM public.checklist_nodes WHERE parent_node_id=p_node ORDER BY id LOOP
  children:=children+1;
  r:=taskpulse_private.checklist_node_result(child.id,p_path||p_node);errors:=errors||(r->'errors');vals:=vals||coalesce(r->'nodeProgress','[]'::jsonb)||(r-ARRAY['errors','nodeProgress']);
  complete:=complete AND (r->>'isComplete')::boolean;
  IF (r->>'applicable')::boolean THEN cnt:=cnt+1;total:=total+coalesce((r->>'progressPercentage')::numeric,0);unavailable:=unavailable OR r->>'progressPercentage' IS NULL; END IF;
 END LOOP;
 -- A row with rows under it takes their average; its own state is not read.
 IF children>0 THEN
  IF n.linked_task_id IS NOT NULL THEN errors:=errors||jsonb_build_array('linked_parent:'||n.id); END IF;
  RETURN jsonb_build_object('id',n.id,'progressPercentage',CASE WHEN cnt=0 OR unavailable THEN NULL ELSE total/cnt END,'isComplete',complete,'applicable',cnt>0,'errors',errors,'nodeProgress',vals);
 END IF;
 IF n.completion_state='N/A' THEN
  IF (n.node_type='Task' AND n.linked_task_id IS NULL) OR (n.linked_task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=n.linked_task_id)) THEN errors:=errors||jsonb_build_array('linked_unavailable:'||n.id); END IF;
  RETURN jsonb_build_object('id',n.id,'progressPercentage',NULL,'isComplete',true,'applicable',false,'errors',errors,'nodeProgress',vals);
 END IF;
 IF n.linked_task_id IS NOT NULL OR n.node_type='Task' THEN
  SELECT * INTO t FROM public.tasks WHERE id=n.linked_task_id;
  IF NOT FOUND OR t.progress_percentage IS NULL OR NOT(t.progress_percentage BETWEEN 0 AND 100) THEN errors:=errors||jsonb_build_array('linked_unavailable:'||n.id);
  ELSIF t.status='Done' AND t.progress_percentage<>100 THEN errors:=errors||jsonb_build_array('linked_done_mismatch:'||n.id); END IF;
  RETURN jsonb_build_object('id',n.id,'progressPercentage',t.progress_percentage,'isComplete',coalesce(t.status='Done' AND t.progress_percentage=100,false),'applicable',true,'errors',errors,'nodeProgress',vals);
 END IF;
 RETURN jsonb_build_object('id',n.id,'progressPercentage',CASE WHEN n.completion_state='Yes' THEN 100 ELSE 0 END,'isComplete',n.completion_state='Yes','applicable',true,'errors',errors,'nodeProgress',vals);
END $$;

CREATE OR REPLACE FUNCTION taskpulse_private.checklist_result(p_checklist uuid,p_path uuid[] DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE section_role text; node record; r jsonb; sections jsonb:='{}'; vals jsonb:='[]'; errors jsonb:='[]'; total numeric; cnt integer; complete boolean; unavailable boolean; allcomplete boolean:=true; taskprogress numeric; BEGIN
 IF p_checklist IS NULL OR NOT EXISTS(SELECT 1 FROM public.task_checklists WHERE id=p_checklist) THEN
  FOREACH section_role IN ARRAY ARRAY['setup','activity','closure'] LOOP
   sections:=sections||jsonb_build_object(section_role,jsonb_build_object('state','missing','progressPercentage',NULL,'isComplete',false,'applicable',false));
  END LOOP;
  RETURN jsonb_build_object('contract','m05-checklist-v1','sections',sections,'taskProgress',NULL,'taskProgressDecimal',NULL,'overallProgressPercentage',NULL,'isComplete',false,'errors','[]'::jsonb,'nodeProgress','[]'::jsonb);
 END IF;
 IF p_checklist=ANY(p_path) THEN RETURN jsonb_build_object('errors',jsonb_build_array('checklist_cycle:'||p_checklist),'isComplete',false,'taskProgress',NULL,'nodeProgress','[]'::jsonb,'sections','{}'::jsonb); END IF;
 FOR node IN SELECT n.* FROM public.checklist_nodes n WHERE checklist_id=p_checklist LOOP
  IF node.detail_section IS NULL THEN errors:=errors||jsonb_build_array('unsectioned:'||node.id); END IF;
  IF node.parent_node_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.checklist_nodes p WHERE p.id=node.parent_node_id AND p.checklist_id=p_checklist AND p.detail_section IS NOT DISTINCT FROM node.detail_section) THEN errors:=errors||jsonb_build_array('missing_or_cross_parent:'||node.id); END IF;
 END LOOP;
 FOREACH section_role IN ARRAY ARRAY['setup','activity','closure'] LOOP
  total:=0;cnt:=0;complete:=true;unavailable:=false;
  FOR node IN SELECT id FROM public.checklist_nodes WHERE checklist_id=p_checklist AND detail_section=section_role AND parent_node_id IS NULL ORDER BY id LOOP
   r:=taskpulse_private.checklist_node_result(node.id,p_path||p_checklist); errors:=errors||(r->'errors'); vals:=vals||coalesce(r->'nodeProgress','[]'::jsonb)||(r-ARRAY['errors','nodeProgress']);
   complete:=complete AND (r->>'isComplete')::boolean;
   IF (r->>'applicable')::boolean THEN cnt:=cnt+1;total:=total+coalesce((r->>'progressPercentage')::numeric,0);unavailable:=unavailable OR r->>'progressPercentage' IS NULL; END IF;
  END LOOP;
  r:=jsonb_build_object('state',CASE WHEN cnt=0 THEN 'not_applicable' WHEN complete THEN 'complete' ELSE 'partial' END,
   'progressPercentage',CASE WHEN cnt=0 OR unavailable THEN NULL ELSE total/cnt END,'isComplete',complete,'applicable',cnt>0);
  sections:=sections||jsonb_build_object(section_role,r);allcomplete:=allcomplete AND complete;
 END LOOP;
 IF jsonb_array_length(errors)>0 THEN
  FOREACH section_role IN ARRAY ARRAY['setup','activity','closure'] LOOP sections:=jsonb_set(sections,ARRAY[section_role],(sections->section_role)||jsonb_build_object('state','invalid','progressPercentage',NULL,'isComplete',false)); END LOOP;allcomplete:=false;
 END IF;
 taskprogress:=(sections->'activity'->>'progressPercentage')::numeric;
 RETURN jsonb_build_object('contract','m05-checklist-v1','sections',sections,'taskProgress',taskprogress,'taskProgressDecimal',taskprogress::text,'overallProgressPercentage',taskprogress,'isComplete',allcomplete,'errors',errors,'nodeProgress',vals);
END $$;

-- G. Commands.
SELECT pg_temp.m63_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $m$ IF role IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;$m$,
 $m$ IF role IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_command IN ('submission','section') THEN RAISE EXCEPTION 'Sub-missions and section reviews were retired; add rows under any row instead' USING ERRCODE='23514'; END IF;$m$);
SELECT pg_temp.m63_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $m$IF nullif(btrim(p_payload->>'title'),'') IS NULL OR p_payload->>'node_type' IS NULL THEN RAISE EXCEPTION 'Title and node type required' USING ERRCODE='23514'; END IF;$m$,
 $m$IF nullif(btrim(p_payload->>'title'),'') IS NULL THEN RAISE EXCEPTION 'Title required' USING ERRCODE='23514'; END IF;
   -- A row that gets rows under it takes its progress from them.
   UPDATE public.checklist_nodes SET completion_state='No',is_complete=false,completed_by=NULL,completed_at=NULL WHERE id=(p_payload->>'parent_id')::uuid AND checklist_id=c.id AND (completion_state<>'No' OR is_complete);$m$);
SELECT pg_temp.m63_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $m$(p_payload->>'linked_task_id')::uuid,(p_payload->>'node_type')::public.checklist_node_type,$m$,
 $m$(p_payload->>'linked_task_id')::uuid,coalesce((p_payload->>'node_type')::public.checklist_node_type,'Item'),$m$);
SELECT pg_temp.m63_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $m$    WHERE x.id IN (SELECT id FROM subtree);$m$,
 $m$    WHERE x.id IN (SELECT id FROM subtree);
   UPDATE public.checklist_nodes SET completion_state='No',is_complete=false,completed_by=NULL,completed_at=NULL WHERE id=(p_payload->>'parent_id')::uuid AND checklist_id=c.id AND (completion_state<>'No' OR is_complete);$m$);
SELECT pg_temp.m63_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $m$ OR EXISTS(SELECT 1 FROM public.checklist_nodes WHERE parent_node_id=n.id) OR n.node_type IN ('Group','Page') THEN RAISE EXCEPTION 'Yes/No/N/A applies only to leaves; parents roll up their children'$m$,
 $m$ OR EXISTS(SELECT 1 FROM public.checklist_nodes WHERE parent_node_id=n.id) THEN RAISE EXCEPTION 'Yes, No or N/A applies to rows with nothing under them; a row with rows under it takes their progress'$m$);
SELECT pg_temp.m63_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $m$IF enabled AND (jsonb_array_length(rollup->'errors')>0 OR EXISTS(SELECT 1 FROM public.checklist_sections WHERE checklist_id=c.id AND NOT initialized)) THEN RAISE EXCEPTION 'Review all sections and correct references before enabling Activity progress'$m$,
 $m$IF enabled AND jsonb_array_length(rollup->'errors')>0 THEN RAISE EXCEPTION 'Fix the checklist issues before Activity drives progress'$m$);

-- H. Branch reads open any row; native initialisation creates no section roots.
SELECT pg_temp.m63_patch('public.checklist_branch(uuid,uuid,uuid,text,integer,integer)',
 $m$AND detail_section=p_section AND node_type IN ('Page','Group') AND NOT EXISTS(SELECT 1 FROM public.task_checklists WHERE owner_node_id=p_parent)) THEN RAISE EXCEPTION 'Choose a page in this checklist and section'$m$,
 $m$AND detail_section=p_section AND linked_task_id IS NULL) THEN RAISE EXCEPTION 'Choose a row in this checklist and section'$m$);
SELECT pg_temp.m63_patch('taskpulse_private.initialize_native_details_m05(uuid,uuid,uuid)',
 $m$  FOREACH section IN ARRAY ARRAY['setup','activity','closure'] LOOP
   INSERT INTO public.checklist_nodes(checklist_id,node_type,title,detail_section,sort_order,is_complete)
    VALUES(cid,'Group',initcap(section),section,CASE section WHEN 'setup' THEN 0 WHEN 'activity' THEN 1 ELSE 2 END,false) RETURNING id INTO root;
   parents:=parents||jsonb_build_object('@'||section,root);
  END LOOP;
$m$,'');
SELECT pg_temp.m63_patch('taskpulse_private.initialize_native_details_m05(uuid,uuid,uuid)',
 $m$(parents->>coalesce(n->>'parent_key','@'||(n->>'section')))::uuid$m$,
 $m$(parents->>(n->>'parent_key'))::uuid$m$);
SELECT pg_temp.m63_patch('taskpulse_private.assert_checklist_done(uuid)',
 $m$'Done needs initialized, applicable Setup/Activity/Closure completion; review section summaries and errors'$m$,
 $m$'Done needs every Setup, Activity and Closure row complete or N/A, and no checklist issues'$m$);
ALTER TABLE public.task_checklists ADD CONSTRAINT m63_no_owned_checklists CHECK (owner_node_id IS NULL);

-- I. Re-enable, check figures, re-baseline current projections.
ALTER TABLE public.checklist_nodes ENABLE TRIGGER m03_invalidate_checklist_review;
ALTER TABLE public.checklist_nodes ENABLE TRIGGER zz_m11_checklist;
ALTER TABLE public.checklist_nodes ENABLE TRIGGER a_m09_archive_read_only;
ALTER TABLE public.task_checklists ENABLE TRIGGER m03_invalidate_structure_review;
ALTER TABLE public.task_checklists ENABLE TRIGGER zz_m11_checklist;
ALTER TABLE public.task_checklists ENABLE TRIGGER a_m09_archive_read_only;
ALTER TABLE public.checklist_sections ENABLE TRIGGER m05_section_review;
ALTER TABLE public.checklist_sections ENABLE TRIGGER zz_m11_checklist;
ALTER TABLE public.checklist_sections ENABLE TRIGGER a_m09_archive_read_only;

DO $$ DECLARE changed text; BEGIN
 SELECT string_agg(t.task_tag,', ' ORDER BY t.task_tag) INTO changed FROM m63_before b JOIN public.tasks t ON t.id=b.task_id
  WHERE jsonb_array_length(b.rollup->'errors')=0 AND b.rollup->>'taskProgress' IS NOT NULL
   AND (taskpulse_private.checklist_rollup(b.task_id)->>'taskProgress')::numeric IS DISTINCT FROM (b.rollup->>'taskProgress')::numeric;
 IF changed IS NOT NULL THEN RAISE EXCEPTION 'Migration 63 would change Activity progress for: %',changed; END IF;
END $$;

UPDATE taskpulse_private.checklist_projections p SET result=
 taskpulse_private.checklist_rollup(p.task_id)||jsonb_build_object('sources',(SELECT coalesce(jsonb_agg(jsonb_build_array(n.id,n.completion_state,n.parent_node_id,n.detail_section,n.title,n.linked_task_id,src.work_revision,src.status) ORDER BY n.id),'[]') FROM public.checklist_nodes n LEFT JOIN public.tasks src ON src.id=n.linked_task_id WHERE n.checklist_id=c.id))
 FROM public.task_checklists c, m63_before b WHERE c.task_id=p.task_id AND c.owner_node_id IS NULL AND b.task_id=p.task_id AND b.was_current;

INSERT INTO m63_touched SELECT DISTINCT c.task_id FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id
 WHERE n.node_type IN ('Page','Group') ON CONFLICT DO NOTHING;
INSERT INTO taskpulse_private.presentation_history(kind,row_id,task_id,source)
 SELECT 'checklist',m.task_id,m.task_id,taskpulse_private.checklist_rollup(m.task_id) FROM m63_touched m;
UPDATE public.tasks t SET lifecycle_version=lifecycle_version+1
 FROM m63_touched m WHERE m.task_id=t.id AND t.archived_effective_date IS NULL;

COMMIT;
SELECT taskpulse_private.m15_secure();
