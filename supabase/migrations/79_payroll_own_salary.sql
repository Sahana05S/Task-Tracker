-- ===========================================================================
-- TaskPulse - M19 salary history and graphs (forward only)
--
-- User decision (DECISIONS "M19 HR", 26 October 2026): each employee may see
-- their own salary history, finalised months only, so they can follow how
-- their pay has grown; incentives stay entered by the managing director and
-- are only totalled. This relaxes the M18 rule "visible to the managing
-- director only" for exactly this read: every other payroll table and
-- function stays behind payroll_director().
--
-- taskpulse_private.payroll_history(org, user) builds one person's frozen
-- monthly records (finalised months only) and salary revisions:
--   * payroll_my_salary()             the caller's own (any active member)
--   * payroll_salary_history(user)    anyone's in the company (managing director)
-- Account number, notes and the pay profile are never included.
-- ===========================================================================
BEGIN;

CREATE FUNCTION taskpulse_private.payroll_history(p_org uuid,p_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object(
  'userId',p_user,
  'months',(SELECT coalesce(jsonb_agg(jsonb_build_object('period',l.period_start,'daysWorked',l.days_worked,
     'monthlySalary',l.monthly_salary,'calculated',round(l.calculated,2),'capped',round(l.capped,2),
     'fixedTotal',l.fixed_total,'variableTotal',l.variable_total,'incentiveTotal',l.incentive_total,
     'deductions',l.deductions,'inHand',l.in_hand_rounded,'advanceBalance',l.advance_balance,'breakdown',l.breakdown)
    ORDER BY l.period_start),'[]')
   FROM taskpulse_private.payroll_lines l
   JOIN taskpulse_private.payroll_months m
    ON m.organization_id=l.organization_id AND m.period_start=l.period_start AND m.revision=l.revision
   WHERE l.organization_id=p_org AND l.user_id=p_user AND m.state='finalized'),
  'revisions',(SELECT coalesce(jsonb_agg(jsonb_build_object('effectiveFrom',r.effective_from,'monthlySalary',r.monthly_salary)
    ORDER BY r.effective_from),'[]')
   FROM taskpulse_private.salary_revisions r
   WHERE r.organization_id=p_org AND r.user_id=p_user AND r.record_state='active'));
$$;
REVOKE ALL ON FUNCTION taskpulse_private.payroll_history(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- The caller's own finalised months (any active member of an active company).
CREATE FUNCTION public.payroll_my_salary() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.current_organization(); BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR public.get_user_role() IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 RETURN taskpulse_private.payroll_history(org,auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.payroll_my_salary() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.payroll_my_salary() TO authenticated;

-- Anyone's in the company, for the pay file's graph (managing director only).
CREATE FUNCTION public.payroll_salary_history(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=taskpulse_private.payroll_director(); BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_user AND organization_id=org) THEN
  RAISE EXCEPTION 'No such member in your company' USING ERRCODE='P0002'; END IF;
 RETURN taskpulse_private.payroll_history(org,p_user);
END $$;
REVOKE ALL ON FUNCTION public.payroll_salary_history(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.payroll_salary_history(uuid) TO authenticated;

COMMIT;
SELECT taskpulse_private.m15_secure();
