-- ===========================================================================
-- TaskPulse - company settings (candidate G) and the sheet tag allocator
-- (forward only; 52 is the conflict-code fix, 54 and 57 the activity log)
--
-- User decisions (DECISIONS, 21 October 2026: "Company settings and activity
-- log", "Month setup wizard"):
--   * Settings > Company (managing director only) holds, per company: labels,
--     active flags and order over the thirteen fixed mission codes (codes,
--     tags and scoring unchanged); meeting types with prefixes; the meeting
--     agenda; the standing missions list the month setup wizard uses; and a
--     holiday calendar.
--   * Tags take the sheet format <Mon><YY>_<PREFIX><n>, with one running
--     number per company per month shared by every prefix (Sep26_OT1 ...
--     Sep26_T4 ... Sep26_AD10, as in the September workbook), allocated in the
--     database. New missions saved without a tag and Task Tools copies use it
--     from now on; existing TT- and typed tags stay valid (no backfill).
--   * On a calendar holiday, an attendance save with no status defaults to
--     Holiday (regular hours 0, the holiday's name). It applies only once the
--     company has saved a calendar; recorded attendance stays the truth for
--     scoring and award gates. team_holiday_dates adds the calendar dates to
--     the derived "everyone recorded Holiday" rule.
--
-- New tables are private (no direct grants): signed-in callers use
-- company_settings() (any active member; standing missions for managers) and
-- company_settings_command() (managing director, versioned, idempotent per
-- operation, audited). Conflicts raise PT409, never 40001 (migration 52).
-- Seeds company #1 (the default organization) from the September workbook.
-- ===========================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE taskpulse_private.organization_settings (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE RESTRICT,
 meeting_agenda text NOT NULL DEFAULT '' CHECK (length(meeting_agenda)<=4000),
 -- {code: {label, active, sort}}; codes absent from the map use the defaults.
 category_overrides jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(category_overrides)='object'),
 version bigint NOT NULL DEFAULT 0 CHECK (version>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES public.users(id)
);
CREATE INDEX organization_settings_updated_by_idx ON taskpulse_private.organization_settings(updated_by) WHERE updated_by IS NOT NULL;

CREATE TABLE taskpulse_private.meeting_types (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 prefix text NOT NULL CHECK (prefix ~ '^[A-Z][A-Z0-9]{0,5}$'),
 name text NOT NULL CHECK (name=btrim(name) AND length(name) BETWEEN 1 AND 60),
 sort integer NOT NULL DEFAULT 0 CHECK (sort BETWEEN 0 AND 999),
 active boolean NOT NULL DEFAULT true,
 UNIQUE (organization_id,prefix)
);
CREATE UNIQUE INDEX meeting_types_name_per_company ON taskpulse_private.meeting_types(organization_id,lower(name));

CREATE TABLE taskpulse_private.company_holidays (
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 holiday_date date NOT NULL CHECK (isfinite(holiday_date)),
 name text NOT NULL CHECK (name=btrim(name) AND length(name) BETWEEN 1 AND 120),
 PRIMARY KEY (organization_id,holiday_date)
);

CREATE TABLE taskpulse_private.standing_missions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 -- {month} renders "September 2026", {member} the owner's name.
 title_pattern text NOT NULL CHECK (title_pattern=btrim(title_pattern) AND length(title_pattern) BETWEEN 1 AND 200
  AND regexp_replace(title_pattern,'\{(month|member)\}','','g') !~ '[{}]'),
 category public.task_category NOT NULL,
 priority public.task_priority NOT NULL DEFAULT 'Medium',
 owner_mode text NOT NULL CHECK (owner_mode IN ('per_member','single')),
 -- single: the fixed owner; NULL means the managing director chosen at setup.
 owner_id uuid REFERENCES public.users(id),
 scale_mode text NOT NULL DEFAULT 'hours' CHECK (scale_mode IN ('manual','hours','activity_count')),
 sort integer NOT NULL DEFAULT 0 CHECK (sort BETWEEN 0 AND 999),
 active boolean NOT NULL DEFAULT true,
 CHECK (owner_mode='single' OR owner_id IS NULL)
);
CREATE INDEX standing_missions_company_idx ON taskpulse_private.standing_missions(organization_id,sort);
CREATE INDEX standing_missions_owner_idx ON taskpulse_private.standing_missions(owner_id) WHERE owner_id IS NOT NULL;

-- One running number per company and month (the sheet numbers across prefixes).
CREATE TABLE taskpulse_private.task_tag_counters (
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 period_start date NOT NULL CHECK (period_start=date_trunc('month',period_start)::date),
 last_number integer NOT NULL CHECK (last_number>0),
 PRIMARY KEY (organization_id,period_start)
);

REVOKE ALL ON taskpulse_private.organization_settings,taskpulse_private.meeting_types,taskpulse_private.company_holidays,
 taskpulse_private.standing_missions,taskpulse_private.task_tag_counters FROM PUBLIC,anon,authenticated,service_role;

INSERT INTO taskpulse_private.m15_tenant_tables(table_schema,table_name) VALUES
 ('taskpulse_private','organization_settings'),('taskpulse_private','meeting_types'),('taskpulse_private','company_holidays'),
 ('taskpulse_private','standing_missions'),('taskpulse_private','task_tag_counters')
ON CONFLICT DO NOTHING;
INSERT INTO taskpulse_private.m15_org_refs(table_schema,table_name,column_name,ref_schema,ref_table) VALUES
 ('taskpulse_private','organization_settings','updated_by','public','users'),
 ('taskpulse_private','standing_missions','owner_id','public','users')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tag allocator
-- ---------------------------------------------------------------------------
CREATE FUNCTION taskpulse_private.allocate_task_tag(p_org uuid,p_month date,p_prefix text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m date; n integer; tag text; scope uuid:=taskpulse_private.m15_scope(); BEGIN
 IF p_org IS NULL OR (scope IS NOT NULL AND p_org<>scope) THEN
  RAISE EXCEPTION 'Tags are allocated in the caller''s company only' USING ERRCODE='42501'; END IF;
 IF p_month IS NULL OR NOT isfinite(p_month) OR p_prefix IS NULL OR p_prefix !~ '^[A-Z][A-Z0-9]{0,5}$' THEN
  RAISE EXCEPTION 'A month and an upper-case prefix are required' USING ERRCODE='23514'; END IF;
 m:=date_trunc('month',p_month)::date;
 -- Serializes allocations per company and month; released at commit.
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-task-tag:'||p_org::text||':'||m::text,0));
 SELECT c.last_number INTO n FROM taskpulse_private.task_tag_counters c WHERE c.organization_id=p_org AND c.period_start=m;
 n:=coalesce(n,0);
 -- Skip numbers already taken by typed or seeded tags and open Tools reservations.
 LOOP
  n:=n+1;
  tag:=to_char(m,'Mon')||to_char(m,'YY')||'_'||p_prefix||n;
  EXIT WHEN NOT EXISTS(SELECT 1 FROM public.tasks t WHERE t.organization_id=p_org AND t.task_tag=tag)
   AND NOT EXISTS(SELECT 1 FROM taskpulse_private.tool_tag_reservations r WHERE r.organization_id=p_org AND r.task_tag=tag);
 END LOOP;
 INSERT INTO taskpulse_private.task_tag_counters(organization_id,period_start,last_number) VALUES(p_org,m,n)
 ON CONFLICT (organization_id,period_start) DO UPDATE SET last_number=EXCLUDED.last_number;
 RETURN tag;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.allocate_task_tag(uuid,date,text) FROM PUBLIC,anon,authenticated,service_role;

-- A mission inserted without a tag gets the next one for its assignment month.
CREATE FUNCTION taskpulse_private.assign_task_tag() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF nullif(btrim(NEW.task_tag),'') IS NULL THEN
  NEW.task_tag:=taskpulse_private.allocate_task_tag(NEW.organization_id,
   coalesce(NEW.assigned_date,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date),NEW.category::text);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.assign_task_tag() FROM PUBLIC,anon,authenticated,service_role;
-- Named after aaa_m15_organization, which stamps the company first.
CREATE TRIGGER m53_assign_task_tag BEFORE INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION taskpulse_private.assign_task_tag();

-- Existing commands: a new mission may leave its tag blank, and Task Tools
-- copies take sheet tags. Each rewrite replaces exactly one known fragment of
-- the deployed definition (as 52 did), so later edits to the rest survive.
DO $$
DECLARE def text; fn regprocedure; frag text; repl text; spec record; BEGIN
 FOR spec IN SELECT * FROM (VALUES
  ('public.save_task_with_participants(uuid,jsonb,uuid[],uuid[],integer[],bigint,boolean,uuid)',
   'IF nullif(btrim(p_fields->>''task_tag''),'''') IS NULL OR nullif(btrim(p_fields->>''title''),'''') IS NULL OR',
   'IF (p_task_id IS NOT NULL AND nullif(btrim(p_fields->>''task_tag''),'''') IS NULL) OR nullif(btrim(p_fields->>''title''),'''') IS NULL OR'),
  ('public.task_tools_preview(text,jsonb)',
   'taskpulse_private.tool_tag()',
   'taskpulse_private.allocate_task_tag(t.organization_id,assigned,CASE WHEN p_command=''support'' AND kind=''skill'' THEN ''SD'' ELSE t.category::text END)')
 ) v(sig,old_text,new_text) LOOP
  fn:=spec.sig::regprocedure; frag:=spec.old_text; repl:=spec.new_text;
  def:=pg_catalog.pg_get_functiondef(fn);
  IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
   RAISE EXCEPTION '% no longer has exactly one "%"; update migration 53',spec.sig,frag; END IF;
  EXECUTE replace(def,frag,repl);
 END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Holiday default on the attendance write path
-- ---------------------------------------------------------------------------
-- The command itself is unchanged; it moves behind a wrapper that only fills
-- a missing attendance status on a calendar holiday before calling it.
ALTER FUNCTION public.dated_record_command(text,uuid,text,jsonb,bigint,uuid) RENAME TO dated_record_command_m53;
ALTER FUNCTION public.dated_record_command_m53(text,uuid,text,jsonb,bigint,uuid) SET SCHEMA taskpulse_private;
REVOKE ALL ON FUNCTION taskpulse_private.dated_record_command_m53(text,uuid,text,jsonb,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.dated_record_command(p_kind text,p_id uuid,p_command text,p_payload jsonb,p_expected_version bigint,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE payload jsonb:=p_payload; holiday text; BEGIN
 IF p_kind='attendance' AND p_command='save' AND jsonb_typeof(p_payload)='object'
  AND nullif(btrim(p_payload->>'attendance_status'),'') IS NULL
  AND p_payload->>'business_date' ~ '^\d{4}-\d{2}-\d{2}$' THEN
  SELECT h.name INTO holiday FROM taskpulse_private.company_holidays h
  WHERE h.organization_id=public.current_organization() AND h.holiday_date=(p_payload->>'business_date')::date;
  IF holiday IS NOT NULL THEN
   payload:=p_payload||jsonb_build_object('attendance_status','Holiday',
    'attendance_hours',coalesce(p_payload->'attendance_hours','0'::jsonb),
    'holiday_name',coalesce(to_jsonb(nullif(btrim(p_payload->>'holiday_name'),'')),to_jsonb(holiday)));
  END IF;
 END IF;
 RETURN taskpulse_private.dated_record_command_m53(p_kind,p_id,p_command,payload,p_expected_version,p_operation);
END $$;
REVOKE ALL ON FUNCTION public.dated_record_command(text,uuid,text,jsonb,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dated_record_command(text,uuid,text,jsonb,bigint,uuid) TO authenticated;

-- Calendar dates plus the derived rule (every active member recorded Holiday).
-- A signed-in member, or a service-role worker scoped to one company by the
-- x-taskpulse-organization header (the policies worker, migration 56).
CREATE OR REPLACE FUNCTION public.team_holiday_dates(p_from date,p_to date) RETURNS date[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result date[]; org uuid:=taskpulse_private.m15_scope(); BEGIN
 IF public.get_user_role() IS NULL AND NOT (auth.uid() IS NULL AND org IS NOT NULL) THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>62 THEN RAISE EXCEPTION 'Bounded date range of at most 63 days required' USING ERRCODE='23514'; END IF;
 SELECT coalesce(array_agg(d ORDER BY d),'{}') INTO result FROM (
  SELECT h.holiday_date AS d FROM taskpulse_private.company_holidays h
  WHERE h.organization_id=org AND h.holiday_date BETWEEN p_from AND p_to
  UNION
  SELECT x.d FROM generate_series(p_from,p_to,interval '1 day') AS g(day), LATERAL (SELECT g.day::date AS d) x
  WHERE EXISTS(SELECT 1 FROM public.users u WHERE u.is_active)
   AND NOT EXISTS(SELECT 1 FROM public.users u WHERE u.is_active AND NOT EXISTS(
    SELECT 1 FROM public.attendance_records a WHERE a.user_id=u.id AND a.attendance_date=x.d AND a.status='Holiday' AND a.record_state='active'))
 ) dates;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.team_holiday_dates(date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.team_holiday_dates(date,date) TO authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Read: any active member of the company
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.company_settings() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE role text:=public.get_user_role(); org uuid:=public.current_organization(); s taskpulse_private.organization_settings; BEGIN
 IF role IS NULL OR org IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM taskpulse_private.organization_settings WHERE organization_id=org;
 RETURN jsonb_build_object(
  'version',coalesce(s.version,0),
  'updatedAt',s.updated_at,
  'meetingAgenda',coalesce(s.meeting_agenda,''),
  'categoryOverrides',coalesce(s.category_overrides,'{}'::jsonb),
  'meetingTypes',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'prefix',m.prefix,'name',m.name,'sort',m.sort,'active',m.active) ORDER BY m.sort,m.prefix),'[]'::jsonb)
   FROM taskpulse_private.meeting_types m WHERE m.organization_id=org),
  'holidays',(SELECT coalesce(jsonb_agg(jsonb_build_object('date',h.holiday_date,'name',h.name) ORDER BY h.holiday_date),'[]'::jsonb)
   FROM taskpulse_private.company_holidays h WHERE h.organization_id=org),
  -- The month setup list is for the people who set months up.
  'standingMissions',CASE WHEN role IN ('managing_director','project_engineer') THEN
   (SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'titlePattern',x.title_pattern,'category',x.category,'priority',x.priority,'ownerMode',x.owner_mode,
     'ownerId',x.owner_id,'scaleMode',x.scale_mode,'sort',x.sort,'active',x.active) ORDER BY x.sort,x.title_pattern),'[]'::jsonb)
    FROM taskpulse_private.standing_missions x WHERE x.organization_id=org) ELSE '[]'::jsonb END);
END $$;
REVOKE ALL ON FUNCTION public.company_settings() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.company_settings() TO authenticated;

-- ---------------------------------------------------------------------------
-- Command: managing director, one section per call
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.company_settings_command(p_section text,p_payload jsonb,p_expected_version bigint,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); s taskpulse_private.organization_settings;
 receipt taskpulse_private.command_receipts; cmd text; item jsonb; code text; list jsonb; normalized jsonb:='{}'; result jsonb;
 request jsonb:=jsonb_build_object('section',p_section,'payload',p_payload,'expectedVersion',p_expected_version);
 codes text[]:=enum_range(NULL::public.task_category)::text[]; BEGIN
 IF actor IS NULL OR org IS NULL OR public.get_user_role() IS DISTINCT FROM 'managing_director' THEN
  RAISE EXCEPTION 'Only an active managing director can change company settings' USING ERRCODE='42501'; END IF;
 IF p_section IS NULL OR p_section NOT IN ('agenda','categories','meeting_types','standing_missions','holidays')
  OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR p_operation IS NULL OR p_expected_version IS NULL THEN
  RAISE EXCEPTION 'A known section, object payload, expected version and operation are required' USING ERRCODE='23514'; END IF;
 cmd:='company_settings_'||p_section;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-company-settings:'||org::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=cmd AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;
 INSERT INTO taskpulse_private.organization_settings(organization_id) VALUES(org) ON CONFLICT DO NOTHING;
 SELECT * INTO s FROM taskpulse_private.organization_settings WHERE organization_id=org FOR UPDATE;
 IF s.version<>p_expected_version THEN
  RAISE EXCEPTION 'Company settings changed; reload and try again' USING ERRCODE='PT409'; END IF;

 IF p_section='agenda' THEN
  IF p_payload-'agenda'<>'{}' OR jsonb_typeof(p_payload->'agenda') IS DISTINCT FROM 'string' OR length(p_payload->>'agenda')>4000 THEN
   RAISE EXCEPTION 'Agenda text of up to 4000 characters required' USING ERRCODE='23514'; END IF;
  UPDATE taskpulse_private.organization_settings SET meeting_agenda=btrim(p_payload->>'agenda') WHERE organization_id=org;

 ELSIF p_section='categories' THEN
  IF p_payload-'overrides'<>'{}' OR jsonb_typeof(p_payload->'overrides') IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'Category overrides object required' USING ERRCODE='23514'; END IF;
  FOR code,item IN SELECT key,value FROM jsonb_each(p_payload->'overrides') LOOP
   IF NOT code=ANY(codes) THEN RAISE EXCEPTION 'Unknown mission type code %',code USING ERRCODE='23514'; END IF;
   IF jsonb_typeof(item)<>'object' OR item-ARRAY['label','active','sort']<>'{}'
    OR (item?'label' AND (jsonb_typeof(item->'label')<>'string' OR length(btrim(item->>'label')) NOT BETWEEN 1 AND 60))
    OR (item?'active' AND jsonb_typeof(item->'active')<>'boolean')
    OR (item?'sort' AND (jsonb_typeof(item->'sort')<>'number' OR (item->>'sort')!~'^\d{1,3}$')) THEN
    RAISE EXCEPTION 'Mission type % needs a label of 1-60 characters, an active flag and an order of 0-999',code USING ERRCODE='23514'; END IF;
   normalized:=normalized||jsonb_build_object(code,jsonb_strip_nulls(jsonb_build_object('label',btrim(item->>'label'),'active',item->'active','sort',item->'sort')));
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM unnest(codes) c WHERE coalesce((normalized->c->>'active')::boolean,true)) THEN
   RAISE EXCEPTION 'At least one mission type must stay active' USING ERRCODE='23514'; END IF;
  UPDATE taskpulse_private.organization_settings SET category_overrides=normalized WHERE organization_id=org;

 ELSIF p_section='meeting_types' THEN
  list:=p_payload->'types';
  IF p_payload-'types'<>'{}' OR jsonb_typeof(list) IS DISTINCT FROM 'array' OR jsonb_array_length(list)>40 THEN
   RAISE EXCEPTION 'A list of up to 40 meeting types required' USING ERRCODE='23514'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(list) LOOP
   IF jsonb_typeof(item)<>'object' OR item-ARRAY['id','prefix','name','sort','active']<>'{}'
    OR (item->>'id' IS NOT NULL AND item->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    OR coalesce(item->>'prefix','') !~ '^[A-Z][A-Z0-9]{0,5}$'
    OR length(btrim(coalesce(item->>'name',''))) NOT BETWEEN 1 AND 60
    OR (item?'sort' AND coalesce(item->>'sort','') !~ '^\d{1,3}$')
    OR (item?'active' AND jsonb_typeof(item->'active')<>'boolean') THEN
    RAISE EXCEPTION 'Each meeting type needs a prefix (capital letters/digits, up to 6), a name of 1-60 characters and an order of 0-999' USING ERRCODE='23514'; END IF;
  END LOOP;
  -- Replace the set (nothing references these rows; ids are kept), so
  -- swapping two prefixes or names in one save is allowed.
  DELETE FROM taskpulse_private.meeting_types WHERE organization_id=org;
  BEGIN
   INSERT INTO taskpulse_private.meeting_types(id,organization_id,prefix,name,sort,active)
   SELECT coalesce((x->>'id')::uuid,gen_random_uuid()),org,x->>'prefix',btrim(x->>'name'),coalesce((x->>'sort')::integer,(o-1)::integer),coalesce((x->>'active')::boolean,true)
   FROM jsonb_array_elements(list) WITH ORDINALITY e(x,o);
  EXCEPTION WHEN unique_violation THEN
   RAISE EXCEPTION 'Meeting type prefixes and names must be unique' USING ERRCODE='23505';
  END;

 ELSIF p_section='standing_missions' THEN
  list:=p_payload->'missions';
  IF p_payload-'missions'<>'{}' OR jsonb_typeof(list) IS DISTINCT FROM 'array' OR jsonb_array_length(list)>60 THEN
   RAISE EXCEPTION 'A list of up to 60 standing missions required' USING ERRCODE='23514'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(list) LOOP
   IF jsonb_typeof(item)<>'object' OR item-ARRAY['id','titlePattern','category','priority','ownerMode','ownerId','scaleMode','sort','active']<>'{}'
    OR (item->>'id' IS NOT NULL AND item->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    OR length(btrim(coalesce(item->>'titlePattern',''))) NOT BETWEEN 1 AND 200
    OR regexp_replace(item->>'titlePattern','\{(month|member)\}','','g') ~ '[{}]'
    OR NOT coalesce(item->>'category','')=ANY(codes)
    OR NOT coalesce(item->>'priority','Medium')=ANY(enum_range(NULL::public.task_priority)::text[])
    OR coalesce(item->>'ownerMode','') NOT IN ('per_member','single')
    OR coalesce(item->>'scaleMode','hours') NOT IN ('manual','hours','activity_count')
    OR (item?'sort' AND coalesce(item->>'sort','') !~ '^\d{1,3}$')
    OR (item?'active' AND jsonb_typeof(item->'active')<>'boolean') THEN
    RAISE EXCEPTION 'Each standing mission needs a title (only {month} and {member} placeholders), a mission type, a priority, an owner mode and a scale mode' USING ERRCODE='23514'; END IF;
   IF item->>'ownerId' IS NOT NULL AND (item->>'ownerMode'<>'single'
    OR item->>'ownerId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=(item->>'ownerId')::uuid AND u.organization_id=org AND u.is_active)) THEN
    RAISE EXCEPTION 'A single owner must be an active member of your company' USING ERRCODE='23514'; END IF;
  END LOOP;
  DELETE FROM taskpulse_private.standing_missions WHERE organization_id=org;
  BEGIN
   INSERT INTO taskpulse_private.standing_missions(id,organization_id,title_pattern,category,priority,owner_mode,owner_id,scale_mode,sort,active)
   SELECT coalesce((x->>'id')::uuid,gen_random_uuid()),org,btrim(x->>'titlePattern'),(x->>'category')::public.task_category,
    coalesce(x->>'priority','Medium')::public.task_priority,x->>'ownerMode',(x->>'ownerId')::uuid,coalesce(x->>'scaleMode','hours'),
    coalesce((x->>'sort')::integer,(o-1)::integer),coalesce((x->>'active')::boolean,true)
   FROM jsonb_array_elements(list) WITH ORDINALITY e(x,o);
  EXCEPTION WHEN unique_violation THEN
   RAISE EXCEPTION 'Standing mission ids must be unique' USING ERRCODE='23505';
  END;

 ELSE -- holidays
  list:=p_payload->'holidays';
  IF p_payload-'holidays'<>'{}' OR jsonb_typeof(list) IS DISTINCT FROM 'array' OR jsonb_array_length(list)>1000 THEN
   RAISE EXCEPTION 'A list of up to 1000 holidays required' USING ERRCODE='23514'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(list) LOOP
   IF jsonb_typeof(item)<>'object' OR item-ARRAY['date','name']<>'{}'
    OR coalesce(item->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' OR length(btrim(coalesce(item->>'name',''))) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Each holiday needs an ISO date and a name of 1-120 characters' USING ERRCODE='23514'; END IF;
  END LOOP;
  DELETE FROM taskpulse_private.company_holidays WHERE organization_id=org;
  BEGIN
   INSERT INTO taskpulse_private.company_holidays(organization_id,holiday_date,name)
   SELECT org,(x->>'date')::date,btrim(x->>'name') FROM jsonb_array_elements(list) x;
  EXCEPTION WHEN unique_violation THEN
   RAISE EXCEPTION 'Each date can hold one holiday' USING ERRCODE='23505';
  WHEN datetime_field_overflow OR invalid_datetime_format THEN
   RAISE EXCEPTION 'Each holiday needs a valid calendar date' USING ERRCODE='23514';
  END;
 END IF;

 UPDATE taskpulse_private.organization_settings SET version=version+1,updated_at=clock_timestamp(),updated_by=actor
 WHERE organization_id=org RETURNING * INTO s;
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(actor,'managing_director',cmd,'organization_settings',org,ARRAY[p_section],jsonb_build_object('version',s.version),p_operation);
 result:=jsonb_build_object('section',p_section,'version',s.version);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,cmd,p_operation,request,org,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.company_settings_command(text,jsonb,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.company_settings_command(text,jsonb,bigint,uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Company #1 from the September 2026 workbook (A_Sheet_Attributes,
-- 3_Meeting Points, the standing rows of 2_Tasks)
-- ---------------------------------------------------------------------------
DO $$ DECLARE org uuid; BEGIN
 SELECT id INTO org FROM public.organizations WHERE is_default;
 IF org IS NULL THEN RETURN; END IF;
 INSERT INTO taskpulse_private.organization_settings(organization_id,meeting_agenda)
 VALUES(org,E'Regular Meeting Agenda:\n\n1. Review Reports\n2. Raise Concerns\n3. Pitch in Ideas\n4. Share lessons learnt')
 ON CONFLICT DO NOTHING;
 INSERT INTO taskpulse_private.meeting_types(organization_id,prefix,name,sort) VALUES
  (org,'DL','Daily',0),(org,'WL','Weekly',1),(org,'ML','Monthly',2),(org,'QTL','Quarterly',3),
  (org,'PRF','Performance Review',4),(org,'SCD','Scheduled Discussion',5),(org,'PP','Project Progress',6),(org,'AH','Ad-Hoc',7)
 ON CONFLICT DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM taskpulse_private.standing_missions WHERE organization_id=org) THEN
  INSERT INTO taskpulse_private.standing_missions(organization_id,title_pattern,category,priority,owner_mode,scale_mode,sort) VALUES
   (org,'Off Hours - {month} - {member}','OT','No','per_member','manual',0),
   (org,'Non-Documented Tasks - {month} - {member}','T','Medium','per_member','hours',1),
   (org,'Non-Task and Ad-Hoc Meetings - {month} - {member}','T','Medium','per_member','hours',2),
   (org,'Tasks Tracker, Accounts Book and Attendance Sheet - {month}','AD','Medium','single','hours',3),
   (org,'HRC Tasks - {month}','T','Medium','single','hours',4),
   (org,'Database Re-Organisation','WK','Medium','single','hours',5);
 END IF;
END $$;

COMMIT;
SELECT taskpulse_private.m15_secure();
