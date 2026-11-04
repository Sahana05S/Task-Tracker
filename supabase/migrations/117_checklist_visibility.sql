-- ===========================================================================
-- TaskPulse - who can see a mission's checklist and work (4 November 2026)
--
-- User decisions (4 November 2026):
--  * A mission's checklist and work content (checklist, objectives, sections,
--    details, links, objective reviews, item time, timer session lines, files,
--    mistakes and learning) are visible only to the managing director, the
--    mission's Owner, assignees and zero-share collaborators (any
--    task_assignees row, or the legacy tasks.assignee_id) and its reviewers
--    and observers (any task_reviewers row). Project engineers see it only
--    when they are on the mission. Everyone else is told it is private.
--  * The managing director, the Owner and the mission's assignees decide who
--    observes (add/remove observer). Collaborator management and ownership
--    transfer stay with the managing director, project engineers and Owner.
--  * Collaborators no longer mark the mission Done.
--  * Observers are view-only for files: no proof or Input / Process / Output
--    upload or removal; they still see and open them.
--
-- 1. taskpulse_private.can_read_mission_work(task) and the RLS helpers
--    public.can_read_mission_work(task) / public.can_read_checklist(checklist).
-- 2. Read policies on task_checklists, checklist_nodes (through checklist_id,
--    so a Quest's own checklist, whose task_id is the mission, follows it),
--    checklist_sections, task_detail_sections and task_links use the rule.
--    The old m01_admin FOR ALL policies also granted managers SELECT; they are
--    split into INSERT / UPDATE / DELETE policies with the same rule, so
--    writes are unchanged. tasks, task_assignees, task_reviewers stay readable
--    company-wide; checklist_rollups (numbers only) is unchanged.
-- 3. Definer reads raise 42501 ('This checklist is private to the mission''s
--    people') for anyone else, the way task_proofs already did: checklist_branch,
--    checklist_reviews, checklist_item_seconds, timer_session_activity,
--    task_effort_breakdown, mission_learnings(task); task_proofs, file_access
--    and the mission-proofs bucket follow task_proof_allowed, now the same rule.
--    labelled() and label counts hide learning notes the caller cannot read.
--    Adding learning notes needs the same access (a project engineer on the
--    mission).
-- 4. activity_tasks (activity feed) includes missions the member reviews or
--    observes.
-- 5. task_command('transition' to Done): credited assignees, the Owner and
--    managers only (not collaborators).
-- 6. task_proof_command and the bucket's upload / discard policies: not
--    observers (task_proof_writer). task_proofs(task) shows canRemove only to
--    writers.
-- 7. task_people_command: add/remove observer by the managing director, the
--    Owner and credited assignees.
--
-- Scoring, reports and awards read through their own definer functions
-- (m15_scope only) and are not affected. Functions are patched from their live
-- definitions; each fragment must occur exactly once.
-- ===========================================================================
BEGIN;

CREATE FUNCTION pg_temp.m117_patch(fn regprocedure, frag text, repl text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(fn);
BEGIN
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION '% does not contain this fragment exactly once; update migration 117: %',fn,left(frag,80); END IF;
 EXECUTE replace(def,frag,repl);
END $$;

-- 1. The rule -------------------------------------------------------------
CREATE FUNCTION taskpulse_private.can_read_mission_work(p_task uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND public.get_user_role() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.tasks t WHERE t.id=p_task AND t.organization_id=public.current_organization()
   AND (public.get_user_role()='managing_director'
    OR t.assignee_id=auth.uid()
    OR EXISTS(SELECT 1 FROM public.task_assignees a WHERE a.task_id=t.id AND a.user_id=auth.uid())
    OR EXISTS(SELECT 1 FROM public.task_reviewers r WHERE r.task_id=t.id AND r.user_id=auth.uid())));
$$;
REVOKE ALL ON FUNCTION taskpulse_private.can_read_mission_work(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- RLS runs as the caller, who has no usage on taskpulse_private.
CREATE FUNCTION public.can_read_mission_work(p_task uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT taskpulse_private.can_read_mission_work(p_task);
$$;
CREATE FUNCTION public.can_read_checklist(p_checklist uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.task_checklists c WHERE c.id=p_checklist
  AND taskpulse_private.can_read_mission_work(c.task_id));
$$;
REVOKE ALL ON FUNCTION public.can_read_mission_work(uuid),public.can_read_checklist(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.can_read_mission_work(uuid),public.can_read_checklist(uuid) TO authenticated;

-- 2. Read policies --------------------------------------------------------
DROP POLICY m01_read ON public.task_checklists;
CREATE POLICY m01_read ON public.task_checklists FOR SELECT TO authenticated
 USING (public.can_read_mission_work(task_id));
DROP POLICY m01_read ON public.checklist_nodes;
CREATE POLICY m01_read ON public.checklist_nodes FOR SELECT TO authenticated
 USING (public.can_read_checklist(checklist_id));
DROP POLICY m05_section_read ON public.checklist_sections;
CREATE POLICY m05_section_read ON public.checklist_sections FOR SELECT TO authenticated
 USING (public.can_read_checklist(checklist_id));
DROP POLICY m01_read ON public.task_detail_sections;
CREATE POLICY m01_read ON public.task_detail_sections FOR SELECT TO authenticated
 USING (public.can_read_mission_work(task_id));
DROP POLICY m04_links_read ON public.task_links;
CREATE POLICY m04_links_read ON public.task_links FOR SELECT TO authenticated USING (public.can_read_mission_work(task_id) AND
 (related_report_id IS NULL OR EXISTS(SELECT 1 FROM public.report_snapshots r WHERE r.id=related_report_id AND public.can_read_employee_details(r.employee_id))));

-- m01_admin (migration 10) was FOR ALL, so it also let managers read every row. Same write rule, no SELECT.
DO $$ DECLARE tbl text; rule text:='public.get_user_role() IN (''managing_director'',''project_engineer'')'; BEGIN
 FOREACH tbl IN ARRAY ARRAY['task_checklists','checklist_nodes','task_detail_sections','task_links'] LOOP
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename=tbl AND policyname='m01_admin') THEN
   EXECUTE format('DROP POLICY m01_admin ON public.%I',tbl);
   EXECUTE format('CREATE POLICY m01_admin_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',tbl,rule);
   EXECUTE format('CREATE POLICY m01_admin_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',tbl,rule,rule);
   EXECUTE format('CREATE POLICY m01_admin_delete ON public.%I FOR DELETE TO authenticated USING (%s)',tbl,rule);
  END IF;
 END LOOP;
END $$;

-- 3. Definer reads --------------------------------------------------------
SELECT pg_temp.m117_patch('public.checklist_branch(uuid,uuid,uuid,text,integer,integer)',
 $f$SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task;$f$,
 $f$SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task;
 IF NOT taskpulse_private.can_read_mission_work(p_task) THEN
  RAISE EXCEPTION 'This checklist is private to the mission''s people' USING ERRCODE='42501'; END IF;$f$);

SELECT pg_temp.m117_patch('public.checklist_reviews(uuid)',
 $f$IF NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=p_task) THEN RAISE EXCEPTION 'Mission not found' USING ERRCODE='23514'; END IF;$f$,
 $f$IF NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=p_task) THEN RAISE EXCEPTION 'Mission not found' USING ERRCODE='23514'; END IF;
 IF NOT taskpulse_private.can_read_mission_work(p_task) THEN
  RAISE EXCEPTION 'This checklist is private to the mission''s people' USING ERRCODE='42501'; END IF;$f$);

SELECT pg_temp.m117_patch('public.checklist_item_seconds(uuid,uuid)',
 $f$IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;$f$,
 $f$IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF NOT taskpulse_private.can_read_mission_work(p_task) THEN
  RAISE EXCEPTION 'This checklist is private to the mission''s people' USING ERRCODE='42501'; END IF;$f$);

SELECT pg_temp.m117_patch('public.task_effort_breakdown(uuid)',
 $f$IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;$f$,
 $f$IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF NOT taskpulse_private.can_read_mission_work(p_task_id) THEN
  RAISE EXCEPTION 'This checklist is private to the mission''s people' USING ERRCODE='42501'; END IF;$f$);

SELECT pg_temp.m117_patch('public.timer_session_activity(uuid,integer)',
 $f$manager := caller IN ('managing_director', 'project_engineer');$f$,
 $f$manager := caller IN ('managing_director', 'project_engineer');
  IF NOT taskpulse_private.can_read_mission_work(p_task) THEN
    RAISE EXCEPTION 'This checklist is private to the mission''s people' USING ERRCODE = '42501';
  END IF;$f$);

SELECT pg_temp.m117_patch('public.mission_learnings(uuid)',
 $f$IF NOT FOUND THEN RAISE EXCEPTION 'Mission not found' USING ERRCODE='P0002'; END IF;$f$,
 $f$IF NOT FOUND THEN RAISE EXCEPTION 'Mission not found' USING ERRCODE='P0002'; END IF;
 IF NOT taskpulse_private.can_read_mission_work(p_task) THEN
  RAISE EXCEPTION 'This checklist is private to the mission''s people' USING ERRCODE='42501'; END IF;$f$);

-- Adding notes: managing director, the mission's assignees, project engineers on the mission (body from 111).
CREATE OR REPLACE FUNCTION taskpulse_private.mission_learning_writer(p_task uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND public.get_user_role() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.tasks t WHERE t.id=p_task AND t.organization_id=public.current_organization())
  AND (public.get_user_role()='managing_director' OR public.is_task_assignee(p_task)
   OR (public.get_user_role()='project_engineer' AND taskpulse_private.can_read_mission_work(p_task)));
$$;

-- Label pages list a learning note only to those who may read its mission (body from 112).
SELECT pg_temp.m117_patch('taskpulse_private.label_subject_readable(text,uuid)',
 $f$AND l.organization_id=public.current_organization() AND l.record_state='active')$f$,
 $f$AND l.organization_id=public.current_organization() AND l.record_state='active'
   AND taskpulse_private.can_read_mission_work(l.task_id))$f$);

-- Mission files: the same people see them (body from 101).
CREATE OR REPLACE FUNCTION taskpulse_private.task_proof_allowed(p_task uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT taskpulse_private.can_read_mission_work(p_task);
$$;

-- 6. ... and all but observers add or remove them.
CREATE FUNCTION taskpulse_private.task_proof_writer(p_task uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT taskpulse_private.task_proof_allowed(p_task) AND (public.get_user_role()='managing_director'
  OR EXISTS(SELECT 1 FROM public.tasks t WHERE t.id=p_task AND t.assignee_id=auth.uid())
  OR EXISTS(SELECT 1 FROM public.task_assignees a WHERE a.task_id=p_task AND a.user_id=auth.uid())
  OR EXISTS(SELECT 1 FROM public.task_reviewers r WHERE r.task_id=p_task AND r.user_id=auth.uid() AND r.reviewer_role<>'Observer'));
$$;
REVOKE ALL ON FUNCTION taskpulse_private.task_proof_writer(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.task_proof_folder_writable(p_name text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE part text[]:=string_to_array(coalesce(p_name,''),'/'); BEGIN
 IF array_length(part,1)<>3 OR part[1] IS DISTINCT FROM public.current_organization()::text
  OR part[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
 RETURN taskpulse_private.task_proof_writer(part[2]::uuid);
END $$;
REVOKE ALL ON FUNCTION public.task_proof_folder_writable(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.task_proof_folder_writable(text) TO authenticated;

SELECT pg_temp.m117_patch('public.task_proof_command(text,uuid,text,text,text,integer,uuid,uuid,text)',
 $f$IF NOT taskpulse_private.task_proof_allowed(p_task) THEN
  RAISE EXCEPTION 'Only the mission''s people and managers can change its files' USING ERRCODE='42501'; END IF;$f$,
 $f$IF NOT taskpulse_private.task_proof_writer(p_task) THEN
  RAISE EXCEPTION 'Only the mission''s people can change its files; observers can view them' USING ERRCODE='42501'; END IF;$f$);

SELECT pg_temp.m117_patch('public.task_proofs(uuid)',
 $f$DECLARE manager boolean:=public.get_user_role() IN ('managing_director','project_engineer'); BEGIN$f$,
 $f$DECLARE manager boolean:=public.get_user_role() IN ('managing_director','project_engineer');
 writer boolean:=taskpulse_private.task_proof_writer(p_task); BEGIN$f$);
SELECT pg_temp.m117_patch('public.task_proofs(uuid)',
 $f$'canRemove',manager OR p.uploaded_by=auth.uid())$f$,
 $f$'canRemove',writer AND (manager OR p.uploaded_by=auth.uid()))$f$);

DO $$ BEGIN
 IF to_regclass('storage.objects') IS NULL THEN RETURN; END IF;
 EXECUTE 'DROP POLICY IF EXISTS mission_proofs_upload ON storage.objects';
 EXECUTE 'DROP POLICY IF EXISTS mission_proofs_discard ON storage.objects';
 EXECUTE $p$CREATE POLICY mission_proofs_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='mission-proofs' AND public.task_proof_folder_writable(name))$p$;
 EXECUTE $p$CREATE POLICY mission_proofs_discard ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='mission-proofs' AND public.task_proof_folder_writable(name) AND NOT public.task_proof_in_use(name))$p$;
END $$;

-- 4. Activity feed: missions the member works on, reviews or observes (body from 54).
CREATE OR REPLACE FUNCTION taskpulse_private.activity_tasks(p_user uuid) RETURNS uuid[]
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(array_agg(t.id), '{}') FROM public.tasks t
  WHERE EXISTS (SELECT 1 FROM public.task_assignees a WHERE a.task_id = t.id AND a.user_id = p_user)
    OR (t.participant_credit_mode = 'legacy' AND t.assignee_id = p_user)
    OR EXISTS (SELECT 1 FROM public.task_reviewers r WHERE r.task_id = t.id AND r.user_id = p_user);
$$;

-- 5. Collaborators do not mark the mission Done.
SELECT pg_temp.m117_patch('taskpulse_private.task_command(uuid,text,jsonb,bigint,uuid)',
 $f$IF desired='Done' THEN PERFORM taskpulse_private.assert_checklist_done(p_task); END IF;$f$,
 $f$IF desired='Done' AND NOT(role IN ('managing_director','project_engineer') OR taskpulse_private.is_task_worker(p_task,actor)) THEN
    RAISE EXCEPTION 'Collaborators cannot mark the mission Done; ask its owner or an assignee' USING ERRCODE='42501'; END IF;
   IF desired='Done' THEN PERFORM taskpulse_private.assert_checklist_done(p_task); END IF;$f$);

-- 7. Observers: the managing director, the Owner and credited assignees.
SELECT pg_temp.m117_patch('public.task_people_command(uuid,text,jsonb,bigint,uuid)',
 $f$IF NOT(role IN ('managing_director','project_engineer') OR t.assignee_id=actor) THEN
  RAISE EXCEPTION 'Only a manager or the mission''s owner changes its people' USING ERRCODE='42501'; END IF;$f$,
 $f$IF p_command IN ('add_observer','remove_observer') THEN
  IF NOT(role='managing_director' OR t.assignee_id=actor OR taskpulse_private.is_task_worker(p_task,actor)) THEN
   RAISE EXCEPTION 'Only the managing director, the mission''s owner or its assignees choose observers' USING ERRCODE='42501'; END IF;
 ELSIF NOT(role IN ('managing_director','project_engineer') OR t.assignee_id=actor) THEN
  RAISE EXCEPTION 'Only a manager or the mission''s owner changes its people' USING ERRCODE='42501'; END IF;$f$);

COMMIT;
SELECT taskpulse_private.m15_secure();
