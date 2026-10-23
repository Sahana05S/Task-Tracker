-- Award invalidation once per award day per transaction (follow-up to 22 and 48).
--
-- Defect (found 23 October 2026 on the demo project): creating a mission timed out
-- with "canceling statement due to statement timeout" (8 s for authenticated).
-- invalidate_awards() fires for every row written to performance_observations and
-- input_history, and each call re-queues every open award day: bump the slot's
-- version, upsert its outbox job and write an audit row. One mission create writes
-- about 25 observations, so with 52 open award days it made 1,300 slot updates,
-- 1,272 outbox updates and 1,349 audit rows, and took 7.9 s in a rolled-back
-- timing run. The cost grows with every award day and hits every write that
-- records an observation (logs, timers, attendance), not only creates.
--
-- Fix: inside one transaction, a day this transaction has already invalidated is
-- not invalidated again while it is still stale. No award worker can read the
-- intermediate states of an uncommitted transaction, so one version bump, one
-- pending job and one audit row per day are equivalent to many. A day that is
-- made current again later in the same transaction (stale=false) is invalidated
-- normally. The marker is transaction-local, so a rolled-back subtransaction
-- reverts it together with its invalidations, and it is keyed by the company
-- scope, so a caller that switches taskpulse.organization mid-transaction still
-- gets a full pass over the newly visible company's days.
--
-- No scoring, award, policy or data change. Unscoped system writes keep M08's
-- conservative rule of invalidating every open award day, per company (48).
BEGIN;

CREATE OR REPLACE FUNCTION taskpulse_private.invalidate_awards() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
 DECLARE s record;prior text:=current_setting('taskpulse.organization',true);
  -- Visibility of award_slots depends on the company scope (FORCE RLS), so the
  -- marker names both the transaction and the scope it covered.
  marker text:=pg_catalog.pg_current_xact_id()::text||'/'||coalesce(taskpulse_private.m15_scope()::text,'*');
  repeat boolean:=current_setting('taskpulse.awards_invalidated',true) IS NOT DISTINCT FROM marker;BEGIN
 -- Conservative invalidation covers every observed open award day. Fresh reads do
 -- not certify an old winner while any source/cohort correction is unresolved.
 -- Each slot is queued in its own company's scope (RLS already limits a scoped
 -- caller to its company's slots).
 FOR s IN SELECT business_date,id,organization_id,stale FROM taskpulse_private.award_slots ORDER BY organization_id,business_date LOOP
  -- Already invalidated by this transaction and still stale: nothing new to record.
  CONTINUE WHEN repeat AND s.stale;
  PERFORM set_config('taskpulse.organization',coalesce(s.organization_id::text,''),true);
  IF NOT taskpulse_private.award_date_frozen(s.business_date) THEN
   PERFORM taskpulse_private.queue_award(s.business_date,true);
   INSERT INTO taskpulse_private.audit_events(organization_id,actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
   VALUES(s.organization_id,auth.uid(),coalesce(public.get_user_role()::text,'system'),'invalidate_award','award_slots',s.id,ARRAY['stale','version'],jsonb_build_object('sourceTable',TG_TABLE_NAME),gen_random_uuid());
  END IF;
 END LOOP;
 PERFORM set_config('taskpulse.organization',coalesce(prior,''),true);
 PERFORM set_config('taskpulse.awards_invalidated',marker,true);
 RETURN NEW;
END $$;

COMMIT;
SELECT taskpulse_private.m15_secure();
