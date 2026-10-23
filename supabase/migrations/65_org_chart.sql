-- Migration 65: the company org chart (Team > People > Chart).
--
-- The user asked for an organizational chart of every employee and decided
-- (23 October 2026): real reporting lines set by the managing director; each
-- card shows name, role, job title, department and today's status; the
-- status is visible to every member but coarse only (in, half day, away, not
-- recorded; never hours); departments come from a fixed list the director
-- keeps in Settings > Company.
--
-- 1. taskpulse_private.departments: the company's department list.
-- 2. public.users gains reports_to, job_title and department_id. A trigger
--    keeps them sound on every path (the director command and the director's
--    direct table writes): manager and department in the same company, an
--    active manager when one is set, nobody under themselves or in a loop.
--    The existing write guard already stops everyone but the director from
--    changing these columns (profile edits are name and email only).
-- 3. New non-directors start under the company's first active managing
--    director; existing people with no manager are placed the same way.
-- 4. people_command('update') accepts reportsTo, jobTitle and departmentId
--    (a present key sets the value, null clears it), audited as before.
-- 5. company_settings() returns departments; company_settings_command gains
--    the 'departments' section. Departments are referenced by people, so a
--    save updates rows by id instead of replacing the set, and a department
--    that still has people cannot be removed (it can be hidden).
-- 6. public.org_chart(): the chart's read for any active member of the
--    company: people, their placement and today's coarse status in India
--    time. No hours, notes or reasons leave the function.
--
-- No scoring, award or attendance rule changes.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Departments
-- ---------------------------------------------------------------------------
CREATE TABLE taskpulse_private.departments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK (name=btrim(name) AND length(name) BETWEEN 1 AND 60),
 sort integer NOT NULL DEFAULT 0 CHECK (sort BETWEEN 0 AND 999),
 active boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX departments_name_per_company ON taskpulse_private.departments(organization_id,lower(name));
CREATE INDEX departments_company_idx ON taskpulse_private.departments(organization_id,sort);
REVOKE ALL ON taskpulse_private.departments FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO taskpulse_private.m15_tenant_tables(table_schema,table_name) VALUES ('taskpulse_private','departments')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Placement on users
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
 ADD COLUMN reports_to uuid REFERENCES public.users(id) ON DELETE SET NULL,
 ADD COLUMN job_title text CHECK (job_title IS NULL OR (job_title=btrim(job_title) AND length(job_title) BETWEEN 1 AND 60)),
 ADD COLUMN department_id uuid REFERENCES taskpulse_private.departments(id) ON DELETE SET NULL,
 ADD CONSTRAINT users_reports_to_not_self CHECK (reports_to IS NULL OR reports_to<>id);
CREATE INDEX users_reports_to_idx ON public.users(reports_to) WHERE reports_to IS NOT NULL;
CREATE INDEX users_department_idx ON public.users(department_id) WHERE department_id IS NOT NULL;

CREATE FUNCTION taskpulse_private.check_user_placement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE manager public.users; BEGIN
 IF NEW.reports_to IS NOT NULL AND (TG_OP='INSERT' OR NEW.reports_to IS DISTINCT FROM OLD.reports_to) THEN
  SELECT * INTO manager FROM public.users WHERE id=NEW.reports_to;
  IF manager.id IS NULL OR manager.organization_id IS DISTINCT FROM NEW.organization_id THEN
   RAISE EXCEPTION 'A manager must be a member of the same company' USING ERRCODE='23514'; END IF;
  IF NOT manager.is_active THEN
   RAISE EXCEPTION 'A manager must be an active member' USING ERRCODE='23514'; END IF;
  -- Walking up from the new manager must never reach this person.
  IF EXISTS (WITH RECURSIVE chain(id,depth) AS (
     SELECT u.reports_to,1 FROM public.users u WHERE u.id=NEW.reports_to
     UNION ALL SELECT u.reports_to,c.depth+1 FROM chain c JOIN public.users u ON u.id=c.id WHERE c.depth<500)
   SELECT 1 FROM chain WHERE id=NEW.id) OR NEW.reports_to=NEW.id THEN
   RAISE EXCEPTION 'That would put someone under themselves; choose a manager outside their own team' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.department_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.department_id IS DISTINCT FROM OLD.department_id) THEN
  IF NOT EXISTS (SELECT 1 FROM taskpulse_private.departments d
                 WHERE d.id=NEW.department_id AND d.organization_id=NEW.organization_id) THEN
   RAISE EXCEPTION 'Choose a department from your company''s list' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.check_user_placement() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_m65_user_placement BEFORE INSERT OR UPDATE OF reports_to,department_id,organization_id ON public.users
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.check_user_placement();

-- ---------------------------------------------------------------------------
-- 3. Default placement: under the company's first active managing director
-- ---------------------------------------------------------------------------
CREATE FUNCTION taskpulse_private.default_user_manager() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NEW.reports_to IS NULL AND NEW.role<>'managing_director' AND NEW.organization_id IS NOT NULL THEN
  SELECT u.id INTO NEW.reports_to FROM public.users u
   WHERE u.organization_id=NEW.organization_id AND u.role='managing_director' AND u.is_active AND u.id<>NEW.id
   ORDER BY u.created_at,u.id LIMIT 1;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.default_user_manager() FROM PUBLIC,anon,authenticated,service_role;
-- Runs after aaa_m15_organization has stamped the company, before the placement check.
CREATE TRIGGER zy_m65_default_manager BEFORE INSERT ON public.users
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.default_user_manager();

UPDATE public.users u SET reports_to=d.id
FROM LATERAL (SELECT m.id FROM public.users m
  WHERE m.organization_id=u.organization_id AND m.role='managing_director' AND m.is_active AND m.id<>u.id
  ORDER BY m.created_at,m.id LIMIT 1) d
WHERE u.reports_to IS NULL AND u.role<>'managing_director' AND u.organization_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Director command: manager, job title and department
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.people_command(p_command text, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
  org uuid := public.current_organization();
  addr text; name text; emp text; new_role public.user_role; active boolean;
  manager uuid; title text; department uuid;
  invite public.member_invitations;
  target public.users;
  changed text[] := ARRAY[]::text[];
BEGIN
  IF me IS NULL OR public.get_user_role() IS DISTINCT FROM 'managing_director' OR org IS NULL THEN
    RAISE EXCEPTION 'Only an active managing director can manage people' USING ERRCODE = '42501';
  END IF;

  IF p_command = 'invite' THEN
    addr := lower(btrim(coalesce(p_payload ->> 'email', '')));
    name := btrim(coalesce(p_payload ->> 'fullName', ''));
    emp := btrim(coalesce(p_payload ->> 'employeeId', ''));
    new_role := coalesce(nullif(p_payload ->> 'role', ''), 'team_member')::public.user_role;
    IF addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(addr) > 320 THEN
      RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE = '23514'; END IF;
    IF length(name) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'Enter a name of up to 120 characters' USING ERRCODE = '23514'; END IF;
    IF emp !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$' THEN
      RAISE EXCEPTION 'Employee ID may use letters, digits, - and _ (up to 40)' USING ERRCODE = '23514'; END IF;
    IF EXISTS (SELECT 1 FROM public.users u WHERE lower(u.email) = addr AND u.organization_id = org) THEN
      RAISE EXCEPTION 'This email already belongs to a member of your company' USING ERRCODE = '23505'; END IF;
    IF EXISTS (SELECT 1 FROM public.users u WHERE u.employee_id = emp)
       OR EXISTS (SELECT 1 FROM public.member_invitations i WHERE i.employee_id = emp AND i.organization_id = org
                   AND i.accepted_at IS NULL AND i.revoked_at IS NULL) THEN
      RAISE EXCEPTION 'Employee ID % is already in use', emp USING ERRCODE = '23505'; END IF;
    BEGIN
      INSERT INTO public.member_invitations(organization_id, email, full_name, employee_id, role, invited_by)
      VALUES (org, addr, name, emp, new_role, me) RETURNING * INTO invite;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'This email already has an open invitation' USING ERRCODE = '23505';
    END;
    INSERT INTO taskpulse_private.audit_events(organization_id, actor_id, actor_role, command, table_name, row_id, changed_fields, protected_changes)
    VALUES (org, me, 'managing_director', 'invite_member', 'member_invitations', invite.id,
            ARRAY['email','full_name','employee_id','role'], jsonb_build_object('role', new_role));
    RETURN jsonb_build_object('invitationId', invite.id, 'email', invite.email, 'role', invite.role);

  ELSIF p_command = 'revoke' THEN
    SELECT * INTO invite FROM public.member_invitations
     WHERE id = (p_payload ->> 'invitationId')::uuid AND organization_id = org FOR UPDATE;
    IF invite.id IS NULL THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '42501'; END IF;
    IF invite.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'This invitation was already accepted' USING ERRCODE = '23514'; END IF;
    IF invite.revoked_at IS NULL THEN
      UPDATE public.member_invitations SET revoked_at = now(), revoked_by = me WHERE id = invite.id;
      INSERT INTO taskpulse_private.audit_events(organization_id, actor_id, actor_role, command, table_name, row_id, changed_fields)
      VALUES (org, me, 'managing_director', 'revoke_invitation', 'member_invitations', invite.id, ARRAY['revoked_at']);
    END IF;
    RETURN jsonb_build_object('invitationId', invite.id, 'revoked', true);

  ELSIF p_command = 'update' THEN
    SELECT * INTO target FROM public.users
     WHERE id = (p_payload ->> 'userId')::uuid AND organization_id = org FOR UPDATE;
    IF target.id IS NULL THEN RAISE EXCEPTION 'Member not found' USING ERRCODE = '42501'; END IF;
    new_role := coalesce(nullif(p_payload ->> 'role', '')::public.user_role, target.role);
    active := coalesce((p_payload ->> 'isActive')::boolean, target.is_active);
    name := coalesce(nullif(btrim(p_payload ->> 'fullName'), ''), target.full_name);
    emp := coalesce(nullif(btrim(p_payload ->> 'employeeId'), ''), target.employee_id);
    -- A present key sets the value (null or blank clears it); an absent key keeps it.
    manager := CASE WHEN p_payload ? 'reportsTo' THEN nullif(p_payload ->> 'reportsTo', '')::uuid ELSE target.reports_to END;
    title := CASE WHEN p_payload ? 'jobTitle' THEN nullif(btrim(coalesce(p_payload ->> 'jobTitle', '')), '') ELSE target.job_title END;
    department := CASE WHEN p_payload ? 'departmentId' THEN nullif(p_payload ->> 'departmentId', '')::uuid ELSE target.department_id END;
    IF target.id = me AND (new_role <> target.role OR active <> target.is_active) THEN
      RAISE EXCEPTION 'You cannot change your own role or deactivate yourself' USING ERRCODE = '42501'; END IF;
    IF length(name) > 120 THEN RAISE EXCEPTION 'Enter a name of up to 120 characters' USING ERRCODE = '23514'; END IF;
    IF length(title) > 60 THEN RAISE EXCEPTION 'Enter a job title of up to 60 characters' USING ERRCODE = '23514'; END IF;
    IF emp <> target.employee_id THEN
      IF emp !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$' THEN
        RAISE EXCEPTION 'Employee ID may use letters, digits, - and _ (up to 40)' USING ERRCODE = '23514'; END IF;
      IF EXISTS (SELECT 1 FROM public.users u WHERE u.employee_id = emp AND u.id <> target.id) THEN
        RAISE EXCEPTION 'Employee ID % is already in use', emp USING ERRCODE = '23505'; END IF;
    END IF;
    IF new_role <> target.role THEN changed := array_append(changed, 'role'); END IF;
    IF active <> target.is_active THEN changed := array_append(changed, 'is_active'); END IF;
    IF name <> target.full_name THEN changed := array_append(changed, 'full_name'); END IF;
    IF emp <> target.employee_id THEN changed := array_append(changed, 'employee_id'); END IF;
    IF manager IS DISTINCT FROM target.reports_to THEN changed := array_append(changed, 'reports_to'); END IF;
    IF title IS DISTINCT FROM target.job_title THEN changed := array_append(changed, 'job_title'); END IF;
    IF department IS DISTINCT FROM target.department_id THEN changed := array_append(changed, 'department_id'); END IF;
    IF cardinality(changed) > 0 THEN
      UPDATE public.users SET role = new_role, is_active = active, full_name = name, employee_id = emp,
        reports_to = manager, job_title = title, department_id = department
       WHERE id = target.id;
      INSERT INTO taskpulse_private.audit_events(organization_id, actor_id, actor_role, command, table_name, row_id, changed_fields, protected_changes)
      VALUES (org, me, 'managing_director', 'update_member', 'users', target.id, changed,
              jsonb_build_object('from', jsonb_build_object('role', target.role, 'isActive', target.is_active, 'reportsTo', target.reports_to),
                                 'to', jsonb_build_object('role', new_role, 'isActive', active, 'reportsTo', manager)));
    END IF;
    RETURN jsonb_build_object('userId', target.id, 'role', new_role, 'isActive', active,
                              'fullName', name, 'employeeId', emp, 'reportsTo', manager, 'jobTitle', title,
                              'departmentId', department, 'changed', to_jsonb(changed));
  END IF;

  RAISE EXCEPTION 'Unknown people command' USING ERRCODE = '22023';
END $$;

-- ---------------------------------------------------------------------------
-- 5. Settings > Company: departments
-- ---------------------------------------------------------------------------
DO $$
DECLARE def text; fn regprocedure; frag text; spec record; BEGIN
 FOR spec IN SELECT * FROM (VALUES
  ('public.company_settings()',
   '''holidays'',(SELECT',
   '''departments'',(SELECT coalesce(jsonb_agg(jsonb_build_object(''id'',d.id,''name'',d.name,''sort'',d.sort,''active'',d.active,
     ''members'',(SELECT count(*) FROM public.users u WHERE u.department_id=d.id AND u.is_active)) ORDER BY d.sort,d.name),''[]''::jsonb)
   FROM taskpulse_private.departments d WHERE d.organization_id=org),
  ''holidays'',(SELECT'),
  ('public.company_settings_command(text,jsonb,bigint,uuid)',
   -- Added beside the list, not inside it, so another migration's edit of the list still applies.
   'p_section NOT IN (''agenda''',
   'p_section<>''departments'' AND p_section NOT IN (''agenda'''),
  ('public.company_settings_command(text,jsonb,bigint,uuid)',
   'ELSIF p_section=''mission_defaults'' THEN',
   'ELSIF p_section=''departments'' THEN
  list:=p_payload->''departments'';
  IF p_payload-''departments''<>''{}'' OR jsonb_typeof(list) IS DISTINCT FROM ''array'' OR jsonb_array_length(list)>100 THEN
   RAISE EXCEPTION ''A list of up to 100 departments required'' USING ERRCODE=''23514''; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(list) LOOP
   IF jsonb_typeof(item)<>''object'' OR item-ARRAY[''id'',''name'',''sort'',''active'']<>''{}''
    OR (item->>''id'' IS NOT NULL AND item->>''id'' !~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'')
    OR length(btrim(coalesce(item->>''name'',''''))) NOT BETWEEN 1 AND 60
    OR (item?''sort'' AND coalesce(item->>''sort'','''') !~ ''^\d{1,3}$'')
    OR (item?''active'' AND jsonb_typeof(item->''active'')<>''boolean'') THEN
    RAISE EXCEPTION ''Each department needs a name of 1-60 characters and an order of 0-999'' USING ERRCODE=''23514''; END IF;
   IF item->>''id'' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM taskpulse_private.departments d
      WHERE d.id=(item->>''id'')::uuid AND d.organization_id=org) THEN
    RAISE EXCEPTION ''A department in this list no longer exists; reload and try again'' USING ERRCODE=''PT409''; END IF;
  END LOOP;
  -- People point at departments, so rows are updated by id; a removed one must be empty.
  IF EXISTS(SELECT 1 FROM taskpulse_private.departments d JOIN public.users u ON u.department_id=d.id AND u.is_active
     WHERE d.organization_id=org AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(list) x WHERE x->>''id''=d.id::text)) THEN
   RAISE EXCEPTION ''A department that still has people cannot be removed; move them first or hide it'' USING ERRCODE=''23514''; END IF;
  DELETE FROM taskpulse_private.departments d WHERE d.organization_id=org
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(list) x WHERE x->>''id''=d.id::text);
  BEGIN
   -- Names may be swapped in one save: clear them first, then write the list.
   UPDATE taskpulse_private.departments SET name=''~''||id::text WHERE organization_id=org;
   UPDATE taskpulse_private.departments d SET name=btrim(x->>''name''),sort=coalesce((x->>''sort'')::integer,(o-1)::integer),
    active=coalesce((x->>''active'')::boolean,true)
   FROM jsonb_array_elements(list) WITH ORDINALITY e(x,o) WHERE x->>''id''=d.id::text AND d.organization_id=org;
   INSERT INTO taskpulse_private.departments(organization_id,name,sort,active)
   SELECT org,btrim(x->>''name''),coalesce((x->>''sort'')::integer,(o-1)::integer),coalesce((x->>''active'')::boolean,true)
   FROM jsonb_array_elements(list) WITH ORDINALITY e(x,o) WHERE x->>''id'' IS NULL;
  EXCEPTION WHEN unique_violation THEN
   RAISE EXCEPTION ''Department names must be unique'' USING ERRCODE=''23505'';
  END;

 ELSIF p_section=''mission_defaults'' THEN')
 ) v(sig,old_text,new_text) LOOP
  fn:=spec.sig::regprocedure; frag:=spec.old_text;
  def:=pg_catalog.pg_get_functiondef(fn);
  IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
   RAISE EXCEPTION '% no longer has exactly one "%"; update migration 65',spec.sig,frag; END IF;
  EXECUTE replace(def,frag,spec.new_text);
 END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. The chart's read
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.org_chart() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.current_organization(); today date:=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date; BEGIN
 IF public.get_user_role() IS NULL OR org IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('date',today,'people',(
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,'fullName',u.full_name,'employeeId',u.employee_id,'role',u.role,'active',u.is_active,
    'jobTitle',u.job_title,'departmentId',u.department_id,'department',d.name,'reportsTo',u.reports_to,
    -- Coarse on purpose: every member sees it, so no hours, notes or reasons.
    'today',CASE WHEN NOT u.is_active THEN NULL WHEN a.status IS NULL THEN 'not_recorded'
      WHEN a.status='Present' THEN 'in' WHEN a.status='Half Day' THEN 'half_day' ELSE 'away' END
   ) ORDER BY u.full_name,u.id),'[]'::jsonb)
  FROM public.users u
  LEFT JOIN taskpulse_private.departments d ON d.id=u.department_id
  LEFT JOIN public.attendance_records a ON a.user_id=u.id AND a.attendance_date=today
  WHERE u.organization_id=org));
END $$;
REVOKE ALL ON FUNCTION public.org_chart() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.org_chart() TO authenticated;

COMMIT;
SELECT taskpulse_private.m15_secure();
