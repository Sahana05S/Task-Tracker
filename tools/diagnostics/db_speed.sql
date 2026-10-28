-- Read-only: timings of the scoring reads after migrations 86-88 (28 October 2026).
\pset pager off
BEGIN READ ONLY;
SET LOCAL statement_timeout = '120s';
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM public.users WHERE role='managing_director' AND is_active ORDER BY created_at LIMIT 1), 'role','authenticated')::text, true) IS NOT NULL AS acting;
\echo '== performance_source_context'
EXPLAIN (ANALYZE, COSTS OFF) SELECT public.performance_source_context(date_trunc('month',now())::date, current_date, now());
\echo '== live_presentation_context, team'
EXPLAIN (ANALYZE, COSTS OFF) SELECT public.live_presentation_context(date_trunc('month',now())::date, current_date, now(), NULL, false);
\echo '== award_read_model, month, without calculations'
EXPLAIN (ANALYZE, COSTS OFF) SELECT public.award_read_model(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date, NULL, false);
\echo '== award_read_model, month, with calculations (Team daily log only)'
EXPLAIN (ANALYZE, COSTS OFF) SELECT public.award_read_model(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date, NULL, true);
\echo '#### second pass'
\echo '== performance_source_context'
EXPLAIN (ANALYZE, COSTS OFF) SELECT public.performance_source_context(date_trunc('month',now())::date, current_date, now());
\echo '== live_presentation_context, team'
EXPLAIN (ANALYZE, COSTS OFF) SELECT public.live_presentation_context(date_trunc('month',now())::date, current_date, now(), NULL, false);
\echo '== award_read_model, month, without calculations'
EXPLAIN (ANALYZE, COSTS OFF) SELECT public.award_read_model(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date, NULL, false);
\echo '== award_read_model, month, with calculations (Team daily log only)'
EXPLAIN (ANALYZE, COSTS OFF) SELECT public.award_read_model(date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month')::date, NULL, true);
ROLLBACK;
