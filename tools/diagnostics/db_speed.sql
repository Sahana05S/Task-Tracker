-- Read-only: cost of one member's award read (history) after migration 86.
\pset pager off
BEGIN READ ONLY;
SET LOCAL statement_timeout = '120s';
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM public.users WHERE role='managing_director' AND is_active ORDER BY created_at LIMIT 1), 'role','authenticated')::text, true) IS NOT NULL AS acting;
\echo '== history rows and sizes per member this month'
SELECT c.user_id IS NOT NULL AS member, count(*) AS rows, sum(pg_column_size(c.calculation)) AS calc_bytes, sum(pg_column_size(r.result)) AS run_result_bytes
 FROM taskpulse_private.award_candidates c JOIN taskpulse_private.award_runs r ON r.id=c.run_id JOIN taskpulse_private.award_slots s ON s.id=r.slot_id
 WHERE s.business_date>=date_trunc('month',now())::date GROUP BY c.user_id ORDER BY 2 DESC;
\echo '== one member, this month (first pass, then second)'
EXPLAIN (ANALYZE, COSTS OFF) SELECT octet_length(public.award_read_model(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date, (SELECT c.user_id FROM taskpulse_private.award_candidates c GROUP BY 1 ORDER BY count(*) DESC LIMIT 1), true)::text);
EXPLAIN (ANALYZE, COSTS OFF) SELECT octet_length(public.award_read_model(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date, (SELECT c.user_id FROM taskpulse_private.award_candidates c GROUP BY 1 ORDER BY count(*) DESC LIMIT 1), true)::text);
SELECT octet_length(public.award_read_model(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date, (SELECT c.user_id FROM taskpulse_private.award_candidates c GROUP BY 1 ORDER BY count(*) DESC LIMIT 1), true)::text) AS bytes;
\echo '== cost of reading result->calculation->context for those rows'
EXPLAIN (ANALYZE, COSTS OFF) SELECT sum(octet_length((r.result->'calculation'->'context')::text)) FROM taskpulse_private.award_candidates c JOIN taskpulse_private.award_runs r ON r.id=c.run_id JOIN taskpulse_private.award_slots s ON s.id=r.slot_id
 WHERE c.user_id=(SELECT c2.user_id FROM taskpulse_private.award_candidates c2 GROUP BY 1 ORDER BY count(*) DESC LIMIT 1) AND s.business_date>=date_trunc('month',now())::date;
SELECT sum(octet_length((r.result->'calculation'->'context')::text)) AS context_bytes FROM taskpulse_private.award_candidates c JOIN taskpulse_private.award_runs r ON r.id=c.run_id JOIN taskpulse_private.award_slots s ON s.id=r.slot_id
 WHERE c.user_id=(SELECT c2.user_id FROM taskpulse_private.award_candidates c2 GROUP BY 1 ORDER BY count(*) DESC LIMIT 1) AND s.business_date>=date_trunc('month',now())::date;
ROLLBACK;
