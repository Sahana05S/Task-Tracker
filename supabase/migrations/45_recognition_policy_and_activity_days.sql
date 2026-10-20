-- ===========================================================================
-- TaskPulse - M16 recognition: policy singleton and activity days
-- (forward only, after 44)
--
-- The gamification layer adds no scoring rule. This migration gives it two
-- things it cannot get from existing reads:
--
--   * taskpulse_private.recognition_policy - one global row (like
--     award_policy) holding the recognition points, streak milestones and the
--     streak lookback. M15.3 moves it per company.
--   * public.recognition_activity_days - one character per Asia/Kolkata day
--     per member, classifying the day for the "active day" streak the user
--     approved on 19 October 2026:
--       c  counts: active Present/Half Day attendance and at least one
--          non-reversed task log (timer segments are log rows) or a fact, idea
--          or suggestion that is not withdrawn or rejected, dated that day
--       s  skipped: Holiday, Leave, Off Hours, or no active attendance record
--          (missing input is unavailable, never a break)
--       b  breaks: Absent, or Present/Half Day with nothing logged
--     The streak itself (current, longest, milestones) is computed once, in
--     TypeScript, from this string. Nothing is stored, so corrections to
--     attendance, logs or contributions are reflected on the next read.
--
-- Attendance detail stays private: a member receives only their own days;
-- managing directors and project engineers may read any member of their
-- company or everyone at once.
-- ===========================================================================
BEGIN;

CREATE TABLE taskpulse_private.recognition_policy (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 config jsonb NOT NULL,
 available_from timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO taskpulse_private.recognition_policy(config) VALUES(
 '{"ruleVersion":"recognition-v1","points":{"dailyStar":10,"categoryAward":25,"monthlyStar":100},"milestones":[3,7,14,30,60,100],"lookbackDays":400}'::jsonb);
REVOKE ALL ON taskpulse_private.recognition_policy FROM PUBLIC,anon,authenticated,service_role;

-- Day lookups the classification relies on. Partial on live logs only.
CREATE INDEX IF NOT EXISTS daily_task_logs_user_live_date_idx ON public.daily_task_logs(user_id,log_date) WHERE reversed_at IS NULL;
CREATE INDEX IF NOT EXISTS daily_facts_posted_by_date_idx ON public.daily_facts(posted_by,fact_date);
CREATE INDEX IF NOT EXISTS ideas_posted_by_date_idx ON public.ideas(posted_by,idea_date);
CREATE INDEX IF NOT EXISTS suggestions_posted_by_date_idx ON public.suggestions(posted_by,suggestion_date);

CREATE FUNCTION public.recognition_activity_days(p_as_of date DEFAULT NULL,p_employee uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;role text;today date;as_of date;lookback integer;from_date date;policy jsonb;members jsonb;manager boolean; BEGIN
 role:=public.get_user_role();
 IF role IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 org:=public.current_organization();
 manager:=role IN ('managing_director','project_engineer');
 IF p_employee IS NOT NULL AND p_employee<>auth.uid() AND NOT manager THEN
  RAISE EXCEPTION 'Own streak or manager authority required' USING ERRCODE='42501';
 END IF;
 IF p_employee IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_employee AND u.is_active AND u.organization_id=org) THEN
  RAISE EXCEPTION 'Active member of your company required' USING ERRCODE='42501';
 END IF;
 today:=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
 as_of:=coalesce(p_as_of,today);
 IF NOT isfinite(as_of) OR as_of>today THEN RAISE EXCEPTION 'As-of date must be today or earlier' USING ERRCODE='23514'; END IF;
 SELECT config INTO policy FROM taskpulse_private.recognition_policy WHERE id;
 lookback:=least(greatest(coalesce((policy->>'lookbackDays')::integer,400),14),1000);
 from_date:=as_of-(lookback-1);
 WITH days AS (SELECT g::date AS day FROM generate_series(from_date,as_of,interval '1 day') g),
 people AS (
  SELECT u.id FROM public.users u
  WHERE u.is_active AND u.organization_id=org
   AND (u.id=coalesce(p_employee,CASE WHEN manager THEN u.id ELSE auth.uid() END))),
 att AS (
  SELECT DISTINCT ON (a.user_id,a.attendance_date) a.user_id,a.attendance_date AS day,a.status
  FROM public.attendance_records a JOIN people p ON p.id=a.user_id
  WHERE a.record_state='active' AND a.attendance_date BETWEEN from_date AND as_of
  ORDER BY a.user_id,a.attendance_date,a.record_version DESC),
 logged AS (
  SELECT l.user_id,l.log_date AS day FROM public.daily_task_logs l JOIN people p ON p.id=l.user_id
  WHERE l.reversed_at IS NULL AND l.log_date BETWEEN from_date AND as_of
  UNION SELECT f.posted_by,f.fact_date FROM public.daily_facts f JOIN people p ON p.id=f.posted_by
  WHERE f.validation_state NOT IN ('withdrawn','rejected') AND f.fact_date BETWEEN from_date AND as_of
  UNION SELECT i.posted_by,i.idea_date FROM public.ideas i JOIN people p ON p.id=i.posted_by
  WHERE i.validation_state NOT IN ('withdrawn','rejected') AND i.idea_date BETWEEN from_date AND as_of
  UNION SELECT s.posted_by,s.suggestion_date FROM public.suggestions s JOIN people p ON p.id=s.posted_by
  WHERE s.validation_state NOT IN ('withdrawn','rejected') AND s.suggestion_date BETWEEN from_date AND as_of),
 cells AS (
  SELECT p.id AS user_id,d.day,
   CASE WHEN a.status IS NULL OR a.status IN ('Holiday','Leave','Off Hours') THEN 's'
        WHEN a.status IN ('Present','Half Day') AND l.user_id IS NOT NULL THEN 'c'
        ELSE 'b' END AS code
  FROM people p CROSS JOIN days d
  LEFT JOIN att a ON a.user_id=p.id AND a.day=d.day
  LEFT JOIN logged l ON l.user_id=p.id AND l.day=d.day)
 SELECT coalesce(jsonb_agg(jsonb_build_object('userId',m.user_id,'days',m.days) ORDER BY m.user_id),'[]'::jsonb) INTO members
 FROM (SELECT user_id,string_agg(code,'' ORDER BY day) AS days FROM cells GROUP BY user_id) m;
 RETURN jsonb_build_object('asOf',as_of,'from',from_date,'timezone','Asia/Kolkata','policy',policy,'members',members);
END $$;
REVOKE ALL ON FUNCTION public.recognition_activity_days(date,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.recognition_activity_days(date,uuid) TO authenticated;

SELECT taskpulse_private.m15_secure();
COMMIT;
