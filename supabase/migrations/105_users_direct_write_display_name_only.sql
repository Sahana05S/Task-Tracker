-- 105: directors no longer write public.users directly (security audit, 2 November 2026).
--
-- public.users.email is unique across every company (01), and the director's
-- table policy m01_admin (10) together with guard_write's director exemption (94)
-- let a managing director PATCH any column of their company's users rows through
-- the API. Setting an email then answered "already exists" for an address held in
-- another company, and a row holding an address made that person's sign-up fail
-- in every company (handle_new_user's insert hits users_email_key). Directors
-- change people through people_command, which never writes email and runs with
-- owner rights; the app's only direct write is a member renaming themselves.
-- guard_write now limits every role's direct writes to the display name.
--
-- Rewritten from the live definition at 104 (pg_get_functiondef). Function only.

BEGIN;

CREATE OR REPLACE FUNCTION taskpulse_private.guard_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE role public.user_role; manager boolean; allowed text[]; n jsonb; o jsonb; owner_name name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(relowner) INTO owner_name FROM pg_catalog.pg_class WHERE oid=TG_RELID;
  IF current_user IN (owner_name,'postgres','supabase_admin') THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
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
  ELSIF TG_TABLE_NAME='users' THEN
    -- The sign-in email belongs to auth.users; a direct write changes only a display name.
    -- Migration 105: this now holds for directors too. Roles, activation, placement and
    -- invitations go through people_command (owner rights, so not checked here); a direct
    -- email write by a director could probe or block addresses of other companies.
    IF TG_OP<>'UPDATE' OR n-ARRAY['full_name','updated_at'] IS DISTINCT FROM o-ARRAY['full_name','updated_at'] THEN
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
END $function$;

SELECT taskpulse_private.m15_secure();
COMMIT;
