-- ===========================================================================
-- TaskPulse - Asking someone outside the Crew to own a Quest
-- (forward only; 6 November 2026)
--
-- User request (6 November 2026): a Quest's owner may be a member who is not
-- on the mission yet, but only once they accept; requests must not be spammed.
-- Accepting adds them to the mission's Crew (user decision: "Joins the Crew":
-- they log time, may mark Done and share credit equally, as any Crew member).
--
-- 1. public.quest_owner_requests: one row per request (pending, accepted,
--    declined, cancelled), company-owned, no direct access.
-- 2. public.quest_owner_request_command(op, node, invitee, request, operation):
--    request - whoever may choose the Quest's owner today (its owner, the
--              owners of the Quests above it, the managing director and
--              Managers: can_edit_quest_list) asks an active member of the
--              company who is not on the Crew and does not review the mission.
--              Limits: one waiting request per Quest; not the same person for
--              the same Quest within 7 days of a decline; at most 10 waiting
--              requests and 20 requests a day per sender.
--    cancel  - the sender, the managing director or a Manager.
--    accept  - the person asked: they join the Crew (equal shares, as
--              task_people_command add_crew; an observer row becomes Crew) and
--              own the Quest, in one transaction.
--    decline - the person asked.
--    Each answer notifies the other side; every change is audited
--    (quest_owner_<op>, and task_people_add_crew on accept) and idempotent.
-- 3. Reads: quest_owner_requests_mine() (the caller's waiting requests) and
--    quest_owner_requests_for(task) (a mission's waiting requests and who may
--    be asked; for the mission's people, can_read_mission_work).
-- 4. Team > Activity lists the request lines with the mission.
-- ===========================================================================
BEGIN;

CREATE FUNCTION pg_temp.m131_patch(fn regprocedure, frag text, repl text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(fn);
BEGIN
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION '% does not contain this fragment exactly once; update migration 131: %',fn,left(frag,80); END IF;
 EXECUTE replace(def,frag,repl);
END $$;

-- 1. The table -----------------------------------------------------------------
CREATE TABLE public.quest_owner_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
 node_id uuid NOT NULL REFERENCES public.checklist_nodes(id) ON DELETE CASCADE,
 invitee_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 requested_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 decided_at timestamptz,
 CHECK (invitee_id<>requested_by)
);
CREATE UNIQUE INDEX quest_owner_requests_one_pending ON public.quest_owner_requests(node_id) WHERE status='pending';
CREATE INDEX quest_owner_requests_invitee_idx ON public.quest_owner_requests(invitee_id) WHERE status='pending';
CREATE INDEX quest_owner_requests_sender_idx ON public.quest_owner_requests(requested_by,created_at);
CREATE INDEX quest_owner_requests_task_idx ON public.quest_owner_requests(task_id);
REVOKE ALL ON public.quest_owner_requests FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO taskpulse_private.m15_tenant_tables(table_schema,table_name) VALUES ('public','quest_owner_requests')
ON CONFLICT DO NOTHING;
INSERT INTO taskpulse_private.m15_org_refs(table_schema,table_name,column_name,ref_schema,ref_table) VALUES
 ('public','quest_owner_requests','task_id','public','tasks'),
 ('public','quest_owner_requests','invitee_id','public','users'),
 ('public','quest_owner_requests','requested_by','public','users')
ON CONFLICT DO NOTHING;

-- 2. The command ------------------------------------------------------------------
CREATE FUNCTION public.quest_owner_request_command(p_op text,p_node uuid,p_invitee uuid,p_request uuid,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); role public.user_role;
 cmd text:='quest_owner_'||coalesce(p_op,''); receipt taskpulse_private.command_receipts;
 request jsonb:=jsonb_build_array(p_op,p_node,p_invitee,p_request); result jsonb;
 t public.tasks; n public.checklist_nodes; owned uuid; r public.quest_owner_requests;
 before_people jsonb; who text; quest text; manager boolean; BEGIN
 SELECT u.role INTO role FROM public.users u WHERE u.id=actor AND u.is_active;
 IF actor IS NULL OR role IS NULL OR org IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 manager:=role IN ('managing_director','project_engineer');
 IF p_op IS NULL OR p_op NOT IN ('request','cancel','accept','decline') OR p_operation IS NULL
  OR (p_op='request' AND (p_node IS NULL OR p_invitee IS NULL)) OR (p_op<>'request' AND p_request IS NULL) THEN
  RAISE EXCEPTION 'Invalid Quest owner request' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||cmd||p_operation::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=cmd AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;
 -- Accepting changes the Crew: serialised with every other mission write.
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));

 IF p_op='request' THEN
  SELECT * INTO n FROM public.checklist_nodes x WHERE x.id=p_node;
  SELECT o.id INTO owned FROM public.task_checklists o WHERE o.owner_node_id=p_node;
  SELECT * INTO t FROM public.tasks x WHERE x.organization_id=org
   AND x.id=(SELECT c.task_id FROM public.task_checklists c WHERE c.id=n.checklist_id) FOR UPDATE;
  IF n.id IS NULL OR t.id IS NULL THEN RAISE EXCEPTION 'Quest not found' USING ERRCODE='P0002'; END IF;
  IF owned IS NULL THEN RAISE EXCEPTION 'Only a Quest has an owner' USING ERRCODE='23514'; END IF;
  IF NOT taskpulse_private.can_edit_quest_list(owned) THEN
   RAISE EXCEPTION 'Only this Quest''s owner, the owners of the Quests above it and managers choose its owner' USING ERRCODE='42501'; END IF;
  IF t.archived_effective_date IS NOT NULL OR t.status IN ('Done','Discarded') THEN
   RAISE EXCEPTION 'Reopen the mission before choosing a Quest''s owner' USING ERRCODE='23514'; END IF;
  IF t.participant_credit_mode<>'configured' THEN
   RAISE EXCEPTION 'Review this mission''s legacy participants in Edit first' USING ERRCODE='23514'; END IF;
  IF p_invitee=actor THEN RAISE EXCEPTION 'Choose someone else' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_invitee AND u.is_active AND u.organization_id=org) THEN
   RAISE EXCEPTION 'Choose an active member' USING ERRCODE='23514'; END IF;
  IF taskpulse_private.is_crew(t.id,p_invitee) THEN
   RAISE EXCEPTION 'This member is already on the Crew; choose them as the Quest''s owner' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.task_reviewers v WHERE v.task_id=t.id AND v.user_id=p_invitee AND v.reviewer_role<>'Observer') THEN
   RAISE EXCEPTION 'This member reviews the mission, so cannot join its Crew' USING ERRCODE='23514'; END IF;
  -- Limits against spam.
  IF EXISTS(SELECT 1 FROM public.quest_owner_requests q WHERE q.node_id=p_node AND q.status='pending') THEN
   RAISE EXCEPTION 'A request for this Quest is already waiting for an answer' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.quest_owner_requests q WHERE q.node_id=p_node AND q.invitee_id=p_invitee
    AND q.status='declined' AND q.decided_at>clock_timestamp()-interval '7 days') THEN
   RAISE EXCEPTION 'This member declined this Quest in the last 7 days' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM public.quest_owner_requests q WHERE q.requested_by=actor AND q.status='pending')>=10 THEN
   RAISE EXCEPTION 'You have 10 requests waiting for an answer; cancel one or wait' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM public.quest_owner_requests q WHERE q.requested_by=actor AND q.created_at>clock_timestamp()-interval '1 day')>=20 THEN
   RAISE EXCEPTION 'You can send at most 20 Quest owner requests a day' USING ERRCODE='23514'; END IF;
  INSERT INTO public.quest_owner_requests(organization_id,task_id,node_id,invitee_id,requested_by)
  VALUES(org,t.id,p_node,p_invitee,actor) RETURNING * INTO r;
  SELECT u.full_name INTO who FROM public.users u WHERE u.id=actor;
  PERFORM taskpulse_private.notify(org,ARRAY[p_invitee],'quest_owner_request',
   format('%s asks you to own a Quest',who),format('"%s" on %s. Accepting adds you to the mission''s Crew.',left(n.title,120),t.task_tag),
   '/today','quest_owner_request:'||r.id);
 ELSE
  SELECT * INTO r FROM public.quest_owner_requests q WHERE q.id=p_request AND q.organization_id=org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='P0002'; END IF;
  IF r.status<>'pending' THEN RAISE EXCEPTION 'This request was already answered' USING ERRCODE='23514'; END IF;
  SELECT * INTO t FROM public.tasks x WHERE x.id=r.task_id FOR UPDATE;
  SELECT * INTO n FROM public.checklist_nodes x WHERE x.id=r.node_id;
  IF p_op='cancel' THEN
   IF NOT (actor=r.requested_by OR manager) THEN
    RAISE EXCEPTION 'Only the person who asked or a manager cancels a request' USING ERRCODE='42501'; END IF;
   UPDATE public.quest_owner_requests SET status='cancelled',decided_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
  ELSIF actor<>r.invitee_id THEN
   RAISE EXCEPTION 'Only the person asked answers this request' USING ERRCODE='42501';
  ELSIF p_op='decline' THEN
   UPDATE public.quest_owner_requests SET status='declined',decided_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
   SELECT u.full_name INTO who FROM public.users u WHERE u.id=actor;
   PERFORM taskpulse_private.notify(org,ARRAY[r.requested_by],'quest_owner_answer',
    format('%s declined a Quest',who),format('"%s" on %s.',left(n.title,120),t.task_tag),
    taskpulse_private.notify_task_href(t.task_tag),'quest_owner_answer:'||r.id);
  ELSE
   -- accept: join the Crew (as add_crew, 121) and own the Quest (as assign, 122).
   SELECT o.id INTO owned FROM public.task_checklists o WHERE o.owner_node_id=r.node_id;
   IF owned IS NULL THEN RAISE EXCEPTION 'This Quest no longer exists' USING ERRCODE='23514'; END IF;
   IF t.archived_effective_date IS NOT NULL OR t.status IN ('Done','Discarded') THEN
    RAISE EXCEPTION 'The mission is closed; ask for it to be reopened first' USING ERRCODE='23514'; END IF;
   IF t.participant_credit_mode<>'configured' THEN
    RAISE EXCEPTION 'The mission''s participants need a review in Edit first' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM public.task_reviewers v WHERE v.task_id=t.id AND v.user_id=actor AND v.reviewer_role<>'Observer') THEN
    RAISE EXCEPTION 'You review this mission, so cannot join its Crew' USING ERRCODE='23514'; END IF;
   PERFORM taskpulse_private.assert_task_open_date(t.id,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
   IF NOT taskpulse_private.is_crew(t.id,actor) THEN
    before_people:=taskpulse_private.task_people_snapshot(t.id);
    DELETE FROM public.task_reviewers WHERE task_id=t.id AND user_id=actor AND reviewer_role='Observer';
    INSERT INTO public.task_assignees(task_id,user_id,assignment_role,is_primary,assigned_by,share_units)
    VALUES(t.id,actor,'Collaborator',false,r.requested_by,0);
    PERFORM taskpulse_private.crew_equal_split(t.id);
    INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
    VALUES(actor,role::text,'task_people_add_crew','tasks',t.id,ARRAY['participants'],
     jsonb_build_object('user_id',actor,'before',before_people,'after',taskpulse_private.task_people_snapshot(t.id)),p_operation);
   END IF;
   PERFORM set_config('taskpulse.checklist_state',r.node_id::text,true);
   UPDATE public.checklist_nodes SET assignee_id=actor WHERE id=r.node_id;
   PERFORM set_config('taskpulse.checklist_state','',true);
   UPDATE public.tasks SET lifecycle_version=lifecycle_version+1 WHERE id=t.id;
   UPDATE public.quest_owner_requests SET status='accepted',decided_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
   SELECT u.full_name INTO who FROM public.users u WHERE u.id=actor;
   PERFORM taskpulse_private.notify(org,ARRAY[r.requested_by],'quest_owner_answer',
    format('%s now owns a Quest',who),format('"%s" on %s; they joined the Crew.',left(n.title,120),t.task_tag),
    taskpulse_private.notify_task_href(t.task_tag),'quest_owner_answer:'||r.id);
  END IF;
 END IF;

 quest:=n.title;
 result:=jsonb_build_object('id',r.id,'status',r.status,'taskId',t.id,'taskTag',t.task_tag,'nodeId',r.node_id,'inviteeId',r.invitee_id);
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(actor,role::text,cmd,'quest_owner_requests',r.id,ARRAY['status'],
  jsonb_build_object('task_id',jsonb_build_object('after',t.id),'user_id',r.invitee_id,'node_title',quest,'reason',left(quest,1000)),p_operation);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,cmd,p_operation,request,r.id,result);
 RETURN result;
END $$;

-- 3. Reads ----------------------------------------------------------------------------
CREATE FUNCTION public.quest_owner_requests_mine() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',q.id,'taskId',t.id,'taskTag',t.task_tag,'taskTitle',t.title,
   'nodeId',q.node_id,'questTitle',n.title,'requestedBy',q.requested_by,'requesterName',u.full_name,'createdAt',q.created_at)
   ORDER BY q.created_at DESC),'[]'::jsonb)
 FROM public.quest_owner_requests q
 JOIN public.tasks t ON t.id=q.task_id
 JOIN public.checklist_nodes n ON n.id=q.node_id
 JOIN public.users u ON u.id=q.requested_by
 WHERE auth.uid() IS NOT NULL AND public.get_user_role() IS NOT NULL
  AND q.invitee_id=auth.uid() AND q.status='pending' AND q.organization_id=public.current_organization();
$$;

CREATE FUNCTION public.quest_owner_requests_for(p_task uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF auth.uid() IS NULL OR public.get_user_role() IS NULL OR p_task IS NULL OR NOT taskpulse_private.can_read_mission_work(p_task) THEN
  RAISE EXCEPTION 'This mission''s Quests are private to its people' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
  'pending',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',q.id,'nodeId',q.node_id,'inviteeId',q.invitee_id,'inviteeName',u.full_name,
     'requestedBy',q.requested_by,'createdAt',q.created_at) ORDER BY q.created_at),'[]'::jsonb)
   FROM public.quest_owner_requests q JOIN public.users u ON u.id=q.invitee_id
   WHERE q.task_id=p_task AND q.status='pending' AND q.organization_id=public.current_organization()),
  -- Who may be asked: active members of the company who are not on the Crew and do not review the mission.
  'candidates',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name) ORDER BY u.full_name),'[]'::jsonb)
   FROM public.users u
   WHERE u.organization_id=public.current_organization() AND u.is_active
    AND NOT taskpulse_private.is_crew(p_task,u.id)
    AND NOT EXISTS(SELECT 1 FROM public.task_reviewers v WHERE v.task_id=p_task AND v.user_id=u.id AND v.reviewer_role<>'Observer')));
END $$;

REVOKE ALL ON FUNCTION public.quest_owner_request_command(text,uuid,uuid,uuid,uuid),public.quest_owner_requests_mine(),
 public.quest_owner_requests_for(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.quest_owner_request_command(text,uuid,uuid,uuid,uuid),public.quest_owner_requests_mine(),
 public.quest_owner_requests_for(uuid) TO authenticated;

-- 4. Team > Activity lists them with the mission --------------------------------------
SELECT pg_temp.m131_patch('public.activity_feed(date,date,text,uuid,jsonb,integer)',
 $f$('task_proofs', 'missions', false)$f$,
 $f$('task_proofs', 'missions', false),
      -- Quest owner requests (migration 131): one quest_owner_<op> line each.
      ('quest_owner_requests', 'missions', false)$f$);

COMMIT;
SELECT taskpulse_private.m15_secure();
