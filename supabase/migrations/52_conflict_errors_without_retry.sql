-- Conflict errors that PostgREST does not retry.
--
-- Commands report "this record changed; reload and try again" (stale version,
-- reused operation key, changed participants, moved timer) by raising SQLSTATE
-- 40001. PostgreSQL reserves 40001 for serialization failures, and PostgREST 14
-- retries any transaction that ends in 40001 with no limit. A command that
-- raises it deterministically therefore spins inside PostgREST forever, long
-- after the browser request is gone: on the M13 test project two month-close
-- calls from 15 October looped for six days (183 million attempts, 82% of
-- database time), and the demo project shows the same pattern in its history.
-- See Supabase's troubleshooting note "SQLSTATE 40001 (serialization_failure)
-- in an RPC function causes infinite retries".
--
-- This migration rewrites every function in public and taskpulse_private that
-- raises 40001 to raise PT409 instead. PostgREST maps PTxxx codes to that HTTP
-- status (409 Conflict) and never retries them. The message text, the order of
-- checks and every other behaviour stay the same; the app treats PT409 and
-- 40001 alike (shared/commands/conflict.ts).
--
-- New migrations must not raise 40001 again: __tests__/architecture/
-- conflict-sqlstate.test.ts fails on any migration numbered 52 or later that
-- does. Loops already running are not stopped by this migration; end them with
-- pg_terminate_backend on the authenticator connections that run them.

BEGIN;

DO $$
DECLARE
  f record;
  def text;
  converted integer := 0;
BEGIN
  FOR f IN
    SELECT p.oid, p.oid::regprocedure AS signature
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname IN ('public', 'taskpulse_private')
      AND p.prokind IN ('f', 'p')
      AND p.prosrc LIKE '%ERRCODE=''40001''%'
  LOOP
    def := pg_catalog.pg_get_functiondef(f.oid);
    def := replace(def, 'ERRCODE=''40001''', 'ERRCODE=''PT409''');
    EXECUTE def;
    converted := converted + 1;
  END LOOP;

  -- Any other spelling (spaces, SQLSTATE '40001', the condition name) would
  -- keep the loop alive; refuse to finish rather than leave one behind. Plain
  -- mentions of the number in comments or messages are not raises and pass.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname IN ('public', 'taskpulse_private')
      AND p.prosrc ~* 'errcode\s*=\s*''40001''|sqlstate\s*''40001''|\mserialization_failure\M'
  ) THEN
    RAISE EXCEPTION 'A function still raises SQLSTATE 40001; convert it before applying 52';
  END IF;

  RAISE NOTICE 'Conflict errors moved from 40001 to PT409 in % functions', converted;
END $$;

COMMIT;
SELECT taskpulse_private.m15_secure();
