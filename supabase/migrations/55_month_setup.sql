-- ===========================================================================
-- TaskPulse - month setup wizard (candidate F; forward only, after 53's
-- standing missions and tag allocator)
--
-- User decisions (DECISIONS, 21 October 2026, "Month setup wizard"):
--   * The managing director or project engineer sets a month up in one
--     atomic, previewed batch: the company's standing missions per active
--     member, weekly Tasks Review phases (seven days from the 1st, the last
--     one clipped to month end) and last month's open missions, each repeated
--     as new or carried over. Missions are dated from the 1st to month end.
--   * Tags take the sheet format through taskpulse_private.allocate_task_tag.
--   * Repeat as new is the approved D12 copy (task_tools 'duplicate') with the
--     month in its title moved on; Carry over is the approved D12 handoff
--     (task_tools 'carryover') unchanged, so it only targets a month that has
--     started: a month set up ahead of its 1st gets its carry-overs then.
--
-- month_setup_context(month)   read for the wizard (managers only)
-- month_setup_preview(payload) durable preview in tool_previews; repeats and
--                              carry-overs are wrapped Task Tools previews
-- month_setup_commit(preview, operation)
--                              one transaction: a bad row fails the batch and
--                              names its mission; idempotent per operation
-- month_setup_items records what each setup created, so a month is never set
-- up twice and step 4 hides missions already repeated or carried over.
-- Conflicts raise PT409, never 40001 (migration 52).
-- ===========================================================================
BEGIN;

CREATE TABLE taskpulse_private.month_setup_items (
 task_id uuid PRIMARY KEY REFERENCES public.tasks(id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 preview_id uuid NOT NULL REFERENCES taskpulse_private.tool_previews(id),
 period_start date NOT NULL CHECK (period_start=date_trunc('month',period_start)::date),
 kind text NOT NULL CHECK (kind IN ('standing','phase','repeat','carryover')),
 standing_mission_id uuid REFERENCES taskpulse_private.standing_missions(id),
 member_id uuid REFERENCES public.users(id),
 week integer CHECK (week BETWEEN 1 AND 5),
 source_task_id uuid REFERENCES public.tasks(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((kind='standing')=(standing_mission_id IS NOT NULL AND member_id IS NOT NULL)),
 CHECK ((kind='phase')=(week IS NOT NULL)),
 CHECK ((kind IN ('repeat','carryover'))=(source_task_id IS NOT NULL))
);
-- A month gets each standing cell, each week and each source at most once.
CREATE UNIQUE INDEX month_setup_items_standing_once ON taskpulse_private.month_setup_items(organization_id,period_start,standing_mission_id,member_id) WHERE kind='standing';
CREATE UNIQUE INDEX month_setup_items_phase_once ON taskpulse_private.month_setup_items(organization_id,period_start,week) WHERE kind='phase';
CREATE UNIQUE INDEX month_setup_items_source_once ON taskpulse_private.month_setup_items(organization_id,period_start,source_task_id) WHERE source_task_id IS NOT NULL;
CREATE INDEX month_setup_items_preview_idx ON taskpulse_private.month_setup_items(preview_id);
CREATE INDEX month_setup_items_standing_idx ON taskpulse_private.month_setup_items(standing_mission_id) WHERE standing_mission_id IS NOT NULL;
CREATE INDEX month_setup_items_member_idx ON taskpulse_private.month_setup_items(member_id) WHERE member_id IS NOT NULL;
CREATE INDEX month_setup_items_source_idx ON taskpulse_private.month_setup_items(source_task_id) WHERE source_task_id IS NOT NULL;
REVOKE ALL ON taskpulse_private.month_setup_items FROM PUBLIC,anon,authenticated,service_role;

INSERT INTO taskpulse_private.m15_tenant_tables(table_schema,table_name) VALUES ('taskpulse_private','month_setup_items') ON CONFLICT DO NOTHING;
INSERT INTO taskpulse_private.m15_org_refs(table_schema,table_name,column_name,ref_schema,ref_table) VALUES
 ('taskpulse_private','month_setup_items','task_id','public','tasks'),
 ('taskpulse_private','month_setup_items','source_task_id','public','tasks'),
 ('taskpulse_private','month_setup_items','member_id','public','users')
ON CONFLICT DO NOTHING;

-- "GST filing - October 2026" -> "GST filing - November 2026"; a bare
-- "October" becomes "November" (mirrors swapMonthInTitle in the wizard).
CREATE FUNCTION taskpulse_private.month_setup_swap_title(p_title text,p_from date,p_to date) RETURNS text
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT regexp_replace(
  regexp_replace(p_title,'\m'||to_char(p_from,'FMMonth')||' '||to_char(p_from,'YYYY')||'\M',to_char(p_to,'FMMonth YYYY'),'gi'),
  '\m'||to_char(p_from,'FMMonth')||'\M',to_char(p_to,'FMMonth'),'gi');
$$;
REVOKE ALL ON FUNCTION taskpulse_private.month_setup_swap_title(text,date,date) FROM PUBLIC,anon,authenticated,service_role;

-- What a preview depends on besides its source missions: the active team and
-- the standing list. A commit refuses when either changed.
CREATE FUNCTION taskpulse_private.month_setup_fingerprints(p_org uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object(
  '@team',(SELECT md5(coalesce(jsonb_agg(jsonb_build_array(u.id,u.full_name,u.role) ORDER BY u.id),'[]')::text)
   FROM public.users u WHERE u.organization_id=p_org AND u.is_active),
  '@standing',(SELECT md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]')::text)
   FROM taskpulse_private.standing_missions s WHERE s.organization_id=p_org));
$$;
REVOKE ALL ON FUNCTION taskpulse_private.month_setup_fingerprints(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- The setup's managing director: the caller when they are one, else the
-- first active one by employee code.
CREATE FUNCTION taskpulse_private.month_setup_director(p_org uuid) RETURNS uuid
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.role='managing_director' AND u.is_active) THEN auth.uid()
  ELSE (SELECT u.id FROM public.users u WHERE u.organization_id=p_org AND u.is_active AND u.role='managing_director' ORDER BY u.employee_id,u.id LIMIT 1) END;
$$;
REVOKE ALL ON FUNCTION taskpulse_private.month_setup_director(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Read: what the wizard shows
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.month_setup_context(p_month date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE role text:=public.get_user_role(); org uuid:=public.current_organization();
 today date:=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date; cur date; m date; m_end date; previous jsonb; BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR role IS NULL OR role NOT IN ('managing_director','project_engineer') THEN
  RAISE EXCEPTION 'Only an active managing director or project engineer can set up a month' USING ERRCODE='42501'; END IF;
 IF p_month IS NULL OR NOT isfinite(p_month) THEN RAISE EXCEPTION 'A month is required' USING ERRCODE='23514'; END IF;
 cur:=date_trunc('month',today)::date; m:=date_trunc('month',p_month)::date; m_end:=(m+interval '1 month'-interval '1 day')::date;
 -- Earlier missions still open plus everything from the month before,
 -- newest first, bounded; sources a setup of this month already used are gone.
 SELECT coalesce(jsonb_agg(x.row ORDER BY x.assigned_date,x.task_tag),'[]') INTO previous FROM (
  SELECT t.assigned_date,t.task_tag,jsonb_build_object('id',t.id,'taskTag',t.task_tag,'title',t.title,'category',t.category,'status',t.status,
   'progress',t.progress_percentage,'assignedDate',t.assigned_date,'dueDate',t.due_date,
   'assigneeNames',(SELECT coalesce(jsonb_agg(u.full_name ORDER BY a.primary_first DESC,u.full_name),'[]') FROM (
     SELECT t.assignee_id AS user_id,true AS primary_first UNION SELECT ta.user_id,false FROM public.task_assignees ta WHERE ta.task_id=t.id AND ta.user_id<>t.assignee_id) a
     JOIN public.users u ON u.id=a.user_id),
   'runningTimer',EXISTS(SELECT 1 FROM public.task_timers r WHERE r.task_id=t.id AND r.status='Running')) AS row
  FROM public.tasks t
  WHERE t.organization_id=org AND t.archived_effective_date IS NULL AND t.assigned_date<m
   AND (t.assigned_date>=(m-interval '1 month')::date OR t.status NOT IN ('Done','Discarded'))
   AND NOT EXISTS(SELECT 1 FROM taskpulse_private.month_setup_items i WHERE i.organization_id=org AND i.period_start=m AND i.source_task_id=t.id)
  ORDER BY t.assigned_date DESC,t.task_tag DESC LIMIT 201) x;
 RETURN jsonb_build_object(
  'month',to_char(m,'YYYY-MM'),
  'today',today,
  'allowed',m IN (cur,(cur+interval '1 month')::date),
  'carryoverAvailable',m=cur,
  'existingCount',(SELECT count(*) FROM public.tasks t WHERE t.organization_id=org AND t.archived_effective_date IS NULL AND t.assigned_date BETWEEN m AND m_end),
  'setUpCount',(SELECT count(*) FROM taskpulse_private.month_setup_items i WHERE i.organization_id=org AND i.period_start=m),
  'directorId',taskpulse_private.month_setup_director(org),
  'members',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name,'role',u.role) ORDER BY u.employee_id,u.id),'[]')
   FROM public.users u WHERE u.organization_id=org AND u.is_active),
  'standing',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'titlePattern',s.title_pattern,'category',s.category,'priority',s.priority,
    'ownerMode',s.owner_mode,'ownerId',s.owner_id,'scaleMode',s.scale_mode,'sort',s.sort,
    'setUp',(SELECT coalesce(jsonb_agg(i.member_id),'[]') FROM taskpulse_private.month_setup_items i
     WHERE i.organization_id=org AND i.period_start=m AND i.standing_mission_id=s.id)) ORDER BY s.sort,s.title_pattern,s.id),'[]')
   FROM taskpulse_private.standing_missions s WHERE s.organization_id=org AND s.active),
  'phasesSetUp',(SELECT coalesce(jsonb_agg(i.week ORDER BY i.week),'[]') FROM taskpulse_private.month_setup_items i
   WHERE i.organization_id=org AND i.period_start=m AND i.kind='phase'),
  'previous',CASE WHEN jsonb_array_length(previous)>200 THEN previous-0 ELSE previous END,
  'previousTruncated',jsonb_array_length(previous)>200);
END $$;
REVOKE ALL ON FUNCTION public.month_setup_context(date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.month_setup_context(date) TO authenticated;

-- ---------------------------------------------------------------------------
-- Preview
-- ---------------------------------------------------------------------------
-- payload: {month: 'YYYY-MM', standing: [{missionId, memberId}],
--   phases: {ownerId} | null, previous: [{taskId, action: repeat|carryover}],
--   reason?: text}
-- Standing and phase missions take their tags at commit, in plan order, so
-- previewing again does not use up numbers; repeats and carry-overs keep the
-- tags their wrapped Task Tools previews reserved.
CREATE FUNCTION public.month_setup_preview(p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); role text; org uuid:=public.current_organization();
 today date:=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date; cur date; m date; m_end date; label text;
 pid uuid:=gen_random_uuid(); policy jsonb; items jsonb:='[]'; reasons jsonb:='[]'; item jsonb; item_reasons jsonb;
 e jsonb; s taskpulse_private.standing_missions; member public.users; t public.tasks; v_title text; phase_owner uuid;
 wk integer; d date; sub jsonb; action text; reason text; frozen boolean;
 uuid_re constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; BEGIN
 SELECT u.role::text INTO role FROM public.users u WHERE u.id=actor AND u.is_active FOR SHARE;
 IF role IS NULL OR org IS NULL OR role NOT IN ('managing_director','project_engineer') THEN
  RAISE EXCEPTION 'Only an active managing director or project engineer can set up a month' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR p_payload-ARRAY['month','standing','phases','previous','reason']<>'{}'
  OR coalesce(p_payload->>'month','') !~ '^\d{4}-(0[1-9]|1[0-2])$'
  OR jsonb_typeof(coalesce(p_payload->'standing','[]')) IS DISTINCT FROM 'array'
  OR jsonb_typeof(coalesce(p_payload->'previous','[]')) IS DISTINCT FROM 'array'
  OR coalesce(jsonb_typeof(p_payload->'phases'),'null') NOT IN ('null','object')
  OR coalesce(jsonb_typeof(p_payload->'reason'),'null') NOT IN ('null','string') OR length(p_payload->>'reason')>1000 THEN
  RAISE EXCEPTION 'A month, standing cells, phases and earlier missions are required in the setup format' USING ERRCODE='23514'; END IF;
 IF jsonb_array_length(coalesce(p_payload->'standing','[]'))>300 OR jsonb_array_length(coalesce(p_payload->'previous','[]'))>100 THEN
  RAISE EXCEPTION 'A setup takes at most 300 standing missions and 100 earlier missions' USING ERRCODE='23514'; END IF;
 IF jsonb_array_length(coalesce(p_payload->'standing','[]'))=0 AND jsonb_array_length(coalesce(p_payload->'previous','[]'))=0
  AND jsonb_typeof(p_payload->'phases') IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Choose at least one mission to set up' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 cur:=date_trunc('month',today)::date; m:=(p_payload->>'month'||'-01')::date; m_end:=(m+interval '1 month'-interval '1 day')::date;
 IF m NOT IN (cur,(cur+interval '1 month')::date) THEN
  RAISE EXCEPTION 'Only the current month or the next one can be set up' USING ERRCODE='23514'; END IF;
 label:=to_char(m,'FMMonth YYYY');
 reason:=coalesce(nullif(btrim(p_payload->>'reason'),''),'Carried over by the '||label||' month setup');
 SELECT config INTO policy FROM taskpulse_private.tool_policy WHERE id;
 IF policy IS NULL THEN reasons:=reasons||'"task_tool_policy_unapproved"'::jsonb; END IF;

 -- 1. Standing missions, in list order, then members by employee code.
 FOR e IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'standing','[]')) LOOP
  IF jsonb_typeof(e) IS DISTINCT FROM 'object' OR e-ARRAY['missionId','memberId']<>'{}'
   OR coalesce(e->>'missionId','') !~ uuid_re OR coalesce(e->>'memberId','') !~ uuid_re THEN
   RAISE EXCEPTION 'Each standing cell needs a mission and a member' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM taskpulse_private.standing_missions x WHERE x.id=(e->>'missionId')::uuid AND x.organization_id=org AND x.active) THEN
   RAISE EXCEPTION 'A standing mission is missing or inactive; reload the wizard' USING ERRCODE='PT409'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=(e->>'memberId')::uuid AND u.organization_id=org AND u.is_active) THEN
   RAISE EXCEPTION 'Standing missions go to active members of the company' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_payload->'standing','[]')) v GROUP BY v->>'missionId',v->>'memberId' HAVING count(*)>1)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_payload->'standing','[]')) v
   JOIN taskpulse_private.standing_missions x ON x.id=(v->>'missionId')::uuid AND x.owner_mode='single' GROUP BY x.id HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Each standing cell is chosen once, and a single-owner mission has one owner' USING ERRCODE='23514'; END IF;
 FOR e IN SELECT v FROM jsonb_array_elements(coalesce(p_payload->'standing','[]')) v
  JOIN taskpulse_private.standing_missions x ON x.id=(v->>'missionId')::uuid JOIN public.users u ON u.id=(v->>'memberId')::uuid
  ORDER BY x.sort,x.title_pattern,x.id,u.employee_id,u.id LOOP
  SELECT * INTO s FROM taskpulse_private.standing_missions x WHERE x.id=(e->>'missionId')::uuid;
  SELECT * INTO member FROM public.users u WHERE u.id=(e->>'memberId')::uuid;
  v_title:=left(replace(replace(s.title_pattern,'{month}',label),'{member}',member.full_name),255);
  item_reasons:='[]';
  IF EXISTS(SELECT 1 FROM taskpulse_private.month_setup_items i WHERE i.organization_id=org AND i.period_start=m AND i.standing_mission_id=s.id AND i.member_id=member.id)
   OR EXISTS(SELECT 1 FROM public.tasks x WHERE x.organization_id=org AND x.archived_effective_date IS NULL AND x.assigned_date BETWEEN m AND m_end AND lower(x.title)=lower(v_title)) THEN
   item_reasons:=item_reasons||'"already_set_up"'::jsonb; END IF;
  items:=items||jsonb_build_array(jsonb_build_object('kind','standing','standingMissionId',s.id,'memberId',member.id,'taskTag',NULL,
   'title',v_title,'category',s.category,'priority',s.priority,'assignedDate',m,'dueDate',m_end,'scale','0','scaleMode',s.scale_mode,
   'scaleInputs',CASE s.scale_mode WHEN 'hours' THEN '{"multiplier":1}'::jsonb WHEN 'activity_count' THEN '{"activity_count":0,"unit_scale":1}'::jsonb ELSE '{"value":0}'::jsonb END,
   'assignees',jsonb_build_array(member.id),'reviewers','[]'::jsonb,'shares','[1000000]'::jsonb,'reasons',item_reasons));
 END LOOP;

 -- 2. Weekly Tasks Review phases: seven days from the 1st, the last clipped.
 IF jsonb_typeof(p_payload->'phases')='object' THEN
  IF (p_payload->'phases')-ARRAY['ownerId']<>'{}' OR coalesce(p_payload->'phases'->>'ownerId','') !~ uuid_re THEN
   RAISE EXCEPTION 'Weekly phases need an owner' USING ERRCODE='23514'; END IF;
  phase_owner:=(p_payload->'phases'->>'ownerId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=phase_owner AND u.organization_id=org AND u.is_active) THEN
   RAISE EXCEPTION 'Weekly phases go to an active member of the company' USING ERRCODE='23514'; END IF;
  FOR wk IN 1..ceil((m_end-m+1)/7.0)::integer LOOP
   d:=m+(wk-1)*7; v_title:='Tasks Review - '||label||' - Week '||wk; item_reasons:='[]';
   IF EXISTS(SELECT 1 FROM taskpulse_private.month_setup_items i WHERE i.organization_id=org AND i.period_start=m AND i.week=wk)
    OR EXISTS(SELECT 1 FROM public.tasks x WHERE x.organization_id=org AND x.archived_effective_date IS NULL AND x.assigned_date BETWEEN m AND m_end AND lower(x.title)=lower(v_title)) THEN
    item_reasons:=item_reasons||'"already_set_up"'::jsonb; END IF;
   items:=items||jsonb_build_array(jsonb_build_object('kind','phase','week',wk,'taskTag',NULL,'title',v_title,'category','WK','priority','Medium',
    'assignedDate',d,'dueDate',least(d+6,m_end),'scale','0','scaleMode','hours','scaleInputs','{"multiplier":1}'::jsonb,
    'assignees',jsonb_build_array(phase_owner),'reviewers','[]'::jsonb,'shares','[1000000]'::jsonb,'reasons',item_reasons));
  END LOOP;
 END IF;

 -- Closed months and frozen reports refuse new missions, as in Task Tools.
 IF EXISTS(SELECT 1 FROM taskpulse_private.month_periods p WHERE p.period_start=m AND p.state<>'live') THEN
  reasons:=reasons||'"closed_period_requires_named_correction"'::jsonb; END IF;
 frozen:=false;
 FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
  BEGIN PERFORM taskpulse_private.assert_open_date((item->'assignees'->>0)::uuid,(item->>'assignedDate')::date);
  EXCEPTION WHEN check_violation THEN frozen:=true; END;
 END LOOP;
 IF frozen THEN reasons:=reasons||'"frozen_report_period_requires_revision"'::jsonb; END IF;

 -- 3. Earlier missions through the approved Task Tools previews.
 FOR e IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'previous','[]')) LOOP
  IF jsonb_typeof(e) IS DISTINCT FROM 'object' OR e-ARRAY['taskId','action']<>'{}' OR coalesce(e->>'taskId','') !~ uuid_re
   OR coalesce(e->>'action','') NOT IN ('repeat','carryover') THEN
   RAISE EXCEPTION 'Each earlier mission needs Repeat or Carry over' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_payload->'previous','[]')) v GROUP BY v->>'taskId' HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Each earlier mission is chosen once' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_payload->'previous','[]')) v
  WHERE NOT EXISTS(SELECT 1 FROM public.tasks x WHERE x.id=(v->>'taskId')::uuid AND x.organization_id=org)) THEN
  RAISE EXCEPTION 'An earlier mission is missing; reload the wizard' USING ERRCODE='23503'; END IF;
 FOR e IN SELECT v FROM jsonb_array_elements(coalesce(p_payload->'previous','[]')) v
  JOIN public.tasks x ON x.id=(v->>'taskId')::uuid ORDER BY x.assigned_date,x.task_tag LOOP
  SELECT * INTO t FROM public.tasks x WHERE x.id=(e->>'taskId')::uuid AND x.organization_id=org;
  action:=e->>'action';
  IF t.assigned_date>=m THEN
   RAISE EXCEPTION '%: only missions from before % can be repeated or carried over',t.task_tag,label USING ERRCODE='23514'; END IF;
  IF action='carryover' AND m<>cur THEN
   RAISE EXCEPTION '%: carry over is available from %',t.task_tag,to_char(m,'FMDD FMMonth') USING ERRCODE='23514'; END IF;
  BEGIN
   sub:=public.task_tools_preview(CASE action WHEN 'repeat' THEN 'duplicate' ELSE 'carryover' END,
    jsonb_build_object('sourceTaskId',t.id,'startDate',m,'dueDate',m_end)
    ||CASE WHEN action='carryover' THEN jsonb_build_object('targetMonth',to_char(m,'YYYY-MM'),'reason',reason) ELSE '{}'::jsonb END);
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION '%: %',t.task_tag,SQLERRM USING ERRCODE=SQLSTATE; END;
  item_reasons:=sub->'reasons';
  IF EXISTS(SELECT 1 FROM taskpulse_private.month_setup_items i WHERE i.organization_id=org AND i.period_start=m AND i.source_task_id=t.id) THEN
   item_reasons:=item_reasons||'"already_set_up"'::jsonb; END IF;
  items:=items||jsonb_build_array((sub->'items'->0)||jsonb_build_object('kind',action,'sourceTaskId',t.id,'sourceTag',t.task_tag,
   'subPreviewId',sub->>'id','reasons',item_reasons,
   'title',CASE WHEN action='repeat' THEN left(taskpulse_private.month_setup_swap_title(t.title,t.assigned_date,m),255) ELSE sub->'items'->0->>'title' END));
 END LOOP;

 SELECT reasons||coalesce(jsonb_agg(DISTINCT r),'[]') INTO reasons FROM jsonb_array_elements(items) i, jsonb_array_elements(i->'reasons') r
  WHERE NOT reasons ? (r#>>'{}');
 INSERT INTO taskpulse_private.tool_previews(id,actor_id,command,request,plan,fingerprints)
 VALUES(pid,actor,'month_setup',p_payload,jsonb_build_object('id',pid,'command','month_setup','month',m,'expiresAt',clock_timestamp()+interval '15 minutes',
  'policyId',policy->>'id','policyFingerprint',md5(policy::text),'ready',jsonb_array_length(reasons)=0,'reasons',reasons,'items',items,
  'sourceScaleBefore',NULL,'sourceScaleAfter',NULL,'inheritance','{}'::jsonb),taskpulse_private.month_setup_fingerprints(org));
 RETURN (SELECT p.plan FROM taskpulse_private.tool_previews p WHERE p.id=pid);
END $$;
REVOKE ALL ON FUNCTION public.month_setup_preview(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.month_setup_preview(jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- Commit
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.month_setup_commit(p_preview uuid,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); role text; org uuid:=public.current_organization();
 today date:=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date; cur date; m date; m_end date;
 p taskpulse_private.tool_previews; receipt taskpulse_private.command_receipts; policy jsonb; item jsonb; ordinal bigint;
 target uuid; tag text; res jsonb; version bigint; result jsonb:='[]'; state jsonb; BEGIN
 SELECT u.role::text INTO role FROM public.users u WHERE u.id=actor AND u.is_active FOR SHARE;
 IF role IS NULL OR org IS NULL OR role NOT IN ('managing_director','project_engineer') THEN
  RAISE EXCEPTION 'Only an active managing director or project engineer can set up a month' USING ERRCODE='42501'; END IF;
 IF p_preview IS NULL OR p_operation IS NULL THEN RAISE EXCEPTION 'A preview and an operation are required' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts r WHERE r.actor_id=actor AND r.command='month_setup' AND r.operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request IS DISTINCT FROM to_jsonb(p_preview) THEN RAISE EXCEPTION 'Operation reused with another preview' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;
 SELECT * INTO p FROM taskpulse_private.tool_previews x WHERE x.id=p_preview FOR SHARE;
 IF NOT FOUND OR p.actor_id<>actor OR p.command<>'month_setup' THEN RAISE EXCEPTION 'Own month setup preview required' USING ERRCODE='42501'; END IF;
 IF p.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Preview expired; prepare a new preview' USING ERRCODE='PT409'; END IF;
 IF NOT (p.plan->>'ready')::boolean THEN RAISE EXCEPTION 'Preview has unresolved items; change the setup and preview again' USING ERRCODE='23514'; END IF;
 SELECT config INTO policy FROM taskpulse_private.tool_policy WHERE id;
 IF policy IS NULL OR p.plan->>'policyFingerprint' IS DISTINCT FROM md5(policy::text) THEN RAISE EXCEPTION 'Policy changed; preview again' USING ERRCODE='PT409'; END IF;
 IF p.fingerprints IS DISTINCT FROM taskpulse_private.month_setup_fingerprints(org) THEN
  RAISE EXCEPTION 'The team or the standing missions changed; preview again' USING ERRCODE='PT409'; END IF;
 cur:=date_trunc('month',today)::date; m:=(p.plan->>'month')::date; m_end:=(m+interval '1 month'-interval '1 day')::date;
 IF m NOT IN (cur,(cur+interval '1 month')::date)
  OR (m<>cur AND EXISTS(SELECT 1 FROM jsonb_array_elements(p.plan->'items') i WHERE i->>'kind'='carryover')) THEN
  RAISE EXCEPTION 'The month changed since the preview; preview again' USING ERRCODE='PT409'; END IF;

 FOR item,ordinal IN SELECT value,n FROM jsonb_array_elements(p.plan->'items') WITH ORDINALITY x(value,n) LOOP
  tag:=item->>'taskTag';
  BEGIN
   IF item->>'kind' IN ('standing','phase') THEN
    IF EXISTS(SELECT 1 FROM taskpulse_private.month_setup_items i WHERE i.organization_id=org AND i.period_start=m AND (
      (item->>'kind'='standing' AND i.standing_mission_id=(item->>'standingMissionId')::uuid AND i.member_id=(item->>'memberId')::uuid)
      OR (item->>'kind'='phase' AND i.week=(item->>'week')::integer)))
     OR EXISTS(SELECT 1 FROM public.tasks x WHERE x.organization_id=org AND x.archived_effective_date IS NULL
      AND x.assigned_date BETWEEN m AND m_end AND lower(x.title)=lower(item->>'title')) THEN
     RAISE EXCEPTION 'Already set up for this month; preview again' USING ERRCODE='PT409'; END IF;
    tag:=taskpulse_private.allocate_task_tag(org,m,item->>'category');
    target:=public.save_task_with_participants(NULL,jsonb_build_object('task_tag',tag,'title',item->>'title','category',item->>'category',
     'priority',item->>'priority','task_scale',0,'due_date',item->>'dueDate','initialize_details',true),
     ARRAY[(item->'assignees'->>0)::uuid],ARRAY[]::uuid[],ARRAY[1000000],NULL,false,md5(p_operation::text||':'||ordinal)::uuid);
    PERFORM taskpulse_private.assert_task_open_date(target,(item->>'assignedDate')::date);
    UPDATE public.tasks SET assigned_date=(item->>'assignedDate')::date WHERE id=target;
    IF item->>'scaleMode'<>'manual' THEN
     SELECT x.lifecycle_version INTO version FROM public.tasks x WHERE x.id=target;
     PERFORM public.task_lifecycle_command(target,'scale',jsonb_build_object('mode',item->>'scaleMode','inputs',item->'scaleInputs','override',NULL,
      'reason','Month setup','provenance','Month setup '||(item->>'kind')||' mission'),version,md5(p_operation::text||':'||ordinal||':scale')::uuid);
    END IF;
    INSERT INTO taskpulse_private.month_setup_items(task_id,organization_id,preview_id,period_start,kind,standing_mission_id,member_id,week)
    VALUES(target,org,p.id,m,item->>'kind',(item->>'standingMissionId')::uuid,(item->>'memberId')::uuid,(item->>'week')::integer);
   ELSE
    -- The approved copy and handoff, unchanged; they recheck their own sources.
    res:=public.task_tools_command((item->>'subPreviewId')::uuid,md5(p_operation::text||':'||(item->>'subPreviewId'))::uuid);
    target:=(res->'items'->0->>'taskId')::uuid;
    IF item->>'kind'='repeat' THEN UPDATE public.tasks SET title=item->>'title' WHERE id=target AND title IS DISTINCT FROM item->>'title'; END IF;
    INSERT INTO taskpulse_private.month_setup_items(task_id,organization_id,preview_id,period_start,kind,source_task_id)
    VALUES(target,org,p.id,m,item->>'kind',(item->>'sourceTaskId')::uuid);
   END IF;
   result:=result||jsonb_build_array(jsonb_build_object('taskId',target,'taskTag',coalesce(tag,item->>'taskTag'),'kind',item->>'kind','status','created'));
  EXCEPTION WHEN OTHERS THEN
   RAISE EXCEPTION '%: %',coalesce(tag,item->>'title')||coalesce(' (from '||(item->>'sourceTag')||')',''),SQLERRM USING ERRCODE=SQLSTATE;
  END;
 END LOOP;
 state:=jsonb_build_object('previewId',p.id,'month',to_char(m,'YYYY-MM'),'items',result,'status','committed','providerState','not_requested');
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(actor,role,'month_setup','tool_previews',p.id,ARRAY['native_workflow'],jsonb_build_object('month',to_char(m,'YYYY-MM'),'itemCount',jsonb_array_length(result)),p_operation);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,'month_setup',p_operation,to_jsonb(p.id),p.id,state);
 RETURN state;
END $$;
REVOKE ALL ON FUNCTION public.month_setup_commit(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.month_setup_commit(uuid,uuid) TO authenticated;

COMMIT;
SELECT taskpulse_private.m15_secure();
