-- Read-only speed diagnostics for the demo database (28 October 2026: pages
-- slow, Reports award read hit the statement timeout). Prints timings and
-- table statistics only: normalised statement texts (constants replaced by
-- $n), counts and sizes. No table rows are read or printed.
\pset pager off
\pset footer off
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';

\echo '== Database and settings'
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size,
       current_setting('shared_buffers') AS shared_buffers,
       current_setting('max_connections') AS max_connections,
       (SELECT round(100.0*sum(blks_hit)/nullif(sum(blks_hit)+sum(blks_read),0),2) FROM pg_stat_database) AS cache_hit_pct;
SELECT r.rolname, s.setconfig FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole
 WHERE r.rolname IN ('authenticated','anon','authenticator','service_role','postgres');

\echo '== Connections by state'
SELECT coalesce(state,'(none)') state, count(*) FROM pg_stat_activity GROUP BY 1 ORDER BY 2 DESC;

\echo '== Running longer than 2 s now'
SELECT pid, now()-query_start AS running, state, wait_event_type, left(regexp_replace(query,'\s+',' ','g'),160) AS query
 FROM pg_stat_activity WHERE state<>'idle' AND query_start < now()-interval '2 seconds' AND pid<>pg_backend_pid() ORDER BY 2 DESC LIMIT 10;

\echo '== Statement statistics since'
SELECT stats_reset FROM extensions.pg_stat_statements_info;

\echo '== Top 30 statements by total time'
SELECT calls, round(total_exec_time)::bigint AS total_ms, round(mean_exec_time::numeric,1) AS mean_ms,
       round(max_exec_time::numeric) AS max_ms, rows,
       left(regexp_replace(query,'\s+',' ','g'),220) AS query
 FROM extensions.pg_stat_statements
 WHERE query NOT ILIKE '%pg_stat_statements%'
 ORDER BY total_exec_time DESC LIMIT 30;

\echo '== Top 20 statements by mean time (3+ calls)'
SELECT calls, round(mean_exec_time::numeric,1) AS mean_ms, round(max_exec_time::numeric) AS max_ms,
       left(regexp_replace(query,'\s+',' ','g'),220) AS query
 FROM extensions.pg_stat_statements
 WHERE calls>=3 AND query NOT ILIKE '%pg_stat_statements%'
 ORDER BY mean_exec_time DESC LIMIT 20;

\echo '== Tables most read by sequential scan'
SELECT schemaname||'.'||relname AS tbl, n_live_tup AS live_rows, n_dead_tup AS dead_rows, seq_scan, seq_tup_read, idx_scan,
       pg_size_pretty(pg_total_relation_size(relid)) AS size, last_autoanalyze
 FROM pg_stat_user_tables ORDER BY seq_tup_read DESC LIMIT 25;

\echo '== Largest tables'
SELECT schemaname||'.'||relname AS tbl, n_live_tup AS live_rows, pg_size_pretty(pg_total_relation_size(relid)) AS size
 FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 15;

\echo '== Scheduled jobs (pg_cron) and their last runs'
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;
SELECT j.jobname, d.status, d.start_time, d.end_time - d.start_time AS took
 FROM cron.job_run_details d LEFT JOIN cron.job j ON j.jobid=d.jobid ORDER BY d.start_time DESC LIMIT 15;

ROLLBACK;
