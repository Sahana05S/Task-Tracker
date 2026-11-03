-- 108: mission people - Owner, Collaborators and Observers (Workstream A of the
-- 3 November 2026 update plan, docs/UPDATE-PLAN-2026-11.md section 3).
--
-- The values already existed without meaning; this gives them one:
--  * Owner        task_assignees.assignment_role='Owner', is_primary (= tasks.assignee_id).
--  * Collaborator a task_assignees row with share_units = 0. Earns no credit and,
--                 per the user (D-A3, 3 November 2026), does not log time. Rows
--                 stored as 'Collaborator' WITH shares (every non-first assignee
--                 saved by set_task_participants) are untouched and stay assignees.
--  * Observer     task_reviewers.reviewer_role='Observer'. Sees the mission and its
--                 notifications; cannot tick, edit or review, and never blocks Done.
--
-- Changes:
--  1. taskpulse_private.is_task_worker(task,user) (and public.is_task_worker(task)
--     for RLS): an assignee row with shares, or the legacy single assignee.
--     Used by execution_command (logs, timers and both offline timer RPCs, which
--     stop through it) and the m01_own_work policies.
--  2. assert_checklist_done and task_command('review') ignore Observer rows.
--  3. task_details_command_m05: the mission's Owner, assignees and Collaborators
--     may save details, relations and link labels (D-A2); initialization stays
--     with managers.
--  4. set_task_participants keeps zero-share Collaborators and Observers that the
--     edit form does not list; save_task_with_participants compares only the
--     credited assignees and the reviewers, so a plain edit neither resets
--     custom shares nor drops these people.
--  5. submission_create copies only credited assignees and non-observer reviewers.
--  6. Notifications word a collaborator or observer addition as such.
--  7. New RPC task_people_command: add/remove collaborator, add/remove observer,
--     transfer owner. Managing director, project engineers and the current Owner
--     (D-A4). Audited, idempotent through command receipts, lifecycle-versioned;
--     participant_version does not move because no share changes.
--
-- Functions 2-6 are patched in place from their live definitions at 106
-- (pg_get_functiondef); each patch must match exactly once.

BEGIN;

CREATE FUNCTION pg_temp.m108_patch(fn regprocedure, frag text, repl text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(fn);
BEGIN
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION '% does not contain this fragment exactly once; update migration 108: %',fn,left(frag,80); END IF;
 EXECUTE replace(def,frag,repl);
END $$;

-- 1. Who may log time on a mission ---------------------------------------
CREATE FUNCTION taskpulse_private.is_task_worker(p_task uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p_user IS NOT NULL AND EXISTS(SELECT 1 FROM public.tasks t WHERE t.id=p_task AND
  (EXISTS(SELECT 1 FROM public.task_assignees a WHERE a.task_id=t.id AND a.user_id=p_user
    AND (a.share_units IS NULL OR a.share_units>0)) OR
   (t.participant_credit_mode='legacy' AND t.assignee_id=p_user)));
$$;
REVOKE ALL ON FUNCTION taskpulse_private.is_task_worker(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- RLS runs as the caller, who has no usage on taskpulse_private.
CREATE FUNCTION public.is_task_worker(p_task_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.get_user_role() IS NOT NULL AND taskpulse_private.is_task_worker(p_task_id,auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_task_worker(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.is_task_worker(uuid) TO authenticated;

SELECT pg_temp.m108_patch('taskpulse_private.execution_command(text,uuid,uuid,jsonb,bigint,uuid)',
 $f$IF NOT(public.is_task_assignee(tid) OR role IN ('managing_director','project_engineer') OR$f$,
 $f$IF NOT(taskpulse_private.is_task_worker(tid,actor) OR role IN ('managing_director','project_engineer') OR$f$);
SELECT pg_temp.m108_patch('taskpulse_private.execution_command(text,uuid,uuid,jsonb,bigint,uuid)',
 $f$RAISE EXCEPTION 'Task assignment or management permission required' USING ERRCODE='42501'; END IF;$f$,
 $f$RAISE EXCEPTION 'Only the mission''s assignees log time on it; collaborators and observers do not' USING ERRCODE='42501'; END IF;$f$);

DROP POLICY m01_own_work ON public.daily_task_logs;
DROP POLICY m01_own_work ON public.task_timers;
CREATE POLICY m01_own_work ON public.daily_task_logs FOR ALL TO authenticated
 USING (user_id=auth.uid() AND public.is_task_worker(task_id)) WITH CHECK (user_id=auth.uid() AND public.is_task_worker(task_id));
CREATE POLICY m01_own_work ON public.task_timers FOR ALL TO authenticated
 USING (user_id=auth.uid() AND public.is_task_worker(task_id)) WITH CHECK (user_id=auth.uid() AND public.is_task_worker(task_id));

-- 2. Observers neither review nor block Done -------------------------------
SELECT pg_temp.m108_patch('taskpulse_private.assert_checklist_done(uuid)',
 $f$WHERE r.task_id=p_task AND (NOT coalesce(u.is_active,false)$f$,
 $f$WHERE r.task_id=p_task AND r.reviewer_role<>'Observer' AND (NOT coalesce(u.is_active,false)$f$);
SELECT pg_temp.m108_patch('taskpulse_private.task_command(uuid,text,jsonb,bigint,uuid)',
 $f$NOT EXISTS(SELECT 1 FROM public.task_reviewers WHERE task_id=p_task AND user_id=actor) THEN$f$,
 $f$NOT EXISTS(SELECT 1 FROM public.task_reviewers WHERE task_id=p_task AND user_id=actor AND reviewer_role<>'Observer') THEN$f$);

-- 3. The mission's people edit its details (D-A2) ---------------------------
SELECT pg_temp.m108_patch('public.task_details_command_m05(uuid,text,jsonb,bigint,uuid)',
 $f$IF role IS NULL OR role NOT IN ('managing_director','project_engineer') THEN RAISE EXCEPTION 'Active task manager required' USING ERRCODE='42501'; END IF;$f$,
 $f$IF role IS NULL OR NOT(role IN ('managing_director','project_engineer') OR
  (p_command IN ('save','relation','rename_link') AND public.is_task_assignee(p_task))) THEN
  RAISE EXCEPTION 'A manager or one of the mission''s people is required' USING ERRCODE='42501'; END IF;$f$);

-- 4. The edit form keeps collaborators and observers -----------------------
SELECT pg_temp.m108_patch('public.set_task_participants(uuid,uuid[],uuid[],integer[],bigint,boolean)',
 $f$DELETE FROM public.task_assignees WHERE task_id=p_task_id AND NOT(user_id=ANY(p_assignees));$f$,
 $f$DELETE FROM public.task_assignees WHERE task_id=p_task_id AND NOT(user_id=ANY(p_assignees))
    AND NOT(share_units=0 AND NOT is_primary AND NOT(user_id=ANY(p_reviewers)));$f$);
SELECT pg_temp.m108_patch('public.set_task_participants(uuid,uuid[],uuid[],integer[],bigint,boolean)',
 $f$DELETE FROM public.task_reviewers WHERE task_id=p_task_id AND NOT(user_id=ANY(p_reviewers));$f$,
 $f$DELETE FROM public.task_reviewers WHERE task_id=p_task_id AND NOT(user_id=ANY(p_reviewers))
    AND NOT(reviewer_role='Observer' AND NOT(user_id=ANY(p_assignees)));$f$);
SELECT pg_temp.m108_patch('public.save_task_with_participants(uuid,jsonb,uuid[],uuid[],integer[],bigint,boolean,uuid)',
 $f$(SELECT user_id x FROM public.task_assignees WHERE task_id=tid UNION SELECT t.assignee_id)$f$,
 $f$(SELECT user_id x FROM public.task_assignees WHERE task_id=tid AND share_units IS DISTINCT FROM 0 UNION SELECT t.assignee_id)$f$);
SELECT pg_temp.m108_patch('public.save_task_with_participants(uuid,jsonb,uuid[],uuid[],integer[],bigint,boolean,uuid)',
 $f$(SELECT user_id x FROM public.task_reviewers WHERE task_id=tid UNION$f$,
 $f$(SELECT user_id x FROM public.task_reviewers WHERE task_id=tid AND reviewer_role<>'Observer' UNION$f$);
SELECT pg_temp.m108_patch('public.save_task_with_participants(uuid,jsonb,uuid[],uuid[],integer[],bigint,boolean,uuid)',
 $f$(SELECT array_agg(user_id ORDER BY user_id) FROM public.task_assignees WHERE task_id=tid) THEN$f$,
 $f$(SELECT array_agg(user_id ORDER BY user_id) FROM public.task_assignees WHERE task_id=tid AND share_units IS DISTINCT FROM 0) THEN$f$);

-- 5. Sub-missions inherit the credited people only -------------------------
SELECT pg_temp.m108_patch('public.submission_create(uuid,uuid,text,uuid,jsonb,bigint,uuid)',
 $f$FROM public.task_assignees a WHERE a.task_id=parent.id),$f$,
 $f$FROM public.task_assignees a WHERE a.task_id=parent.id AND (a.share_units IS NULL OR a.share_units>0)),$f$);
SELECT pg_temp.m108_patch('public.submission_create(uuid,uuid,text,uuid,jsonb,bigint,uuid)',
 $f$FROM public.task_reviewers r WHERE r.task_id=parent.id),'{}');$f$,
 $f$FROM public.task_reviewers r WHERE r.task_id=parent.id AND r.reviewer_role<>'Observer'),'{}');$f$);

-- 6. Notification wording ---------------------------------------------------
SELECT pg_temp.m108_patch('taskpulse_private.notify_task_participant()',
 $f$format('New mission %s: %s',t.task_tag,t.title),$f$,
 $f$format(CASE WHEN to_jsonb(NEW)->>'share_units'='0' THEN 'Collaborating on %s: %s' ELSE 'New mission %s: %s' END,t.task_tag,t.title),$f$);
SELECT pg_temp.m108_patch('taskpulse_private.notify_task_participant()',
 $f$format('Review %s: %s',t.task_tag,t.title),$f$,
 $f$format(CASE WHEN to_jsonb(NEW)->>'reviewer_role'='Observer' THEN 'Observing %s: %s' ELSE 'Review %s: %s' END,t.task_tag,t.title),$f$);
SELECT pg_temp.m108_patch('taskpulse_private.notify_task_participant()',
 $f$CASE WHEN actor_name IS NOT NULL THEN format('%s made you a reviewer.',actor_name) ELSE 'You are a reviewer.' END,$f$,
 $f$CASE WHEN to_jsonb(NEW)->>'reviewer_role'='Observer'
    THEN CASE WHEN actor_name IS NOT NULL THEN format('%s added you as an observer.',actor_name) ELSE 'You are an observer.' END
    ELSE CASE WHEN actor_name IS NOT NULL THEN format('%s made you a reviewer.',actor_name) ELSE 'You are a reviewer.' END END,$f$);

-- 7. Managing a mission's people -------------------------------------------
CREATE FUNCTION taskpulse_private.task_people_snapshot(p_task uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object(
  'owner',(SELECT assignee_id FROM public.tasks WHERE id=p_task),
  'assignees',coalesce((SELECT jsonb_agg(jsonb_build_object('user',a.user_id,'role',a.assignment_role,'primary',a.is_primary,'shares',a.share_units)
    ORDER BY a.is_primary DESC,a.user_id) FROM public.task_assignees a WHERE a.task_id=p_task),'[]'::jsonb),
  'reviewers',coalesce((SELECT jsonb_agg(jsonb_build_object('user',r.user_id,'role',r.reviewer_role)
    ORDER BY r.is_primary DESC,r.user_id) FROM public.task_reviewers r WHERE r.task_id=p_task),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION taskpulse_private.task_people_snapshot(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.task_people_command(p_task uuid, p_command text, p_payload jsonb, p_expected_version bigint, p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); role public.user_role; t public.tasks; receipt taskpulse_private.command_receipts;
 request jsonb; target uuid; before_people jsonb; result jsonb; BEGIN
 SELECT u.role INTO role FROM public.users u WHERE u.id=actor AND u.is_active FOR SHARE;
 IF actor IS NULL OR role IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_operation IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_payload-ARRAY['user_id']<>'{}'
  OR p_command IS NULL OR p_command NOT IN ('add_collaborator','remove_collaborator','add_observer','remove_observer','transfer_owner') THEN
  RAISE EXCEPTION 'Invalid people command' USING ERRCODE='23514'; END IF;
 IF coalesce(p_payload->>'user_id','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
  RAISE EXCEPTION 'Choose a member' USING ERRCODE='23514'; END IF;
 target:=(p_payload->>'user_id')::uuid;
 request:=jsonb_build_array(p_task,p_command,p_payload,p_expected_version);
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||'task_people_command'||p_operation::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts
  WHERE actor_id=actor AND command='task_people_command' AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT * INTO t FROM public.tasks WHERE id=p_task FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mission not found' USING ERRCODE='23514'; END IF;
 -- D-A4: the managing director, project engineers and the mission's current Owner.
 IF NOT(role IN ('managing_director','project_engineer') OR t.assignee_id=actor) THEN
  RAISE EXCEPTION 'Only a manager or the mission''s owner changes its people' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR p_expected_version<>t.lifecycle_version THEN
  RAISE EXCEPTION 'The mission changed; reload it and try again' USING ERRCODE='PT409'; END IF;
 IF t.archived_effective_date IS NOT NULL OR t.status IN ('Done','Discarded') THEN
  RAISE EXCEPTION 'Reopen the mission before changing its people' USING ERRCODE='23514'; END IF;
 PERFORM taskpulse_private.assert_task_open_date(p_task,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
 before_people:=taskpulse_private.task_people_snapshot(p_task);

 IF p_command IN ('add_collaborator','add_observer') THEN
  IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=target AND u.is_active) THEN
   RAISE EXCEPTION 'Choose an active member' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.task_assignees a WHERE a.task_id=p_task AND a.user_id=target) OR t.assignee_id=target THEN
   RAISE EXCEPTION 'This member already works on the mission' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.task_reviewers r WHERE r.task_id=p_task AND r.user_id=target) THEN
   RAISE EXCEPTION 'This member already reviews or observes the mission' USING ERRCODE='23514'; END IF;
  IF p_command='add_collaborator' THEN
   INSERT INTO public.task_assignees(task_id,user_id,assignment_role,is_primary,assigned_by,share_units)
   VALUES(p_task,target,'Collaborator',false,actor,0);
  ELSE
   INSERT INTO public.task_reviewers(task_id,user_id,reviewer_role,is_primary,assigned_by)
   VALUES(p_task,target,'Observer',false,actor);
  END IF;
 ELSIF p_command='remove_collaborator' THEN
  DELETE FROM public.task_assignees WHERE task_id=p_task AND user_id=target AND share_units=0 AND NOT is_primary;
  IF NOT FOUND THEN RAISE EXCEPTION 'This member is not a collaborator on the mission' USING ERRCODE='23514'; END IF;
 ELSIF p_command='remove_observer' THEN
  DELETE FROM public.task_reviewers WHERE task_id=p_task AND user_id=target AND reviewer_role='Observer';
  IF NOT FOUND THEN RAISE EXCEPTION 'This member is not an observer of the mission' USING ERRCODE='23514'; END IF;
 ELSE
  IF t.participant_credit_mode<>'configured' THEN
   RAISE EXCEPTION 'Review this mission''s legacy participants before transferring ownership' USING ERRCODE='23514'; END IF;
  IF t.assignee_id=target THEN RAISE EXCEPTION 'This member already owns the mission' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.task_assignees a WHERE a.task_id=p_task AND a.user_id=target AND a.share_units>0)
   OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=target AND u.is_active) THEN
   RAISE EXCEPTION 'The new owner must be an active assignee with a share; give a collaborator a share first' USING ERRCODE='23514'; END IF;
  -- Shares stay as they are, so earned credit and participant_version do not move.
  UPDATE public.task_assignees SET is_primary=false,assignment_role='Collaborator' WHERE task_id=p_task AND is_primary;
  UPDATE public.task_assignees SET is_primary=true,assignment_role='Owner' WHERE task_id=p_task AND user_id=target;
  UPDATE public.tasks SET assignee_id=target WHERE id=p_task;
 END IF;

 UPDATE public.tasks SET lifecycle_version=lifecycle_version+1 WHERE id=p_task;
 result:=jsonb_build_object('taskId',p_task,'taskTag',t.task_tag,'command',p_command,'userId',target,'version',t.lifecycle_version+1);
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(actor,role::text,'task_people_'||p_command,'tasks',p_task,ARRAY['participants'],
  jsonb_build_object('user_id',target,'before',before_people,'after',taskpulse_private.task_people_snapshot(p_task)),p_operation);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,'task_people_command',p_operation,request,p_task,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.task_people_command(uuid,text,jsonb,bigint,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.task_people_command(uuid,text,jsonb,bigint,uuid) TO authenticated;

SELECT taskpulse_private.m15_secure();
COMMIT;
