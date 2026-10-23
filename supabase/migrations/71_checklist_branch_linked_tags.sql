-- Migration 71: checklist rows linked to a mission (sub-missions) carry that
-- mission's tag and status, so the checklist can open the sub-mission's own
-- page (user report, 23 October 2026: a sub-mission row did not lead to its
-- mission). Read-only change to checklist_branch; visibility is unchanged
-- because the tag is read under the caller's own access.

BEGIN;
SET LOCAL lock_timeout = '120s';

CREATE FUNCTION pg_temp.m71_patch(p_sig text,p_old text,p_new text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(p_sig::regprocedure); BEGIN
 IF (length(def)-length(replace(def,p_old,'')))/length(p_old)<>1 THEN
  RAISE EXCEPTION '% no longer has exactly one "%"; update migration 71',p_sig,left(p_old,120); END IF;
 EXECUTE replace(def,p_old,p_new);
END $$;

SELECT pg_temp.m71_patch('public.checklist_branch(uuid,uuid,uuid,text,integer,integer)',
 $m$'linkedTaskId',n.linked_task_id,$m$,
 $m$'linkedTaskId',n.linked_task_id,'linkedTaskTag',(SELECT lt.task_tag FROM public.tasks lt WHERE lt.id=n.linked_task_id),'linkedTaskStatus',(SELECT lt.status FROM public.tasks lt WHERE lt.id=n.linked_task_id),$m$);

COMMIT;
SELECT taskpulse_private.m15_secure();
