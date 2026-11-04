-- ===========================================================================
-- TaskPulse - break times for the check-out report (forward only; 4 November 2026)
--
-- User decision, 4 November 2026: the check-out WhatsApp report lists the day
-- in four time blocks (check-in to morning tea, morning tea to lunch, lunch to
-- evening tea, evening tea to check-out). Break times default to morning tea
-- 11:00, lunch 13:00-14:00 and evening tea 16:00 (India time), and the managing
-- director edits them in Settings > Company > Check-in. Lunch is not counted.
--
-- 1. organization_settings gains morning_tea_at, lunch_start, lunch_end and
--    evening_tea_at (Asia/Kolkata wall times, minutes). NULL means "no such
--    break"; the report then merges the blocks on either side. Lunch start and
--    end are set together; the times must run in day order.
-- 2. company_settings() returns them under attendance as morningTeaAt,
--    lunchStart, lunchEnd and eveningTeaAt ("HH:MM" or null; the defaults for a
--    company without a settings row).
-- 3. company_settings_command('attendance', ...) accepts the four keys ("HH:MM"
--    or null); a payload without a key keeps the saved value, so older clients
--    still save the section.
--
-- Patched from the live definitions (53, 72, 93); each fragment must occur
-- exactly once. The report is composed in the app; no scoring or permission
-- change.
-- ===========================================================================
BEGIN;

CREATE FUNCTION pg_temp.m119_patch(fn regprocedure, frag text, repl text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(fn);
BEGIN
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION '% does not contain this fragment exactly once; update migration 119: %',fn,left(frag,80); END IF;
 EXECUTE replace(def,frag,repl);
END $$;

-- 1. The break times -----------------------------------------------------------
ALTER TABLE taskpulse_private.organization_settings
 ADD COLUMN morning_tea_at time(0) DEFAULT '11:00',
 ADD COLUMN lunch_start time(0) DEFAULT '13:00',
 ADD COLUMN lunch_end time(0) DEFAULT '14:00',
 ADD COLUMN evening_tea_at time(0) DEFAULT '16:00',
 ADD CONSTRAINT organization_settings_break_order CHECK (
  (lunch_start IS NULL)=(lunch_end IS NULL) AND (lunch_start IS NULL OR lunch_start<lunch_end)
  AND (morning_tea_at IS NULL OR lunch_start IS NULL OR morning_tea_at<=lunch_start)
  AND (evening_tea_at IS NULL OR lunch_end IS NULL OR lunch_end<=evening_tea_at)
  AND (morning_tea_at IS NULL OR evening_tea_at IS NULL OR morning_tea_at<evening_tea_at));

-- 2. Read --------------------------------------------------------------------------
SELECT pg_temp.m119_patch('public.company_settings()',
 $f$'checkInReminderTime',to_char(s.check_in_reminder_time,'HH24:MI')),$f$,
 $f$'checkInReminderTime',to_char(s.check_in_reminder_time,'HH24:MI'),
   -- Break times (migration 119); a company without a settings row has the defaults.
   'morningTeaAt',CASE WHEN s.organization_id IS NULL THEN '11:00' ELSE to_char(s.morning_tea_at,'HH24:MI') END,
   'lunchStart',CASE WHEN s.organization_id IS NULL THEN '13:00' ELSE to_char(s.lunch_start,'HH24:MI') END,
   'lunchEnd',CASE WHEN s.organization_id IS NULL THEN '14:00' ELSE to_char(s.lunch_end,'HH24:MI') END,
   'eveningTeaAt',CASE WHEN s.organization_id IS NULL THEN '16:00' ELSE to_char(s.evening_tea_at,'HH24:MI') END),$f$);

-- 3. Save ----------------------------------------------------------------------------
SELECT pg_temp.m119_patch('public.company_settings_command(text,jsonb,bigint,uuid)',
 $f$'autoMarkEnabled','weeklyOffDays','checkInReminderTime']<>'{}'$f$,
 $f$'autoMarkEnabled','weeklyOffDays','checkInReminderTime','morningTeaAt','lunchStart','lunchEnd','eveningTeaAt']<>'{}'
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['morningTeaAt','lunchStart','lunchEnd','eveningTeaAt']) k
    WHERE p_payload?k AND jsonb_typeof(p_payload->k)<>'null'
     AND coalesce(p_payload->>k,'') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')$f$);

SELECT pg_temp.m119_patch('public.company_settings_command(text,jsonb,bigint,uuid)',
 $f$ELSE check_in_reminder_time END$f$,
 $f$ELSE check_in_reminder_time END,
   morning_tea_at=CASE WHEN p_payload?'morningTeaAt' THEN (p_payload->>'morningTeaAt')::time(0) ELSE morning_tea_at END,
   lunch_start=CASE WHEN p_payload?'lunchStart' THEN (p_payload->>'lunchStart')::time(0) ELSE lunch_start END,
   lunch_end=CASE WHEN p_payload?'lunchEnd' THEN (p_payload->>'lunchEnd')::time(0) ELSE lunch_end END,
   evening_tea_at=CASE WHEN p_payload?'eveningTeaAt' THEN (p_payload->>'eveningTeaAt')::time(0) ELSE evening_tea_at END$f$);

COMMIT;
SELECT taskpulse_private.m15_secure();
