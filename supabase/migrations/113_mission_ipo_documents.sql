-- ===========================================================================
-- TaskPulse - mission Input / Process / Output documents in the Shared Drive
--
-- User decisions (3 November 2026, update plan section 10, D09/D10): a
-- mission's Input, Process and Output documents are uploaded at mission level
-- and kept in the company Shared Drive, reusing the mission proofs pipeline
-- (migration 101). The same people see and add them (task_proof_allowed: the
-- mission's assignees, including collaborators, its reviewers, including
-- observers, the managing director and project engineers), with the same
-- limits (PDF, images, Word/Excel/PowerPoint, 25 MB each).
--
-- 1. taskpulse_private.task_proofs gains kind: proof (default), input,
--    process or output. Same bucket (mission-proofs), same upload paths.
-- 2. task_proofs(task) returns each file's kind; the Proofs panel keeps only
--    proofs, the Work files panel the three document kinds.
-- 3. task_proof_command(...) takes p_kind (default 'proof', so older callers
--    keep working). Up to 200 active files of each kind per mission.
-- 4. file_subject files the documents under
--    Missions/<YYYY-MM>/<Task tag> - <Title>/{Input,Process,Output}/; proofs
--    stay under Proofs/<YYYY-MM>/<Task tag> - <Title>/. Bodies from 102.
-- Nothing here reaches the activity feed or any score.
-- ===========================================================================
BEGIN;

ALTER TABLE taskpulse_private.task_proofs
 ADD COLUMN kind text NOT NULL DEFAULT 'proof' CHECK (kind IN ('proof','input','process','output'));

-- ---------------------------------------------------------------------------
-- Read (body from 101, plus kind)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.task_proofs(p_task uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE manager boolean:=public.get_user_role() IN ('managing_director','project_engineer'); BEGIN
 IF NOT taskpulse_private.task_proof_allowed(p_task) THEN
  RAISE EXCEPTION 'Only the mission''s people and managers can see its files' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'kind',p.kind,'path',p.storage_path,'fileName',p.file_name,'mimeType',p.mime_type,
   'sizeBytes',p.size_bytes,'uploadedAt',p.uploaded_at,'uploadedBy',p.uploaded_by,'uploaderName',u.full_name,
   'canRemove',manager OR p.uploaded_by=auth.uid()) ORDER BY p.uploaded_at DESC),'[]')
  FROM taskpulse_private.task_proofs p LEFT JOIN public.users u ON u.id=p.uploaded_by
  WHERE p.task_id=p_task AND p.record_state='active');
END $$;

-- ---------------------------------------------------------------------------
-- Command (body from 101, plus p_kind). The old eight-argument form is
-- replaced so PostgREST has one candidate; p_kind defaults to 'proof'.
-- ---------------------------------------------------------------------------
DROP FUNCTION public.task_proof_command(text,uuid,text,text,text,integer,uuid,uuid);

CREATE FUNCTION public.task_proof_command(p_op text,p_task uuid,p_path text,p_file_name text,p_mime_type text,
 p_size_bytes integer,p_proof uuid,p_operation uuid,p_kind text DEFAULT 'proof') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); receipt taskpulse_private.command_receipts;
 cmd text:='task_proof_'||coalesce(p_op,''); result jsonb; saved uuid; released text[]:='{}'; found_object boolean; ext text;
 t public.tasks; manager boolean:=public.get_user_role() IN ('managing_director','project_engineer');
 file_kind text:=coalesce(p_kind,'proof');
 request jsonb:=jsonb_build_array(p_op,p_task,p_path,p_file_name,p_mime_type,p_size_bytes,p_proof); BEGIN
 -- Proof requests keep the receipt shape of 101, so a retried older operation still matches.
 IF file_kind<>'proof' THEN request:=request||to_jsonb(file_kind); END IF;
 IF actor IS NULL OR org IS NULL OR public.get_user_role() IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_op IS NULL OR p_op NOT IN ('add','withdraw') OR p_operation IS NULL OR p_task IS NULL THEN
  RAISE EXCEPTION 'Add or withdraw, with a mission and an operation id' USING ERRCODE='23514'; END IF;
 IF file_kind NOT IN ('proof','input','process','output') THEN
  RAISE EXCEPTION 'A mission file is a proof or an Input, Process or Output document' USING ERRCODE='23514'; END IF;
 IF NOT taskpulse_private.task_proof_allowed(p_task) THEN
  RAISE EXCEPTION 'Only the mission''s people and managers can change its files' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('task_proofs:'||p_task::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=cmd AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;
 SELECT * INTO t FROM public.tasks x WHERE x.id=p_task;

 IF p_op='add' THEN
  IF t.archived_effective_date IS NOT NULL THEN
   RAISE EXCEPTION 'This mission is archived; add files to the mission that continues it' USING ERRCODE='23514'; END IF;
  ext:=taskpulse_private.proof_extension(p_mime_type);
  IF ext IS NULL THEN RAISE EXCEPTION 'Upload a PDF, a photo (JPEG, PNG, WebP, HEIC) or a Word, Excel or PowerPoint file' USING ERRCODE='23514'; END IF;
  IF p_path IS NULL OR p_path !~ ('^'||org::text||'/'||p_task::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.'||ext||'$') THEN
   RAISE EXCEPTION 'The file must be uploaded to the mission''s folder first' USING ERRCODE='23514'; END IF;
  IF p_size_bytes IS NULL OR p_size_bytes NOT BETWEEN 1 AND 26214400 THEN
   RAISE EXCEPTION 'Files must be 25 MB or smaller' USING ERRCODE='23514'; END IF;
  IF p_file_name IS NULL OR btrim(p_file_name)='' THEN RAISE EXCEPTION 'The file needs a name' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM taskpulse_private.task_proofs WHERE task_id=p_task AND record_state='active' AND kind=file_kind)>=200 THEN
   RAISE EXCEPTION 'A mission keeps up to 200 files of each kind; remove one first' USING ERRCODE='23514'; END IF;
  IF to_regclass('storage.objects') IS NOT NULL THEN
   EXECUTE 'SELECT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=$1 AND name=$2)' INTO found_object USING 'mission-proofs',p_path;
   IF NOT found_object THEN RAISE EXCEPTION 'The file did not upload; try again' USING ERRCODE='23514'; END IF;
  END IF;
  INSERT INTO taskpulse_private.task_proofs(organization_id,task_id,storage_path,file_name,mime_type,size_bytes,uploaded_by,kind)
  VALUES(org,p_task,p_path,left(btrim(p_file_name),200),p_mime_type,p_size_bytes,actor,file_kind) RETURNING id INTO saved;
 ELSE
  UPDATE taskpulse_private.task_proofs SET record_state='withdrawn',withdrawn_at=clock_timestamp(),withdrawn_by=actor
  WHERE id=p_proof AND task_id=p_task AND record_state='active' AND (uploaded_by=actor OR manager)
  RETURNING id,ARRAY[storage_path] INTO saved,released;
  IF saved IS NULL THEN RAISE EXCEPTION 'Only the person who added a file, or a manager, can remove it' USING ERRCODE='P0002'; END IF;
 END IF;

 result:=jsonb_build_object('id',saved,'released',to_jsonb(released));
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,cmd,p_operation,request,saved,result);
 RETURN result;
END $$;

-- ---------------------------------------------------------------------------
-- Drive folders (body from 102; the mission-proofs branch learns the kinds)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION taskpulse_private.file_subject(p_bucket text,p_path text,p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d taskpulse_private.personal_documents; p taskpulse_private.task_proofs; t public.tasks; u public.users;
 sp taskpulse_private.sale_proofs; s public.sales_logs; label text; month text; mission text; BEGIN
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
  mission:=left(coalesce(t.task_tag,'Mission')||' - '||coalesce(nullif(btrim(t.title),''),'Untitled'),200);
  IF p.kind='proof' THEN
   RETURN jsonb_build_object('taskId',p.task_id,'kind',p.kind,'fileName',p.file_name,'mimeType',p.mime_type,'sizeBytes',p.size_bytes,
    'driveName',left(p.file_name,250),
    'folders',jsonb_build_array(
     jsonb_build_object('key','root:proofs','name','Proofs'),
     jsonb_build_object('key','proofs-month:'||month,'name',month),
     jsonb_build_object('key','task:'||p.task_id,'name',mission)));
  END IF;
  RETURN jsonb_build_object('taskId',p.task_id,'kind',p.kind,'fileName',p.file_name,'mimeType',p.mime_type,'sizeBytes',p.size_bytes,
   'driveName',left(p.file_name,250),
   'folders',jsonb_build_array(
    jsonb_build_object('key','root:missions','name','Missions'),
    jsonb_build_object('key','missions-month:'||month,'name',month),
    jsonb_build_object('key','mission:'||p.task_id,'name',mission),
    jsonb_build_object('key','mission-'||p.kind||':'||p.task_id,'name',initcap(p.kind))));
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

REVOKE ALL ON FUNCTION public.task_proof_command(text,uuid,text,text,text,integer,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.task_proof_command(text,uuid,text,text,text,integer,uuid,uuid,text) TO authenticated;

COMMIT;
SELECT taskpulse_private.m15_secure();
