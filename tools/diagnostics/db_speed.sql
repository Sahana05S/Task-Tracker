-- Read-only: time each statement of performance_source_context on the demo
-- data (28 October 2026). Prints timings and sizes only; no rows.
\pset pager off
BEGIN READ ONLY;
SET LOCAL statement_timeout = '120s';
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM public.users WHERE role='managing_director' AND is_active ORDER BY created_at LIMIT 1), 'role','authenticated')::text, true) IS NOT NULL AS acting;
\echo '== whole read'
EXPLAIN (ANALYZE, COSTS OFF) SELECT public.performance_source_context(date_trunc('month',now())::date, current_date, now());
\echo '== statement by statement'
DO $do$
DECLARE p_from date:=date_trunc('month',now())::date; p_to_exclusive date:=current_date; p_as_of timestamptz:=now();
 cutoff timestamptz;known boolean;members jsonb;tasks jsonb;attendance jsonb; t timestamptz; w text; c jsonb;
BEGIN
 t:=clock_timestamp();
 SELECT available_from INTO cutoff FROM taskpulse_private.performance_contract;known:=p_as_of>=cutoff;
 RAISE NOTICE 'part % (%): % ms', 0, 'SELECT available_from INTO cutoff FROM taskpulse_private.per', round(extract(epoch FROM clock_timestamp()-t)*1000);
 t:=clock_timestamp();
 WITH latest AS (SELECT DISTINCT ON(kind,source_key) kind,revision,data FROM taskpulse_private.performance_observations WHERE observed_at<=p_as_of ORDER BY kind,source_key,observed_at DESC,revision DESC)
 RAISE NOTICE 'part % (%): % ms', 1, 'WITH latest AS (SELECT DISTINCT ON(kind,source_key) kind,rev', round(extract(epoch FROM clock_timestamp()-t)*1000);
 t:=clock_timestamp();
 SELECT coalesce(jsonb_agg(data||jsonb_build_object('revision',revision::text) ORDER BY data->>'id'),'[]') INTO members FROM latest WHERE kind='member' AND data->>'deleted'='false';
 RAISE NOTICE 'part % (%): % ms', 2, 'SELECT coalesce(jsonb_agg(data||jsonb_build_object(revision', round(extract(epoch FROM clock_timestamp()-t)*1000);
 t:=clock_timestamp();
 WITH latest AS (SELECT DISTINCT ON(kind,source_key) kind,revision,data FROM taskpulse_private.performance_observations WHERE observed_at<=p_as_of ORDER BY kind,source_key,observed_at DESC,revision DESC),
 effort AS (SELECT data->>'taskId' tid,sum((data->>'hours')::numeric) FILTER(WHERE data->>'reversedAt' IS NULL) hours,
  bool_or(data->>'appliedProgress' IS NULL OR data->>'capturedScale' IS NULL) FILTER(WHERE data->>'reversedAt' IS NULL) unknown_effect FROM latest WHERE kind='log' AND (data->>'businessDate')::date<=(p_as_of AT TIME ZONE 'Asia/Kolkata')::date GROUP BY 1),
 period_events AS (
  SELECT data->>'taskId' tid,CASE WHEN (data->>'appliedProgress')::numeric=0 THEN 0 ELSE (data->>'appliedProgress')::numeric*(data->>'capturedScale')::numeric/100 END amount,data->'capturedShares' shares,
   data->>'appliedProgress' IS NOT NULL AND ((data->>'appliedProgress')::numeric=0 OR data->>'capturedScale' IS NOT NULL AND jsonb_typeof(data->'capturedShares')='object') known
  FROM latest WHERE kind='log' AND data->>'reversedAt' IS NULL AND (data->>'businessDate')::date>=p_from AND (data->>'businessDate')::date<p_to_exclusive AND (data->>'businessDate')::date<=(p_as_of AT TIME ZONE 'Asia/Kolkata')::date
  UNION ALL SELECT task_id::text,scaled_credit,shares,scaled_credit=0 OR shares IS NOT NULL FROM taskpulse_private.checklist_credit_events
   WHERE effective_at<=p_as_of AND (effective_at AT TIME ZONE 'Asia/Kolkata')::date>=p_from AND (effective_at AT TIME ZONE 'Asia/Kolkata')::date<p_to_exclusive
  UNION ALL SELECT task_id::text,scaled_credit,shares,provenance_known FROM taskpulse_private.manual_credit_inputs WHERE effective_at<=p_as_of AND business_date>=p_from AND business_date<p_to_exclusive
 ), period_credits AS (
  SELECT e.tid,s.key uid,sum(e.amount*s.value::numeric/1000000) credit FROM period_events e CROSS JOIN LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(e.shares)='object' THEN e.shares ELSE '{}' END) s WHERE e.known GROUP BY 1,2
 ), task_events AS (
  SELECT data,observed_at,revision,lag(data->>'status') OVER(PARTITION BY source_key ORDER BY observed_at,revision) prior_status
  FROM taskpulse_private.performance_observations WHERE kind='task' AND observed_at<=p_as_of
 ), completions AS (
  SELECT DISTINCT ON(data->>'id') data FROM task_events WHERE data->>'status'='Done' AND prior_status IS NOT NULL AND prior_status<>'Done' ORDER BY data->>'id',observed_at DESC,revision DESC
 )
 RAISE NOTICE 'part % (%): % ms', 3, 'WITH latest AS (SELECT DISTINCT ON(kind,source_key) kind,rev', round(extract(epoch FROM clock_timestamp()-t)*1000);
 t:=clock_timestamp();
 SELECT coalesce(jsonb_agg(t.data||jsonb_build_object('revision',t.revision::text,'taskHours',coalesce(e.hours,0)::text,'unknownEffect',coalesce(e.unknown_effect,false),
  'credits',coalesce((SELECT jsonb_object_agg(c.data->>'userId',c.data->>'scaledCredit') FROM latest c WHERE c.kind='credit' AND c.data->>'taskId'=t.data->>'id'),'{}'),
  'periodCredits',coalesce((SELECT jsonb_object_agg(uid,credit::text) FROM period_credits WHERE tid=t.data->>'id'),'{}'),
  'periodCreditUnknown',coalesce((SELECT bool_or(NOT e.known) FROM period_events e WHERE e.tid=t.data->>'id'),false),
  'completionShares',(SELECT data->'shares' FROM completions WHERE data->>'id'=t.data->>'id'),
  'completionPrimary',(SELECT data->'primaryAssignee' FROM completions WHERE data->>'id'=t.data->>'id')) ORDER BY t.data->>'id'),'[]') INTO tasks
 FROM latest t LEFT JOIN effort e ON e.tid=t.data->>'id' WHERE t.kind='task' AND t.data->>'deleted'='false';
 -- Only aggregate attendance is returned to the team; private days/notes/times/IDs remain in their authorized RPC.
 RAISE NOTICE 'part % (%): % ms', 4, 'SELECT coalesce(jsonb_agg(t.data||jsonb_build_object(revisi', round(extract(epoch FROM clock_timestamp()-t)*1000);
 t:=clock_timestamp();
 SELECT coalesce(jsonb_agg(jsonb_build_object('userId',u->>'id','hours',CASE WHEN (a->>'validityAvailable')::boolean THEN (SELECT sum((d->>'attendanceHours')::numeric)::text FROM jsonb_array_elements(a->'days') d) END,
  'offHours',CASE WHEN (a->>'validityAvailable')::boolean THEN (SELECT sum((d->>'offHours')::numeric)::text FROM jsonb_array_elements(a->'days') d) END,
  'valid',a->'valid','available',a->'validityAvailable','reasons',a->'reasons','sourceRevision',taskpulse_private.performance_watermark(p_as_of)) ORDER BY u->>'id'),'[]') INTO attendance
 FROM jsonb_array_elements(members) u CROSS JOIN LATERAL (SELECT taskpulse_private.attendance_inputs((u->>'id')::uuid,p_from,p_to_exclusive,p_as_of) a) q;
 RAISE NOTICE 'part % (%): % ms', 5, 'SELECT coalesce(jsonb_agg(jsonb_build_object(userId,u->>i', round(extract(epoch FROM clock_timestamp()-t)*1000);
 t:=clock_timestamp(); w:=taskpulse_private.performance_watermark(p_as_of); RAISE NOTICE 'watermark: % ms', round(extract(epoch FROM clock_timestamp()-t)*1000);
 t:=clock_timestamp(); c:=taskpulse_private.contribution_inputs(p_from,p_to_exclusive,p_as_of); RAISE NOTICE 'contributions: % ms', round(extract(epoch FROM clock_timestamp()-t)*1000);
 RAISE NOTICE 'sizes members % tasks % attendance %', octet_length(members::text), octet_length(tasks::text), octet_length(attendance::text);
END $do$;
\echo '== statement by statement, second run (warm)'
DO $do$
DECLARE p_from date:=date_trunc('month',now())::date; p_to_exclusive date:=current_date; p_as_of timestamptz:=now();
 cutoff timestamptz;known boolean;members jsonb;tasks jsonb;attendance jsonb; t timestamptz; w text; c jsonb;
BEGIN
 t:=clock_timestamp();
 SELECT available_from INTO cutoff FROM taskpulse_private.performance_contract;known:=p_as_of>=cutoff;
 RAISE NOTICE 'part % (%): % ms', 0, 'SELECT available_from INTO cutoff FROM taskpulse_private.per', round(extract(epoch FROM clock_timestamp()-t)*1000);
 t:=clock_timestamp();
 WITH latest AS (SELECT DISTINCT ON(kind,source_key) kind,revision,data FROM taskpulse_private.performance_observations WHERE observed_at<=p_as_of ORDER BY kind,source_key,observed_at DESC,revision DESC)
 RAISE NOTICE 'part % (%): % ms', 1, 'WITH latest AS (SELECT DISTINCT ON(kind,source_key) kind,rev', round(extract(epoch FROM clock_timestamp()-t)*1000);
 t:=clock_timestamp();
 SELECT coalesce(jsonb_agg(data||jsonb_build_object('revision',revision::text) ORDER BY data->>'id'),'[]') INTO members FROM latest WHERE kind='member' AND data->>'deleted'='false';
 RAISE NOTICE 'part % (%): % ms', 2, 'SELECT coalesce(jsonb_agg(data||jsonb_build_object(revision', round(extract(epoch FROM clock_timestamp()-t)*1000);
 t:=clock_timestamp();
 WITH latest AS (SELECT DISTINCT ON(kind,source_key) kind,revision,data FROM taskpulse_private.performance_observations WHERE observed_at<=p_as_of ORDER BY kind,source_key,observed_at DESC,revision DESC),
 effort AS (SELECT data->>'taskId' tid,sum((data->>'hours')::numeric) FILTER(WHERE data->>'reversedAt' IS NULL) hours,
  bool_or(data->>'appliedProgress' IS NULL OR data->>'capturedScale' IS NULL) FILTER(WHERE data->>'reversedAt' IS NULL) unknown_effect FROM latest WHERE kind='log' AND (data->>'businessDate')::date<=(p_as_of AT TIME ZONE 'Asia/Kolkata')::date GROUP BY 1),
 period_events AS (
  SELECT data->>'taskId' tid,CASE WHEN (data->>'appliedProgress')::numeric=0 THEN 0 ELSE (data->>'appliedProgress')::numeric*(data->>'capturedScale')::numeric/100 END amount,data->'capturedShares' shares,
   data->>'appliedProgress' IS NOT NULL AND ((data->>'appliedProgress')::numeric=0 OR data->>'capturedScale' IS NOT NULL AND jsonb_typeof(data->'capturedShares')='object') known
  FROM latest WHERE kind='log' AND data->>'reversedAt' IS NULL AND (data->>'businessDate')::date>=p_from AND (data->>'businessDate')::date<p_to_exclusive AND (data->>'businessDate')::date<=(p_as_of AT TIME ZONE 'Asia/Kolkata')::date
  UNION ALL SELECT task_id::text,scaled_credit,shares,scaled_credit=0 OR shares IS NOT NULL FROM taskpulse_private.checklist_credit_events
   WHERE effective_at<=p_as_of AND (effective_at AT TIME ZONE 'Asia/Kolkata')::date>=p_from AND (effective_at AT TIME ZONE 'Asia/Kolkata')::date<p_to_exclusive
  UNION ALL SELECT task_id::text,scaled_credit,shares,provenance_known FROM taskpulse_private.manual_credit_inputs WHERE effective_at<=p_as_of AND business_date>=p_from AND business_date<p_to_exclusive
 ), period_credits AS (
  SELECT e.tid,s.key uid,sum(e.amount*s.value::numeric/1000000) credit FROM period_events e CROSS JOIN LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(e.shares)='object' THEN e.shares ELSE '{}' END) s WHERE e.known GROUP BY 1,2
 ), task_events AS (
  SELECT data,observed_at,revision,lag(data->>'status') OVER(PARTITION BY source_key ORDER BY observed_at,revision) prior_status
  FROM taskpulse_private.performance_observations WHERE kind='task' AND observed_at<=p_as_of
 ), completions AS (
  SELECT DISTINCT ON(data->>'id') data FROM task_events WHERE data->>'status'='Done' AND prior_status IS NOT NULL AND prior_status<>'Done' ORDER BY data->>'id',observed_at DESC,revision DESC
 )
 RAISE NOTICE 'part % (%): % ms', 3, 'WITH latest AS (SELECT DISTINCT ON(kind,source_key) kind,rev', round(extract(epoch FROM clock_timestamp()-t)*1000);
 t:=clock_timestamp();
 SELECT coalesce(jsonb_agg(t.data||jsonb_build_object('revision',t.revision::text,'taskHours',coalesce(e.hours,0)::text,'unknownEffect',coalesce(e.unknown_effect,false),
  'credits',coalesce((SELECT jsonb_object_agg(c.data->>'userId',c.data->>'scaledCredit') FROM latest c WHERE c.kind='credit' AND c.data->>'taskId'=t.data->>'id'),'{}'),
  'periodCredits',coalesce((SELECT jsonb_object_agg(uid,credit::text) FROM period_credits WHERE tid=t.data->>'id'),'{}'),
  'periodCreditUnknown',coalesce((SELECT bool_or(NOT e.known) FROM period_events e WHERE e.tid=t.data->>'id'),false),
  'completionShares',(SELECT data->'shares' FROM completions WHERE data->>'id'=t.data->>'id'),
  'completionPrimary',(SELECT data->'primaryAssignee' FROM completions WHERE data->>'id'=t.data->>'id')) ORDER BY t.data->>'id'),'[]') INTO tasks
 FROM latest t LEFT JOIN effort e ON e.tid=t.data->>'id' WHERE t.kind='task' AND t.data->>'deleted'='false';
 -- Only aggregate attendance is returned to the team; private days/notes/times/IDs remain in their authorized RPC.
 RAISE NOTICE 'part % (%): % ms', 4, 'SELECT coalesce(jsonb_agg(t.data||jsonb_build_object(revisi', round(extract(epoch FROM clock_timestamp()-t)*1000);
 t:=clock_timestamp();
 SELECT coalesce(jsonb_agg(jsonb_build_object('userId',u->>'id','hours',CASE WHEN (a->>'validityAvailable')::boolean THEN (SELECT sum((d->>'attendanceHours')::numeric)::text FROM jsonb_array_elements(a->'days') d) END,
  'offHours',CASE WHEN (a->>'validityAvailable')::boolean THEN (SELECT sum((d->>'offHours')::numeric)::text FROM jsonb_array_elements(a->'days') d) END,
  'valid',a->'valid','available',a->'validityAvailable','reasons',a->'reasons','sourceRevision',taskpulse_private.performance_watermark(p_as_of)) ORDER BY u->>'id'),'[]') INTO attendance
 FROM jsonb_array_elements(members) u CROSS JOIN LATERAL (SELECT taskpulse_private.attendance_inputs((u->>'id')::uuid,p_from,p_to_exclusive,p_as_of) a) q;
 RAISE NOTICE 'part % (%): % ms', 5, 'SELECT coalesce(jsonb_agg(jsonb_build_object(userId,u->>i', round(extract(epoch FROM clock_timestamp()-t)*1000);
 t:=clock_timestamp(); w:=taskpulse_private.performance_watermark(p_as_of); RAISE NOTICE 'watermark: % ms', round(extract(epoch FROM clock_timestamp()-t)*1000);
 t:=clock_timestamp(); c:=taskpulse_private.contribution_inputs(p_from,p_to_exclusive,p_as_of); RAISE NOTICE 'contributions: % ms', round(extract(epoch FROM clock_timestamp()-t)*1000);
 RAISE NOTICE 'sizes members % tasks % attendance %', octet_length(members::text), octet_length(tasks::text), octet_length(attendance::text);
END $do$;
ROLLBACK;
