-- ===========================================================================
-- TaskPulse - org chart: today's status from active attendance only
-- (forward only; 3 November 2026)
--
-- org_chart() (migration 65, not replaced since) reads today's attendance
-- record without checking record_state, so a withdrawn record still showed as
-- "In today", "Half day" or "Away today". It now reads only the active record;
-- a person whose only record today is withdrawn shows "Not recorded", as the
-- check-in reminder (93) and the holiday reads (37, 53) already treat it.
--
-- The rest of the function is unchanged from its live definition (65). The
-- chart's layout fix for companies with several managing directors is in the
-- app (modules/team, orgTiers); no data changes here. No scoring, award,
-- attendance or permission rule changes.
-- ===========================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.org_chart() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.current_organization(); today date:=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date; BEGIN
 IF public.get_user_role() IS NULL OR org IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('date',today,'people',(
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,'fullName',u.full_name,'employeeId',u.employee_id,'role',u.role,'active',u.is_active,
    'jobTitle',u.job_title,'departmentId',u.department_id,'department',d.name,'reportsTo',u.reports_to,
    -- Coarse on purpose: every member sees it, so no hours, notes or reasons.
    'today',CASE WHEN NOT u.is_active THEN NULL WHEN a.status IS NULL THEN 'not_recorded'
      WHEN a.status='Present' THEN 'in' WHEN a.status='Half Day' THEN 'half_day' ELSE 'away' END
   ) ORDER BY u.full_name,u.id),'[]'::jsonb)
  FROM public.users u
  LEFT JOIN taskpulse_private.departments d ON d.id=u.department_id
  LEFT JOIN public.attendance_records a ON a.user_id=u.id AND a.attendance_date=today AND a.record_state='active'
  WHERE u.organization_id=org));
END $$;
REVOKE ALL ON FUNCTION public.org_chart() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.org_chart() TO authenticated;

COMMIT;
SELECT taskpulse_private.m15_secure();
