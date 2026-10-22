-- ===========================================================================
-- TaskPulse - Policies and notifications (forward only, after 52; numbered 56
-- on 21 October 2026: 53 company settings, 54/57 activity log, 55 month setup)
--
-- The managing director defines policies from templates, for example "on time
-- every working day this period" (user decision, 20 October 2026). A met
-- policy gives a commendation badge, a congratulation notification, a
-- ceremony mention and the policy's recognition points. Recognition points
-- never feed the ten-factor performance score, and nothing here reads or
-- writes performance tables.
--
-- Split of work:
--   * SQL produces privacy-safe per-member, per-day facts
--     (policy_period_facts); TypeScript templates decide met / not met /
--     unavailable from them; one command records the results
--     (policy_command 'record_run'). Preview, "Evaluate now" and the nightly
--     worker all run the same TypeScript evaluator.
--   * Templates live in TypeScript, so template_key is a format check, not a
--     list: adding a template needs no migration.
--   * Failures are first-class rows (policy_runs status 'failed'), never zero
--     results, and notify the company's managing directors once a day.
--   * Corrections: every input_history row (attendance, logs, contributions)
--     and every change to a mission's dates or status records an invalidated
--     date range; policy_due_work returns the periods it touches again. The
--     upsert changes only evaluations whose outcome, reasons or evidence
--     changed. A commendation that later stops being met keeps commended_at
--     (shown as withdrawn after correction); notifications are never resent.
--   * Holidays come from public.team_holiday_dates (37; 53 adds the company
--     calendar). Until it accepts a scoped worker, the worker falls back to
--     37's rule (every active member on Holiday), computed here.
--
-- Everything is company-owned (organization_id, 40's stamp trigger and scope
-- policies) and private: signed-in users and workers reach it only through
-- the functions below. Conflicts raise PT409 (see 52).
-- ===========================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE taskpulse_private.policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
 description text NOT NULL DEFAULT '' CHECK (length(description)<=500),
 template_key text NOT NULL CHECK (template_key ~ '^[a-z][a-z0-9_]{2,59}$'),
 parameters jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(parameters)='object'),
 period_kind text NOT NULL CHECK (period_kind IN ('day','week','month')),
 audience jsonb NOT NULL DEFAULT '{"kind":"everyone"}' CHECK (jsonb_typeof(audience)='object'),
 reward jsonb NOT NULL CHECK (jsonb_typeof(reward)='object'),
 rule_version text NOT NULL DEFAULT 'policies-v1' CHECK (rule_version ~ '^[a-z0-9][a-z0-9_.@-]{0,59}$'),
 active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 created_by uuid NOT NULL REFERENCES public.users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 archived_at timestamptz,
 CHECK (archived_at IS NULL OR NOT active)
);
-- One live (not archived) policy per name in a company.
CREATE UNIQUE INDEX policies_live_name ON taskpulse_private.policies(organization_id,lower(btrim(name))) WHERE archived_at IS NULL;
CREATE INDEX policies_created_by_idx ON taskpulse_private.policies(created_by);

-- Every version of a policy, immutable: closed periods are judged by the
-- version in force when they ended.
CREATE TABLE taskpulse_private.policy_revisions (
 policy_id uuid NOT NULL REFERENCES taskpulse_private.policies(id),
 organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK (version>0),
 command text NOT NULL CHECK (command IN ('create','revise','activate','deactivate','archive')),
 definition jsonb NOT NULL CHECK (jsonb_typeof(definition)='object'),
 reason text CHECK (reason IS NULL OR length(reason)<=300),
 actor_id uuid NOT NULL REFERENCES public.users(id),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (policy_id,version)
);
CREATE INDEX policy_revisions_actor_idx ON taskpulse_private.policy_revisions(actor_id);

CREATE TABLE taskpulse_private.policy_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
 trigger text NOT NULL CHECK (trigger IN ('nightly','on_demand','invalidation')),
 status text NOT NULL CHECK (status IN ('completed','failed')),
 actor_id uuid REFERENCES public.users(id),
 summary jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(summary)='object'),
 error_code text CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,60}$'),
 error_detail text CHECK (error_detail IS NULL OR length(error_detail)<=500),
 operation uuid NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((status='failed')=(error_code IS NOT NULL))
);
CREATE INDEX policy_runs_recent_idx ON taskpulse_private.policy_runs(organization_id,recorded_at DESC);
CREATE INDEX policy_runs_actor_idx ON taskpulse_private.policy_runs(actor_id) WHERE actor_id IS NOT NULL;

CREATE TABLE taskpulse_private.policy_evaluations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
 policy_id uuid NOT NULL REFERENCES taskpulse_private.policies(id),
 policy_version integer NOT NULL CHECK (policy_version>0),
 period_kind text NOT NULL CHECK (period_kind IN ('day','week','month')),
 period_key text NOT NULL CHECK (period_key ~ '^\d{4}-(\d{2}(-\d{2})?|W\d{2})$'),
 period_start date NOT NULL,
 period_end date NOT NULL CHECK (period_end>=period_start),
 employee_id uuid NOT NULL REFERENCES public.users(id),
 outcome text NOT NULL CHECK (outcome IN ('met','not_met','unavailable')),
 final boolean NOT NULL,
 reasons jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(reasons)='array'),
 evidence jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(evidence)='object'),
 previous_outcome text CHECK (previous_outcome IS NULL OR previous_outcome IN ('met','not_met','unavailable')),
 -- First time this row was a final "met": the commendation. Kept when a
 -- correction later changes the outcome ("withdrawn after correction").
 commended_at timestamptz,
 evaluated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 run_id uuid NOT NULL REFERENCES taskpulse_private.policy_runs(id),
 UNIQUE (policy_id,period_key,employee_id)
);
CREATE INDEX policy_evaluations_employee_idx ON taskpulse_private.policy_evaluations(employee_id);
CREATE INDEX policy_evaluations_run_idx ON taskpulse_private.policy_evaluations(run_id);
CREATE INDEX policy_evaluations_commended_idx ON taskpulse_private.policy_evaluations(organization_id,period_end) WHERE final AND outcome='met';

-- When each policy period was last evaluated, and with which version.
CREATE TABLE taskpulse_private.policy_period_states (
 policy_id uuid NOT NULL REFERENCES taskpulse_private.policies(id),
 period_key text NOT NULL,
 organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
 period_start date NOT NULL,
 period_end date NOT NULL,
 policy_version integer NOT NULL,
 final boolean NOT NULL,
 last_evaluated_at timestamptz NOT NULL,
 run_id uuid NOT NULL REFERENCES taskpulse_private.policy_runs(id),
 PRIMARY KEY (policy_id,period_key)
);
CREATE INDEX policy_period_states_run_idx ON taskpulse_private.policy_period_states(run_id);

-- Date ranges whose inputs changed since they were evaluated. Pruned after
-- the 62-day correction window by record_run.
CREATE TABLE taskpulse_private.policy_invalidations (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
 from_date date NOT NULL,
 to_date date NOT NULL CHECK (to_date>=from_date),
 source text NOT NULL CHECK (source ~ '^[a-z_]{1,40}$'),
 invalidated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX policy_invalidations_lookup ON taskpulse_private.policy_invalidations(organization_id,invalidated_at);

CREATE TABLE taskpulse_private.policy_receipts (
 organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
 actor_key text NOT NULL,
 operation uuid NOT NULL,
 command text NOT NULL,
 request_digest text NOT NULL,
 response jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (organization_id,actor_key,operation)
);

CREATE TABLE taskpulse_private.notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
 recipient_id uuid NOT NULL REFERENCES public.users(id),
 kind text NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_]{1,39}$'),
 title text NOT NULL CHECK (length(title) BETWEEN 1 AND 140),
 body text NOT NULL DEFAULT '' CHECK (length(body)<=500),
 href text CHECK (href IS NULL OR href ~ '^/[A-Za-z0-9/_?=&%.-]{0,199}$'),
 dedupe_key text NOT NULL CHECK (length(dedupe_key) BETWEEN 1 AND 200),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 read_at timestamptz,
 UNIQUE (recipient_id,dedupe_key)
);
CREATE INDEX notifications_recent_idx ON taskpulse_private.notifications(recipient_id,created_at DESC);
CREATE INDEX notifications_unread_idx ON taskpulse_private.notifications(recipient_id) WHERE read_at IS NULL;

CREATE TRIGGER m56_policy_revision_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.policy_revisions FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();
CREATE TRIGGER m56_policy_receipt_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.policy_receipts FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();

INSERT INTO taskpulse_private.m15_tenant_tables(table_schema,table_name) VALUES
 ('taskpulse_private','policies'),('taskpulse_private','policy_revisions'),('taskpulse_private','policy_runs'),
 ('taskpulse_private','policy_evaluations'),('taskpulse_private','policy_period_states'),('taskpulse_private','policy_invalidations'),
 ('taskpulse_private','policy_receipts'),('taskpulse_private','notifications')
ON CONFLICT DO NOTHING;
INSERT INTO taskpulse_private.m15_org_refs(table_schema,table_name,column_name,ref_schema,ref_table) VALUES
 ('taskpulse_private','policies','created_by','public','users'),
 ('taskpulse_private','policy_revisions','policy_id','taskpulse_private','policies'),
 ('taskpulse_private','policy_revisions','actor_id','public','users'),
 ('taskpulse_private','policy_runs','actor_id','public','users'),
 ('taskpulse_private','policy_evaluations','policy_id','taskpulse_private','policies'),
 ('taskpulse_private','policy_evaluations','employee_id','public','users'),
 ('taskpulse_private','policy_evaluations','run_id','taskpulse_private','policy_runs'),
 ('taskpulse_private','policy_period_states','policy_id','taskpulse_private','policies'),
 ('taskpulse_private','policy_period_states','run_id','taskpulse_private','policy_runs'),
 ('taskpulse_private','notifications','recipient_id','public','users')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- The period of a kind that contains a day. Keys: 2026-10-19 (day),
-- 2026-W43 (ISO week, Monday to Sunday), 2026-10 (calendar month). The
-- TypeScript mirror is modules/policies/internal/periods.ts.
CREATE FUNCTION taskpulse_private.policy_period(p_kind text,p_day date)
RETURNS TABLE(period_key text,period_start date,period_end date)
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE p_kind WHEN 'day' THEN to_char(p_day,'YYYY-MM-DD')
   WHEN 'week' THEN to_char(p_day-(extract(isodow FROM p_day)::integer-1),'IYYY-"W"IW')
   ELSE to_char(p_day,'YYYY-MM') END,
  CASE p_kind WHEN 'day' THEN p_day WHEN 'week' THEN p_day-(extract(isodow FROM p_day)::integer-1)
   ELSE date_trunc('month',p_day)::date END,
  CASE p_kind WHEN 'day' THEN p_day WHEN 'week' THEN p_day-(extract(isodow FROM p_day)::integer-1)+6
   ELSE (date_trunc('month',p_day)+interval '1 month'-interval '1 day')::date END
 WHERE p_kind IN ('day','week','month') AND p_day IS NOT NULL AND isfinite(p_day);
$$;

-- Audience: {"kind":"everyone"}, {"kind":"roles","roles":[...]} or
-- {"kind":"members","ids":[...]}.
CREATE FUNCTION taskpulse_private.policy_audience_includes(p_audience jsonb,p_user uuid,p_role text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE p_audience->>'kind'
  WHEN 'everyone' THEN true
  WHEN 'roles' THEN coalesce(p_audience->'roles' ? p_role,false)
  WHEN 'members' THEN coalesce(p_audience->'ids' ? p_user::text,false)
  ELSE false END;
$$;

-- Validates a create/revise payload and returns the normalised definition.
CREATE FUNCTION taskpulse_private.policy_definition(p jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE name text; description text; audience jsonb; reward jsonb; params jsonb; k text; v jsonb; BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' THEN RAISE EXCEPTION 'Policy definition object required' USING ERRCODE='23514'; END IF;
 name:=btrim(coalesce(p->>'name',''));
 description:=btrim(coalesce(p->>'description',''));
 IF length(name) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'A policy name of 1 to 80 characters is required' USING ERRCODE='23514'; END IF;
 IF length(description)>500 THEN RAISE EXCEPTION 'The description is limited to 500 characters' USING ERRCODE='23514'; END IF;
 IF coalesce(p->>'templateKey','') !~ '^[a-z][a-z0-9_]{2,59}$' THEN RAISE EXCEPTION 'A known template is required' USING ERRCODE='23514'; END IF;
 IF coalesce(p->>'periodKind','') NOT IN ('day','week','month') THEN RAISE EXCEPTION 'Period must be day, week or month' USING ERRCODE='23514'; END IF;
 IF coalesce(p->>'ruleVersion','policies-v1') !~ '^[a-z0-9][a-z0-9_.@-]{0,59}$' THEN RAISE EXCEPTION 'Invalid rule version' USING ERRCODE='23514'; END IF;
 params:=coalesce(p->'parameters','{}'::jsonb);
 IF jsonb_typeof(params)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(params))>20 THEN
  RAISE EXCEPTION 'Parameters must be an object of at most 20 values' USING ERRCODE='23514'; END IF;
 FOR k,v IN SELECT key,value FROM jsonb_each(params) LOOP
  IF k !~ '^[a-zA-Z][a-zA-Z0-9]{0,39}$' OR jsonb_typeof(v) NOT IN ('string','number','boolean','null')
   OR (jsonb_typeof(v)='string' AND length(v#>>'{}')>80) THEN
   RAISE EXCEPTION 'Parameter % is not a plain value', k USING ERRCODE='23514'; END IF;
 END LOOP;
 audience:=coalesce(p->'audience','{"kind":"everyone"}'::jsonb);
 IF jsonb_typeof(audience)<>'object' OR NOT (
   (audience->>'kind'='everyone' AND (SELECT count(*) FROM jsonb_object_keys(audience))=1)
   OR (audience->>'kind'='roles' AND jsonb_typeof(audience->'roles')='array' AND jsonb_array_length(audience->'roles') BETWEEN 1 AND 4
       AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(audience->'roles') r WHERE jsonb_typeof(r)<>'string'
        OR r#>>'{}' NOT IN ('managing_director','project_engineer','data_manager','team_member')))
   OR (audience->>'kind'='members' AND jsonb_typeof(audience->'ids')='array' AND jsonb_array_length(audience->'ids') BETWEEN 1 AND 500
       AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(audience->'ids') r WHERE jsonb_typeof(r)<>'string'
        OR r#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))) THEN
  RAISE EXCEPTION 'Audience must be everyone, a list of roles or a list of members' USING ERRCODE='23514'; END IF;
 reward:=p->'reward';
 IF jsonb_typeof(reward)<>'object' OR reward->>'kind' IS DISTINCT FROM 'commendation'
  OR length(btrim(coalesce(reward->>'badge',''))) NOT BETWEEN 1 AND 40
  OR jsonb_typeof(reward->'points')<>'number' OR (reward->>'points')::numeric NOT BETWEEN 0 AND 1000
  OR (reward->>'points')::numeric<>trunc((reward->>'points')::numeric) THEN
  RAISE EXCEPTION 'Reward must be a commendation with a badge and 0 to 1000 whole points' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object('name',name,'description',description,'templateKey',p->>'templateKey','parameters',params,
  'periodKind',p->>'periodKind','audience',audience,
  'reward',jsonb_build_object('kind','commendation','badge',btrim(reward->>'badge'),'points',(reward->>'points')::integer),
  'ruleVersion',coalesce(p->>'ruleVersion','policies-v1'));
END $$;

-- Who is calling: a signed-in active account (with role) or the service-role
-- worker scoped to one company by x-taskpulse-organization. An unscoped
-- worker is refused, so no call ever reads across companies.
CREATE FUNCTION taskpulse_private.policy_caller(OUT org uuid,OUT actor uuid,OUT role text,OUT worker boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 actor:=auth.uid();
 worker:=actor IS NULL AND current_setting('role',true)='service_role';
 IF worker THEN
  org:=taskpulse_private.m15_scope();
  IF org IS NULL OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=org AND o.status='active') THEN
   RAISE EXCEPTION 'A company-scoped worker is required' USING ERRCODE='42501'; END IF;
  RETURN;
 END IF;
 role:=public.get_user_role()::text;
 org:=public.current_organization();
 IF actor IS NULL OR role IS NULL OR org IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
END $$;

-- Team holiday dates of the caller's company: 37/53's public function when it
-- accepts the caller, else 37's rule (every active member on Holiday).
CREATE FUNCTION taskpulse_private.policy_team_holidays(p_org uuid,p_from date,p_to date,OUT dates date[],OUT source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF p_to<p_from THEN dates:='{}'; source:='none'; RETURN; END IF;
 BEGIN
  dates:=public.team_holiday_dates(p_from,p_to); source:='team_holiday_dates'; RETURN;
 EXCEPTION WHEN insufficient_privilege OR undefined_function THEN NULL;
 END;
 SELECT coalesce(array_agg(g.day::date ORDER BY g.day),'{}') INTO dates
 FROM generate_series(p_from,p_to,interval '1 day') g(day)
 WHERE EXISTS(SELECT 1 FROM public.users u WHERE u.is_active AND u.organization_id=p_org)
  AND NOT EXISTS(SELECT 1 FROM public.users u WHERE u.is_active AND u.organization_id=p_org AND NOT EXISTS(
   SELECT 1 FROM public.attendance_records a WHERE a.user_id=u.id AND a.attendance_date=g.day::date AND a.status='Holiday' AND a.record_state='active'));
 source:='derived_rule';
END $$;

-- ---------------------------------------------------------------------------
-- Facts: per member and day, privacy-safe inputs for the templates
-- ---------------------------------------------------------------------------
-- Members read themselves; managing directors and project engineers read
-- their company or one member; the scoped worker reads its company. At most
-- 62 days; days after today are not returned. Task counts are rebuilt from
-- dates as they stood at the end of the range (or today), so a closed period
-- is judged as it was, not as the missions are now.
CREATE FUNCTION public.policy_period_facts(p_from date,p_to date,p_employee uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c record; manager boolean; today date:=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date; through date; holidays record; members jsonb; BEGIN
 SELECT * INTO c FROM taskpulse_private.policy_caller();
 manager:=c.worker OR c.role IN ('managing_director','project_engineer');
 IF p_from IS NULL OR p_to IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to) OR p_to<p_from OR p_to-p_from>61 THEN
  RAISE EXCEPTION 'A date range of at most 62 days is required' USING ERRCODE='23514'; END IF;
 IF p_employee IS NOT NULL AND p_employee IS DISTINCT FROM c.actor AND NOT manager THEN
  RAISE EXCEPTION 'Own facts or manager authority required' USING ERRCODE='42501'; END IF;
 IF p_employee IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_employee AND u.is_active AND u.organization_id=c.org) THEN
  RAISE EXCEPTION 'Active member of your company required' USING ERRCODE='42501'; END IF;
 through:=least(p_to,today);
 SELECT * INTO holidays FROM taskpulse_private.policy_team_holidays(c.org,p_from,through);
 WITH people AS (
  SELECT u.id,u.full_name,u.role::text AS role FROM public.users u
  WHERE u.is_active AND u.organization_id=c.org
   AND u.id=coalesce(p_employee,CASE WHEN manager THEN u.id ELSE c.actor END)),
 days AS (SELECT g.day::date AS day FROM generate_series(p_from,through,interval '1 day') g(day)),
 att AS (
  SELECT DISTINCT ON (a.user_id,a.attendance_date) a.user_id,a.attendance_date AS day,a.status::text AS status,
   a.check_in_at,a.attendance_hours,a.off_hours,a.hours_confirmed
  FROM public.attendance_records a JOIN people p ON p.id=a.user_id
  WHERE a.record_state='active' AND a.attendance_date BETWEEN p_from AND through
  ORDER BY a.user_id,a.attendance_date,a.record_version DESC),
 logged AS (
  SELECT l.user_id,l.log_date AS day,sum(l.hours_worked) AS hours FROM public.daily_task_logs l JOIN people p ON p.id=l.user_id
  WHERE l.reversed_at IS NULL AND l.log_date BETWEEN p_from AND through GROUP BY 1,2),
 contributed AS (
  SELECT f.posted_by AS user_id,f.fact_date AS day FROM public.daily_facts f JOIN people p ON p.id=f.posted_by
  WHERE f.validation_state NOT IN ('withdrawn','rejected') AND f.fact_date BETWEEN p_from AND through
  UNION SELECT i.posted_by,i.idea_date FROM public.ideas i JOIN people p ON p.id=i.posted_by
  WHERE i.validation_state NOT IN ('withdrawn','rejected') AND i.idea_date BETWEEN p_from AND through
  UNION SELECT s.posted_by,s.suggestion_date FROM public.suggestions s JOIN people p ON p.id=s.posted_by
  WHERE s.validation_state NOT IN ('withdrawn','rejected') AND s.suggestion_date BETWEEN p_from AND through),
 day_rows AS (
  SELECT p.id AS user_id,jsonb_agg(jsonb_build_object(
    'date',d.day,'status',a.status,
    'checkIn',CASE WHEN a.check_in_at IS NOT NULL THEN to_char(a.check_in_at AT TIME ZONE 'Asia/Kolkata','HH24:MI') END,
    'regularHours',CASE WHEN a.hours_confirmed THEN a.attendance_hours END,
    'offHours',CASE WHEN a.hours_confirmed THEN a.off_hours END,
    'hoursConfirmed',coalesce(a.hours_confirmed,false),
    'loggedHours',coalesce(l.hours,0),
    'active',(l.user_id IS NOT NULL OR x.user_id IS NOT NULL),
    'teamHoliday',d.day=ANY(holidays.dates)) ORDER BY d.day) AS days
  FROM people p CROSS JOIN days d
  LEFT JOIN att a ON a.user_id=p.id AND a.day=d.day
  LEFT JOIN logged l ON l.user_id=p.id AND l.day=d.day
  LEFT JOIN (SELECT DISTINCT user_id,day FROM contributed) x ON x.user_id=p.id AND x.day=d.day
  GROUP BY p.id),
 mine AS (
  SELECT p.id AS user_id,t.id,t.assigned_date,t.due_date,
   CASE WHEN t.completed_date<=through THEN t.completed_date END AS completed
  FROM people p JOIN public.tasks t ON t.organization_id=c.org
   AND (t.assignee_id=p.id OR EXISTS(SELECT 1 FROM public.task_assignees ta WHERE ta.task_id=t.id AND ta.user_id=p.id))
  WHERE t.status<>'Discarded' AND (t.assigned_date IS NULL OR t.assigned_date<=through)
   AND (t.archived_effective_date IS NULL OR t.archived_effective_date>through)),
 judged AS (
  SELECT m.*,taskpulse_private.freshness_result(m.assigned_date,m.due_date,m.completed,
    CASE WHEN m.completed IS NULL THEN 'In Progress'::public.task_status ELSE 'Done'::public.task_status END,through)->>'state' AS fresh
  FROM mine m WHERE m.completed IS NULL OR m.completed>=p_from),
 task_rows AS (
  SELECT user_id,jsonb_build_object(
   'open',count(*) FILTER (WHERE completed IS NULL),
   'overdue',count(*) FILTER (WHERE completed IS NULL AND due_date<through),
   'stale',count(*) FILTER (WHERE fresh='Stale'),
   'rotten',count(*) FILTER (WHERE fresh='Rotten'),
   'done',count(*) FILTER (WHERE completed IS NOT NULL),
   'undated',count(*) FILTER (WHERE fresh IS NULL)) AS tasks
  FROM judged GROUP BY user_id),
 contrib_rows AS (
  SELECT p.id AS user_id,jsonb_build_object(
   'facts',(SELECT count(*) FROM public.daily_facts f WHERE f.posted_by=p.id AND f.validation_state='validated' AND f.fact_date BETWEEN p_from AND through),
   'ideas',(SELECT count(*) FROM public.ideas i WHERE i.posted_by=p.id AND i.validation_state='validated' AND i.idea_date BETWEEN p_from AND through),
   'suggestions',(SELECT count(*) FROM public.suggestions s WHERE s.posted_by=p.id AND s.validation_state='validated' AND s.suggestion_date BETWEEN p_from AND through),
   'sales',(SELECT count(*) FROM public.sales_logs s WHERE s.sales_by=p.id AND s.validation_state='validated' AND s.sale_date BETWEEN p_from AND through)) AS counts
  FROM people p)
 SELECT coalesce(jsonb_agg(jsonb_build_object('userId',p.id,'name',p.full_name,'role',p.role,
   'days',coalesce(dr.days,'[]'::jsonb),
   'tasks',coalesce(tr.tasks,'{"open":0,"overdue":0,"stale":0,"rotten":0,"done":0,"undated":0}'::jsonb),
   'contributions',cr.counts) ORDER BY p.id),'[]'::jsonb) INTO members
 FROM people p LEFT JOIN day_rows dr ON dr.user_id=p.id LEFT JOIN task_rows tr ON tr.user_id=p.id LEFT JOIN contrib_rows cr ON cr.user_id=p.id;
 RETURN jsonb_build_object('readAt',clock_timestamp(),'from',p_from,'to',p_to,'through',CASE WHEN through>=p_from THEN through END,'today',today,
  'timezone','Asia/Kolkata','holidaySource',holidays.source,'teamHolidays',to_jsonb(holidays.dates),'members',members);
END $$;

-- ---------------------------------------------------------------------------
-- Due work: policy periods that need (re-)evaluation
-- ---------------------------------------------------------------------------
-- For each active policy, the periods in the 62 days up to p_through (default
-- today) since it was created that are: never evaluated; open and not yet
-- evaluated today or evaluated with an older version; closed but evaluated
-- only while open; or touched by an invalidation after their last
-- evaluation. A closed period uses the version in force when it ended.
-- With p_policy ("Evaluate now"), that policy's current and previous period
-- are always returned (since its creation), with the same version rule.
CREATE FUNCTION public.policy_due_work(p_through date DEFAULT NULL,p_limit integer DEFAULT 20,p_policy uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c record; today date:=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date; through date; day_start timestamptz; result jsonb; BEGIN
 SELECT * INTO c FROM taskpulse_private.policy_caller();
 IF NOT c.worker AND c.role<>'managing_director' THEN RAISE EXCEPTION 'Managing director or policy worker required' USING ERRCODE='42501'; END IF;
 through:=coalesce(p_through,today);
 IF NOT isfinite(through) OR through>today THEN RAISE EXCEPTION 'Through date must be today or earlier' USING ERRCODE='23514'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Limit between 1 and 100 required' USING ERRCODE='23514'; END IF;
 IF p_policy IS NOT NULL AND NOT EXISTS(SELECT 1 FROM taskpulse_private.policies WHERE id=p_policy AND organization_id=c.org AND active AND archived_at IS NULL) THEN
  RAISE EXCEPTION 'Active policy not found in your company' USING ERRCODE='23514'; END IF;
 day_start:=(today::timestamp AT TIME ZONE 'Asia/Kolkata');
 WITH pol AS (
  SELECT * FROM taskpulse_private.policies WHERE organization_id=c.org AND active AND archived_at IS NULL),
 cand AS (
  SELECT DISTINCT p.id AS policy_id,pp.period_key,pp.period_start,pp.period_end
  FROM pol p
  CROSS JOIN LATERAL (
   SELECT g.day::date AS day FROM generate_series(greatest((p.created_at AT TIME ZONE 'Asia/Kolkata')::date,through-61),through,interval '1 day') g(day)
   WHERE p_policy IS NULL
   UNION ALL
   SELECT v.day FROM (VALUES (through),((SELECT q.period_start FROM taskpulse_private.policy_period(p.period_kind,through) q)-1)) v(day)
   WHERE p_policy IS NOT NULL AND v.day>=(p.created_at AT TIME ZONE 'Asia/Kolkata')::date) d
  CROSS JOIN LATERAL taskpulse_private.policy_period(p.period_kind,d.day) pp
  WHERE p_policy IS NULL OR p.id=p_policy),
 judged AS (
  SELECT k.*,p.version AS current_version,p.created_at,s.policy_version AS state_version,s.last_evaluated_at,
   k.period_end>=today AS is_open,
   CASE
    WHEN p_policy IS NOT NULL THEN 'requested'
    WHEN s.policy_id IS NULL THEN 'new'
    WHEN k.period_end>=today AND (s.last_evaluated_at<day_start OR s.policy_version<>p.version) THEN 'open'
    WHEN k.period_end<today AND NOT s.final THEN 'closed'
    WHEN EXISTS(SELECT 1 FROM taskpulse_private.policy_invalidations i WHERE i.organization_id=c.org
      AND i.invalidated_at>s.last_evaluated_at AND i.from_date<=k.period_end AND i.to_date>=k.period_start) THEN 'invalidated'
   END AS reason
  FROM cand k JOIN pol p ON p.id=k.policy_id
  LEFT JOIN taskpulse_private.policy_period_states s ON s.policy_id=k.policy_id AND s.period_key=k.period_key),
 due AS (
  SELECT j.*,r.version,r.definition FROM judged j
  CROSS JOIN LATERAL (
   SELECT v.version,v.definition FROM taskpulse_private.policy_revisions v
   WHERE v.policy_id=j.policy_id AND (j.is_open OR v.recorded_at<((j.period_end+1)::timestamp AT TIME ZONE 'Asia/Kolkata'))
   ORDER BY v.version DESC LIMIT 1) r
  WHERE j.reason IS NOT NULL)
 SELECT jsonb_build_object('today',today,'through',through,'remaining',(SELECT count(*) FROM due),
  'items',coalesce((SELECT jsonb_agg(x.item ORDER BY x.period_end,x.created_at,x.policy_id) FROM (
    SELECT d.period_end,d.created_at,d.policy_id,jsonb_build_object('policyId',d.policy_id,'policyVersion',d.version,'definition',d.definition,
     'periodKind',d.definition->>'periodKind','periodKey',d.period_key,'periodStart',d.period_start,'periodEnd',d.period_end,
     'open',d.is_open,'reason',d.reason) AS item
    FROM due d ORDER BY d.period_end,d.created_at,d.policy_id LIMIT p_limit) x),'[]'::jsonb))
 INTO result;
 RETURN result;
END $$;

-- ---------------------------------------------------------------------------
-- The one command
-- ---------------------------------------------------------------------------
--   create / revise / activate / deactivate / archive  managing director
--   record_run      managing director (Evaluate now) or the scoped worker
--   record_failure  managing director or the scoped worker
-- Idempotent per operation: a replay returns the first response; the same
-- operation with different input is a conflict (PT409).
CREATE FUNCTION public.policy_command(p_command text,p_payload jsonb,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c record; akey text; digest text; prior taskpulse_private.policy_receipts; response jsonb;
 today date:=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
 def jsonb; pol taskpulse_private.policies; expected integer; reason text; new_id uuid;
 run_id uuid; trig text; item jsonb; ev jsonb; rev taskpulse_private.policy_revisions; per record; is_final boolean;
 emp uuid; emp_role text; facts_at timestamptz; changed integer:=0; evaluated integer:=0; notified integer:=0; n integer; items integer:=0;
 met integer:=0; not_met integer:=0; unavailable integer:=0; outcome text; badge text; points integer; title text; BEGIN
 SELECT * INTO c FROM taskpulse_private.policy_caller();
 IF p_command IS NULL OR p_command NOT IN ('create','revise','activate','deactivate','archive','record_run','record_failure') THEN
  RAISE EXCEPTION 'Unknown policy command' USING ERRCODE='23514'; END IF;
 IF p_operation IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN
  RAISE EXCEPTION 'Object payload and operation required' USING ERRCODE='23514'; END IF;
 IF c.worker AND p_command NOT IN ('record_run','record_failure') THEN
  RAISE EXCEPTION 'Managing director required' USING ERRCODE='42501'; END IF;
 IF NOT c.worker AND c.role<>'managing_director' THEN
  RAISE EXCEPTION 'Managing director required' USING ERRCODE='42501'; END IF;

 akey:=coalesce(c.actor::text,'service_role');
 digest:=md5(jsonb_build_array(p_command,p_payload)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-policies:'||c.org::text,0));
 SELECT * INTO prior FROM taskpulse_private.policy_receipts WHERE organization_id=c.org AND actor_key=akey AND operation=p_operation;
 IF FOUND THEN
  IF prior.command<>p_command OR prior.request_digest<>digest THEN
   RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN prior.response;
 END IF;

 IF p_command='create' THEN
  def:=taskpulse_private.policy_definition(p_payload);
  IF EXISTS(SELECT 1 FROM taskpulse_private.policies WHERE organization_id=c.org AND archived_at IS NULL AND lower(btrim(name))=lower(def->>'name')) THEN
   RAISE EXCEPTION 'A policy with this name already exists' USING ERRCODE='23514'; END IF;
  INSERT INTO taskpulse_private.policies(organization_id,name,description,template_key,parameters,period_kind,audience,reward,rule_version,active,created_by)
  VALUES(c.org,def->>'name',def->>'description',def->>'templateKey',def->'parameters',def->>'periodKind',def->'audience',def->'reward',def->>'ruleVersion',
   coalesce(CASE WHEN jsonb_typeof(p_payload->'active')='boolean' THEN (p_payload->>'active')::boolean END,true),c.actor)
  RETURNING * INTO pol;
  INSERT INTO taskpulse_private.policy_revisions(policy_id,organization_id,version,command,definition,actor_id)
  VALUES(pol.id,c.org,1,'create',def||jsonb_build_object('active',pol.active),c.actor);
  response:=jsonb_build_object('policyId',pol.id,'version',1,'active',pol.active);

 ELSIF p_command IN ('revise','activate','deactivate','archive') THEN
  IF coalesce(p_payload->>'policyId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR jsonb_typeof(p_payload->'expectedVersion')<>'number' THEN
   RAISE EXCEPTION 'Policy and expected version required' USING ERRCODE='23514'; END IF;
  expected:=(p_payload->>'expectedVersion')::integer;
  reason:=nullif(btrim(coalesce(p_payload->>'reason','')),'');
  IF length(reason)>300 THEN RAISE EXCEPTION 'The reason is limited to 300 characters' USING ERRCODE='23514'; END IF;
  SELECT * INTO pol FROM taskpulse_private.policies WHERE id=(p_payload->>'policyId')::uuid AND organization_id=c.org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Policy not found in your company' USING ERRCODE='42501'; END IF;
  IF pol.version<>expected THEN RAISE EXCEPTION 'The policy changed; refresh and try again' USING ERRCODE='PT409'; END IF;
  IF pol.archived_at IS NOT NULL THEN RAISE EXCEPTION 'An archived policy cannot be changed' USING ERRCODE='23514'; END IF;
  IF p_command='revise' THEN
   def:=taskpulse_private.policy_definition(p_payload-'policyId'-'expectedVersion'-'reason'-'active');
   IF EXISTS(SELECT 1 FROM taskpulse_private.policies WHERE organization_id=c.org AND archived_at IS NULL AND id<>pol.id AND lower(btrim(name))=lower(def->>'name')) THEN
    RAISE EXCEPTION 'A policy with this name already exists' USING ERRCODE='23514'; END IF;
   UPDATE taskpulse_private.policies SET name=def->>'name',description=def->>'description',template_key=def->>'templateKey',parameters=def->'parameters',
    period_kind=def->>'periodKind',audience=def->'audience',reward=def->'reward',rule_version=def->>'ruleVersion',version=version+1,updated_at=clock_timestamp()
   WHERE id=pol.id RETURNING * INTO pol;
  ELSE
   UPDATE taskpulse_private.policies SET active=(p_command='activate'),archived_at=CASE WHEN p_command='archive' THEN clock_timestamp() END,
    version=version+1,updated_at=clock_timestamp()
   WHERE id=pol.id RETURNING * INTO pol;
  END IF;
  INSERT INTO taskpulse_private.policy_revisions(policy_id,organization_id,version,command,definition,reason,actor_id)
  VALUES(pol.id,c.org,pol.version,p_command,jsonb_build_object('name',pol.name,'description',pol.description,'templateKey',pol.template_key,
   'parameters',pol.parameters,'periodKind',pol.period_kind,'audience',pol.audience,'reward',pol.reward,'ruleVersion',pol.rule_version,'active',pol.active),
   reason,c.actor);
  response:=jsonb_build_object('policyId',pol.id,'version',pol.version,'active',pol.active,'archived',pol.archived_at IS NOT NULL);

 ELSIF p_command='record_run' THEN
  trig:=coalesce(p_payload->>'trigger','');
  IF trig NOT IN ('nightly','on_demand','invalidation') OR (NOT c.worker AND trig<>'on_demand') OR (c.worker AND trig='on_demand') THEN
   RAISE EXCEPTION 'Trigger must be nightly or invalidation for the worker, on_demand for the managing director' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(p_payload->'items')<>'array' OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 50 THEN
   RAISE EXCEPTION 'Between 1 and 50 evaluated periods required' USING ERRCODE='23514'; END IF;
  INSERT INTO taskpulse_private.policy_runs(organization_id,trigger,status,actor_id,operation)
  VALUES(c.org,trig,'completed',c.actor,p_operation) RETURNING id INTO run_id;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
   items:=items+1;
   IF jsonb_typeof(item)<>'object' OR coalesce(item->>'policyId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR jsonb_typeof(item->'policyVersion')<>'number' OR jsonb_typeof(item->'evaluations')<>'array'
    OR jsonb_array_length(item->'evaluations')>500 OR jsonb_typeof(item->'final')<>'boolean' THEN
    RAISE EXCEPTION 'Each item needs a policy, version, final flag and at most 500 evaluations' USING ERRCODE='23514'; END IF;
   SELECT v.* INTO rev FROM taskpulse_private.policy_revisions v JOIN taskpulse_private.policies p ON p.id=v.policy_id
   WHERE v.policy_id=(item->>'policyId')::uuid AND v.version=(item->>'policyVersion')::integer AND p.organization_id=c.org;
   IF NOT FOUND THEN RAISE EXCEPTION 'Policy version not found in your company' USING ERRCODE='42501'; END IF;
   BEGIN
    SELECT * INTO per FROM taskpulse_private.policy_period(rev.definition->>'periodKind',(item->>'periodStart')::date);
   EXCEPTION WHEN others THEN per:=NULL; END;
   IF per IS NULL OR per.period_key IS DISTINCT FROM item->>'periodKey' OR per.period_start::text IS DISTINCT FROM item->>'periodStart'
    OR per.period_end::text IS DISTINCT FROM item->>'periodEnd' THEN
    RAISE EXCEPTION 'Period key and bounds do not match the policy period' USING ERRCODE='23514'; END IF;
   IF per.period_start>today OR per.period_end<today-61 THEN
    RAISE EXCEPTION 'Only periods within the last 62 days can be evaluated' USING ERRCODE='23514'; END IF;
   is_final:=per.period_end<today;
   IF (item->>'final')::boolean<>is_final THEN
    RAISE EXCEPTION 'The period opened or closed since it was evaluated; evaluate again' USING ERRCODE='PT409'; END IF;
   -- When the evaluator read its facts: an input changed after that stays due.
   BEGIN facts_at:=(item->>'factsAt')::timestamptz; EXCEPTION WHEN others THEN facts_at:=NULL; END;
   facts_at:=CASE WHEN facts_at IS NULL OR NOT isfinite(facts_at) OR facts_at>clock_timestamp() THEN clock_timestamp()
    ELSE greatest(facts_at,clock_timestamp()-interval '1 hour') END;
   badge:=rev.definition->'reward'->>'badge'; points:=(rev.definition->'reward'->>'points')::integer;
   FOR ev IN SELECT value FROM jsonb_array_elements(item->'evaluations') LOOP
    outcome:=ev->>'outcome';
    IF jsonb_typeof(ev)<>'object' OR coalesce(ev->>'employeeId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR outcome IS NULL OR outcome NOT IN ('met','not_met','unavailable')
     OR jsonb_typeof(coalesce(ev->'reasons','[]'))<>'array' OR jsonb_array_length(coalesce(ev->'reasons','[]'))>20
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(ev->'reasons','[]')) r WHERE jsonb_typeof(r)<>'object' OR octet_length(r::text)>500)
     OR jsonb_typeof(coalesce(ev->'evidence','{}'))<>'object' OR octet_length(coalesce(ev->'evidence','{}')::text)>8192 THEN
     RAISE EXCEPTION 'Each evaluation needs a member, an outcome, up to 20 reasons and evidence under 8 KB' USING ERRCODE='23514'; END IF;
    emp:=(ev->>'employeeId')::uuid;
    SELECT u.role::text INTO emp_role FROM public.users u WHERE u.id=emp AND u.is_active AND u.organization_id=c.org;
    IF NOT FOUND THEN RAISE EXCEPTION 'Active member of your company required' USING ERRCODE='42501'; END IF;
    IF NOT taskpulse_private.policy_audience_includes(rev.definition->'audience',emp,emp_role) THEN
     RAISE EXCEPTION 'The member is not in this policy''s audience' USING ERRCODE='23514'; END IF;
    evaluated:=evaluated+1;
    IF outcome='met' THEN met:=met+1; ELSIF outcome='not_met' THEN not_met:=not_met+1; ELSE unavailable:=unavailable+1; END IF;
    INSERT INTO taskpulse_private.policy_evaluations AS e(organization_id,policy_id,policy_version,period_kind,period_key,period_start,period_end,
     employee_id,outcome,final,reasons,evidence,commended_at,run_id)
    VALUES(c.org,rev.policy_id,rev.version,rev.definition->>'periodKind',per.period_key,per.period_start,per.period_end,emp,outcome,is_final,
     coalesce(ev->'reasons','[]'),coalesce(ev->'evidence','{}'),CASE WHEN is_final AND outcome='met' THEN clock_timestamp() END,run_id)
    ON CONFLICT (policy_id,period_key,employee_id) DO UPDATE SET policy_version=EXCLUDED.policy_version,outcome=EXCLUDED.outcome,final=EXCLUDED.final,
     reasons=EXCLUDED.reasons,evidence=EXCLUDED.evidence,previous_outcome=e.outcome,evaluated_at=clock_timestamp(),run_id=EXCLUDED.run_id,
     commended_at=coalesce(e.commended_at,EXCLUDED.commended_at)
    WHERE (e.policy_version,e.outcome,e.final,e.reasons,e.evidence) IS DISTINCT FROM (EXCLUDED.policy_version,EXCLUDED.outcome,EXCLUDED.final,EXCLUDED.reasons,EXCLUDED.evidence);
    GET DIAGNOSTICS n=ROW_COUNT; changed:=changed+n;
    IF is_final AND outcome='met' THEN
     title:=left('Commendation: '||(rev.definition->>'name'),140);
     INSERT INTO taskpulse_private.notifications(organization_id,recipient_id,kind,title,body,href,dedupe_key)
     VALUES(c.org,emp,'policy_met',title,
      left(format('You met "%s" for %s and earned the %s badge%s.',rev.definition->>'name',per.period_key,badge,
       CASE WHEN points>0 THEN format(' and %s recognition points',points) ELSE '' END),500),
      '/policies','policy_met:'||rev.policy_id||':'||per.period_key)
     ON CONFLICT (recipient_id,dedupe_key) DO NOTHING;
     GET DIAGNOSTICS n=ROW_COUNT; notified:=notified+n;
    END IF;
   END LOOP;
   INSERT INTO taskpulse_private.policy_period_states AS s(policy_id,period_key,organization_id,period_start,period_end,policy_version,final,last_evaluated_at,run_id)
   VALUES(rev.policy_id,per.period_key,c.org,per.period_start,per.period_end,rev.version,is_final,facts_at,run_id)
   ON CONFLICT (policy_id,period_key) DO UPDATE SET policy_version=EXCLUDED.policy_version,final=EXCLUDED.final,
    last_evaluated_at=EXCLUDED.last_evaluated_at,run_id=EXCLUDED.run_id;
  END LOOP;
  DELETE FROM taskpulse_private.policy_invalidations WHERE organization_id=c.org AND to_date<today-70;
  response:=jsonb_build_object('runId',run_id,'status','completed','periods',items,'evaluated',evaluated,'changed',changed,'notified',notified,
   'met',met,'notMet',not_met,'unavailable',unavailable);
  UPDATE taskpulse_private.policy_runs SET summary=response-'runId'-'status' WHERE id=run_id;

 ELSE -- record_failure
  trig:=coalesce(p_payload->>'trigger','');
  IF trig NOT IN ('nightly','on_demand','invalidation') OR coalesce(p_payload->>'errorCode','') !~ '^[a-z0-9_]{1,60}$'
   OR length(coalesce(p_payload->>'errorDetail',''))>500 THEN
   RAISE EXCEPTION 'Trigger, error code and a detail of at most 500 characters required' USING ERRCODE='23514'; END IF;
  INSERT INTO taskpulse_private.policy_runs(organization_id,trigger,status,actor_id,summary,error_code,error_detail,operation)
  VALUES(c.org,trig,'failed',c.actor,jsonb_build_object('periods',coalesce(p_payload->'periods','[]'::jsonb)),p_payload->>'errorCode',
   nullif(p_payload->>'errorDetail',''),p_operation)
  RETURNING id INTO run_id;
  INSERT INTO taskpulse_private.notifications(organization_id,recipient_id,kind,title,body,href,dedupe_key)
  SELECT c.org,u.id,'policy_run_failed','Policy evaluation failed',
   left('Policies could not be evaluated ('||(p_payload->>'errorCode')||'). Open Policies to see the run and evaluate again.',500),
   '/policies','policy_run_failed:'||today
  FROM public.users u WHERE u.organization_id=c.org AND u.is_active AND u.role='managing_director'
  ON CONFLICT (recipient_id,dedupe_key) DO NOTHING;
  GET DIAGNOSTICS notified=ROW_COUNT;
  response:=jsonb_build_object('runId',run_id,'status','failed','notified',notified);
 END IF;

 INSERT INTO taskpulse_private.policy_receipts(organization_id,actor_key,operation,command,request_digest,response)
 VALUES(c.org,akey,p_operation,p_command,digest,response);
 RETURN response;
END $$;

-- ---------------------------------------------------------------------------
-- Reads for the Policies page
-- ---------------------------------------------------------------------------
-- Managers see every live policy with this period's counts; members see the
-- active policies that apply to them. Everyone gets their own status.
CREATE FUNCTION public.policy_list() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c record; manager boolean; today date:=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date; result jsonb; BEGIN
 SELECT * INTO c FROM taskpulse_private.policy_caller();
 IF c.worker THEN RAISE EXCEPTION 'Signed-in account required' USING ERRCODE='42501'; END IF;
 manager:=c.role IN ('managing_director','project_engineer');
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'name',p.name,'description',p.description,'templateKey',p.template_key,'parameters',p.parameters,'periodKind',p.period_kind,
   'audience',CASE WHEN manager THEN p.audience ELSE jsonb_build_object('kind',p.audience->>'kind') END,
   'reward',p.reward,'ruleVersion',p.rule_version,'active',p.active,'version',p.version,'createdAt',p.created_at,'updatedAt',p.updated_at,
   'appliesToMe',taskpulse_private.policy_audience_includes(p.audience,c.actor,c.role),
   'period',jsonb_build_object('key',pp.period_key,'start',pp.period_start,'end',pp.period_end),
   'lastEvaluatedAt',s.last_evaluated_at,
   'counts',CASE WHEN manager THEN (SELECT jsonb_build_object('met',count(*) FILTER (WHERE e.outcome='met'),
     'notMet',count(*) FILTER (WHERE e.outcome='not_met'),'unavailable',count(*) FILTER (WHERE e.outcome='unavailable'))
     FROM taskpulse_private.policy_evaluations e WHERE e.policy_id=p.id AND e.period_key=pp.period_key) END,
   'mine',(SELECT jsonb_build_object('outcome',e.outcome,'final',e.final,'reasons',e.reasons,'evaluatedAt',e.evaluated_at)
     FROM taskpulse_private.policy_evaluations e WHERE e.policy_id=p.id AND e.period_key=pp.period_key AND e.employee_id=c.actor))
  ORDER BY p.active DESC,lower(p.name)),'[]'::jsonb) INTO result
 FROM taskpulse_private.policies p
 CROSS JOIN LATERAL taskpulse_private.policy_period(p.period_kind,today) pp
 LEFT JOIN taskpulse_private.policy_period_states s ON s.policy_id=p.id AND s.period_key=pp.period_key
 WHERE p.organization_id=c.org AND p.archived_at IS NULL
  AND (manager OR (p.active AND taskpulse_private.policy_audience_includes(p.audience,c.actor,c.role)));
 RETURN jsonb_build_object('today',today,'canManage',c.role='managing_director','isManager',manager,'policies',result);
END $$;

-- One policy's evaluations: managers see everyone's, members only their own.
CREATE FUNCTION public.policy_evaluations_read(p_policy uuid,p_period_key text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c record; manager boolean; result jsonb; BEGIN
 SELECT * INTO c FROM taskpulse_private.policy_caller();
 IF c.worker THEN RAISE EXCEPTION 'Signed-in account required' USING ERRCODE='42501'; END IF;
 manager:=c.role IN ('managing_director','project_engineer');
 IF NOT EXISTS(SELECT 1 FROM taskpulse_private.policies p WHERE p.id=p_policy AND p.organization_id=c.org AND p.archived_at IS NULL
   AND (manager OR (p.active AND taskpulse_private.policy_audience_includes(p.audience,c.actor,c.role)))) THEN
  RAISE EXCEPTION 'Policy not found in your company' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('employeeId',e.employee_id,'name',u.full_name,'periodKey',e.period_key,'periodStart',e.period_start,
   'periodEnd',e.period_end,'policyVersion',e.policy_version,'outcome',e.outcome,'final',e.final,'reasons',e.reasons,'evidence',e.evidence,
   'previousOutcome',e.previous_outcome,'commendedAt',e.commended_at,'withdrawn',e.commended_at IS NOT NULL AND e.outcome<>'met',
   'evaluatedAt',e.evaluated_at) ORDER BY e.period_end DESC,u.full_name,e.employee_id),'[]'::jsonb) INTO result
 FROM (SELECT * FROM taskpulse_private.policy_evaluations e WHERE e.policy_id=p_policy
   AND (p_period_key IS NULL OR e.period_key=p_period_key) AND (manager OR e.employee_id=c.actor)
   ORDER BY e.period_end DESC LIMIT 1000) e
 JOIN public.users u ON u.id=e.employee_id;
 RETURN jsonb_build_object('policyId',p_policy,'periodKey',p_period_key,'evaluations',result);
END $$;

-- The latest runs, for managers.
CREATE FUNCTION public.policy_runs_read(p_limit integer DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c record; result jsonb; BEGIN
 SELECT * INTO c FROM taskpulse_private.policy_caller();
 IF c.worker OR c.role NOT IN ('managing_director','project_engineer') THEN RAISE EXCEPTION 'Manager authority required' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Limit between 1 and 100 required' USING ERRCODE='23514'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'trigger',r.trigger,'status',r.status,'actorId',r.actor_id,'summary',r.summary,
   'errorCode',r.error_code,'errorDetail',r.error_detail,'recordedAt',r.recorded_at) ORDER BY r.recorded_at DESC,r.id),'[]'::jsonb) INTO result
 FROM (SELECT * FROM taskpulse_private.policy_runs WHERE organization_id=c.org ORDER BY recorded_at DESC,id LIMIT p_limit) r;
 RETURN jsonb_build_object('runs',result);
END $$;

-- Commendations (final "met" evaluations) whose period ended in a date range
-- (NULL = unbounded), for the ceremony, the hall of fame and "My
-- commendations". Public within the company, like the ceremony: no evidence.
-- Badge and points are those of the evaluated policy version.
CREATE FUNCTION public.policy_commendations(p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_employee uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c record; result jsonb; BEGIN
 SELECT * INTO c FROM taskpulse_private.policy_caller();
 IF c.worker THEN RAISE EXCEPTION 'Signed-in account required' USING ERRCODE='42501'; END IF;
 IF (p_from IS NOT NULL AND NOT isfinite(p_from)) OR (p_to IS NOT NULL AND NOT isfinite(p_to)) OR p_to<p_from THEN
  RAISE EXCEPTION 'A valid date range is required' USING ERRCODE='23514'; END IF;
 IF p_employee IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_employee AND u.organization_id=c.org) THEN
  RAISE EXCEPTION 'A member of your company is required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('policyId',e.policy_id,'policyName',v.definition->>'name','badge',v.definition->'reward'->>'badge',
   'points',(v.definition->'reward'->>'points')::integer,'periodKind',e.period_kind,'periodKey',e.period_key,'periodStart',e.period_start,
   'periodEnd',e.period_end,'employeeId',e.employee_id,'name',u.full_name,'commendedAt',e.commended_at)
   ORDER BY e.period_end DESC,v.definition->>'name',u.full_name,e.employee_id),'[]'::jsonb) INTO result
 FROM taskpulse_private.policy_evaluations e
 JOIN taskpulse_private.policy_revisions v ON v.policy_id=e.policy_id AND v.version=e.policy_version
 JOIN public.users u ON u.id=e.employee_id
 WHERE e.organization_id=c.org AND e.final AND e.outcome='met'
  AND (p_from IS NULL OR e.period_end>=p_from) AND (p_to IS NULL OR e.period_end<=p_to)
  AND (p_employee IS NULL OR e.employee_id=p_employee);
 RETURN jsonb_build_object('commendations',result);
END $$;

-- ---------------------------------------------------------------------------
-- Notifications (self only)
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.notifications_list(p_limit integer DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c record; result jsonb; BEGIN
 SELECT * INTO c FROM taskpulse_private.policy_caller();
 IF c.worker THEN RAISE EXCEPTION 'Signed-in account required' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Limit between 1 and 50 required' USING ERRCODE='23514'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'kind',n.kind,'title',n.title,'body',n.body,'href',n.href,'createdAt',n.created_at,'readAt',n.read_at)
   ORDER BY n.created_at DESC,n.id),'[]'::jsonb) INTO result
 FROM (SELECT * FROM taskpulse_private.notifications WHERE recipient_id=c.actor AND organization_id=c.org ORDER BY created_at DESC,id LIMIT p_limit) n;
 RETURN jsonb_build_object('unread',(SELECT count(*) FROM taskpulse_private.notifications WHERE recipient_id=c.actor AND organization_id=c.org AND read_at IS NULL),
  'items',result);
END $$;

CREATE FUNCTION public.notifications_unread_count() RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c record; BEGIN
 SELECT * INTO c FROM taskpulse_private.policy_caller();
 IF c.worker THEN RAISE EXCEPTION 'Signed-in account required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT count(*) FROM taskpulse_private.notifications WHERE recipient_id=c.actor AND organization_id=c.org AND read_at IS NULL);
END $$;

-- Marks the caller's notifications read (NULL = all unread); returns how many changed.
CREATE FUNCTION public.notifications_mark_read(p_ids uuid[] DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c record; n integer; BEGIN
 SELECT * INTO c FROM taskpulse_private.policy_caller();
 IF c.worker THEN RAISE EXCEPTION 'Signed-in account required' USING ERRCODE='42501'; END IF;
 IF p_ids IS NOT NULL AND cardinality(p_ids)>200 THEN RAISE EXCEPTION 'At most 200 notifications at once' USING ERRCODE='23514'; END IF;
 UPDATE taskpulse_private.notifications SET read_at=clock_timestamp()
 WHERE recipient_id=c.actor AND organization_id=c.org AND read_at IS NULL AND (p_ids IS NULL OR id=ANY(p_ids));
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END $$;

-- ---------------------------------------------------------------------------
-- Invalidations
-- ---------------------------------------------------------------------------
-- A retained input change (attendance, effort logs, contributions, sales) on
-- its business date. Nothing is recorded for a company without live policies.
CREATE FUNCTION taskpulse_private.policy_invalidate_input() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE key text; day date; BEGIN
 key:=CASE NEW.kind WHEN 'attendance' THEN 'attendance_date' WHEN 'fact' THEN 'fact_date' WHEN 'idea' THEN 'idea_date'
  WHEN 'suggestion' THEN 'suggestion_date' WHEN 'sale' THEN 'sale_date' WHEN 'effort' THEN 'log_date' END;
 IF key IS NULL OR NEW.organization_id IS NULL OR NEW.command='legacy_current_baseline' THEN RETURN NULL; END IF;
 BEGIN day:=(NEW.source->>key)::date; EXCEPTION WHEN others THEN RETURN NULL; END;
 IF day IS NULL OR NOT EXISTS(SELECT 1 FROM taskpulse_private.policies p WHERE p.organization_id=NEW.organization_id AND p.active) THEN RETURN NULL; END IF;
 INSERT INTO taskpulse_private.policy_invalidations(organization_id,from_date,to_date,source) VALUES(NEW.organization_id,day,day,NEW.kind);
 RETURN NULL;
END $$;
CREATE TRIGGER zz_m56_policy_invalidation AFTER INSERT ON taskpulse_private.input_history FOR EACH ROW
 EXECUTE FUNCTION taskpulse_private.policy_invalidate_input();

-- A mission's dates, discarded state, assignee or archive changed: every day
-- from the earliest changed date to today may now count it differently at a
-- period end. Task counts are rebuilt from dates, so only a change into or out
-- of Discarded matters among statuses (and the nightly freshness decay, which
-- writes only `freshness`, records nothing).
CREATE FUNCTION taskpulse_private.policy_invalidate_task() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE today date:=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date; first_day date; BEGIN
 IF NOT EXISTS(SELECT 1 FROM taskpulse_private.policies p WHERE p.organization_id=NEW.organization_id AND p.active) THEN RETURN NULL; END IF;
 first_day:=least(
  CASE WHEN OLD.due_date IS DISTINCT FROM NEW.due_date THEN least(OLD.due_date,NEW.due_date) END,
  CASE WHEN OLD.completed_date IS DISTINCT FROM NEW.completed_date THEN least(OLD.completed_date,NEW.completed_date) END,
  CASE WHEN OLD.assigned_date IS DISTINCT FROM NEW.assigned_date THEN least(OLD.assigned_date,NEW.assigned_date) END,
  CASE WHEN OLD.archived_effective_date IS DISTINCT FROM NEW.archived_effective_date THEN least(OLD.archived_effective_date,NEW.archived_effective_date) END,
  CASE WHEN OLD.assignee_id IS DISTINCT FROM NEW.assignee_id OR (OLD.status='Discarded') IS DISTINCT FROM (NEW.status='Discarded') THEN today-61 END);
 IF first_day IS NULL THEN RETURN NULL; END IF;
 first_day:=greatest(first_day,today-61);
 IF first_day>today THEN RETURN NULL; END IF;
 INSERT INTO taskpulse_private.policy_invalidations(organization_id,from_date,to_date,source) VALUES(NEW.organization_id,first_day,today,'task');
 RETURN NULL;
END $$;
CREATE TRIGGER zz_m56_policy_task_invalidation AFTER UPDATE OF status,due_date,completed_date,assigned_date,assignee_id,archived_effective_date ON public.tasks
 FOR EACH ROW WHEN ((OLD.status='Discarded',OLD.due_date,OLD.completed_date,OLD.assigned_date,OLD.assignee_id,OLD.archived_effective_date)
  IS DISTINCT FROM (NEW.status='Discarded',NEW.due_date,NEW.completed_date,NEW.assigned_date,NEW.assignee_id,NEW.archived_effective_date))
 EXECUTE FUNCTION taskpulse_private.policy_invalidate_task();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
REVOKE ALL ON taskpulse_private.policies,taskpulse_private.policy_revisions,taskpulse_private.policy_runs,taskpulse_private.policy_evaluations,
 taskpulse_private.policy_period_states,taskpulse_private.policy_invalidations,taskpulse_private.policy_receipts,taskpulse_private.notifications
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION taskpulse_private.policy_period(text,date),taskpulse_private.policy_audience_includes(jsonb,uuid,text),
 taskpulse_private.policy_definition(jsonb),taskpulse_private.policy_caller(),taskpulse_private.policy_team_holidays(uuid,date,date),
 taskpulse_private.policy_invalidate_input(),taskpulse_private.policy_invalidate_task() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.policy_period_facts(date,date,uuid),public.policy_due_work(date,integer,uuid),public.policy_command(text,jsonb,uuid),
 public.policy_list(),public.policy_evaluations_read(uuid,text),public.policy_runs_read(integer),public.policy_commendations(date,date,uuid),
 public.notifications_list(integer),public.notifications_unread_count(),public.notifications_mark_read(uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.policy_period_facts(date,date,uuid),public.policy_due_work(date,integer,uuid),public.policy_command(text,jsonb,uuid),
 public.policy_list(),public.policy_evaluations_read(uuid,text),public.policy_runs_read(integer),public.policy_commendations(date,date,uuid),
 public.notifications_list(integer),public.notifications_unread_count(),public.notifications_mark_read(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.policy_period_facts(date,date,uuid),public.policy_due_work(date,integer,uuid),public.policy_command(text,jsonb,uuid) TO service_role;

SELECT taskpulse_private.m15_secure();
COMMIT;
