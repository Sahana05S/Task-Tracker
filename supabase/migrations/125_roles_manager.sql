-- ===========================================================================
-- TaskPulse - three roles: Managing Director, Manager, Team Member
-- (forward only; 5 November 2026)
--
-- User decision (5 November 2026): "No PE or specific roles, just MD, Manager,
-- Team member. Right now no one is assigned the manager role but it should be
-- an existing role for the future."
--
-- * The enum public.user_role keeps its four values. 'project_engineer' is the
--   internal code for **Manager** (every existing check that reads
--   get_user_role() IN ('managing_director','project_engineer') keeps working,
--   so about 55 earlier migrations need no rewrite). The interface says Manager.
-- * 'data_manager' is retired. Its only extra power, validating records, is
--   already held by Manager. people_command no longer invites anyone as, or
--   moves anyone into, data_manager (23514).
-- * Data: every project_engineer and data_manager member, and every open
--   invitation with either role, becomes team_member ("no one is assigned the
--   manager role right now"). Each change writes a protected audit row
--   (command 'retire_role', actor 'system') with the old and new role, like
--   people_command's update_member rows. The counts are raised as NOTICEs.
-- * Policy audiences store role names as text; every stored value stays a
--   valid enum value, so nothing is rewritten. Audiences that name
--   project_engineer (Manager) or data_manager are counted in a NOTICE; they
--   match nobody until someone is made a Manager again.
--
-- people_command is patched from its live definition (65); each fragment must
-- occur exactly once. No scoring, award, mission or checklist rule changes.
-- ===========================================================================
BEGIN;

CREATE FUNCTION pg_temp.m125_patch(fn regprocedure, frag text, repl text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(fn);
BEGIN
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION '% does not contain this fragment exactly once; update migration 125: %',fn,left(frag,80); END IF;
 EXECUTE replace(def,frag,repl);
END $$;

-- 1. Data Manager can no longer be given ------------------------------------
SELECT pg_temp.m125_patch('public.people_command(text,jsonb)',
 $f$    new_role := coalesce(nullif(p_payload ->> 'role', ''), 'team_member')::public.user_role;
$f$,
 $f$    new_role := coalesce(nullif(p_payload ->> 'role', ''), 'team_member')::public.user_role;
    IF new_role = 'data_manager' THEN
      RAISE EXCEPTION 'The Data Manager role is retired; choose Manager or Team Member' USING ERRCODE = '23514'; END IF;
$f$);

SELECT pg_temp.m125_patch('public.people_command(text,jsonb)',
 $f$    new_role := coalesce(nullif(p_payload ->> 'role', '')::public.user_role, target.role);
$f$,
 $f$    new_role := coalesce(nullif(p_payload ->> 'role', '')::public.user_role, target.role);
    IF new_role = 'data_manager' AND new_role IS DISTINCT FROM target.role THEN
      RAISE EXCEPTION 'The Data Manager role is retired; choose Manager or Team Member' USING ERRCODE = '23514'; END IF;
$f$);

-- 1b. Messages that reach the interface say Manager ----------------------------
-- Whichever live function carries one of these messages (month setup, sub-missions,
-- labels) gets the new wording; only the message text changes.
DO $$
DECLARE r record; def text; pair text[];
  pairs text[][] := ARRAY[
    ARRAY['Only an active managing director or project engineer can set up a month',
          'Only an active managing director or manager can set up a month'],
    ARRAY['Only managing directors and project engineers can create sub-missions',
          'Only managing directors and managers can create sub-missions'],
    ARRAY['Only the managing director and project engineers manage labels',
          'Only the managing director and managers manage labels'],
    ARRAY['ask a project engineer or the managing director to create it',
          'ask a manager or the managing director to create it']];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY pairs LOOP
    FOR r IN SELECT p.oid FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname IN ('public','taskpulse_private') AND p.prokind = 'f'
                AND strpos(p.prosrc, pair[1]) > 0 LOOP
      def := pg_catalog.pg_get_functiondef(r.oid);
      EXECUTE replace(def, pair[1], pair[2]);
    END LOOP;
  END LOOP;
END $$;

-- 2. Members: project engineers and data managers become team members -------
DO $$
DECLARE n_pe integer; n_dm integer; n_inv integer; n_pol integer;
BEGIN
  CREATE TEMP TABLE m125_members ON COMMIT DROP AS
    SELECT id, organization_id, role::text AS old_role
      FROM public.users
     WHERE role IN ('project_engineer','data_manager');
  SELECT count(*) FILTER (WHERE old_role = 'project_engineer'), count(*) FILTER (WHERE old_role = 'data_manager')
    INTO n_pe, n_dm FROM m125_members;

  UPDATE public.users u SET role = 'team_member'
    FROM m125_members m WHERE u.id = m.id;
  INSERT INTO taskpulse_private.audit_events(organization_id, actor_id, actor_role, command, table_name, row_id, changed_fields, protected_changes)
  SELECT m.organization_id, NULL, 'system', 'retire_role', 'users', m.id, ARRAY['role'],
         jsonb_build_object('from', jsonb_build_object('role', m.old_role),
                            'to', jsonb_build_object('role', 'team_member'),
                            'reason', 'Roles are Managing Director, Manager and Team Member (migration 125)')
    FROM m125_members m;

  -- 3. Open invitations get the same change ----------------------------------
  CREATE TEMP TABLE m125_invitations ON COMMIT DROP AS
    SELECT id, organization_id, role::text AS old_role
      FROM public.member_invitations
     WHERE role IN ('project_engineer','data_manager') AND accepted_at IS NULL AND revoked_at IS NULL;
  SELECT count(*) INTO n_inv FROM m125_invitations;
  UPDATE public.member_invitations i SET role = 'team_member'
    FROM m125_invitations m WHERE i.id = m.id;
  INSERT INTO taskpulse_private.audit_events(organization_id, actor_id, actor_role, command, table_name, row_id, changed_fields, protected_changes)
  SELECT m.organization_id, NULL, 'system', 'retire_role', 'member_invitations', m.id, ARRAY['role'],
         jsonb_build_object('from', jsonb_build_object('role', m.old_role),
                            'to', jsonb_build_object('role', 'team_member'),
                            'reason', 'Roles are Managing Director, Manager and Team Member (migration 125)')
    FROM m125_invitations m;

  -- 4. Policy audiences: values stay valid; report the ones naming these roles
  SELECT count(*) INTO n_pol FROM taskpulse_private.policies p
   WHERE p.audience->>'kind' = 'roles'
     AND (p.audience->'roles' ? 'project_engineer' OR p.audience->'roles' ? 'data_manager');

  RAISE NOTICE 'm125: % project engineers and % data managers are now team members', n_pe, n_dm;
  RAISE NOTICE 'm125: % open invitations changed to team member', n_inv;
  RAISE NOTICE 'm125: % policies have a role audience naming Manager or Data Manager (unchanged)', n_pol;
END $$;

COMMIT;
SELECT taskpulse_private.m15_secure();
