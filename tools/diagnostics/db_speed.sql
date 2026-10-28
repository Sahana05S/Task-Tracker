-- Read-only: timings of the parts of performance_source_context (28 October 2026).
-- Plans and timings only; no rows are printed.
\pset pager off
BEGIN READ ONLY;
SET LOCAL statement_timeout = '120s';
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM public.users WHERE role='managing_director' AND is_active ORDER BY created_at LIMIT 1), 'role','authenticated')::text, true) IS NOT NULL AS acting;

\echo '== whole read'
SELECT octet_length(public.performance_source_context(date_trunc('month',now())::date, current_date, now())::text) AS bytes;
\echo '== watermark'
SELECT length(taskpulse_private.performance_watermark(now()));
\echo '== contribution_inputs'
SELECT octet_length(taskpulse_private.contribution_inputs(date_trunc('month',now())::date, current_date, now())::text);
\echo '== attendance_inputs for every member'
SELECT count(*), sum(octet_length(taskpulse_private.attendance_inputs(u.id, date_trunc('month',now())::date, current_date, now())::text)) FROM public.users u WHERE u.is_active;
\echo '== members query plan'
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON)  WITH latest AS (SELECT DISTINCT ON(kind,source_key) kind,revision,data FROM taskpulse_private.performance_observations WHERE observed_at<=now() ORDER BY kind,source_key,observed_at DESC,revision DESC)
 SELECT coalesce(jsonb_agg(data||jsonb_build_object('revision',revision::text) ORDER BY data->>'id'),'[]') FROM latest WHERE kind='member' AND data->>'deleted'='false';
\echo '== tasks query plan'
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON)  WITH latest AS (SELECT DISTINCT ON(kind,source_key) kind,revision,data FROM taskpulse_private.performance_observations WHERE observed_at<=now() ORDER BY kind,source_key,observed_at DESC,revision DESC),
 effort AS (SELECT data->>'taskId' tid,sum((data->>'hours')::numeric) FILTER(WHERE data->>'reversedAt' IS NULL) hours,
  bool_or(data->>'appliedProgress' IS NULL OR data->>'capturedScale' IS NULL) FILTER(WHERE data->>'reversedAt' IS NULL) unknown_effect FROM latest WHERE kind='log' AND (data->>'businessDate')::date<=(now() AT TIME ZONE 'Asia/Kolkata')::date GROUP BY 1),
 period_events AS (
  SELECT data->>'taskId' tid,CASE WHEN (data->>'appliedProgress')::numeric=0 THEN 0 ELSE (data->>'appliedProgress')::numeric*(data->>'capturedScale')::numeric/100 END amount,data->'capturedShares' shares,
   data->>'appliedProgress' IS NOT NULL AND ((data->>'appliedProgress')::numeric=0 OR data->>'capturedScale' IS NOT NULL AND jsonb_typeof(data->'capturedShares')='object') known
  FROM latest WHERE kind='log' AND data->>'reversedAt' IS NULL AND (data->>'businessDate')::date>=date_trunc('month',now())::date AND (data->>'businessDate')::date<current_date AND (data->>'businessDate')::date<=(now() AT TIME ZONE 'Asia/Kolkata')::date
  UNION ALL SELECT task_id::text,scaled_credit,shares,scaled_credit=0 OR shares IS NOT NULL FROM taskpulse_private.checklist_credit_events
   WHERE effective_at<=now() AND (effective_at AT TIME ZONE 'Asia/Kolkata')::date>=date_trunc('month',now())::date AND (effective_at AT TIME ZONE 'Asia/Kolkata')::date<current_date
  UNION ALL SELECT task_id::text,scaled_credit,shares,provenance_known FROM taskpulse_private.manual_credit_inputs WHERE effective_at<=now() AND business_date>=date_trunc('month',now())::date AND business_date<current_date
 ), period_credits AS (
  SELECT e.tid,s.key uid,sum(e.amount*s.value::numeric/1000000) credit FROM period_events e CROSS JOIN LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(e.shares)='object' THEN e.shares ELSE '{}' END) s WHERE e.known GROUP BY 1,2
 ), task_events AS (
  SELECT data,observed_at,revision,lag(data->>'status') OVER(PARTITION BY source_key ORDER BY observed_at,revision) prior_status
  FROM taskpulse_private.performance_observations WHERE kind='task' AND observed_at<=now()
 ), completions AS (
  SELECT DISTINCT ON(data->>'id') data FROM task_events WHERE data->>'status'='Done' AND prior_status IS NOT NULL AND prior_status<>'Done' ORDER BY data->>'id',observed_at DESC,revision DESC
 )
 SELECT coalesce(jsonb_agg(t.data||jsonb_build_object('revision',t.revision::text,'taskHours',coalesce(e.hours,0)::text,'unknownEffect',coalesce(e.unknown_effect,false),
  'credits',coalesce((SELECT jsonb_object_agg(c.data->>'userId',c.data->>'scaledCredit') FROM latest c WHERE c.kind='credit' AND c.data->>'taskId'=t.data->>'id'),'{}'),
  'periodCredits',coalesce((SELECT jsonb_object_agg(uid,credit::text) FROM period_credits WHERE tid=t.data->>'id'),'{}'),
  'periodCreditUnknown',coalesce((SELECT bool_or(NOT e.known) FROM period_events e WHERE e.tid=t.data->>'id'),false),
  'completionShares',(SELECT data->'shares' FROM completions WHERE data->>'id'=t.data->>'id'),
  'completionPrimary',(SELECT data->'primaryAssignee' FROM completions WHERE data->>'id'=t.data->>'id')) ORDER BY t.data->>'id'),'[]') 
 FROM latest t LEFT JOIN effort e ON e.tid=t.data->>'id' WHERE t.kind='task' AND t.data->>'deleted'='false';
ROLLBACK;
