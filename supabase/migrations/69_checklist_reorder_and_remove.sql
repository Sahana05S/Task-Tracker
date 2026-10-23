-- Migration 69: move a checklist row up or down, and remove a row together
-- with the rows under it (user request, 23 October 2026: editing the
-- checklist must be convenient).
--
-- 1. checklist_command 'reorder' {node_id, direction: up|down} swaps a row with
--    its neighbour in the order shown (priority, then position). A row moving
--    past a neighbour of another priority takes that priority, so the move is
--    what the user sees. Positions of that level are renumbered 1..n first.
-- 2. 'delete' accepts with_children=true for a row with rows under it; they go
--    with it (the foreign key cascades; time logs keep their hours and lose
--    only the row tag). A Quest inside must be emptied and removed first, and a
--    reason is still required.

BEGIN;
SET LOCAL lock_timeout = '120s';

CREATE FUNCTION pg_temp.m69_patch(p_sig text,p_old text,p_new text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(p_sig::regprocedure); BEGIN
 IF (length(def)-length(replace(def,p_old,'')))/length(p_old)<>1 THEN
  RAISE EXCEPTION '% no longer has exactly one "%"; update migration 69',p_sig,left(p_old,120); END IF;
 EXECUTE replace(def,p_old,p_new);
END $$;

SELECT pg_temp.m69_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $m$copy_row record; BEGIN$m$,
 $m$copy_row record; neighbour uuid; BEGIN$m$);
SELECT pg_temp.m69_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $m$p_command NOT IN ('create','add','state','edit','map','delete','section','mode','duplicate','submission')$m$,
 $m$p_command NOT IN ('create','add','state','edit','map','delete','section','mode','duplicate','submission','reorder')$m$);
SELECT pg_temp.m69_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $m$IF p_command IN ('state','edit','map','delete','duplicate') THEN$m$,
 $m$IF p_command IN ('state','edit','map','delete','duplicate','reorder') THEN$m$);
SELECT pg_temp.m69_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $m$ELSIF p_command='state' THEN$m$,
 $m$ELSIF p_command='reorder' THEN
   IF p_payload->>'direction' IS NULL OR p_payload->>'direction' NOT IN ('up','down') THEN RAISE EXCEPTION 'Move a row up or down' USING ERRCODE='23514'; END IF;
   UPDATE public.checklist_nodes s SET sort_order=r.position FROM (
     SELECT x.id,(row_number() OVER (ORDER BY x.priority DESC,x.sort_order,x.id))::int AS position FROM public.checklist_nodes x
     WHERE x.checklist_id=c.id AND x.detail_section IS NOT DISTINCT FROM n.detail_section AND x.parent_node_id IS NOT DISTINCT FROM n.parent_node_id) r
    WHERE s.id=r.id AND s.sort_order<>r.position;
   SELECT x.id INTO neighbour FROM public.checklist_nodes x
    WHERE x.checklist_id=c.id AND x.detail_section IS NOT DISTINCT FROM n.detail_section AND x.parent_node_id IS NOT DISTINCT FROM n.parent_node_id
      AND x.sort_order=(SELECT y.sort_order FROM public.checklist_nodes y WHERE y.id=n.id)+CASE p_payload->>'direction' WHEN 'up' THEN -1 ELSE 1 END;
   IF neighbour IS NULL THEN RAISE EXCEPTION 'This row is already at the % of its list',CASE p_payload->>'direction' WHEN 'up' THEN 'top' ELSE 'bottom' END USING ERRCODE='23514'; END IF;
   UPDATE public.checklist_nodes x SET
     sort_order=CASE WHEN x.id=n.id THEN (SELECT z.sort_order FROM public.checklist_nodes z WHERE z.id=neighbour) ELSE (SELECT z.sort_order FROM public.checklist_nodes z WHERE z.id=n.id) END,
     priority=CASE WHEN x.id=n.id THEN (SELECT z.priority FROM public.checklist_nodes z WHERE z.id=neighbour) ELSE x.priority END
    WHERE x.id IN (n.id,neighbour);
  ELSIF p_command='state' THEN$m$);
SELECT pg_temp.m69_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $m$IF change_reason IS NULL OR EXISTS(SELECT 1 FROM public.checklist_nodes WHERE parent_node_id=n.id) THEN RAISE EXCEPTION 'Delete an individual leaf with a reason; preserve or move its children first' USING ERRCODE='23514'; END IF;$m$,
 $m$IF change_reason IS NULL THEN RAISE EXCEPTION 'Give a reason for removing this row' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM public.checklist_nodes WHERE parent_node_id=n.id) AND (p_payload->>'with_children') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'This row has rows under it; remove them with it or move them first' USING ERRCODE='23514'; END IF;
   IF EXISTS(WITH RECURSIVE sub(id) AS (SELECT x.id FROM public.checklist_nodes x WHERE x.parent_node_id=n.id
      UNION SELECT x.id FROM public.checklist_nodes x JOIN sub ON x.parent_node_id=sub.id)
     SELECT 1 FROM public.task_checklists o WHERE o.owner_node_id IN (SELECT id FROM sub)) THEN
    RAISE EXCEPTION 'A Quest is inside this row; empty and remove the Quest first' USING ERRCODE='23514'; END IF;$m$);

COMMIT;
SELECT taskpulse_private.m15_secure();
