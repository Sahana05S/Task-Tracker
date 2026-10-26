-- ===========================================================================
-- TaskPulse - M19 personal records (forward only)
--
-- Every employee keeps four records on their profile's Personal info tab:
-- 10th marksheet, 12th marksheet, Aadhaar card and college marksheet(s)
-- (DECISIONS "M19 HR", 26 October 2026). The employee uploads and replaces
-- their own; the managing director sees everyone's in the company. Project
-- engineers and other members see only their own.
--
-- 1. taskpulse_private.personal_documents: one active file per kind, except
--    college, which keeps up to 12 (one per semester or year). Private table,
--    read and written only through the functions below.
-- 2. Storage bucket personal-documents (private, 5 MB, PDF/JPEG/PNG/WebP).
--    Objects live at <organization>/<user>/<kind>/<uuid>.<ext>. A member may
--    upload under their own folder and read their own files; the managing
--    director reads the company's. A member may delete an own file only while
--    no active record points at it (a failed save or a replaced file).
-- 3. personal_records(user), personal_record_command(...) and
--    personal_records_summary() (managing director).
--
-- Nothing here is written to the audit trail's protected changes or the
-- activity feed. Only the file is kept; no Aadhaar number is typed or stored.
-- The storage parts are skipped where the storage schema does not exist
-- (plain PostgreSQL used by the contract tests).
-- ===========================================================================
BEGIN;

CREATE TABLE taskpulse_private.personal_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK (kind IN ('class10','class12','aadhaar','college')),
 storage_path text NOT NULL UNIQUE CHECK (length(storage_path)<=300),
 file_name text NOT NULL CHECK (file_name=btrim(file_name) AND length(file_name) BETWEEN 1 AND 200),
 mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
 size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
 record_state text NOT NULL DEFAULT 'active' CHECK (record_state IN ('active','withdrawn')),
 uploaded_at timestamptz NOT NULL DEFAULT now(),
 withdrawn_at timestamptz,
 CHECK ((record_state='withdrawn')=(withdrawn_at IS NOT NULL))
);
CREATE UNIQUE INDEX personal_documents_one_per_kind ON taskpulse_private.personal_documents(user_id,kind)
 WHERE record_state='active' AND kind<>'college';
CREATE INDEX personal_documents_company_idx ON taskpulse_private.personal_documents(organization_id,user_id);

REVOKE ALL ON taskpulse_private.personal_documents FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO taskpulse_private.m15_tenant_tables(table_schema,table_name) VALUES ('taskpulse_private','personal_documents')
ON CONFLICT DO NOTHING;
INSERT INTO taskpulse_private.m15_org_refs(table_schema,table_name,column_name,ref_schema,ref_table) VALUES
 ('taskpulse_private','personal_documents','user_id','public','users')
ON CONFLICT DO NOTHING;

-- The caller, active in an active company; every personal-records function starts here.
CREATE FUNCTION taskpulse_private.personal_actor() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.current_organization(); BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR public.get_user_role() IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 RETURN org;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.personal_actor() FROM PUBLIC,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.personal_records(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=taskpulse_private.personal_actor(); u public.users; BEGIN
 IF p_user IS DISTINCT FROM auth.uid() AND public.get_user_role() IS DISTINCT FROM 'managing_director' THEN
  RAISE EXCEPTION 'Only the managing director can see other people''s personal records' USING ERRCODE='42501'; END IF;
 SELECT * INTO u FROM public.users WHERE id=p_user AND organization_id=org;
 IF NOT FOUND THEN RAISE EXCEPTION 'No such member in your company' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('userId',u.id,'employeeId',u.employee_id,'fullName',u.full_name,
  'documents',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'kind',d.kind,'path',d.storage_path,'fileName',d.file_name,
    'mimeType',d.mime_type,'sizeBytes',d.size_bytes,'uploadedAt',d.uploaded_at) ORDER BY d.kind,d.uploaded_at),'[]')
   FROM taskpulse_private.personal_documents d WHERE d.user_id=p_user AND d.record_state='active'));
END $$;
REVOKE ALL ON FUNCTION public.personal_records(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.personal_records(uuid) TO authenticated;

-- Which kinds each active member has uploaded (managing director only).
CREATE FUNCTION public.personal_records_summary() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=taskpulse_private.personal_actor(); BEGIN
 IF public.get_user_role() IS DISTINCT FROM 'managing_director' THEN
  RAISE EXCEPTION 'Only the managing director can see everyone''s personal records' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('userId',u.id,'employeeId',u.employee_id,'fullName',u.full_name,
   'kinds',(SELECT coalesce(jsonb_agg(DISTINCT d.kind),'[]') FROM taskpulse_private.personal_documents d
     WHERE d.user_id=u.id AND d.record_state='active')) ORDER BY u.full_name),'[]')
  FROM public.users u WHERE u.organization_id=org AND u.is_active);
END $$;
REVOKE ALL ON FUNCTION public.personal_records_summary() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.personal_records_summary() TO authenticated;

-- ---------------------------------------------------------------------------
-- Command: the employee adds (or replaces) and withdraws their own records
-- ---------------------------------------------------------------------------
-- add: the file is already uploaded to the caller's folder; for every kind but
-- college the earlier file of that kind is withdrawn. withdraw: removes one of
-- the caller's records. Returns the paths no record points at any more, which
-- the app then deletes from storage. Idempotent per operation.
CREATE FUNCTION public.personal_record_command(p_op text,p_kind text,p_path text,p_file_name text,p_mime_type text,
 p_size_bytes integer,p_record uuid,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=taskpulse_private.personal_actor(); receipt taskpulse_private.command_receipts;
 cmd text:='personal_record_'||coalesce(p_op,''); result jsonb; saved uuid; released text[]:='{}'; found_object boolean;
 request jsonb:=jsonb_build_array(p_op,p_kind,p_path,p_file_name,p_mime_type,p_size_bytes,p_record); BEGIN
 IF p_op IS NULL OR p_op NOT IN ('add','withdraw') OR p_operation IS NULL THEN
  RAISE EXCEPTION 'Add or withdraw, with an operation id' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('personal_records:'||actor::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=cmd AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;

 IF p_op='add' THEN
  IF p_kind IS NULL OR p_kind NOT IN ('class10','class12','aadhaar','college') THEN
   RAISE EXCEPTION 'Choose which record this file is' USING ERRCODE='23514'; END IF;
  IF p_path IS NULL OR p_path !~ ('^'||org::text||'/'||actor::text||'/'||p_kind||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$') THEN
   RAISE EXCEPTION 'The file must be uploaded to your own folder first' USING ERRCODE='23514'; END IF;
  IF p_mime_type IS NULL OR p_mime_type NOT IN ('application/pdf','image/jpeg','image/png','image/webp') THEN
   RAISE EXCEPTION 'Upload a PDF, JPEG, PNG or WebP file' USING ERRCODE='23514'; END IF;
  IF p_size_bytes IS NULL OR p_size_bytes NOT BETWEEN 1 AND 5242880 THEN
   RAISE EXCEPTION 'Files must be 5 MB or smaller' USING ERRCODE='23514'; END IF;
  IF p_file_name IS NULL OR btrim(p_file_name)='' THEN RAISE EXCEPTION 'The file needs a name' USING ERRCODE='23514'; END IF;
  IF to_regclass('storage.objects') IS NOT NULL THEN
   EXECUTE 'SELECT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=$1 AND name=$2)' INTO found_object USING 'personal-documents',p_path;
   IF NOT found_object THEN RAISE EXCEPTION 'The file did not upload; try again' USING ERRCODE='23514'; END IF;
  END IF;
  IF p_kind='college' AND (SELECT count(*) FROM taskpulse_private.personal_documents
    WHERE user_id=actor AND kind='college' AND record_state='active')>=12 THEN
   RAISE EXCEPTION 'You can keep up to 12 college marksheets; remove one first' USING ERRCODE='23514'; END IF;
  IF p_kind<>'college' THEN
   WITH gone AS (UPDATE taskpulse_private.personal_documents SET record_state='withdrawn',withdrawn_at=clock_timestamp()
     WHERE user_id=actor AND kind=p_kind AND record_state='active' RETURNING storage_path)
   SELECT coalesce(array_agg(storage_path),'{}') INTO released FROM gone;
  END IF;
  INSERT INTO taskpulse_private.personal_documents(organization_id,user_id,kind,storage_path,file_name,mime_type,size_bytes)
  VALUES(org,actor,p_kind,p_path,left(btrim(p_file_name),200),p_mime_type,p_size_bytes) RETURNING id INTO saved;
 ELSE
  UPDATE taskpulse_private.personal_documents SET record_state='withdrawn',withdrawn_at=clock_timestamp()
  WHERE id=p_record AND user_id=actor AND record_state='active' RETURNING id,ARRAY[storage_path] INTO saved,released;
  IF saved IS NULL THEN RAISE EXCEPTION 'That record is not one of yours or was already removed' USING ERRCODE='P0002'; END IF;
 END IF;

 result:=jsonb_build_object('id',saved,'released',to_jsonb(released));
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,cmd,p_operation,request,saved,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.personal_record_command(text,text,text,text,text,integer,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.personal_record_command(text,text,text,text,text,integer,uuid,uuid) TO authenticated;

-- For the storage delete policy: whether an active record points at a file.
CREATE FUNCTION public.personal_document_in_use(p_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM taskpulse_private.personal_documents d WHERE d.storage_path=p_path AND d.record_state='active');
$$;
REVOKE ALL ON FUNCTION public.personal_document_in_use(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.personal_document_in_use(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket and its policies (Supabase only)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NULL THEN RETURN; END IF;
 INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('personal-documents','personal-documents',false,5242880,ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
 ON CONFLICT (id) DO NOTHING;
 EXECUTE $p$CREATE POLICY personal_documents_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='personal-documents'
   AND (storage.foldername(name))[1]=public.current_organization()::text
   AND (storage.foldername(name))[2]=auth.uid()::text)$p$;
 EXECUTE $p$CREATE POLICY personal_documents_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='personal-documents'
   AND (storage.foldername(name))[1]=public.current_organization()::text
   AND ((storage.foldername(name))[2]=auth.uid()::text OR public.get_user_role()='managing_director'))$p$;
 -- Only a file no active record points at (a failed save, or a replaced or removed file).
 EXECUTE $p$CREATE POLICY personal_documents_discard ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='personal-documents'
   AND (storage.foldername(name))[1]=public.current_organization()::text
   AND (storage.foldername(name))[2]=auth.uid()::text
   AND NOT public.personal_document_in_use(name))$p$;
 -- personal_record_command (owned by taskpulse_definer) confirms the upload.
 EXECUTE $p$CREATE POLICY personal_documents_definer ON storage.objects FOR SELECT TO taskpulse_definer
  USING (bucket_id='personal-documents')$p$;
END $$;

COMMIT;
SELECT taskpulse_private.m15_secure();
