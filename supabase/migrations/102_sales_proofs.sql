-- ===========================================================================
-- TaskPulse - sales proofs in the company Shared Drive (go-live Part F)
--
-- User decisions (2 November 2026): a sales entry can carry proof files. The
-- entry's salesperson, the managing director and project engineers (who
-- validate sales) see and add them; the uploader or one of those managers
-- removes one. PDF, images and Word/Excel/PowerPoint up to 25 MB each, as for
-- mission proofs (migration 101). They live in the Shared Drive at
-- Proofs/<YYYY-MM>/Sales/<date> - <client> - <salesperson>/ (the sale's month),
-- moved there by the files module (migration 100). Withdrawn entries keep
-- their proofs but take no new ones.
--
-- 1. Storage bucket sales-proofs (private, 25 MB): objects at
--    <organization>/<sale>/<uuid>.<ext>, with policies on the same rule.
-- 2. taskpulse_private.sale_proofs, sale_proofs(sales[]) and
--    sale_proof_command(...) (idempotent).
-- 3. The files module learns the bucket (bodies from migration 101).
-- Nothing here changes the sales factor (migration 46) or any score.
-- ===========================================================================
BEGIN;

CREATE TABLE taskpulse_private.sale_proofs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 sale_id uuid NOT NULL REFERENCES public.sales_logs(id) ON DELETE RESTRICT,
 storage_path text NOT NULL UNIQUE CHECK (length(storage_path)<=300),
 file_name text NOT NULL CHECK (file_name=btrim(file_name) AND length(file_name) BETWEEN 1 AND 200),
 mime_type text NOT NULL,
 size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 26214400),
 uploaded_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 uploaded_at timestamptz NOT NULL DEFAULT now(),
 record_state text NOT NULL DEFAULT 'active' CHECK (record_state IN ('active','withdrawn')),
 withdrawn_at timestamptz,
 withdrawn_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
 CHECK ((record_state='withdrawn')=(withdrawn_at IS NOT NULL))
);
CREATE INDEX sale_proofs_sale_idx ON taskpulse_private.sale_proofs(sale_id,uploaded_at) WHERE record_state='active';
CREATE INDEX sale_proofs_company_idx ON taskpulse_private.sale_proofs(organization_id);

REVOKE ALL ON taskpulse_private.sale_proofs FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO taskpulse_private.m15_tenant_tables(table_schema,table_name) VALUES ('taskpulse_private','sale_proofs')
ON CONFLICT DO NOTHING;
INSERT INTO taskpulse_private.m15_org_refs(table_schema,table_name,column_name,ref_schema,ref_table) VALUES
 ('taskpulse_private','sale_proofs','sale_id','public','sales_logs'),
 ('taskpulse_private','sale_proofs','uploaded_by','public','users'),
 ('taskpulse_private','sale_proofs','withdrawn_by','public','users')
ON CONFLICT DO NOTHING;

ALTER TABLE taskpulse_private.drive_files DROP CONSTRAINT drive_files_bucket_check,
 ADD CONSTRAINT drive_files_bucket_check CHECK (bucket IN ('personal-documents','mission-proofs','sales-proofs'));

-- The rule for one sales entry's proofs: an active member of its company who is the entry's
-- salesperson, the managing director or a project engineer.
CREATE FUNCTION taskpulse_private.sale_proof_allowed(p_sale uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND public.get_user_role() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.sales_logs s WHERE s.id=p_sale AND s.organization_id=public.current_organization()
   AND (public.get_user_role() IN ('managing_director','project_engineer') OR s.sales_by=auth.uid()));
$$;

CREATE FUNCTION public.sale_proof_folder_allowed(p_name text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE part text[]:=string_to_array(coalesce(p_name,''),'/'); BEGIN
 IF array_length(part,1)<>3 OR part[1] IS DISTINCT FROM public.current_organization()::text
  OR part[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
 RETURN taskpulse_private.sale_proof_allowed(part[2]::uuid);
END $$;

CREATE FUNCTION public.sale_proof_in_use(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM taskpulse_private.sale_proofs p WHERE p.storage_path=p_name AND p.record_state='active');
$$;

-- ---------------------------------------------------------------------------
-- Read and command
-- ---------------------------------------------------------------------------
-- For the Sales log: the entries (of those asked) whose proofs the caller may see, keyed by entry id.
CREATE FUNCTION public.sale_proofs(p_sales uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE manager boolean:=public.get_user_role() IN ('managing_director','project_engineer'); BEGIN
 IF auth.uid() IS NULL OR public.current_organization() IS NULL OR public.get_user_role() IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF coalesce(cardinality(p_sales),0)>500 THEN RAISE EXCEPTION 'At most 500 entries at a time' USING ERRCODE='23514'; END IF;
 RETURN coalesce((SELECT jsonb_object_agg(s.id,jsonb_build_object(
   'canAdd',s.validation_state IS DISTINCT FROM 'withdrawn',
   'proofs',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'path',p.storage_path,'fileName',p.file_name,'mimeType',p.mime_type,
      'sizeBytes',p.size_bytes,'uploadedAt',p.uploaded_at,'uploaderName',u.full_name,
      'canRemove',manager OR p.uploaded_by=auth.uid()) ORDER BY p.uploaded_at DESC),'[]')
     FROM taskpulse_private.sale_proofs p LEFT JOIN public.users u ON u.id=p.uploaded_by
     WHERE p.sale_id=s.id AND p.record_state='active')))
  FROM public.sales_logs s WHERE s.id=ANY(coalesce(p_sales,'{}')) AND taskpulse_private.sale_proof_allowed(s.id)),'{}'::jsonb);
END $$;

CREATE FUNCTION public.sale_proof_command(p_op text,p_sale uuid,p_path text,p_file_name text,p_mime_type text,
 p_size_bytes integer,p_proof uuid,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); receipt taskpulse_private.command_receipts;
 cmd text:='sale_proof_'||coalesce(p_op,''); result jsonb; saved uuid; released text[]:='{}'; found_object boolean; ext text;
 s public.sales_logs; manager boolean:=public.get_user_role() IN ('managing_director','project_engineer');
 request jsonb:=jsonb_build_array(p_op,p_sale,p_path,p_file_name,p_mime_type,p_size_bytes,p_proof); BEGIN
 IF actor IS NULL OR org IS NULL OR public.get_user_role() IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_op IS NULL OR p_op NOT IN ('add','withdraw') OR p_operation IS NULL OR p_sale IS NULL THEN
  RAISE EXCEPTION 'Add or withdraw, with a sales entry and an operation id' USING ERRCODE='23514'; END IF;
 IF NOT taskpulse_private.sale_proof_allowed(p_sale) THEN
  RAISE EXCEPTION 'Only the salesperson and managers can change this entry''s proofs' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sale_proofs:'||p_sale::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=cmd AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;
 SELECT * INTO s FROM public.sales_logs x WHERE x.id=p_sale;

 IF p_op='add' THEN
  IF s.validation_state='withdrawn' THEN RAISE EXCEPTION 'This sales entry was withdrawn' USING ERRCODE='23514'; END IF;
  ext:=taskpulse_private.proof_extension(p_mime_type);
  IF ext IS NULL THEN RAISE EXCEPTION 'Upload a PDF, a photo (JPEG, PNG, WebP, HEIC) or a Word, Excel or PowerPoint file' USING ERRCODE='23514'; END IF;
  IF p_path IS NULL OR p_path !~ ('^'||org::text||'/'||p_sale::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.'||ext||'$') THEN
   RAISE EXCEPTION 'The file must be uploaded to the entry''s folder first' USING ERRCODE='23514'; END IF;
  IF p_size_bytes IS NULL OR p_size_bytes NOT BETWEEN 1 AND 26214400 THEN
   RAISE EXCEPTION 'Files must be 25 MB or smaller' USING ERRCODE='23514'; END IF;
  IF p_file_name IS NULL OR btrim(p_file_name)='' THEN RAISE EXCEPTION 'The file needs a name' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM taskpulse_private.sale_proofs WHERE sale_id=p_sale AND record_state='active')>=50 THEN
   RAISE EXCEPTION 'A sales entry keeps up to 50 proofs; remove one first' USING ERRCODE='23514'; END IF;
  IF to_regclass('storage.objects') IS NOT NULL THEN
   EXECUTE 'SELECT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=$1 AND name=$2)' INTO found_object USING 'sales-proofs',p_path;
   IF NOT found_object THEN RAISE EXCEPTION 'The file did not upload; try again' USING ERRCODE='23514'; END IF;
  END IF;
  INSERT INTO taskpulse_private.sale_proofs(organization_id,sale_id,storage_path,file_name,mime_type,size_bytes,uploaded_by)
  VALUES(org,p_sale,p_path,left(btrim(p_file_name),200),p_mime_type,p_size_bytes,actor) RETURNING id INTO saved;
 ELSE
  UPDATE taskpulse_private.sale_proofs SET record_state='withdrawn',withdrawn_at=clock_timestamp(),withdrawn_by=actor
  WHERE id=p_proof AND sale_id=p_sale AND record_state='active' AND (uploaded_by=actor OR manager)
  RETURNING id,ARRAY[storage_path] INTO saved,released;
  IF saved IS NULL THEN RAISE EXCEPTION 'Only the person who added a proof, or a manager, can remove it' USING ERRCODE='P0002'; END IF;
 END IF;

 result:=jsonb_build_object('id',saved,'released',to_jsonb(released));
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,cmd,p_operation,request,saved,result);
 RETURN result;
END $$;

-- ---------------------------------------------------------------------------
-- The files module learns the bucket (bodies from migration 101, extended)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION taskpulse_private.file_subject(p_bucket text,p_path text,p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d taskpulse_private.personal_documents; p taskpulse_private.task_proofs; t public.tasks; u public.users;
 sp taskpulse_private.sale_proofs; s public.sales_logs; label text; month text; BEGIN
 IF p_bucket='personal-documents' THEN
  SELECT * INTO d FROM taskpulse_private.personal_documents x
  WHERE x.storage_path=p_path AND x.organization_id=p_org AND x.record_state='active';
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO u FROM public.users x WHERE x.id=d.user_id;
  label:=CASE d.kind WHEN 'class10' THEN '10th marksheet' WHEN 'class12' THEN '12th marksheet'
   WHEN 'aadhaar' THEN 'Aadhaar card' ELSE 'College marksheet' END;
  RETURN jsonb_build_object('ownerId',d.user_id,'fileName',d.file_name,'mimeType',d.mime_type,'sizeBytes',d.size_bytes,
   'driveName',left(label||' - '||d.file_name,250),
   'folders',jsonb_build_array(
    jsonb_build_object('key','root:personal-documents','name','Personal documents'),
    jsonb_build_object('key','person:'||d.user_id,'name',left(coalesce(nullif(btrim(u.employee_id),''),'No ID')||' - '||coalesce(nullif(btrim(u.full_name),''),'Member'),200))));
 ELSIF p_bucket='mission-proofs' THEN
  SELECT * INTO p FROM taskpulse_private.task_proofs x
  WHERE x.storage_path=p_path AND x.organization_id=p_org AND x.record_state='active';
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO t FROM public.tasks x WHERE x.id=p.task_id;
  month:=to_char(coalesce(t.assigned_date,(p.uploaded_at AT TIME ZONE 'Asia/Kolkata')::date),'YYYY-MM');
  RETURN jsonb_build_object('taskId',p.task_id,'fileName',p.file_name,'mimeType',p.mime_type,'sizeBytes',p.size_bytes,
   'driveName',left(p.file_name,250),
   'folders',jsonb_build_array(
    jsonb_build_object('key','root:proofs','name','Proofs'),
    jsonb_build_object('key','proofs-month:'||month,'name',month),
    jsonb_build_object('key','task:'||p.task_id,'name',left(coalesce(t.task_tag,'Mission')||' - '||coalesce(nullif(btrim(t.title),''),'Untitled'),200))));
 ELSIF p_bucket='sales-proofs' THEN
  SELECT * INTO sp FROM taskpulse_private.sale_proofs x
  WHERE x.storage_path=p_path AND x.organization_id=p_org AND x.record_state='active';
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO s FROM public.sales_logs x WHERE x.id=sp.sale_id;
  SELECT * INTO u FROM public.users x WHERE x.id=s.sales_by;
  month:=to_char(coalesce(s.sale_date,(sp.uploaded_at AT TIME ZONE 'Asia/Kolkata')::date),'YYYY-MM');
  RETURN jsonb_build_object('saleId',sp.sale_id,'fileName',sp.file_name,'mimeType',sp.mime_type,'sizeBytes',sp.size_bytes,
   'driveName',left(sp.file_name,250),
   'folders',jsonb_build_array(
    jsonb_build_object('key','root:proofs','name','Proofs'),
    jsonb_build_object('key','proofs-month:'||month,'name',month),
    jsonb_build_object('key','proofs-sales:'||month,'name','Sales'),
    jsonb_build_object('key','sale:'||sp.sale_id,'name',left(coalesce(to_char(s.sale_date,'YYYY-MM-DD'),'Undated')
     ||' - '||coalesce(nullif(btrim(s.client_name),''),nullif(btrim(s.project_location),''),'Sale')
     ||' - '||coalesce(nullif(btrim(u.full_name),''),'Unattributed'),200))));
 END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.file_access(p_bucket text,p_path text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.current_organization(); subject jsonb; f taskpulse_private.drive_files; BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR public.get_user_role() IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 subject:=taskpulse_private.file_subject(p_bucket,p_path,org);
 IF subject IS NULL THEN RAISE EXCEPTION 'This file is no longer available' USING ERRCODE='P0002'; END IF;
 IF p_bucket='personal-documents' AND (subject->>'ownerId')::uuid<>auth.uid() AND public.get_user_role()<>'managing_director' THEN
  RAISE EXCEPTION 'Only the person and the managing director can open this file' USING ERRCODE='42501'; END IF;
 IF p_bucket='mission-proofs' AND NOT taskpulse_private.task_proof_allowed((subject->>'taskId')::uuid) THEN
  RAISE EXCEPTION 'Only the mission''s people and managers can open its proofs' USING ERRCODE='42501'; END IF;
 IF p_bucket='sales-proofs' AND NOT taskpulse_private.sale_proof_allowed((subject->>'saleId')::uuid) THEN
  RAISE EXCEPTION 'Only the salesperson and managers can open this entry''s proofs' USING ERRCODE='42501'; END IF;
 SELECT * INTO f FROM taskpulse_private.drive_files x WHERE x.bucket=p_bucket AND x.path=p_path AND x.organization_id=org;
 RETURN jsonb_build_object('fileName',subject->>'fileName','mimeType',subject->>'mimeType',
  'driveFileId',CASE WHEN f.state='moved' THEN f.drive_file_id END);
END $$;

CREATE OR REPLACE FUNCTION public.file_move_pending(p_limit integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=taskpulse_private.file_service_org(); BEGIN
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('bucket',s.bucket,'path',s.path)) FROM (
  SELECT s.bucket,s.path FROM (
   SELECT 'personal-documents'::text AS bucket,d.storage_path AS path,d.uploaded_at FROM taskpulse_private.personal_documents d
   WHERE d.organization_id=org AND d.record_state='active'
   UNION ALL
   SELECT 'mission-proofs',p.storage_path,p.uploaded_at FROM taskpulse_private.task_proofs p
   WHERE p.organization_id=org AND p.record_state='active'
   UNION ALL
   SELECT 'sales-proofs',p.storage_path,p.uploaded_at FROM taskpulse_private.sale_proofs p
   WHERE p.organization_id=org AND p.record_state='active') s
  LEFT JOIN taskpulse_private.drive_files f ON f.bucket=s.bucket AND f.path=s.path
  WHERE s.uploaded_at<now()-interval '2 minutes'
   AND (f.path IS NULL OR (f.state='pending' AND f.attempts<8 AND f.updated_at<now()-make_interval(mins=>5*(f.attempts+1))))
  ORDER BY s.uploaded_at LIMIT greatest(1,least(coalesce(p_limit,5),25))) s),'[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.file_storage_status() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.current_organization(); s taskpulse_private.file_storage; BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR public.get_user_role() IS DISTINCT FROM 'managing_director' THEN
  RAISE EXCEPTION 'Only the managing director sees file storage health' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM taskpulse_private.file_storage x WHERE x.organization_id=org;
 RETURN jsonb_build_object(
  'configured',s.organization_id IS NOT NULL,'sharedDriveId',s.shared_drive_id,
  'lastCheckAt',s.last_check_at,'lastCheckOk',s.last_check_ok,'lastCheckError',s.last_check_error,
  'moved',(SELECT count(*) FROM taskpulse_private.drive_files f WHERE f.organization_id=org AND f.state='moved'),
  'pending',(SELECT count(*) FROM (
    SELECT 'personal-documents'::text AS bucket,d.storage_path AS path FROM taskpulse_private.personal_documents d
    WHERE d.organization_id=org AND d.record_state='active'
    UNION ALL
    SELECT 'mission-proofs',p.storage_path FROM taskpulse_private.task_proofs p
    WHERE p.organization_id=org AND p.record_state='active'
    UNION ALL
    SELECT 'sales-proofs',p.storage_path FROM taskpulse_private.sale_proofs p
    WHERE p.organization_id=org AND p.record_state='active') a
   WHERE NOT EXISTS(SELECT 1 FROM taskpulse_private.drive_files f WHERE f.bucket=a.bucket AND f.path=a.path AND f.state='moved')),
  'lastError',(SELECT f.last_error FROM taskpulse_private.drive_files f WHERE f.organization_id=org AND f.state='pending'
    AND f.last_error IS NOT NULL ORDER BY f.updated_at DESC LIMIT 1));
END $$;

REVOKE ALL ON FUNCTION taskpulse_private.sale_proof_allowed(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.sale_proof_folder_allowed(text),public.sale_proof_in_use(text),public.sale_proofs(uuid[]),
 public.sale_proof_command(text,uuid,text,text,text,integer,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sale_proof_folder_allowed(text),public.sale_proof_in_use(text),public.sale_proofs(uuid[]),
 public.sale_proof_command(text,uuid,text,text,text,integer,uuid,uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket and its policies (Supabase only)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NULL THEN RETURN; END IF;
 INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('sales-proofs','sales-proofs',false,26214400,ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
 ON CONFLICT (id) DO NOTHING;
 EXECUTE $p$CREATE POLICY sales_proofs_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='sales-proofs' AND public.sale_proof_folder_allowed(name))$p$;
 EXECUTE $p$CREATE POLICY sales_proofs_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='sales-proofs' AND public.sale_proof_folder_allowed(name))$p$;
 EXECUTE $p$CREATE POLICY sales_proofs_discard ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='sales-proofs' AND public.sale_proof_folder_allowed(name) AND NOT public.sale_proof_in_use(name))$p$;
 EXECUTE $p$CREATE POLICY sales_proofs_definer ON storage.objects FOR SELECT TO taskpulse_definer
  USING (bucket_id='sales-proofs')$p$;
END $$;

COMMIT;
SELECT taskpulse_private.m15_secure();
