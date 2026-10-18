-- ===========================================================================
-- TaskPulse - M15.2 company scope inside commands and workers (forward only,
-- after 39). Design: docs/plans/M15-multi-company.md, "M15.2 design".
--
-- On Supabase `postgres` owns every table and function and has BYPASSRLS, so
-- row security never applied inside SECURITY DEFINER commands: they could read
-- (not write, after 39) every company's rows. This migration:
--   * creates the NOLOGIN, non-bypass role taskpulse_definer and makes it the
--     owner of every table, sequence and function in public/taskpulse_private,
--     except a short system allowlist that keeps postgres ownership;
--   * enables FORCE ROW LEVEL SECURITY, with one policy per table for
--     taskpulse_definer: rows of the scoped company, or every row when the
--     context is unscoped (a migration, a job claim, the freshness decay);
--   * resolves the scope in taskpulse_private.m15_scope(): the signed-in
--     caller's company, else the taskpulse.organization setting (in-database
--     loops), else the x-taskpulse-organization header for service-role
--     workers only;
--   * adds organization_id to every company-owned private table, stamped by
--     the 39 trigger (now schema-aware, with links without foreign keys);
--   * makes award slot dates, month periods/revisions and Task Tools tag
--     reservations unique per company, and patches the two ON CONFLICT
--     targets that named the old global keys;
--   * returns each job's company from the claim functions and queues awards
--     once per active company;
--   * adds taskpulse_private.m15_secure(), which every later migration must
--     call last so new tables and functions get the same treatment.
-- taskpulse_definer is a member of service_role only for its privileges (for
-- example executing auth.uid()); role attributes such as BYPASSRLS are never
-- inherited, and no row policy targets service_role.
-- ===========================================================================

-- Take every table lock up front, in one fixed order, so a live API request
-- cannot hold one table while this migration holds another (deadlock seen on
-- the hosted test project while dev servers were serving requests).
SET LOCAL lock_timeout = '120s';
DO $$ DECLARE stmt text; BEGIN
 SELECT 'LOCK TABLE '||string_agg(format('%I.%I',schemaname,tablename),', ' ORDER BY schemaname,tablename)||' IN ACCESS EXCLUSIVE MODE'
 INTO stmt FROM pg_catalog.pg_tables WHERE schemaname IN ('public','taskpulse_private');
 EXECUTE stmt;
END $$;

DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='taskpulse_definer') THEN
  CREATE ROLE taskpulse_definer NOLOGIN NOBYPASSRLS;
 END IF;
END $$;
GRANT service_role TO taskpulse_definer;
GRANT taskpulse_definer TO current_user;
GRANT USAGE, CREATE ON SCHEMA public, taskpulse_private TO taskpulse_definer;

-- --------------------------------------------------------------------------
-- Scope helpers (system allowlist: owned by postgres)
-- --------------------------------------------------------------------------
CREATE FUNCTION taskpulse_private.m15_scope() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v text; claims jsonb; headers jsonb; BEGIN
 IF auth.uid() IS NOT NULL THEN RETURN public.current_organization(); END IF;
 v:=nullif(current_setting('taskpulse.organization',true),'');
 IF v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN v::uuid; END IF;
 BEGIN claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb; EXCEPTION WHEN others THEN claims:=NULL; END;
 IF claims->>'role'='service_role' THEN
  BEGIN headers:=nullif(current_setting('request.headers',true),'')::jsonb; EXCEPTION WHEN others THEN headers:=NULL; END;
  v:=headers->>'x-taskpulse-organization';
  IF v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN v::uuid; END IF;
 END IF;
 RETURN NULL;
END $$;

-- Unscoped only for a system context: never for a signed-in caller.
CREATE FUNCTION taskpulse_private.m15_unscoped() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NULL AND taskpulse_private.m15_scope() IS NULL;
$$;
GRANT USAGE ON SCHEMA taskpulse_private TO taskpulse_definer;
GRANT EXECUTE ON FUNCTION taskpulse_private.m15_scope(),taskpulse_private.m15_unscoped() TO taskpulse_definer;
GRANT EXECUTE ON FUNCTION public.current_organization(),public.get_user_role() TO taskpulse_definer;

-- --------------------------------------------------------------------------
-- Company on private tables
-- --------------------------------------------------------------------------
ALTER TABLE taskpulse_private.m15_tenant_tables ADD COLUMN table_schema text NOT NULL DEFAULT 'public';
ALTER TABLE taskpulse_private.m15_tenant_tables DROP CONSTRAINT m15_tenant_tables_pkey, ADD PRIMARY KEY (table_schema,table_name);
ALTER TABLE taskpulse_private.m15_org_refs ADD COLUMN table_schema text NOT NULL DEFAULT 'public', ADD COLUMN ref_schema text NOT NULL DEFAULT 'public';
ALTER TABLE taskpulse_private.m15_org_refs DROP CONSTRAINT m15_org_refs_pkey, ADD PRIMARY KEY (table_schema,table_name,column_name,ref_schema,ref_table);

INSERT INTO taskpulse_private.m15_tenant_tables(table_schema,table_name)
SELECT 'taskpulse_private',tablename FROM pg_catalog.pg_tables
WHERE schemaname='taskpulse_private' AND tablename NOT IN
 ('award_policy','drive_configuration','input_contract','performance_contract','presentation_contract','tool_policy','m15_tenant_tables','m15_org_refs');

-- Links that tell a private row its company. Foreign keys first, then columns
-- that point at a known table without a foreign key (several candidates for
-- polymorphic ids: only the table that holds the id matches).
INSERT INTO taskpulse_private.m15_org_refs(table_schema,table_name,column_name,ref_schema,ref_table)
SELECT 'taskpulse_private',t.table_name,v.col,v.rs,v.rt
FROM (SELECT table_name FROM taskpulse_private.m15_tenant_tables WHERE table_schema='taskpulse_private') t
JOIN pg_catalog.pg_attribute a ON a.attrelid=('taskpulse_private.'||quote_ident(t.table_name))::regclass AND a.attnum>0 AND NOT a.attisdropped
JOIN (VALUES
 ('task_id','public','tasks'),('source_task_id','public','tasks'),
 ('user_id','public','users'),('actor_id','public','users'),('winner_id','public','users'),('correction_actor','public','users'),('owner_id','public','users'),
 ('log_id','public','daily_task_logs'),
 ('run_id','taskpulse_private','award_runs'),('latest_run','taskpulse_private','award_runs'),('effective_run','taskpulse_private','award_runs'),
 ('slot_id','taskpulse_private','award_slots'),('override_id','taskpulse_private','award_overrides'),
 ('job_id','taskpulse_private','outbox_jobs'),
 ('revision_id','taskpulse_private','month_revisions'),('current_revision','taskpulse_private','month_revisions'),('prior_revision','taskpulse_private','month_revisions'),
 ('preview_id','taskpulse_private','tool_previews'),('audit_id','taskpulse_private','audit_events'),
 ('entity_id','public','tasks'),('entity_id','public','users'),('entity_id','public','daily_task_logs'),('entity_id','public','attendance_records'),
 ('entity_id','public','task_checklists'),('entity_id','public','checklist_nodes'),('entity_id','taskpulse_private','award_slots'),
 ('row_id','public','tasks'),('row_id','public','users'),('row_id','public','task_checklists'),('row_id','public','checklist_nodes'),
 ('row_id','public','daily_task_logs'),('row_id','public','task_timers'),('row_id','public','attendance_records'),('row_id','public','task_links'),
 ('row_id','public','task_dependencies'),('row_id','public','daily_facts'),('row_id','public','ideas'),('row_id','public','suggestions'),
 ('row_id','public','sales_logs'),('row_id','public','meeting_points'),('row_id','public','report_snapshots'),
 ('record_id','public','attendance_records'),('record_id','public','daily_facts'),('record_id','public','ideas'),
 ('record_id','public','suggestions'),('record_id','public','sales_logs'),('record_id','public','meeting_points')
) v(col,rs,rt) ON v.col=a.attname
WHERE a.atttypid='uuid'::regtype
ON CONFLICT DO NOTHING;

DO $$ DECLARE t text; default_org uuid; BEGIN
 SELECT id INTO default_org FROM public.organizations WHERE is_default;
 FOR t IN SELECT table_name FROM taskpulse_private.m15_tenant_tables WHERE table_schema='taskpulse_private' ORDER BY table_name LOOP
  EXECUTE format('ALTER TABLE taskpulse_private.%I ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT',t);
  EXECUTE format('ALTER TABLE taskpulse_private.%I DISABLE TRIGGER USER',t);
  EXECUTE format('UPDATE taskpulse_private.%I SET organization_id=%L',t,default_org);
  EXECUTE format('ALTER TABLE taskpulse_private.%I ENABLE TRIGGER USER',t);
  EXECUTE format('ALTER TABLE taskpulse_private.%I ALTER COLUMN organization_id SET NOT NULL',t);
  EXECUTE format('CREATE INDEX %I ON taskpulse_private.%I(organization_id)',t||'_organization_idx',t);
 END LOOP;
END $$;

-- System records about something with no company (an org-less sign-up's audit
-- and observation rows) belong to no company. The stamp trigger allows NULL
-- only in that case; scoped readers never see such rows.
DO $$ DECLARE t text; BEGIN
 FOR t IN SELECT table_name FROM taskpulse_private.m15_tenant_tables WHERE table_schema='taskpulse_private' LOOP
  EXECUTE format('ALTER TABLE taskpulse_private.%I ALTER COLUMN organization_id DROP NOT NULL',t);
 END LOOP;
END $$;

-- Per-company keys.
ALTER TABLE taskpulse_private.award_slots DROP CONSTRAINT award_slots_business_date_key,
 ADD CONSTRAINT award_slots_business_date_per_company UNIQUE (organization_id,business_date);
ALTER TABLE taskpulse_private.month_revisions DROP CONSTRAINT month_revisions_period_start_fkey;
ALTER TABLE taskpulse_private.month_revisions DROP CONSTRAINT month_revisions_period_start_revision_number_key,
 ADD CONSTRAINT month_revisions_number_per_company UNIQUE (organization_id,period_start,revision_number);
ALTER TABLE taskpulse_private.month_periods DROP CONSTRAINT month_periods_pkey, ADD PRIMARY KEY (organization_id,period_start);
ALTER TABLE taskpulse_private.month_revisions ADD CONSTRAINT month_revisions_period_per_company_fkey
 FOREIGN KEY (organization_id,period_start) REFERENCES taskpulse_private.month_periods(organization_id,period_start);
ALTER TABLE taskpulse_private.tool_tag_reservations DROP CONSTRAINT tool_tag_reservations_pkey, ADD PRIMARY KEY (organization_id,task_tag);

DO $$ DECLARE f record; def text; BEGIN
 FOR f IN SELECT p.oid FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','taskpulse_private') AND (p.prosrc LIKE '%ON CONFLICT(business_date)%' OR p.prosrc LIKE '%ON CONFLICT(period_start)%') LOOP
  def:=pg_catalog.pg_get_functiondef(f.oid);
  def:=replace(replace(def,'ON CONFLICT(business_date)','ON CONFLICT(organization_id,business_date)'),'ON CONFLICT(period_start)','ON CONFLICT(organization_id,period_start)');
  EXECUTE def;
 END LOOP;
END $$;

-- Guards that trusted "the caller is the table owner" (postgres until now) keep
-- trusting the migration/maintenance roles after ownership moves.
DO $$ DECLARE f record; def text; BEGIN
 FOR f IN SELECT p.oid FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','taskpulse_private') AND (p.prosrc LIKE '%current_user=owner_name%' OR p.prosrc LIKE '%session_user<>owner_name%') LOOP
  def:=pg_catalog.pg_get_functiondef(f.oid);
  def:=replace(replace(def,'current_user=owner_name','current_user IN (owner_name,''postgres'',''supabase_admin'')'),
   'session_user<>owner_name','session_user NOT IN (owner_name,''postgres'',''supabase_admin'')');
  EXECUTE def;
 END LOOP;
END $$;

-- The audit trigger runs AFTER the change, so the audited row already carries
-- its company: record it directly instead of guessing from row_id.
DO $$ DECLARE def text; BEGIN
 def:=pg_catalog.pg_get_functiondef('taskpulse_private.audit_write()'::regprocedure);
 IF strpos(def,'INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes)')=0
  OR strpos(def,'VALUES(auth.uid(),coalesce(public.get_user_role()::text,''system''),TG_OP,TG_TABLE_NAME,')=0 THEN
  RAISE EXCEPTION 'Unexpected audit_write definition; inspect before upgrading';
 END IF;
 def:=replace(def,'INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes)',
  'INSERT INTO taskpulse_private.audit_events(organization_id,actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes)');
 def:=replace(def,'VALUES(auth.uid(),coalesce(public.get_user_role()::text,''system''),TG_OP,TG_TABLE_NAME,',
  'VALUES(coalesce(n->>''organization_id'',o->>''organization_id'')::uuid,auth.uid(),coalesce(public.get_user_role()::text,''system''),TG_OP,TG_TABLE_NAME,');
 EXECUTE def;
END $$;

-- --------------------------------------------------------------------------
-- Company stamp, now schema-aware and checked against the scope
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION taskpulse_private.m15_organization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_data jsonb; ref record; ref_org uuid; derived uuid; scope uuid; signed_in boolean:=auth.uid() IS NOT NULL; only_org uuid; v text; found_rows int; orgless_ref boolean:=false; BEGIN
 scope:=taskpulse_private.m15_scope();
 IF TG_OP='DELETE' THEN
  IF (signed_in OR scope IS NOT NULL) AND OLD.organization_id IS DISTINCT FROM scope THEN
   RAISE EXCEPTION 'Another company''s record cannot be changed' USING ERRCODE='42501'; END IF;
  RETURN OLD;
 END IF;
 IF TG_TABLE_SCHEMA='public' AND TG_TABLE_NAME='users' THEN
  IF TG_OP='UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id AND (signed_in OR scope IS NOT NULL) THEN
   RAISE EXCEPTION 'Company membership cannot be changed here' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND signed_in AND NEW.id<>auth.uid() AND OLD.organization_id IS DISTINCT FROM scope THEN
   RAISE EXCEPTION 'Another company''s record cannot be changed' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
  RAISE EXCEPTION 'A record cannot move between companies' USING ERRCODE='42501'; END IF;
 row_data:=to_jsonb(NEW);
 FOR ref IN SELECT column_name,ref_schema,ref_table FROM taskpulse_private.m15_org_refs
  WHERE table_schema=TG_TABLE_SCHEMA AND table_name=TG_TABLE_NAME ORDER BY column_name,ref_schema,ref_table LOOP
  v:=row_data->>ref.column_name;
  IF v IS NULL OR v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN CONTINUE; END IF;
  ref_org:=NULL;
  EXECUTE format('SELECT organization_id FROM %I.%I WHERE id=$1',ref.ref_schema,ref.ref_table) INTO ref_org USING v::uuid;
  GET DIAGNOSTICS found_rows = ROW_COUNT;
  IF found_rows>0 AND ref_org IS NULL THEN orgless_ref:=true; END IF;
  IF ref_org IS NULL THEN CONTINUE; END IF;
  IF derived IS NULL THEN derived:=ref_org;
  ELSIF derived<>ref_org THEN RAISE EXCEPTION 'Records from different companies cannot be linked' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF NEW.organization_id IS NULL THEN
  NEW.organization_id:=coalesce(derived,scope);
  IF NEW.organization_id IS NULL AND NOT signed_in THEN
   SELECT min(id::text)::uuid INTO only_org FROM public.organizations HAVING count(*)=1;
   NEW.organization_id:=only_org;
  END IF;
  IF NEW.organization_id IS NULL AND TG_TABLE_SCHEMA='taskpulse_private' AND orgless_ref AND derived IS NULL AND NOT signed_in AND scope IS NULL THEN
   RETURN NEW;
  END IF;
  IF NEW.organization_id IS NULL THEN RAISE EXCEPTION 'The record''s company could not be determined' USING ERRCODE='23514'; END IF;
 ELSIF derived IS NOT NULL AND derived<>NEW.organization_id THEN
  RAISE EXCEPTION 'Records from different companies cannot be linked' USING ERRCODE='23514';
 END IF;
 IF (signed_in OR scope IS NOT NULL) AND NEW.organization_id IS DISTINCT FROM scope THEN
  RAISE EXCEPTION 'Another company''s record cannot be changed' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;

-- --------------------------------------------------------------------------
-- Workers: each job carries its company; awards are queued per company
-- --------------------------------------------------------------------------
DO $$ DECLARE f text; BEGIN
 FOREACH f IN ARRAY ARRAY['claim_award_jobs','claim_performance_jobs','claim_drive_jobs'] LOOP
  EXECUTE format('ALTER FUNCTION public.%I(integer) RENAME TO %I',f,f||'_m15');
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(integer) FROM PUBLIC,anon,authenticated,service_role',f||'_m15');
  EXECUTE format($f$CREATE FUNCTION public.%I(p_limit integer DEFAULT %s) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $b$
   DECLARE jobs jsonb; BEGIN
    jobs:=public.%I(p_limit);
    IF jobs IS NULL OR jsonb_typeof(jobs)<>'array' THEN RETURN jobs; END IF;
    RETURN (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(j)='object' THEN j||jsonb_build_object('organizationId',
      (SELECT o.organization_id FROM taskpulse_private.outbox_jobs o WHERE o.id::text=j->>'id')) ELSE j END ORDER BY ord),'[]'::jsonb)
     FROM jsonb_array_elements(jobs) WITH ORDINALITY AS e(j,ord));
   END $b$;$f$,f,CASE f WHEN 'claim_drive_jobs' THEN '1' ELSE '10' END,f||'_m15');
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(integer) FROM PUBLIC,anon,authenticated,service_role',f);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(integer) TO service_role',f);
 END LOOP;
END $$;

ALTER FUNCTION public.queue_due_awards(date,date,uuid) RENAME TO queue_due_awards_m15;
REVOKE ALL ON FUNCTION public.queue_due_awards_m15(date,date,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.queue_due_awards(p_from date,p_through date,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org record; results jsonb:='[]'::jsonb; one jsonb; BEGIN
 -- One pass per active company, each scoped to that company. A distinct
 -- operation id per company keeps each pass's receipt separate.
 FOR org IN SELECT id FROM public.organizations WHERE status='active' ORDER BY created_at,id LOOP
  PERFORM set_config('taskpulse.organization',org.id::text,true);
  one:=public.queue_due_awards_m15(p_from,p_through,md5(p_operation::text||':'||org.id::text)::uuid);
  results:=results||jsonb_build_array(jsonb_build_object('organizationId',org.id,'result',one));
 END LOOP;
 PERFORM set_config('taskpulse.organization','',true);
 RETURN jsonb_build_object('companies',results);
END $$;
REVOKE ALL ON FUNCTION public.queue_due_awards(date,date,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.queue_due_awards(date,date,uuid) TO service_role;

-- --------------------------------------------------------------------------
-- Ownership, FORCE RLS and scope policies (re-run by every later migration)
-- --------------------------------------------------------------------------
CREATE FUNCTION taskpulse_private.m15_secure() RETURNS text
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE t record; f record; s record; tables int:=0; functions int:=0;
 allow text[]:=ARRAY['public.current_organization()','public.get_user_role()','public.handle_new_user()',
  'taskpulse_private.m15_organization()','taskpulse_private.m15_scope()','taskpulse_private.m15_unscoped()','taskpulse_private.m15_secure()'];
BEGIN
 FOR t IN SELECT n.nspname,c.relname,c.oid,
   EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attname='organization_id' AND NOT a.attisdropped) AS scoped
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','taskpulse_private') AND c.relkind='r' LOOP
  IF pg_catalog.pg_get_userbyid((SELECT relowner FROM pg_catalog.pg_class WHERE oid=t.oid))<>'taskpulse_definer' THEN
   EXECUTE format('ALTER TABLE %I.%I OWNER TO taskpulse_definer',t.nspname,t.relname); tables:=tables+1;
  END IF;
  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',t.nspname,t.relname);
  EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',t.nspname,t.relname);
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policies p WHERE p.schemaname=t.nspname AND p.tablename=t.relname AND p.policyname='m15_scope') THEN
   IF t.scoped AND t.relname<>'organizations' THEN
    EXECUTE format('CREATE POLICY m15_scope ON %I.%I FOR ALL TO taskpulse_definer USING (organization_id=(SELECT taskpulse_private.m15_scope()) OR (SELECT taskpulse_private.m15_unscoped())) WITH CHECK (organization_id=(SELECT taskpulse_private.m15_scope()) OR (SELECT taskpulse_private.m15_unscoped()))',t.nspname,t.relname);
   ELSE
    EXECUTE format('CREATE POLICY m15_scope ON %I.%I FOR ALL TO taskpulse_definer USING (true) WITH CHECK (true)',t.nspname,t.relname);
   END IF;
  END IF;
  IF t.scoped AND t.relname<>'organizations' AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger g WHERE g.tgrelid=t.oid AND g.tgname='aaa_m15_organization') THEN
   EXECUTE format('CREATE TRIGGER aaa_m15_organization BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION taskpulse_private.m15_organization()',t.nspname,t.relname);
  END IF;
 END LOOP;
 FOR s IN SELECT n.nspname,c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','taskpulse_private') AND c.relkind='S' AND pg_catalog.pg_get_userbyid(c.relowner)<>'taskpulse_definer'
   AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_depend d WHERE d.objid=c.oid AND d.deptype IN ('a','i')) LOOP
  EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO taskpulse_definer',s.nspname,s.relname);
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','taskpulse_private') AND pg_catalog.pg_get_userbyid(p.proowner)<>'taskpulse_definer'
   AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_depend d WHERE d.objid=p.oid AND d.deptype='e') LOOP
  IF f.sig::text = ANY(allow) THEN CONTINUE; END IF;
  EXECUTE format('ALTER FUNCTION %s OWNER TO taskpulse_definer',f.sig); functions:=functions+1;
 END LOOP;
 RETURN format('%s tables and %s functions moved to taskpulse_definer',tables,functions);
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.m15_secure() FROM PUBLIC,anon,authenticated,service_role,taskpulse_definer;

SELECT taskpulse_private.m15_secure();
