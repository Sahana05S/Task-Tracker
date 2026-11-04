-- ===========================================================================
-- TaskPulse - label changes in Team > Activity (forward only; 4 November 2026)
--
-- Migration 112 audited label create / rename / archive / restore, but the
-- activity feed lists only the audited tables in its rules, so those lines
-- never showed; and attaching or detaching a label wrote no audit row at all
-- (user request, 4 November 2026: show label changes in Team > Activity).
--
-- 1. label_link_command writes one audit row per link it actually adds or
--    removes ('label_link_attach' / 'label_link_detach', table 'label_links',
--    row = the label). It names the mission the record belongs to (the mission
--    itself, a learning note's mission, or a meeting point's related mission),
--    so the feed's existing rule shows the line to that mission's people. A
--    replay returns from its receipt first and an unchanged link writes nothing.
-- 2. label_command and the new rows carry the label's name as the reason, so
--    the activity line says which label ("#Crane").
-- 3. activity_feed lists 'labels' (company kind) and 'label_links' (missions
--    kind) beside mission_learnings. Nothing else in the feed changes.
--
-- All three functions are patched from their live definitions (112, 112 and
-- 111); each fragment must occur exactly once. No scoring, award, permission
-- or data change.
-- ===========================================================================
BEGIN;

CREATE FUNCTION pg_temp.m116_patch(fn regprocedure, frag text, repl text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(fn);
BEGIN
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION '% does not contain this fragment exactly once; update migration 116: %',fn,left(frag,80); END IF;
 EXECUTE replace(def,frag,repl);
END $$;

-- 1. Attaching and detaching a label is audited -----------------------------
SELECT pg_temp.m116_patch('public.label_link_command(text,text,uuid,uuid,text,uuid)',
 $f$cmd text:='label_link_'||coalesce(p_op,''); l public.labels; v_slug text;$f$,
 $f$cmd text:='label_link_'||coalesce(p_op,''); l public.labels; v_slug text; link_changes integer:=0; link_mission uuid;$f$);

SELECT pg_temp.m116_patch('public.label_link_command(text,text,uuid,uuid,text,uuid)',
 $f$VALUES(l.id,p_kind,p_subject,org,actor) ON CONFLICT DO NOTHING;$f$,
 $f$VALUES(l.id,p_kind,p_subject,org,actor) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS link_changes = ROW_COUNT;$f$);

SELECT pg_temp.m116_patch('public.label_link_command(text,text,uuid,uuid,text,uuid)',
 $f$DELETE FROM public.label_links WHERE label_id=l.id AND subject_kind=p_kind AND subject_id=p_subject;$f$,
 $f$DELETE FROM public.label_links WHERE label_id=l.id AND subject_kind=p_kind AND subject_id=p_subject;
  GET DIAGNOSTICS link_changes = ROW_COUNT;$f$);

SELECT pg_temp.m116_patch('public.label_link_command(text,text,uuid,uuid,text,uuid)',
 $f$ result:=taskpulse_private.label_json(l);$f$,
 $f$ IF link_changes>0 THEN
  link_mission:=CASE p_kind
   WHEN 'task' THEN p_subject
   WHEN 'mission_learning' THEN (SELECT x.task_id FROM public.mission_learnings x WHERE x.id=p_subject)
   WHEN 'meeting_point' THEN (SELECT x.related_task_id FROM public.meeting_points x WHERE x.id=p_subject) END;
  INSERT INTO taskpulse_private.audit_events(organization_id,actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
  VALUES(org,actor,caller_role::text,cmd,'label_links',l.id,ARRAY['label_id'],
   jsonb_build_object('subject_kind',p_kind,'subject_id',p_subject,'task_id',jsonb_build_object('after',link_mission),'reason','#'||l.name),
   p_operation);
 END IF;
 result:=taskpulse_private.label_json(l);$f$);

-- 2. Label commands name the label ----------------------------------------
SELECT pg_temp.m116_patch('public.label_command(text,uuid,text,text,text,uuid)',
 $f$jsonb_build_object('name',jsonb_build_object('after',saved.name)),p_operation);$f$,
 $f$jsonb_build_object('name',jsonb_build_object('after',saved.name),'reason','#'||saved.name),p_operation);$f$);

-- 3. The activity feed lists both ------------------------------------------
SELECT pg_temp.m116_patch('public.activity_feed(date,date,text,uuid,jsonb,integer)',
 $f$('mission_learnings', 'missions', false)$f$,
 $f$('mission_learnings', 'missions', false),
      -- Labels (migration 112, listed from 116): the directory's changes, and each label
      -- added to or removed from a record, shown with the record's mission.
      ('labels', 'company', false), ('label_links', 'missions', false)$f$);

COMMIT;
SELECT taskpulse_private.m15_secure();
