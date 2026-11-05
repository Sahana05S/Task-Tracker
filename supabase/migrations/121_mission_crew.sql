-- ===========================================================================
-- TaskPulse - Mission Crew: everyone on a mission is Crew, with equal shares
-- (forward only; 5 November 2026)
--
-- User decisions (5 November 2026):
--  * Everyone on a mission is Crew. All Crew log time, mark Done and share the
--    credit equally; the share boxes go. Zero-share Collaborators (108) become
--    ordinary Crew. There is no Mission Lead and no ownership transfer.
--  * Mission settings and Crew management belong to the managing director and
--    Managers (role project_engineer until the role rename). Observers stay
--    view-only and are chosen by the managing director, Managers and Crew.
--
-- 1. taskpulse_private.is_task_worker(task,user): any task_assignees row, or the
--    legacy single assignee. public.is_task_worker (RLS) follows it, so
--    execution_command, the m01_own_work policies and the Done check of 117
--    accept every Crew member.
-- 2. taskpulse_private.crew_equal_split(task): sets every Crew row to the equal
--    split set_task_participants has always used (1,000,000 / n, the remainder
--    to the first rows by user id) and, when any share moved, advances
--    participant_version so the new split is captured as a new participant
--    version. Credit already earned stays with the version it was earned under.
-- 3. set_task_participants and save_task_with_participants ignore passed shares
--    and always split equally. The primary row stays internally (the first Crew
--    member, no extra power) because check_participants requires it. The 108
--    exceptions for zero-share rows are removed: the edit form lists the whole
--    Crew, so a member left out of it leaves the mission.
-- 4. task_people_command: add_crew / remove_crew (add_collaborator and
--    remove_collaborator stay as aliases) by the managing director and Managers;
--    each re-splits equally. add_observer / remove_observer by the managing
--    director, Managers and Crew. transfer_owner is retired.
-- 5. task_command: the Done refusal names Crew instead of collaborators.
-- 6. Task Tools copies: the whole Crew goes through the save with equal shares;
--    no zero-share collaborators are added (a preview made before 121 that
--    still lists some adds them as Crew). Observers are kept as in 115.
-- 7. One-time rebalance: every open configured mission (not Done, Discarded or
--    archived) whose shares are not the equal split is re-split through (2).
--    Done and Discarded missions keep their recorded shares.
--
-- Functions are patched from their live definitions (set_task_participants 12
-- + 108, save_task_with_participants 17 + 53 + 108, task_command through 117,
-- task_tools_preview / task_tools_command through 115); each fragment must occur
-- exactly once. task_people_command (108 + 117) is replaced whole: this lane
-- owns it.
-- ===========================================================================
BEGIN;

CREATE FUNCTION pg_temp.m121_patch(fn regprocedure, frag text, repl text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(fn);
BEGIN
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION '% does not contain this fragment exactly once; update migration 121: %',fn,left(frag,80); END IF;
 EXECUTE replace(def,frag,repl);
END $$;

-- 1. Every Crew member works on the mission --------------------------------
CREATE OR REPLACE FUNCTION taskpulse_private.is_task_worker(p_task uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p_user IS NOT NULL AND EXISTS(SELECT 1 FROM public.tasks t WHERE t.id=p_task AND
  (EXISTS(SELECT 1 FROM public.task_assignees a WHERE a.task_id=t.id AND a.user_id=p_user) OR
   (t.participant_credit_mode='legacy' AND t.assignee_id=p_user)));
$$;
REVOKE ALL ON FUNCTION taskpulse_private.is_task_worker(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- 2. The equal split ---------------------------------------------------------
CREATE FUNCTION taskpulse_private.crew_equal_split(p_task uuid) RETURNS boolean
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE n integer; moved integer; BEGIN
 SELECT count(*) INTO n FROM public.task_assignees WHERE task_id=p_task;
 IF n=0 THEN RETURN false; END IF;
 WITH want AS (
  SELECT a.user_id,1000000/n+CASE WHEN row_number() OVER (ORDER BY a.user_id)<=1000000%n THEN 1 ELSE 0 END AS units
  FROM public.task_assignees a WHERE a.task_id=p_task)
 UPDATE public.task_assignees a SET share_units=w.units FROM want w
  WHERE a.task_id=p_task AND a.user_id=w.user_id AND a.share_units IS DISTINCT FROM w.units;
 GET DIAGNOSTICS moved=ROW_COUNT;
 IF moved>0 THEN
  UPDATE public.tasks SET participant_version=participant_version+1 WHERE id=p_task;
 END IF;
 RETURN moved>0;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.crew_equal_split(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- 3. The edit form: shares are always equal; the listed Crew is the Crew ----
SELECT pg_temp.m121_patch('public.set_task_participants(uuid,uuid[],uuid[],integer[],bigint,boolean)',
 $f$SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task_id FOR UPDATE;$f$,
 $f$SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task_id FOR UPDATE;
  p_share_units:=NULL;  -- 121: Crew share equally; passed shares are ignored$f$);
SELECT pg_temp.m121_patch('public.set_task_participants(uuid,uuid[],uuid[],integer[],bigint,boolean)',
 $f$AND NOT(share_units=0 AND NOT is_primary AND NOT(user_id=ANY(p_reviewers)))$f$,
 $f$$f$);

SELECT pg_temp.m121_patch('public.save_task_with_participants(uuid,jsonb,uuid[],uuid[],integer[],bigint,boolean,uuid)',
 $f$PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));$f$,
 $f$PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 p_share_units:=NULL;  -- 121: Crew share equally; passed shares are ignored$f$);
SELECT pg_temp.m121_patch('public.save_task_with_participants(uuid,jsonb,uuid[],uuid[],integer[],bigint,boolean,uuid)',
 $f$(SELECT user_id x FROM public.task_assignees WHERE task_id=tid AND share_units IS DISTINCT FROM 0 UNION SELECT t.assignee_id)$f$,
 $f$(SELECT user_id x FROM public.task_assignees WHERE task_id=tid UNION SELECT t.assignee_id)$f$);
-- An unchanged Crew keeps its (equal) shares rather than resetting them.
SELECT pg_temp.m121_patch('public.save_task_with_participants(uuid,jsonb,uuid[],uuid[],integer[],bigint,boolean,uuid)',
 $f$(SELECT array_agg(user_id ORDER BY user_id) FROM public.task_assignees WHERE task_id=tid AND share_units IS DISTINCT FROM 0) THEN$f$,
 $f$(SELECT array_agg(user_id ORDER BY user_id) FROM public.task_assignees WHERE task_id=tid) THEN$f$);

-- 4. Managing the Crew and its observers -------------------------------------
CREATE OR REPLACE FUNCTION public.task_people_command(p_task uuid, p_command text, p_payload jsonb, p_expected_version bigint, p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); role public.user_role; t public.tasks; receipt taskpulse_private.command_receipts;
 request jsonb; target uuid; before_people jsonb; result jsonb; cmd text; lead uuid; BEGIN
 SELECT u.role INTO role FROM public.users u WHERE u.id=actor AND u.is_active FOR SHARE;
 IF actor IS NULL OR role IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_command='transfer_owner' THEN
  RAISE EXCEPTION 'Missions have no owner any more; everyone on a mission is Crew' USING ERRCODE='23514'; END IF;
 IF p_operation IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_payload-ARRAY['user_id']<>'{}'
  OR p_command IS NULL OR p_command NOT IN ('add_crew','remove_crew','add_collaborator','remove_collaborator','add_observer','remove_observer') THEN
  RAISE EXCEPTION 'Invalid people command' USING ERRCODE='23514'; END IF;
 -- add_collaborator / remove_collaborator are the 108 names of the Crew commands.
 cmd:=CASE p_command WHEN 'add_collaborator' THEN 'add_crew' WHEN 'remove_collaborator' THEN 'remove_crew' ELSE p_command END;
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
 IF cmd IN ('add_observer','remove_observer') THEN
  -- The managing director, Managers and the mission's Crew choose observers.
  IF NOT(role IN ('managing_director','project_engineer') OR taskpulse_private.is_task_worker(p_task,actor)) THEN
   RAISE EXCEPTION 'Only the managing director, a manager or the mission''s crew choose observers' USING ERRCODE='42501'; END IF;
 ELSIF role NOT IN ('managing_director','project_engineer') THEN
  RAISE EXCEPTION 'Only the managing director or a manager changes a mission''s crew' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR p_expected_version<>t.lifecycle_version THEN
  RAISE EXCEPTION 'The mission changed; reload it and try again' USING ERRCODE='PT409'; END IF;
 IF t.archived_effective_date IS NOT NULL OR t.status IN ('Done','Discarded') THEN
  RAISE EXCEPTION 'Reopen the mission before changing its people' USING ERRCODE='23514'; END IF;
 PERFORM taskpulse_private.assert_task_open_date(p_task,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
 IF cmd IN ('add_crew','remove_crew') AND t.participant_credit_mode<>'configured' THEN
  RAISE EXCEPTION 'Review this mission''s legacy participants in Edit before changing its crew' USING ERRCODE='23514'; END IF;
 before_people:=taskpulse_private.task_people_snapshot(p_task);

 IF cmd IN ('add_crew','add_observer') THEN
  IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=target AND u.is_active) THEN
   RAISE EXCEPTION 'Choose an active member' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.task_assignees a WHERE a.task_id=p_task AND a.user_id=target) OR t.assignee_id=target THEN
   RAISE EXCEPTION 'This member is already on the mission''s crew' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.task_reviewers r WHERE r.task_id=p_task AND r.user_id=target) THEN
   RAISE EXCEPTION 'This member already reviews or observes the mission' USING ERRCODE='23514'; END IF;
  IF cmd='add_crew' THEN
   INSERT INTO public.task_assignees(task_id,user_id,assignment_role,is_primary,assigned_by,share_units)
   VALUES(p_task,target,'Collaborator',false,actor,0);
   PERFORM taskpulse_private.crew_equal_split(p_task);
  ELSE
   INSERT INTO public.task_reviewers(task_id,user_id,reviewer_role,is_primary,assigned_by)
   VALUES(p_task,target,'Observer',false,actor);
  END IF;
 ELSIF cmd='remove_crew' THEN
  IF NOT EXISTS(SELECT 1 FROM public.task_assignees a WHERE a.task_id=p_task AND a.user_id=target) THEN
   RAISE EXCEPTION 'This member is not on the mission''s crew' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.task_assignees a WHERE a.task_id=p_task AND a.user_id<>target) THEN
   RAISE EXCEPTION 'A mission needs at least one crew member' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.task_timers x WHERE x.task_id=p_task AND x.user_id=target AND x.status='Running') THEN
   RAISE EXCEPTION 'This member has a running timer on the mission; stop it first' USING ERRCODE='23514'; END IF;
  DELETE FROM public.task_assignees WHERE task_id=p_task AND user_id=target;
  IF t.assignee_id=target THEN
   -- The internal primary row passes to the next Crew member; it carries no power.
   SELECT a.user_id INTO lead FROM public.task_assignees a WHERE a.task_id=p_task ORDER BY a.user_id LIMIT 1;
   UPDATE public.task_assignees SET is_primary=true,assignment_role='Owner' WHERE task_id=p_task AND user_id=lead;
   UPDATE public.tasks SET assignee_id=lead WHERE id=p_task;
  END IF;
  IF NOT taskpulse_private.crew_equal_split(p_task) THEN
   UPDATE public.tasks SET participant_version=participant_version+1 WHERE id=p_task;
  END IF;
 ELSE
  DELETE FROM public.task_reviewers WHERE task_id=p_task AND user_id=target AND reviewer_role='Observer';
  IF NOT FOUND THEN RAISE EXCEPTION 'This member is not an observer of the mission' USING ERRCODE='23514'; END IF;
 END IF;

 UPDATE public.tasks SET lifecycle_version=lifecycle_version+1 WHERE id=p_task;
 result:=jsonb_build_object('taskId',p_task,'taskTag',t.task_tag,'command',p_command,'userId',target,'version',t.lifecycle_version+1);
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(actor,role::text,'task_people_'||cmd,'tasks',p_task,ARRAY['participants'],
  jsonb_build_object('user_id',target,'before',before_people,'after',taskpulse_private.task_people_snapshot(p_task)),p_operation);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,'task_people_command',p_operation,request,p_task,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.task_people_command(uuid,text,jsonb,bigint,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.task_people_command(uuid,text,jsonb,bigint,uuid) TO authenticated;

-- 5. Done: every Crew member or a manager --------------------------------------
SELECT pg_temp.m121_patch('taskpulse_private.task_command(uuid,text,jsonb,bigint,uuid)',
 $f$'Collaborators cannot mark the mission Done; ask its owner or an assignee'$f$,
 $f$'Only the mission''s crew or a manager marks it Done'$f$);

-- 6. Task Tools copies: the whole Crew, equal shares ---------------------------
SELECT pg_temp.m121_patch('public.task_tools_preview(text,jsonb)',
 $f$SELECT user_id,is_primary FROM public.task_assignees WHERE task_id=t.id AND (share_units IS DISTINCT FROM 0 OR is_primary)) raw GROUP BY u) p;$f$,
 $f$SELECT user_id,is_primary FROM public.task_assignees WHERE task_id=t.id) raw GROUP BY u) p;$f$);
SELECT pg_temp.m121_patch('public.task_tools_preview(text,jsonb)',
 $f$SELECT array_agg(a.share_units ORDER BY x.n) INTO shares FROM unnest(assignees) WITH ORDINALITY x(uid,n) LEFT JOIN public.task_assignees a ON a.task_id=t.id AND a.user_id=x.uid;$f$,
 $f$SELECT array_agg(1000000/cardinality(assignees)+CASE WHEN (SELECT count(*) FROM unnest(assignees) y WHERE y<=x.uid)<=1000000%cardinality(assignees) THEN 1 ELSE 0 END ORDER BY x.n)
   INTO shares FROM unnest(assignees) WITH ORDINALITY x(uid,n);$f$);
SELECT pg_temp.m121_patch('public.task_tools_preview(text,jsonb)',
 $f$'collaborators',CASE WHEN p_command IN ('all_team','support') THEN '[]'::jsonb ELSE to_jsonb(tool_collaborators) END,$f$,
 $f$'collaborators','[]'::jsonb,$f$);

-- A preview from before 121 may still list zero-share collaborators: they join
-- the copy's Crew through the same save, so the split stays equal.
SELECT pg_temp.m121_patch('public.task_tools_command(uuid,uuid)',
 $f$,assignees,reviewers,shares,NULL,false,operation);$f$,
 $f$,assignees||ARRAY(SELECT v::uuid FROM jsonb_array_elements_text(coalesce(item->'collaborators','[]'::jsonb)) v
     WHERE NOT(v::uuid=ANY(assignees)) AND NOT(v::uuid=ANY(reviewers))),reviewers,NULL,NULL,false,operation);$f$);

-- 7. One-time rebalance of open missions -------------------------------------
DO $$ DECLARE r record; moved integer:=0; BEGIN
 FOR r IN SELECT t.id,t.organization_id FROM public.tasks t
  WHERE t.participant_credit_mode='configured' AND t.status NOT IN ('Done','Discarded') AND t.archived_effective_date IS NULL
  ORDER BY t.organization_id,t.id LOOP
  PERFORM set_config('taskpulse.organization',r.organization_id::text,true);
  IF taskpulse_private.crew_equal_split(r.id) THEN moved:=moved+1; END IF;
 END LOOP;
 PERFORM set_config('taskpulse.organization','',true);
 RAISE NOTICE 'Migration 121: % open missions re-split equally among their crew',moved;
END $$;

COMMIT;
SELECT taskpulse_private.m15_secure();
