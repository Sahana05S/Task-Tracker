-- ===========================================================================
-- TaskPulse - photo check-out after midnight (forward only; audit of 31 October 2026)
--
-- A check-out looked for its check-in on the check-out's own Kolkata day, so a
-- shift that started before midnight could never check out ("Check in first")
-- and the nightly autofill left the first day at 8 h and the next day Absent.
-- The check-out now also matches yesterday's open check-in (no check-out yet,
-- under 24 hours old) and records the pair, the hours and the attendance
-- record on that day. The photo path is still today's, as the phone built it.
-- An attendance record's check times must fall on its own day (M06 rule), so
-- an overnight record carries the hours only; the exact times stay on the two
-- photo check-ins.
-- Same signature and grants.
-- ===========================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.attendance_check_in(p_kind text,p_photo_path text,p_latitude numeric,p_longitude numeric,p_accuracy numeric,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); s taskpulse_private.organization_settings;
 now_at timestamptz:=clock_timestamp(); day date; work_day date; receipt taskpulse_private.command_receipts; cmd text; request jsonb;
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

 -- The attendance day the pair belongs to: today, or yesterday for a shift
 -- that started yesterday (Asia/Kolkata) and checks out after midnight.
 work_day:=day;
 IF p_kind='out' THEN
  SELECT * INTO prior FROM public.attendance_check_ins c WHERE c.user_id=actor AND c.attendance_date=day AND c.kind='in';
  IF NOT FOUND THEN
   SELECT * INTO prior FROM public.attendance_check_ins c
    WHERE c.user_id=actor AND c.attendance_date=day-1 AND c.kind='in' AND now_at-c.captured_at<interval '24 hours'
     AND NOT EXISTS(SELECT 1 FROM public.attendance_check_ins x WHERE x.user_id=actor AND x.attendance_date=day-1 AND x.kind='out');
   IF NOT FOUND THEN RAISE EXCEPTION 'Check in first; there is no check-in today' USING ERRCODE='23514'; END IF;
   work_day:=day-1;
  END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.attendance_check_ins c WHERE c.user_id=actor AND c.attendance_date=work_day AND c.kind=p_kind) THEN
  RAISE EXCEPTION '%',CASE p_kind WHEN 'in' THEN 'You have already checked in today' ELSE 'You have already checked out today' END USING ERRCODE='23514'; END IF;

 IF p_latitude IS NOT NULL AND s.office_latitude IS NOT NULL THEN
  distance:=2*6371000*asin(least(1,sqrt(power(sin(radians(p_latitude-s.office_latitude)/2),2)
   +cos(radians(s.office_latitude))*cos(radians(p_latitude))*power(sin(radians(p_longitude-s.office_longitude)/2),2))));
 END IF;

 INSERT INTO public.attendance_check_ins(organization_id,user_id,attendance_date,kind,captured_at,photo_path,latitude,longitude,accuracy_m,distance_m,outside_office,operation_id)
 VALUES(org,actor,work_day,p_kind,now_at,p_photo_path,round(p_latitude,6),round(p_longitude,6),round(p_accuracy,1),round(distance)::integer,
  CASE WHEN distance IS NOT NULL THEN distance>s.office_radius_m END,p_operation)
 RETURNING * INTO saved;

 SELECT * INTO existing FROM public.attendance_records a WHERE a.user_id=actor AND a.attendance_date=work_day FOR UPDATE;
 has_record:=FOUND;
 IF p_kind='in' THEN
  IF has_record THEN
   record_exists:=true;
  ELSE
   -- Present for the day; check-out replaces the 8 h with the real hours.
   hours:=8;
   saved_record:=public.dated_record_command('attendance',NULL,'save',jsonb_build_object(
    'business_date',work_day,'author_id',actor,'attendance_status','Present','attendance_hours',hours,'off_hours',0,
    'content','Photo check-in; 8 h until check-out'),0,p_operation);
   UPDATE public.attendance_check_ins SET attendance_record_id=(saved_record->>'id')::uuid WHERE id=saved.id;
  END IF;
 ELSE
  hours:=trunc((extract(epoch FROM now_at-prior.captured_at)/3600)::numeric,2);
  IF NOT has_record THEN
   saved_record:=public.dated_record_command('attendance',NULL,'save',jsonb_build_object(
    'business_date',work_day,'author_id',actor,'attendance_status','Present','attendance_hours',hours,'off_hours',0,
    'check_in_at',CASE WHEN work_day=day THEN prior.captured_at END,'check_out_at',CASE WHEN work_day=day THEN now_at END,'content','Photo check-in and check-out'),0,p_operation);
  ELSIF existing.id=prior.attendance_record_id AND existing.record_version=1 AND existing.record_state='active' THEN
   -- The record the check-in created, unchanged since: the real hours replace the 8 h.
   saved_record:=public.dated_record_command('attendance',existing.id,'save',jsonb_build_object(
    'business_date',work_day,'author_id',actor,'attendance_status','Present','attendance_hours',hours,'off_hours',0,
    'check_in_at',CASE WHEN work_day=day THEN prior.captured_at END,'check_out_at',CASE WHEN work_day=day THEN now_at END,'content','Photo check-in and check-out','reason','Photo check-out'),1,p_operation);
  ELSE
   record_exists:=true; hours:=NULL;
  END IF;
  IF saved_record IS NOT NULL THEN
   UPDATE public.attendance_check_ins SET attendance_record_id=(saved_record->>'id')::uuid WHERE id IN (saved.id,prior.id);
  END IF;
 END IF;

 result:=jsonb_build_object('id',saved.id,'kind',p_kind,'date',work_day,'capturedAt',now_at,'distanceM',saved.distance_m,
  'outsideOffice',saved.outside_office,'attendanceRecordId',saved_record->>'id','hours',hours,'recordExists',record_exists);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,cmd,p_operation,request,saved.id,result);
 RETURN result;
END $$;


SELECT taskpulse_private.m15_secure();
COMMIT;
