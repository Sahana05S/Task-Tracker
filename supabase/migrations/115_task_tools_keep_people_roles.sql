-- ===========================================================================
-- TaskPulse - Task Tools copies keep mission people in their roles
-- (forward only; 3 November 2026)
--
-- Since migration 108 a mission can have zero-share Collaborators
-- (task_assignees.share_units = 0) and Observers (task_reviewers.reviewer_role =
-- 'Observer'). A Task Tools copy (duplicate, weekly, day-count, number-suffix,
-- carryover) passed every assignee and every reviewer to
-- save_task_with_participants. Collaborators survived as zero-share rows, but an
-- Observer came back as an ordinary reviewer (often the copy's Primary), so they
-- were asked to review and blocked Done on the copy.
--
-- 1. task_tools_preview puts only credited assignees and non-observer reviewers
--    through the save, and lists the source's active Collaborators and Observers
--    on each planned item ('collaborators', 'observers'). Support splits and
--    one-per-member copies name their own people and carry neither.
-- 2. task_tools_command adds those Collaborators (zero share) and Observers to
--    each new copy right after the save, the same rows task_people_command (108)
--    writes. A preview made before this migration has no such lists and copies
--    as before.
--
-- Both functions are patched from their live definitions (24/25, then 31, 32,
-- 40, 53 and 55); each fragment must occur exactly once. No scoring, award,
-- share or permission rule changes; existing missions are not touched.
-- ===========================================================================
BEGIN;

CREATE FUNCTION pg_temp.m115_patch(fn regprocedure, frag text, repl text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(fn);
BEGIN
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION '% does not contain this fragment exactly once; update migration 115: %',fn,left(frag,80); END IF;
 EXECUTE replace(def,frag,repl);
END $$;

-- 1. The preview: credited people through the save, the rest listed per item --
SELECT pg_temp.m115_patch('public.task_tools_preview(text,jsonb)',
 $f$pid uuid:=gen_random_uuid();$f$,
 $f$pid uuid:=gen_random_uuid();tool_collaborators uuid[]:=ARRAY[]::uuid[];tool_observers uuid[]:=ARRAY[]::uuid[];$f$);

SELECT pg_temp.m115_patch('public.task_tools_preview(text,jsonb)',
 $f$SELECT user_id,is_primary FROM public.task_assignees WHERE task_id=t.id) raw GROUP BY u) p;$f$,
 $f$SELECT user_id,is_primary FROM public.task_assignees WHERE task_id=t.id AND (share_units IS DISTINCT FROM 0 OR is_primary)) raw GROUP BY u) p;
  SELECT coalesce(array_agg(a.user_id ORDER BY a.user_id),ARRAY[]::uuid[]) INTO tool_collaborators FROM public.task_assignees a JOIN public.users u ON u.id=a.user_id AND u.is_active
   WHERE a.task_id=t.id AND a.share_units=0 AND NOT a.is_primary AND a.user_id IS DISTINCT FROM t.assignee_id;$f$);

SELECT pg_temp.m115_patch('public.task_tools_preview(text,jsonb)',
 $f$UNION SELECT user_id FROM public.task_reviewers WHERE task_id=t.id) p;$f$,
 $f$UNION SELECT user_id FROM public.task_reviewers WHERE task_id=t.id AND reviewer_role<>'Observer') p
   WHERE NOT EXISTS(SELECT 1 FROM public.task_reviewers o WHERE o.task_id=t.id AND o.user_id=p.u AND o.reviewer_role='Observer');
  SELECT coalesce(array_agg(r.user_id ORDER BY r.user_id),ARRAY[]::uuid[]) INTO tool_observers FROM public.task_reviewers r JOIN public.users u ON u.id=r.user_id AND u.is_active
   WHERE r.task_id=t.id AND r.reviewer_role='Observer';$f$);

SELECT pg_temp.m115_patch('public.task_tools_preview(text,jsonb)',
 $f$'reviewers',coalesce(to_jsonb(reviewers),'[]'),$f$,
 $f$'reviewers',coalesce(to_jsonb(reviewers),'[]'),
    'collaborators',CASE WHEN p_command IN ('all_team','support') THEN '[]'::jsonb ELSE to_jsonb(tool_collaborators) END,
    'observers',CASE WHEN p_command IN ('all_team','support') THEN '[]'::jsonb ELSE to_jsonb(tool_observers) END,$f$);

-- 2. The commit: add the same Collaborators and Observers to each copy -------
SELECT pg_temp.m115_patch('public.task_tools_command(uuid,uuid)',
 $f$,assignees,reviewers,shares,NULL,false,operation);$f$,
 $f$,assignees,reviewers,shares,NULL,false,operation);
   INSERT INTO public.task_assignees(task_id,user_id,assignment_role,is_primary,assigned_by,share_units)
    SELECT target,v::uuid,'Collaborator',false,actor,0 FROM jsonb_array_elements_text(coalesce(item->'collaborators','[]'::jsonb)) v
    WHERE NOT EXISTS(SELECT 1 FROM public.task_assignees a WHERE a.task_id=target AND a.user_id=v::uuid)
      AND NOT EXISTS(SELECT 1 FROM public.task_reviewers r WHERE r.task_id=target AND r.user_id=v::uuid);
   INSERT INTO public.task_reviewers(task_id,user_id,reviewer_role,is_primary,assigned_by)
    SELECT target,v::uuid,'Observer',false,actor FROM jsonb_array_elements_text(coalesce(item->'observers','[]'::jsonb)) v
    WHERE NOT EXISTS(SELECT 1 FROM public.task_assignees a WHERE a.task_id=target AND a.user_id=v::uuid)
      AND NOT EXISTS(SELECT 1 FROM public.task_reviewers r WHERE r.task_id=target AND r.user_id=v::uuid);$f$);

COMMIT;
SELECT taskpulse_private.m15_secure();
