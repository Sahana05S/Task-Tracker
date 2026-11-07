-- ===========================================================================
-- TaskPulse - Meetings: private meetings with members, minutes and points
-- (forward only; 7 November 2026)
--
-- User decisions (7 November 2026): a meeting is visible to its members and
-- the managing director only (Managers lose company-wide access to meeting
-- points); the existing meeting points are grouped into meetings and stay
-- private (members = the points' authors and "to be resolved by" people).
--
-- 1. public.meetings (title, date, start time, type, minutes, version, creator,
--    state), public.meeting_members, public.meeting_missions (several missions
--    per meeting, any mission of the company) and meeting_points.meeting_id:
--    the points become the meeting's action items. No direct access; reads
--    and writes go through the functions below.
-- 2. taskpulse_private.can_read_meeting(meeting) / can_read_meeting_point(point)
--    (public wrappers for policies): a member, or the managing director.
--    Meeting points' policies: m01_read / m01_admin / m01_own_support_insert
--    are replaced by "readers of the meeting read its points".
-- 3. public.meeting_command(op, meeting, payload, expected_version, operation):
--    create (the creator becomes a member; minutes start from the company
--    agenda), edit (title, date, start time, type, missions; members and the
--    MD), save_minutes (version-checked: PT409 "someone else saved"),
--    add_member (any member or the MD), remove_member (the creator or the MD;
--    never the last member), withdraw (the creator or the MD). Audited
--    (meeting_<op>, never the minutes' text) and idempotent.
-- 4. public.meeting_point_command(op, meeting, point, payload, version, operation):
--    add / edit / set_status (members and the MD) and withdraw (the point's
--    author, the meeting's creator or the MD). A "to be resolved by" person
--    who is not a member joins the meeting. The pending/validated review is no
--    longer used for meeting points (columns stay); input_history keeps every
--    version (kind 'meeting') as before. dated_record_command refuses 'meeting'.
-- 5. Reads: meetings_list(from, to, task) and meeting_detail(meeting).
-- 6. Labels, label pages, Team > Activity and record history follow the
--    meeting's readers; a label on a point may be changed by its meeting's
--    members and the MD.
-- 7. Old points: one meeting per company, date and meeting type, titled
--    "<type> meeting" or "Meeting"; withdrawn points stay withdrawn (a meeting
--    holding only withdrawn points is withdrawn too).
-- 8. meetings.business_id (migration 134's businesses): set on create and edit; a new or changed
--    business must be active and in the caller's company; an unchanged archived one may stay.
-- ===========================================================================
BEGIN;

CREATE FUNCTION pg_temp.m136_patch(fn regprocedure, frag text, repl text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(fn);
BEGIN
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION '% does not contain this fragment exactly once; update migration 136: %',fn,left(frag,80); END IF;
 EXECUTE replace(def,frag,repl);
END $$;

-- 1. Tables ------------------------------------------------------------------------
CREATE TABLE public.meetings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
 meeting_date date NOT NULL,
 start_time time,
 meeting_type varchar(80),
 business_id uuid REFERENCES taskpulse_private.businesses(id) ON DELETE RESTRICT,
 minutes text NOT NULL DEFAULT '' CHECK (length(minutes)<=50000),
 record_version bigint NOT NULL DEFAULT 1,
 created_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
 record_state text NOT NULL DEFAULT 'active' CHECK (record_state IN ('active','withdrawn')),
 minutes_saved_at timestamptz,
 minutes_saved_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX meetings_org_date_idx ON public.meetings(organization_id,meeting_date DESC);
CREATE INDEX meetings_business_idx ON public.meetings(business_id) WHERE business_id IS NOT NULL;

CREATE TABLE public.meeting_members (
 meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 added_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
 added_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (meeting_id,user_id)
);
CREATE INDEX meeting_members_user_idx ON public.meeting_members(user_id);

CREATE TABLE public.meeting_missions (
 meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
 task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 added_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
 added_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (meeting_id,task_id)
);
CREATE INDEX meeting_missions_task_idx ON public.meeting_missions(task_id);

ALTER TABLE public.meeting_points ADD COLUMN meeting_id uuid REFERENCES public.meetings(id) ON DELETE RESTRICT;
CREATE INDEX meeting_points_meeting_idx ON public.meeting_points(meeting_id);

REVOKE ALL ON public.meetings,public.meeting_members,public.meeting_missions FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO taskpulse_private.m15_tenant_tables(table_schema,table_name) VALUES
 ('public','meetings'),('public','meeting_members'),('public','meeting_missions')
ON CONFLICT DO NOTHING;
INSERT INTO taskpulse_private.m15_org_refs(table_schema,table_name,column_name,ref_schema,ref_table) VALUES
 ('public','meetings','created_by','public','users'),
 ('public','meetings','minutes_saved_by','public','users'),
 ('public','meetings','business_id','taskpulse_private','businesses'),
 ('public','meeting_members','meeting_id','public','meetings'),
 ('public','meeting_members','user_id','public','users'),
 ('public','meeting_members','added_by','public','users'),
 ('public','meeting_missions','meeting_id','public','meetings'),
 ('public','meeting_missions','task_id','public','tasks'),
 ('public','meeting_missions','added_by','public','users'),
 ('public','meeting_points','meeting_id','public','meetings')
ON CONFLICT DO NOTHING;

-- 2. Who reads a meeting --------------------------------------------------------------
CREATE FUNCTION taskpulse_private.can_read_meeting(p_meeting uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND public.get_user_role() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.meetings m WHERE m.id=p_meeting AND m.organization_id=public.current_organization()
   AND (public.get_user_role()='managing_director'
    OR EXISTS(SELECT 1 FROM public.meeting_members x WHERE x.meeting_id=m.id AND x.user_id=auth.uid())));
$$;
CREATE FUNCTION taskpulse_private.can_read_meeting_point(p_point uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.meeting_points p WHERE p.id=p_point AND taskpulse_private.can_read_meeting(p.meeting_id));
$$;
CREATE FUNCTION public.can_read_meeting(p_meeting uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT taskpulse_private.can_read_meeting(p_meeting); $$;

DROP POLICY IF EXISTS m01_read ON public.meeting_points;
DROP POLICY IF EXISTS m01_admin ON public.meeting_points;
DROP POLICY IF EXISTS m01_own_support_insert ON public.meeting_points;
CREATE POLICY m136_meeting_readers ON public.meeting_points FOR SELECT TO authenticated
 USING (public.can_read_meeting(meeting_id));

-- 7. Old points become meetings (before the column turns NOT NULL) ----------------------------
CREATE TEMP TABLE m136_groups ON COMMIT DROP AS
 SELECT gen_random_uuid() AS meeting_id,p.organization_id,p.meeting_date,nullif(btrim(p.meeting_type),'') AS meeting_type,
  (array_agg(p.posted_by ORDER BY p.created_at,p.id) FILTER (WHERE p.posted_by IS NOT NULL))[1] AS creator,
  bool_or(p.validation_state<>'withdrawn') AS has_active,min(p.created_at) AS first_at
 FROM public.meeting_points p GROUP BY p.organization_id,p.meeting_date,nullif(btrim(p.meeting_type),'');
INSERT INTO public.meetings(id,organization_id,title,meeting_date,meeting_type,created_by,record_state,created_at,updated_at)
 SELECT g.meeting_id,g.organization_id,CASE WHEN g.meeting_type IS NULL THEN 'Meeting' WHEN g.meeting_type ~* 'meeting$' THEN left(g.meeting_type,200) ELSE left(g.meeting_type,191)||' meeting' END,g.meeting_date,g.meeting_type,g.creator,
  CASE WHEN g.has_active THEN 'active' ELSE 'withdrawn' END,g.first_at,g.first_at
 FROM m136_groups g;
UPDATE public.meeting_points p SET meeting_id=g.meeting_id FROM m136_groups g
 WHERE g.organization_id=p.organization_id AND g.meeting_date=p.meeting_date
  AND g.meeting_type IS NOT DISTINCT FROM nullif(btrim(p.meeting_type),'');
INSERT INTO public.meeting_members(meeting_id,user_id,organization_id,added_by,added_at)
 SELECT DISTINCT ON (p.meeting_id,u.id) p.meeting_id,u.id,p.organization_id,NULL::uuid,min(p.created_at) OVER (PARTITION BY p.meeting_id)
 FROM public.meeting_points p
 CROSS JOIN LATERAL (VALUES (p.posted_by),(p.owner_id)) who(id)
 JOIN public.users u ON u.id=who.id AND u.organization_id=p.organization_id
ON CONFLICT DO NOTHING;
ALTER TABLE public.meeting_points ALTER COLUMN meeting_id SET NOT NULL;

-- 3. meeting_command -----------------------------------------------------------------------
CREATE FUNCTION taskpulse_private.meeting_actor() RETURNS public.user_role
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.user_role; BEGIN
 SELECT u.role INTO r FROM public.users u WHERE u.id=auth.uid() AND u.is_active;
 IF auth.uid() IS NULL OR r IS NULL OR public.get_user_role() IS NULL OR public.current_organization() IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 RETURN r;
END $$;

CREATE FUNCTION taskpulse_private.meeting_set_missions(p_meeting uuid,p_missions jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.current_organization(); ids uuid[]; BEGIN
 IF p_missions IS NULL OR jsonb_typeof(p_missions)<>'array' THEN
  RAISE EXCEPTION 'Missions must be a list' USING ERRCODE='23514'; END IF;
 IF jsonb_array_length(p_missions)>50 THEN RAISE EXCEPTION 'A meeting links at most 50 missions' USING ERRCODE='23514'; END IF;
 BEGIN
  SELECT coalesce(array_agg(DISTINCT x::uuid),'{}') INTO ids FROM jsonb_array_elements_text(p_missions) x;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Choose missions from the list' USING ERRCODE='23514'; END;
 IF EXISTS(SELECT 1 FROM unnest(ids) i WHERE NOT EXISTS(SELECT 1 FROM public.tasks t WHERE t.id=i AND t.organization_id=org)) THEN
  RAISE EXCEPTION 'Mission not found' USING ERRCODE='P0002'; END IF;
 DELETE FROM public.meeting_missions WHERE meeting_id=p_meeting AND task_id<>ALL(ids);
 INSERT INTO public.meeting_missions(meeting_id,task_id,organization_id,added_by)
 SELECT p_meeting,i,org,auth.uid() FROM unnest(ids) i ON CONFLICT DO NOTHING;
END $$;

CREATE FUNCTION taskpulse_private.meeting_add_member(p_meeting uuid,p_user uuid,p_title text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.current_organization(); n integer; who text; BEGIN
 IF p_user IS NULL OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_user AND u.organization_id=org AND u.is_active) THEN
  RAISE EXCEPTION 'Choose an active member of the company' USING ERRCODE='23514'; END IF;
 IF (SELECT count(*) FROM public.meeting_members WHERE meeting_id=p_meeting)>=100 THEN
  RAISE EXCEPTION 'A meeting has at most 100 members' USING ERRCODE='23514'; END IF;
 INSERT INTO public.meeting_members(meeting_id,user_id,organization_id,added_by)
 VALUES(p_meeting,p_user,org,auth.uid()) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n>0 AND p_user<>auth.uid() THEN
  SELECT u.full_name INTO who FROM public.users u WHERE u.id=auth.uid();
  PERFORM taskpulse_private.notify(org,ARRAY[p_user],'meeting_member',format('%s added you to a meeting',who),
   left(p_title,200),'/meeting-points/'||p_meeting,'meeting_member:'||p_meeting||':'||p_user);
 END IF;
 RETURN n>0;
END $$;

CREATE FUNCTION public.meeting_command(p_op text,p_meeting uuid,p_payload jsonb,p_expected_version bigint,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); role public.user_role;
 cmd text:='meeting_'||coalesce(p_op,''); receipt taskpulse_private.command_receipts; result jsonb;
 payload jsonb:=coalesce(p_payload,'{}'::jsonb); request jsonb; m public.meetings; target uuid; d date; st time;
 v_title text; v_type text; v_business uuid; changed text[]:='{}'; x jsonb; BEGIN
 role:=taskpulse_private.meeting_actor();
 IF p_op IS NULL OR p_op NOT IN ('create','edit','save_minutes','add_member','remove_member','withdraw') OR p_operation IS NULL
  OR jsonb_typeof(payload)<>'object' OR (p_op<>'create' AND p_meeting IS NULL) THEN
  RAISE EXCEPTION 'Invalid meeting command' USING ERRCODE='23514'; END IF;
 -- The minutes are kept out of the stored request: their digest identifies a replay.
 request:=jsonb_build_array(p_op,p_meeting,CASE WHEN payload ? 'minutes' THEN (payload-'minutes')||jsonb_build_object('minutes_md5',md5(coalesce(payload->>'minutes',''))) ELSE payload END,p_expected_version);
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||cmd||p_operation::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=cmd AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;

 IF p_op IN ('create','edit') THEN
  IF p_op='create' OR payload ? 'title' THEN
   v_title:=btrim(regexp_replace(coalesce(payload->>'title',''),'\s+',' ','g'));
   IF v_title='' OR length(v_title)>200 THEN RAISE EXCEPTION 'Give the meeting a title of up to 200 characters' USING ERRCODE='23514'; END IF;
  END IF;
  IF p_op='create' OR payload ? 'meeting_date' THEN
   IF coalesce(payload->>'meeting_date','')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Choose the meeting date' USING ERRCODE='23514'; END IF;
   d:=(payload->>'meeting_date')::date;
   IF d<'2000-01-01' OR d>(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date+366 THEN
    RAISE EXCEPTION 'Choose a meeting date within the next year' USING ERRCODE='23514'; END IF;
  END IF;
  IF nullif(payload->>'start_time','') IS NOT NULL THEN
   IF payload->>'start_time'!~'^\d{2}:\d{2}(:\d{2})?$' THEN RAISE EXCEPTION 'Start time is HH:MM' USING ERRCODE='23514'; END IF;
   st:=(payload->>'start_time')::time;
  END IF;
  v_type:=nullif(btrim(coalesce(payload->>'meeting_type','')),'');
  IF length(v_type)>80 THEN RAISE EXCEPTION 'Meeting type is at most 80 characters' USING ERRCODE='23514'; END IF;
 END IF;

 IF p_op='create' THEN
  v_business:=taskpulse_private.business_for_mission(payload->>'business_id');
  INSERT INTO public.meetings(organization_id,title,meeting_date,start_time,meeting_type,business_id,minutes,created_by)
  VALUES(org,v_title,d,st,v_type,v_business,
   coalesce((SELECT s.meeting_agenda FROM taskpulse_private.organization_settings s WHERE s.organization_id=org),''),actor)
  RETURNING * INTO m;
  INSERT INTO public.meeting_members(meeting_id,user_id,organization_id,added_by) VALUES(m.id,actor,org,actor);
  IF payload ? 'members' THEN
   IF jsonb_typeof(payload->'members')<>'array' OR jsonb_array_length(payload->'members')>100 THEN
    RAISE EXCEPTION 'Members must be a list of up to 100 people' USING ERRCODE='23514'; END IF;
   FOR x IN SELECT * FROM jsonb_array_elements(payload->'members') LOOP
    BEGIN target:=(x#>>'{}')::uuid; EXCEPTION WHEN invalid_text_representation THEN target:=NULL; END;
    PERFORM taskpulse_private.meeting_add_member(m.id,target,m.title);
   END LOOP;
  END IF;
  PERFORM taskpulse_private.meeting_set_missions(m.id,coalesce(payload->'missions','[]'::jsonb));
  changed:=ARRAY['title','meeting_date','business_id','members','missions'];
 ELSE
  SELECT * INTO m FROM public.meetings x WHERE x.id=p_meeting AND x.organization_id=org FOR UPDATE;
  IF NOT FOUND OR NOT taskpulse_private.can_read_meeting(m.id) THEN RAISE EXCEPTION 'Meeting not found' USING ERRCODE='P0002'; END IF;
  IF m.record_state<>'active' THEN RAISE EXCEPTION 'This meeting was withdrawn' USING ERRCODE='23514'; END IF;
  IF p_op='edit' THEN
   IF payload-ARRAY['title','meeting_date','start_time','meeting_type','business_id','missions']<>'{}' THEN
    RAISE EXCEPTION 'Unexpected meeting fields' USING ERRCODE='23514'; END IF;
   IF payload ? 'title' AND v_title IS DISTINCT FROM m.title THEN changed:=changed||'title'::text; m.title:=v_title; END IF;
   IF payload ? 'meeting_date' AND d IS DISTINCT FROM m.meeting_date THEN changed:=changed||'meeting_date'::text; m.meeting_date:=d; END IF;
   IF payload ? 'start_time' AND st IS DISTINCT FROM m.start_time THEN changed:=changed||'start_time'::text; m.start_time:=st; END IF;
   IF payload ? 'meeting_type' AND v_type IS DISTINCT FROM m.meeting_type::text THEN changed:=changed||'meeting_type'::text; m.meeting_type:=v_type; END IF;
   -- An unchanged (even archived) business may stay; a change must be to an active one (134).
   IF payload ? 'business_id' AND nullif(payload->>'business_id','') IS DISTINCT FROM m.business_id::text THEN
    m.business_id:=taskpulse_private.business_for_mission(payload->>'business_id'); changed:=changed||'business_id'::text;
   END IF;
   UPDATE public.meetings SET title=m.title,meeting_date=m.meeting_date,start_time=m.start_time,meeting_type=m.meeting_type,
    business_id=m.business_id,updated_at=clock_timestamp() WHERE id=m.id;
   -- The points carry their meeting's date and type, as the old records did.
   UPDATE public.meeting_points SET meeting_date=m.meeting_date,meeting_type=m.meeting_type
    WHERE meeting_id=m.id AND (meeting_date,meeting_type) IS DISTINCT FROM (m.meeting_date,m.meeting_type);
   IF payload ? 'missions' THEN
    PERFORM taskpulse_private.meeting_set_missions(m.id,payload->'missions'); changed:=changed||'missions'::text;
   END IF;
  ELSIF p_op='save_minutes' THEN
   IF payload-ARRAY['minutes']<>'{}' OR jsonb_typeof(payload->'minutes') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Minutes text required' USING ERRCODE='23514'; END IF;
   IF length(payload->>'minutes')>50000 THEN RAISE EXCEPTION 'Minutes are at most 50,000 characters' USING ERRCODE='23514'; END IF;
   IF p_expected_version IS DISTINCT FROM m.record_version THEN
    RAISE EXCEPTION 'Someone else saved these minutes; reload to see their version' USING ERRCODE='PT409'; END IF;
   UPDATE public.meetings SET minutes=payload->>'minutes',record_version=record_version+1,minutes_saved_at=clock_timestamp(),
    minutes_saved_by=actor,updated_at=clock_timestamp() WHERE id=m.id RETURNING * INTO m;
   changed:=ARRAY['minutes'];
  ELSIF p_op='add_member' THEN
   BEGIN target:=(payload->>'user_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN target:=NULL; END;
   PERFORM taskpulse_private.meeting_add_member(m.id,target,m.title);
   changed:=ARRAY['members'];
  ELSIF p_op='remove_member' THEN
   IF NOT (role='managing_director' OR actor=m.created_by) THEN
    RAISE EXCEPTION 'Only the person who created the meeting or the managing director removes members' USING ERRCODE='42501'; END IF;
   BEGIN target:=(payload->>'user_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN target:=NULL; END;
   IF NOT EXISTS(SELECT 1 FROM public.meeting_members WHERE meeting_id=m.id AND user_id=target) THEN
    RAISE EXCEPTION 'Not a member of this meeting' USING ERRCODE='P0002'; END IF;
   IF (SELECT count(*) FROM public.meeting_members WHERE meeting_id=m.id)<=1 THEN
    RAISE EXCEPTION 'A meeting keeps at least one member' USING ERRCODE='23514'; END IF;
   DELETE FROM public.meeting_members WHERE meeting_id=m.id AND user_id=target;
   changed:=ARRAY['members'];
  ELSE -- withdraw
   IF NOT (role='managing_director' OR actor=m.created_by) THEN
    RAISE EXCEPTION 'Only the person who created the meeting or the managing director withdraws it' USING ERRCODE='42501'; END IF;
   UPDATE public.meetings SET record_state='withdrawn',updated_at=clock_timestamp() WHERE id=m.id RETURNING * INTO m;
   changed:=ARRAY['record_state'];
  END IF;
 END IF;

 result:=jsonb_build_object('id',m.id,'version',m.record_version,'state',m.record_state);
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(actor,role::text,cmd,'meetings',m.id,changed,
  jsonb_strip_nulls(jsonb_build_object('user_id',CASE WHEN p_op IN ('add_member','remove_member') THEN target END,
   'meeting_date',m.meeting_date,'reason',left(m.title,200))),p_operation);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,cmd,p_operation,request,m.id,result);
 RETURN result;
END $$;

-- 4. meeting_point_command ----------------------------------------------------------------------
CREATE FUNCTION public.meeting_point_command(p_op text,p_meeting uuid,p_point uuid,p_payload jsonb,p_expected_version bigint,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); role public.user_role;
 cmd text:='meeting_point_'||coalesce(p_op,''); receipt taskpulse_private.command_receipts; result jsonb;
 payload jsonb:=coalesce(p_payload,'{}'::jsonb); request jsonb:=jsonb_build_array(p_op,p_meeting,p_point,p_payload,p_expected_version);
 m public.meetings; p public.meeting_points; before_row jsonb; after_row jsonb; owner uuid; who text;
 today date:=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date; v_status text; BEGIN
 role:=taskpulse_private.meeting_actor();
 IF p_op IS NULL OR p_op NOT IN ('add','edit','set_status','withdraw') OR p_operation IS NULL OR p_meeting IS NULL
  OR jsonb_typeof(payload)<>'object' OR (p_op<>'add' AND p_point IS NULL) THEN
  RAISE EXCEPTION 'Invalid meeting point command' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||cmd||p_operation::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=cmd AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;
 SELECT * INTO m FROM public.meetings x WHERE x.id=p_meeting AND x.organization_id=org FOR UPDATE;
 IF NOT FOUND OR NOT taskpulse_private.can_read_meeting(m.id) THEN RAISE EXCEPTION 'Meeting not found' USING ERRCODE='P0002'; END IF;
 IF m.record_state<>'active' THEN RAISE EXCEPTION 'This meeting was withdrawn' USING ERRCODE='23514'; END IF;
 IF p_op<>'add' THEN
  SELECT * INTO p FROM public.meeting_points x WHERE x.id=p_point AND x.meeting_id=m.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Point not found' USING ERRCODE='P0002'; END IF;
  IF p.validation_state='withdrawn' THEN RAISE EXCEPTION 'This point was withdrawn' USING ERRCODE='23514'; END IF;
  IF p_expected_version IS DISTINCT FROM p.record_version THEN
   RAISE EXCEPTION 'Someone else changed this point; reload first' USING ERRCODE='PT409'; END IF;
  before_row:=to_jsonb(p);
 END IF;

 IF p_op IN ('add','edit') THEN
  IF payload-ARRAY['point','owner_id','resolution_due','point_type','resolution','comments','resolution_status','related_task_id']<>'{}' THEN
   RAISE EXCEPTION 'Unexpected point fields' USING ERRCODE='23514'; END IF;
  IF p_op='add' OR payload ? 'point' THEN
   IF nullif(btrim(coalesce(payload->>'point','')),'') IS NULL OR length(payload->>'point')>4000 THEN
    RAISE EXCEPTION 'Write the point (up to 4,000 characters)' USING ERRCODE='23514'; END IF;
  END IF;
  IF payload->>'point_type' IS NOT NULL AND payload->>'point_type' NOT IN ('Blocking Issue','Concern','Lessons Learned','Work Improvement','General Point') THEN
   RAISE EXCEPTION 'Choose a point type from the list' USING ERRCODE='23514'; END IF;
  IF length(payload->>'resolution')>4000 OR length(payload->>'comments')>4000 THEN
   RAISE EXCEPTION 'Resolution and comments are at most 4,000 characters' USING ERRCODE='23514'; END IF;
  IF nullif(payload->>'resolution_due','') IS NOT NULL AND (payload->>'resolution_due'!~'^\d{4}-\d{2}-\d{2}$'
   OR NOT isfinite((payload->>'resolution_due')::date)) THEN RAISE EXCEPTION 'Due date is YYYY-MM-DD' USING ERRCODE='23514'; END IF;
  IF nullif(payload->>'related_task_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tasks t
   WHERE t.id::text=payload->>'related_task_id' AND t.organization_id=org) THEN RAISE EXCEPTION 'Mission not found' USING ERRCODE='P0002'; END IF;
  owner:=CASE WHEN payload ? 'owner_id' THEN nullif(payload->>'owner_id','')::uuid ELSE p.owner_id END;
  IF owner IS NOT NULL AND owner IS DISTINCT FROM p.owner_id
   AND NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=owner AND u.organization_id=org AND u.is_active) THEN
   RAISE EXCEPTION 'The person to resolve it must be an active member' USING ERRCODE='23514'; END IF;
 END IF;
 IF p_op IN ('add','edit','set_status') THEN
  v_status:=CASE WHEN payload ? 'resolution_status' THEN payload->>'resolution_status' ELSE coalesce(p.resolution_status,'Not Started') END;
  IF v_status IS NULL OR v_status NOT IN ('Not Started','In Progress','Discarded','Done') THEN
   RAISE EXCEPTION 'Choose Not started, In progress, Done or Discarded' USING ERRCODE='23514'; END IF;
 END IF;
 IF p_op='set_status' AND payload-ARRAY['resolution_status','resolution']<>'{}' THEN
  RAISE EXCEPTION 'Status and resolution only' USING ERRCODE='23514'; END IF;

 IF p_op='add' THEN
  INSERT INTO public.meeting_points(organization_id,meeting_id,meeting_date,meeting_type,posted_by,point,owner_id,point_type,
   resolution,comments,resolution_status,resolution_due,resolved_on,related_task_id,record_version,validation_state)
  VALUES(org,m.id,m.meeting_date,m.meeting_type,actor,btrim(payload->>'point'),owner,coalesce(payload->>'point_type','General Point'),
   nullif(btrim(coalesce(payload->>'resolution','')),''),nullif(btrim(coalesce(payload->>'comments','')),''),v_status,
   nullif(payload->>'resolution_due','')::date,CASE WHEN v_status='Done' THEN today END,nullif(payload->>'related_task_id','')::uuid,1,'pending')
  RETURNING * INTO p;
 ELSIF p_op IN ('edit','set_status') THEN
  UPDATE public.meeting_points SET
   point=CASE WHEN payload ? 'point' THEN btrim(payload->>'point') ELSE point END,
   owner_id=CASE WHEN p_op='edit' THEN owner ELSE owner_id END,
   point_type=CASE WHEN payload ? 'point_type' THEN payload->>'point_type' ELSE point_type END,
   resolution=CASE WHEN payload ? 'resolution' THEN nullif(btrim(coalesce(payload->>'resolution','')),'') ELSE resolution END,
   comments=CASE WHEN payload ? 'comments' THEN nullif(btrim(coalesce(payload->>'comments','')),'') ELSE comments END,
   resolution_due=CASE WHEN payload ? 'resolution_due' THEN nullif(payload->>'resolution_due','')::date ELSE resolution_due END,
   related_task_id=CASE WHEN payload ? 'related_task_id' THEN nullif(payload->>'related_task_id','')::uuid ELSE related_task_id END,
   resolution_status=v_status,
   resolved_on=CASE WHEN v_status='Done' THEN coalesce(CASE WHEN resolution_status='Done' THEN resolved_on END,today) END,
   record_version=record_version+1
  WHERE id=p.id RETURNING * INTO p;
 ELSE -- withdraw
  IF NOT (role='managing_director' OR actor=p.posted_by OR actor=m.created_by) THEN
   RAISE EXCEPTION 'Only the point''s author, the meeting''s creator or the managing director withdraws it' USING ERRCODE='42501'; END IF;
  UPDATE public.meeting_points SET validation_state='withdrawn',record_version=record_version+1 WHERE id=p.id RETURNING * INTO p;
 END IF;

 -- Whoever is to resolve a point joins the meeting, so they can read it.
 IF p_op IN ('add','edit') AND p.owner_id IS NOT NULL AND p.owner_id IS DISTINCT FROM (before_row->>'owner_id')::uuid THEN
  IF taskpulse_private.meeting_add_member(m.id,p.owner_id,m.title) THEN
   INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
   VALUES(actor,role::text,'meeting_add_member','meetings',m.id,ARRAY['members'],
    jsonb_build_object('user_id',p.owner_id,'meeting_date',m.meeting_date,'reason',left(m.title,200)),p_operation);
  END IF;
  IF p.owner_id<>actor THEN
   SELECT u.full_name INTO who FROM public.users u WHERE u.id=actor;
   PERFORM taskpulse_private.notify(org,ARRAY[p.owner_id],'meeting_point_owner',format('%s asks you to resolve a meeting point',who),
    left(p.point,200),'/meeting-points/'||m.id,'meeting_point_owner:'||p.id||':'||p.record_version);
  END IF;
 END IF;

 after_row:=to_jsonb(p);
 INSERT INTO taskpulse_private.input_history(kind,record_id,record_version,actor_id,command,reason,source)
 VALUES('meeting',p.id,p.record_version,actor,CASE WHEN p_op='withdraw' THEN 'withdraw' ELSE 'save' END,NULL,after_row);
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(actor,role::text,cmd,'meeting_points',p.id,
  ARRAY(SELECT k FROM jsonb_object_keys(after_row) k WHERE after_row->k IS DISTINCT FROM before_row->k AND k NOT IN ('updated_at','record_version')),
  jsonb_build_object('meeting_id',m.id,'version',p.record_version,'state',p.validation_state),p_operation);
 result:=jsonb_build_object('id',p.id,'meetingId',m.id,'version',p.record_version,'state',p.validation_state,'status',p.resolution_status);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,cmd,p_operation,request,p.id,result);
 RETURN result;
END $$;

-- Meeting points are written only through their meeting now.
SELECT pg_temp.m136_patch('public.dated_record_command(text,uuid,text,jsonb,bigint,uuid)',
 $f$DECLARE payload jsonb:=p_payload; holiday text; BEGIN$f$,
 $f$DECLARE payload jsonb:=p_payload; holiday text; BEGIN
 IF p_kind='meeting' THEN
  RAISE EXCEPTION 'Meeting points are kept in their meeting; open the meeting to add or change one' USING ERRCODE='23514'; END IF;$f$);

-- 5. Reads -----------------------------------------------------------------------------------------
CREATE FUNCTION taskpulse_private.meeting_json(m public.meetings) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',m.id,'title',m.title,'date',m.meeting_date,'startTime',to_char(m.start_time,'HH24:MI'),
  'meetingType',m.meeting_type,'businessId',m.business_id,
  'businessName',(SELECT b.name FROM taskpulse_private.businesses b WHERE b.id=m.business_id),'createdBy',m.created_by,'state',m.record_state,'createdAt',m.created_at,
  'members',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name,'active',u.is_active) ORDER BY u.full_name),'[]'::jsonb)
    FROM public.meeting_members x JOIN public.users u ON u.id=x.user_id WHERE x.meeting_id=m.id),
  -- The link only names the mission; opening it follows the mission's own rules.
  'missions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'tag',t.task_tag,'title',t.title,'status',t.status) ORDER BY t.task_tag),'[]'::jsonb)
    FROM public.meeting_missions x JOIN public.tasks t ON t.id=x.task_id WHERE x.meeting_id=m.id),
  'openPoints',(SELECT count(*) FROM public.meeting_points p WHERE p.meeting_id=m.id AND p.validation_state<>'withdrawn'
    AND coalesce(p.resolution_status,'Not Started') IN ('Not Started','In Progress')),
  'pointCount',(SELECT count(*) FROM public.meeting_points p WHERE p.meeting_id=m.id AND p.validation_state<>'withdrawn'),
  'labelIds',(SELECT coalesce(jsonb_agg(DISTINCT k.label_id),'[]'::jsonb) FROM public.label_links k JOIN public.meeting_points p
    ON p.id=k.subject_id WHERE k.subject_kind='meeting_point' AND p.meeting_id=m.id AND p.validation_state<>'withdrawn'));
$$;

CREATE FUNCTION public.meetings_list(p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_task uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM taskpulse_private.meeting_actor();
 RETURN (SELECT coalesce(jsonb_agg(taskpulse_private.meeting_json(s.m) ORDER BY s.d DESC,s.t DESC NULLS LAST,s.c DESC),'[]'::jsonb)
  FROM (SELECT x AS m,x.meeting_date AS d,x.start_time AS t,x.created_at AS c FROM public.meetings x
   WHERE x.organization_id=public.current_organization() AND x.record_state='active'
    AND (p_from IS NULL OR x.meeting_date>=p_from) AND (p_to IS NULL OR x.meeting_date<=p_to)
    AND (p_task IS NULL OR EXISTS(SELECT 1 FROM public.meeting_missions mm WHERE mm.meeting_id=x.id AND mm.task_id=p_task))
    AND taskpulse_private.can_read_meeting(x.id)
   ORDER BY x.meeting_date DESC,x.created_at DESC LIMIT 500) s);
END $$;

CREATE FUNCTION public.meeting_detail(p_meeting uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.meetings; role public.user_role; BEGIN
 role:=taskpulse_private.meeting_actor();
 SELECT * INTO m FROM public.meetings x WHERE x.id=p_meeting AND x.organization_id=public.current_organization();
 IF NOT FOUND OR NOT taskpulse_private.can_read_meeting(m.id) THEN RAISE EXCEPTION 'Meeting not found' USING ERRCODE='P0002'; END IF;
 RETURN taskpulse_private.meeting_json(m)||jsonb_build_object(
  'minutes',m.minutes,'version',m.record_version,'minutesSavedAt',m.minutes_saved_at,'minutesSavedBy',m.minutes_saved_by,
  'canEdit',m.record_state='active',
  'canManage',m.record_state='active' AND (role='managing_director' OR m.created_by=auth.uid()),
  'points',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'point',p.point,'authorId',p.posted_by,'ownerId',p.owner_id,
     'pointType',p.point_type,'status',coalesce(p.resolution_status,'Not Started'),'due',p.resolution_due,'resolvedOn',p.resolved_on,
     'resolution',p.resolution,'comments',p.comments,'relatedTaskId',p.related_task_id,'assetUrl',p.folder_url,'version',p.record_version,
     'createdAt',p.created_at,
     'canWithdraw',m.record_state='active' AND (role='managing_director' OR p.posted_by=auth.uid() OR m.created_by=auth.uid()))
    ORDER BY p.created_at,p.id),'[]'::jsonb)
   FROM public.meeting_points p WHERE p.meeting_id=m.id AND p.validation_state<>'withdrawn'));
END $$;

REVOKE ALL ON FUNCTION public.meeting_command(text,uuid,jsonb,bigint,uuid),
 public.meeting_point_command(text,uuid,uuid,jsonb,bigint,uuid),public.meetings_list(date,date,uuid),
 public.meeting_detail(uuid),public.can_read_meeting(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.meeting_command(text,uuid,jsonb,bigint,uuid),
 public.meeting_point_command(text,uuid,uuid,jsonb,bigint,uuid),public.meetings_list(date,date,uuid),
 public.meeting_detail(uuid),public.can_read_meeting(uuid) TO authenticated;
REVOKE ALL ON FUNCTION taskpulse_private.can_read_meeting(uuid),taskpulse_private.can_read_meeting_point(uuid),
 taskpulse_private.meeting_actor(),taskpulse_private.meeting_set_missions(uuid,jsonb),
 taskpulse_private.meeting_add_member(uuid,uuid,text),taskpulse_private.meeting_json(public.meetings)
 FROM PUBLIC,anon,authenticated,service_role;

-- 6. Labels, activity and history follow the meeting's readers -----------------------------------------
SELECT pg_temp.m136_patch('taskpulse_private.label_subject_readable(text,uuid)',
 $f$AND m.organization_id=public.current_organization() AND m.validation_state<>'withdrawn')$f$,
 $f$AND m.organization_id=public.current_organization() AND m.validation_state<>'withdrawn'
   AND taskpulse_private.can_read_meeting(m.meeting_id)
   AND EXISTS(SELECT 1 FROM public.meetings g WHERE g.id=m.meeting_id AND g.record_state='active'))$f$);
SELECT pg_temp.m136_patch('taskpulse_private.label_subject_editable(text,uuid)',
 $f$WHEN 'meeting_point' THEN public.get_user_role() IN ('managing_director','project_engineer','data_manager')
   OR EXISTS(SELECT 1 FROM public.meeting_points m WHERE m.id=p_id AND m.posted_by=auth.uid())$f$,
 $f$WHEN 'meeting_point' THEN true$f$);
SELECT pg_temp.m136_patch('public.labelled(text)',
 $f$'date',p.meeting_date) FROM public.meeting_points p$f$,
 $f$'date',p.meeting_date,'meetingId',p.meeting_id) FROM public.meeting_points p$f$);

SELECT pg_temp.m136_patch('public.activity_feed(date,date,text,uuid,jsonb,integer)',
 $f$('quest_owner_requests', 'missions', false)$f$,
 $f$('quest_owner_requests', 'missions', false),
      -- Meetings (migration 136): one meeting_<op> line each, for the meeting's members and the MD.
      ('meetings', 'records', false)$f$);
SELECT pg_temp.m136_patch('public.activity_feed(date,date,text,uuid,jsonb,integer)',
 $f$AND a.command NOT LIKE '%refresh%'$f$,
 $f$AND a.command NOT LIKE '%refresh%'
      -- Meeting lines only for the meeting's members and the MD (136).
      AND (a.table_name <> 'meetings' OR taskpulse_private.can_read_meeting(a.row_id))
      AND (a.table_name <> 'label_links' OR a.protected_changes ->> 'subject_kind' IS DISTINCT FROM 'meeting_point'
        OR taskpulse_private.can_read_meeting_point(taskpulse_private.activity_uuid(a.protected_changes ->> 'subject_id')))$f$);
SELECT pg_temp.m136_patch('public.activity_feed(date,date,text,uuid,jsonb,integer)',
 $f$AND h.command <> 'legacy_current_baseline'$f$,
 $f$AND h.command <> 'legacy_current_baseline'
      AND (h.kind <> 'meeting' OR taskpulse_private.can_read_meeting_point(h.record_id))$f$);

SELECT pg_temp.m136_patch('public.dated_record_history(text,uuid)',
 $f$admin:=public.get_user_role() IN ('managing_director','project_engineer') OR (p_kind<>'attendance' AND public.get_user_role()='data_manager');$f$,
 $f$IF p_kind='meeting' THEN
  -- A meeting point's history belongs to its meeting's members and the MD (136).
  IF NOT taskpulse_private.can_read_meeting_point(p_id) THEN RAISE EXCEPTION 'Own history or approved administration required' USING ERRCODE='42501'; END IF;
  admin:=true;
 ELSE
  admin:=public.get_user_role() IN ('managing_director','project_engineer') OR (p_kind<>'attendance' AND public.get_user_role()='data_manager');
 END IF;$f$);

COMMIT;
SELECT taskpulse_private.m15_secure();
