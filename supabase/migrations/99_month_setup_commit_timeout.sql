-- Migration 99: the month setup commit gets 60 seconds instead of 8.
--
-- Supabase caps every signed-in API request at statement_timeout = 8s (role
-- authenticated). month_setup_commit (migration 55) creates each mission
-- through the shared save and scale commands, about 0.3 s per mission, so a
-- normal month (15 standing missions, 5 weekly reviews, 8 carry-overs: 28
-- missions) takes about 8.5 s and was cancelled with 57014 when the November
-- 2026 setup was committed from the app. A December rehearsal in a rolled-back
-- transaction on the live project measured 8.5 s for 28 missions.
--
-- PostgREST (12 and later; the project runs 14) applies a function's own
-- statement_timeout setting to the request that calls it (hoisted transaction
-- settings), so this raises the limit for this one command only. Every other
-- request keeps the 8-second cap. The commit stays one atomic transaction.

BEGIN;

ALTER FUNCTION public.month_setup_commit(uuid,uuid) SET statement_timeout = '60s';

COMMIT;
SELECT taskpulse_private.m15_secure();
