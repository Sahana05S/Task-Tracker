-- ===========================================================================
-- TaskPulse - account and device hardening (forward only; audit of 31 October 2026)
--
-- 1. handle_new_user applies an invitation only once the address is confirmed
--    (email_confirmed_at set). An unconfirmed sign-up with an invited address
--    gets the usual company-less inactive profile, and the first confirmed
--    sign-in attaches it. Employee-ID collisions are judged within the
--    invitation's company (IDs are unique per company since migration 39), and
--    a self-registered account cannot pick its own employee ID.
-- 2. guard_write no longer lets a member rewrite public.users.email; the
--    sign-in address lives in auth.users.
-- 3. Deactivating a member disables their phones and drops their pending
--    pushes (trigger on public.users.is_active).
-- 4. Phone registration works at all: PostgreSQL caps a regular expression's
--    repetition count at 255, so migration 91's token pattern {20,4096} raised
--    "invalid repetition count" on every device_register call and the table
--    CHECK could never pass. The pattern is now + with a separate length check.
--    device_register also treats one push token as one phone with one owner
--    across companies.
-- 5. task_credit_summary returns a member's own credit only (managers: all).
-- ===========================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  org uuid;
  requested text;
  invite public.member_invitations;
  existing public.users;
  addr text;
  confirmed boolean;
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;
  addr := lower(btrim(NEW.email));
  -- Only a confirmed address accepts an invitation. Read through jsonb: the
  -- loopback test shim's auth.users has no such column and counts as confirmed.
  confirmed := NOT (to_jsonb(NEW) ? 'email_confirmed_at') OR (to_jsonb(NEW) ->> 'email_confirmed_at') IS NOT NULL;

  SELECT * INTO invite FROM public.member_invitations
   WHERE email = addr AND accepted_at IS NULL AND revoked_at IS NULL
   FOR UPDATE;

  -- Sign-in of an existing account: attach it only if it has no company yet and
  -- an invitation is waiting. Nothing else changes on sign-in.
  IF TG_OP = 'UPDATE' THEN
    IF invite.id IS NULL OR NOT confirmed THEN RETURN NEW; END IF;
    SELECT * INTO existing FROM public.users WHERE id = NEW.id FOR UPDATE;
    IF existing.id IS NULL OR existing.organization_id IS NOT NULL THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM public.users u WHERE u.employee_id = invite.employee_id
                AND u.organization_id = invite.organization_id AND u.id <> NEW.id) THEN
      RETURN NEW; -- The director must fix the employee ID; never fail a sign-in.
    END IF;
    UPDATE public.users
       SET organization_id = invite.organization_id, role = invite.role,
           full_name = invite.full_name, employee_id = invite.employee_id, is_active = true
     WHERE id = NEW.id;
    UPDATE public.member_invitations SET accepted_at = now(), accepted_user = NEW.id WHERE id = invite.id;
    INSERT INTO taskpulse_private.audit_events(organization_id, actor_id, actor_role, command, table_name, row_id, changed_fields, protected_changes)
    VALUES (invite.organization_id, NEW.id, 'system', 'accept_invitation', 'users', NEW.id,
            ARRAY['organization_id','role','full_name','employee_id','is_active'], jsonb_build_object('invitationId', invite.id));
    RETURN NEW;
  END IF;

  -- raw_app_meta_data is server-controlled (service role / admin API only);
  -- raw_user_meta_data is not, so only the former may grant membership.
  requested := NEW.raw_app_meta_data ->> 'organization_id';
  IF requested ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id INTO org FROM public.organizations WHERE id = requested::uuid AND status = 'active';
  ELSIF invite.id IS NOT NULL THEN
    org := invite.organization_id;
  ELSIF requested IS NULL AND (NEW.raw_app_meta_data ->> 'taskpulse_provisioned') = 'true' THEN
    SELECT id INTO org FROM public.organizations WHERE is_default AND status = 'active';
  END IF;

  IF confirmed AND invite.id IS NOT NULL AND org = invite.organization_id
     AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.employee_id = invite.employee_id
                      AND u.organization_id = invite.organization_id) THEN
    INSERT INTO public.users (id, employee_id, full_name, email, organization_id, role, is_active)
    VALUES (NEW.id, invite.employee_id, invite.full_name, NEW.email, org, invite.role, true)
    ON CONFLICT (id) DO NOTHING;
    UPDATE public.member_invitations SET accepted_at = now(), accepted_user = NEW.id WHERE id = invite.id;
    INSERT INTO taskpulse_private.audit_events(organization_id, actor_id, actor_role, command, table_name, row_id, changed_fields, protected_changes)
    VALUES (org, NEW.id, 'system', 'accept_invitation', 'users', NEW.id,
            ARRAY['organization_id','role','full_name','employee_id','is_active'], jsonb_build_object('invitationId', invite.id));
    RETURN NEW;
  END IF;
  -- An unconfirmed address, or an invitation whose employee ID was taken in
  -- the meantime, grants nothing yet: the profile below has no company, and
  -- the first confirmed sign-in attaches it (UPDATE path above).
  IF invite.id IS NOT NULL AND org = invite.organization_id
     AND requested IS DISTINCT FROM invite.organization_id::text THEN
    org := NULL;
  END IF;

  INSERT INTO public.users (id, employee_id, full_name, email, organization_id, is_active)
  VALUES (
    NEW.id,
    -- A self-registered account without a company gets a generated ID; its own
    -- metadata must not squat an employee ID a director may still invite.
    COALESCE(
      CASE WHEN org IS NOT NULL THEN NULLIF(NEW.raw_user_meta_data ->> 'employee_id', '') END,
      'EMP-' || UPPER(LEFT(REPLACE(NEW.id::text, '-', ''), 8))
    ),
    COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
      NULLIF(NEW.raw_user_meta_data ->> 'name', ''),
      SPLIT_PART(NEW.email, '@', 1)
    ),
    NEW.email,
    org,
    -- Not invited and not server-created: no company, inactive, sees only itself.
    org IS NOT NULL
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;


-- Confirmation itself attaches a waiting invitation, even before the first
-- sign-in refresh. Created only where auth.users has the column (not in the
-- loopback test shim).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
              WHERE attrelid = 'auth.users'::regclass AND attname = 'email_confirmed_at' AND NOT attisdropped) THEN
    DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
    CREATE TRIGGER on_auth_user_confirmed
      AFTER UPDATE OF email_confirmed_at ON auth.users
      FOR EACH ROW WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
      EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

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
  ELSIF TG_TABLE_NAME='users' AND role<>'managing_director' THEN
    -- The sign-in email belongs to auth.users; a member edits only their display name.
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


-- ---------------------------------------------------------------------------
-- Push tokens: a valid pattern (no repetition count above 255)
-- ---------------------------------------------------------------------------
DO $$
DECLARE con text;
BEGIN
  FOR con IN SELECT conname FROM pg_catalog.pg_constraint
              WHERE conrelid='taskpulse_private.user_devices'::regclass AND contype='c'
                AND pg_catalog.pg_get_constraintdef(oid) LIKE '%4096%' LOOP
    EXECUTE format('ALTER TABLE taskpulse_private.user_devices DROP CONSTRAINT %I', con);
  END LOOP;
END $$;
ALTER TABLE taskpulse_private.user_devices ADD CONSTRAINT user_devices_token_format
  CHECK (token ~ '^[A-Za-z0-9:_.-]+$' AND length(token) BETWEEN 20 AND 4096);

-- ---------------------------------------------------------------------------
-- A deactivated member's phones stop receiving notifications at once
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION taskpulse_private.deactivated_member_cleanup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF OLD.is_active AND NOT NEW.is_active THEN
    DELETE FROM taskpulse_private.push_outbox o USING taskpulse_private.user_devices d
     WHERE o.device_id=d.id AND d.user_id=NEW.id AND o.status IN ('pending','failed');
    UPDATE taskpulse_private.user_devices
       SET disabled_at=clock_timestamp(), disabled_reason='Member deactivated'
     WHERE user_id=NEW.id AND disabled_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_deactivated_member_cleanup ON public.users;
CREATE TRIGGER zz_deactivated_member_cleanup AFTER UPDATE OF is_active ON public.users
  FOR EACH ROW EXECUTE FUNCTION taskpulse_private.deactivated_member_cleanup();

CREATE OR REPLACE FUNCTION public.device_register(p_token text,p_platform text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); BEGIN
 IF actor IS NULL OR org IS NULL OR public.get_user_role() IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9:_.-]+$' OR length(p_token) NOT BETWEEN 20 AND 4096 THEN
  RAISE EXCEPTION 'A valid device token is required' USING ERRCODE='23514'; END IF;
 IF p_platform IS NULL OR p_platform NOT IN ('android','ios') THEN
  RAISE EXCEPTION 'Platform must be android or ios' USING ERRCODE='23514'; END IF;
 -- The phone now belongs to whoever signed in on it last, in whichever company:
 -- one installed app is one token, so earlier owners stop receiving its pushes.
 DELETE FROM taskpulse_private.user_devices WHERE token=p_token AND (organization_id<>org OR user_id<>actor);
 INSERT INTO taskpulse_private.user_devices AS d(organization_id,user_id,token,platform)
 VALUES(org,actor,p_token,p_platform)
 ON CONFLICT (organization_id,token) DO UPDATE SET user_id=EXCLUDED.user_id,platform=EXCLUDED.platform,
  last_seen_at=clock_timestamp(),disabled_at=NULL,disabled_reason=NULL;
 -- At most ten phones per member: the least recently seen go first.
 DELETE FROM taskpulse_private.user_devices WHERE user_id=actor AND id NOT IN
  (SELECT id FROM taskpulse_private.user_devices WHERE user_id=actor ORDER BY last_seen_at DESC,id LIMIT 10);
 RETURN jsonb_build_object('registered',true);
END $$;


CREATE OR REPLACE FUNCTION public.task_credit_summary() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE result jsonb; BEGIN
 IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 -- Members see their own credit; managers see the team's (the daily_task_logs rule).
 SELECT coalesce(jsonb_agg(jsonb_build_object('task_id',task_id,'user_id',user_id,'scaled_credit',scaled_credit)),'[]')
  INTO result FROM taskpulse_private.task_credit_balances
  WHERE public.get_user_role() IN ('managing_director','project_engineer') OR user_id=auth.uid();
 RETURN result;
END $$;


SELECT taskpulse_private.m15_secure();
COMMIT;
