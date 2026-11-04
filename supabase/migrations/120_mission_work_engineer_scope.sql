-- ===========================================================================
-- TaskPulse - project engineers and mission work they are not on
-- (forward only; 4 November 2026)
--
-- Migration 117 made a mission's checklist and work readable only to the
-- managing director and the mission's people (a project engineer only when on
-- it). Two paths were left open (user request, 4 November 2026: close both):
--
-- 1. activity_feed showed project engineers every mission's lines in Team >
--    Activity, objective titles included. A project engineer now sees mission
--    lines only for missions they work on, review or observe (activity_tasks),
--    plus their own actions and lines about themselves, like any member. The
--    other kinds (records, time, people, month, company) stay manager-wide.
-- 2. checklist_command and task_details_command_m05 still accepted a project
--    engineer's writes on any mission. They now require can_read_mission_work
--    for a project engineer ('This checklist is private to the mission's
--    people'), and the direct-table manager policies on task_checklists,
--    checklist_nodes, task_detail_sections and task_links (split out by 117)
--    use the same rule. Mission creation (initialize_native_details), Task
--    Tools and every definer read are unchanged; the managing director is
--    unchanged.
--
-- Functions are patched from their live definitions (activity_feed 111+116,
-- checklist_command 114, task_details_command_m05 17+108); each fragment must
-- occur exactly once. No scoring, award or data change.
-- ===========================================================================
BEGIN;

CREATE FUNCTION pg_temp.m120_patch(fn regprocedure, frag text, repl text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(fn);
BEGIN
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION '% does not contain this fragment exactly once; update migration 120: %',fn,left(frag,80); END IF;
 EXECUTE replace(def,frag,repl);
END $$;

-- 1. Team > Activity: project engineers see the missions they are on ---------
SELECT pg_temp.m120_patch('public.activity_feed(date,date,text,uuid,jsonb,integer)',
 $f$IF NOT manager THEN my_tasks := taskpulse_private.activity_tasks(me); END IF;$f$,
 $f$IF caller <> 'managing_director' THEN my_tasks := taskpulse_private.activity_tasks(me); END IF;$f$);

SELECT pg_temp.m120_patch('public.activity_feed(date,date,text,uuid,jsonb,integer)',
 $f$AND (manager OR f.actor_id = me$f$,
 $f$AND ((manager AND (caller = 'managing_director' OR f.kind <> 'missions')) OR f.actor_id = me$f$);

-- 2. Checklist and detail writes: a project engineer only on their missions ---
SELECT pg_temp.m120_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $f$IF p_command='section' THEN RAISE EXCEPTION 'Section reviews were retired; an empty section is N/A' USING ERRCODE='23514'; END IF;$f$,
 $f$IF p_command='section' THEN RAISE EXCEPTION 'Section reviews were retired; an empty section is N/A' USING ERRCODE='23514'; END IF;
 IF role='project_engineer' AND NOT taskpulse_private.can_read_mission_work(p_task) THEN
  RAISE EXCEPTION 'This checklist is private to the mission''s people' USING ERRCODE='42501'; END IF;$f$);

SELECT pg_temp.m120_patch('public.task_details_command_m05(uuid,text,jsonb,bigint,uuid)',
 $f$RAISE EXCEPTION 'A manager or one of the mission''s people is required' USING ERRCODE='42501'; END IF;$f$,
 $f$RAISE EXCEPTION 'A manager or one of the mission''s people is required' USING ERRCODE='42501'; END IF;
 IF role='project_engineer' AND NOT taskpulse_private.can_read_mission_work(p_task) THEN
  RAISE EXCEPTION 'This checklist is private to the mission''s people' USING ERRCODE='42501'; END IF;$f$);

-- Direct-table manager writes (117's m01_admin_* policies) follow the same rule.
DO $$ DECLARE tbl text; rule text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['task_checklists','checklist_nodes','task_detail_sections','task_links'] LOOP
  rule:=format('public.get_user_role()=''managing_director'' OR (public.get_user_role()=''project_engineer'' AND %s)',
   CASE tbl WHEN 'checklist_nodes' THEN 'public.can_read_checklist(checklist_id)' ELSE 'public.can_read_mission_work(task_id)' END);
  CONTINUE WHEN NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename=tbl AND policyname='m01_admin_insert');
  EXECUTE format('DROP POLICY m01_admin_insert ON public.%I',tbl);
  EXECUTE format('DROP POLICY IF EXISTS m01_admin_update ON public.%I',tbl);
  EXECUTE format('DROP POLICY IF EXISTS m01_admin_delete ON public.%I',tbl);
  EXECUTE format('CREATE POLICY m01_admin_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',tbl,rule);
  EXECUTE format('CREATE POLICY m01_admin_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',tbl,rule,rule);
  EXECUTE format('CREATE POLICY m01_admin_delete ON public.%I FOR DELETE TO authenticated USING (%s)',tbl,rule);
 END LOOP;
END $$;

COMMIT;
SELECT taskpulse_private.m15_secure();
