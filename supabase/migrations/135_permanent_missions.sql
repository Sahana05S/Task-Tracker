-- ===========================================================================
-- TaskPulse - Permanent missions (forward only; 7 November 2026)
--
-- User decisions (7 November 2026):
--  * The managing director and Managers (internal code project_engineer) mark
--    a mission Permanent when creating it ("Mission type: Normal / Permanent")
--    or later, and turn it off again to end it; after that it behaves like any
--    mission.
--  * A permanent mission has no due date and cannot be marked Done. It moves
--    to In Progress when its first timer starts and stays there.
--  * Only the mission's Crew times a permanent mission (start_task_timer, one
--    running timer per person per mission, as for any mission).
--  * A permanent mission has no Quests, so its mission timer is always
--    allowed (123 refuses the mission timer once a mission has a Quest).
--  * No scoring rule changes: its logged time counts like any mission's hours;
--    it never finishes, so it earns no completion credit, like any open mission.
--
-- 1. public.tasks.is_permanent boolean NOT NULL DEFAULT false.
-- 2. Trigger a_m135_permanent (BEFORE INSERT/UPDATE on tasks) is the rule for
--    every write path (the mission form, Task Tools, direct table writes):
--    only the managing director or a Manager sets or clears is_permanent; a
--    permanent mission cannot be Done (marking it Done, or making a Done
--    mission permanent, is refused); a mission with Quests cannot become
--    permanent; a permanent mission's due date is cleared.
-- 3. Trigger a_m135_no_quests (BEFORE INSERT/UPDATE on task_checklists)
--    refuses a Quest list on a permanent mission, whichever command creates or
--    moves it (checklist_command 'submission', and any later Quest path).
-- 4. save_task_with_participants (and so create_task_with_scale, which passes
--    its fields through) accepts 'is_permanent' (boolean); an edit that leaves
--    it out keeps the current value.
-- 5. execution_command 'start_timer': on a permanent mission only its Crew
--    starts the timer, and starting it moves the mission to In Progress.
--
-- Functions are patched from their live definitions (save_task_with_participants
-- 17 + 53 + 108 + 121; execution_command 14 + 18 + 98 + 108 + 123); each
-- fragment must occur exactly once.
-- ===========================================================================
BEGIN;
SET LOCAL lock_timeout = '120s';

CREATE FUNCTION pg_temp.m135_patch(fn regprocedure, frag text, repl text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(fn);
BEGIN
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION '% does not contain this fragment exactly once; update migration 135: %',fn,left(frag,80); END IF;
 EXECUTE replace(def,frag,repl);
END $$;

-- 1. The column --------------------------------------------------------------------
ALTER TABLE public.tasks ADD COLUMN is_permanent boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.tasks.is_permanent IS
 'Permanent mission (migration 135): no due date, never Done, no Quests, timed by its Crew only. Set and cleared by the managing director or a Manager.';

-- 2. The rule on every write to a mission -------------------------------------------
CREATE FUNCTION taskpulse_private.permanent_mission_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed boolean:=CASE WHEN TG_OP='INSERT' THEN NEW.is_permanent ELSE NEW.is_permanent IS DISTINCT FROM OLD.is_permanent END;
BEGIN
 IF changed THEN
  -- auth.uid() is NULL only for owner-run maintenance (migrations, workers).
  IF auth.uid() IS NOT NULL AND public.get_user_role() IS DISTINCT FROM 'managing_director'
     AND public.get_user_role() IS DISTINCT FROM 'project_engineer' THEN
   RAISE EXCEPTION 'Only the managing director or a manager makes a mission permanent or turns it off' USING ERRCODE='42501'; END IF;
  IF NEW.is_permanent AND NEW.status IN ('Done','Discarded') THEN
   RAISE EXCEPTION 'Reopen this mission before making it permanent' USING ERRCODE='23514'; END IF;
  IF NEW.is_permanent AND TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.task_checklists c WHERE c.task_id=NEW.id AND c.owner_node_id IS NOT NULL) THEN
   RAISE EXCEPTION 'This mission has Quests; a permanent mission has none. Remove its Quests first' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.is_permanent THEN
  IF NEW.status='Done' THEN
   RAISE EXCEPTION 'A permanent mission is never Done; a manager turns Permanent off first' USING ERRCODE='23514'; END IF;
  NEW.due_date:=NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_m135_permanent BEFORE INSERT OR UPDATE ON public.tasks
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.permanent_mission_guard();

-- 3. No Quests on a permanent mission -------------------------------------------------
CREATE FUNCTION taskpulse_private.permanent_mission_no_quests() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.owner_node_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.tasks t WHERE t.id=NEW.task_id AND t.is_permanent) THEN
  RAISE EXCEPTION 'A permanent mission has no Quests; add objectives to its list instead' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_m135_no_quests BEFORE INSERT OR UPDATE OF task_id,owner_node_id ON public.task_checklists
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.permanent_mission_no_quests();

-- 4. The mission form sends is_permanent ---------------------------------------------
SELECT pg_temp.m135_patch('public.save_task_with_participants(uuid,jsonb,uuid[],uuid[],integer[],bigint,boolean,uuid)',
 $f$'description','comments','template_version_id','initialize_details']<>'{}'::jsonb THEN$f$,
 $f$'description','comments','template_version_id','initialize_details','is_permanent']<>'{}'::jsonb THEN$f$);
SELECT pg_temp.m135_patch('public.save_task_with_participants(uuid,jsonb,uuid[],uuid[],integer[],bigint,boolean,uuid)',
 $f$ IF p_fields?'initialize_details' AND$f$,
 $f$ IF p_fields?'is_permanent' AND jsonb_typeof(p_fields->'is_permanent') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Mission type must be Normal or Permanent' USING ERRCODE='23514'; END IF;
 IF p_fields?'initialize_details' AND$f$);
SELECT pg_temp.m135_patch('public.save_task_with_participants(uuid,jsonb,uuid[],uuid[],integer[],bigint,boolean,uuid)',
 $f$valid_for_metrics,description,comments,assigned_date)$f$,
 $f$valid_for_metrics,description,comments,assigned_date,is_permanent)$f$);
SELECT pg_temp.m135_patch('public.save_task_with_participants(uuid,jsonb,uuid[],uuid[],integer[],bigint,boolean,uuid)',
 $f$p_fields->>'description',p_fields->>'comments',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date) RETURNING id INTO tid;$f$,
 $f$p_fields->>'description',p_fields->>'comments',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date,coalesce((p_fields->>'is_permanent')::boolean,false)) RETURNING id INTO tid;$f$);
SELECT pg_temp.m135_patch('public.save_task_with_participants(uuid,jsonb,uuid[],uuid[],integer[],bigint,boolean,uuid)',
 $f$task_scale=CASE WHEN p_fields?'task_scale' THEN (p_fields->>'task_scale')::numeric ELSE task_scale END WHERE id=tid;$f$,
 $f$task_scale=CASE WHEN p_fields?'task_scale' THEN (p_fields->>'task_scale')::numeric ELSE task_scale END,
    is_permanent=CASE WHEN p_fields?'is_permanent' THEN (p_fields->>'is_permanent')::boolean ELSE is_permanent END WHERE id=tid;$f$);

-- 5. The mission timer on a permanent mission ----------------------------------------
SELECT pg_temp.m135_patch('taskpulse_private.execution_command(text,uuid,uuid,jsonb,bigint,uuid)',
 $f$  -- The existing unique partial index is the authoritative per-user constraint.$f$,
 $f$  -- 135: only the Crew times a permanent mission; its first timer moves it to In Progress.
  IF t.is_permanent THEN
   IF NOT taskpulse_private.is_task_worker(tid,actor) THEN
    RAISE EXCEPTION 'Only the mission''s Crew times a permanent mission' USING ERRCODE='42501'; END IF;
   IF t.status<>'In Progress' THEN
    UPDATE public.tasks SET status='In Progress',started_date=coalesce(started_date,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date),
     lifecycle_version=lifecycle_version+1 WHERE id=tid;
   END IF;
  END IF;
  -- The existing unique partial index is the authoritative per-user constraint.$f$);

COMMIT;
SELECT taskpulse_private.m15_secure();
