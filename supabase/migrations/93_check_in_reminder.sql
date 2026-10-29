-- ===========================================================================
-- TaskPulse - M20 check-in reminder (forward only)
--
-- The managing director may set a daily check-in reminder time in Settings >
-- Company > Check-in (DECISIONS "M20 mobile app", 29 October 2026). NULL, the
-- default, keeps it off.
--
-- 1. organization_settings.check_in_reminder_time (Asia/Kolkata wall time);
--    company_settings() returns it as attendance.checkInReminderTime ("HH:MM"
--    or null) and the attendance section of company_settings_command saves it
--    (optional key, so an older form still saves).
-- 2. taskpulse_private.check_in_reminder_tick(), run by pg_cron every 5
--    minutes: in the 30 minutes from each company's reminder time, with photo
--    check-in on, every active member who has not checked in and has no
--    attendance record for today (Leave, Holiday or anything a manager
--    entered) gets one "Time to check in" notification, which migration 91
--    also sends to their phone. Weekly off days and company calendar holidays
--    are skipped. Managing directors are not reminded. At most one reminder
--    per person and day (dedupe key).
-- Skipped where pg_cron is not preloaded (the contract-check server).
-- ===========================================================================
BEGIN;

ALTER TABLE taskpulse_private.organization_settings ADD COLUMN check_in_reminder_time time(0);

DO $$
DECLARE def text; fn regprocedure; frag text; spec record; BEGIN
 FOR spec IN SELECT * FROM (VALUES
  ('public.company_settings()',
   '''weeklyOffDays'',to_jsonb(coalesce(s.weekly_off_days,''{0}''::smallint[]))),',
   '''weeklyOffDays'',to_jsonb(coalesce(s.weekly_off_days,''{0}''::smallint[])),
   ''checkInReminderTime'',to_char(s.check_in_reminder_time,''HH24:MI'')),'),
  ('public.company_settings_command(text,jsonb,bigint,uuid)',
   '''autoMarkEnabled'',''weeklyOffDays'']<>''{}''',
   '''autoMarkEnabled'',''weeklyOffDays'',''checkInReminderTime'']<>''{}''
   OR (p_payload?''checkInReminderTime'' AND jsonb_typeof(p_payload->''checkInReminderTime'')<>''null''
    AND coalesce(p_payload->>''checkInReminderTime'','''') !~ ''^([01][0-9]|2[0-3]):[0-5][0-9]$'')'),
  ('public.company_settings_command(text,jsonb,bigint,uuid)',
   'ELSE weekly_off_days END',
   'ELSE weekly_off_days END,
   check_in_reminder_time=CASE WHEN p_payload?''checkInReminderTime'' THEN (p_payload->>''checkInReminderTime'')::time(0)
    ELSE check_in_reminder_time END')
 ) v(sig,old_text,new_text) LOOP
  fn:=spec.sig::regprocedure; frag:=spec.old_text;
  def:=pg_catalog.pg_get_functiondef(fn);
  IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
   RAISE EXCEPTION '% no longer has exactly one "%"; update migration 93',spec.sig,frag; END IF;
  EXECUTE replace(def,frag,spec.new_text);
 END LOOP;
END $$;

CREATE FUNCTION taskpulse_private.check_in_reminder_tick() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE local_now timestamp:=clock_timestamp() AT TIME ZONE 'Asia/Kolkata'; today date; now_time time; s record;
 people uuid[]; companies integer:=0; reminded integer:=0; BEGIN
 today:=local_now::date; now_time:=local_now::time;
 FOR s IN SELECT os.organization_id AS org,os.check_in_reminder_time AS at
  FROM taskpulse_private.organization_settings os
  JOIN public.organizations o ON o.id=os.organization_id AND o.status='active'
  WHERE os.check_in_reminder_time IS NOT NULL AND os.check_in_enabled
   AND now_time-os.check_in_reminder_time>=interval '0' AND now_time-os.check_in_reminder_time<interval '30 minutes'
   AND NOT (extract(dow FROM today)::smallint=ANY(os.weekly_off_days))
   AND NOT EXISTS(SELECT 1 FROM taskpulse_private.company_holidays h WHERE h.organization_id=os.organization_id AND h.holiday_date=today)
  ORDER BY os.organization_id LOOP
  PERFORM set_config('taskpulse.organization',s.org::text,true);
  SELECT array_agg(u.id) INTO people FROM public.users u
  WHERE u.organization_id=s.org AND u.is_active AND u.role<>'managing_director'
   AND NOT EXISTS(SELECT 1 FROM public.attendance_records a WHERE a.user_id=u.id AND a.attendance_date=today AND a.record_state='active')
   AND NOT EXISTS(SELECT 1 FROM public.attendance_check_ins c WHERE c.user_id=u.id AND c.attendance_date=today AND c.kind='in');
  companies:=companies+1;
  reminded:=reminded+taskpulse_private.notify(s.org,people,'check_in_reminder','Time to check in',
   format('Open Check in and take your photo for %s.',to_char(today,'FMDD Mon')),'/attendance/check-in',
   'check_in_reminder:'||today);
 END LOOP;
 PERFORM set_config('taskpulse.organization','',true);
 RETURN jsonb_build_object('companies',companies,'reminded',reminded);
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.check_in_reminder_tick() FROM PUBLIC,anon,authenticated,service_role;

DO $do$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name='pg_cron')
    OR coalesce(current_setting('shared_preload_libraries',true),'') NOT LIKE '%pg_cron%' THEN
  RAISE NOTICE 'pg_cron is not available here; check-in reminders are not scheduled.';
  RETURN;
 END IF;
 CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
 EXECUTE format('GRANT EXECUTE ON FUNCTION taskpulse_private.check_in_reminder_tick() TO %I', current_user);
 EXECUTE $q$SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='taskpulse-check-in-reminder'$q$;
 EXECUTE $q$SELECT cron.schedule('taskpulse-check-in-reminder','*/5 * * * *','SELECT taskpulse_private.check_in_reminder_tick()')$q$;
END
$do$;

COMMIT;
SELECT taskpulse_private.m15_secure();
