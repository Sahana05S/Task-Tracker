-- ===========================================================================
-- TaskPulse - Quest timers (forward only; 5 November 2026)
--
-- User decisions (5 November 2026):
--  * A mission with Quests is timed on its Quests: one running timer per
--    person per Quest; several people can time the same Quest; one person can
--    time several Quests at once. Day totals stay merged (migration 118,
--    member_day_hours), so 09:00-13:00 on one Quest and 11:00-14:00 on another
--    is 5 h for the day.
--  * A Quest's time includes its sub-Quests.
--  * A mission with no Quests keeps its mission timer.
--  * Scoring keeps reading total task hours; nothing here changes it.
--  * Historical timer records are never deleted.
--
-- 1. idx_task_timers_one_running_per_mission (118) becomes
--    idx_task_timers_one_running_per_quest: at most one running server timer
--    per (person, mission, Quest), the mission timer counting as the "no
--    Quest" slot. Offline timers stay outside it (98).
-- 2. start_checklist_item_timer starts Quest timers only (a row that owns a
--    Quest list, migration 41/122); other rows are refused. Starting needs the
--    same right as any timer: the mission's Crew (is_task_worker) or the
--    managing director / a Manager (project_engineer). The Quest is set when
--    the timer row is inserted (guard_item_timer lets the insert through only
--    for the node named in the transaction-local taskpulse.quest_timer), so a
--    Quest timer never collides with the person's mission timer.
-- 3. execution_command 'start_timer' (start_task_timer, the mission timer)
--    is refused while the mission has Quests. Running timers are never
--    touched, and record_offline_timer is unchanged so time recorded on a
--    phone without a connection is never lost.
-- 4. public.quest_time(task): logged seconds per Quest, its own and with its
--    sub-Quests (recursive on owner_node_id with a path array), for those who
--    may read the mission's work (117).
-- 5. timer_session_activity returns node_id and quest_title.
-- 6. execution_command's refusal names the Crew.
--
-- Functions are patched from their live definitions (execution_command 14 +
-- 18 + 98 + 108; guard_item_timer 34); each fragment must occur exactly once.
-- start_checklist_item_timer (34) and timer_session_activity (110 + 117) are
-- replaced whole.
-- ===========================================================================
BEGIN;
SET LOCAL lock_timeout = '120s';

CREATE FUNCTION pg_temp.m123_patch(fn regprocedure, frag text, repl text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(fn);
BEGIN
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION '% does not contain this fragment exactly once; update migration 123: %',fn,left(frag,80); END IF;
 EXECUTE replace(def,frag,repl);
END $$;

-- 1. One running timer per person per Quest -----------------------------------
DROP INDEX public.idx_task_timers_one_running_per_mission;
CREATE UNIQUE INDEX idx_task_timers_one_running_per_quest ON public.task_timers
 (user_id,task_id,coalesce(checklist_node_id,'00000000-0000-0000-0000-000000000000'::uuid))
 WHERE status='Running' AND NOT recorded_offline;

-- 2. The Quest is set on insert, only through start_checklist_item_timer --------
SELECT pg_temp.m123_patch('taskpulse_private.guard_item_timer()',
 $f$IF TG_OP='INSERT' AND NEW.checklist_node_id IS NOT NULL THEN$f$,
 $f$IF TG_OP='INSERT' AND NEW.checklist_node_id IS NOT NULL
    AND NEW.checklist_node_id::text IS DISTINCT FROM nullif(current_setting('taskpulse.quest_timer',true),'') THEN$f$);

-- 3. execution_command: the mission timer only while the mission has no Quests;
--    a Quest timer carries its Quest from the start.
SELECT pg_temp.m123_patch('taskpulse_private.execution_command(text,uuid,uuid,jsonb,bigint,uuid)',
 $f$INSERT INTO public.task_timers(task_id,user_id,notes) VALUES(tid,actor,input_notes) RETURNING id INTO eid;$f$,
 $f$-- 123: a mission with Quests is timed on its Quests.
  IF nullif(current_setting('taskpulse.quest_timer',true),'') IS NULL
     AND EXISTS(SELECT 1 FROM public.task_checklists o WHERE o.task_id=tid AND o.owner_node_id IS NOT NULL) THEN
   RAISE EXCEPTION 'This mission is timed on its Quests; start the timer on a Quest' USING ERRCODE='23514'; END IF;
  INSERT INTO public.task_timers(task_id,user_id,notes,checklist_node_id)
   VALUES(tid,actor,input_notes,nullif(current_setting('taskpulse.quest_timer',true),'')::uuid) RETURNING id INTO eid;$f$);
-- 6. Crew wording.
SELECT pg_temp.m123_patch('taskpulse_private.execution_command(text,uuid,uuid,jsonb,bigint,uuid)',
 $f$'Only the mission''s assignees log time on it; collaborators and observers do not'$f$,
 $f$'Only the mission''s Crew or a manager logs time on it; observers do not'$f$);

-- 2. Quest timers -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_checklist_item_timer(p_node_id uuid,p_payload jsonb,p_operation_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); tid uuid; result jsonb; timer public.task_timers; BEGIN
 SELECT c.task_id INTO tid FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE n.id=p_node_id;
 IF tid IS NULL THEN RAISE EXCEPTION 'Checklist item not found' USING ERRCODE='23514'; END IF;
 -- 123: timers run on Quests (rows that own a Quest list) only.
 IF NOT EXISTS(SELECT 1 FROM public.task_checklists o WHERE o.owner_node_id=p_node_id) THEN
  RAISE EXCEPTION 'Timers run on Quests only; this row is not a Quest' USING ERRCODE='23514'; END IF;
 -- A clear refusal for the same Quest twice; a replay of a start that ran still returns its receipt.
 IF actor IS NOT NULL AND p_operation_id IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM taskpulse_private.command_receipts r WHERE r.actor_id=actor AND r.command='start_timer' AND r.operation_id=p_operation_id)
    AND EXISTS(SELECT 1 FROM public.task_timers x WHERE x.user_id=actor AND x.checklist_node_id=p_node_id AND x.status='Running' AND NOT x.recorded_offline) THEN
  RAISE EXCEPTION 'Your timer is already running on this Quest; stop it first' USING ERRCODE='PT409'; END IF;
 -- Same permission (Crew or a manager), status and idempotency rules as mission timers.
 PERFORM set_config('taskpulse.quest_timer',p_node_id::text,true);
 result:=taskpulse_private.execution_command('start_timer',tid,NULL,p_payload,NULL,p_operation_id);
 PERFORM set_config('taskpulse.quest_timer','',true);
 SELECT * INTO STRICT timer FROM public.task_timers WHERE id=(result->>'timerId')::uuid;
 IF timer.checklist_node_id IS DISTINCT FROM p_node_id THEN
  RAISE EXCEPTION 'Operation key reused with different input' USING ERRCODE='PT409'; END IF;
 RETURN result||jsonb_build_object('nodeId',p_node_id);
END $$;
REVOKE ALL ON FUNCTION public.start_checklist_item_timer(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.start_checklist_item_timer(uuid,jsonb,uuid) TO authenticated;

-- 4. Time per Quest, including sub-Quests -----------------------------------------
CREATE FUNCTION public.quest_time(p_task uuid)
RETURNS TABLE(node_id uuid, owned_checklist_id uuid, checklist_id uuid, parent_quest_id uuid, title text, assignee_id uuid, own_seconds bigint, total_seconds bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
BEGIN
 IF auth.uid() IS NULL OR public.get_user_role() IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_task IS NULL OR NOT EXISTS(SELECT 1 FROM public.tasks t WHERE t.id=p_task AND t.organization_id=public.current_organization()) THEN
  RAISE EXCEPTION 'Mission not found' USING ERRCODE='22023'; END IF;
 IF NOT taskpulse_private.can_read_mission_work(p_task) THEN
  RAISE EXCEPTION 'This checklist is private to the mission''s people' USING ERRCODE='42501'; END IF;
 RETURN QUERY
 WITH RECURSIVE quests AS (
  SELECT n.id AS quest_id,n.checklist_id AS in_list,o.id AS owned_list,n.title::text AS quest_title,n.assignee_id AS owner_id,n.sort_order AS place
  FROM public.checklist_nodes n JOIN public.task_checklists o ON o.owner_node_id=n.id
  WHERE o.task_id=p_task),
 lists(quest_id,list_id,path) AS (
  SELECT q.quest_id,q.owned_list,ARRAY[q.owned_list] FROM quests q
  UNION ALL
  SELECT l.quest_id,s.owned_list,l.path||s.owned_list
  FROM lists l JOIN quests s ON s.in_list=l.list_id
  WHERE NOT s.owned_list=ANY(l.path)),
 secs AS (
  SELECT g.checklist_node_id AS on_node,sum(g.hours_worked)*3600 AS s
  FROM public.daily_task_logs g
  WHERE g.task_id=p_task AND g.reversed_at IS NULL AND g.checklist_node_id IS NOT NULL
  GROUP BY g.checklist_node_id)
 SELECT q.quest_id,q.owned_list,q.in_list,
  (SELECT p.owner_node_id FROM public.task_checklists p WHERE p.id=q.in_list),
  q.quest_title,q.owner_id,
  coalesce(round((SELECT x.s FROM secs x WHERE x.on_node=q.quest_id)),0)::bigint,
  coalesce(round((SELECT sum(x.s) FROM secs x WHERE x.on_node=q.quest_id OR x.on_node IN (
    SELECT m.id FROM public.checklist_nodes m JOIN lists l ON l.list_id=m.checklist_id WHERE l.quest_id=q.quest_id))),0)::bigint
 FROM quests q
 ORDER BY q.place,q.quest_title,q.quest_id;
END $$;
COMMENT ON FUNCTION public.quest_time(uuid) IS
 'Logged seconds per Quest of a mission: own_seconds on the Quest row, total_seconds with everything inside it and its sub-Quests (migration 123).';
REVOKE ALL ON FUNCTION public.quest_time(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.quest_time(uuid) TO authenticated;

-- 5. Sessions name their Quest (body: 110, patched by 117) ------------------------
DROP FUNCTION public.timer_session_activity(uuid,integer);
CREATE FUNCTION public.timer_session_activity(p_task uuid, p_limit integer DEFAULT 30)
RETURNS TABLE(timer_id uuid, user_id uuid, started_at timestamptz, stopped_at timestamptz, hours numeric, notes text, events jsonb,
 node_id uuid, quest_title text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  me uuid := auth.uid();
  caller public.user_role := public.get_user_role();
  org uuid := public.current_organization();
  manager boolean;
  lim integer := least(greatest(coalesce(p_limit, 30), 1), 100);
BEGIN
  IF me IS NULL OR caller IS NULL OR org IS NULL THEN
    RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE = '42501';
  END IF;
  IF p_task IS NULL OR NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = p_task AND t.organization_id = org) THEN
    RAISE EXCEPTION 'Mission not found' USING ERRCODE = '22023';
  END IF;
  manager := caller IN ('managing_director', 'project_engineer');
  IF NOT taskpulse_private.can_read_mission_work(p_task) THEN
    RAISE EXCEPTION 'This checklist is private to the mission''s people' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT tm.id, tm.user_id, tm.started_at, tm.stopped_at, round(tm.elapsed_seconds / 3600.0, 2), tm.notes,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'at', e.occurred_at, 'action', e.command, 'recordKind', e.table_name,
          'nodeId', e.event_node, 'nodeTitle', n.title,
          'state', e.protected_changes ->> 'state', 'reason', e.protected_changes ->> 'reason')
        ORDER BY e.occurred_at, e.id)
      FROM (
        SELECT a.id, a.occurred_at, a.command, a.table_name, a.protected_changes,
          taskpulse_private.activity_uuid(a.protected_changes ->> 'node_id') AS event_node
        FROM taskpulse_private.audit_events a
        WHERE a.organization_id = org AND a.actor_id = tm.user_id
          AND a.occurred_at >= tm.started_at AND a.occurred_at <= tm.stopped_at
          AND a.command NOT IN ('INSERT', 'UPDATE', 'DELETE') AND a.command NOT LIKE '%refresh%'
          AND a.table_name NOT IN ('task_timers', 'daily_task_logs')
          AND ((a.table_name = 'tasks' AND a.row_id = p_task)
            OR (a.table_name = 'task_checklists' AND EXISTS (
              SELECT 1 FROM public.task_checklists c WHERE c.id = a.row_id AND c.task_id = p_task))
            OR taskpulse_private.activity_uuid(coalesce(a.protected_changes -> 'task_id' ->> 'after',
              a.protected_changes -> 'task_id' ->> 'before', a.protected_changes ->> 'task_id')) = p_task)
        ORDER BY a.occurred_at, a.id
        LIMIT 100) e
      LEFT JOIN public.checklist_nodes n ON n.id = e.event_node), '[]'::jsonb),
    tm.checklist_node_id, qn.title::text
  FROM public.task_timers tm
  LEFT JOIN public.checklist_nodes qn ON qn.id = tm.checklist_node_id
  WHERE tm.task_id = p_task AND tm.organization_id = org
    AND tm.status = 'Stopped' AND tm.stopped_at IS NOT NULL
    AND (manager OR tm.user_id = me)
  ORDER BY tm.started_at DESC, tm.id DESC
  LIMIT lim;
END $$;
REVOKE ALL ON FUNCTION public.timer_session_activity(uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.timer_session_activity(uuid, integer) TO authenticated;

COMMIT;
SELECT taskpulse_private.m15_secure();
