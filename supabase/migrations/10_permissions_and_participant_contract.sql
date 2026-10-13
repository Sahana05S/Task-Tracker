-- M01: forward-only security boundary. No historical credit/score conversion.
BEGIN;
CREATE SCHEMA taskpulse_private;
REVOKE ALL ON SCHEMA taskpulse_private FROM PUBLIC, anon, authenticated, service_role;
REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE taskpulse_private.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid, actor_role text, command text NOT NULL, table_name text NOT NULL,
  row_id uuid, changed_fields text[] NOT NULL, protected_changes jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE taskpulse_private.command_receipts (
  actor_id uuid NOT NULL, operation_id uuid NOT NULL, request jsonb NOT NULL,
  result uuid NOT NULL, PRIMARY KEY(actor_id, operation_id)
);
ALTER TABLE public.tasks
  ADD COLUMN participant_credit_mode text NOT NULL DEFAULT 'legacy'
    CHECK (participant_credit_mode IN ('legacy', 'configured')),
  ADD COLUMN participant_version bigint NOT NULL DEFAULT 0;
ALTER TABLE public.task_assignees ADD COLUMN share_units integer
  CHECK (share_units BETWEEN 0 AND 1000000);
ALTER TABLE public.task_reviewers ADD COLUMN review_approved boolean;

CREATE OR REPLACE FUNCTION public.get_user_role() RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role FROM public.users WHERE id = auth.uid() AND is_active;
$$;
CREATE FUNCTION public.is_task_assignee(p_task_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.get_user_role() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tasks t WHERE t.id=p_task_id AND
      (t.assignee_id=auth.uid() OR EXISTS (SELECT 1 FROM public.task_assignees a
        WHERE a.task_id=t.id AND a.user_id=auth.uid())));
$$;
CREATE FUNCTION public.can_read_employee_details(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.get_user_role() IS NOT NULL AND
    (auth.uid()=p_user_id OR public.get_user_role() IN ('managing_director','project_engineer'));
$$;

-- Remove old permissive policies; do not let them OR around this contract.
DO $$ DECLARE r record; c record; t text; read_rule text; write_rule text; BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename IN ('users','tasks','daily_task_logs','monthly_performance_snapshots','company_statements','company_milestones','task_assignees','task_reviewers','task_dependencies','task_detail_sections','task_links','checklist_templates','checklist_template_nodes','task_checklists','checklist_nodes','task_timers','attendance_records','daily_star_records','performance_score_components','meeting_points','daily_facts','ideas','suggestions','sales_logs','report_snapshots')
    LOOP EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename); END LOOP;
  FOR t IN SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename IN ('users','tasks','daily_task_logs','monthly_performance_snapshots','company_statements','company_milestones','task_assignees','task_reviewers','task_dependencies','task_detail_sections','task_links','checklist_templates','checklist_template_nodes','task_checklists','checklist_nodes','task_timers','attendance_records','daily_star_records','performance_score_components','meeting_points','daily_facts','ideas','suggestions','sales_logs','report_snapshots') LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role',t);
    FOR c IN SELECT attname FROM pg_catalog.pg_attribute WHERE attrelid=format('public.%I',t)::regclass AND attnum>0 AND NOT attisdropped LOOP
      EXECUTE format('REVOKE ALL (%I) ON public.%I FROM PUBLIC,anon,authenticated,service_role',c.attname,t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
    read_rule := 'public.get_user_role() IS NOT NULL';
    IF t IN ('daily_task_logs','task_timers','attendance_records','monthly_performance_snapshots','performance_score_components') THEN
      read_rule := 'public.can_read_employee_details(user_id)';
    ELSIF t='report_snapshots' THEN read_rule := 'public.can_read_employee_details(employee_id)';
    ELSIF t='users' THEN read_rule := '(id=auth.uid() OR public.get_user_role() IS NOT NULL)'; END IF;
    EXECUTE format('CREATE POLICY m01_read ON public.%I FOR SELECT TO authenticated USING (%s)',t,read_rule);
    IF t IN ('task_assignees','task_reviewers') THEN CONTINUE; END IF;
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.%I TO authenticated',t);
    write_rule := 'public.get_user_role() IN (''managing_director'',''project_engineer'')';
    IF t IN ('users','monthly_performance_snapshots','daily_star_records','performance_score_components','report_snapshots') THEN
      write_rule := 'public.get_user_role() = ''managing_director''';
    ELSIF t IN ('meeting_points','daily_facts','ideas','suggestions','sales_logs') THEN
      write_rule := 'public.get_user_role() IN (''managing_director'',''project_engineer'',''data_manager'')'; END IF;
    EXECUTE format('CREATE POLICY m01_admin ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',t,write_rule,write_rule);
  END LOOP;
END $$;
CREATE POLICY m01_self_profile ON public.users FOR UPDATE TO authenticated
 USING (id=auth.uid() AND public.get_user_role() IS NOT NULL) WITH CHECK (id=auth.uid());
CREATE POLICY m01_execution ON public.tasks FOR UPDATE TO authenticated
 USING (public.is_task_assignee(id)) WITH CHECK (public.is_task_assignee(id));
CREATE POLICY m01_check_completion ON public.checklist_nodes FOR UPDATE TO authenticated
 USING (EXISTS (SELECT 1 FROM public.task_checklists c WHERE c.id=checklist_id AND public.is_task_assignee(c.task_id)))
 WITH CHECK (EXISTS (SELECT 1 FROM public.task_checklists c WHERE c.id=checklist_id AND public.is_task_assignee(c.task_id)));
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['daily_task_logs','task_timers'] LOOP
    EXECUTE format('CREATE POLICY m01_own_work ON public.%I FOR ALL TO authenticated USING
      (user_id=auth.uid() AND public.is_task_assignee(task_id)) WITH CHECK
      (user_id=auth.uid() AND public.is_task_assignee(task_id))',t);
  END LOOP;
END $$;
CREATE POLICY m01_own_attendance ON public.attendance_records FOR ALL TO authenticated
 USING (user_id=auth.uid() AND public.get_user_role() IS NOT NULL)
 WITH CHECK (user_id=auth.uid() AND public.get_user_role() IS NOT NULL);
DO $$ DECLARE t text; col text; BEGIN
  FOREACH t IN ARRAY ARRAY['meeting_points','daily_facts','ideas','suggestions','sales_logs'] LOOP
    col := CASE WHEN t='sales_logs' THEN 'sales_by' ELSE 'posted_by' END;
    EXECUTE format('CREATE POLICY m01_own_support_insert ON public.%I FOR INSERT TO authenticated
      WITH CHECK (%I=auth.uid() AND public.get_user_role() IS NOT NULL)',t,col);
  END LOOP;
END $$;

-- Invoker trigger: only the table owner can bypass field guards (trusted
-- definer commands/provisioning), never a browser-set GUC or a supplied actor.
CREATE FUNCTION taskpulse_private.guard_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE role public.user_role; manager boolean; allowed text[]; n jsonb; o jsonb; owner_name name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(relowner) INTO owner_name FROM pg_catalog.pg_class WHERE oid=TG_RELID;
  IF current_user=owner_name THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  role := public.get_user_role();
  IF role IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
  manager := role IN ('managing_director','project_engineer');
  IF TG_OP='DELETE' THEN
    IF TG_TABLE_NAME='report_snapshots' AND role<>'managing_director' AND to_jsonb(OLD)->>'status'='Final' THEN
      RAISE EXCEPTION 'Only director can delete closed reports' USING ERRCODE='42501'; END IF;
    RETURN OLD;
  END IF;
  n := to_jsonb(NEW); o := CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  IF EXISTS(SELECT 1 FROM unnest(ARRAY['created_by','updated_by','assigned_by']) k
    WHERE n->>k IS NOT NULL AND (TG_OP='INSERT' OR n->k IS DISTINCT FROM o->k) AND (n->>k)::uuid<>auth.uid()) THEN
    RAISE EXCEPTION 'Cannot forge command actor' USING ERRCODE='42501'; END IF;
  IF TG_TABLE_NAME='tasks' THEN
    IF TG_OP='INSERT' THEN
      IF NEW.status IN ('Done','Discarded') THEN
        RAISE EXCEPTION 'Terminal lifecycle creation awaits D07/D12 approval' USING ERRCODE='23514'; END IF;
      IF NOT manager OR NEW.participant_credit_mode<>'legacy' OR NEW.participant_version<>0 OR
        NEW.task_productivity IS DISTINCT FROM 0::numeric OR NEW.freshness<>'Fresh' THEN
        RAISE EXCEPTION 'Protected task fields' USING ERRCODE='42501'; END IF;
      -- Preserve legacy creation eligibility; no scoring rule is introduced.
    ELSE
      IF NEW.status IS DISTINCT FROM OLD.status AND (NEW.status IN ('Done','Discarded') OR OLD.status IN ('Done','Discarded')) THEN
        RAISE EXCEPTION 'Completion, discard and reopening await D07 approval' USING ERRCODE='23514'; END IF;
      IF NEW.id<>OLD.id THEN
        RAISE EXCEPTION 'Immutable task identity' USING ERRCODE='42501'; END IF;
      IF (n->'task_productivity',n->'valid_for_metrics',n->'freshness',n->'participant_credit_mode',
          n->'participant_version',n->'assignee_id',n->'reviewer_id') IS DISTINCT FROM
         (o->'task_productivity',o->'valid_for_metrics',o->'freshness',o->'participant_credit_mode',
          o->'participant_version',o->'assignee_id',o->'reviewer_id') THEN
        RAISE EXCEPTION 'Use an authorized task command for protected fields' USING ERRCODE='42501'; END IF;
      IF NOT manager THEN
        allowed := ARRAY['progress_percentage','status','updated_at','scaled_progress'];
        IF n-allowed IS DISTINCT FROM o-allowed THEN RAISE EXCEPTION 'Assignee execution fields only' USING ERRCODE='42501'; END IF;
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME='users' AND role<>'managing_director' THEN
    IF TG_OP<>'UPDATE' OR n-ARRAY['full_name','email','updated_at'] IS DISTINCT FROM o-ARRAY['full_name','email','updated_at'] THEN
      RAISE EXCEPTION 'Profile privileges cannot be changed' USING ERRCODE='42501'; END IF;
  ELSIF TG_TABLE_NAME='checklist_nodes' THEN
    IF NOT manager AND (TG_OP<>'UPDATE' OR n-ARRAY['is_complete','completed_by','completed_at','updated_at']
      IS DISTINCT FROM o-ARRAY['is_complete','completed_by','completed_at','updated_at']) THEN
      RAISE EXCEPTION 'Checklist completion only' USING ERRCODE='42501'; END IF;
    IF NEW.completed_by IS NOT NULL AND NEW.completed_by<>auth.uid() AND
      (TG_OP='INSERT' OR n->'completed_by' IS DISTINCT FROM o->'completed_by' OR n->'is_complete' IS DISTINCT FROM o->'is_complete') THEN
      RAISE EXCEPTION 'Cannot forge completion actor' USING ERRCODE='42501'; END IF;
    IF NEW.parent_node_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.checklist_nodes p
      WHERE p.id=NEW.parent_node_id AND p.checklist_id=NEW.checklist_id AND p.id<>NEW.id) THEN
      RAISE EXCEPTION 'Parent must belong to this checklist' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME IN ('daily_task_logs','task_timers','attendance_records') THEN
    IF NOT manager AND ((TG_OP='UPDATE' AND (n->'user_id',n->'task_id',n->'id') IS DISTINCT FROM
      (o->'user_id',o->'task_id',o->'id')) OR NEW.user_id<>auth.uid()) THEN
      RAISE EXCEPTION 'Cannot move or impersonate work records' USING ERRCODE='42501'; END IF;
    IF TG_TABLE_NAME='attendance_records' AND n->>'recorded_by' IS NOT NULL AND (n->>'recorded_by')::uuid<>auth.uid() AND
      (TG_OP='INSERT' OR n->'recorded_by' IS DISTINCT FROM o->'recorded_by') THEN
      RAISE EXCEPTION 'Cannot forge attendance actor' USING ERRCODE='42501'; END IF;
    IF TG_TABLE_NAME='daily_task_logs' AND n->>'source_timer_id' IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM public.task_timers timer WHERE timer.id=(n->>'source_timer_id')::uuid
       AND timer.user_id=NEW.user_id AND timer.task_id=(n->>'task_id')::uuid) THEN
      RAISE EXCEPTION 'Source timer must match worker and task' USING ERRCODE='42501'; END IF;
    IF TG_TABLE_NAME='task_timers' AND n->>'generated_log_id' IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM public.daily_task_logs log WHERE log.id=(n->>'generated_log_id')::uuid
        AND log.user_id=NEW.user_id AND log.task_id=(n->>'task_id')::uuid AND log.source_timer_id=NEW.id) THEN
      RAISE EXCEPTION 'Generated log must match timer, worker and task' USING ERRCODE='42501'; END IF;
  ELSIF TG_TABLE_NAME IN ('daily_facts','ideas','suggestions') THEN
    IF (TG_OP='INSERT' AND NEW.is_validated) OR (TG_OP='UPDATE' AND
      (NEW.is_validated,NEW.validated_by) IS DISTINCT FROM (OLD.is_validated,OLD.validated_by)) THEN
      IF role NOT IN ('managing_director','project_engineer','data_manager') OR NEW.posted_by IS NULL OR NEW.posted_by=auth.uid() THEN
        RAISE EXCEPTION 'An independent administrator must validate' USING ERRCODE='42501'; END IF;
      IF NEW.validated_by IS NOT NULL AND NEW.validated_by<>auth.uid() THEN
        RAISE EXCEPTION 'Cannot forge validator' USING ERRCODE='42501'; END IF;
      NEW.validated_by := CASE WHEN NEW.is_validated THEN auth.uid() ELSE NULL END;
    END IF;
    IF NEW.is_validated AND NEW.validated_by=NEW.posted_by THEN
      RAISE EXCEPTION 'Self-validation denied' USING ERRCODE='42501'; END IF;
    IF TG_OP='INSERT' AND NOT NEW.is_validated AND NEW.validated_by IS NOT NULL THEN
      RAISE EXCEPTION 'Unvalidated record cannot have a validator' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='daily_star_records' THEN
    IF NEW.override_by IS NOT NULL AND NEW.override_by<>auth.uid() AND
      (TG_OP='INSERT' OR n->'override_by' IS DISTINCT FROM o->'override_by') THEN
      RAISE EXCEPTION 'Cannot forge award actor' USING ERRCODE='42501'; END IF;
  ELSIF TG_TABLE_NAME='report_snapshots' THEN
    IF role<>'managing_director' AND (NEW.status='Final' OR (TG_OP='UPDATE' AND OLD.status='Final')) THEN
      RAISE EXCEPTION 'Only director can close or revise reports' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION taskpulse_private.audit_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n jsonb := CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
        o jsonb := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END; fields text[]; changes jsonb;
BEGIN
  SELECT coalesce(array_agg(k ORDER BY k),ARRAY[]::text[]) INTO fields
    FROM (SELECT jsonb_object_keys(n || o) k) s WHERE n->k IS DISTINCT FROM o->k;
  SELECT coalesce(jsonb_object_agg(k,jsonb_build_object('before',o->k,'after',n->k)),'{}'::jsonb) INTO changes
    FROM unnest(fields) k WHERE k=ANY(ARRAY['role','is_active','assignee_id','reviewer_id','user_id','task_id',
      'participant_credit_mode','participant_version','share_units','is_primary','review_approved','reviewed_at',
      'is_validated','validated_by','is_override','override_by','status','task_scale','priority','task_productivity','score']);
  INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes)
    VALUES(auth.uid(),coalesce(public.get_user_role()::text,'system'),TG_OP,TG_TABLE_NAME,
      coalesce(n->>'id',o->>'id')::uuid,fields,changes);
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename IN ('users','tasks','daily_task_logs','monthly_performance_snapshots','company_statements','company_milestones','task_assignees','task_reviewers','task_dependencies','task_detail_sections','task_links','checklist_templates','checklist_template_nodes','task_checklists','checklist_nodes','task_timers','attendance_records','daily_star_records','performance_score_components','meeting_points','daily_facts','ideas','suggestions','sales_logs','report_snapshots') LOOP
    EXECUTE format('CREATE TRIGGER m01_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION taskpulse_private.guard_write()',t);
    EXECUTE format('CREATE TRIGGER m01_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION taskpulse_private.audit_write()',t);
  END LOOP;
END $$;

CREATE FUNCTION taskpulse_private.check_participants() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE tid uuid; t public.tasks; BEGIN
  IF TG_TABLE_NAME<>'tasks' AND TG_OP='UPDATE' AND to_jsonb(NEW)->>'task_id' IS DISTINCT FROM to_jsonb(OLD)->>'task_id' THEN
    RAISE EXCEPTION 'Participant rows cannot move between tasks' USING ERRCODE='23514'; END IF;
  tid := coalesce(to_jsonb(NEW),to_jsonb(OLD))->>CASE WHEN TG_TABLE_NAME='tasks' THEN 'id' ELSE 'task_id' END;
  SELECT * INTO t FROM public.tasks WHERE id=tid;
  IF t.id IS NOT NULL AND t.participant_credit_mode='configured' THEN
    IF NOT EXISTS (SELECT 1 FROM public.task_assignees WHERE task_id=tid) OR
      (SELECT sum(share_units) FROM public.task_assignees WHERE task_id=tid)<>1000000 OR
      EXISTS (SELECT 1 FROM public.task_assignees WHERE task_id=tid AND share_units IS NULL) OR
      (SELECT count(*) FROM public.task_assignees WHERE task_id=tid AND is_primary)<>1 OR
      NOT EXISTS (SELECT 1 FROM public.task_assignees WHERE task_id=tid AND is_primary AND user_id=t.assignee_id) THEN
      RAISE EXCEPTION 'Configured shares must total 100%% with one matching primary' USING ERRCODE='23514'; END IF;
    IF (t.reviewer_id IS NULL AND EXISTS(SELECT 1 FROM public.task_reviewers WHERE task_id=tid AND is_primary)) OR
       (t.reviewer_id IS NOT NULL AND ((SELECT count(*) FROM public.task_reviewers WHERE task_id=tid AND is_primary)<>1 OR
         NOT EXISTS(SELECT 1 FROM public.task_reviewers WHERE task_id=tid AND is_primary AND user_id=t.reviewer_id))) THEN
      RAISE EXCEPTION 'Reviewer primary must match legacy projection' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER m01_shares AFTER INSERT OR UPDATE OR DELETE ON public.task_assignees
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION taskpulse_private.check_participants();
CREATE CONSTRAINT TRIGGER m01_reviewers AFTER INSERT OR UPDATE OR DELETE ON public.task_reviewers
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION taskpulse_private.check_participants();
CREATE CONSTRAINT TRIGGER m01_task_participants AFTER INSERT OR UPDATE ON public.tasks
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION taskpulse_private.check_participants();

CREATE FUNCTION taskpulse_private.seed_new_task() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.assignee_id AND is_active) OR
    (NEW.reviewer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.reviewer_id AND is_active)) THEN
    RAISE EXCEPTION 'New participants must be active' USING ERRCODE='23514'; END IF;
  INSERT INTO public.task_assignees(task_id,user_id,assignment_role,is_primary,assigned_by,share_units)
    VALUES(NEW.id,NEW.assignee_id,'Owner',true,auth.uid(),1000000);
  IF NEW.reviewer_id IS NOT NULL THEN INSERT INTO public.task_reviewers(task_id,user_id,reviewer_role,is_primary,assigned_by)
    VALUES(NEW.id,NEW.reviewer_id,'Primary',true,auth.uid()); END IF;
  UPDATE public.tasks SET participant_credit_mode='configured' WHERE id=NEW.id;
  RETURN NEW;
END $$;
CREATE TRIGGER m01_seed_new_task AFTER INSERT ON public.tasks
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.seed_new_task();

CREATE FUNCTION public.set_task_participants(p_task_id uuid, p_assignees uuid[], p_reviewers uuid[],
  p_share_units integer[], p_expected_version bigint, p_accept_legacy boolean DEFAULT false)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.tasks; uid uuid; units integer; n integer; i integer; sorted uuid[]; BEGIN
  IF public.get_user_role() NOT IN ('managing_director','project_engineer') OR public.get_user_role() IS NULL THEN
    RAISE EXCEPTION 'Active task manager required' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task_id FOR UPDATE;
  IF p_expected_version IS NULL OR p_expected_version<>t.participant_version THEN
    RAISE EXCEPTION 'Participants changed; reload before saving' USING ERRCODE='40001'; END IF;
  n := cardinality(p_assignees);
  IF n IS NULL OR n=0 OR n<>(SELECT count(DISTINCT x) FROM unnest(p_assignees) x) OR
    p_reviewers IS NULL OR cardinality(p_reviewers)<>(SELECT count(DISTINCT x) FROM unnest(p_reviewers) x) OR
    EXISTS(SELECT 1 FROM unnest(p_assignees || p_reviewers) x LEFT JOIN public.users u ON u.id=x WHERE u.id IS NULL OR NOT u.is_active) THEN
    RAISE EXCEPTION 'Distinct active participants required' USING ERRCODE='23514'; END IF;
  IF t.participant_credit_mode='legacy' AND NOT p_accept_legacy THEN
    RAISE EXCEPTION 'Review legacy reconciliation before configuring shares' USING ERRCODE='23514'; END IF;
  IF p_share_units IS NOT NULL AND (cardinality(p_share_units)<>n OR
    EXISTS(SELECT 1 FROM unnest(p_share_units) v WHERE v IS NULL OR v<0 OR v>1000000) OR
    (SELECT sum(v) FROM unnest(p_share_units) v)<>1000000) THEN
    RAISE EXCEPTION 'Shares must total exactly 100%%' USING ERRCODE='23514'; END IF;
  SELECT array_agg(x ORDER BY x) INTO sorted FROM unnest(p_assignees) x;
  -- No approved rule says whether changed shares restate old work. Until a
  -- versioned attribution contract is approved, deny only that redistribution.
  IF EXISTS(SELECT 1 FROM public.daily_task_logs WHERE task_id=p_task_id) AND
    (t.participant_credit_mode='legacy' OR
      (SELECT jsonb_object_agg(user_id::text,share_units) FROM public.task_assignees WHERE task_id=p_task_id)
       IS DISTINCT FROM (SELECT jsonb_object_agg(p_assignees[k]::text,CASE WHEN p_share_units IS NOT NULL THEN p_share_units[k]
         ELSE 1000000/n + CASE WHEN array_position(sorted,p_assignees[k])<=1000000%n THEN 1 ELSE 0 END END)
        FROM generate_series(1,n) k)) THEN
    RAISE EXCEPTION 'Logged credit changes need an approved historical attribution rule' USING ERRCODE='23514'; END IF;
  UPDATE public.task_assignees SET is_primary=false WHERE task_id=p_task_id;
  FOR i IN 1..n LOOP
    uid := p_assignees[i];
    units := CASE WHEN p_share_units IS NOT NULL THEN p_share_units[i]
      ELSE 1000000/n + CASE WHEN array_position(sorted,uid)<=1000000%n THEN 1 ELSE 0 END END;
    INSERT INTO public.task_assignees(task_id,user_id,assignment_role,is_primary,assigned_by,share_units)
      VALUES(p_task_id,uid,CASE WHEN i=1 THEN 'Owner'::public.task_assignment_role ELSE 'Collaborator'::public.task_assignment_role END,
        i=1,auth.uid(),units)
      ON CONFLICT(task_id,user_id) DO UPDATE SET is_primary=excluded.is_primary,
        assignment_role=excluded.assignment_role,share_units=excluded.share_units,assigned_by=excluded.assigned_by;
  END LOOP;
  DELETE FROM public.task_assignees WHERE task_id=p_task_id AND NOT(user_id=ANY(p_assignees));
  UPDATE public.task_reviewers SET is_primary=false WHERE task_id=p_task_id;
  FOR i IN 1..cardinality(p_reviewers) LOOP
    INSERT INTO public.task_reviewers(task_id,user_id,reviewer_role,is_primary,assigned_by)
      VALUES(p_task_id,p_reviewers[i],CASE WHEN i=1 THEN 'Primary'::public.task_reviewer_role ELSE 'Secondary'::public.task_reviewer_role END,i=1,auth.uid())
      ON CONFLICT(task_id,user_id) DO UPDATE SET is_primary=excluded.is_primary,reviewer_role=excluded.reviewer_role,assigned_by=excluded.assigned_by;
  END LOOP;
  DELETE FROM public.task_reviewers WHERE task_id=p_task_id AND NOT(user_id=ANY(p_reviewers));
  UPDATE public.tasks SET assignee_id=p_assignees[1],reviewer_id=p_reviewers[1],participant_credit_mode='configured',
    participant_version=participant_version+1 WHERE id=p_task_id;
  RETURN t.participant_version+1;
END $$;

CREATE FUNCTION public.save_task_with_participants(p_task_id uuid,p_fields jsonb,p_assignees uuid[],p_reviewers uuid[],
 p_share_units integer[],p_expected_version bigint,p_accept_legacy boolean,p_operation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE tid uuid; t public.tasks; receipt taskpulse_private.command_receipts; request jsonb; changed boolean; BEGIN
 IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('managing_director','project_engineer') THEN
   RAISE EXCEPTION 'Active task manager required' USING ERRCODE='42501'; END IF;
 IF p_operation_id IS NULL OR p_fields IS NULL OR jsonb_typeof(p_fields)<>'object' OR
   p_fields-ARRAY['task_tag','title','category','priority','due_date','task_scale']<>'{}'::jsonb THEN
   RAISE EXCEPTION 'Invalid task command' USING ERRCODE='23514'; END IF;
 request:=jsonb_build_array(p_task_id,p_fields,p_assignees,p_reviewers,p_share_units,p_expected_version,p_accept_legacy);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || p_operation_id::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=auth.uid() AND operation_id=p_operation_id;
 IF FOUND THEN
   IF receipt.request<>request THEN RAISE EXCEPTION 'Operation key reused with different input' USING ERRCODE='23514'; END IF;
   RETURN receipt.result;
 END IF;
 IF p_task_id IS NULL THEN
   INSERT INTO public.tasks(task_tag,title,category,priority,due_date,task_scale,assignee_id,reviewer_id,valid_for_metrics)
   VALUES(p_fields->>'task_tag',p_fields->>'title',(p_fields->>'category')::public.task_category,
    (p_fields->>'priority')::public.task_priority,(p_fields->>'due_date')::date,(p_fields->>'task_scale')::numeric,
    p_assignees[1],p_reviewers[1],coalesce((p_fields->>'task_scale')::numeric>0 AND p_fields->>'category'<>'OT',false)) RETURNING id INTO tid;
   PERFORM public.set_task_participants(tid,p_assignees,p_reviewers,p_share_units,0,true);
 ELSE
   SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task_id FOR UPDATE;
   IF p_expected_version IS NULL OR t.participant_version<>p_expected_version THEN
     RAISE EXCEPTION 'Participants changed; reload before saving' USING ERRCODE='40001'; END IF;
   tid:=p_task_id;
   -- Unchanged legacy participants retain unresolved historical attribution.
   changed := p_share_units IS NOT NULL OR (t.participant_credit_mode='legacy' AND p_accept_legacy) OR
     t.assignee_id IS DISTINCT FROM p_assignees[1] OR t.reviewer_id IS DISTINCT FROM p_reviewers[1] OR
     (SELECT array_agg(x ORDER BY x) FROM unnest(p_assignees) x) IS DISTINCT FROM
       (SELECT array_agg(x ORDER BY x) FROM (SELECT user_id x FROM public.task_assignees WHERE task_id=tid UNION SELECT t.assignee_id) s) OR
     coalesce((SELECT array_agg(x ORDER BY x) FROM unnest(p_reviewers) x),ARRAY[]::uuid[]) IS DISTINCT FROM
       coalesce((SELECT array_agg(x ORDER BY x) FROM (SELECT user_id x FROM public.task_reviewers WHERE task_id=tid UNION SELECT t.reviewer_id WHERE t.reviewer_id IS NOT NULL) s),ARRAY[]::uuid[]);
   IF changed THEN
     -- Editing reviewers/primary order does not silently reset custom shares.
     IF p_share_units IS NULL AND t.participant_credit_mode='configured' AND
       (SELECT array_agg(x ORDER BY x) FROM unnest(p_assignees) x) =
       (SELECT array_agg(user_id ORDER BY user_id) FROM public.task_assignees WHERE task_id=tid) THEN
       SELECT array_agg(a.share_units ORDER BY p.ordinality) INTO p_share_units FROM unnest(p_assignees) WITH ORDINALITY p(uid,ordinality)
         JOIN public.task_assignees a ON a.task_id=tid AND a.user_id=p.uid;
     END IF;
     PERFORM public.set_task_participants(tid,p_assignees,p_reviewers,p_share_units,p_expected_version,p_accept_legacy);
   END IF;
   UPDATE public.tasks SET task_tag=p_fields->>'task_tag',title=p_fields->>'title',category=(p_fields->>'category')::public.task_category,
    priority=(p_fields->>'priority')::public.task_priority,due_date=(p_fields->>'due_date')::date,task_scale=(p_fields->>'task_scale')::numeric WHERE id=tid;
 END IF;
 INSERT INTO taskpulse_private.command_receipts VALUES(auth.uid(),p_operation_id,request,tid);
 RETURN tid;
END $$;

CREATE FUNCTION public.participant_reconciliation() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ DECLARE result jsonb; BEGIN
 IF public.get_user_role() IS NULL OR public.get_user_role() NOT IN ('managing_director','project_engineer') THEN
  RAISE EXCEPTION 'Active task manager required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('task_id',t.id,'task_tag',t.task_tag,'mode',t.participant_credit_mode,
  'version',t.participant_version,'legacy_primary',t.assignee_id,'legacy_reviewer',t.reviewer_id,
  'participants',coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',a.user_id,'primary',a.is_primary,'share_units',a.share_units))
    FROM public.task_assignees a WHERE a.task_id=t.id),'[]'::jsonb),
  'requires_review',t.participant_credit_mode='legacy') ORDER BY t.task_tag),'[]'::jsonb) INTO result FROM public.tasks t;
 RETURN result;
END $$;
CREATE FUNCTION public.record_task_review(p_task_id uuid,p_approved boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
 IF public.get_user_role() IS NULL OR p_approved IS NULL THEN RAISE EXCEPTION 'Active reviewer required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.tasks WHERE id=p_task_id FOR UPDATE;
 -- Record only the assigned reviewer's decision. No status/completion gate is inferred.
 UPDATE public.task_reviewers SET reviewed_at=now(),review_approved=p_approved WHERE task_id=p_task_id AND user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Task is not assigned for your review' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION public.recalculate_task_metrics(p_task_id uuid,p_progress_delta numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.tasks; hours numeric; progress numeric; scaled numeric; BEGIN
 IF public.get_user_role() IS NULL OR NOT (public.is_task_assignee(p_task_id) OR
   public.get_user_role() IN ('managing_director','project_engineer')) THEN
   RAISE EXCEPTION 'Assigned actor or task manager required' USING ERRCODE='42501'; END IF;
 IF p_progress_delta IS NULL OR p_progress_delta NOT BETWEEN -100 AND 100 THEN
   RAISE EXCEPTION 'Invalid progress delta' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task_id FOR UPDATE;
 SELECT coalesce(sum(hours_worked),0) INTO hours FROM public.daily_task_logs WHERE task_id=p_task_id;
 -- Existing formulas intentionally retained pending M07/D04; protected values
 -- are derived inside the command, never accepted from a caller.
 progress:=round(greatest(0,least(100,coalesce(t.progress_percentage,0)+p_progress_delta)),2);
 scaled:=round(coalesce(t.task_scale,0)*progress/100,2);
 UPDATE public.tasks SET progress_percentage=progress,task_productivity=CASE WHEN hours>0 THEN round(scaled/hours,2) ELSE 0 END,
  valid_for_metrics=hours>0 AND coalesce(t.task_scale,0)>0 AND t.category<>'OT',freshness='Fresh' WHERE id=p_task_id;
END $$;

-- Verify the narrow worker context, including runs which update no rows.
ALTER FUNCTION public.decay_task_freshness() SET SCHEMA taskpulse_private;
CREATE FUNCTION public.decay_task_freshness()
RETURNS TABLE(updated_count integer,rotten_count integer,stale_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_name name; BEGIN
 SELECT pg_catalog.pg_get_userbyid(relowner) INTO owner_name FROM pg_catalog.pg_class
   WHERE oid='taskpulse_private.audit_events'::regclass;
 IF current_setting('role',true)<>'service_role' AND session_user<>owner_name THEN
   RAISE EXCEPTION 'Trusted freshness worker required' USING ERRCODE='42501'; END IF;
 INSERT INTO taskpulse_private.audit_events(actor_role,command,table_name,changed_fields)
  VALUES(CASE WHEN current_setting('role',true)='service_role' THEN 'service_role' ELSE 'cron_owner' END,
    'freshness_decay','tasks',ARRAY['freshness']);
 RETURN QUERY SELECT * FROM taskpulse_private.decay_task_freshness();
END $$;

-- Revoke inherited/default function execution as well as table privileges.
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_catalog.pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
  ('get_user_role','set_updated_at','handle_new_user','decay_task_freshness','is_task_assignee','can_read_employee_details',
   'set_task_participants','save_task_with_participants','participant_reconciliation','record_task_review','recalculate_task_metrics') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f);
 END LOOP;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role(),public.is_task_assignee(uuid),public.can_read_employee_details(uuid),
 public.set_task_participants(uuid,uuid[],uuid[],integer[],bigint,boolean),
 public.save_task_with_participants(uuid,jsonb,uuid[],uuid[],integer[],bigint,boolean,uuid),
 public.participant_reconciliation(),public.record_task_review(uuid,boolean),public.recalculate_task_metrics(uuid,numeric) TO authenticated;
-- Existing freshness worker is the one verified job-specific interface; its
-- writes are now audited by the table trigger. Keep its existing service-only grant.
GRANT EXECUTE ON FUNCTION public.decay_task_freshness() TO service_role;
COMMIT;
