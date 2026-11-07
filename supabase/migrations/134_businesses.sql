-- ===========================================================================
-- TaskPulse - Businesses (forward only; 7 November 2026)
--
-- User request (7 November 2026): the company runs several businesses (3D
-- printing, fish sales, construction services). Missions belong to at most one
-- business, each member works in some of them, and Missions and Today open on
-- the member's own businesses with a chip switcher. A business is a VIEW, not
-- a permission: mission rows stay visible company-wide and work content stays
-- under can_read_mission_work (117). Nothing here feeds a score.
--
-- 1. taskpulse_private.businesses: the company's list (name, slug, theme
--    colour token, sort, active). Editable and archivable, never deleted.
--    Seeded for company #1 (the default company): "3D printing",
--    "Fish sales" and "Construction services".
-- 2. taskpulse_private.user_businesses (user, business): who works in which
--    business, set by the managing director on the person's Team profile.
-- 3. public.tasks.business_id (nullable). Set:
--    - on create and edit through save_task_with_participants (and so
--      create_task_with_scale): p_fields may carry 'business_id' (null or ''
--      clears); the MD and Managers, as before;
--    - from the mission page through task_business_command: the MD, Managers
--      and the mission's Crew (whoever may edit the mission).
--    A new or changed business must be active and in the caller's company.
--    Sub-missions take their parent's business: a trigger on the Subtask
--    dependency fills an empty business_id from the parent.
-- 4. Commands (idempotent through command_receipts, audited):
--    business_command(op, business, name, colour, sort, operation): create,
--      update, archive, restore - managing director only.
--    user_businesses_command(user, businesses[], operation): replaces one
--      person's list - managing director only.
--    task_business_command(task, business, operation): sets or clears a
--      mission's business.
-- 5. Reads (every active member of the company):
--    businesses()      the list with each business's members, canManage.
--    my_businesses()   the caller's active businesses (ids, sorted).
--    business_summary() per business and for "no business": open missions,
--      permanent missions (null until tasks.is_permanent exists, migration
--      135), and this week's logged hours (Monday to today, India time,
--      unreversed logs; mission hour totals are already company-wide through
--      team_task_effort_totals).
-- ===========================================================================
BEGIN;

CREATE FUNCTION pg_temp.m134_patch(fn regprocedure, frag text, repl text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(fn);
BEGIN
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION '% does not contain this fragment exactly once; update migration 134: %',fn,left(frag,80); END IF;
 EXECUTE replace(def,frag,repl);
END $$;

-- 1. Businesses ----------------------------------------------------------------
CREATE TABLE taskpulse_private.businesses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK (name=btrim(name) AND length(name) BETWEEN 1 AND 60),
 slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug)<=60),
 colour text NOT NULL DEFAULT 'neutral'
  CHECK (colour IN ('neutral','primary','success','attention','danger','recognition')),
 sort integer NOT NULL DEFAULT 0 CHECK (sort BETWEEN 0 AND 999),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE (organization_id,slug)
);
CREATE INDEX businesses_company_idx ON taskpulse_private.businesses(organization_id,sort);
REVOKE ALL ON taskpulse_private.businesses FROM PUBLIC,anon,authenticated,service_role;

-- 2. Who works in which business -----------------------------------------------
CREATE TABLE taskpulse_private.user_businesses (
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 business_id uuid NOT NULL REFERENCES taskpulse_private.businesses(id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (user_id,business_id)
);
CREATE INDEX user_businesses_business_idx ON taskpulse_private.user_businesses(business_id);
REVOKE ALL ON taskpulse_private.user_businesses FROM PUBLIC,anon,authenticated,service_role;

-- 3. The mission's business -----------------------------------------------------
ALTER TABLE public.tasks ADD COLUMN business_id uuid REFERENCES taskpulse_private.businesses(id) ON DELETE RESTRICT;
CREATE INDEX tasks_business_idx ON public.tasks(business_id) WHERE business_id IS NOT NULL;
-- Writes go through the commands only (as every other tasks column since 16).
REVOKE INSERT(business_id),UPDATE(business_id) ON public.tasks FROM anon,authenticated;

INSERT INTO taskpulse_private.m15_tenant_tables(table_schema,table_name) VALUES
 ('taskpulse_private','businesses'),('taskpulse_private','user_businesses')
ON CONFLICT DO NOTHING;
INSERT INTO taskpulse_private.m15_org_refs(table_schema,table_name,column_name,ref_schema,ref_table) VALUES
 ('taskpulse_private','user_businesses','user_id','public','users'),
 ('taskpulse_private','user_businesses','business_id','taskpulse_private','businesses'),
 ('public','tasks','business_id','taskpulse_private','businesses')
ON CONFLICT DO NOTHING;

-- Company #1's businesses (user decision, 7 November 2026).
INSERT INTO taskpulse_private.businesses(organization_id,name,slug,colour,sort)
SELECT o.id,v.name,v.slug,v.colour,v.sort FROM public.organizations o
CROSS JOIN (VALUES ('3D printing','3d-printing','primary',10),('Fish sales','fish-sales','success',20),
 ('Construction services','construction-services','attention',30)) v(name,slug,colour,sort)
WHERE o.is_default
ON CONFLICT DO NOTHING;

-- Helpers -------------------------------------------------------------------------
CREATE FUNCTION taskpulse_private.business_slug(p_name text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT nullif(left(btrim(regexp_replace(lower(coalesce(p_name,'')),'[^a-z0-9]+','-','g'),'-'),60),'');
$$;

CREATE FUNCTION taskpulse_private.business_json(b taskpulse_private.businesses) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',b.id,'name',b.name,'slug',b.slug,'colour',b.colour,'sort',b.sort,'archived',NOT b.active);
$$;

CREATE FUNCTION taskpulse_private.business_require_member() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF auth.uid() IS NULL OR public.get_user_role() IS NULL OR public.current_organization() IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
END $$;

-- A business a mission may move to: active and in the caller's company. NULL clears.
CREATE FUNCTION taskpulse_private.business_for_mission(p_business text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v uuid; BEGIN
 IF nullif(btrim(coalesce(p_business,'')),'') IS NULL THEN RETURN NULL; END IF;
 IF p_business !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'Choose a business from your company''s list' USING ERRCODE='23514'; END IF;
 SELECT b.id INTO v FROM taskpulse_private.businesses b
  WHERE b.id=p_business::uuid AND b.organization_id=public.current_organization() AND b.active;
 IF v IS NULL THEN RAISE EXCEPTION 'Choose an active business from your company''s list' USING ERRCODE='23514'; END IF;
 RETURN v;
END $$;

-- Sets a mission's business and audits a change. The caller has been authorised.
CREATE FUNCTION taskpulse_private.apply_task_business(p_task uuid,p_business text,p_operation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE before_id uuid; after_id uuid; org uuid; BEGIN
 SELECT t.business_id,t.organization_id INTO before_id,org FROM public.tasks t WHERE t.id=p_task FOR UPDATE;
 -- An unchanged archived business may stay on the mission; any change must be to an active one.
 IF nullif(btrim(coalesce(p_business,'')),'') IS NOT NULL AND p_business=before_id::text THEN RETURN before_id; END IF;
 after_id:=taskpulse_private.business_for_mission(p_business);
 IF after_id IS NOT DISTINCT FROM before_id THEN RETURN after_id; END IF;
 UPDATE public.tasks SET business_id=after_id WHERE id=p_task;
 INSERT INTO taskpulse_private.audit_events(organization_id,actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(org,auth.uid(),coalesce(public.get_user_role()::text,'system'),'task_business_set','tasks',p_task,ARRAY['business_id'],
  jsonb_build_object('business',jsonb_build_object(
   'before',(SELECT b.name FROM taskpulse_private.businesses b WHERE b.id=before_id),
   'after',(SELECT b.name FROM taskpulse_private.businesses b WHERE b.id=after_id))),p_operation);
 RETURN after_id;
END $$;

-- 4a. Create and edit carry the business ------------------------------------------
SELECT pg_temp.m134_patch('public.save_task_with_participants(uuid,jsonb,uuid[],uuid[],integer[],bigint,boolean,uuid)',
 $f$'initialize_details']<>'{}'::jsonb$f$,
 $f$'initialize_details','business_id']<>'{}'::jsonb$f$);
SELECT pg_temp.m134_patch('public.save_task_with_participants(uuid,jsonb,uuid[],uuid[],integer[],bigint,boolean,uuid)',
 $f$RETURN tid;$f$,
 $f$IF p_fields?'business_id' THEN  -- 134: the mission's business
  PERFORM taskpulse_private.apply_task_business(tid,p_fields->>'business_id',p_operation_id);
 END IF;
 RETURN tid;$f$);

-- 4b. Sub-missions take their parent's business ------------------------------------
CREATE FUNCTION taskpulse_private.inherit_parent_business() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 UPDATE public.tasks c SET business_id=p.business_id
  FROM public.tasks p
  WHERE c.id=NEW.successor_task_id AND p.id=NEW.predecessor_task_id
   AND c.business_id IS NULL AND p.business_id IS NOT NULL AND c.organization_id=p.organization_id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.inherit_parent_business() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_m134_sub_mission_business AFTER INSERT ON public.task_dependencies
 FOR EACH ROW WHEN (NEW.relation_type='Subtask') EXECUTE FUNCTION taskpulse_private.inherit_parent_business();

-- Existing sub-missions with no business follow their parent (none today: the column is new).

-- 5. Reads ---------------------------------------------------------------------------
CREATE FUNCTION public.businesses() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM taskpulse_private.business_require_member();
 RETURN jsonb_build_object(
  'canManage',public.get_user_role()='managing_director',
  'businesses',(SELECT coalesce(jsonb_agg(taskpulse_private.business_json(b)||jsonb_build_object('memberIds',
    (SELECT coalesce(jsonb_agg(ub.user_id ORDER BY ub.user_id),'[]'::jsonb) FROM taskpulse_private.user_businesses ub
      JOIN public.users u ON u.id=ub.user_id AND u.organization_id=b.organization_id WHERE ub.business_id=b.id))
   ORDER BY NOT b.active,b.sort,lower(b.name)),'[]'::jsonb)
   FROM taskpulse_private.businesses b WHERE b.organization_id=public.current_organization()));
END $$;

CREATE FUNCTION public.my_businesses() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM taskpulse_private.business_require_member();
 RETURN (SELECT coalesce(jsonb_agg(b.id ORDER BY b.sort,lower(b.name)),'[]'::jsonb)
  FROM taskpulse_private.user_businesses ub JOIN taskpulse_private.businesses b ON b.id=ub.business_id
  WHERE ub.user_id=auth.uid() AND b.active AND b.organization_id=public.current_organization());
END $$;

CREATE FUNCTION public.business_summary() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.current_organization(); today date:=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
 week_start date; has_permanent boolean; BEGIN
 PERFORM taskpulse_private.business_require_member();
 week_start:=today-(extract(isodow FROM today)::int-1);
 -- Migration 135 adds tasks.is_permanent; until then the permanent count is null.
 has_permanent:=EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.tasks'::regclass
  AND attname='is_permanent' AND attnum>0 AND NOT attisdropped);
 RETURN jsonb_build_object('weekStart',week_start,'today',today,'permanentAvailable',has_permanent,
  'rows',(SELECT coalesce(jsonb_agg(jsonb_build_object('businessId',s.business_id,'openMissions',s.open_missions,
    'permanentMissions',CASE WHEN has_permanent THEN s.permanent_missions END,'weekHours',round(s.week_hours,2))),'[]'::jsonb)
   FROM (
    SELECT t.business_id,
     count(*) FILTER (WHERE t.status NOT IN ('Done','Discarded') AND t.archived_effective_date IS NULL
      AND NOT coalesce((to_jsonb(t)->>'is_permanent')::boolean,false)) AS open_missions,
     count(*) FILTER (WHERE t.archived_effective_date IS NULL AND t.status<>'Discarded'
      AND coalesce((to_jsonb(t)->>'is_permanent')::boolean,false)) AS permanent_missions,
     coalesce(sum((SELECT sum(l.hours_worked) FROM public.daily_task_logs l WHERE l.task_id=t.id AND l.reversed_at IS NULL
      AND l.log_date BETWEEN week_start AND today)),0) AS week_hours
    FROM public.tasks t WHERE t.organization_id=org
    GROUP BY t.business_id) s));
END $$;

-- 6. Commands ------------------------------------------------------------------------
CREATE FUNCTION public.business_command(p_op text,p_business uuid,p_name text,p_colour text,p_sort integer,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); caller_role public.user_role:=public.get_user_role();
 receipt taskpulse_private.command_receipts; cmd text:='business_'||coalesce(p_op,''); v_name text; v_slug text;
 saved taskpulse_private.businesses; before_row taskpulse_private.businesses; result jsonb;
 request jsonb:=jsonb_build_array(p_op,p_business,p_name,p_colour,p_sort); BEGIN
 PERFORM taskpulse_private.business_require_member();
 IF caller_role IS DISTINCT FROM 'managing_director' THEN
  RAISE EXCEPTION 'Only the managing director manages businesses' USING ERRCODE='42501'; END IF;
 IF p_op IS NULL OR p_op NOT IN ('create','update','archive','restore') OR p_operation IS NULL THEN
  RAISE EXCEPTION 'Create, update, archive or restore, with an operation id' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('businesses:'||org::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=cmd AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;
 IF p_op<>'create' THEN
  SELECT * INTO before_row FROM taskpulse_private.businesses b WHERE b.id=p_business AND b.organization_id=org FOR UPDATE;
  IF before_row.id IS NULL THEN RAISE EXCEPTION 'Business not found' USING ERRCODE='P0002'; END IF;
 END IF;
 IF p_op IN ('create','update') THEN
  v_name:=regexp_replace(btrim(coalesce(p_name,before_row.name,'')),'\s+',' ','g');
  v_slug:=taskpulse_private.business_slug(v_name);
  IF v_slug IS NULL OR length(v_name)>60 THEN
   RAISE EXCEPTION 'A business needs a name of up to 60 characters with a letter or number' USING ERRCODE='23514'; END IF;
  IF p_colour IS NOT NULL AND p_colour NOT IN ('neutral','primary','success','attention','danger','recognition') THEN
   RAISE EXCEPTION 'Unknown business colour' USING ERRCODE='23514'; END IF;
  IF p_sort IS NOT NULL AND p_sort NOT BETWEEN 0 AND 999 THEN
   RAISE EXCEPTION 'Order is a number from 0 to 999' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM taskpulse_private.businesses b WHERE b.organization_id=org AND b.slug=v_slug AND b.id IS DISTINCT FROM p_business) THEN
   RAISE EXCEPTION 'A business with that name already exists' USING ERRCODE='23505'; END IF;
 END IF;
 IF p_op='create' THEN
  IF (SELECT count(*) FROM taskpulse_private.businesses WHERE organization_id=org)>=50 THEN
   RAISE EXCEPTION 'A company keeps up to 50 businesses' USING ERRCODE='23514'; END IF;
  INSERT INTO taskpulse_private.businesses(organization_id,name,slug,colour,sort)
  VALUES(org,v_name,v_slug,coalesce(p_colour,'neutral'),
   coalesce(p_sort,(SELECT least(999,coalesce(max(sort),0)+10) FROM taskpulse_private.businesses WHERE organization_id=org)))
  RETURNING * INTO saved;
 ELSIF p_op='update' THEN
  UPDATE taskpulse_private.businesses SET name=v_name,slug=v_slug,colour=coalesce(p_colour,colour),sort=coalesce(p_sort,sort)
  WHERE id=p_business RETURNING * INTO saved;
 ELSE
  UPDATE taskpulse_private.businesses SET active=(p_op='restore') WHERE id=p_business RETURNING * INTO saved;
 END IF;
 INSERT INTO taskpulse_private.audit_events(organization_id,actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(org,actor,caller_role::text,cmd,'businesses',saved.id,
  CASE p_op WHEN 'create' THEN ARRAY['name','slug','colour','sort'] WHEN 'update' THEN ARRAY['name','slug','colour','sort'] ELSE ARRAY['active'] END,
  jsonb_build_object('name',jsonb_build_object('before',before_row.name,'after',saved.name)),p_operation);
 result:=taskpulse_private.business_json(saved);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,cmd,p_operation,request,saved.id,result);
 RETURN result;
END $$;

CREATE FUNCTION public.user_businesses_command(p_user uuid,p_businesses uuid[],p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); caller_role public.user_role:=public.get_user_role();
 receipt taskpulse_private.command_receipts; cmd text:='user_businesses_set'; wanted uuid[]; before_names jsonb; after_names jsonb;
 result jsonb; request jsonb:=jsonb_build_array(p_user,p_businesses); BEGIN
 PERFORM taskpulse_private.business_require_member();
 IF caller_role IS DISTINCT FROM 'managing_director' THEN
  RAISE EXCEPTION 'Only the managing director chooses a person''s businesses' USING ERRCODE='42501'; END IF;
 IF p_user IS NULL OR p_operation IS NULL THEN
  RAISE EXCEPTION 'Choose a person, with an operation id' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_user AND u.organization_id=org) THEN
  RAISE EXCEPTION 'Person not found' USING ERRCODE='P0002'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('user_businesses:'||p_user::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=cmd AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;
 wanted:=coalesce((SELECT array_agg(DISTINCT x) FROM unnest(p_businesses) x WHERE x IS NOT NULL),'{}');
 -- Each business is in this company; a newly added one must be active (an archived one may stay).
 IF EXISTS(SELECT 1 FROM unnest(wanted) x WHERE NOT EXISTS(SELECT 1 FROM taskpulse_private.businesses b
   WHERE b.id=x AND b.organization_id=org AND (b.active OR EXISTS(SELECT 1 FROM taskpulse_private.user_businesses ub
    WHERE ub.user_id=p_user AND ub.business_id=x)))) THEN
  RAISE EXCEPTION 'Choose active businesses from your company''s list' USING ERRCODE='23514'; END IF;
 SELECT coalesce(jsonb_agg(b.name ORDER BY b.sort,lower(b.name)),'[]') INTO before_names
  FROM taskpulse_private.user_businesses ub JOIN taskpulse_private.businesses b ON b.id=ub.business_id WHERE ub.user_id=p_user;
 DELETE FROM taskpulse_private.user_businesses WHERE user_id=p_user AND NOT(business_id=ANY(wanted));
 INSERT INTO taskpulse_private.user_businesses(user_id,business_id,organization_id)
  SELECT p_user,x,org FROM unnest(wanted) x ON CONFLICT DO NOTHING;
 SELECT coalesce(jsonb_agg(b.name ORDER BY b.sort,lower(b.name)),'[]'),
  jsonb_build_object('userId',p_user,'businessIds',coalesce(jsonb_agg(b.id ORDER BY b.sort,lower(b.name)),'[]'))
  INTO after_names,result
  FROM taskpulse_private.user_businesses ub JOIN taskpulse_private.businesses b ON b.id=ub.business_id WHERE ub.user_id=p_user;
 IF after_names<>before_names THEN
  INSERT INTO taskpulse_private.audit_events(organization_id,actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
  VALUES(org,actor,caller_role::text,cmd,'user_businesses',p_user,ARRAY['businesses'],
   jsonb_build_object('businesses',jsonb_build_object('before',before_names,'after',after_names)),p_operation);
 END IF;
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,cmd,p_operation,request,p_user,result);
 RETURN result;
END $$;

CREATE FUNCTION public.task_business_command(p_task uuid,p_business uuid,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); caller_role public.user_role:=public.get_user_role();
 receipt taskpulse_private.command_receipts; cmd text:='task_business_set'; t public.tasks; saved uuid; result jsonb;
 request jsonb:=jsonb_build_array(p_task,p_business); BEGIN
 PERFORM taskpulse_private.business_require_member();
 IF p_task IS NULL OR p_operation IS NULL THEN
  RAISE EXCEPTION 'Choose a mission, with an operation id' USING ERRCODE='23514'; END IF;
 SELECT * INTO t FROM public.tasks x WHERE x.id=p_task AND x.organization_id=org;
 IF t.id IS NULL THEN RAISE EXCEPTION 'Mission not found' USING ERRCODE='P0002'; END IF;
 IF NOT(caller_role IN ('managing_director','project_engineer') OR public.is_task_assignee(p_task)) THEN
  RAISE EXCEPTION 'Only the managing director, Managers and the mission''s Crew choose its business' USING ERRCODE='42501'; END IF;
 IF t.archived_effective_date IS NOT NULL THEN
  RAISE EXCEPTION 'This mission is archived' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||cmd||p_operation::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=cmd AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;
 saved:=taskpulse_private.apply_task_business(p_task,p_business::text,p_operation);
 result:=jsonb_build_object('taskId',p_task,'businessId',saved);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,cmd,p_operation,request,p_task,result);
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION taskpulse_private.business_slug(text),taskpulse_private.business_json(taskpulse_private.businesses),
 taskpulse_private.business_require_member(),taskpulse_private.business_for_mission(text),
 taskpulse_private.apply_task_business(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.businesses(),public.my_businesses(),public.business_summary(),
 public.business_command(text,uuid,text,text,integer,uuid),public.user_businesses_command(uuid,uuid[],uuid),
 public.task_business_command(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.businesses(),public.my_businesses(),public.business_summary(),
 public.business_command(text,uuid,text,text,integer,uuid),public.user_businesses_command(uuid,uuid[],uuid),
 public.task_business_command(uuid,uuid,uuid) TO authenticated;

COMMIT;
SELECT taskpulse_private.m15_secure();
