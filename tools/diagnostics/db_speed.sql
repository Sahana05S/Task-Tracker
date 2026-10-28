-- Read-only: one member's award read with and without history (migration 89).
\pset pager off
BEGIN READ ONLY;
SET LOCAL statement_timeout = '120s';
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM public.users WHERE role='managing_director' AND is_active ORDER BY created_at LIMIT 1), 'role','authenticated')::text, true) IS NOT NULL AS acting;
\echo '== warm-up'
SELECT octet_length(public.award_read_model(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date, NULL, false, false)::text);
\echo '== daily log read: one member, calculations, no history'
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) SELECT public.award_read_model(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date, (SELECT user_id FROM taskpulse_private.award_candidates GROUP BY 1 ORDER BY count(*) DESC LIMIT 1), true, false);
SELECT octet_length(public.award_read_model(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date, (SELECT user_id FROM taskpulse_private.award_candidates GROUP BY 1 ORDER BY count(*) DESC LIMIT 1), true, false)::text) AS bytes;
\echo '== before: one member, calculations and history'
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) SELECT public.award_read_model(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date, (SELECT user_id FROM taskpulse_private.award_candidates GROUP BY 1 ORDER BY count(*) DESC LIMIT 1), true, true);
ROLLBACK;
