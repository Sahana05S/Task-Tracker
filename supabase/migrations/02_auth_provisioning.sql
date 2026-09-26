-- ===========================================================================
-- TaskPulse — Auth Profile Provisioning
--
-- Resolves gap #1 recorded at the bottom of 01_init_schema.sql.
--
-- THIS MIGRATION CHANGES THE SECURITY MODEL. Read before applying.
--
-- The RLS policies in 01 allow only a managing_director to INSERT into
-- public.users. That leaves a new project with no way to create its first
-- profile, and it means the `signup` Server Action cannot work: a user who has
-- just registered is authenticated but has no profile, so they have no role,
-- so they are not a managing_director.
--
-- The trigger below closes that loop the way Supabase recommends: it runs as
-- SECURITY DEFINER on INSERT into auth.users, so it bypasses RLS to provision
-- exactly one matching public.users row.
--
-- What this deliberately does NOT do: it never assigns a privileged role.
-- `role` is omitted from the INSERT so the column default of 'team_member'
-- applies. Promoting the first director is a manual step, documented at the
-- bottom of this file.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Provisioning function
--
-- `full_name` and `employee_id` are read from raw_user_meta_data, which is
-- populated by the `options.data` payload the signup action sends.
--
-- Fallbacks keep the insert viable when a user is created outside the app (for
-- example from the Supabase dashboard, which sends no metadata):
--   full_name   -> the local part of the email address
--   employee_id -> 'EMP-' plus the first 8 hex characters of the user's UUID
--
-- Only the app's own signup form sets these deliberately; the fallbacks exist
-- so a dashboard-created user still lands with a usable profile.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- This app authenticates by email. A phone-only or anonymous auth user has
    -- no address to store in the NOT NULL email column, so skip provisioning
    -- rather than abort the signup transaction.
    IF NEW.email IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.users (id, employee_id, full_name, email)
    VALUES (
        NEW.id,
        COALESCE(
            NULLIF(NEW.raw_user_meta_data ->> 'employee_id', ''),
            'EMP-' || UPPER(LEFT(REPLACE(NEW.id::text, '-', ''), 8))
        ),
        COALESCE(
            NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
            SPLIT_PART(NEW.email, '@', 1)
        ),
        NEW.email
    )
    -- Makes the trigger idempotent: re-running it for an existing auth user
    -- leaves the established profile untouched instead of failing.
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ---------------------------------------------------------------------------
-- Let users maintain their own profile
--
-- 01 granted UPDATE on public.users to managing_director only, which left a
-- team member unable to correct their own display name. This adds a
-- self-service UPDATE scoped to the caller's own row.
--
-- The WITH CHECK clause is the important half: it pins id, role and is_active
-- to their current values, so a user can edit their name but cannot promote
-- themselves or reactivate a deactivated account.
-- ---------------------------------------------------------------------------
CREATE POLICY "Users can update their own profile"
ON public.users FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
    id = auth.uid()
    AND role = (SELECT u.role FROM public.users u WHERE u.id = auth.uid())
    AND is_active = (SELECT u.is_active FROM public.users u WHERE u.id = auth.uid())
);


-- ===========================================================================
-- MANUAL STEP — promote the first managing director
--
-- Sign up through the app, then run this once against your project with the
-- email you registered. Nothing in the application can do this for you, by
-- design: an app that can mint its own administrators is not access-controlled.
--
--   UPDATE public.users
--   SET role = 'managing_director'
--   WHERE email = 'you@example.com';
--
-- KNOWN LIMITATION — duplicate employee_id
--
-- employee_id carries a UNIQUE constraint. If a new signup submits an ID that
-- is already taken, this trigger raises and Supabase Auth reports the generic
-- "Database error saving new user". The signup action cannot pre-check for a
-- collision because the SELECT policy on public.users is granted to
-- `authenticated` only, and a registering user is still anonymous. Either
-- assign employee IDs out of band, or expose a SECURITY DEFINER
-- `employee_id_available(text)` function for the form to call.
-- ===========================================================================
