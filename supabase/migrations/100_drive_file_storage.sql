-- ===========================================================================
-- TaskPulse - company files in a Google Shared Drive (go-live Part F)
--
-- The user asked (go-live plan, 31 October 2026; built 2 November 2026) for
-- personal documents and proof files to live in the company's Shared Drive
-- ("TaskPulse Files") instead of Supabase storage. Check-in photos stay in
-- Supabase. Nothing in the drive is shared with staff; the app uploads as a
-- service account and checks permissions every time a file is opened.
--
-- Supabase storage stays the upload inbox: the browser still uploads through
-- a signed link (no request size limit), the record command still validates
-- it, then the server moves the file into the drive and deletes the inbox
-- copy. Until a file is moved it is served from storage as before, so a Drive
-- outage never loses or hides a file.
--
-- 1. taskpulse_private.file_storage: the company's Shared Drive id (set by the
--    managing director through file_storage_configure) and the last
--    connection check.
-- 2. taskpulse_private.drive_files: one row per stored file (bucket + path):
--    pending until moved, then moved with its Drive file id, trashed once the
--    record no longer uses it. Drive ids are written only by the server
--    (service role), never by signed-in users.
-- 3. file_access(bucket, path): the permission check every file view runs,
--    with the same rule as the storage bucket (personal documents: the person
--    and the managing director of the company).
-- 4. Service-role commands, scoped to one company by x-taskpulse-organization
--    (migration 40): file_move_claim, file_move_finish, file_move_pending,
--    file_release, file_storage_checked.
-- 5. file_storage_status() for Reports > Data checks (managing director).
--
-- Folder layout (the plan's "What it will look like"):
--   Personal documents/<Employee ID> - <Name>/<Kind> - <file name>
-- Proof folders arrive with the proof features in later migrations.
-- ===========================================================================
BEGIN;

CREATE TABLE taskpulse_private.file_storage (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE RESTRICT,
 shared_drive_id text NOT NULL CHECK (shared_drive_id ~ '^[A-Za-z0-9_-]{10,100}$'),
 configured_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 configured_at timestamptz NOT NULL DEFAULT now(),
 last_check_at timestamptz,
 last_check_ok boolean,
 last_check_error text CHECK (length(last_check_error)<=500)
);

CREATE TABLE taskpulse_private.drive_files (
 bucket text NOT NULL CHECK (bucket IN ('personal-documents')),
 path text NOT NULL CHECK (length(path) BETWEEN 1 AND 300),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','moved','trashed')),
 drive_file_id text CHECK (drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
 last_error text CHECK (length(last_error)<=500),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 moved_at timestamptz,
 trashed_at timestamptz,
 PRIMARY KEY (bucket,path),
 CHECK (state<>'moved' OR (drive_file_id IS NOT NULL AND moved_at IS NOT NULL)),
 CHECK ((state='trashed')=(trashed_at IS NOT NULL))
);
CREATE INDEX drive_files_company_state_idx ON taskpulse_private.drive_files(organization_id,state);

REVOKE ALL ON taskpulse_private.file_storage,taskpulse_private.drive_files FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO taskpulse_private.m15_tenant_tables(table_schema,table_name) VALUES
 ('taskpulse_private','file_storage'),('taskpulse_private','drive_files')
ON CONFLICT DO NOTHING;
INSERT INTO taskpulse_private.m15_org_refs(table_schema,table_name,column_name,ref_schema,ref_table) VALUES
 ('taskpulse_private','file_storage','configured_by','public','users')
ON CONFLICT DO NOTHING;

-- The company a service-role command acts for (x-taskpulse-organization), never a signed-in user's choice.
CREATE FUNCTION taskpulse_private.file_service_org() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=taskpulse_private.m15_scope(); BEGIN
 IF auth.uid() IS NOT NULL OR org IS NULL THEN
  RAISE EXCEPTION 'A company-scoped server request is required' USING ERRCODE='42501'; END IF;
 RETURN org;
END $$;

-- Where a stored file belongs and who it is for; NULL when no active record uses the path.
CREATE FUNCTION taskpulse_private.file_subject(p_bucket text,p_path text,p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d taskpulse_private.personal_documents; u public.users; label text; BEGIN
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
 END IF;
 RETURN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Managing director: connect the company's Shared Drive, and the Data checks line
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.file_storage_configure(p_shared_drive_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); drive text:=btrim(coalesce(p_shared_drive_id,'')); BEGIN
 IF actor IS NULL OR org IS NULL OR public.get_user_role() IS DISTINCT FROM 'managing_director' THEN
  RAISE EXCEPTION 'Only an active managing director can connect file storage' USING ERRCODE='42501'; END IF;
 IF drive !~ '^[A-Za-z0-9_-]{10,100}$' THEN
  RAISE EXCEPTION 'A Shared Drive id (the code at the end of the drive''s address) is required' USING ERRCODE='23514'; END IF;
 INSERT INTO taskpulse_private.file_storage(organization_id,shared_drive_id,configured_by)
 VALUES(org,drive,actor)
 ON CONFLICT (organization_id) DO UPDATE SET shared_drive_id=excluded.shared_drive_id,configured_by=excluded.configured_by,
  configured_at=now(),last_check_at=NULL,last_check_ok=NULL,last_check_error=NULL;
 INSERT INTO taskpulse_private.audit_events(organization_id,actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes)
 VALUES(org,actor,'managing_director','file_storage_configure','file_storage',org,ARRAY['shared_drive_id'],jsonb_build_object('sharedDriveId',drive));
 RETURN jsonb_build_object('sharedDriveId',drive);
END $$;

CREATE FUNCTION public.file_storage_status() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.current_organization(); s taskpulse_private.file_storage; BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR public.get_user_role() IS DISTINCT FROM 'managing_director' THEN
  RAISE EXCEPTION 'Only the managing director sees file storage health' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM taskpulse_private.file_storage x WHERE x.organization_id=org;
 RETURN jsonb_build_object(
  'configured',s.organization_id IS NOT NULL,'sharedDriveId',s.shared_drive_id,
  'lastCheckAt',s.last_check_at,'lastCheckOk',s.last_check_ok,'lastCheckError',s.last_check_error,
  'moved',(SELECT count(*) FROM taskpulse_private.drive_files f WHERE f.organization_id=org AND f.state='moved'),
  'pending',(SELECT count(*) FROM taskpulse_private.personal_documents d WHERE d.organization_id=org AND d.record_state='active'
    AND NOT EXISTS(SELECT 1 FROM taskpulse_private.drive_files f WHERE f.bucket='personal-documents' AND f.path=d.storage_path AND f.state='moved')),
  'lastError',(SELECT f.last_error FROM taskpulse_private.drive_files f WHERE f.organization_id=org AND f.state='pending'
    AND f.last_error IS NOT NULL ORDER BY f.updated_at DESC LIMIT 1));
END $$;

-- ---------------------------------------------------------------------------
-- Every file view: the caller may open this file, and where it lives now
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.file_access(p_bucket text,p_path text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.current_organization(); subject jsonb; f taskpulse_private.drive_files; BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR public.get_user_role() IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 subject:=taskpulse_private.file_subject(p_bucket,p_path,org);
 IF subject IS NULL THEN RAISE EXCEPTION 'This file is no longer available' USING ERRCODE='P0002'; END IF;
 IF p_bucket='personal-documents' AND (subject->>'ownerId')::uuid<>auth.uid() AND public.get_user_role()<>'managing_director' THEN
  RAISE EXCEPTION 'Only the person and the managing director can open this file' USING ERRCODE='42501'; END IF;
 SELECT * INTO f FROM taskpulse_private.drive_files x WHERE x.bucket=p_bucket AND x.path=p_path AND x.organization_id=org;
 RETURN jsonb_build_object('fileName',subject->>'fileName','mimeType',subject->>'mimeType',
  'driveFileId',CASE WHEN f.state='moved' THEN f.drive_file_id END);
END $$;

-- ---------------------------------------------------------------------------
-- Server (service role, one company): move, finish, retry list, release, check
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.file_move_claim(p_bucket text,p_path text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=taskpulse_private.file_service_org(); drive text; subject jsonb; f taskpulse_private.drive_files; BEGIN
 SELECT shared_drive_id INTO drive FROM taskpulse_private.file_storage WHERE organization_id=org;
 IF drive IS NULL THEN RETURN jsonb_build_object('state','unconfigured'); END IF;
 subject:=taskpulse_private.file_subject(p_bucket,p_path,org);
 IF subject IS NULL THEN RETURN jsonb_build_object('state','gone'); END IF;
 INSERT INTO taskpulse_private.drive_files(bucket,path,organization_id) VALUES(p_bucket,p_path,org)
 ON CONFLICT (bucket,path) DO NOTHING;
 SELECT * INTO f FROM taskpulse_private.drive_files x WHERE x.bucket=p_bucket AND x.path=p_path AND x.organization_id=org FOR UPDATE;
 IF f.state='moved' THEN RETURN jsonb_build_object('state','moved','driveFileId',f.drive_file_id); END IF;
 RETURN subject||jsonb_build_object('state','pending','sharedDriveId',drive,'attempts',f.attempts);
END $$;

CREATE FUNCTION public.file_move_finish(p_bucket text,p_path text,p_drive_file_id text,p_error text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=taskpulse_private.file_service_org(); f taskpulse_private.drive_files; BEGIN
 SELECT * INTO f FROM taskpulse_private.drive_files x WHERE x.bucket=p_bucket AND x.path=p_path AND x.organization_id=org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown stored file' USING ERRCODE='P0002'; END IF;
 IF f.state='moved' THEN RETURN jsonb_build_object('state','moved','driveFileId',f.drive_file_id); END IF;
 IF p_drive_file_id IS NOT NULL THEN
  IF p_drive_file_id !~ '^[A-Za-z0-9_-]{10,200}$' THEN RAISE EXCEPTION 'A Drive file id is required' USING ERRCODE='23514'; END IF;
  UPDATE taskpulse_private.drive_files SET state='moved',drive_file_id=p_drive_file_id,moved_at=now(),updated_at=now(),last_error=NULL
  WHERE bucket=p_bucket AND path=p_path;
  RETURN jsonb_build_object('state','moved','driveFileId',p_drive_file_id);
 END IF;
 UPDATE taskpulse_private.drive_files SET attempts=attempts+1,last_error=left(coalesce(nullif(btrim(p_error),''),'Move failed'),500),updated_at=now()
 WHERE bucket=p_bucket AND path=p_path;
 RETURN jsonb_build_object('state','pending');
END $$;

-- Active files not in the drive yet: never tried, or due for another try (up to 8 tries, spaced out).
CREATE FUNCTION public.file_move_pending(p_limit integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=taskpulse_private.file_service_org(); BEGIN
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('bucket','personal-documents','path',d.storage_path)) FROM (
  SELECT d.storage_path FROM taskpulse_private.personal_documents d
  LEFT JOIN taskpulse_private.drive_files f ON f.bucket='personal-documents' AND f.path=d.storage_path
  WHERE d.organization_id=org AND d.record_state='active' AND d.uploaded_at<now()-interval '2 minutes'
   AND (f.path IS NULL OR (f.state='pending' AND f.attempts<8 AND f.updated_at<now()-make_interval(mins=>5*(f.attempts+1))))
  ORDER BY d.uploaded_at LIMIT greatest(1,least(coalesce(p_limit,5),25))) d),'[]'::jsonb);
END $$;

-- Paths the record command released: the drive copies to send to the trash. A path still in use is kept.
CREATE FUNCTION public.file_release(p_bucket text,p_paths text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=taskpulse_private.file_service_org(); out jsonb:='[]'; f taskpulse_private.drive_files; BEGIN
 FOR f IN SELECT * FROM taskpulse_private.drive_files x
  WHERE x.bucket=p_bucket AND x.path=ANY(coalesce(p_paths,'{}')) AND x.organization_id=org AND x.state<>'trashed' FOR UPDATE LOOP
  IF taskpulse_private.file_subject(f.bucket,f.path,org) IS NOT NULL THEN CONTINUE; END IF;
  IF f.drive_file_id IS NOT NULL THEN out:=out||jsonb_build_array(f.drive_file_id); END IF;
  UPDATE taskpulse_private.drive_files SET state='trashed',trashed_at=now(),updated_at=now() WHERE bucket=f.bucket AND path=f.path;
 END LOOP;
 RETURN jsonb_build_object('trash',out);
END $$;

CREATE FUNCTION public.file_storage_checked(p_ok boolean,p_error text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=taskpulse_private.file_service_org(); BEGIN
 UPDATE taskpulse_private.file_storage SET last_check_at=now(),last_check_ok=coalesce(p_ok,false),
  last_check_error=CASE WHEN coalesce(p_ok,false) THEN NULL ELSE left(coalesce(nullif(btrim(p_error),''),'Check failed'),500) END
 WHERE organization_id=org;
END $$;

-- The Shared Drive id for the company the server is acting for (connection check).
CREATE FUNCTION public.file_storage_drive() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT shared_drive_id FROM taskpulse_private.file_storage WHERE organization_id=taskpulse_private.file_service_org();
$$;

REVOKE ALL ON FUNCTION taskpulse_private.file_service_org(),taskpulse_private.file_subject(text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.file_storage_configure(text),public.file_storage_status(),public.file_access(text,text),
 public.file_move_claim(text,text),public.file_move_finish(text,text,text,text),public.file_move_pending(integer),
 public.file_release(text,text[]),public.file_storage_checked(boolean,text),public.file_storage_drive()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.file_storage_configure(text),public.file_storage_status(),public.file_access(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.file_move_claim(text,text),public.file_move_finish(text,text,text,text),public.file_move_pending(integer),
 public.file_release(text,text[]),public.file_storage_checked(boolean,text),public.file_storage_drive() TO service_role;

COMMIT;
SELECT taskpulse_private.m15_secure();
