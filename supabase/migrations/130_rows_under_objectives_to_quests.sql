-- ===========================================================================
-- TaskPulse - No rows under objectives; those rows become Quests
-- (forward only; 6 November 2026)
--
-- User decision (6 November 2026): adding rows under an objective is pointless
-- now that Quests exist, and every objective that already has rows under it
-- becomes a Quest holding those rows.
--
-- 1. Every row with rows under it (any list, deepest first) becomes a Quest:
--    it turns into a Page row that owns a new list (the Quest's own checklist,
--    owner set by the usual default: the mission's primary Crew member), and
--    its direct rows move into that list, at its top level, in its single
--    list of objectives (section 'activity', as every Quest list). Node ids
--    stay, so logs, timers, reviews and linked sub-missions keep pointing at
--    the same rows. A parent row took the equal average of its rows; a Quest
--    takes the average of its list, so every mission's progress is checked to
--    be unchanged (the migration stops if one would change).
-- 2. checklist_command refuses to add a row or a Quest under a row, or to move
--    a row under a row: rows go into a list (the mission's or a Quest's).
-- 3. As migration 63 did, the guards that would refuse or count the move
--    (Quest ownership shape, linked-row progress ownership, archived missions,
--    review invalidation, presentation history per row) are off while it runs
--    and on again before COMMIT; projections that were current are
--    re-baselined, so no approval is revoked and no credit moves.
-- ===========================================================================
BEGIN;
SET LOCAL lock_timeout = '120s';

CREATE FUNCTION pg_temp.m130_patch(p_sig text,p_old text,p_new text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(p_sig::regprocedure); BEGIN
 IF (length(def)-length(replace(def,p_old,'')))/length(p_old)<>1 THEN
  RAISE EXCEPTION '% no longer has exactly one "%"; update migration 130',p_sig,left(p_old,120); END IF;
 EXECUTE replace(def,p_old,p_new);
END $$;

-- A. Snapshot every mission's rollup and whether its projection is current.
CREATE TEMP TABLE m130_before ON COMMIT DROP AS
 SELECT t.id task_id,taskpulse_private.checklist_rollup(t.id) rollup,
  (SELECT p.result FROM taskpulse_private.checklist_projections p WHERE p.task_id=t.id) IS NOT DISTINCT FROM
  (taskpulse_private.checklist_rollup(t.id)||jsonb_build_object('sources',(SELECT coalesce(jsonb_agg(jsonb_build_array(n.id,n.completion_state,n.parent_node_id,n.detail_section,n.title,n.linked_task_id,src.work_revision,src.status) ORDER BY n.id),'[]') FROM public.checklist_nodes n LEFT JOIN public.tasks src ON src.id=n.linked_task_id WHERE n.checklist_id=c.id))) was_current
 FROM public.tasks t JOIN public.task_checklists c ON c.task_id=t.id AND c.owner_node_id IS NULL;
DO $$ BEGIN
 IF position($m$fingerprint:=rollup||jsonb_build_object('sources',(SELECT coalesce(jsonb_agg(jsonb_build_array(n.id,n.completion_state,n.parent_node_id,n.detail_section,n.title,n.linked_task_id,src.work_revision,src.status) ORDER BY n.id),'[]') FROM public.checklist_nodes n LEFT JOIN public.tasks src ON src.id=n.linked_task_id WHERE n.checklist_id=c.id));$m$
   IN pg_catalog.pg_get_functiondef('taskpulse_private.refresh_task_metrics(uuid,uuid,date)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'refresh_task_metrics fingerprint changed; update migration 130'; END IF;
END $$;

-- B. Guards off for the move (on again in D).
ALTER TABLE public.checklist_nodes DISABLE TRIGGER ab_submission_node;
ALTER TABLE public.checklist_nodes DISABLE TRIGGER m02_linked_owner_guard;
ALTER TABLE public.checklist_nodes DISABLE TRIGGER m03_invalidate_checklist_review;
ALTER TABLE public.checklist_nodes DISABLE TRIGGER zz_m11_checklist;
ALTER TABLE public.checklist_nodes DISABLE TRIGGER a_m09_archive_read_only;
ALTER TABLE public.task_checklists DISABLE TRIGGER ab_submission_owner;
ALTER TABLE public.task_checklists DISABLE TRIGGER m03_invalidate_structure_review;
ALTER TABLE public.task_checklists DISABLE TRIGGER zz_m11_checklist;
ALTER TABLE public.task_checklists DISABLE TRIGGER a_m09_archive_read_only;

CREATE TEMP TABLE m130_touched(task_id uuid PRIMARY KEY) ON COMMIT DROP;

-- C. Deepest first, so a row's own rows are already Quests (rows with nothing
-- under them) when it is converted. One UPDATE moves all of a row's rows, so
-- the graph trigger sees the final state.
DO $$ DECLARE r record; owned uuid; converted integer:=0; BEGIN
 FOR r IN
  WITH RECURSIVE depth(id,level) AS (
   SELECT n.id,0 FROM public.checklist_nodes n WHERE n.parent_node_id IS NULL
   UNION ALL SELECT x.id,d.level+1 FROM public.checklist_nodes x JOIN depth d ON x.parent_node_id=d.id WHERE d.level<200)
  SELECT n.id,n.title,n.checklist_id,c.task_id,c.created_by,d.level
  FROM public.checklist_nodes n JOIN depth d ON d.id=n.id JOIN public.task_checklists c ON c.id=n.checklist_id
  WHERE EXISTS(SELECT 1 FROM public.checklist_nodes x WHERE x.parent_node_id=n.id)
  ORDER BY d.level DESC,n.id
 LOOP
  UPDATE public.checklist_nodes SET node_type='Page',completion_state='No',is_complete=false,completed_by=NULL,completed_at=NULL
   WHERE id=r.id;
  INSERT INTO public.task_checklists(task_id,owner_node_id,title,created_by,sync_progress_to_task)
   VALUES(r.task_id,r.id,r.title,r.created_by,false) RETURNING id INTO owned;
  UPDATE public.checklist_nodes SET checklist_id=owned,parent_node_id=NULL,detail_section='activity'
   WHERE parent_node_id=r.id;
  INSERT INTO m130_touched VALUES(r.task_id) ON CONFLICT DO NOTHING;
  converted:=converted+1;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.checklist_nodes WHERE parent_node_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Migration 130 left rows under a row'; END IF;
 RAISE NOTICE 'Migration 130: % rows with rows under them became Quests', converted;
END $$;

-- D. Guards on again; check every figure; re-baseline current projections.
ALTER TABLE public.checklist_nodes ENABLE TRIGGER ab_submission_node;
ALTER TABLE public.checklist_nodes ENABLE TRIGGER m02_linked_owner_guard;
ALTER TABLE public.checklist_nodes ENABLE TRIGGER m03_invalidate_checklist_review;
ALTER TABLE public.checklist_nodes ENABLE TRIGGER zz_m11_checklist;
ALTER TABLE public.checklist_nodes ENABLE TRIGGER a_m09_archive_read_only;
ALTER TABLE public.task_checklists ENABLE TRIGGER ab_submission_owner;
ALTER TABLE public.task_checklists ENABLE TRIGGER m03_invalidate_structure_review;
ALTER TABLE public.task_checklists ENABLE TRIGGER zz_m11_checklist;
ALTER TABLE public.task_checklists ENABLE TRIGGER a_m09_archive_read_only;

DO $$ DECLARE changed text; BEGIN
 SELECT string_agg(t.task_tag,', ' ORDER BY t.task_tag) INTO changed FROM m130_before b JOIN public.tasks t ON t.id=b.task_id
  -- Six decimals (D04): a Quest's figure goes through its list's weighting (95 x / 95), which can move
  -- the last digits of a repeating decimal.
  WHERE round((taskpulse_private.checklist_rollup(b.task_id)->>'taskProgress')::numeric,6) IS DISTINCT FROM round((b.rollup->>'taskProgress')::numeric,6)
   OR jsonb_array_length(taskpulse_private.checklist_rollup(b.task_id)->'errors')>jsonb_array_length(b.rollup->'errors');
 IF changed IS NOT NULL THEN RAISE EXCEPTION 'Migration 130 would change the progress of: %',changed; END IF;
END $$;

UPDATE taskpulse_private.checklist_projections p SET result=
 taskpulse_private.checklist_rollup(p.task_id)||jsonb_build_object('sources',(SELECT coalesce(jsonb_agg(jsonb_build_array(n.id,n.completion_state,n.parent_node_id,n.detail_section,n.title,n.linked_task_id,src.work_revision,src.status) ORDER BY n.id),'[]') FROM public.checklist_nodes n LEFT JOIN public.tasks src ON src.id=n.linked_task_id WHERE n.checklist_id=c.id))
 FROM public.task_checklists c, m130_before b WHERE c.task_id=p.task_id AND c.owner_node_id IS NULL AND b.task_id=p.task_id AND b.was_current;

INSERT INTO taskpulse_private.presentation_history(kind,row_id,task_id,source)
 SELECT 'checklist',m.task_id,m.task_id,taskpulse_private.checklist_rollup(m.task_id) FROM m130_touched m;
UPDATE public.tasks t SET lifecycle_version=lifecycle_version+1
 FROM m130_touched m WHERE m.task_id=t.id AND t.archived_effective_date IS NULL;

-- E. No new rows under a row: add, a Quest and a move go into a list.
SELECT pg_temp.m130_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $f$section_role:=p_payload->>'section';$f$,
 $f$section_role:=p_payload->>'section';
  -- 130: no rows under an objective; rows and Quests go into a list (the mission's or a Quest's).
  IF p_command IN ('add','submission','edit') AND (p_payload->>'parent_id') IS NOT NULL THEN
   RAISE EXCEPTION 'Rows cannot go under an objective; add a Quest and put the rows in it' USING ERRCODE='23514'; END IF;$f$);

COMMIT;
SELECT taskpulse_private.m15_secure();
