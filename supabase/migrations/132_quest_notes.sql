-- ===========================================================================
-- TaskPulse - Quest notes with labels (forward only; 6 November 2026)
--
-- User request (6 November 2026): a Crew member who makes a mistake or learns
-- something while working on a Quest writes it down on that Quest, tags it
-- with ordinary labels (#mistake is a normal label the company creates), and
-- later sees such notes grouped per label and per Quest. Labels stay the only
-- tagging system; notes and labels feed no score. Migration 129 removed the
-- earlier notes; this brings back a smaller version on Quests only.
--
-- 1. public.mission_learnings is reused: a note belongs to one Quest row of
--    its mission (checklist_node_id). The type-hashtag rule of 126 is gone
--    (both constraint triggers are dropped); no starter hashtags are made.
-- 2. public.mission_note_command(op, task, note, node, body, labels,
--    new_labels, operation) is granted again with these rules:
--    add    - the mission's Crew, Managers and the managing director who may
--             read the mission's work (117); on a Quest of that mission; at
--             least one label (existing ones by id or name; a new name only
--             for Managers and the managing director, as label rules say).
--    edit   - the author only. delete - the author, Managers and the MD.
--    Audited as mission_note_<op> with the labels ("#mistake #client") as
--    the reason and the Quest's name; the note's text is never copied.
--    mission_learning_command (111) stays revoked.
-- 3. Reads, for those who may read the mission's work only:
--    quest_notes(node)       - one Quest's notes, newest first, with labels
--                              and what the caller may do;
--    quest_note_counts(task) - per Quest row, how many notes it has.
-- 4. labelled(): a note item also names the list its Quest sits in (listId),
--    so the label page links to that Quest's row with its notes open.
-- ===========================================================================
BEGIN;

CREATE FUNCTION pg_temp.m132_patch(fn regprocedure, frag text, repl text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(fn);
BEGIN
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION '% does not contain this fragment exactly once; update migration 132: %',fn,left(frag,80); END IF;
 EXECUTE replace(def,frag,repl);
END $$;

-- 1. No type-hashtag rule --------------------------------------------------------
DROP TRIGGER mission_learnings_note_type ON public.mission_learnings;
DROP TRIGGER label_links_note_type ON public.label_links;

-- 2. The command (126 body: Quest only, at least one label, no types, no starters)
CREATE OR REPLACE FUNCTION public.mission_note_command(p_op text,p_task uuid,p_note uuid,p_node uuid,p_body text,
 p_labels uuid[],p_new_labels text[],p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); caller_role public.user_role:=public.get_user_role();
 manager boolean; receipt taskpulse_private.command_receipts; cmd text:='mission_note_'||coalesce(p_op,'');
 v_body text:=btrim(coalesce(p_body,'')); saved public.mission_learnings; result jsonb; t public.tasks;
 ids uuid[]:='{}'; nm text; v_slug text; v_name text; found_id uuid; v_kind text; line text; node_title text;
 request jsonb:=jsonb_build_array(p_op,p_task,p_note,p_node,p_body,p_labels,p_new_labels); BEGIN
 IF actor IS NULL OR org IS NULL OR caller_role IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 manager:=caller_role IN ('managing_director','project_engineer');
 IF p_op IS NULL OR p_op NOT IN ('add','edit','delete') OR p_operation IS NULL OR p_task IS NULL
  OR (p_op<>'add' AND p_note IS NULL) OR (p_op='add' AND p_node IS NULL) THEN
  RAISE EXCEPTION 'Add, edit or delete a note, with a mission, a Quest and an operation id' USING ERRCODE='23514'; END IF;
 SELECT * INTO t FROM public.tasks x WHERE x.id=p_task AND x.organization_id=org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mission not found' USING ERRCODE='P0002'; END IF;
 IF NOT taskpulse_private.can_read_mission_work(p_task) THEN
  RAISE EXCEPTION 'This mission''s notes are private to its people' USING ERRCODE='42501'; END IF;
 IF p_op='add' AND NOT taskpulse_private.mission_learning_writer(p_task) THEN
  RAISE EXCEPTION 'Only the mission''s Crew, Managers and the managing director add notes' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mission_learnings:'||p_task::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=cmd AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;
 IF t.archived_effective_date IS NOT NULL THEN
  RAISE EXCEPTION 'This mission is archived and read-only' USING ERRCODE='23514'; END IF;

 IF p_op IN ('add','edit') THEN
  IF v_body='' OR length(v_body)>2000 THEN
   RAISE EXCEPTION 'Write between 1 and 2000 characters' USING ERRCODE='23514'; END IF;
  ids:=ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_labels,'{}'::uuid[])) x WHERE x IS NOT NULL);
  -- Labels typed by name: an existing one by slug; a new one only for Managers and the MD (label rules).
  FOREACH nm IN ARRAY coalesce(p_new_labels,'{}'::text[]) LOOP
   v_name:=regexp_replace(ltrim(btrim(coalesce(nm,'')),'#'),'\s+',' ','g');
   v_slug:=taskpulse_private.label_slug(v_name);
   IF v_slug IS NULL OR length(v_name)>40 THEN
    RAISE EXCEPTION 'A label needs a name of up to 40 characters with a letter or number' USING ERRCODE='23514'; END IF;
   SELECT l.id INTO found_id FROM public.labels l WHERE l.organization_id=org AND l.slug=v_slug;
   IF NOT FOUND THEN
    IF NOT manager THEN
     RAISE EXCEPTION '#% does not exist yet; ask a Manager or the managing director to create it',v_name USING ERRCODE='42501'; END IF;
    result:=public.label_command('create',NULL,v_name,NULL,NULL,md5(p_operation::text||':'||v_slug)::uuid);
    found_id:=(result->>'id')::uuid;
   END IF;
   IF NOT found_id=ANY(ids) THEN ids:=ids||found_id; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM unnest(ids) x WHERE NOT EXISTS(SELECT 1 FROM public.labels l WHERE l.id=x AND l.organization_id=org)) THEN
   RAISE EXCEPTION 'Label not found' USING ERRCODE='P0002'; END IF;
  IF EXISTS(SELECT 1 FROM public.labels l WHERE l.id=ANY(ids) AND l.archived_at IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.label_links k WHERE k.label_id=l.id AND k.subject_kind='mission_learning'
    AND k.subject_id IS NOT DISTINCT FROM p_note)) THEN
   RAISE EXCEPTION 'An archived label cannot be added' USING ERRCODE='23514'; END IF;
  IF coalesce(array_length(ids,1),0)=0 THEN
   RAISE EXCEPTION 'Add at least one label, such as #mistake' USING ERRCODE='23514'; END IF;
  IF array_length(ids,1)>20 THEN
   RAISE EXCEPTION 'A note carries up to 20 labels' USING ERRCODE='23514'; END IF;
  -- The old kind column is kept for older readers: #mistake or #learning when the note carries one.
  v_kind:=CASE WHEN EXISTS(SELECT 1 FROM public.labels l WHERE l.id=ANY(ids) AND l.slug='mistake') THEN 'mistake'
   WHEN EXISTS(SELECT 1 FROM public.labels l WHERE l.id=ANY(ids) AND l.slug='learning') THEN 'learning' END;
 END IF;

 IF p_op='add' THEN
  IF NOT EXISTS(SELECT 1 FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id
   WHERE n.id=p_node AND c.task_id=p_task AND EXISTS(SELECT 1 FROM public.task_checklists o WHERE o.owner_node_id=n.id)) THEN
   RAISE EXCEPTION 'Notes go on a Quest of this mission' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM public.mission_learnings WHERE task_id=p_task AND record_state='active')>=500 THEN
   RAISE EXCEPTION 'A mission keeps up to 500 notes; delete one first' USING ERRCODE='23514'; END IF;
  INSERT INTO public.mission_learnings(organization_id,task_id,checklist_node_id,kind,body,author_id)
  VALUES(org,p_task,p_node,v_kind,v_body,actor) RETURNING * INTO saved;
 ELSIF p_op='edit' THEN
  UPDATE public.mission_learnings SET kind=v_kind,body=v_body,updated_at=clock_timestamp()
  WHERE id=p_note AND task_id=p_task AND record_state='active' AND author_id=actor
  RETURNING * INTO saved;
 ELSE
  UPDATE public.mission_learnings SET record_state='withdrawn',updated_at=clock_timestamp()
  WHERE id=p_note AND task_id=p_task AND record_state='active' AND (manager OR author_id=actor)
  RETURNING * INTO saved;
 END IF;
 IF saved.id IS NULL THEN
  RAISE EXCEPTION 'Only the person who wrote a note can edit it; they, a Manager or the managing director can delete it' USING ERRCODE='P0002'; END IF;

 IF p_op IN ('add','edit') THEN
  DELETE FROM public.label_links WHERE subject_kind='mission_learning' AND subject_id=saved.id AND label_id<>ALL(ids);
  INSERT INTO public.label_links(label_id,subject_kind,subject_id,organization_id,created_by)
  SELECT x,'mission_learning',saved.id,org,actor FROM unnest(ids) x ON CONFLICT DO NOTHING;
 END IF;
 line:=taskpulse_private.note_hashtag_line(saved.id);
 SELECT n.title INTO node_title FROM public.checklist_nodes n WHERE n.id=saved.checklist_node_id;

 -- The labels and the Quest's name; never the note's text.
 INSERT INTO taskpulse_private.audit_events(organization_id,actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(org,actor,caller_role::text,cmd,'mission_learnings',saved.id,
  CASE p_op WHEN 'delete' THEN ARRAY['record_state'] WHEN 'edit' THEN ARRAY['body','labels'] ELSE ARRAY['body','labels','task_id'] END,
  jsonb_build_object('task_id',jsonb_build_object('after',p_task),'checklist_node_id',saved.checklist_node_id,
   'node_title',node_title,'reason',line),p_operation);
 result:=jsonb_build_object('id',saved.id,'state',saved.record_state);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,cmd,p_operation,request,saved.id,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.mission_note_command(text,uuid,uuid,uuid,text,uuid[],text[],uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mission_note_command(text,uuid,uuid,uuid,text,uuid[],text[],uuid) TO authenticated;

-- 3. Reads -------------------------------------------------------------------------
CREATE FUNCTION public.quest_notes(p_node uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE me uuid:=auth.uid(); manager boolean:=public.get_user_role() IN ('managing_director','project_engineer');
 task uuid; is_open boolean; title text; BEGIN
 IF me IS NULL OR public.get_user_role() IS NULL OR public.current_organization() IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 SELECT c.task_id,t.archived_effective_date IS NULL,n.title INTO task,is_open,title
 FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id JOIN public.tasks t ON t.id=c.task_id
 WHERE n.id=p_node AND t.organization_id=public.current_organization()
  AND EXISTS(SELECT 1 FROM public.task_checklists o WHERE o.owner_node_id=n.id);
 IF NOT FOUND THEN RAISE EXCEPTION 'Quest not found' USING ERRCODE='P0002'; END IF;
 IF NOT taskpulse_private.can_read_mission_work(task) THEN
  RAISE EXCEPTION 'This mission''s notes are private to its people' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('taskId',task,'nodeId',p_node,'questTitle',title,
  'canAdd',taskpulse_private.mission_learning_writer(task) AND is_open,
  'items',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',l.id,'body',l.body,'authorId',l.author_id,'authorName',u.full_name,
   'createdAt',l.created_at,'updatedAt',l.updated_at,'edited',l.updated_at>l.created_at,
   'canEdit',is_open AND l.author_id=me,'canDelete',is_open AND (manager OR l.author_id=me),
   'labels',(SELECT coalesce(jsonb_agg(taskpulse_private.label_json(b) ORDER BY lower(b.name)),'[]'::jsonb)
     FROM public.label_links k JOIN public.labels b ON b.id=k.label_id
     WHERE k.subject_kind='mission_learning' AND k.subject_id=l.id))
   ORDER BY l.created_at DESC, l.id),'[]'::jsonb)
  FROM public.mission_learnings l LEFT JOIN public.users u ON u.id=l.author_id
  WHERE l.checklist_node_id=p_node AND l.record_state='active'));
END $$;

CREATE FUNCTION public.quest_note_counts(p_task uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF auth.uid() IS NULL OR public.get_user_role() IS NULL OR p_task IS NULL OR NOT taskpulse_private.can_read_mission_work(p_task) THEN
  RAISE EXCEPTION 'This mission''s notes are private to its people' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_object_agg(x.node,x.n) FROM (
   SELECT l.checklist_node_id node,count(*) n FROM public.mission_learnings l
   WHERE l.task_id=p_task AND l.record_state='active' AND l.checklist_node_id IS NOT NULL
    AND l.organization_id=public.current_organization()
   GROUP BY l.checklist_node_id) x),'{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.quest_notes(uuid),public.quest_note_counts(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.quest_notes(uuid),public.quest_note_counts(uuid) TO authenticated;

-- 4. The label page links a note to its Quest's row -----------------------------------
SELECT pg_temp.m132_patch('public.labelled(text)',
 $f$'nodeTitle',(SELECT n.title FROM public.checklist_nodes n WHERE n.id=m.checklist_node_id),$f$,
 $f$'nodeTitle',(SELECT n.title FROM public.checklist_nodes n WHERE n.id=m.checklist_node_id),
      'listId',(SELECT n.checklist_id FROM public.checklist_nodes n WHERE n.id=m.checklist_node_id),
      'rootList',(SELECT c.owner_node_id IS NULL FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE n.id=m.checklist_node_id),$f$);

COMMIT;
SELECT taskpulse_private.m15_secure();
