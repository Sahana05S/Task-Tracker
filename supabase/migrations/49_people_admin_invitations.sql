-- People admin: invite-only accounts and director-managed members.
--
-- Before this migration anyone with the site URL could create an account, and
-- handle_new_user() made them an ACTIVE member of the default company. Now:
--
--   * A managing director invites a person by email (name, employee ID, role).
--     The invitation lives in public.member_invitations, inside the director's
--     company.
--   * When that email signs up (password form or Google), handle_new_user()
--     applies the invitation: company, role, name and employee ID, active.
--   * Server-created accounts keep working: raw_app_meta_data is writable only
--     by the service role/admin API, so an organization_id there (the seed
--     tool) or taskpulse_provisioned=true (default company) is trusted as before.
--   * Anyone else gets an INACTIVE profile with no company: they can sign in but
--     see nothing. If they are invited later, the next sign-in attaches them
--     (the same function also runs when auth.users.last_sign_in_at changes).
--   * public.people_command() lets a director invite, revoke an invitation,
--     change a member's role or details, and deactivate or reactivate them.
--     A director cannot change their own role or deactivate themselves, and a
--     company always keeps at least one active managing director (enforced by a
--     trigger, so direct table writes are covered too).
--
-- No scoring, award or task rule changes. Ends with m15_secure().
BEGIN;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
CREATE TABLE public.member_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  email text NOT NULL CHECK (email = lower(btrim(email)) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(email) <= 320),
  full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 120),
  employee_id text NOT NULL CHECK (employee_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$'),
  role public.user_role NOT NULL DEFAULT 'team_member',
  invited_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  accepted_user uuid REFERENCES public.users(id),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.users(id),
  CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);
-- One open invitation per address across all companies, so a sign-up can only
-- ever match one company.
CREATE UNIQUE INDEX member_invitations_one_open ON public.member_invitations(email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX member_invitations_company ON public.member_invitations(organization_id, created_at DESC);

ALTER TABLE public.member_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_invitations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.member_invitations TO authenticated;
-- Directors read their company's invitations; every write goes through people_command().
CREATE POLICY member_invitations_director_read ON public.member_invitations
  FOR SELECT TO authenticated
  USING (public.get_user_role() = 'managing_director' AND organization_id = public.current_organization());

-- ---------------------------------------------------------------------------
-- Provisioning: invitation-only access
-- ---------------------------------------------------------------------------
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
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;
  addr := lower(btrim(NEW.email));

  SELECT * INTO invite FROM public.member_invitations
   WHERE email = addr AND accepted_at IS NULL AND revoked_at IS NULL
   FOR UPDATE;

  -- Sign-in of an existing account: attach it only if it has no company yet and
  -- an invitation is waiting. Nothing else changes on sign-in.
  IF TG_OP = 'UPDATE' THEN
    IF invite.id IS NULL THEN RETURN NEW; END IF;
    SELECT * INTO existing FROM public.users WHERE id = NEW.id FOR UPDATE;
    IF existing.id IS NULL OR existing.organization_id IS NOT NULL THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM public.users u WHERE u.employee_id = invite.employee_id AND u.id <> NEW.id) THEN
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

  IF invite.id IS NOT NULL AND org = invite.organization_id
     AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.employee_id = invite.employee_id) THEN
    INSERT INTO public.users (id, employee_id, full_name, email, organization_id, role, is_active)
    VALUES (NEW.id, invite.employee_id, invite.full_name, NEW.email, org, invite.role, true)
    ON CONFLICT (id) DO NOTHING;
    UPDATE public.member_invitations SET accepted_at = now(), accepted_user = NEW.id WHERE id = invite.id;
    INSERT INTO taskpulse_private.audit_events(organization_id, actor_id, actor_role, command, table_name, row_id, changed_fields, protected_changes)
    VALUES (org, NEW.id, 'system', 'accept_invitation', 'users', NEW.id,
            ARRAY['organization_id','role','full_name','employee_id','is_active'], jsonb_build_object('invitationId', invite.id));
    RETURN NEW;
  END IF;
  -- An invitation whose employee ID was taken in the meantime does not grant
  -- access on its own; the director revokes and re-invites.
  IF invite.id IS NOT NULL AND org = invite.organization_id
     AND requested IS DISTINCT FROM invite.organization_id::text THEN
    org := NULL;
  END IF;

  INSERT INTO public.users (id, employee_id, full_name, email, organization_id, is_active)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'employee_id', ''),
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

-- GoTrue updates last_sign_in_at on every sign-in. The loopback test shim's
-- auth.users may not have the column, so the trigger is created only when it exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
              WHERE attrelid = 'auth.users'::regclass AND attname = 'last_sign_in_at' AND NOT attisdropped) THEN
    DROP TRIGGER IF EXISTS on_auth_user_signed_in ON auth.users;
    CREATE TRIGGER on_auth_user_signed_in
      AFTER UPDATE OF last_sign_in_at ON auth.users
      FOR EACH ROW WHEN (NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at)
      EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- A company always keeps an active managing director
-- ---------------------------------------------------------------------------
CREATE FUNCTION taskpulse_private.keep_active_director() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.role = 'managing_director' AND OLD.is_active AND OLD.organization_id IS NOT NULL
     AND (TG_OP = 'DELETE' OR NOT (NEW.role = 'managing_director' AND NEW.is_active))
     AND NOT EXISTS (SELECT 1 FROM public.users u
                      WHERE u.organization_id = OLD.organization_id AND u.id <> OLD.id
                        AND u.role = 'managing_director' AND u.is_active) THEN
    RAISE EXCEPTION 'A company must keep at least one active managing director' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER zz_keep_active_director BEFORE UPDATE OF role, is_active OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION taskpulse_private.keep_active_director();

-- ---------------------------------------------------------------------------
-- Director command
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.people_command(p_command text, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
  org uuid := public.current_organization();
  addr text; name text; emp text; new_role public.user_role; active boolean;
  invite public.member_invitations;
  target public.users;
  changed text[] := ARRAY[]::text[];
BEGIN
  IF me IS NULL OR public.get_user_role() IS DISTINCT FROM 'managing_director' OR org IS NULL THEN
    RAISE EXCEPTION 'Only an active managing director can manage people' USING ERRCODE = '42501';
  END IF;

  IF p_command = 'invite' THEN
    addr := lower(btrim(coalesce(p_payload ->> 'email', '')));
    name := btrim(coalesce(p_payload ->> 'fullName', ''));
    emp := btrim(coalesce(p_payload ->> 'employeeId', ''));
    new_role := coalesce(nullif(p_payload ->> 'role', ''), 'team_member')::public.user_role;
    IF addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(addr) > 320 THEN
      RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE = '23514'; END IF;
    IF length(name) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'Enter a name of up to 120 characters' USING ERRCODE = '23514'; END IF;
    IF emp !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$' THEN
      RAISE EXCEPTION 'Employee ID may use letters, digits, - and _ (up to 40)' USING ERRCODE = '23514'; END IF;
    IF EXISTS (SELECT 1 FROM public.users u WHERE lower(u.email) = addr AND u.organization_id = org) THEN
      RAISE EXCEPTION 'This email already belongs to a member of your company' USING ERRCODE = '23505'; END IF;
    IF EXISTS (SELECT 1 FROM public.users u WHERE u.employee_id = emp)
       OR EXISTS (SELECT 1 FROM public.member_invitations i WHERE i.employee_id = emp AND i.organization_id = org
                   AND i.accepted_at IS NULL AND i.revoked_at IS NULL) THEN
      RAISE EXCEPTION 'Employee ID % is already in use', emp USING ERRCODE = '23505'; END IF;
    BEGIN
      INSERT INTO public.member_invitations(organization_id, email, full_name, employee_id, role, invited_by)
      VALUES (org, addr, name, emp, new_role, me) RETURNING * INTO invite;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'This email already has an open invitation' USING ERRCODE = '23505';
    END;
    INSERT INTO taskpulse_private.audit_events(organization_id, actor_id, actor_role, command, table_name, row_id, changed_fields, protected_changes)
    VALUES (org, me, 'managing_director', 'invite_member', 'member_invitations', invite.id,
            ARRAY['email','full_name','employee_id','role'], jsonb_build_object('role', new_role));
    RETURN jsonb_build_object('invitationId', invite.id, 'email', invite.email, 'role', invite.role);

  ELSIF p_command = 'revoke' THEN
    SELECT * INTO invite FROM public.member_invitations
     WHERE id = (p_payload ->> 'invitationId')::uuid AND organization_id = org FOR UPDATE;
    IF invite.id IS NULL THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '42501'; END IF;
    IF invite.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'This invitation was already accepted' USING ERRCODE = '23514'; END IF;
    IF invite.revoked_at IS NULL THEN
      UPDATE public.member_invitations SET revoked_at = now(), revoked_by = me WHERE id = invite.id;
      INSERT INTO taskpulse_private.audit_events(organization_id, actor_id, actor_role, command, table_name, row_id, changed_fields)
      VALUES (org, me, 'managing_director', 'revoke_invitation', 'member_invitations', invite.id, ARRAY['revoked_at']);
    END IF;
    RETURN jsonb_build_object('invitationId', invite.id, 'revoked', true);

  ELSIF p_command = 'update' THEN
    SELECT * INTO target FROM public.users
     WHERE id = (p_payload ->> 'userId')::uuid AND organization_id = org FOR UPDATE;
    IF target.id IS NULL THEN RAISE EXCEPTION 'Member not found' USING ERRCODE = '42501'; END IF;
    new_role := coalesce(nullif(p_payload ->> 'role', '')::public.user_role, target.role);
    active := coalesce((p_payload ->> 'isActive')::boolean, target.is_active);
    name := coalesce(nullif(btrim(p_payload ->> 'fullName'), ''), target.full_name);
    emp := coalesce(nullif(btrim(p_payload ->> 'employeeId'), ''), target.employee_id);
    IF target.id = me AND (new_role <> target.role OR active <> target.is_active) THEN
      RAISE EXCEPTION 'You cannot change your own role or deactivate yourself' USING ERRCODE = '42501'; END IF;
    IF length(name) > 120 THEN RAISE EXCEPTION 'Enter a name of up to 120 characters' USING ERRCODE = '23514'; END IF;
    IF emp <> target.employee_id THEN
      IF emp !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$' THEN
        RAISE EXCEPTION 'Employee ID may use letters, digits, - and _ (up to 40)' USING ERRCODE = '23514'; END IF;
      IF EXISTS (SELECT 1 FROM public.users u WHERE u.employee_id = emp AND u.id <> target.id) THEN
        RAISE EXCEPTION 'Employee ID % is already in use', emp USING ERRCODE = '23505'; END IF;
    END IF;
    IF new_role <> target.role THEN changed := array_append(changed, 'role'); END IF;
    IF active <> target.is_active THEN changed := array_append(changed, 'is_active'); END IF;
    IF name <> target.full_name THEN changed := array_append(changed, 'full_name'); END IF;
    IF emp <> target.employee_id THEN changed := array_append(changed, 'employee_id'); END IF;
    IF cardinality(changed) > 0 THEN
      UPDATE public.users SET role = new_role, is_active = active, full_name = name, employee_id = emp
       WHERE id = target.id;
      INSERT INTO taskpulse_private.audit_events(organization_id, actor_id, actor_role, command, table_name, row_id, changed_fields, protected_changes)
      VALUES (org, me, 'managing_director', 'update_member', 'users', target.id, changed,
              jsonb_build_object('from', jsonb_build_object('role', target.role, 'isActive', target.is_active),
                                 'to', jsonb_build_object('role', new_role, 'isActive', active)));
    END IF;
    RETURN jsonb_build_object('userId', target.id, 'role', new_role, 'isActive', active,
                              'fullName', name, 'employeeId', emp, 'changed', to_jsonb(changed));
  END IF;

  RAISE EXCEPTION 'Unknown people command' USING ERRCODE = '22023';
END $$;

REVOKE ALL ON FUNCTION public.people_command(text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.people_command(text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION taskpulse_private.keep_active_director() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
SELECT taskpulse_private.m15_secure();
