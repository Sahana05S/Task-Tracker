-- Migration 72: photo check-in and check-out (the sheet's AppSheet "Check in").
--
-- An employee opens Check in on their phone, takes a photo and saves. The
-- server records the time (Asia/Kolkata, never the phone's clock), the phone's
-- position when it was shared, and the photo. Check-out does the same and
-- completes the day's attendance record: Present, the two check times, and
-- regular hours = out - in (truncated to two decimals so the M06 rule "hours
-- fit inside the check times" always holds), off-hours 0. The record is
-- written through dated_record_command, so every M06 rule, version and
-- history entry applies; a day that already has a record (a manager entered
-- it) is left as it is and the check-out says so.
--
-- 1. Storage bucket attendance-photos (private, 2 MB, JPEG/WebP). Objects live
--    at <organization>/<user>/<yyyy-mm-dd>/<in|out>-<uuid>.jpg. A member may
--    upload under their own folder and read their own photos; the managing
--    director and project engineers read their company's. A member may delete
--    an own photo only while no check-in points at it (a failed save).
-- 2. public.attendance_check_ins: one 'in' and one 'out' per person and day,
--    read by the person and by MD/PE of the company; written only by
--    attendance_check_in().
-- 3. organization_settings gains the attendance section: check-in on/off, an
--    optional office position and radius (check-ins farther away are flagged,
--    never refused) and how long photos are kept.
-- 4. policy_period_facts reads the check-in time before the day's record
--    exists, so the "on time" policy sees a check-in from the moment it happens.
-- 5. attendance_photos_due()/attendance_photos_cleared() for the retention
--    worker (service role only): expired photos are removed through the
--    Storage API, then the rows forget the path.
--
-- The storage parts are skipped where the storage schema does not exist
-- (plain PostgreSQL used by the contract tests).

BEGIN;

-- ---------------------------------------------------------------------------
-- 3. Company settings: attendance section
-- ---------------------------------------------------------------------------
ALTER TABLE taskpulse_private.organization_settings
 ADD COLUMN check_in_enabled boolean NOT NULL DEFAULT true,
 ADD COLUMN office_latitude numeric(9,6) CHECK (office_latitude BETWEEN -90 AND 90),
 ADD COLUMN office_longitude numeric(9,6) CHECK (office_longitude BETWEEN -180 AND 180),
 ADD COLUMN office_radius_m integer NOT NULL DEFAULT 200 CHECK (office_radius_m BETWEEN 20 AND 5000),
 ADD COLUMN photo_retention_days integer NOT NULL DEFAULT 90 CHECK (photo_retention_days BETWEEN 7 AND 730),
 ADD CONSTRAINT organization_settings_office_pair CHECK ((office_latitude IS NULL)=(office_longitude IS NULL));

DO $$
DECLARE def text; fn regprocedure; frag text; spec record; BEGIN
 FOR spec IN SELECT * FROM (VALUES
  ('public.company_settings()',
   '''meetingAgenda'',coalesce(s.meeting_agenda,''''),',
   '''meetingAgenda'',coalesce(s.meeting_agenda,''''),
  ''attendance'',jsonb_build_object(''checkInEnabled'',coalesce(s.check_in_enabled,true),
   ''officeLatitude'',s.office_latitude,''officeLongitude'',s.office_longitude,
   ''officeRadiusM'',coalesce(s.office_radius_m,200),''photoRetentionDays'',coalesce(s.photo_retention_days,90)),'),
  ('public.company_settings_command(text,jsonb,bigint,uuid)',
   -- Added beside the list, as 65 did, so another migration's edit of the list still applies.
   'p_section NOT IN (''agenda''',
   'p_section<>''attendance'' AND p_section NOT IN (''agenda'''),
  ('public.company_settings_command(text,jsonb,bigint,uuid)',
   'ELSIF p_section=''mission_defaults'' THEN',
   'ELSIF p_section=''attendance'' THEN
  IF p_payload-ARRAY[''checkInEnabled'',''officeLatitude'',''officeLongitude'',''officeRadiusM'',''photoRetentionDays'']<>''{}''
   OR jsonb_typeof(p_payload->''checkInEnabled'') IS DISTINCT FROM ''boolean''
   OR coalesce(jsonb_typeof(p_payload->''officeLatitude''),''null'') NOT IN (''number'',''null'')
   OR coalesce(jsonb_typeof(p_payload->''officeLongitude''),''null'') NOT IN (''number'',''null'')
   OR (jsonb_typeof(p_payload->''officeLatitude'')=''number'')<>(jsonb_typeof(p_payload->''officeLongitude'')=''number'')
   OR coalesce(p_payload->>''officeRadiusM'','''') !~ ''^\d{1,4}$''
   OR coalesce(p_payload->>''photoRetentionDays'','''') !~ ''^\d{1,3}$'' THEN
   RAISE EXCEPTION ''Attendance takes checkInEnabled, an office position (both or neither), officeRadiusM and photoRetentionDays'' USING ERRCODE=''23514''; END IF;
  IF (p_payload->>''officeLatitude'')::numeric NOT BETWEEN -90 AND 90 OR (p_payload->>''officeLongitude'')::numeric NOT BETWEEN -180 AND 180 THEN
   RAISE EXCEPTION ''The office position must be a latitude of -90 to 90 and a longitude of -180 to 180'' USING ERRCODE=''23514''; END IF;
  IF (p_payload->>''officeRadiusM'')::integer NOT BETWEEN 20 AND 5000 THEN
   RAISE EXCEPTION ''The office radius must be 20 to 5000 metres'' USING ERRCODE=''23514''; END IF;
  IF (p_payload->>''photoRetentionDays'')::integer NOT BETWEEN 7 AND 730 THEN
   RAISE EXCEPTION ''Photos must be kept for 7 to 730 days'' USING ERRCODE=''23514''; END IF;
  UPDATE taskpulse_private.organization_settings SET
   check_in_enabled=(p_payload->>''checkInEnabled'')::boolean,
   office_latitude=round((p_payload->>''officeLatitude'')::numeric,6),office_longitude=round((p_payload->>''officeLongitude'')::numeric,6),
   office_radius_m=(p_payload->>''officeRadiusM'')::integer,photo_retention_days=(p_payload->>''photoRetentionDays'')::integer
  WHERE organization_id=org;

 ELSIF p_section=''mission_defaults'' THEN')
 ) v(sig,old_text,new_text) LOOP
  fn:=spec.sig::regprocedure; frag:=spec.old_text;
  def:=pg_catalog.pg_get_functiondef(fn);
  IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
   RAISE EXCEPTION '% no longer has exactly one "%"; update migration 72',spec.sig,frag; END IF;
  EXECUTE replace(def,frag,spec.new_text);
 END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Check-ins
-- ---------------------------------------------------------------------------
CREATE TABLE public.attendance_check_ins (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 attendance_date date NOT NULL,
 kind text NOT NULL CHECK (kind IN ('in','out')),
 captured_at timestamptz NOT NULL,
 photo_path text CHECK (length(photo_path)<=300),
 photo_removed_at timestamptz,
 latitude numeric(9,6) CHECK (latitude BETWEEN -90 AND 90),
 longitude numeric(9,6) CHECK (longitude BETWEEN -180 AND 180),
 accuracy_m numeric(8,1) CHECK (accuracy_m>=0),
 distance_m integer CHECK (distance_m>=0),
 outside_office boolean,
 attendance_record_id uuid REFERENCES public.attendance_records(id) ON DELETE SET NULL,
 operation_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE (user_id,attendance_date,kind),
 CHECK ((latitude IS NULL)=(longitude IS NULL)),
 CHECK (photo_path IS NOT NULL OR photo_removed_at IS NOT NULL)
);
CREATE INDEX attendance_check_ins_organization_idx ON public.attendance_check_ins(organization_id,attendance_date);
CREATE INDEX attendance_check_ins_photo_age_idx ON public.attendance_check_ins(captured_at) WHERE photo_path IS NOT NULL;
INSERT INTO taskpulse_private.m15_tenant_tables(table_schema,table_name) VALUES('public','attendance_check_ins') ON CONFLICT DO NOTHING;

ALTER TABLE public.attendance_check_ins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attendance_check_ins FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.attendance_check_ins TO authenticated;
CREATE POLICY attendance_check_ins_read ON public.attendance_check_ins FOR SELECT TO authenticated
 USING (organization_id=public.current_organization()
  AND (user_id=auth.uid() OR public.get_user_role() IN ('managing_director','project_engineer')));

-- 4. The on-time policy sees the check-in before the day's record exists.
DO $$
DECLARE def text; frag text:='''checkIn'',CASE WHEN a.check_in_at IS NOT NULL THEN to_char(a.check_in_at AT TIME ZONE ''Asia/Kolkata'',''HH24:MI'') END,'; BEGIN
 -- Absent only where 56/58 are applied later (the policies upgrade test); they bring their own facts.
 IF to_regprocedure('public.policy_period_facts(date,date,uuid)') IS NULL THEN RETURN; END IF;
 def:=pg_catalog.pg_get_functiondef('public.policy_period_facts(date,date,uuid)'::regprocedure);
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION 'policy_period_facts no longer has exactly one "%"; update migration 72',frag; END IF;
 EXECUTE replace(def,frag,
  '''checkIn'',to_char(coalesce(a.check_in_at,(SELECT ci.captured_at FROM public.attendance_check_ins ci
     WHERE ci.user_id=p.id AND ci.attendance_date=d.day AND ci.kind=''in'')) AT TIME ZONE ''Asia/Kolkata'',''HH24:MI''),');
END $$;

-- ---------------------------------------------------------------------------
-- The command: check in or out now
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.attendance_check_in(p_kind text,p_photo_path text,p_latitude numeric,p_longitude numeric,p_accuracy numeric,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); s taskpulse_private.organization_settings;
 now_at timestamptz:=clock_timestamp(); day date; receipt taskpulse_private.command_receipts; cmd text; request jsonb;
 prior public.attendance_check_ins; saved public.attendance_check_ins; distance numeric; hours numeric; photo_found boolean;
 saved_record jsonb; record_exists boolean:=false; result jsonb; BEGIN
 day:=(now_at AT TIME ZONE 'Asia/Kolkata')::date;
 IF actor IS NULL OR org IS NULL OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.is_active FOR SHARE) THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('in','out') OR p_operation IS NULL THEN
  RAISE EXCEPTION 'Check in or check out, with an operation id' USING ERRCODE='23514'; END IF;
 cmd:='attendance_check_'||p_kind;
 request:=jsonb_build_array(p_kind,p_photo_path,p_latitude,p_longitude,p_accuracy);
 PERFORM pg_advisory_xact_lock(hashtextextended('attendance_check:'||actor::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=cmd AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;

 SELECT * INTO s FROM taskpulse_private.organization_settings WHERE organization_id=org;
 IF s.check_in_enabled IS FALSE THEN
  RAISE EXCEPTION 'Photo check-in is switched off for your company' USING ERRCODE='42501'; END IF;
 IF p_photo_path IS NULL OR p_photo_path !~ ('^'||org::text||'/'||actor::text||'/'||to_char(day,'YYYY-MM-DD')||'/'||p_kind||'-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$') THEN
  RAISE EXCEPTION 'A photo taken today is required' USING ERRCODE='23514'; END IF;
 IF to_regclass('storage.objects') IS NOT NULL THEN
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=$1 AND name=$2)' INTO photo_found USING 'attendance-photos',p_photo_path;
  IF NOT photo_found THEN RAISE EXCEPTION 'The photo did not upload; take it again' USING ERRCODE='23514'; END IF;
 END IF;
 IF (p_latitude IS NULL)<>(p_longitude IS NULL) OR p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180
  OR p_accuracy<0 OR p_accuracy>1000000 THEN
  RAISE EXCEPTION 'The location must be a latitude, a longitude and an accuracy in metres' USING ERRCODE='23514'; END IF;

 IF EXISTS(SELECT 1 FROM public.attendance_check_ins c WHERE c.user_id=actor AND c.attendance_date=day AND c.kind=p_kind) THEN
  RAISE EXCEPTION '%',CASE p_kind WHEN 'in' THEN 'You have already checked in today' ELSE 'You have already checked out today' END USING ERRCODE='23514'; END IF;
 IF p_kind='out' THEN
  SELECT * INTO prior FROM public.attendance_check_ins c WHERE c.user_id=actor AND c.attendance_date=day AND c.kind='in';
  IF NOT FOUND THEN RAISE EXCEPTION 'Check in first; there is no check-in today' USING ERRCODE='23514'; END IF;
 END IF;

 IF p_latitude IS NOT NULL AND s.office_latitude IS NOT NULL THEN
  distance:=2*6371000*asin(least(1,sqrt(power(sin(radians(p_latitude-s.office_latitude)/2),2)
   +cos(radians(s.office_latitude))*cos(radians(p_latitude))*power(sin(radians(p_longitude-s.office_longitude)/2),2))));
 END IF;

 INSERT INTO public.attendance_check_ins(organization_id,user_id,attendance_date,kind,captured_at,photo_path,latitude,longitude,accuracy_m,distance_m,outside_office,operation_id)
 VALUES(org,actor,day,p_kind,now_at,p_photo_path,round(p_latitude,6),round(p_longitude,6),round(p_accuracy,1),round(distance)::integer,
  CASE WHEN distance IS NOT NULL THEN distance>s.office_radius_m END,p_operation)
 RETURNING * INTO saved;

 IF p_kind='out' THEN
  IF EXISTS(SELECT 1 FROM public.attendance_records a WHERE a.user_id=actor AND a.attendance_date=day) THEN
   record_exists:=true;
  ELSE
   hours:=trunc((extract(epoch FROM now_at-prior.captured_at)/3600)::numeric,2);
   saved_record:=public.dated_record_command('attendance',NULL,'save',jsonb_build_object(
    'business_date',day,'author_id',actor,'attendance_status','Present','attendance_hours',hours,'off_hours',0,
    'check_in_at',prior.captured_at,'check_out_at',now_at,'content','Photo check-in and check-out'),0,p_operation);
   UPDATE public.attendance_check_ins SET attendance_record_id=(saved_record->>'id')::uuid WHERE id IN (saved.id,prior.id);
  END IF;
 END IF;

 result:=jsonb_build_object('id',saved.id,'kind',p_kind,'date',day,'capturedAt',now_at,'distanceM',saved.distance_m,
  'outsideOffice',saved.outside_office,'attendanceRecordId',saved_record->>'id','hours',hours,'recordExists',record_exists);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,cmd,p_operation,request,saved.id,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.attendance_check_in(text,text,numeric,numeric,numeric,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.attendance_check_in(text,text,numeric,numeric,numeric,uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Retention (service role, every company unless the worker names one)
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.attendance_photos_due(p_limit integer DEFAULT 200) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'path',x.photo_path)),'[]'::jsonb) FROM (
  SELECT c.id,c.photo_path FROM public.attendance_check_ins c
  LEFT JOIN taskpulse_private.organization_settings s ON s.organization_id=c.organization_id
  WHERE c.photo_path IS NOT NULL AND c.captured_at<clock_timestamp()-make_interval(days=>coalesce(s.photo_retention_days,90))
  ORDER BY c.captured_at LIMIT least(greatest(coalesce(p_limit,200),1),1000)) x;
$$;
CREATE FUNCTION public.attendance_photos_cleared(p_ids uuid[]) RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 WITH done AS (UPDATE public.attendance_check_ins SET photo_path=NULL,photo_removed_at=clock_timestamp()
  WHERE id=ANY(p_ids) AND photo_path IS NOT NULL RETURNING 1)
 SELECT count(*)::integer FROM done;
$$;
REVOKE ALL ON FUNCTION public.attendance_photos_due(integer),public.attendance_photos_cleared(uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.attendance_photos_due(integer),public.attendance_photos_cleared(uuid[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 1. Storage bucket and its policies (Supabase only)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NULL THEN RETURN; END IF;
 INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('attendance-photos','attendance-photos',false,2097152,ARRAY['image/jpeg','image/webp'])
 ON CONFLICT (id) DO NOTHING;
 EXECUTE $p$CREATE POLICY attendance_photos_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='attendance-photos'
   AND (storage.foldername(name))[1]=public.current_organization()::text
   AND (storage.foldername(name))[2]=auth.uid()::text)$p$;
 EXECUTE $p$CREATE POLICY attendance_photos_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='attendance-photos'
   AND (storage.foldername(name))[1]=public.current_organization()::text
   AND ((storage.foldername(name))[2]=auth.uid()::text OR public.get_user_role() IN ('managing_director','project_engineer')))$p$;
 -- Only a photo no check-in points at (the save failed after the upload).
 EXECUTE $p$CREATE POLICY attendance_photos_discard ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='attendance-photos'
   AND (storage.foldername(name))[1]=public.current_organization()::text
   AND (storage.foldername(name))[2]=auth.uid()::text
   AND NOT EXISTS(SELECT 1 FROM public.attendance_check_ins c WHERE c.photo_path=objects.name))$p$;
 -- The check-in command (owned by taskpulse_definer) confirms the upload.
 EXECUTE $p$CREATE POLICY attendance_photos_definer ON storage.objects FOR SELECT TO taskpulse_definer
  USING (bucket_id='attendance-photos')$p$;
END $$;

COMMIT;
SELECT taskpulse_private.m15_secure();
