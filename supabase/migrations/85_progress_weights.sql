-- Migration 85: mission progress counts Setup and Closure as well as Activity
-- (user decision, 28 October 2026; DECISIONS "Mission progress weights").
--
-- Before this, a mission's progress was its Activity figure only (63, 66);
-- Setup and Closure only gated Done. From here:
--
-- 1. Progress = Activity 95% + Setup 2.5% + Closure 2.5%, each section being
--    the equal average of its applicable rows as before. A section with no
--    applicable rows (empty or all N/A) drops out and the others share its
--    weight: Activity and Closure only gives 95/97.5 and 2.5/97.5; Activity
--    alone is still 100 when every Activity row is done.
-- 2. No applicable Activity, or an applicable section without a figure, means
--    no figure, and the mission keeps its progress as it was (66).
-- 3. One figure everywhere: tasks.progress_percentage, so scoring credit,
--    productivity, reports and awards read the same number. Finishing Setup
--    now earns 2.5% of the mission's scale. A sub-mission's row in its parent
--    still reads the sub-mission's progress, which is now this figure.
-- 4. Done is unchanged: every applicable row complete or N/A, which is 100.
--
-- Open missions (not Done, Discarded or archived) whose figure changes are
-- recalculated now, dated today, the way 66 did: credit is given or reversed
-- from the anchor (an open mission at Activity 100 with Closure open moves to
-- 97.44, or 95 with Setup open too), with one credit event, audit row and
-- metrics job each. A mission that cannot be recalculated today (a closed
-- date, a closed parent) is listed in a NOTICE and catches up at its next
-- change. Done/Discarded/archived missions, closed periods and month snapshots
-- are not touched. Checklist projections that were current are re-baselined,
-- so a formula-only change does not revoke reviewer approvals or bump work
-- revisions. The rollup keeps the same keys (it is part of that fingerprint).

BEGIN;
SET LOCAL lock_timeout = '120s';

CREATE FUNCTION pg_temp.m85_patch(p_sig text,p_old text,p_new text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(p_sig::regprocedure); BEGIN
 IF (length(def)-length(replace(def,p_old,'')))/length(p_old)<>1 THEN
  RAISE EXCEPTION '% no longer has exactly one "%"; update migration 85',p_sig,left(p_old,120); END IF;
 EXECUTE replace(def,p_old,p_new);
END $$;

-- A. Which projections are current under the deployed rollup.
CREATE TEMP TABLE m85_current ON COMMIT DROP AS
 SELECT p.task_id FROM taskpulse_private.checklist_projections p
  JOIN public.task_checklists c ON c.task_id=p.task_id AND c.owner_node_id IS NULL
 WHERE p.result IS NOT DISTINCT FROM
  (taskpulse_private.checklist_rollup(p.task_id)||jsonb_build_object('sources',(SELECT coalesce(jsonb_agg(jsonb_build_array(n.id,n.completion_state,n.parent_node_id,n.detail_section,n.title,n.linked_task_id,src.work_revision,src.status) ORDER BY n.id),'[]') FROM public.checklist_nodes n LEFT JOIN public.tasks src ON src.id=n.linked_task_id WHERE n.checklist_id=c.id)));
DO $$ BEGIN
 IF position($m$fingerprint:=rollup||jsonb_build_object('sources',(SELECT coalesce(jsonb_agg(jsonb_build_array(n.id,n.completion_state,n.parent_node_id,n.detail_section,n.title,n.linked_task_id,src.work_revision,src.status) ORDER BY n.id),'[]') FROM public.checklist_nodes n LEFT JOIN public.tasks src ON src.id=n.linked_task_id WHERE n.checklist_id=c.id));$m$
   IN pg_catalog.pg_get_functiondef('taskpulse_private.refresh_task_metrics(uuid,uuid,date)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'refresh_task_metrics fingerprint changed; update migration 85'; END IF;
END $$;

-- B. The rollup: 63's body with the weighted overall at the end.
CREATE OR REPLACE FUNCTION taskpulse_private.checklist_result(p_checklist uuid,p_path uuid[] DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE section_role text; node record; r jsonb; sections jsonb:='{}'; vals jsonb:='[]'; errors jsonb:='[]'; total numeric; cnt integer; complete boolean; unavailable boolean; allcomplete boolean:=true; taskprogress numeric;
 w numeric; weight_total numeric:=0; weighted numeric:=0; overall_unavailable boolean:=false; BEGIN
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
 -- Activity 95, Setup 2.5, Closure 2.5 over the sections that have applicable
 -- rows. No Activity, or an applicable section without a figure: no figure.
 FOREACH section_role IN ARRAY ARRAY['setup','activity','closure'] LOOP
  IF coalesce((sections->section_role->>'applicable')::boolean,false) THEN
   w:=CASE section_role WHEN 'activity' THEN 95 ELSE 2.5 END;
   weight_total:=weight_total+w;
   IF sections->section_role->>'progressPercentage' IS NULL THEN overall_unavailable:=true;
   ELSE weighted:=weighted+w*(sections->section_role->>'progressPercentage')::numeric; END IF;
  END IF;
 END LOOP;
 taskprogress:=CASE WHEN NOT coalesce((sections->'activity'->>'applicable')::boolean,false) OR overall_unavailable OR weight_total=0
  THEN NULL ELSE weighted/weight_total END;
 RETURN jsonb_build_object('contract','m05-checklist-v1','sections',sections,'taskProgress',taskprogress,'taskProgressDecimal',taskprogress::text,'overallProgressPercentage',taskprogress,'isComplete',allcomplete,'errors',errors,'nodeProgress',vals);
END $$;

-- C. Wording that named Activity as the only source.
SELECT pg_temp.m85_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $m$'A mission with a checklist always takes its progress from Activity'$m$,
 $m$'A mission with a checklist always takes its progress from the checklist'$m$);
SELECT pg_temp.m85_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $m$'Fix the checklist issues before Activity drives progress'$m$,
 $m$'Fix the checklist issues before the checklist drives progress'$m$);

-- D. Re-baseline projections that were current, under the new rollup.
UPDATE taskpulse_private.checklist_projections p SET result=
 taskpulse_private.checklist_rollup(p.task_id)||jsonb_build_object('sources',(SELECT coalesce(jsonb_agg(jsonb_build_array(n.id,n.completion_state,n.parent_node_id,n.detail_section,n.title,n.linked_task_id,src.work_revision,src.status) ORDER BY n.id),'[]') FROM public.checklist_nodes n LEFT JOIN public.tasks src ON src.id=n.linked_task_id WHERE n.checklist_id=c.id))
 FROM public.task_checklists c, m85_current m WHERE c.task_id=p.task_id AND c.owner_node_id IS NULL AND m.task_id=p.task_id;

-- E. Recalculate open missions whose figure changes. Each refresh also walks
-- up to the parents of a sub-mission, so they follow in the same step.
CREATE TEMP TABLE m85_before ON COMMIT DROP AS
 SELECT t.id task_id,t.task_tag,t.organization_id,t.progress_percentage before_progress,
  (taskpulse_private.checklist_rollup(t.id)->>'taskProgress')::numeric new_progress
 FROM public.tasks t JOIN public.task_checklists c ON c.task_id=t.id AND c.owner_node_id IS NULL
 WHERE t.archived_effective_date IS NULL AND t.status NOT IN ('Done','Discarded');
DELETE FROM m85_before WHERE new_progress IS NULL OR new_progress IS NOT DISTINCT FROM before_progress;

DO $$ DECLARE b record; skipped text:=''; moved int:=0; BEGIN
 FOR b IN SELECT * FROM m85_before ORDER BY task_tag LOOP
  BEGIN
   PERFORM set_config('taskpulse.organization',b.organization_id::text,true);
   PERFORM taskpulse_private.refresh_task_metrics(b.task_id,gen_random_uuid(),(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
  EXCEPTION WHEN others THEN skipped:=skipped||b.task_tag||' ('||SQLERRM||'); ';
  END;
 END LOOP;
 PERFORM set_config('taskpulse.organization','',true);
 SELECT count(*) INTO moved FROM m85_before x JOIN public.tasks t ON t.id=x.task_id WHERE t.progress_percentage IS DISTINCT FROM x.before_progress;
 RAISE NOTICE 'Migration 85: % open missions to recalculate; % changed progress', (SELECT count(*) FROM m85_before), moved;
 IF skipped<>'' THEN RAISE NOTICE 'Migration 85: not recalculated now: %', skipped; END IF;
END $$;

COMMIT;
SELECT taskpulse_private.m15_secure();
