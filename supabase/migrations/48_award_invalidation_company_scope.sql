-- M15 follow-up: award invalidation runs in each award slot's own company.
--
-- Defect (found 20 October 2026 while testing migration 46): with two companies and
-- any award day recorded, an unscoped system write (no signed-in user and no
-- taskpulse.organization setting, e.g. GoTrue's handle_new_user creating a
-- public.users row) fires the M08 trigger invalidate_awards(). It looped every
-- company's award_slots and called queue_award(date,true), whose
-- INSERT INTO award_slots(business_date) carries no company, so the M15 company
-- stamp raised "The record's company could not be determined" and the whole write
-- (the sign-up) failed. Production has one company and is unaffected today; this
-- blocks onboarding a second company.
--
-- Fix (same per-slot scope pattern as the one-time re-queue in 46):
--   * invalidate_awards() queues each open slot inside that slot's company scope,
--     stamps the audit row with the slot's company, and restores the caller's
--     taskpulse.organization setting afterwards (a scoped worker stays scoped).
--     A signed-in caller's scope is unchanged: RLS still limits the loop to the
--     caller's company and m15_scope() ignores the setting for signed-in users.
--   * queue_award() reads its slot within the current scope as well, so a caller
--     that bypasses RLS (migration/maintenance role) cannot pick another
--     company's slot for the same date.
-- Unscoped system writes keep M08's conservative rule of invalidating every open
-- award day, now per company. No scoring, award or data change.
BEGIN;

CREATE OR REPLACE FUNCTION taskpulse_private.queue_award(p_date date,p_invalidate boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
 DECLARE s taskpulse_private.award_slots;j uuid;scope uuid:=taskpulse_private.m15_scope();BEGIN
 IF taskpulse_private.award_date_frozen(p_date) THEN RAISE EXCEPTION 'Frozen award requires a separate revision' USING ERRCODE='23514'; END IF;
 INSERT INTO taskpulse_private.award_slots(business_date) VALUES(p_date) ON CONFLICT(organization_id,business_date) DO NOTHING;
 SELECT * INTO s FROM taskpulse_private.award_slots WHERE business_date=p_date AND (scope IS NULL OR organization_id=scope) FOR UPDATE;
 IF p_invalidate THEN UPDATE taskpulse_private.award_slots SET version=version+1,stale=true,effective_run=NULL WHERE id=s.id RETURNING * INTO s; END IF;
 IF NOT s.stale THEN RETURN jsonb_build_object('date',p_date,'status','current','runId',s.latest_run,'version',s.version); END IF;
 INSERT INTO taskpulse_private.outbox_jobs(kind,entity_id,entity_version,operation_id,payload,status)
 VALUES('award_daily',s.id,s.version,gen_random_uuid(),jsonb_build_object('businessDate',p_date,'awardRuleVersion','m08-shared-performance-v1'),'pending')
 ON CONFLICT(kind,entity_id) WHERE kind='award_daily' AND status IN ('pending','running','failed','blocked')
 DO UPDATE SET entity_version=EXCLUDED.entity_version,status=CASE WHEN taskpulse_private.outbox_jobs.status='running' THEN 'running' ELSE 'pending' END,
 available_at=CASE WHEN taskpulse_private.outbox_jobs.status='running' THEN taskpulse_private.outbox_jobs.available_at ELSE clock_timestamp() END
 RETURNING id INTO j;
 RETURN jsonb_build_object('date',p_date,'status','queued','jobId',j,'version',s.version);
END $$;

CREATE OR REPLACE FUNCTION taskpulse_private.invalidate_awards() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
 DECLARE s record;prior text:=current_setting('taskpulse.organization',true);BEGIN
 -- Conservative invalidation covers every observed open award day. Fresh reads do
 -- not certify an old winner while any source/cohort correction is unresolved.
 -- Each slot is queued in its own company's scope (RLS already limits a scoped
 -- caller to its company's slots).
 FOR s IN SELECT business_date,id,organization_id FROM taskpulse_private.award_slots ORDER BY organization_id,business_date LOOP
  PERFORM set_config('taskpulse.organization',coalesce(s.organization_id::text,''),true);
  IF NOT taskpulse_private.award_date_frozen(s.business_date) THEN
   PERFORM taskpulse_private.queue_award(s.business_date,true);
   INSERT INTO taskpulse_private.audit_events(organization_id,actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
   VALUES(s.organization_id,auth.uid(),coalesce(public.get_user_role()::text,'system'),'invalidate_award','award_slots',s.id,ARRAY['stale','version'],jsonb_build_object('sourceTable',TG_TABLE_NAME),gen_random_uuid());
  END IF;
 END LOOP;
 PERFORM set_config('taskpulse.organization',coalesce(prior,''),true);
 RETURN NEW;
END $$;

COMMIT;
SELECT taskpulse_private.m15_secure();
