-- ===========================================================================
-- TaskPulse - nightly attendance marking runs inside the database (forward only)
--
-- User request (28 October 2026): mark yesterday's attendance on time at
-- 00:15 Asia/Kolkata. The first step of .github/workflows/award-worker.yml
-- did this, but GitHub starts scheduled workflows two to four hours late, and
-- until it ran nobody had attendance for yesterday, so live figures had to fall
-- back a day. pg_cron now calls public.attendance_autofill() (migration 73) at
-- 18:45 UTC (00:15 IST). The function marks only days without a record, so the
-- workflow's call afterwards stays as a harmless backup and the award run is
-- unchanged.
--
-- Only where pg_cron is preloaded (the hosted demo project); a database without
-- it, such as the disposable contract-check server, skips this with a notice.
-- The job runs as the role that schedules it (the migration role), which is
-- granted EXECUTE on the function; it has no signed-in user, as the function
-- requires, and m15_scope() is then NULL, so it covers every active company.
-- ===========================================================================
BEGIN;
DO $do$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name='pg_cron')
    OR coalesce(current_setting('shared_preload_libraries',true),'') NOT LIKE '%pg_cron%' THEN
  RAISE NOTICE 'pg_cron is not available here; the nightly workflow keeps marking attendance.';
  RETURN;
 END IF;
 CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.attendance_autofill(date) TO %I', current_user);
 -- Re-runnable: replace an earlier schedule of the same name.
 EXECUTE $q$SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='taskpulse-attendance-autofill'$q$;
 EXECUTE $q$SELECT cron.schedule('taskpulse-attendance-autofill','45 18 * * *','SELECT public.attendance_autofill()')$q$;
END
$do$;
COMMIT;
SELECT taskpulse_private.m15_secure();
