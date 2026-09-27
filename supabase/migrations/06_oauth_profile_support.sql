-- ===========================================================================
-- TaskPulse — OAuth & External Provider Profile Provisioning Support
--
-- Migration: 06_oauth_profile_support.sql
--
-- Extends public.handle_new_user() to support OAuth providers (e.g. Google).
-- When a user registers with Google OAuth, raw_user_meta_data supplies
-- 'name' or 'full_name', but no employee_id. This migration ensures:
--
-- 1. full_name is resolved from full_name, name, or the email prefix.
-- 2. employee_id automatically falls back to an 8-character unique hex ID
--    prefixed with 'EMP-' derived from the user's UUID.
-- 3. Idempotent insert with ON CONFLICT (id) DO NOTHING so existing profiles
--    are never overwritten.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Auth user must have an email address to populate public.users.email
    IF NEW.email IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.users (id, employee_id, full_name, email)
    VALUES (
        NEW.id,
        -- Employee ID fallback for OAuth users
        COALESCE(
            NULLIF(NEW.raw_user_meta_data ->> 'employee_id', ''),
            'EMP-' || UPPER(LEFT(REPLACE(NEW.id::text, '-', ''), 8))
        ),
        -- Full name fallback (Google OAuth sets 'name' or 'full_name')
        COALESCE(
            NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
            NULLIF(NEW.raw_user_meta_data ->> 'name', ''),
            SPLIT_PART(NEW.email, '@', 1)
        ),
        NEW.email
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;
