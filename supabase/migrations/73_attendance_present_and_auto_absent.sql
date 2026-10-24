-- Migration 73: check-in marks the day Present; days nobody recorded are
-- marked automatically at the end of the day (user decisions, 24 October 2026:
-- "8 h until check-out", "end of day", "mark Holiday" on days off).
--
-- 1. attendance_check_in: a check-in on a day without a record now creates it
--    through dated_record_command as Present, 8 regular hours, 0 off-hours
--    (no check times yet: M06 stores them only as a pair). Check-out corrects
--    that same record to the real hours (out - in, truncated to 2 decimals)
--    and both check times, with the reason "Photo check-out"; when a manager
--    changed the record after the check-in, check-out leaves it alone. A day
--    that already had a record at check-in is never touched.
-- 2. public.attendance_autofill(p_through) (service role, called by the
--    nightly workflow before the award run): for every active company with
--    automatic marking on, every active member and every ended day from the
--    company's start date (the day this migration ran, or the company's first
--    run) up to yesterday, at most 14 days back, a day with no attendance
--    record becomes:
--      * Present - when the member checked in (8 h, or out - in with both
--        check times when they also checked out);
--      * Holiday - on a company calendar holiday (its name) or a weekly off
--        day ("Weekly off"; Sunday unless Settings say otherwise);
--      * Absent  - otherwise (0 h).
--    Rows are written like a dated-record save (version 1, input history,
--    audit, the inputs-invalidated outbox job) with no actor and the reason
--    "Marked automatically". Frozen (snapshotted) days are skipped. A day that
--    has any record, active or withdrawn, is never changed.
-- 3. organization_settings: auto_mark_enabled (default on), weekly_off_days
--    (0 = Sunday ... 6 = Saturday, default {0}) and auto_mark_from; the
--    Settings > Company > Check-in section saves the first two.

BEGIN;

ALTER TABLE taskpulse_private.organization_settings
 ADD COLUMN auto_mark_enabled boolean NOT NULL DEFAULT true,
 ADD COLUMN weekly_off_days smallint[] NOT NULL DEFAULT '{0}'
  CHECK (weekly_off_days <@ '{0,1,2,3,4,5,6}'::smallint[] AND cardinality(weekly_off_days)<=6),
 -- Existing companies start today; a company added later starts the day its row is created.
 ADD COLUMN auto_mark_from date NOT NULL DEFAULT ((clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);

-- ---------------------------------------------------------------------------
-- 3. Settings: read and save the two new options
-- ---------------------------------------------------------------------------
DO $$
DECLARE def text; fn regprocedure; frag text; spec record; BEGIN
 FOR spec IN SELECT * FROM (VALUES
  ('public.company_settings()',
   '''officeRadiusM'',coalesce(s.office_radius_m,200),''photoRetentionDays'',coalesce(s.photo_retention_days,90)),',
   '''officeRadiusM'',coalesce(s.office_radius_m,200),''photoRetentionDays'',coalesce(s.photo_retention_days,90),
   ''autoMarkEnabled'',coalesce(s.auto_mark_enabled,true),''weeklyOffDays'',to_jsonb(coalesce(s.weekly_off_days,''{0}''::smallint[]))),'),
  ('public.company_settings_command(text,jsonb,bigint,uuid)',
   'IF p_payload-ARRAY[''checkInEnabled'',''officeLatitude'',''officeLongitude'',''officeRadiusM'',''photoRetentionDays'']<>''{}''',
   'IF p_payload-ARRAY[''checkInEnabled'',''officeLatitude'',''officeLongitude'',''officeRadiusM'',''photoRetentionDays'',''autoMarkEnabled'',''weeklyOffDays'']<>''{}''
   OR (p_payload?''autoMarkEnabled'' AND jsonb_typeof(p_payload->''autoMarkEnabled'') IS DISTINCT FROM ''boolean'')
   OR (p_payload?''weeklyOffDays'' AND (jsonb_typeof(p_payload->''weeklyOffDays'') IS DISTINCT FROM ''array''
    OR jsonb_array_length(p_payload->''weeklyOffDays'')>6
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->''weeklyOffDays'') d WHERE d::text !~ ''^[0-6]$'')))'),
  ('public.company_settings_command(text,jsonb,bigint,uuid)',
   'office_radius_m=(p_payload->>''officeRadiusM'')::integer,photo_retention_days=(p_payload->>''photoRetentionDays'')::integer',
   'office_radius_m=(p_payload->>''officeRadiusM'')::integer,photo_retention_days=(p_payload->>''photoRetentionDays'')::integer,
   auto_mark_enabled=coalesce((p_payload->>''autoMarkEnabled'')::boolean,auto_mark_enabled),
   weekly_off_days=CASE WHEN p_payload?''weeklyOffDays'' THEN
    ARRAY(SELECT DISTINCT d::smallint FROM jsonb_array_elements_text(p_payload->''weeklyOffDays'') d ORDER BY 1) ELSE weekly_off_days END')
 ) v(sig,old_text,new_text) LOOP
  fn:=spec.sig::regprocedure; frag:=spec.old_text;
  def:=pg_catalog.pg_get_functiondef(fn);
  IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
   RAISE EXCEPTION '% no longer has exactly one "%"; update migration 73',spec.sig,frag; END IF;
  EXECUTE replace(def,frag,spec.new_text);
 END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Check-in marks Present; check-out corrects the same record
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attendance_check_in(p_kind text,p_photo_path text,p_latitude numeric,p_longitude numeric,p_accuracy numeric,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); s taskpulse_private.organization_settings;
 now_at timestamptz:=clock_timestamp(); day date; receipt taskpulse_private.command_receipts; cmd text; request jsonb;
 prior public.attendance_check_ins; saved public.attendance_check_ins; existing public.attendance_records;
 distance numeric; hours numeric; photo_found boolean; saved_record jsonb; record_exists boolean:=false; has_record boolean; result jsonb; BEGIN
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

 SELECT * INTO existing FROM public.attendance_records a WHERE a.user_id=actor AND a.attendance_date=day FOR UPDATE;
 has_record:=FOUND;
 IF p_kind='in' THEN
  IF has_record THEN
   record_exists:=true;
  ELSE
   -- Present for the day; check-out replaces the 8 h with the real hours.
   hours:=8;
   saved_record:=public.dated_record_command('attendance',NULL,'save',jsonb_build_object(
    'business_date',day,'author_id',actor,'attendance_status','Present','attendance_hours',hours,'off_hours',0,
    'content','Photo check-in; 8 h until check-out'),0,p_operation);
   UPDATE public.attendance_check_ins SET attendance_record_id=(saved_record->>'id')::uuid WHERE id=saved.id;
  END IF;
 ELSE
  hours:=trunc((extract(epoch FROM now_at-prior.captured_at)/3600)::numeric,2);
  IF NOT has_record THEN
   saved_record:=public.dated_record_command('attendance',NULL,'save',jsonb_build_object(
    'business_date',day,'author_id',actor,'attendance_status','Present','attendance_hours',hours,'off_hours',0,
    'check_in_at',prior.captured_at,'check_out_at',now_at,'content','Photo check-in and check-out'),0,p_operation);
  ELSIF existing.id=prior.attendance_record_id AND existing.record_version=1 AND existing.record_state='active' THEN
   -- The record the check-in created, unchanged since: the real hours replace the 8 h.
   saved_record:=public.dated_record_command('attendance',existing.id,'save',jsonb_build_object(
    'business_date',day,'author_id',actor,'attendance_status','Present','attendance_hours',hours,'off_hours',0,
    'check_in_at',prior.captured_at,'check_out_at',now_at,'content','Photo check-in and check-out','reason','Photo check-out'),1,p_operation);
  ELSE
   record_exists:=true; hours:=NULL;
  END IF;
  IF saved_record IS NOT NULL THEN
   UPDATE public.attendance_check_ins SET attendance_record_id=(saved_record->>'id')::uuid WHERE id IN (saved.id,prior.id);
  END IF;
 END IF;

 result:=jsonb_build_object('id',saved.id,'kind',p_kind,'date',day,'capturedAt',now_at,'distanceM',saved.distance_m,
  'outsideOffice',saved.outside_office,'attendanceRecordId',saved_record->>'id','hours',hours,'recordExists',record_exists);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,cmd,p_operation,request,saved.id,result);
 RETURN result;
END $$;

-- ---------------------------------------------------------------------------
-- 2. End of day: mark the days nobody recorded
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.attendance_autofill(p_through date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE yesterday date:=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date-1; through date; orgs uuid[]; org uuid; m record;
 rid uuid; body jsonb; op uuid; cols text; vals text; totals jsonb:='[]'; marked jsonb; skipped integer; last_error text; holiday text; BEGIN
 IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'The attendance worker only' USING ERRCODE='42501'; END IF;
 through:=least(coalesce(p_through,yesterday),yesterday);
 -- Fixed before the loop: setting each company's scope below changes m15_scope().
 orgs:=ARRAY(SELECT g.id FROM public.organizations g WHERE g.status='active'
  AND (taskpulse_private.m15_scope() IS NULL OR g.id=taskpulse_private.m15_scope()) ORDER BY g.id);
 FOREACH org IN ARRAY orgs LOOP
  PERFORM set_config('taskpulse.organization',org::text,true);
  INSERT INTO taskpulse_private.organization_settings(organization_id) VALUES(org) ON CONFLICT DO NOTHING;
  marked:='{"Present":0,"Holiday":0,"Absent":0}'; skipped:=0; last_error:=NULL;
  FOR m IN
   SELECT u.id AS user_id,d.day::date AS day,s.weekly_off_days,
    (SELECT ci.captured_at FROM public.attendance_check_ins ci WHERE ci.user_id=u.id AND ci.attendance_date=d.day::date AND ci.kind='in') AS check_in,
    (SELECT ci.captured_at FROM public.attendance_check_ins ci WHERE ci.user_id=u.id AND ci.attendance_date=d.day::date AND ci.kind='out') AS check_out
   FROM taskpulse_private.organization_settings s
   JOIN public.users u ON u.organization_id=s.organization_id AND u.is_active
   CROSS JOIN generate_series(greatest(s.auto_mark_from,through-13),through,interval '1 day') d(day)
   WHERE s.organization_id=org AND s.auto_mark_enabled
    AND (u.created_at AT TIME ZONE 'Asia/Kolkata')::date<=d.day::date
    AND NOT EXISTS(SELECT 1 FROM public.attendance_records a WHERE a.user_id=u.id AND a.attendance_date=d.day::date)
   ORDER BY d.day,u.id
  LOOP
   SELECT h.name INTO holiday FROM taskpulse_private.company_holidays h WHERE h.organization_id=org AND h.holiday_date=m.day;
   rid:=gen_random_uuid(); op:=gen_random_uuid();
   body:=jsonb_build_object('id',rid,'user_id',m.user_id,'attendance_date',m.day,'organization_id',org,'record_version',1,
    'off_hours',0,'recorded_by',NULL,'hours_confirmed',true,'record_state','active');
   IF m.check_in IS NOT NULL AND m.check_out IS NOT NULL THEN
    body:=body||jsonb_build_object('status','Present','attendance_hours',trunc((extract(epoch FROM m.check_out-m.check_in)/3600)::numeric,2),
     'check_in_at',m.check_in,'check_out_at',m.check_out,'notes','Photo check-in and check-out; marked automatically');
   ELSIF m.check_in IS NOT NULL THEN
    body:=body||jsonb_build_object('status','Present','attendance_hours',8,'notes','Photo check-in, no check-out; marked automatically');
   ELSIF holiday IS NOT NULL OR extract(dow FROM m.day)::smallint=ANY(m.weekly_off_days) THEN
    body:=body||jsonb_build_object('status','Holiday','attendance_hours',0,'holiday_name',coalesce(holiday,'Weekly off'),'notes','Marked automatically');
   ELSE
    body:=body||jsonb_build_object('status','Absent','attendance_hours',0,'notes','No check-in; marked automatically');
   END IF;
   BEGIN
    PERFORM taskpulse_private.assert_open_date(m.user_id,m.day);
    -- Only the listed columns, as dated_record_command writes them; the rest keep their defaults.
    SELECT string_agg(format('%I',key),','),string_agg(format('(jsonb_populate_record(NULL::public.attendance_records,$1)).%I',key),',')
     INTO cols,vals FROM jsonb_object_keys(body) key;
    EXECUTE format('INSERT INTO public.attendance_records(%s) SELECT %s',cols,vals) USING body;
    INSERT INTO taskpulse_private.input_history(organization_id,kind,record_id,record_version,actor_id,command,reason,source)
    SELECT org,'attendance',rid,1,NULL,'auto','Marked automatically',to_jsonb(a) FROM public.attendance_records a WHERE a.id=rid;
    INSERT INTO taskpulse_private.audit_events(organization_id,actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
    VALUES(org,NULL,'system','attendance_autofill','attendance_records',rid,ARRAY(SELECT jsonb_object_keys(body)),
     jsonb_build_object('version',1,'author',m.user_id,'date',m.day,'status',body->>'status','reason','Marked automatically'),op);
    INSERT INTO taskpulse_private.outbox_jobs(organization_id,kind,entity_id,entity_version,operation_id,payload)
    VALUES(org,'dated_record_inputs_invalidated',rid,1,op,jsonb_build_object('kind','attendance','author_id',m.user_id,'business_date',m.day,
     'old_author_id',NULL,'old_business_date',NULL,'observed_at',clock_timestamp(),'rule_version','m06-inputs-v1','dependencies',ARRAY['M07','M08']));
    marked:=jsonb_set(marked,ARRAY[body->>'status'],to_jsonb((marked->>(body->>'status'))::integer+1));
   EXCEPTION WHEN others THEN
    -- A frozen (snapshotted) day, or a record saved meanwhile: left for a manager.
    skipped:=skipped+1; last_error:=SQLERRM;
   END;
  END LOOP;
  totals:=totals||jsonb_build_object('organizationId',org,'marked',marked,'skipped',skipped,'lastError',last_error);
 END LOOP;
 PERFORM set_config('taskpulse.organization','',true);
 RETURN jsonb_build_object('through',through,'companies',totals);
END $$;
REVOKE ALL ON FUNCTION public.attendance_autofill(date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.attendance_autofill(date) TO service_role;

COMMIT;
SELECT taskpulse_private.m15_secure();
