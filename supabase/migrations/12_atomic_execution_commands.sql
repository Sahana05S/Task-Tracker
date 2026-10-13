-- M02: atomic execution commands; no historical effect inference or scoring rollout.
BEGIN;
ALTER TABLE taskpulse_private.command_receipts
 ADD COLUMN command text NOT NULL DEFAULT 'save_task_with_participants',
 ADD COLUMN result_payload jsonb;
ALTER TABLE taskpulse_private.command_receipts DROP CONSTRAINT command_receipts_pkey;
ALTER TABLE taskpulse_private.command_receipts ADD PRIMARY KEY(actor_id,command,operation_id);
ALTER TABLE taskpulse_private.audit_events ADD COLUMN operation_id uuid;
ALTER TABLE public.tasks ADD COLUMN metric_version bigint NOT NULL DEFAULT 0;
ALTER TABLE public.daily_task_logs
 ADD COLUMN requested_progress_delta numeric(5,2),
 ADD COLUMN effective_progress_delta numeric(5,2),
 ADD COLUMN execution_version bigint NOT NULL DEFAULT 0,
 ADD COLUMN reversed_at timestamptz,
 ADD COLUMN participant_version bigint,
 ADD COLUMN credit_shares jsonb,
 ADD COLUMN credit_scale numeric,
 ADD COLUMN effect_contract text;
-- NULL means unknown old effect; never copy requested progress into effective.
ALTER TABLE public.task_timers ADD COLUMN execution_version bigint NOT NULL DEFAULT 0;
CREATE TABLE taskpulse_private.participant_versions (
 task_id uuid NOT NULL, version bigint NOT NULL, effective_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 mode text NOT NULL, shares jsonb, PRIMARY KEY(task_id,version)
);
INSERT INTO taskpulse_private.participant_versions(task_id,version,mode,shares)
 SELECT t.id,t.participant_version,t.participant_credit_mode,
  CASE WHEN t.participant_credit_mode='configured' THEN
   (SELECT jsonb_object_agg(a.user_id::text,a.share_units) FROM public.task_assignees a WHERE a.task_id=t.id) END
 FROM public.tasks t;
CREATE TABLE taskpulse_private.log_revisions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, log_id uuid NOT NULL, version bigint NOT NULL,
 actor_id uuid NOT NULL, operation_id uuid NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 command text NOT NULL, before_data jsonb, after_data jsonb, reason text,
 UNIQUE(log_id,version)
);
CREATE TABLE taskpulse_private.earned_credit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, log_id uuid NOT NULL, task_id uuid NOT NULL,
 operation_id uuid NOT NULL, actor_id uuid NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 participant_version bigint, shares jsonb, credit_scale numeric, effective_delta numeric NOT NULL,
 source_version bigint NOT NULL, UNIQUE(log_id,source_version)
);
CREATE TABLE taskpulse_private.outbox_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL,
 entity_id uuid NOT NULL, entity_version bigint NOT NULL, operation_id uuid NOT NULL,
 payload jsonb NOT NULL, status text NOT NULL DEFAULT 'blocked' CHECK(status IN ('pending','blocked','running','failed','complete')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), available_at timestamptz NOT NULL DEFAULT now(),
 locked_until timestamptz, last_error_code text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(kind,entity_id,entity_version)
);
-- No workers are granted yet: M05/M07/M10 will provide narrow claim/complete commands.
REVOKE ALL ON ALL TABLES IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
-- All execution writes must use commands, including managers and direct REST.
REVOKE INSERT,UPDATE,DELETE ON public.daily_task_logs,public.task_timers FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE t text; c record; BEGIN
 FOREACH t IN ARRAY ARRAY['daily_task_logs','task_timers'] LOOP
  FOR c IN SELECT attname FROM pg_attribute WHERE attrelid=format('public.%I',t)::regclass AND attnum>0 AND NOT attisdropped LOOP
   EXECUTE format('REVOKE ALL (%I) ON public.%I FROM PUBLIC,anon,authenticated,service_role',c.attname,t);
  END LOOP;
 END LOOP;
END $$;
-- Legacy duplicate source links need reconciliation, never silent deletion.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.daily_task_logs WHERE source_timer_id IS NOT NULL GROUP BY source_timer_id HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Duplicate historical timer logs require reconciliation before M02' USING ERRCODE='23514'; END IF;
END $$;
CREATE UNIQUE INDEX m02_one_log_per_timer ON public.daily_task_logs(source_timer_id) WHERE source_timer_id IS NOT NULL;

-- Current-credit anchor records the M01 reading at migration time, not claimed
-- historical earning dates. Subsequent deltas preserve it prospectively.
CREATE TABLE taskpulse_private.task_credit_balances (
 task_id uuid NOT NULL,user_id uuid NOT NULL,scaled_credit numeric NOT NULL,
 PRIMARY KEY(task_id,user_id)
);
INSERT INTO taskpulse_private.task_credit_balances
 SELECT t.id,a.user_id,coalesce(t.task_scale,0)*coalesce(t.progress_percentage,0)/100*a.share_units/1000000
 FROM public.tasks t JOIN public.task_assignees a ON a.task_id=t.id WHERE t.participant_credit_mode='configured';
INSERT INTO taskpulse_private.task_credit_balances
 SELECT id,assignee_id,coalesce(task_scale,0)*coalesce(progress_percentage,0)/100 FROM public.tasks
 WHERE participant_credit_mode='legacy';
REVOKE ALL ON taskpulse_private.task_credit_balances FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION taskpulse_private.apply_credit(p_task uuid,p_scaled numeric,p_shares jsonb,p_fallback uuid) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$ DECLARE r record; BEGIN
 IF p_shares IS NULL THEN
  INSERT INTO taskpulse_private.task_credit_balances VALUES(p_task,p_fallback,p_scaled)
   ON CONFLICT(task_id,user_id) DO UPDATE SET scaled_credit=taskpulse_private.task_credit_balances.scaled_credit+excluded.scaled_credit;
 ELSE
  FOR r IN SELECT key,value FROM jsonb_each_text(p_shares) LOOP
   INSERT INTO taskpulse_private.task_credit_balances VALUES(p_task,r.key::uuid,p_scaled*r.value::numeric/1000000)
    ON CONFLICT(task_id,user_id) DO UPDATE SET scaled_credit=taskpulse_private.task_credit_balances.scaled_credit+excluded.scaled_credit;
  END LOOP;
 END IF;
END $$;
CREATE FUNCTION taskpulse_private.credit_progress_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE shares jsonb; delta numeric; BEGIN
 delta:=(coalesce(NEW.progress_percentage,0)-coalesce(OLD.progress_percentage,0))*coalesce(NEW.task_scale,0)/100;
 SELECT v.shares INTO shares FROM taskpulse_private.participant_versions v WHERE v.task_id=NEW.id AND v.version=NEW.participant_version;
 PERFORM taskpulse_private.apply_credit(NEW.id,delta,shares,NEW.assignee_id);
 RETURN NEW;
END $$;
CREATE TRIGGER m02_credit_progress AFTER UPDATE OF progress_percentage ON public.tasks
 FOR EACH ROW WHEN (NEW.progress_percentage IS DISTINCT FROM OLD.progress_percentage)
 EXECUTE FUNCTION taskpulse_private.credit_progress_change();
CREATE FUNCTION taskpulse_private.capture_participant_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF TG_OP='INSERT' OR (NEW.participant_version,NEW.participant_credit_mode) IS DISTINCT FROM (OLD.participant_version,OLD.participant_credit_mode) THEN
  INSERT INTO taskpulse_private.participant_versions(task_id,version,mode,shares)
   SELECT NEW.id,NEW.participant_version,NEW.participant_credit_mode,
    CASE WHEN NEW.participant_credit_mode='configured' THEN
     (SELECT jsonb_object_agg(user_id::text,share_units) FROM public.task_assignees WHERE task_id=NEW.id) END
   ON CONFLICT(task_id,version) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER m02_participant_version AFTER INSERT OR UPDATE ON public.tasks
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.capture_participant_version();
CREATE OR REPLACE FUNCTION public.set_task_participants(p_task_id uuid, p_assignees uuid[], p_reviewers uuid[],
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
  -- Prospective versions preserve old event snapshots. No historical rewrite.
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

CREATE OR REPLACE FUNCTION public.save_task_with_participants(p_task_id uuid,p_fields jsonb,p_assignees uuid[],p_reviewers uuid[],
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
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=auth.uid() AND operation_id=p_operation_id AND command='save_task_with_participants';
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
 INSERT INTO taskpulse_private.command_receipts(actor_id,operation_id,request,result) VALUES(auth.uid(),p_operation_id,request,tid);
 RETURN tid;
END $$;


CREATE FUNCTION taskpulse_private.retain_execution_history() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 RAISE EXCEPTION 'Execution history cannot be physically deleted; an approved reversal/archive command is required' USING ERRCODE='23514';
END $$;
CREATE TRIGGER m02_retain_logs BEFORE DELETE ON public.daily_task_logs FOR EACH ROW EXECUTE FUNCTION taskpulse_private.retain_execution_history();
CREATE TRIGGER m02_retain_timers BEFORE DELETE ON public.task_timers FOR EACH ROW EXECUTE FUNCTION taskpulse_private.retain_execution_history();
CREATE FUNCTION taskpulse_private.seed_credit_balance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE t public.tasks; shares jsonb; BEGIN
 SELECT * INTO t FROM public.tasks WHERE id=NEW.id;
 SELECT v.shares INTO shares FROM taskpulse_private.participant_versions v WHERE v.task_id=t.id AND v.version=t.participant_version;
 PERFORM taskpulse_private.apply_credit(t.id,coalesce(t.task_scale,0)*coalesce(t.progress_percentage,0)/100,shares,t.assignee_id);
 RETURN NEW;
END $$;
CREATE TRIGGER m02_seed_credit AFTER INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION taskpulse_private.seed_credit_balance();
-- Until M05 owns synchronization, clients cannot create/change a progress-owner
-- signal concurrently with a log. Existing signals remain intact. Trusted owner
-- fixtures/future atomic commands can set them only with an explicit contract.
CREATE FUNCTION taskpulse_private.guard_checklist_owner_signal() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$ DECLARE owner_name name; BEGIN
 SELECT pg_get_userbyid(relowner) INTO owner_name FROM pg_class WHERE oid=TG_RELID;
 IF current_user=owner_name THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='task_checklists' THEN
  IF (TG_OP='INSERT' AND NEW.sync_progress_to_task) OR (TG_OP='UPDATE' AND
   (NEW.sync_progress_to_task,NEW.task_id) IS DISTINCT FROM (OLD.sync_progress_to_task,OLD.task_id) AND
   (NEW.sync_progress_to_task OR OLD.sync_progress_to_task)) THEN
   RAISE EXCEPTION 'Checklist progress ownership is temporarily locked while synchronization is upgraded' USING ERRCODE='23514'; END IF;
 ELSE
  IF ((TG_OP='INSERT' AND NEW.linked_task_id IS NOT NULL) OR (TG_OP='UPDATE' AND
    (NEW.linked_task_id,NEW.checklist_id) IS DISTINCT FROM (OLD.linked_task_id,OLD.checklist_id) AND
    (NEW.linked_task_id IS NOT NULL OR OLD.linked_task_id IS NOT NULL))) AND
    EXISTS(SELECT 1 FROM public.task_checklists WHERE id IN (NEW.checklist_id,CASE WHEN TG_OP='UPDATE' THEN OLD.checklist_id END) AND sync_progress_to_task) THEN
   RAISE EXCEPTION 'Linked progress ownership is temporarily locked while synchronization is upgraded' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER m02_checklist_owner_guard BEFORE INSERT OR UPDATE ON public.task_checklists
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.guard_checklist_owner_signal();
CREATE TRIGGER m02_linked_owner_guard BEFORE INSERT OR UPDATE ON public.checklist_nodes
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.guard_checklist_owner_signal();
CREATE FUNCTION taskpulse_private.assert_open_date(p_user uuid,p_date date) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.report_snapshots WHERE status='Final' AND
   (employee_id IS NULL OR employee_id=p_user) AND (period_start IS NULL OR period_start<=p_date)
   AND (period_end IS NULL OR period_end>=p_date)) OR EXISTS(SELECT 1 FROM public.monthly_performance_snapshots
   WHERE user_id=p_user AND snapshot_year=extract(year FROM p_date) AND snapshot_month=extract(month FROM p_date)) THEN
  RAISE EXCEPTION 'Frozen/snapshotted period requires an authorized report revision' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION taskpulse_private.assert_task_open_date(p_task uuid,p_date date) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$ DECLARE uid uuid; BEGIN
 FOR uid IN SELECT user_id FROM taskpulse_private.task_credit_balances WHERE task_id=p_task
  UNION SELECT user_id FROM public.task_assignees WHERE task_id=p_task
  UNION SELECT assignee_id FROM public.tasks WHERE id=p_task LOOP
  PERFORM taskpulse_private.assert_open_date(uid,p_date);
 END LOOP;
END $$;
CREATE FUNCTION taskpulse_private.assert_progress_owner(p_task uuid,p_delta numeric) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF p_delta<>0 AND EXISTS(SELECT 1 FROM public.tasks WHERE id=p_task AND participant_credit_mode='legacy') THEN
  RAISE EXCEPTION 'Legacy progress credit needs participant reconciliation; log hours with zero progress' USING ERRCODE='23514'; END IF;
 IF p_delta<>0 AND (EXISTS(SELECT 1 FROM public.task_checklists WHERE task_id=p_task AND sync_progress_to_task) OR
   EXISTS(SELECT 1 FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id
    WHERE n.linked_task_id=p_task AND c.sync_progress_to_task)) THEN
  RAISE EXCEPTION 'This task''s progress is controlled by a checklist; record hours with zero progress' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION taskpulse_private.refresh_task_metrics(p_task uuid,p_operation uuid,p_date date) RETURNS bigint
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE t public.tasks; hours numeric; v bigint; BEGIN
 SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task FOR UPDATE;
 SELECT coalesce(sum(hours_worked),0) INTO hours FROM public.daily_task_logs WHERE task_id=p_task AND reversed_at IS NULL;
 -- Legacy stored productivity/eligibility only. No new score/freshness formula.
 -- Logging never resets freshness: the later lifecycle module owns date classification.
 UPDATE public.tasks SET task_productivity=CASE WHEN hours>0 THEN round(coalesce(progress_percentage,0)/hours,2) ELSE 0 END,
  valid_for_metrics=hours>0 AND coalesce(task_scale,0)>0 AND category<>'OT',metric_version=metric_version+1
  WHERE id=p_task RETURNING metric_version INTO v;
 INSERT INTO taskpulse_private.outbox_jobs(kind,entity_id,entity_version,operation_id,payload)
  VALUES('task_metrics_invalidated',p_task,v,p_operation,jsonb_build_object('contract','m02-invalidation-v1',
   'affected_date',p_date,'dependencies',ARRAY['M03','M05','M07'],'reason','execution_changed'));
 RETURN v;
END $$;
-- Preserve manual progress edits. Protect command metadata and postpone any
-- direct checklist/scale rewrite whose historical ownership is not settled.
CREATE FUNCTION taskpulse_private.guard_execution_task() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE owner_name name; BEGIN
 SELECT pg_get_userbyid(relowner) INTO owner_name FROM pg_class WHERE oid=TG_RELID;
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM public.daily_task_logs WHERE task_id=OLD.id) OR EXISTS(SELECT 1 FROM public.task_timers WHERE task_id=OLD.id) THEN
   RAISE EXCEPTION 'Execution history must be retained; task removal needs an archive policy' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF current_user<>owner_name AND (TG_OP='INSERT' AND NEW.metric_version<>0 OR TG_OP='UPDATE' AND NEW.metric_version<>OLD.metric_version) THEN
  RAISE EXCEPTION 'Protected metric version' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.task_scale IS DISTINCT FROM OLD.task_scale AND (coalesce(OLD.progress_percentage,0)<>0 OR EXISTS(SELECT 1 FROM public.daily_task_logs WHERE task_id=OLD.id)) THEN
   RAISE EXCEPTION 'Logged scale changes require an effective-date policy to preserve older credit' USING ERRCODE='23514'; END IF;
  IF current_user<>owner_name AND NEW.progress_percentage IS DISTINCT FROM OLD.progress_percentage THEN
   IF OLD.status IN ('Done','Discarded') THEN RAISE EXCEPTION 'Terminal progress awaits lifecycle enforcement' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM public.task_checklists WHERE task_id=OLD.id AND sync_progress_to_task) OR EXISTS(
    SELECT 1 FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE n.linked_task_id=OLD.id AND c.sync_progress_to_task) THEN
    RAISE EXCEPTION 'Checklist-controlled progress is temporarily locked while synchronization is upgraded' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER m02_task_guard BEFORE INSERT OR UPDATE OR DELETE ON public.tasks
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.guard_execution_task();
-- Direct manual progress is still permitted; derive legacy metrics in the same
-- statement rather than replacing progress with sums of logs.
CREATE FUNCTION taskpulse_private.refresh_manual_progress() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NEW.progress_percentage IS DISTINCT FROM OLD.progress_percentage THEN
  PERFORM taskpulse_private.refresh_task_metrics(NEW.id,gen_random_uuid(),NULL);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER m02_manual_metrics AFTER UPDATE OF progress_percentage ON public.tasks
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.refresh_manual_progress();

CREATE FUNCTION taskpulse_private.execution_command(p_command text,p_task_id uuid,p_entity_id uuid,p_payload jsonb,
 p_expected_version bigint,p_operation_id uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); role public.user_role; t public.tasks; l public.daily_task_logs; timer public.task_timers;
 receipt taskpulse_private.command_receipts; request jsonb; result jsonb; tid uuid; eid uuid;
 before_safe jsonb; after_safe jsonb; hours numeric; requested numeric; effective numeric; base numeric; target numeric;
 day date; end_at timestamptz; seconds integer; input_notes text; links text[]; reason text; version bigint; mv bigint;
 shares jsonb; share_version bigint; scale numeric; prior numeric:=0; source text; delta_changed boolean;
BEGIN
 SELECT u.role INTO role FROM public.users u WHERE u.id=actor AND u.is_active FOR SHARE;
 IF role IS NULL OR actor IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_operation_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR
  p_command NOT IN ('create_log','correct_log','reverse_log','start_timer','stop_timer','discard_timer') THEN
  RAISE EXCEPTION 'Invalid execution command' USING ERRCODE='23514'; END IF;
 IF (p_command IN ('create_log','correct_log') AND p_payload-ARRAY['log_date','hours_worked','requested_delta','notes','raw_links','reason']<>'{}') OR
  (p_command IN ('start_timer','stop_timer','discard_timer','reverse_log') AND p_payload-ARRAY['notes','reason']<>'{}') THEN
  RAISE EXCEPTION 'Unexpected/forged fields' USING ERRCODE='23514'; END IF;
 request:=jsonb_build_array(p_task_id,p_entity_id,p_payload,p_expected_version);
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||p_command||p_operation_id::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=p_command AND operation_id=p_operation_id;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation key reused with different input' USING ERRCODE='40001'; END IF;
  RETURN receipt.result_payload;
 END IF;
 -- Order: receipt lock, task, entity. Source task IDs are command-immutable.
 IF p_command IN ('correct_log','reverse_log') THEN
  SELECT task_id INTO tid FROM public.daily_task_logs WHERE id=p_entity_id;
 ELSIF p_command IN ('stop_timer','discard_timer') THEN
  SELECT task_id INTO tid FROM public.task_timers WHERE id=p_entity_id;
 ELSE tid:=p_task_id; END IF;
 SELECT * INTO t FROM public.tasks WHERE id=tid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Task/entity no longer exists' USING ERRCODE='23514'; END IF;
 IF NOT(public.is_task_assignee(tid) OR role IN ('managing_director','project_engineer') OR
  (p_command='discard_timer' AND EXISTS(SELECT 1 FROM public.task_timers WHERE id=p_entity_id AND user_id=actor))) THEN
  RAISE EXCEPTION 'Task assignment or management permission required' USING ERRCODE='42501'; END IF;
 IF p_command IN ('create_log','start_timer','correct_log','reverse_log','stop_timer') AND t.status IN ('Done','Discarded') THEN
  RAISE EXCEPTION 'Terminal task execution requires an authorized lifecycle or report revision' USING ERRCODE='23514'; END IF;
 input_notes:=nullif(btrim(p_payload->>'notes'),''); reason:=nullif(btrim(p_payload->>'reason'),'');
 IF length(coalesce(input_notes,''))>10000 OR length(coalesce(reason,''))>1000 THEN
  RAISE EXCEPTION 'Notes/reason too long' USING ERRCODE='23514'; END IF;
 IF p_command IN ('create_log','correct_log') THEN
  IF p_payload->>'log_date' IS NULL OR p_payload->>'log_date'!~'^\d{4}-\d{2}-\d{2}$' THEN
   RAISE EXCEPTION 'Explicit ISO log date required' USING ERRCODE='23514'; END IF;
  BEGIN
   day:=(p_payload->>'log_date')::date; hours:=(p_payload->>'hours_worked')::numeric;
   requested:=(p_payload->>'requested_delta')::numeric;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
   RAISE EXCEPTION 'Invalid date/number' USING ERRCODE='23514'; END;
  IF day>(clock_timestamp() AT TIME ZONE 'UTC')::date+1 OR hours IS NULL OR NOT(hours BETWEEN 0 AND 24) OR
   requested IS NULL OR NOT(requested BETWEEN -100 AND 100) OR hours<>round(hours,2) OR requested<>round(requested,2) THEN
   RAISE EXCEPTION 'Hours 0-24/progress -100-100 require finite two-decimal inputs and nonfuture date' USING ERRCODE='23514'; END IF;
  IF p_payload->'raw_links' IS NOT NULL AND p_payload->'raw_links'<>'null'::jsonb THEN
   IF jsonb_typeof(p_payload->'raw_links')<>'array' THEN RAISE EXCEPTION 'Links must be an array' USING ERRCODE='23514'; END IF;
   SELECT array_agg(value) INTO links FROM jsonb_array_elements_text(p_payload->'raw_links');
   IF cardinality(links)>10 OR EXISTS(SELECT 1 FROM unnest(links) x WHERE x IS NULL OR x!~*'^https?://[^[:space:]]+$') THEN
    RAISE EXCEPTION 'At most ten HTTP(S) links required' USING ERRCODE='23514'; END IF;
  END IF;
  PERFORM taskpulse_private.assert_open_date(actor,day);
  PERFORM taskpulse_private.assert_task_open_date(tid,day);
 END IF;
 IF p_command='start_timer' THEN
  -- The existing unique partial index is the authoritative per-user constraint.
  INSERT INTO public.task_timers(task_id,user_id,notes) VALUES(tid,actor,input_notes) RETURNING id INTO eid;
  result:=jsonb_build_object('timerId',eid,'taskId',tid,'taskTag',t.task_tag,'version',0);
 ELSIF p_command IN ('stop_timer','discard_timer') THEN
  SELECT * INTO STRICT timer FROM public.task_timers WHERE id=p_entity_id FOR UPDATE;
  IF timer.user_id<>actor AND role NOT IN ('managing_director','project_engineer') THEN
   RAISE EXCEPTION 'Own timer or task manager required' USING ERRCODE='42501'; END IF;
  IF p_expected_version IS NULL OR timer.execution_version<>p_expected_version OR timer.status<>'Running' THEN
   RAISE EXCEPTION 'Timer changed or stopped; reload before retrying with a new key' USING ERRCODE='40001'; END IF;
  end_at:=clock_timestamp(); seconds:=floor(extract(epoch FROM end_at-timer.started_at));
  IF seconds<0 THEN RAISE EXCEPTION 'Timer starts in the future' USING ERRCODE='23514'; END IF;
  before_safe:=jsonb_build_object('status',timer.status,'version',timer.execution_version,'elapsed_seconds',timer.elapsed_seconds);
  eid:=timer.id;
  IF p_command='stop_timer' THEN
   IF seconds=0 OR round(seconds::numeric/3600,2)=0 THEN
    RAISE EXCEPTION 'Duration is too short to record at stored hour precision; keep running or discard' USING ERRCODE='23514'; END IF;
   -- Existing UTC stop-date behavior retained only for unambiguous same-day
   -- sessions. Cross-day/month policy is pending; no hours are silently moved.
   IF (timer.started_at AT TIME ZONE 'UTC')::date<>(end_at AT TIME ZONE 'UTC')::date OR
    (timer.started_at AT TIME ZONE 'Asia/Kolkata')::date<>(end_at AT TIME ZONE 'Asia/Kolkata')::date OR
    (end_at AT TIME ZONE 'UTC')::date<>(end_at AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'Timer date attribution requires approved cross-day/timezone policy; session remains running' USING ERRCODE='23514'; END IF;
   day:=(end_at AT TIME ZONE 'UTC')::date; hours:=round(seconds::numeric/3600,2);
   IF hours>24 THEN RAISE EXCEPTION 'Timer exceeds per-entry duration limit' USING ERRCODE='23514'; END IF;
   PERFORM taskpulse_private.assert_open_date(timer.user_id,day);
   PERFORM taskpulse_private.assert_task_open_date(tid,day);
   share_version:=t.participant_version;
   SELECT v.shares INTO shares FROM taskpulse_private.participant_versions v WHERE v.task_id=tid AND v.version=share_version;
   INSERT INTO public.daily_task_logs(task_id,user_id,log_date,hours_worked,progress_delta,requested_progress_delta,
    effective_progress_delta,execution_version,update_notes,log_source,source_timer_id,participant_version,credit_shares,credit_scale,effect_contract)
    VALUES(tid,timer.user_id,day,hours,0,0,0,1,coalesce(input_notes,timer.notes),'Timer',timer.id,share_version,shares,t.task_scale,'m02-effective-v1') RETURNING * INTO l;
   UPDATE public.task_timers SET status='Stopped',stopped_at=end_at,elapsed_seconds=seconds,generated_log_id=l.id,
    notes=coalesce(input_notes,timer.notes),execution_version=execution_version+1 WHERE id=timer.id;
   mv:=taskpulse_private.refresh_task_metrics(tid,p_operation_id,day);
   INSERT INTO taskpulse_private.earned_credit_events(log_id,task_id,operation_id,actor_id,participant_version,shares,credit_scale,effective_delta,source_version)
    VALUES(l.id,tid,p_operation_id,actor,share_version,shares,t.task_scale,0,1);
   INSERT INTO taskpulse_private.log_revisions(log_id,version,actor_id,operation_id,command,after_data)
    VALUES(l.id,1,actor,p_operation_id,p_command,jsonb_build_object('hours',hours,'date',day,'effective_delta',0,'participant_version',share_version));
  ELSE
   IF reason IS NULL THEN RAISE EXCEPTION 'Discard reason required' USING ERRCODE='23514'; END IF;
   UPDATE public.task_timers SET status='Discarded',stopped_at=end_at,elapsed_seconds=seconds,notes=coalesce(input_notes,timer.notes),
    execution_version=execution_version+1 WHERE id=timer.id;
  END IF;
  after_safe:=jsonb_build_object('status',CASE WHEN p_command='stop_timer' THEN 'Stopped' ELSE 'Discarded' END,
   'elapsed_seconds',seconds,'version',timer.execution_version+1,'log_id',l.id);
  result:=jsonb_build_object('timerId',timer.id,'logId',l.id,'taskId',tid,'taskTag',t.task_tag,'version',timer.execution_version+1,'metricVersion',mv);
 ELSE
  IF p_command IN ('correct_log','reverse_log') THEN
   SELECT * INTO STRICT l FROM public.daily_task_logs WHERE id=p_entity_id FOR UPDATE;
   IF l.user_id<>actor THEN RAISE EXCEPTION 'Own log required; manager history correction is separately authorized' USING ERRCODE='42501'; END IF;
   IF p_expected_version IS NULL OR l.execution_version<>p_expected_version OR l.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Log changed/reversed; reload before correction' USING ERRCODE='40001'; END IF;
   IF reason IS NULL THEN RAISE EXCEPTION 'Correction/reversal reason required' USING ERRCODE='23514'; END IF;
   PERFORM taskpulse_private.assert_open_date(l.user_id,l.log_date);
   PERFORM taskpulse_private.assert_task_open_date(tid,l.log_date);
   IF p_command='reverse_log' THEN
    RAISE EXCEPTION 'Log reversal awaits approved retention/correction policy' USING ERRCODE='23514';
   END IF;
   before_safe:=jsonb_build_object('hours',l.hours_worked,'date',l.log_date,'requested_delta',l.requested_progress_delta,
    'effective_delta',l.effective_progress_delta,'version',l.execution_version,'participant_version',l.participant_version);
   IF requested<>0 AND EXISTS(SELECT 1 FROM taskpulse_private.participant_versions pv
    WHERE pv.task_id=tid AND pv.version=l.participant_version AND (pv.effective_at AT TIME ZONE 'UTC')::date>day) THEN
    RAISE EXCEPTION 'Backdated progress before the captured share version requires reconciliation' USING ERRCODE='23514'; END IF;
   delta_changed:=requested IS DISTINCT FROM coalesce(l.requested_progress_delta,l.progress_delta,0);
   IF l.effective_progress_delta IS NULL AND delta_changed THEN
    RAISE EXCEPTION 'Historical applied effect is unknown; progress correction requires audited reconciliation' USING ERRCODE='23514'; END IF;
   prior:=coalesce(l.effective_progress_delta,0);
   IF delta_changed THEN
    base:=coalesce(t.progress_percentage,0)-prior;
    IF base NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'Prior effect cannot be reversed within bounds; preserve manual correction and reconcile' USING ERRCODE='40001'; END IF;
    target:=greatest(0,least(100,base+requested)); effective:=target-base;
    PERFORM taskpulse_private.assert_progress_owner(tid,effective-prior);
    UPDATE public.tasks SET progress_percentage=target WHERE id=tid;
    SELECT v.shares INTO shares FROM taskpulse_private.participant_versions v WHERE v.task_id=tid AND v.version=t.participant_version;
    PERFORM taskpulse_private.apply_credit(tid,-(effective-prior)*coalesce(t.task_scale,0)/100,shares,t.assignee_id);
    PERFORM taskpulse_private.apply_credit(tid,(effective-prior)*coalesce(l.credit_scale,0)/100,l.credit_shares,l.user_id);
   ELSE effective:=l.effective_progress_delta; END IF;
   -- Attribution remains the original earned version, even after share changes.
   eid:=l.id; version:=l.execution_version+1; shares:=l.credit_shares; share_version:=l.participant_version; scale:=l.credit_scale;
   UPDATE public.daily_task_logs SET log_date=day,hours_worked=hours,requested_progress_delta=requested,
    effective_progress_delta=effective,progress_delta=CASE WHEN effective IS NULL THEN progress_delta ELSE effective END,
    update_notes=input_notes,raw_links=links,execution_version=version WHERE id=eid;
  ELSE
   base:=coalesce(t.progress_percentage,0); target:=greatest(0,least(100,base+requested)); effective:=target-base;
   PERFORM taskpulse_private.assert_progress_owner(tid,effective);
   UPDATE public.tasks SET progress_percentage=target WHERE id=tid;
   share_version:=t.participant_version; scale:=t.task_scale;
   IF requested<>0 AND EXISTS(SELECT 1 FROM taskpulse_private.participant_versions pv WHERE pv.task_id=tid AND pv.version=share_version
    AND (pv.effective_at AT TIME ZONE 'UTC')::date>day) THEN
    RAISE EXCEPTION 'Backdated credit before the effective share version requires reconciliation' USING ERRCODE='23514'; END IF;
   SELECT v.shares INTO shares FROM taskpulse_private.participant_versions v WHERE v.task_id=tid AND v.version=share_version;
   version:=1;
   INSERT INTO public.daily_task_logs(task_id,user_id,log_date,hours_worked,progress_delta,requested_progress_delta,
    effective_progress_delta,execution_version,update_notes,raw_links,participant_version,credit_shares,credit_scale,effect_contract)
    VALUES(tid,actor,day,hours,effective,requested,effective,version,input_notes,links,share_version,shares,scale,'m02-effective-v1') RETURNING id INTO eid;
  END IF;
  mv:=taskpulse_private.refresh_task_metrics(tid,p_operation_id,least(day,coalesce(l.log_date,day)));
  after_safe:=jsonb_build_object('hours',hours,'date',day,'requested_delta',requested,'effective_delta',effective,'version',version,'participant_version',share_version);
  INSERT INTO taskpulse_private.log_revisions(log_id,version,actor_id,operation_id,command,before_data,after_data,reason)
   VALUES(eid,version,actor,p_operation_id,p_command,before_safe,after_safe,reason);
  IF effective IS NOT NULL THEN
   INSERT INTO taskpulse_private.earned_credit_events(log_id,task_id,operation_id,actor_id,participant_version,shares,credit_scale,effective_delta,source_version)
    VALUES(eid,tid,p_operation_id,actor,share_version,shares,scale,effective-prior,version);
  END IF;
  result:=jsonb_build_object('logId',eid,'taskId',tid,'taskTag',t.task_tag,'version',version,'metricVersion',mv,
   'requestedDelta',requested,'effectiveDelta',effective);
 END IF;
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
  VALUES(actor,role::text,p_command,CASE WHEN p_command LIKE '%timer' THEN 'task_timers' ELSE 'daily_task_logs' END,
   eid,ARRAY['execution'],jsonb_build_object('before',before_safe,'after',coalesce(after_safe,result),'reason',reason,
    'task_before',jsonb_build_object('id',t.id,'progress',t.progress_percentage,'productivity',t.task_productivity,'metric_version',t.metric_version),
    'task_after',(SELECT jsonb_build_object('id',id,'progress',progress_percentage,'productivity',task_productivity,'metric_version',metric_version)
      FROM public.tasks WHERE id=tid)),p_operation_id);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
  VALUES(actor,p_command,p_operation_id,request,eid,result);
 RETURN result;
END $$;

CREATE FUNCTION public.create_task_log(p_task_id uuid,p_payload jsonb,p_operation_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT taskpulse_private.execution_command('create_log',p_task_id,NULL,p_payload,NULL,p_operation_id);
$$;
REVOKE ALL ON FUNCTION public.create_task_log(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_task_log(uuid,jsonb,uuid) TO authenticated;

CREATE FUNCTION public.correct_task_log(p_log_id uuid,p_payload jsonb,p_operation_id uuid,p_expected_version bigint) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT taskpulse_private.execution_command('correct_log',NULL,p_log_id,p_payload,p_expected_version,p_operation_id);
$$;
REVOKE ALL ON FUNCTION public.correct_task_log(uuid,jsonb,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.correct_task_log(uuid,jsonb,uuid,bigint) TO authenticated;

CREATE FUNCTION public.reverse_task_log(p_log_id uuid,p_payload jsonb,p_operation_id uuid,p_expected_version bigint) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT taskpulse_private.execution_command('reverse_log',NULL,p_log_id,p_payload,p_expected_version,p_operation_id);
$$;
REVOKE ALL ON FUNCTION public.reverse_task_log(uuid,jsonb,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reverse_task_log(uuid,jsonb,uuid,bigint) TO authenticated;

CREATE FUNCTION public.start_task_timer(p_task_id uuid,p_payload jsonb,p_operation_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT taskpulse_private.execution_command('start_timer',p_task_id,NULL,p_payload,NULL,p_operation_id);
$$;
REVOKE ALL ON FUNCTION public.start_task_timer(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.start_task_timer(uuid,jsonb,uuid) TO authenticated;

CREATE FUNCTION public.stop_task_timer(p_timer_id uuid,p_payload jsonb,p_operation_id uuid,p_expected_version bigint) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT taskpulse_private.execution_command('stop_timer',NULL,p_timer_id,p_payload,p_expected_version,p_operation_id);
$$;
REVOKE ALL ON FUNCTION public.stop_task_timer(uuid,jsonb,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.stop_task_timer(uuid,jsonb,uuid,bigint) TO authenticated;

CREATE FUNCTION public.discard_task_timer(p_timer_id uuid,p_payload jsonb,p_operation_id uuid,p_expected_version bigint) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT taskpulse_private.execution_command('discard_timer',NULL,p_timer_id,p_payload,p_expected_version,p_operation_id);
$$;
REVOKE ALL ON FUNCTION public.discard_task_timer(uuid,jsonb,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.discard_task_timer(uuid,jsonb,uuid,bigint) TO authenticated;

-- Retain compatible recomputation entry point, but no standalone unreceipted
-- progress deltas. Future modules should call the private recomputation adapter.
CREATE OR REPLACE FUNCTION public.recalculate_task_metrics(p_task_id uuid,p_progress_delta numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF public.get_user_role() IS NULL OR NOT(public.is_task_assignee(p_task_id) OR public.get_user_role() IN ('managing_director','project_engineer')) THEN
  RAISE EXCEPTION 'Assigned actor or task manager required' USING ERRCODE='42501'; END IF;
 IF p_progress_delta IS DISTINCT FROM 0::numeric THEN RAISE EXCEPTION 'Progress requires an atomic execution command' USING ERRCODE='23514'; END IF;
 PERFORM taskpulse_private.refresh_task_metrics(p_task_id,gen_random_uuid(),NULL);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION taskpulse_private.audit_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n jsonb := CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
        o jsonb := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END; fields text[]; changes jsonb;
BEGIN
  SELECT coalesce(array_agg(k ORDER BY k),ARRAY[]::text[]) INTO fields
    FROM (SELECT jsonb_object_keys(n || o) k) s WHERE n->k IS DISTINCT FROM o->k;
  SELECT coalesce(jsonb_object_agg(k,jsonb_build_object('before',o->k,'after',n->k)),'{}'::jsonb) INTO changes
    FROM unnest(fields) k WHERE k=ANY(ARRAY['role','is_active','assignee_id','reviewer_id','user_id','task_id',
      'participant_credit_mode','participant_version','share_units','is_primary','review_approved','reviewed_at',
      'is_validated','validated_by','is_override','override_by','status','task_scale','priority','task_productivity','score','progress_percentage','hours_worked','progress_delta','requested_progress_delta','effective_progress_delta','execution_version','metric_version','reversed_at','started_at','stopped_at','elapsed_seconds','source_timer_id','generated_log_id']);
  INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes)
    VALUES(auth.uid(),coalesce(public.get_user_role()::text,'system'),TG_OP,TG_TABLE_NAME,
      coalesce(n->>'id',o->>'id')::uuid,fields,changes);
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE OR REPLACE FUNCTION taskpulse_private.guard_write() RETURNS trigger
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
        RAISE EXCEPTION 'Terminal creation is temporarily unavailable until checklist and review checks are ready' USING ERRCODE='23514'; END IF;
      IF NOT manager OR NEW.participant_credit_mode<>'legacy' OR NEW.participant_version<>0 OR
        NEW.task_productivity IS DISTINCT FROM 0::numeric OR NEW.freshness<>'Fresh' THEN
        RAISE EXCEPTION 'Protected task fields' USING ERRCODE='42501'; END IF;
      -- Preserve legacy creation eligibility; no scoring rule is introduced.
    ELSE
      IF NEW.status IS DISTINCT FROM OLD.status AND (NEW.status IN ('Done','Discarded') OR OLD.status IN ('Done','Discarded')) THEN
        RAISE EXCEPTION 'Terminal transitions are temporarily unavailable until checklist, review and reason checks are ready' USING ERRCODE='23514'; END IF;
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

COMMIT;
