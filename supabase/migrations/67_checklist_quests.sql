-- Migration 67: Quests, checklist pages with their own Setup / Activity /
-- Closure (user decision, 23 October 2026).
--
-- Migration 63 folded the earlier owned checklists into one kind of row. The
-- user now wants three kinds under a mission: an Item, a Quest (a page that is
-- a master checklist of its own) and a Sub-mission (a real linked mission,
-- migration 68). A Quest is a 'Page' row that owns a task_checklists row
-- (owner_node_id), as migration 41 built them:
--
-- 1. owned checklists are allowed again and the 41 guards come back (an owner
--    row has no rows of its own, keeps 'No', and ownership cannot cycle);
-- 2. checklist_command accepts 'submission' again, which creates a Quest: the
--    Page row and its checklist together. Section reviews stay retired;
-- 3. a Quest row's progress is its own Activity progress and it is complete
--    only when its own Setup, Activity and Closure are all complete or N/A; a
--    Quest whose Activity is empty does not count towards progress but still
--    gates Done. Quests nest to any depth.
--
-- Nothing existing changes: no checklist owns one today, so every figure is
-- the same after this migration.

BEGIN;
SET LOCAL lock_timeout = '120s';

CREATE FUNCTION pg_temp.m67_patch(p_sig text,p_old text,p_new text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(p_sig::regprocedure); BEGIN
 IF (length(def)-length(replace(def,p_old,'')))/length(p_old)<>1 THEN
  RAISE EXCEPTION '% no longer has exactly one "%"; update migration 67',p_sig,left(p_old,120); END IF;
 EXECUTE replace(def,p_old,p_new);
END $$;

-- 1. Owned checklists and their guards.
ALTER TABLE public.task_checklists DROP CONSTRAINT m63_no_owned_checklists;
SELECT pg_temp.m67_patch('taskpulse_private.submission_guard()',
 $m$RAISE EXCEPTION 'Sub-mission must own an ordinary empty Page row in the same mission'$m$,
 $m$RAISE EXCEPTION 'A Quest must own an ordinary empty Page row in the same mission'$m$);
SELECT pg_temp.m67_patch('taskpulse_private.submission_guard()',
 $m$RAISE EXCEPTION 'Sub-mission ownership cycle'$m$,
 $m$RAISE EXCEPTION 'A Quest cannot contain itself'$m$);
SELECT pg_temp.m67_patch('taskpulse_private.submission_guard()',
 $m$RAISE EXCEPTION 'Open the Sub-mission checklist to add work'$m$,
 $m$RAISE EXCEPTION 'Open the Quest and add rows to its Setup, Activity or Closure'$m$);
SELECT pg_temp.m67_patch('taskpulse_private.submission_guard()',
 $m$RAISE EXCEPTION 'Sub-mission type and completion follow its owned checklist'$m$,
 $m$RAISE EXCEPTION 'A Quest takes its progress and completion from its own checklist'$m$);
CREATE TRIGGER ab_submission_owner BEFORE INSERT OR UPDATE ON public.task_checklists FOR EACH ROW EXECUTE FUNCTION taskpulse_private.submission_guard();
CREATE TRIGGER ab_submission_node BEFORE INSERT OR UPDATE ON public.checklist_nodes FOR EACH ROW EXECUTE FUNCTION taskpulse_private.submission_guard();

-- 2. 'submission' creates a Quest again.
SELECT pg_temp.m67_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $m$IF p_command IN ('submission','section') THEN RAISE EXCEPTION 'Sub-missions and section reviews were retired; add rows under any row instead' USING ERRCODE='23514'; END IF;$m$,
 $m$IF p_command='section' THEN RAISE EXCEPTION 'Section reviews were retired; an empty section is N/A' USING ERRCODE='23514'; END IF;$m$);
SELECT pg_temp.m67_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $m$RAISE EXCEPTION 'Sub-mission title required'$m$,
 $m$RAISE EXCEPTION 'Quest title required'$m$);
SELECT pg_temp.m67_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $m$RAISE EXCEPTION 'Remove the items inside this Sub-mission first.'$m$,
 $m$RAISE EXCEPTION 'Remove the rows inside this Quest first.'$m$);

-- 3. Rollup: a Quest row is its own checklist's result.
SELECT pg_temp.m67_patch('taskpulse_private.checklist_node_result(uuid,uuid[])',
 $m$t public.tasks; BEGIN$m$,
 $m$t public.tasks; owned uuid; quest jsonb; BEGIN$m$);
SELECT pg_temp.m67_patch('taskpulse_private.checklist_node_result(uuid,uuid[])',
 $m$ FOR child IN SELECT id FROM public.checklist_nodes WHERE parent_node_id=p_node ORDER BY id LOOP$m$,
 $m$ SELECT c.id INTO owned FROM public.task_checklists c WHERE c.owner_node_id=p_node;
 IF owned IS NOT NULL THEN
  quest:=taskpulse_private.checklist_result(owned,p_path||p_node);
  RETURN jsonb_build_object('id',n.id,'progressPercentage',(quest->>'taskProgress')::numeric,
   'isComplete',coalesce((quest->>'isComplete')::boolean,false),
   'applicable',coalesce((quest->'sections'->'activity'->>'applicable')::boolean,false),
   'errors',errors||coalesce(quest->'errors','[]'::jsonb),'nodeProgress',coalesce(quest->'nodeProgress','[]'::jsonb));
 END IF;
 FOR child IN SELECT id FROM public.checklist_nodes WHERE parent_node_id=p_node ORDER BY id LOOP$m$);

COMMIT;
SELECT taskpulse_private.m15_secure();
