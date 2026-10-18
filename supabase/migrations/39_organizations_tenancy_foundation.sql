-- ===========================================================================
-- TaskPulse - M15.1 tenancy foundation (forward only, after 38)
--
-- Multi-company TaskPulse (DECISIONS, 17 October 2026): one shared database,
-- every company-owned row carries organization_id, and PostgreSQL enforces
-- separation. Saahithyaa Realtors and Builders becomes company #1 and owns
-- every existing row.
--
-- This migration:
--   * adds public.organizations and company #1 (the default organization);
--   * adds organization_id to every company-owned public table, backfilled to
--     company #1, with an index;
--   * fills organization_id on insert from the row's parent references (task,
--     user, checklist, template, report) or the caller's company, and refuses
--     rows whose references point at another company;
--   * refuses any signed-in write or delete of another company's row, even
--     inside SECURITY DEFINER commands (a write guard, not just RLS);
--   * adds one RESTRICTIVE row-level policy per table, so every existing
--     permissive policy now also requires the caller's company;
--   * makes task tags, employee IDs, checklist template names, company
--     statement keys and daily star dates unique per company, not globally;
--   * scopes get_user_role() and can_read_employee_details() to an active
--     company, and assigns new accounts from server-set app metadata. With no
--     company in app metadata they join the default company (today's
--     behaviour); M15.4 replaces this with invitations.
--
-- Not in this migration (M15.2): private tables and every command's reads.
-- SECURITY DEFINER commands can still read across companies until then; the
-- write guard already stops cross-company writes. Asia/Kolkata stays fixed.
-- ===========================================================================

CREATE TABLE public.organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(160) NOT NULL CHECK (btrim(name) <> ''),
    slug varchar(60) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
    is_default boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX organizations_one_default ON public.organizations(is_default) WHERE is_default;
INSERT INTO public.organizations(name,slug,is_default) VALUES('Saahithyaa Realtors and Builders','saahithyaa',true);

-- --------------------------------------------------------------------------
-- organization_id on every company-owned public table
-- --------------------------------------------------------------------------
CREATE TABLE taskpulse_private.m15_tenant_tables(table_name text PRIMARY KEY);
INSERT INTO taskpulse_private.m15_tenant_tables(table_name)
SELECT tablename FROM pg_catalog.pg_tables
WHERE schemaname='public' AND tablename NOT IN ('organizations','task_detail_fields');

-- References that must stay inside one company, discovered from foreign keys
-- between company-owned tables (auth.users is excluded).
CREATE TABLE taskpulse_private.m15_org_refs(
    table_name text NOT NULL, column_name text NOT NULL, ref_table text NOT NULL,
    PRIMARY KEY(table_name,column_name));

DO $$ DECLARE t text; default_org uuid; BEGIN
 SELECT id INTO default_org FROM public.organizations WHERE is_default;
 FOR t IN SELECT table_name FROM taskpulse_private.m15_tenant_tables ORDER BY table_name LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT',t);
  -- Backfill without user triggers: assigning the company is not a work or
  -- review change, so revision, history and guard triggers must not fire.
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER',t);
  EXECUTE format('UPDATE public.%I SET organization_id=%L',t,default_org);
  EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER',t);
  IF t<>'users' THEN EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL',t); END IF;
  EXECUTE format('CREATE INDEX %I ON public.%I(organization_id)',t||'_organization_idx',t);
 END LOOP;
 INSERT INTO taskpulse_private.m15_org_refs(table_name,column_name,ref_table)
 SELECT c.relname,a.attname,f.relname
 FROM pg_catalog.pg_constraint k
 JOIN pg_catalog.pg_class c ON c.oid=k.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_catalog.pg_class f ON f.oid=k.confrelid JOIN pg_catalog.pg_namespace fn ON fn.oid=f.relnamespace
 JOIN pg_catalog.pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=k.conkey[1]
 WHERE k.contype='f' AND n.nspname='public' AND fn.nspname='public' AND cardinality(k.conkey)=1
  AND c.relname IN (SELECT table_name FROM taskpulse_private.m15_tenant_tables)
  AND f.relname IN (SELECT table_name FROM taskpulse_private.m15_tenant_tables)
  AND a.attname<>'organization_id'
 ON CONFLICT DO NOTHING;
END $$;

-- An organization-less account must be inactive (it can see only itself).
ALTER TABLE public.users ADD CONSTRAINT users_organization_required_when_active
    CHECK (organization_id IS NOT NULL OR NOT is_active);

-- --------------------------------------------------------------------------
-- Caller's company and role
-- --------------------------------------------------------------------------
CREATE FUNCTION public.current_organization() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT u.organization_id FROM public.users u JOIN public.organizations o ON o.id=u.organization_id
  WHERE u.id=auth.uid() AND u.is_active AND o.status='active';
$$;
REVOKE ALL ON FUNCTION public.current_organization() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.current_organization() TO authenticated,service_role;

-- A role exists only for an active account in an active company.
CREATE OR REPLACE FUNCTION public.get_user_role() RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT u.role FROM public.users u JOIN public.organizations o ON o.id=u.organization_id
  WHERE u.id = auth.uid() AND u.is_active AND o.status='active';
$$;

-- Managers read details of their own company's people only.
CREATE OR REPLACE FUNCTION public.can_read_employee_details(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.get_user_role() IS NOT NULL AND
    EXISTS(SELECT 1 FROM public.users t WHERE t.id=p_user_id AND t.organization_id=public.current_organization()) AND
    (auth.uid()=p_user_id OR public.get_user_role() IN ('managing_director','project_engineer'));
$$;

-- --------------------------------------------------------------------------
-- Fill and guard organization_id on every write
-- --------------------------------------------------------------------------
-- SECURITY DEFINER so parent lookups see every company: under the caller's RLS
-- another company's parent would be invisible and the link check would pass.
CREATE FUNCTION taskpulse_private.m15_organization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_data jsonb; ref record; ref_org uuid; derived uuid; caller_org uuid; only_org uuid; BEGIN
 IF auth.uid() IS NOT NULL THEN caller_org:=public.current_organization(); END IF;
 IF TG_OP='DELETE' THEN
  IF auth.uid() IS NOT NULL AND OLD.organization_id IS DISTINCT FROM caller_org THEN
   RAISE EXCEPTION 'Another company''s record cannot be changed' USING ERRCODE='42501'; END IF;
  RETURN OLD;
 END IF;
 IF TG_TABLE_NAME='users' THEN
  -- Company membership is set at provisioning and never moved by a signed-in caller.
  IF TG_OP='UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id AND auth.uid() IS NOT NULL THEN
   RAISE EXCEPTION 'Company membership cannot be changed here' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND auth.uid() IS NOT NULL AND NEW.id<>auth.uid() AND OLD.organization_id IS DISTINCT FROM caller_org THEN
   RAISE EXCEPTION 'Another company''s record cannot be changed' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
  RAISE EXCEPTION 'A record cannot move between companies' USING ERRCODE='42501'; END IF;
 row_data:=to_jsonb(NEW);
 FOR ref IN SELECT column_name,ref_table FROM taskpulse_private.m15_org_refs WHERE table_name=TG_TABLE_NAME ORDER BY column_name LOOP
  IF row_data->>ref.column_name IS NULL THEN CONTINUE; END IF;
  EXECUTE format('SELECT organization_id FROM public.%I WHERE id=$1',ref.ref_table) INTO ref_org USING (row_data->>ref.column_name)::uuid;
  IF ref_org IS NULL THEN CONTINUE; END IF; -- missing parents are left to the foreign key
  IF derived IS NULL THEN derived:=ref_org;
  ELSIF derived<>ref_org THEN RAISE EXCEPTION 'Records from different companies cannot be linked' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF NEW.organization_id IS NULL THEN
  IF derived IS NULL THEN derived:=caller_org; END IF;
  IF derived IS NULL THEN
   SELECT min(id::text)::uuid INTO only_org FROM public.organizations HAVING count(*)=1;
   derived:=only_org;
  END IF;
  IF derived IS NULL THEN RAISE EXCEPTION 'The record''s company could not be determined' USING ERRCODE='23514'; END IF;
  NEW.organization_id:=derived;
 ELSIF derived IS NOT NULL AND derived<>NEW.organization_id THEN
  RAISE EXCEPTION 'Records from different companies cannot be linked' USING ERRCODE='23514';
 END IF;
 IF auth.uid() IS NOT NULL AND NEW.organization_id IS DISTINCT FROM caller_org THEN
  RAISE EXCEPTION 'Another company''s record cannot be changed' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;

DO $$ DECLARE t text; BEGIN
 FOR t IN SELECT table_name FROM taskpulse_private.m15_tenant_tables LOOP
  EXECUTE format('CREATE TRIGGER aaa_m15_organization BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION taskpulse_private.m15_organization()',t);
  IF t='users' THEN
   EXECUTE 'CREATE POLICY m15_company ON public.users AS RESTRICTIVE FOR ALL TO authenticated USING (organization_id=public.current_organization() OR id=auth.uid()) WITH CHECK (organization_id=public.current_organization() OR id=auth.uid())';
  ELSE
   EXECUTE format('CREATE POLICY m15_company ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (organization_id=public.current_organization()) WITH CHECK (organization_id=public.current_organization())',t);
  END IF;
 END LOOP;
END $$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organizations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.organizations TO authenticated;
CREATE POLICY m15_own_company ON public.organizations FOR SELECT TO authenticated USING (id=public.current_organization());

-- --------------------------------------------------------------------------
-- Unique rules become per company
-- --------------------------------------------------------------------------
DO $$ DECLARE spec record; con text; BEGIN
 FOR spec IN SELECT * FROM (VALUES ('tasks','task_tag'),('users','employee_id'),('checklist_templates','name'),('company_statements','key_name'),('daily_star_records','star_date')) v(tbl,col) LOOP
  SELECT k.conname INTO con FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid=k.conrelid
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname=spec.tbl AND k.contype='u' AND cardinality(k.conkey)=1
    AND k.conkey[1]=(SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid=c.oid AND attname=spec.col);
  IF con IS NULL THEN RAISE EXCEPTION 'Expected unique rule on %.% is missing', spec.tbl, spec.col; END IF;
  EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I',spec.tbl,con);
  EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (organization_id,%I)',spec.tbl,spec.tbl||'_'||spec.col||'_per_company',spec.col);
 END LOOP;
END $$;

-- --------------------------------------------------------------------------
-- New accounts join the company named in server-set app metadata
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE org uuid; requested text;
BEGIN
    IF NEW.email IS NULL THEN
        RETURN NEW;
    END IF;

    -- raw_app_meta_data is server-controlled; raw_user_meta_data is not, so
    -- only the former may name a company.
    requested := NEW.raw_app_meta_data ->> 'organization_id';
    IF requested ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT id INTO org FROM public.organizations WHERE id = requested::uuid AND status = 'active';
    END IF;
    IF org IS NULL AND requested IS NULL THEN
        SELECT id INTO org FROM public.organizations WHERE is_default AND status = 'active';
    END IF;

    INSERT INTO public.users (id, employee_id, full_name, email, organization_id, is_active)
    VALUES (
        NEW.id,
        COALESCE(
            NULLIF(NEW.raw_user_meta_data ->> 'employee_id', ''),
            'EMP-' || UPPER(LEFT(REPLACE(NEW.id::text, '-', ''), 8))
        ),
        COALESCE(
            NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
            NULLIF(NEW.raw_user_meta_data ->> 'name', ''),
            SPLIT_PART(NEW.email, '@', 1)
        ),
        NEW.email,
        org,
        -- Without a company the account stays inactive and sees only itself.
        org IS NOT NULL
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION taskpulse_private.m15_organization() FROM PUBLIC,anon,authenticated,service_role;
