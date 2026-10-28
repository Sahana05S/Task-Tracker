-- Read-only: times the parts of the slow scoring reads (28 October 2026).
-- Prints timings and payload sizes only; no rows are printed.
\pset pager off
\pset footer off
\timing on
BEGIN READ ONLY;
SET LOCAL statement_timeout = '120s';
-- Act as an active managing director (id is not printed), the heaviest viewer.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM public.users WHERE role='managing_director' AND is_active ORDER BY created_at LIMIT 1), 'role','authenticated')::text, true) IS NOT NULL AS acting;
SELECT public.get_user_role() AS role;

\echo '== award_read_model, this month, all members: time and size'
SELECT octet_length(public.award_read_model(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date)::text) AS bytes;
\echo '== the same for 31 days back (daily star) and this week'
SELECT octet_length(public.award_read_model(current_date-31, current_date+1)::text) AS bytes;

\echo '== parts: days without candidates, reasons, context'
SELECT count(*) FROM (SELECT s.id, r.status FROM taskpulse_private.award_slots s LEFT JOIN taskpulse_private.award_runs r ON r.id=s.latest_run
 WHERE s.business_date>=date_trunc('month',now())::date AND s.business_date<(date_trunc('month',now())+interval '1 month')::date) x;
\echo '== part: reasons (result->reasons) per day'
SELECT sum(octet_length((r.result->'reasons')::text)) FROM taskpulse_private.award_slots s JOIN taskpulse_private.award_runs r ON r.id=s.latest_run
 WHERE s.business_date>=date_trunc('month',now())::date AND s.business_date<(date_trunc('month',now())+interval '1 month')::date;
\echo '== part: lastSuccessAt and job lookups per day'
SELECT count((SELECT max(created_at) FROM taskpulse_private.award_runs WHERE slot_id=s.id AND certified)),
       count((SELECT status FROM taskpulse_private.outbox_jobs WHERE entity_id=s.id AND kind='award_daily' ORDER BY created_at DESC LIMIT 1))
 FROM taskpulse_private.award_slots s WHERE s.business_date>=date_trunc('month',now())::date AND s.business_date<(date_trunc('month',now())+interval '1 month')::date;
\echo '== part: candidates per day (calculation + gate)'
SELECT sum(octet_length(c.calculation::text)+octet_length(c.gate::text)), count(*) FROM taskpulse_private.award_slots s JOIN taskpulse_private.award_candidates c ON c.run_id=s.latest_run
 WHERE s.business_date>=date_trunc('month',now())::date AND s.business_date<(date_trunc('month',now())+interval '1 month')::date;
\echo '== part: performance_watermark'
SELECT length(taskpulse_private.performance_watermark(clock_timestamp()));
\echo '== part: frozen check and legacy stars'
SELECT EXISTS(SELECT 1 FROM public.monthly_performance_snapshots), (SELECT count(*) FROM public.daily_star_records);

\echo '== performance_source_context, this month: time and size'
SELECT octet_length(public.performance_source_context(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date, now())::text) AS bytes;
\echo '== performance_observations by kind'
SELECT kind, count(*), sum(pg_column_size(data)) AS bytes FROM taskpulse_private.performance_observations GROUP BY 1 ORDER BY 2 DESC;

\echo '== live_presentation_context, this month, team: time and size'
SELECT octet_length(public.live_presentation_context(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date, now(), NULL, false)::text) AS bytes;

ROLLBACK;
