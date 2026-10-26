-- ===========================================================================
-- TaskPulse - M19 company letterhead and Code of Conduct (forward only)
--
-- User request (DECISIONS "M19 HR", 26 October 2026): downloadable templates
-- with the company branding: a blank letterhead and the Code of Conduct
-- printed on it. Employees read and accept the Code of Conduct.
--
-- 1. organization_settings gains the letterhead's contact lines: address,
--    phone, email, website and a registration number (GSTIN or CIN).
--    company_settings() returns them as `letterhead` to every member;
--    company_settings_command gains the 'letterhead' section for the managing
--    director (same version, receipt and audit rules as the other sections),
--    patched by replacing one known fragment, as 64 and 72 did.
-- 2. taskpulse_private.code_of_conduct_versions: the managing director
--    publishes the text; each publish is a new numbered version.
--    taskpulse_private.code_of_conduct_acknowledgements: one row per member
--    per version they accepted.
-- 3. code_of_conduct() for any active member (the current version, whether
--    the caller accepted it, and for the managing director who has);
--    code_of_conduct_command('publish'|'acknowledge', ...).
-- ===========================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Letterhead contact lines
-- ---------------------------------------------------------------------------
ALTER TABLE taskpulse_private.organization_settings
 ADD COLUMN letterhead_address text NOT NULL DEFAULT '' CHECK (length(letterhead_address)<=300),
 ADD COLUMN letterhead_phone text NOT NULL DEFAULT '' CHECK (length(letterhead_phone)<=40),
 ADD COLUMN letterhead_email text NOT NULL DEFAULT '' CHECK (length(letterhead_email)<=120),
 ADD COLUMN letterhead_website text NOT NULL DEFAULT '' CHECK (length(letterhead_website)<=200),
 ADD COLUMN letterhead_registration text NOT NULL DEFAULT '' CHECK (length(letterhead_registration)<=60);

DO $$
DECLARE def text; fn regprocedure; frag text; spec record; BEGIN
 FOR spec IN SELECT * FROM (VALUES
  ('public.company_settings()',
   '''meetingAgenda'',coalesce(s.meeting_agenda,''''),',
   '''meetingAgenda'',coalesce(s.meeting_agenda,''''),
  ''letterhead'',jsonb_build_object(''address'',coalesce(s.letterhead_address,''''),''phone'',coalesce(s.letterhead_phone,''''),
   ''email'',coalesce(s.letterhead_email,''''),''website'',coalesce(s.letterhead_website,''''),
   ''registrationNo'',coalesce(s.letterhead_registration,'''')),'),
  ('public.company_settings_command(text,jsonb,bigint,uuid)',
   -- Added beside the list, as 65 and 72 did, so another migration's edit of the list still applies.
   'p_section NOT IN (''agenda''',
   'p_section<>''letterhead'' AND p_section NOT IN (''agenda'''),
  ('public.company_settings_command(text,jsonb,bigint,uuid)',
   'ELSIF p_section=''mission_defaults'' THEN',
   'ELSIF p_section=''letterhead'' THEN
  IF p_payload-ARRAY[''address'',''phone'',''email'',''website'',''registrationNo'']<>''{}''
   OR coalesce(jsonb_typeof(p_payload->''address''),'''')<>''string'' OR coalesce(jsonb_typeof(p_payload->''phone''),'''')<>''string''
   OR coalesce(jsonb_typeof(p_payload->''email''),'''')<>''string'' OR coalesce(jsonb_typeof(p_payload->''website''),'''')<>''string''
   OR coalesce(jsonb_typeof(p_payload->''registrationNo''),'''')<>''string'' THEN
   RAISE EXCEPTION ''The letterhead takes address, phone, email, website and registrationNo, each as text'' USING ERRCODE=''23514''; END IF;
  IF length(btrim(p_payload->>''address''))>300 OR length(btrim(p_payload->>''phone''))>40 OR length(btrim(p_payload->>''email''))>120
   OR length(btrim(p_payload->>''website''))>200 OR length(btrim(p_payload->>''registrationNo''))>60 THEN
   RAISE EXCEPTION ''Keep the address under 300 characters, the phone under 40, the email under 120, the website under 200 and the registration number under 60'' USING ERRCODE=''23514''; END IF;
  IF btrim(p_payload->>''email'')<>'''' AND btrim(p_payload->>''email'') !~ ''^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'' THEN
   RAISE EXCEPTION ''The letterhead email is not an email address'' USING ERRCODE=''23514''; END IF;
  UPDATE taskpulse_private.organization_settings SET
   letterhead_address=btrim(p_payload->>''address''),letterhead_phone=btrim(p_payload->>''phone''),
   letterhead_email=btrim(p_payload->>''email''),letterhead_website=btrim(p_payload->>''website''),
   letterhead_registration=btrim(p_payload->>''registrationNo'')
  WHERE organization_id=org;

 ELSIF p_section=''mission_defaults'' THEN')
 ) v(sig,old_text,new_text) LOOP
  fn:=spec.sig::regprocedure; frag:=spec.old_text;
  def:=pg_catalog.pg_get_functiondef(fn);
  IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
   RAISE EXCEPTION '% no longer has exactly one "%"; update migration 80',spec.sig,frag; END IF;
  EXECUTE replace(def,frag,spec.new_text);
 END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Code of Conduct
-- ---------------------------------------------------------------------------
CREATE TABLE taskpulse_private.code_of_conduct_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK (version>0),
 title text NOT NULL CHECK (title=btrim(title) AND length(title) BETWEEN 1 AND 120),
 body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 20000),
 published_at timestamptz NOT NULL DEFAULT now(),
 published_by uuid REFERENCES public.users(id),
 UNIQUE (organization_id,version)
);

CREATE TABLE taskpulse_private.code_of_conduct_acknowledgements (
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 version_id uuid NOT NULL REFERENCES taskpulse_private.code_of_conduct_versions(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 acknowledged_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (version_id,user_id)
);
CREATE INDEX code_of_conduct_acknowledgements_user_idx ON taskpulse_private.code_of_conduct_acknowledgements(user_id);

REVOKE ALL ON taskpulse_private.code_of_conduct_versions,taskpulse_private.code_of_conduct_acknowledgements
 FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO taskpulse_private.m15_tenant_tables(table_schema,table_name) VALUES
 ('taskpulse_private','code_of_conduct_versions'),('taskpulse_private','code_of_conduct_acknowledgements')
ON CONFLICT DO NOTHING;
INSERT INTO taskpulse_private.m15_org_refs(table_schema,table_name,column_name,ref_schema,ref_table) VALUES
 ('taskpulse_private','code_of_conduct_versions','published_by','public','users'),
 ('taskpulse_private','code_of_conduct_acknowledgements','user_id','public','users')
ON CONFLICT DO NOTHING;

CREATE FUNCTION public.code_of_conduct() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.current_organization(); cur taskpulse_private.code_of_conduct_versions; BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR public.get_user_role() IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 SELECT * INTO cur FROM taskpulse_private.code_of_conduct_versions WHERE organization_id=org ORDER BY version DESC LIMIT 1;
 RETURN jsonb_build_object(
  'current',CASE WHEN cur.id IS NULL THEN NULL ELSE jsonb_build_object('id',cur.id,'version',cur.version,'title',cur.title,
   'body',cur.body,'publishedAt',cur.published_at) END,
  'acknowledgedAt',(SELECT a.acknowledged_at FROM taskpulse_private.code_of_conduct_acknowledgements a
   WHERE a.version_id=cur.id AND a.user_id=auth.uid()),
  -- Who has accepted the current version: the managing director only.
  'acknowledgements',CASE WHEN public.get_user_role()='managing_director' AND cur.id IS NOT NULL THEN
   (SELECT coalesce(jsonb_agg(jsonb_build_object('userId',u.id,'employeeId',u.employee_id,'fullName',u.full_name,
     'acknowledgedAt',a.acknowledged_at) ORDER BY a.acknowledged_at IS NOT NULL,u.full_name),'[]')
    FROM public.users u LEFT JOIN taskpulse_private.code_of_conduct_acknowledgements a ON a.version_id=cur.id AND a.user_id=u.id
    WHERE u.organization_id=org AND u.is_active) END);
END $$;
REVOKE ALL ON FUNCTION public.code_of_conduct() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.code_of_conduct() TO authenticated;

-- publish: managing director; p_version is the version they edited (0 when
-- none), so two directors publishing at once can't overwrite each other.
-- acknowledge: any active member accepts the version they read (p_version).
CREATE FUNCTION public.code_of_conduct_command(p_op text,p_title text,p_body text,p_version integer,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); receipt taskpulse_private.command_receipts;
 cmd text:='code_of_conduct_'||coalesce(p_op,''); result jsonb; cur taskpulse_private.code_of_conduct_versions; saved uuid;
 request jsonb:=jsonb_build_array(p_op,p_title,p_body,p_version); BEGIN
 IF actor IS NULL OR org IS NULL OR public.get_user_role() IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_op IS NULL OR p_op NOT IN ('publish','acknowledge') OR p_operation IS NULL OR p_version IS NULL THEN
  RAISE EXCEPTION 'Publish or acknowledge, with a version and an operation id' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('code_of_conduct:'||org::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=cmd AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;
 SELECT * INTO cur FROM taskpulse_private.code_of_conduct_versions WHERE organization_id=org ORDER BY version DESC LIMIT 1;
 IF coalesce(cur.version,0)<>p_version THEN
  RAISE EXCEPTION 'The Code of Conduct was changed meanwhile; reload the page' USING ERRCODE='PT409'; END IF;

 IF p_op='publish' THEN
  IF public.get_user_role() IS DISTINCT FROM 'managing_director' THEN
   RAISE EXCEPTION 'Only the managing director can publish the Code of Conduct' USING ERRCODE='42501'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 120 THEN
   RAISE EXCEPTION 'Give the Code of Conduct a title of 1-120 characters' USING ERRCODE='23514'; END IF;
  IF p_body IS NULL OR length(btrim(p_body)) NOT BETWEEN 1 AND 20000 THEN
   RAISE EXCEPTION 'The Code of Conduct needs text, up to 20000 characters' USING ERRCODE='23514'; END IF;
  INSERT INTO taskpulse_private.code_of_conduct_versions(organization_id,version,title,body,published_by)
  VALUES(org,coalesce(cur.version,0)+1,btrim(p_title),btrim(p_body),actor) RETURNING id INTO saved;
  result:=jsonb_build_object('id',saved,'version',coalesce(cur.version,0)+1);
 ELSE
  IF cur.id IS NULL THEN RAISE EXCEPTION 'There is no Code of Conduct to accept yet' USING ERRCODE='P0002'; END IF;
  INSERT INTO taskpulse_private.code_of_conduct_acknowledgements(organization_id,version_id,user_id)
  VALUES(org,cur.id,actor) ON CONFLICT DO NOTHING;
  saved:=cur.id;
  result:=jsonb_build_object('id',cur.id,'version',cur.version);
 END IF;
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,cmd,p_operation,request,saved,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.code_of_conduct_command(text,text,text,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.code_of_conduct_command(text,text,text,integer,uuid) TO authenticated;

COMMIT;
SELECT taskpulse_private.m15_secure();
