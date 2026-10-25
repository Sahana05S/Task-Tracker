-- ===========================================================================
-- TaskPulse - M18 payroll: employee pay files and monthly salary
-- (forward only; managing director only)
--
-- Replaces the workbook "3_1_c_Employee Management and Info" (Salary
-- Calculation, Employee Data, Salary History, A_Options and one EMP tab per
-- employee). User decisions (DECISIONS "M18 payroll", 25 October 2026):
--   * Header: working days in month (E1) = calendar days minus the company's
--     weekly off days; festival holidays (E2) = calendar holidays in the month
--     that fall on working days; actual working days E3 = E1 - E2.
--   * Days worked C = P + 0.75*UD + 0.5*H: P = Present with regular hours at
--     least the full-day hours (default 8), UD ("Under Hours Days") = Present
--     with fewer hours, H = Half Day. Other statuses count 0.
--   * D monthly salary = the salary revision in effect for the month;
--     E per day = D / E3; F calculated = E * (C + extra paid days, default 2);
--     G deductions = fixed + variable - incentives (EMP!B6 = B4 + G4 - N4);
--     H non-capped = F - G; I capped = MIN(F, D); J in hand = I - G, rounded
--     to the nearest rupee when the month is finalised.
--   * Advance balance = advances taken - every "Advance" deduction recovered
--     so far (no hand-typed "Advance Paid").
--   * Salary data is visible to the managing director only: every table is
--     private and every function checks the role. Audit rows carry no amounts
--     and payroll tables are not in the activity feed.
-- payroll_compute is the one calculation; modules/payroll/client.ts mirrors it
-- for instant previews only.
-- ===========================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE taskpulse_private.payroll_settings (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE RESTRICT,
 extra_paid_days numeric(4,2) NOT NULL DEFAULT 2 CHECK (extra_paid_days BETWEEN 0 AND 31),
 full_day_hours numeric(4,2) NOT NULL DEFAULT 8 CHECK (full_day_hours>0 AND full_day_hours<=24),
 ud_weight numeric(3,2) NOT NULL DEFAULT 0.75 CHECK (ud_weight=0.75),
 half_day_weight numeric(3,2) NOT NULL DEFAULT 0.5 CHECK (half_day_weight=0.5),
 version bigint NOT NULL DEFAULT 0 CHECK (version>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES public.users(id)
);

-- One row per employee once anything is saved for them; its version guards
-- every write to that employee's pay file.
CREATE TABLE taskpulse_private.employee_pay_profiles (
 user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 joining_date date CHECK (joining_date IS NULL OR isfinite(joining_date)),
 account_number text CHECK (account_number IS NULL OR account_number ~ '^[A-Za-z0-9 -]{4,34}$'),
 payment_mode text CHECK (payment_mode IS NULL OR payment_mode IN ('bank_transfer','cash','upi','cheque')),
 employment_status text NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active','on_notice','left','not_on_payroll')),
 salary_handler_id uuid REFERENCES public.users(id),
 notes text NOT NULL DEFAULT '' CHECK (length(notes)<=1000),
 version bigint NOT NULL DEFAULT 0 CHECK (version>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES public.users(id)
);
CREATE INDEX employee_pay_profiles_company_idx ON taskpulse_private.employee_pay_profiles(organization_id);

CREATE TABLE taskpulse_private.salary_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 effective_from date NOT NULL CHECK (isfinite(effective_from) AND effective_from=date_trunc('month',effective_from)::date),
 monthly_salary numeric(12,2) NOT NULL CHECK (monthly_salary>=0),
 note text NOT NULL DEFAULT '' CHECK (length(note)<=200),
 record_state text NOT NULL DEFAULT 'active' CHECK (record_state IN ('active','withdrawn')),
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.users(id)
);
CREATE UNIQUE INDEX salary_revisions_one_per_month ON taskpulse_private.salary_revisions(user_id,effective_from) WHERE record_state='active';
CREATE INDEX salary_revisions_company_idx ON taskpulse_private.salary_revisions(organization_id,user_id,effective_from);

CREATE TABLE taskpulse_private.pay_components (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK (kind IN ('fixed_deduction','variable_deduction','incentive')),
 name text NOT NULL CHECK (name=btrim(name) AND length(name) BETWEEN 1 AND 60),
 -- Amounts under this component repay salary advances (the sheet's "Advance").
 is_advance_recovery boolean NOT NULL DEFAULT false CHECK (NOT is_advance_recovery OR kind='variable_deduction'),
 active boolean NOT NULL DEFAULT true,
 sort integer NOT NULL DEFAULT 0 CHECK (sort BETWEEN 0 AND 999)
);
CREATE UNIQUE INDEX pay_components_name_per_kind ON taskpulse_private.pay_components(organization_id,kind,lower(name));

-- Recurring monthly deductions (the EMP tab's B9:B28): from one month until
-- an optional last month, both first-of-month.
CREATE TABLE taskpulse_private.fixed_deductions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 component_id uuid NOT NULL REFERENCES taskpulse_private.pay_components(id) ON DELETE RESTRICT,
 monthly_amount numeric(12,2) NOT NULL CHECK (monthly_amount>0),
 effective_from date NOT NULL CHECK (isfinite(effective_from) AND effective_from=date_trunc('month',effective_from)::date),
 effective_until date CHECK (effective_until IS NULL OR (isfinite(effective_until) AND effective_until=date_trunc('month',effective_until)::date)),
 record_state text NOT NULL DEFAULT 'active' CHECK (record_state IN ('active','withdrawn')),
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.users(id),
 CHECK (effective_until IS NULL OR effective_until>=effective_from)
);
CREATE INDEX fixed_deductions_user_idx ON taskpulse_private.fixed_deductions(organization_id,user_id);

-- Monthly variable deductions and incentives (the EMP tab's D:G and M:P).
CREATE TABLE taskpulse_private.pay_adjustments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 period_start date NOT NULL CHECK (isfinite(period_start) AND period_start=date_trunc('month',period_start)::date),
 component_id uuid NOT NULL REFERENCES taskpulse_private.pay_components(id) ON DELETE RESTRICT,
 amount numeric(12,2) NOT NULL CHECK (amount>0),
 note text NOT NULL DEFAULT '' CHECK (length(note)<=200),
 record_state text NOT NULL DEFAULT 'active' CHECK (record_state IN ('active','withdrawn')),
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.users(id)
);
CREATE INDEX pay_adjustments_period_idx ON taskpulse_private.pay_adjustments(organization_id,period_start,user_id);
CREATE INDEX pay_adjustments_component_idx ON taskpulse_private.pay_adjustments(component_id);

-- Advances paid to an employee (the EMP tab's I:K).
CREATE TABLE taskpulse_private.salary_advances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 paid_on date NOT NULL CHECK (isfinite(paid_on)),
 reason text NOT NULL CHECK (reason=btrim(reason) AND length(reason) BETWEEN 1 AND 200),
 amount numeric(12,2) NOT NULL CHECK (amount>0),
 record_state text NOT NULL DEFAULT 'active' CHECK (record_state IN ('active','withdrawn')),
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.users(id)
);
CREATE INDEX salary_advances_user_idx ON taskpulse_private.salary_advances(organization_id,user_id,paid_on);

CREATE TABLE taskpulse_private.payroll_months (
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 period_start date NOT NULL CHECK (isfinite(period_start) AND period_start=date_trunc('month',period_start)::date),
 state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','finalized')),
 -- Number of the latest finalised set of lines; 0 = never finalised.
 revision integer NOT NULL DEFAULT 0 CHECK (revision>=0),
 version bigint NOT NULL DEFAULT 0 CHECK (version>=0),
 working_days_in_month integer,
 festival_holidays integer,
 actual_working_days integer,
 extra_paid_days numeric(4,2),
 full_day_hours numeric(4,2),
 finalized_at timestamptz,
 finalized_by uuid REFERENCES public.users(id),
 reopened_at timestamptz,
 reopened_by uuid REFERENCES public.users(id),
 reopen_reason text CHECK (reopen_reason IS NULL OR length(reopen_reason) BETWEEN 1 AND 500),
 PRIMARY KEY (organization_id,period_start),
 CHECK (state='draft' OR (revision>0 AND finalized_at IS NOT NULL))
);

-- The frozen salary record of each employee for each finalised revision.
CREATE TABLE taskpulse_private.payroll_lines (
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 period_start date NOT NULL,
 revision integer NOT NULL CHECK (revision>0),
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 employee_id text,
 full_name text NOT NULL,
 hours_worked numeric NOT NULL,
 off_hours numeric NOT NULL,
 present_days integer NOT NULL,
 ud_days integer NOT NULL,
 half_days integer NOT NULL,
 days_worked numeric NOT NULL,
 monthly_salary numeric(12,2) NOT NULL,
 per_day numeric NOT NULL,
 calculated numeric NOT NULL,
 fixed_total numeric(12,2) NOT NULL,
 variable_total numeric(12,2) NOT NULL,
 incentive_total numeric(12,2) NOT NULL,
 deductions numeric(12,2) NOT NULL,
 non_capped numeric NOT NULL,
 capped numeric NOT NULL,
 in_hand numeric NOT NULL,
 in_hand_rounded numeric(12,0) NOT NULL,
 advances_taken numeric(12,2) NOT NULL,
 advances_recovered numeric(12,2) NOT NULL,
 advance_balance numeric(12,2) NOT NULL,
 breakdown jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(breakdown)='object'),
 PRIMARY KEY (organization_id,period_start,revision,user_id),
 FOREIGN KEY (organization_id,period_start) REFERENCES taskpulse_private.payroll_months(organization_id,period_start) ON DELETE RESTRICT
);
CREATE INDEX payroll_lines_user_idx ON taskpulse_private.payroll_lines(user_id,period_start);

REVOKE ALL ON taskpulse_private.payroll_settings,taskpulse_private.employee_pay_profiles,taskpulse_private.salary_revisions,
 taskpulse_private.pay_components,taskpulse_private.fixed_deductions,taskpulse_private.pay_adjustments,
 taskpulse_private.salary_advances,taskpulse_private.payroll_months,taskpulse_private.payroll_lines
 FROM PUBLIC,anon,authenticated,service_role;

INSERT INTO taskpulse_private.m15_tenant_tables(table_schema,table_name) VALUES
 ('taskpulse_private','payroll_settings'),('taskpulse_private','employee_pay_profiles'),('taskpulse_private','salary_revisions'),
 ('taskpulse_private','pay_components'),('taskpulse_private','fixed_deductions'),('taskpulse_private','pay_adjustments'),
 ('taskpulse_private','salary_advances'),('taskpulse_private','payroll_months'),('taskpulse_private','payroll_lines')
ON CONFLICT DO NOTHING;
INSERT INTO taskpulse_private.m15_org_refs(table_schema,table_name,column_name,ref_schema,ref_table) VALUES
 ('taskpulse_private','payroll_settings','updated_by','public','users'),
 ('taskpulse_private','employee_pay_profiles','user_id','public','users'),
 ('taskpulse_private','employee_pay_profiles','salary_handler_id','public','users'),
 ('taskpulse_private','employee_pay_profiles','updated_by','public','users'),
 ('taskpulse_private','salary_revisions','user_id','public','users'),
 ('taskpulse_private','fixed_deductions','user_id','public','users'),
 ('taskpulse_private','pay_adjustments','user_id','public','users'),
 ('taskpulse_private','salary_advances','user_id','public','users'),
 ('taskpulse_private','payroll_months','finalized_by','public','users'),
 ('taskpulse_private','payroll_lines','user_id','public','users')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Defaults: the workbook's A_Options lists and the EMP tab's fixed rows
-- ---------------------------------------------------------------------------
CREATE FUNCTION taskpulse_private.payroll_seed_components(p_org uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 INSERT INTO taskpulse_private.pay_components(organization_id,kind,name,is_advance_recovery,sort)
 SELECT p_org,v.kind,v.name,v.recovery,v.sort FROM (VALUES
  ('fixed_deduction','Recurring Deposit',false,0),('fixed_deduction','Provident Fund',false,1),
  ('fixed_deduction','Professional Tax',false,2),('fixed_deduction','TDS',false,3),('fixed_deduction','Mobile Bill',false,4),
  ('variable_deduction','Mobile Bill',false,0),('variable_deduction','Late Login Deduction',false,1),
  ('variable_deduction','Advance',true,2),('variable_deduction','Inadequate Performance',false,3),
  ('variable_deduction','Rent',false,4),('variable_deduction','Fuel Expenses',false,5),
  ('incentive','Star Performer',false,0),('incentive','Bonus',false,1),('incentive','Incentive',false,2),('incentive','Fuel Allowance',false,3)
 ) v(kind,name,recovery,sort)
 WHERE NOT EXISTS(SELECT 1 FROM taskpulse_private.pay_components c WHERE c.organization_id=p_org)
$$;
REVOKE ALL ON FUNCTION taskpulse_private.payroll_seed_components(uuid) FROM PUBLIC,anon,authenticated,service_role;

DO $$ DECLARE o uuid; BEGIN
 FOR o IN SELECT id FROM public.organizations LOOP PERFORM taskpulse_private.payroll_seed_components(o); END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- The calculation
-- ---------------------------------------------------------------------------
-- The caller's company only (or a system context); every payroll function starts here.
CREATE FUNCTION taskpulse_private.payroll_director() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.current_organization(); BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR public.get_user_role() IS DISTINCT FROM 'managing_director' THEN
  RAISE EXCEPTION 'Only an active managing director can see or change payroll' USING ERRCODE='42501'; END IF;
 RETURN org;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.payroll_director() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION taskpulse_private.payroll_header(p_org uuid,p_period date)
RETURNS TABLE(working_days_in_month integer,festival_holidays integer,actual_working_days integer,extra_paid_days numeric,full_day_hours numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH cfg AS (
  SELECT coalesce((SELECT o.weekly_off_days FROM taskpulse_private.organization_settings o WHERE o.organization_id=p_org),'{0}'::smallint[]) AS offs,
   coalesce((SELECT s.extra_paid_days FROM taskpulse_private.payroll_settings s WHERE s.organization_id=p_org),2::numeric) AS extra,
   coalesce((SELECT s.full_day_hours FROM taskpulse_private.payroll_settings s WHERE s.organization_id=p_org),8::numeric) AS full_day
 ), days AS (
  SELECT g.d::date AS d FROM generate_series(p_period::timestamp,(p_period+interval '1 month'-interval '1 day')::timestamp,interval '1 day') g(d)
 ), working AS (
  SELECT d.d FROM days d, cfg WHERE NOT extract(dow FROM d.d)::smallint=ANY(cfg.offs)
 )
 SELECT (SELECT count(*) FROM working)::integer,
  (SELECT count(*) FROM working w JOIN taskpulse_private.company_holidays h ON h.organization_id=p_org AND h.holiday_date=w.d)::integer,
  (SELECT count(*) FROM working w WHERE NOT EXISTS(SELECT 1 FROM taskpulse_private.company_holidays h WHERE h.organization_id=p_org AND h.holiday_date=w.d))::integer,
  cfg.extra,cfg.full_day
 FROM cfg
$$;
REVOKE ALL ON FUNCTION taskpulse_private.payroll_header(uuid,date) FROM PUBLIC,anon,authenticated,service_role;

-- One row per employee on the month's payroll. Unknown inputs stay NULL (a
-- missing salary is never shown as a zero salary).
CREATE FUNCTION taskpulse_private.payroll_compute(p_org uuid,p_period date)
RETURNS TABLE(user_id uuid,employee_id text,full_name text,employment_status text,hours_worked numeric,off_hours numeric,
 present_days integer,ud_days integer,half_days integer,days_worked numeric,monthly_salary numeric,per_day numeric,calculated numeric,
 fixed_total numeric,variable_total numeric,incentive_total numeric,deductions numeric,non_capped numeric,capped numeric,
 in_hand numeric,in_hand_rounded numeric,advances_taken numeric,advances_recovered numeric,advance_balance numeric,breakdown jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE scope uuid:=taskpulse_private.m15_scope(); month_end date; BEGIN
 IF p_org IS NULL OR (scope IS NOT NULL AND p_org<>scope) THEN
  RAISE EXCEPTION 'Payroll is computed for the caller''s company only' USING ERRCODE='42501'; END IF;
 IF p_period IS NULL OR NOT isfinite(p_period) OR p_period<>date_trunc('month',p_period)::date THEN
  RAISE EXCEPTION 'A first-of-month period is required' USING ERRCODE='23514'; END IF;
 month_end:=(p_period+interval '1 month'-interval '1 day')::date;
 RETURN QUERY
 WITH h AS (SELECT * FROM taskpulse_private.payroll_header(p_org,p_period)),
 att AS (
  SELECT a.user_id,
   sum(a.attendance_hours) AS hours, sum(a.off_hours) AS offh,
   count(*) FILTER (WHERE a.status='Present' AND a.attendance_hours>=(SELECT h.full_day_hours FROM h))::integer AS p,
   count(*) FILTER (WHERE a.status='Present' AND a.attendance_hours<(SELECT h.full_day_hours FROM h))::integer AS ud,
   count(*) FILTER (WHERE a.status='Half Day')::integer AS hd
  FROM public.attendance_records a
  WHERE a.organization_id=p_org AND a.record_state='active' AND a.attendance_date BETWEEN p_period AND month_end
  GROUP BY a.user_id
 ),
 roster AS (
  SELECT u.id,u.employee_id::text AS emp_code,u.full_name::text AS name,coalesce(pp.employment_status,'active') AS status
  FROM public.users u
  LEFT JOIN taskpulse_private.employee_pay_profiles pp ON pp.user_id=u.id
  WHERE u.organization_id=p_org
   AND coalesce(pp.employment_status,'active')<>'not_on_payroll'
   AND (EXISTS(SELECT 1 FROM att WHERE att.user_id=u.id)
    OR (u.is_active AND coalesce(pp.employment_status,'active')<>'left'))
 ),
 sal AS (
  SELECT DISTINCT ON (r.user_id) r.user_id,r.monthly_salary
  FROM taskpulse_private.salary_revisions r
  WHERE r.organization_id=p_org AND r.record_state='active' AND r.effective_from<=p_period
  ORDER BY r.user_id,r.effective_from DESC
 ),
 items AS (
  SELECT f.user_id,c.kind,c.name,f.monthly_amount AS amount,c.sort
  FROM taskpulse_private.fixed_deductions f JOIN taskpulse_private.pay_components c ON c.id=f.component_id
  WHERE f.organization_id=p_org AND f.record_state='active' AND f.effective_from<=p_period
   AND (f.effective_until IS NULL OR f.effective_until>=p_period)
  UNION ALL
  SELECT j.user_id,c.kind,c.name,j.amount,c.sort
  FROM taskpulse_private.pay_adjustments j JOIN taskpulse_private.pay_components c ON c.id=j.component_id
  WHERE j.organization_id=p_org AND j.record_state='active' AND j.period_start=p_period
 ),
 sums AS (
  SELECT i.user_id,
   coalesce(sum(i.amount) FILTER (WHERE i.kind='fixed_deduction'),0) AS fixed_t,
   coalesce(sum(i.amount) FILTER (WHERE i.kind='variable_deduction'),0) AS variable_t,
   coalesce(sum(i.amount) FILTER (WHERE i.kind='incentive'),0) AS incentive_t,
   jsonb_build_object(
    'fixed',coalesce(jsonb_agg(jsonb_build_object('name',i.name,'amount',i.amount) ORDER BY i.sort,i.name) FILTER (WHERE i.kind='fixed_deduction'),'[]'),
    'variable',coalesce(jsonb_agg(jsonb_build_object('name',i.name,'amount',i.amount) ORDER BY i.sort,i.name) FILTER (WHERE i.kind='variable_deduction'),'[]'),
    'incentives',coalesce(jsonb_agg(jsonb_build_object('name',i.name,'amount',i.amount) ORDER BY i.sort,i.name) FILTER (WHERE i.kind='incentive'),'[]')) AS detail
  FROM items i GROUP BY i.user_id
 ),
 adv AS (
  SELECT r.id AS user_id,
   coalesce((SELECT sum(s.amount) FROM taskpulse_private.salary_advances s
    WHERE s.organization_id=p_org AND s.user_id=r.id AND s.record_state='active' AND s.paid_on<=month_end),0) AS taken,
   coalesce((SELECT sum(j.amount) FROM taskpulse_private.pay_adjustments j JOIN taskpulse_private.pay_components c ON c.id=j.component_id
    WHERE j.organization_id=p_org AND j.user_id=r.id AND j.record_state='active' AND c.is_advance_recovery AND j.period_start<=p_period),0) AS recovered
  FROM roster r
 ),
 base AS (
  SELECT r.id,r.emp_code,r.name,r.status,
   coalesce(att.hours,0) AS hours,coalesce(att.offh,0) AS offh,
   coalesce(att.p,0) AS p,coalesce(att.ud,0) AS ud,coalesce(att.hd,0) AS hd,
   coalesce(att.p,0)+0.75*coalesce(att.ud,0)+0.5*coalesce(att.hd,0) AS days,
   sal.monthly_salary AS d,
   coalesce(sums.fixed_t,0) AS fixed_t,coalesce(sums.variable_t,0) AS variable_t,coalesce(sums.incentive_t,0) AS incentive_t,
   coalesce(sums.fixed_t,0)+coalesce(sums.variable_t,0)-coalesce(sums.incentive_t,0) AS g,
   coalesce(sums.detail,jsonb_build_object('fixed','[]'::jsonb,'variable','[]'::jsonb,'incentives','[]'::jsonb)) AS detail,
   adv.taken,adv.recovered
  FROM roster r
  LEFT JOIN att ON att.user_id=r.id
  LEFT JOIN sal ON sal.user_id=r.id
  LEFT JOIN sums ON sums.user_id=r.id
  JOIN adv ON adv.user_id=r.id
 ),
 step_e AS (
  SELECT b.*,
   CASE WHEN b.d IS NOT NULL AND (SELECT h.actual_working_days FROM h)>0 THEN b.d/(SELECT h.actual_working_days FROM h) END AS e
  FROM base b
 ),
 step_f AS (SELECT pd.*,pd.e*(pd.days+(SELECT h.extra_paid_days FROM h)) AS f FROM step_e pd),
 -- CASE, not LEAST alone: LEAST skips NULLs and would show D as the capped salary.
 step_i AS (SELECT cd.*,CASE WHEN cd.f IS NOT NULL THEN least(cd.f,cd.d) END AS i FROM step_f cd)
 SELECT x.id,x.emp_code,x.name,x.status,x.hours,x.offh,x.p,x.ud,x.hd,x.days,x.d,x.e,x.f,
  x.fixed_t,x.variable_t,x.incentive_t,x.g,
  x.f-x.g,
  x.i,
  x.i-x.g,
  round(x.i-x.g),
  x.taken,x.recovered,x.taken-x.recovered,x.detail
 FROM step_i x
 ORDER BY lower(x.name),x.id;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.payroll_compute(uuid,date) FROM PUBLIC,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Reads (managing director)
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.payroll_month(p_period date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=taskpulse_private.payroll_director(); m taskpulse_private.payroll_months; hdr record; lines jsonb; period date; BEGIN
 IF p_period IS NULL OR NOT isfinite(p_period) THEN RAISE EXCEPTION 'A month is required' USING ERRCODE='23514'; END IF;
 period:=date_trunc('month',p_period)::date;
 SELECT * INTO m FROM taskpulse_private.payroll_months WHERE organization_id=org AND period_start=period;
 IF m.state='finalized' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('userId',l.user_id,'employeeId',l.employee_id,'fullName',l.full_name,'employmentStatus',NULL,
    'hoursWorked',l.hours_worked,'offHours',l.off_hours,'presentDays',l.present_days,'udDays',l.ud_days,'halfDays',l.half_days,
    'daysWorked',l.days_worked,'monthlySalary',l.monthly_salary,'perDay',l.per_day,'calculated',l.calculated,
    'fixedTotal',l.fixed_total,'variableTotal',l.variable_total,'incentiveTotal',l.incentive_total,'deductions',l.deductions,
    'nonCapped',l.non_capped,'capped',l.capped,'inHand',l.in_hand,'inHandRounded',l.in_hand_rounded,
    'advancesTaken',l.advances_taken,'advancesRecovered',l.advances_recovered,'advanceBalance',l.advance_balance,'breakdown',l.breakdown)
   ORDER BY lower(l.full_name),l.user_id),'[]') INTO lines
  FROM taskpulse_private.payroll_lines l WHERE l.organization_id=org AND l.period_start=period AND l.revision=m.revision;
  RETURN jsonb_build_object('period',period,'state','finalized','revision',m.revision,'version',m.version,
   'header',jsonb_build_object('workingDaysInMonth',m.working_days_in_month,'festivalHolidays',m.festival_holidays,
    'actualWorkingDays',m.actual_working_days,'extraPaidDays',m.extra_paid_days,'fullDayHours',m.full_day_hours),
   'finalizedAt',m.finalized_at,'finalizedBy',m.finalized_by,'reopenReason',m.reopen_reason,'lines',lines);
 END IF;
 SELECT * INTO hdr FROM taskpulse_private.payroll_header(org,period);
 SELECT coalesce(jsonb_agg(jsonb_build_object('userId',c.user_id,'employeeId',c.employee_id,'fullName',c.full_name,'employmentStatus',c.employment_status,
   'hoursWorked',c.hours_worked,'offHours',c.off_hours,'presentDays',c.present_days,'udDays',c.ud_days,'halfDays',c.half_days,
   'daysWorked',c.days_worked,'monthlySalary',c.monthly_salary,'perDay',c.per_day,'calculated',c.calculated,
   'fixedTotal',c.fixed_total,'variableTotal',c.variable_total,'incentiveTotal',c.incentive_total,'deductions',c.deductions,
   'nonCapped',c.non_capped,'capped',c.capped,'inHand',c.in_hand,'inHandRounded',c.in_hand_rounded,
   'advancesTaken',c.advances_taken,'advancesRecovered',c.advances_recovered,'advanceBalance',c.advance_balance,'breakdown',c.breakdown)),'[]') INTO lines
 FROM taskpulse_private.payroll_compute(org,period) c;
 RETURN jsonb_build_object('period',period,'state','draft','revision',coalesce(m.revision,0),'version',coalesce(m.version,0),
  'header',jsonb_build_object('workingDaysInMonth',hdr.working_days_in_month,'festivalHolidays',hdr.festival_holidays,
   'actualWorkingDays',hdr.actual_working_days,'extraPaidDays',hdr.extra_paid_days,'fullDayHours',hdr.full_day_hours),
  'finalizedAt',m.finalized_at,'finalizedBy',m.finalized_by,'reopenReason',m.reopen_reason,'lines',lines);
END $$;
REVOKE ALL ON FUNCTION public.payroll_month(date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.payroll_month(date) TO authenticated;

-- Settings, components, every member with their pay profile and current
-- salary, and the finalised months.
CREATE FUNCTION public.payroll_setup() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=taskpulse_private.payroll_director(); s taskpulse_private.payroll_settings;
 today date:=date_trunc('month',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date)::date; BEGIN
 SELECT * INTO s FROM taskpulse_private.payroll_settings WHERE organization_id=org;
 RETURN jsonb_build_object(
  'settings',jsonb_build_object('version',coalesce(s.version,0),'extraPaidDays',coalesce(s.extra_paid_days,2),'fullDayHours',coalesce(s.full_day_hours,8)),
  'components',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'kind',c.kind,'name',c.name,'isAdvanceRecovery',c.is_advance_recovery,
    'active',c.active,'sort',c.sort) ORDER BY c.kind,c.sort,c.name),'[]') FROM taskpulse_private.pay_components c WHERE c.organization_id=org),
  'employees',(SELECT coalesce(jsonb_agg(jsonb_build_object('userId',u.id,'employeeId',u.employee_id,'fullName',u.full_name,'isActive',u.is_active,
    'jobTitle',u.job_title,'department',d.name,'reportsTo',sup.full_name,
    'employmentStatus',coalesce(p.employment_status,'active'),'joiningDate',p.joining_date,'paymentMode',p.payment_mode,
    'hasAccountNumber',p.account_number IS NOT NULL,'version',coalesce(p.version,0),
    'currentSalary',(SELECT r.monthly_salary FROM taskpulse_private.salary_revisions r WHERE r.user_id=u.id AND r.record_state='active'
      AND r.effective_from<=today ORDER BY r.effective_from DESC LIMIT 1),
    'nextSalary',(SELECT jsonb_build_object('effectiveFrom',r.effective_from,'monthlySalary',r.monthly_salary) FROM taskpulse_private.salary_revisions r
      WHERE r.user_id=u.id AND r.record_state='active' AND r.effective_from>today ORDER BY r.effective_from LIMIT 1))
   ORDER BY NOT u.is_active,lower(u.full_name)),'[]')
   FROM public.users u
   LEFT JOIN taskpulse_private.employee_pay_profiles p ON p.user_id=u.id
   LEFT JOIN taskpulse_private.departments d ON d.id=u.department_id
   LEFT JOIN public.users sup ON sup.id=u.reports_to
   WHERE u.organization_id=org),
  'months',(SELECT coalesce(jsonb_agg(jsonb_build_object('period',m.period_start,'state',m.state,'revision',m.revision,'finalizedAt',m.finalized_at,
    'employees',(SELECT count(*) FROM taskpulse_private.payroll_lines l WHERE l.organization_id=org AND l.period_start=m.period_start AND l.revision=m.revision),
    'totalInHand',(SELECT sum(l.in_hand_rounded) FROM taskpulse_private.payroll_lines l WHERE l.organization_id=org AND l.period_start=m.period_start AND l.revision=m.revision))
   ORDER BY m.period_start DESC),'[]') FROM taskpulse_private.payroll_months m WHERE m.organization_id=org AND m.revision>0));
END $$;
REVOKE ALL ON FUNCTION public.payroll_setup() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.payroll_setup() TO authenticated;

-- One employee's pay file (the EMP tab) with the month's totals.
CREATE FUNCTION public.payroll_employee_file(p_user uuid,p_period date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=taskpulse_private.payroll_director(); u public.users; p taskpulse_private.employee_pay_profiles; period date; line jsonb; BEGIN
 IF p_period IS NULL OR NOT isfinite(p_period) THEN RAISE EXCEPTION 'A month is required' USING ERRCODE='23514'; END IF;
 period:=date_trunc('month',p_period)::date;
 SELECT * INTO u FROM public.users WHERE id=p_user AND organization_id=org;
 IF NOT FOUND THEN RAISE EXCEPTION 'No such member in your company' USING ERRCODE='P0002'; END IF;
 SELECT * INTO p FROM taskpulse_private.employee_pay_profiles WHERE user_id=p_user;
 -- The month's line as Salary Calculation shows it (frozen once finalised); NULL when not on that payroll.
 SELECT l INTO line FROM jsonb_array_elements(public.payroll_month(period)->'lines') l WHERE l->>'userId'=p_user::text;
 RETURN jsonb_build_object(
  'userId',u.id,'employeeId',u.employee_id,'fullName',u.full_name,'isActive',u.is_active,'jobTitle',u.job_title,
  'period',period,'version',coalesce(p.version,0),
  'profile',jsonb_build_object('joiningDate',p.joining_date,'accountNumber',p.account_number,'paymentMode',p.payment_mode,
   'employmentStatus',coalesce(p.employment_status,'active'),'salaryHandlerId',p.salary_handler_id,'notes',coalesce(p.notes,'')),
  'revisions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'effectiveFrom',r.effective_from,'monthlySalary',r.monthly_salary,'note',r.note)
    ORDER BY r.effective_from DESC),'[]') FROM taskpulse_private.salary_revisions r WHERE r.user_id=p_user AND r.record_state='active'),
  'fixedDeductions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'componentId',f.component_id,'component',c.name,'monthlyAmount',f.monthly_amount,
    'effectiveFrom',f.effective_from,'effectiveUntil',f.effective_until) ORDER BY c.sort,c.name,f.effective_from),'[]')
   FROM taskpulse_private.fixed_deductions f JOIN taskpulse_private.pay_components c ON c.id=f.component_id
   WHERE f.user_id=p_user AND f.record_state='active'),
  'adjustments',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',j.id,'period',j.period_start,'componentId',j.component_id,'component',c.name,
    'kind',c.kind,'isAdvanceRecovery',c.is_advance_recovery,'amount',j.amount,'note',j.note) ORDER BY j.period_start DESC,j.created_at DESC),'[]')
   FROM taskpulse_private.pay_adjustments j JOIN taskpulse_private.pay_components c ON c.id=j.component_id
   WHERE j.user_id=p_user AND j.record_state='active'),
  'advances',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'paidOn',a.paid_on,'reason',a.reason,'amount',a.amount) ORDER BY a.paid_on DESC,a.created_at DESC),'[]')
   FROM taskpulse_private.salary_advances a WHERE a.user_id=p_user AND a.record_state='active'),
  'records',(SELECT coalesce(jsonb_agg(jsonb_build_object('period',l.period_start,'revision',l.revision,'daysWorked',l.days_worked,
    'monthlySalary',l.monthly_salary,'deductions',l.deductions,'inHandRounded',l.in_hand_rounded) ORDER BY l.period_start DESC),'[]')
   FROM taskpulse_private.payroll_lines l JOIN taskpulse_private.payroll_months m ON m.organization_id=l.organization_id AND m.period_start=l.period_start AND m.revision=l.revision
   WHERE l.user_id=p_user),
  'line',line);
END $$;
REVOKE ALL ON FUNCTION public.payroll_employee_file(uuid,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.payroll_employee_file(uuid,date) TO authenticated;

-- ---------------------------------------------------------------------------
-- Command (managing director, one section per call)
-- ---------------------------------------------------------------------------
-- Sections: settings, component (company version); profile, revision, fixed,
-- adjustment, advance, withdraw (the employee's pay-file version). Idempotent
-- per operation; a stale version raises PT409; audited without amounts.
CREATE FUNCTION public.payroll_command(p_section text,p_payload jsonb,p_expected_version bigint,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid; receipt taskpulse_private.command_receipts; cmd text; result jsonb; v bigint;
 request jsonb:=jsonb_build_object('section',p_section,'payload',p_payload,'expectedVersion',p_expected_version);
 target uuid; row_id uuid; target_month date; comp taskpulse_private.pay_components; tbl text; n integer;
 uuid_re text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
 money_re text:='^\d{1,10}(\.\d{1,2})?$'; month_re text:='^\d{4}-\d{2}(-01)?$'; BEGIN
 org:=taskpulse_private.payroll_director();
 IF p_section IS NULL OR p_section NOT IN ('settings','component','profile','revision','fixed','adjustment','advance','withdraw')
  OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR p_operation IS NULL OR p_expected_version IS NULL THEN
  RAISE EXCEPTION 'A known section, object payload, expected version and operation are required' USING ERRCODE='23514'; END IF;
 cmd:='payroll_'||p_section;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-payroll:'||org::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=cmd AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;
 PERFORM taskpulse_private.payroll_seed_components(org);

 -- Company-level sections
 IF p_section IN ('settings','component') THEN
  INSERT INTO taskpulse_private.payroll_settings(organization_id) VALUES(org) ON CONFLICT DO NOTHING;
  SELECT version INTO v FROM taskpulse_private.payroll_settings WHERE organization_id=org FOR UPDATE;
  IF v<>p_expected_version THEN RAISE EXCEPTION 'Payroll settings changed; reload and try again' USING ERRCODE='PT409'; END IF;
  IF p_section='settings' THEN
   IF p_payload-ARRAY['extraPaidDays','fullDayHours']<>'{}'
    OR coalesce(p_payload->>'extraPaidDays','') !~ '^\d{1,2}(\.\d{1,2})?$' OR (p_payload->>'extraPaidDays')::numeric>31
    OR coalesce(p_payload->>'fullDayHours','') !~ '^\d{1,2}(\.\d{1,2})?$' OR (p_payload->>'fullDayHours')::numeric NOT BETWEEN 0.25 AND 24 THEN
    RAISE EXCEPTION 'Extra paid days (0-31) and full-day hours (0.25-24) are required' USING ERRCODE='23514'; END IF;
   UPDATE taskpulse_private.payroll_settings SET extra_paid_days=(p_payload->>'extraPaidDays')::numeric,
    full_day_hours=(p_payload->>'fullDayHours')::numeric WHERE organization_id=org;
   row_id:=org;
  ELSE
   IF p_payload-ARRAY['id','kind','name','active','sort']<>'{}'
    OR (p_payload->>'id' IS NOT NULL AND p_payload->>'id' !~* uuid_re)
    OR length(btrim(coalesce(p_payload->>'name',''))) NOT BETWEEN 1 AND 60
    OR (p_payload?'active' AND jsonb_typeof(p_payload->'active')<>'boolean')
    OR (p_payload?'sort' AND coalesce(p_payload->>'sort','') !~ '^\d{1,3}$') THEN
    RAISE EXCEPTION 'A component needs a name of 1-60 characters, an active flag and an order of 0-999' USING ERRCODE='23514'; END IF;
   BEGIN
    IF p_payload->>'id' IS NULL THEN
     IF coalesce(p_payload->>'kind','') NOT IN ('fixed_deduction','variable_deduction','incentive') THEN
      RAISE EXCEPTION 'A component kind is required' USING ERRCODE='23514'; END IF;
     INSERT INTO taskpulse_private.pay_components(organization_id,kind,name,active,sort)
     VALUES(org,p_payload->>'kind',btrim(p_payload->>'name'),coalesce((p_payload->>'active')::boolean,true),coalesce((p_payload->>'sort')::integer,999))
     RETURNING id INTO row_id;
    ELSE
     UPDATE taskpulse_private.pay_components SET name=btrim(p_payload->>'name'),active=coalesce((p_payload->>'active')::boolean,active),
      sort=coalesce((p_payload->>'sort')::integer,sort)
     WHERE id=(p_payload->>'id')::uuid AND organization_id=org RETURNING id INTO row_id;
     IF row_id IS NULL THEN RAISE EXCEPTION 'No such component' USING ERRCODE='P0002'; END IF;
    END IF;
   EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'A component with that name already exists' USING ERRCODE='23505';
   END;
  END IF;
  UPDATE taskpulse_private.payroll_settings SET version=version+1,updated_at=clock_timestamp(),updated_by=actor
  WHERE organization_id=org RETURNING version INTO v;
  INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
  VALUES(actor,'managing_director',cmd,CASE p_section WHEN 'settings' THEN 'payroll_settings' ELSE 'pay_components' END,row_id,ARRAY[p_section],
   jsonb_build_object('version',v),p_operation);
  result:=jsonb_build_object('section',p_section,'version',v,'id',row_id);
  INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
  VALUES(actor,cmd,p_operation,request,org,result);
  RETURN result;
 END IF;

 -- Employee sections: every payload names the employee.
 IF coalesce(p_payload->>'userId','') !~* uuid_re THEN RAISE EXCEPTION 'An employee is required' USING ERRCODE='23514'; END IF;
 target:=(p_payload->>'userId')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=target AND u.organization_id=org) THEN
  RAISE EXCEPTION 'No such member in your company' USING ERRCODE='P0002'; END IF;
 INSERT INTO taskpulse_private.employee_pay_profiles(user_id,organization_id) VALUES(target,org) ON CONFLICT DO NOTHING;
 SELECT version INTO v FROM taskpulse_private.employee_pay_profiles WHERE user_id=target FOR UPDATE;
 IF v<>p_expected_version THEN RAISE EXCEPTION 'This pay file changed; reload and try again' USING ERRCODE='PT409'; END IF;

 IF p_section='profile' THEN
  IF p_payload-ARRAY['userId','joiningDate','accountNumber','paymentMode','employmentStatus','salaryHandlerId','notes']<>'{}'
   OR (nullif(p_payload->>'joiningDate','') IS NOT NULL AND p_payload->>'joiningDate' !~ '^\d{4}-\d{2}-\d{2}$')
   OR (nullif(btrim(p_payload->>'accountNumber'),'') IS NOT NULL AND btrim(p_payload->>'accountNumber') !~ '^[A-Za-z0-9 -]{4,34}$')
   OR (nullif(p_payload->>'paymentMode','') IS NOT NULL AND p_payload->>'paymentMode' NOT IN ('bank_transfer','cash','upi','cheque'))
   OR coalesce(p_payload->>'employmentStatus','active') NOT IN ('active','on_notice','left','not_on_payroll')
   OR (nullif(p_payload->>'salaryHandlerId','') IS NOT NULL AND (p_payload->>'salaryHandlerId' !~* uuid_re
    OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=(p_payload->>'salaryHandlerId')::uuid AND u.organization_id=org)))
   OR length(coalesce(p_payload->>'notes',''))>1000 THEN
   RAISE EXCEPTION 'Check the joining date, account number (4-34 letters or digits), payment mode, status and salary handler' USING ERRCODE='23514'; END IF;
  BEGIN
   UPDATE taskpulse_private.employee_pay_profiles SET joining_date=nullif(p_payload->>'joiningDate','')::date,
    account_number=nullif(btrim(p_payload->>'accountNumber'),''),payment_mode=nullif(p_payload->>'paymentMode',''),
    employment_status=coalesce(p_payload->>'employmentStatus','active'),salary_handler_id=nullif(p_payload->>'salaryHandlerId','')::uuid,
    notes=btrim(coalesce(p_payload->>'notes','')) WHERE user_id=target;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
   RAISE EXCEPTION 'The joining date is not a valid date' USING ERRCODE='23514';
  END;
  row_id:=target; tbl:='employee_pay_profiles';

 ELSIF p_section='revision' THEN
  IF p_payload-ARRAY['userId','effectiveFrom','monthlySalary','note']<>'{}'
   OR coalesce(p_payload->>'effectiveFrom','') !~ month_re OR coalesce(p_payload->>'monthlySalary','') !~ money_re
   OR length(coalesce(p_payload->>'note',''))>200 THEN
   RAISE EXCEPTION 'A month (YYYY-MM) and a monthly salary in rupees are required' USING ERRCODE='23514'; END IF;
  BEGIN target_month:=(left(p_payload->>'effectiveFrom',7)||'-01')::date;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION 'Not a valid month' USING ERRCODE='23514'; END;
  -- Saving a month that already has a salary replaces it (the old one is kept, withdrawn).
  UPDATE taskpulse_private.salary_revisions SET record_state='withdrawn' WHERE user_id=target AND effective_from=target_month AND record_state='active';
  INSERT INTO taskpulse_private.salary_revisions(organization_id,user_id,effective_from,monthly_salary,note,created_by)
  VALUES(org,target,target_month,(p_payload->>'monthlySalary')::numeric,btrim(coalesce(p_payload->>'note','')),actor) RETURNING id INTO row_id;
  tbl:='salary_revisions';

 ELSIF p_section='fixed' THEN
  IF p_payload-ARRAY['userId','id','componentId','monthlyAmount','effectiveFrom','effectiveUntil']<>'{}'
   OR (p_payload->>'id' IS NOT NULL AND p_payload->>'id' !~* uuid_re)
   OR coalesce(p_payload->>'componentId','') !~* uuid_re OR coalesce(p_payload->>'monthlyAmount','') !~ money_re
   OR (p_payload->>'monthlyAmount')::numeric<=0
   OR coalesce(p_payload->>'effectiveFrom','') !~ month_re
   OR (nullif(p_payload->>'effectiveUntil','') IS NOT NULL AND p_payload->>'effectiveUntil' !~ month_re) THEN
   RAISE EXCEPTION 'A fixed deduction needs a component, a monthly amount above zero and a starting month' USING ERRCODE='23514'; END IF;
  SELECT * INTO comp FROM taskpulse_private.pay_components WHERE id=(p_payload->>'componentId')::uuid AND organization_id=org;
  IF comp.kind IS DISTINCT FROM 'fixed_deduction' THEN RAISE EXCEPTION 'Choose a fixed deduction component' USING ERRCODE='23514'; END IF;
  BEGIN
   IF p_payload->>'id' IS NULL THEN
    INSERT INTO taskpulse_private.fixed_deductions(organization_id,user_id,component_id,monthly_amount,effective_from,effective_until,created_by)
    VALUES(org,target,comp.id,(p_payload->>'monthlyAmount')::numeric,(left(p_payload->>'effectiveFrom',7)||'-01')::date,
     (left(nullif(p_payload->>'effectiveUntil',''),7)||'-01')::date,actor) RETURNING id INTO row_id;
   ELSE
    UPDATE taskpulse_private.fixed_deductions SET component_id=comp.id,monthly_amount=(p_payload->>'monthlyAmount')::numeric,
     effective_from=(left(p_payload->>'effectiveFrom',7)||'-01')::date,effective_until=(left(nullif(p_payload->>'effectiveUntil',''),7)||'-01')::date
    WHERE id=(p_payload->>'id')::uuid AND user_id=target AND record_state='active' RETURNING id INTO row_id;
    IF row_id IS NULL THEN RAISE EXCEPTION 'No such fixed deduction' USING ERRCODE='P0002'; END IF;
   END IF;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION 'Not a valid month' USING ERRCODE='23514';
   WHEN check_violation THEN RAISE EXCEPTION 'The last month cannot be before the first month' USING ERRCODE='23514';
  END;
  tbl:='fixed_deductions';

 ELSIF p_section='adjustment' THEN
  IF p_payload-ARRAY['userId','period','componentId','amount','note']<>'{}'
   OR coalesce(p_payload->>'period','') !~ month_re OR coalesce(p_payload->>'componentId','') !~* uuid_re
   OR coalesce(p_payload->>'amount','') !~ money_re OR (p_payload->>'amount')::numeric<=0 OR length(coalesce(p_payload->>'note',''))>200 THEN
   RAISE EXCEPTION 'A month, a component and an amount above zero are required' USING ERRCODE='23514'; END IF;
  BEGIN target_month:=(left(p_payload->>'period',7)||'-01')::date;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION 'Not a valid month' USING ERRCODE='23514'; END;
  SELECT * INTO comp FROM taskpulse_private.pay_components WHERE id=(p_payload->>'componentId')::uuid AND organization_id=org;
  IF comp.kind IS NULL OR comp.kind='fixed_deduction' THEN RAISE EXCEPTION 'Choose a monthly deduction or incentive component' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM taskpulse_private.payroll_months m WHERE m.organization_id=org AND m.period_start=target_month AND m.state='finalized') THEN
   RAISE EXCEPTION 'That month''s salary is finalised; reopen it first' USING ERRCODE='42501'; END IF;
  INSERT INTO taskpulse_private.pay_adjustments(organization_id,user_id,period_start,component_id,amount,note,created_by)
  VALUES(org,target,target_month,comp.id,(p_payload->>'amount')::numeric,btrim(coalesce(p_payload->>'note','')),actor) RETURNING id INTO row_id;
  tbl:='pay_adjustments';

 ELSIF p_section='advance' THEN
  IF p_payload-ARRAY['userId','paidOn','reason','amount']<>'{}'
   OR coalesce(p_payload->>'paidOn','') !~ '^\d{4}-\d{2}-\d{2}$' OR length(btrim(coalesce(p_payload->>'reason',''))) NOT BETWEEN 1 AND 200
   OR coalesce(p_payload->>'amount','') !~ money_re OR (p_payload->>'amount')::numeric<=0 THEN
   RAISE EXCEPTION 'An advance needs a payment date, a reason and an amount above zero' USING ERRCODE='23514'; END IF;
  BEGIN
   INSERT INTO taskpulse_private.salary_advances(organization_id,user_id,paid_on,reason,amount,created_by)
   VALUES(org,target,(p_payload->>'paidOn')::date,btrim(p_payload->>'reason'),(p_payload->>'amount')::numeric,actor) RETURNING id INTO row_id;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION 'The payment date is not a valid date' USING ERRCODE='23514';
  END;
  tbl:='salary_advances';

 ELSE -- withdraw an entry entered by mistake (kept, never deleted)
  IF p_payload-ARRAY['userId','entry','id']<>'{}' OR coalesce(p_payload->>'entry','') NOT IN ('revision','fixed','adjustment','advance')
   OR coalesce(p_payload->>'id','') !~* uuid_re THEN
   RAISE EXCEPTION 'An entry kind and id are required' USING ERRCODE='23514'; END IF;
  row_id:=(p_payload->>'id')::uuid;
  IF p_payload->>'entry'='revision' THEN
   tbl:='salary_revisions';
   UPDATE taskpulse_private.salary_revisions SET record_state='withdrawn' WHERE id=row_id AND user_id=target AND record_state='active';
  ELSIF p_payload->>'entry'='fixed' THEN
   tbl:='fixed_deductions';
   UPDATE taskpulse_private.fixed_deductions SET record_state='withdrawn' WHERE id=row_id AND user_id=target AND record_state='active';
  ELSIF p_payload->>'entry'='adjustment' THEN
   tbl:='pay_adjustments';
   IF EXISTS(SELECT 1 FROM taskpulse_private.pay_adjustments j JOIN taskpulse_private.payroll_months m
    ON m.organization_id=j.organization_id AND m.period_start=j.period_start AND m.state='finalized' WHERE j.id=row_id) THEN
    RAISE EXCEPTION 'That month''s salary is finalised; reopen it first' USING ERRCODE='42501'; END IF;
   UPDATE taskpulse_private.pay_adjustments SET record_state='withdrawn' WHERE id=row_id AND user_id=target AND record_state='active';
  ELSE
   tbl:='salary_advances';
   UPDATE taskpulse_private.salary_advances SET record_state='withdrawn' WHERE id=row_id AND user_id=target AND record_state='active';
  END IF;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n=0 THEN RAISE EXCEPTION 'No such entry, or it was already removed' USING ERRCODE='P0002'; END IF;
 END IF;

 UPDATE taskpulse_private.employee_pay_profiles SET version=version+1,updated_at=clock_timestamp(),updated_by=actor
 WHERE user_id=target RETURNING version INTO v;
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(actor,'managing_director',cmd,tbl,row_id,ARRAY[p_section],jsonb_build_object('user_id',jsonb_build_object('after',target),'version',v),p_operation);
 result:=jsonb_build_object('section',p_section,'version',v,'id',row_id);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,cmd,p_operation,request,row_id,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.payroll_command(text,jsonb,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.payroll_command(text,jsonb,bigint,uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Finalise / reopen a month (managing director)
-- ---------------------------------------------------------------------------
-- p_action: 'finalize' freezes every line as a new revision (in hand rounded
-- to the nearest rupee); 'reopen' (with a reason) returns the month to a live
-- draft and keeps the earlier records.
CREATE FUNCTION public.payroll_month_command(p_action text,p_period date,p_reason text,p_expected_version bigint,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid; receipt taskpulse_private.command_receipts; cmd text; result jsonb; period date;
 m taskpulse_private.payroll_months; hdr record; missing text;
 request jsonb:=jsonb_build_object('action',p_action,'period',p_period,'reason',p_reason,'expectedVersion',p_expected_version); BEGIN
 org:=taskpulse_private.payroll_director();
 IF p_action IS NULL OR p_action NOT IN ('finalize','reopen') OR p_period IS NULL OR NOT isfinite(p_period)
  OR p_operation IS NULL OR p_expected_version IS NULL THEN
  RAISE EXCEPTION 'An action, a month, an expected version and an operation are required' USING ERRCODE='23514'; END IF;
 IF p_action='reopen' AND length(btrim(coalesce(p_reason,''))) NOT BETWEEN 1 AND 500 THEN
  RAISE EXCEPTION 'A reason of 1-500 characters is required to reopen a month' USING ERRCODE='23514'; END IF;
 period:=date_trunc('month',p_period)::date;
 cmd:='payroll_month_'||p_action;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-payroll:'||org::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=cmd AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;
 INSERT INTO taskpulse_private.payroll_months(organization_id,period_start) VALUES(org,period) ON CONFLICT DO NOTHING;
 SELECT * INTO m FROM taskpulse_private.payroll_months WHERE organization_id=org AND period_start=period FOR UPDATE;
 IF m.version<>p_expected_version THEN RAISE EXCEPTION 'This month changed; reload and try again' USING ERRCODE='PT409'; END IF;

 IF p_action='finalize' THEN
  IF m.state='finalized' THEN RAISE EXCEPTION 'This month is already finalised' USING ERRCODE='PT409'; END IF;
  IF period>date_trunc('month',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date)::date THEN
   RAISE EXCEPTION 'A future month cannot be finalised' USING ERRCODE='23514'; END IF;
  SELECT * INTO hdr FROM taskpulse_private.payroll_header(org,period);
  IF hdr.actual_working_days<=0 THEN RAISE EXCEPTION 'The month has no working days; check weekly offs and holidays' USING ERRCODE='23514'; END IF;
  SELECT string_agg(c.full_name,', ' ORDER BY lower(c.full_name)) INTO missing FROM taskpulse_private.payroll_compute(org,period) c WHERE c.monthly_salary IS NULL;
  IF missing IS NOT NULL THEN
   RAISE EXCEPTION 'Set a monthly salary (or mark "not on payroll") for: %',missing USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM taskpulse_private.payroll_compute(org,period)) THEN
   RAISE EXCEPTION 'Nobody is on this month''s payroll' USING ERRCODE='23514'; END IF;
  INSERT INTO taskpulse_private.payroll_lines(organization_id,period_start,revision,user_id,employee_id,full_name,hours_worked,off_hours,
   present_days,ud_days,half_days,days_worked,monthly_salary,per_day,calculated,fixed_total,variable_total,incentive_total,deductions,
   non_capped,capped,in_hand,in_hand_rounded,advances_taken,advances_recovered,advance_balance,breakdown)
  SELECT org,period,m.revision+1,c.user_id,c.employee_id,c.full_name,c.hours_worked,c.off_hours,c.present_days,c.ud_days,c.half_days,
   c.days_worked,c.monthly_salary,c.per_day,c.calculated,c.fixed_total,c.variable_total,c.incentive_total,c.deductions,
   c.non_capped,c.capped,c.in_hand,c.in_hand_rounded,c.advances_taken,c.advances_recovered,c.advance_balance,c.breakdown
  FROM taskpulse_private.payroll_compute(org,period) c;
  UPDATE taskpulse_private.payroll_months SET state='finalized',revision=revision+1,version=version+1,
   working_days_in_month=hdr.working_days_in_month,festival_holidays=hdr.festival_holidays,actual_working_days=hdr.actual_working_days,
   extra_paid_days=hdr.extra_paid_days,full_day_hours=hdr.full_day_hours,finalized_at=clock_timestamp(),finalized_by=actor
  WHERE organization_id=org AND period_start=period RETURNING * INTO m;
 ELSE
  IF m.state<>'finalized' THEN RAISE EXCEPTION 'Only a finalised month can be reopened' USING ERRCODE='PT409'; END IF;
  UPDATE taskpulse_private.payroll_months SET state='draft',version=version+1,reopened_at=clock_timestamp(),reopened_by=actor,
   reopen_reason=btrim(p_reason) WHERE organization_id=org AND period_start=period RETURNING * INTO m;
 END IF;

 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(actor,'managing_director',cmd,'payroll_months',org,ARRAY['state'],
  jsonb_build_object('period',period,'revision',m.revision,'version',m.version,'reason',CASE WHEN p_action='reopen' THEN btrim(p_reason) END),p_operation);
 result:=jsonb_build_object('period',period,'state',m.state,'revision',m.revision,'version',m.version);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,cmd,p_operation,request,org,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.payroll_month_command(text,date,text,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.payroll_month_command(text,date,text,bigint,uuid) TO authenticated;

COMMIT;
SELECT taskpulse_private.m15_secure();
