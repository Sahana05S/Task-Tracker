-- ===========================================================================
-- TaskPulse - M14 team holiday dates (forward only, after 36)
--
-- The sheet tracker's Team Index marks holidays ("H") in the daily star log.
-- TaskPulse records holidays per member as attendance status 'Holiday'; there
-- is no separate company calendar. Attendance is readable only by its owner
-- and managers, so a member cannot tell whether the whole team was on holiday.
--
-- team_holiday_dates returns the Asia/Kolkata dates in a bounded range on
-- which every active member has an active (not withdrawn) attendance record
-- with status 'Holiday'. It returns dates only, never per-person rows, and
-- changes no attendance, award or scoring rule: it is a display marker.
-- ===========================================================================

CREATE FUNCTION public.team_holiday_dates(p_from date,p_to date) RETURNS date[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result date[]; BEGIN
 IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>62 THEN RAISE EXCEPTION 'Bounded date range of at most 63 days required' USING ERRCODE='23514'; END IF;
 SELECT coalesce(array_agg(d ORDER BY d),'{}') INTO result
 FROM generate_series(p_from,p_to,interval '1 day') AS g(day), LATERAL (SELECT g.day::date AS d) x
 WHERE EXISTS(SELECT 1 FROM public.users u WHERE u.is_active)
  AND NOT EXISTS(SELECT 1 FROM public.users u WHERE u.is_active AND NOT EXISTS(
   SELECT 1 FROM public.attendance_records a WHERE a.user_id=u.id AND a.attendance_date=x.d AND a.status='Holiday' AND a.record_state='active'));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.team_holiday_dates(date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.team_holiday_dates(date,date) TO authenticated;
