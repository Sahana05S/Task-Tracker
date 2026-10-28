-- Read-only: plans of the slow statements inside the scoring reads
-- (28 October 2026). Prints plans and timings only; no rows.
\pset pager off
\timing on
BEGIN READ ONLY;
SET LOCAL statement_timeout = '120s';
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM public.users WHERE role='managing_director' AND is_active ORDER BY created_at LIMIT 1), 'role','authenticated')::text, true) IS NOT NULL AS acting;
LOAD 'auto_explain';
SET LOCAL auto_explain.log_min_duration = '15ms';
SET LOCAL auto_explain.log_analyze = on;
SET LOCAL auto_explain.log_buffers = off;
SET LOCAL auto_explain.log_timing = on;
SET LOCAL auto_explain.log_nested_statements = on;
SET LOCAL auto_explain.log_format = 'text';
SET LOCAL auto_explain.log_level = 'notice';
SET LOCAL client_min_messages = 'notice';

\echo '== performance_source_context, this month through yesterday'
SELECT octet_length(public.performance_source_context(date_trunc('month',now())::date, current_date, now())::text) AS bytes;

\echo '== live_presentation_context, same window, team'
SELECT octet_length(public.live_presentation_context(date_trunc('month',now())::date, current_date, now(), NULL, false)::text) AS bytes;
ROLLBACK;
