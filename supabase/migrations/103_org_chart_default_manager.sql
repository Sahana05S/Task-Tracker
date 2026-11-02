-- ===========================================================================
-- TaskPulse - org chart: new people start under the director again
-- (forward only; 2 November 2026)
--
-- Migration 65 places a new non-director under the company's first active
-- managing director, but only in a BEFORE INSERT trigger. Since migration 94 a
-- profile is usually inserted without a company (unconfirmed invitations,
-- seeded accounts) and the company is attached by a later UPDATE, so those
-- people never got a manager and the org chart showed everyone side by side.
--
-- 1. default_user_manager also runs when a profile's company is attached or
--    changed (UPDATE OF organization_id), with the same rule as before.
-- 2. People who still have no manager are placed as migration 65 did, except
--    anyone whose manager the director cleared on purpose (an update_member
--    audit event that changed reports_to).
--
-- No scoring, award, attendance or permission rule changes.
-- ===========================================================================
BEGIN;

CREATE OR REPLACE FUNCTION taskpulse_private.default_user_manager() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NEW.reports_to IS NULL AND NEW.role<>'managing_director' AND NEW.organization_id IS NOT NULL
    AND (TG_OP='INSERT' OR OLD.organization_id IS DISTINCT FROM NEW.organization_id) THEN
  SELECT u.id INTO NEW.reports_to FROM public.users u
   WHERE u.organization_id=NEW.organization_id AND u.role='managing_director' AND u.is_active AND u.id<>NEW.id
   ORDER BY u.created_at,u.id LIMIT 1;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.default_user_manager() FROM PUBLIC,anon,authenticated,service_role;

-- Still after aaa_m15_organization and before zz_m65_user_placement.
DROP TRIGGER IF EXISTS zy_m65_default_manager ON public.users;
CREATE TRIGGER zy_m65_default_manager BEFORE INSERT OR UPDATE OF organization_id ON public.users
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.default_user_manager();

UPDATE public.users u SET reports_to=(SELECT m.id FROM public.users m
  WHERE m.organization_id=u.organization_id AND m.role='managing_director' AND m.is_active AND m.id<>u.id
  ORDER BY m.created_at,m.id LIMIT 1)
WHERE u.reports_to IS NULL AND u.role<>'managing_director' AND u.organization_id IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.users m
   WHERE m.organization_id=u.organization_id AND m.role='managing_director' AND m.is_active AND m.id<>u.id)
  AND NOT EXISTS(SELECT 1 FROM taskpulse_private.audit_events e
   WHERE e.table_name='users' AND e.row_id=u.id AND e.command='update_member'
     AND 'reports_to'=ANY(e.changed_fields));

COMMIT;
SELECT taskpulse_private.m15_secure();
