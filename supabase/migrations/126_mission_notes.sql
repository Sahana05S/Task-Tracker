-- ===========================================================================
-- TaskPulse - Notes with hashtags (forward only; 6 November 2026)
--
-- User request (6 November 2026): replace Mistakes and learning with one Notes
-- panel. A note is a short text carrying one or more hashtags (workspace
-- labels); at least one is a "type" hashtag. Notes belong to a mission, or to
-- one of its Quests or objectives, and stay private to the mission's people.
--
-- 1. public.mission_learnings is reused as the notes table: a nullable
--    checklist_node_id (a Quest or objective of the same mission; SET NULL if
--    the row is removed) and a nullable kind (kept, derived from #mistake /
--    #learning, for the old read during the deploy).
-- 2. public.labels.note_type marks the company's note types. Managers set it
--    in Settings > Company (label_command ops note_type_on / note_type_off).
-- 3. Starter hashtags, created once per company by slug and never duplicated:
--    types #mistake #learning #idea #decision #risk #blocker #followup; topics
--    #client #vendor #approval #government #site #design #drawing #estimate
--    #payment #documentation; causes #communication #delay #rework
--    #missinginfo #quality #budget; impact #critical #minor #repeat. A company
--    with no type hashtag at all gets them on its next note.
-- 4. Every existing note keeps its author, dates, text and labels and gains
--    #mistake or #learning from its kind. Nothing is deleted.
-- 5. A deferred constraint trigger refuses an active note without a type
--    hashtag (insert, edit, or removing its last type hashtag).
-- 6. public.mission_note_command(op, task, note, node, body, labels,
--    new_labels, operation): add / edit / delete in one transaction with the
--    note's hashtags. Add: the mission's Crew, Managers on it and the
--    managing director (unchanged writer rule); edit: the author; delete: the
--    author or a manager. Audited as mission_note_<op> with the hashtags as
--    the reason ("#mistake #client"), so Team > Activity and the mission's
--    History read "Added a note #mistake #client".
-- 7. public.mission_notes(task): the mission's notes (its own and its Quests'
--    and objectives'), newest first, with hashtags and where each came from.
--    Only can_read_mission_work (117) callers; others get 42501.
-- 8. public.mission_note_hashtags(tasks): per mission the hashtag slugs its
--    readable notes carry (Missions page filter).
-- 9. labelled(): a note item also names its mission id, its Quest/objective
--    id and title. mission_activity(): a note line names its Quest/objective.
-- 10. Compatibility: mission_learning_command keeps its signature and calls
--    the new command (kind -> #mistake / #learning); mission_learnings(task)
--    is unchanged.
--
-- label_command (112+116), label_json (112), labelled (112) and
-- mission_activity (124) are patched from their live definitions; each
-- fragment must occur exactly once. No scoring, award or report change.
-- ===========================================================================
BEGIN;

CREATE FUNCTION pg_temp.m126_patch(fn regprocedure, frag text, repl text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(fn);
BEGIN
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION '% does not contain this fragment exactly once; update migration 126: %',fn,left(frag,80); END IF;
 EXECUTE replace(def,frag,repl);
END $$;

-- 1. Notes on Quests and objectives ------------------------------------------
ALTER TABLE public.mission_learnings
 ADD COLUMN checklist_node_id uuid REFERENCES public.checklist_nodes(id) ON DELETE SET NULL,
 ALTER COLUMN kind DROP NOT NULL;
CREATE INDEX mission_learnings_node_idx ON public.mission_learnings(checklist_node_id) WHERE checklist_node_id IS NOT NULL;
INSERT INTO taskpulse_private.m15_org_refs(table_schema,table_name,column_name,ref_schema,ref_table) VALUES
 ('public','mission_learnings','checklist_node_id','public','checklist_nodes')
ON CONFLICT DO NOTHING;

-- 2. Note types ----------------------------------------------------------------
ALTER TABLE public.labels ADD COLUMN note_type boolean NOT NULL DEFAULT false;

SELECT pg_temp.m126_patch('taskpulse_private.label_json(public.labels)',
 $f$'archived',l.archived_at IS NOT NULL$f$,
 $f$'archived',l.archived_at IS NOT NULL,'noteType',l.note_type$f$);

SELECT pg_temp.m126_patch('public.label_command(text,uuid,text,text,text,uuid)',
 $f$p_op NOT IN ('create','rename','archive','restore')$f$,
 $f$p_op NOT IN ('create','rename','archive','restore','note_type_on','note_type_off')$f$);
SELECT pg_temp.m126_patch('public.label_command(text,uuid,text,text,text,uuid)',
 $f$UPDATE public.labels SET archived_at=CASE p_op WHEN 'archive' THEN coalesce(archived_at,clock_timestamp()) END$f$,
 $f$UPDATE public.labels SET archived_at=CASE p_op WHEN 'archive' THEN coalesce(archived_at,clock_timestamp())
   WHEN 'restore' THEN NULL ELSE archived_at END,
  note_type=CASE p_op WHEN 'note_type_on' THEN true WHEN 'note_type_off' THEN false ELSE note_type END$f$);
SELECT pg_temp.m126_patch('public.label_command(text,uuid,text,text,text,uuid)',
 $f$ELSE ARRAY['archived_at'] END$f$,
 $f$WHEN 'note_type_on' THEN ARRAY['note_type'] WHEN 'note_type_off' THEN ARRAY['note_type'] ELSE ARRAY['archived_at'] END$f$);

-- 3. Starter hashtags ----------------------------------------------------------
CREATE FUNCTION taskpulse_private.note_starter_hashtags(p_org uuid, p_actor uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE made integer:=0; BEGIN
 IF p_org IS NULL OR p_actor IS NULL THEN RETURN 0; END IF;
 INSERT INTO public.labels(organization_id,name,slug,colour_token,description,created_by)
 SELECT p_org,s.name,s.name,s.colour,s.description,p_actor
 FROM (VALUES
  ('mistake','danger','Note type'),('learning','success','Note type'),('idea','primary','Note type'),
  ('decision','recognition','Note type'),('risk','attention','Note type'),('blocker','danger','Note type'),
  ('followup','primary','Note type'),
  ('client','neutral','Topic'),('vendor','neutral','Topic'),('approval','neutral','Topic'),('government','neutral','Topic'),
  ('site','neutral','Topic'),('design','neutral','Topic'),('drawing','neutral','Topic'),('estimate','neutral','Topic'),
  ('payment','neutral','Topic'),('documentation','neutral','Topic'),
  ('communication','attention','Cause'),('delay','attention','Cause'),('rework','attention','Cause'),
  ('missinginfo','attention','Cause'),('quality','attention','Cause'),('budget','attention','Cause'),
  ('critical','danger','Impact'),('minor','neutral','Impact'),('repeat','attention','Impact')
 ) s(name,colour,description)
 WHERE NOT EXISTS(SELECT 1 FROM public.labels l WHERE l.organization_id=p_org AND l.slug=s.name);
 GET DIAGNOSTICS made=ROW_COUNT;
 UPDATE public.labels SET note_type=true
 WHERE organization_id=p_org AND NOT note_type
  AND slug IN ('mistake','learning','idea','decision','risk','blocker','followup');
 RETURN made;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.note_starter_hashtags(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

DO $$ DECLARE o record; made integer:=0; BEGIN
 FOR o IN SELECT g.id,(SELECT u.id FROM public.users u WHERE u.organization_id=g.id
   ORDER BY (u.role='managing_director') DESC, u.is_active DESC, u.created_at, u.id LIMIT 1) AS actor
  FROM public.organizations g LOOP
  made:=made+taskpulse_private.note_starter_hashtags(o.id,o.actor);
 END LOOP;
 RAISE NOTICE 'Notes: % starter hashtags created', made;
END $$;

-- 4. Existing notes become Notes ------------------------------------------------
DO $$ DECLARE notes integer; active integer; added integer; BEGIN
 SELECT count(*),count(*) FILTER (WHERE record_state='active') INTO notes,active FROM public.mission_learnings;
 INSERT INTO public.label_links(label_id,subject_kind,subject_id,organization_id,created_by,created_at)
 SELECT l.id,'mission_learning',m.id,m.organization_id,m.author_id,m.created_at
 FROM public.mission_learnings m JOIN public.labels l ON l.organization_id=m.organization_id AND l.slug=m.kind
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS added=ROW_COUNT;
 RAISE NOTICE 'Notes: % Mistakes and learning notes moved into Notes (% active, % withdrawn); % #mistake/#learning hashtags added',
  notes, active, notes-active, added;
END $$;

-- 5. Every active note carries a type hashtag -----------------------------------
CREATE FUNCTION taskpulse_private.note_type_check() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE note uuid; BEGIN
 IF TG_TABLE_NAME='mission_learnings' THEN note:=NEW.id;
 ELSIF OLD.subject_kind='mission_learning' THEN note:=OLD.subject_id;
 ELSE RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.mission_learnings m WHERE m.id=note AND m.record_state='active')
  AND NOT EXISTS(SELECT 1 FROM public.label_links k JOIN public.labels l ON l.id=k.label_id
   WHERE k.subject_kind='mission_learning' AND k.subject_id=note AND l.note_type) THEN
  RAISE EXCEPTION 'A note needs at least one type hashtag, such as #mistake or #learning' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.note_type_check() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER mission_learnings_note_type AFTER INSERT OR UPDATE OF body,record_state ON public.mission_learnings
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION taskpulse_private.note_type_check();
CREATE CONSTRAINT TRIGGER label_links_note_type AFTER DELETE ON public.label_links
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION taskpulse_private.note_type_check();

-- 6. The command ---------------------------------------------------------------
-- The note's hashtags as one line, type hashtags first: "#mistake #client".
CREATE FUNCTION taskpulse_private.note_hashtag_line(p_note uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT string_agg('#'||l.name,' ' ORDER BY NOT l.note_type, lower(l.name))
 FROM public.label_links k JOIN public.labels l ON l.id=k.label_id
 WHERE k.subject_kind='mission_learning' AND k.subject_id=p_note;
$$;
REVOKE ALL ON FUNCTION taskpulse_private.note_hashtag_line(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.mission_note_command(p_op text,p_task uuid,p_note uuid,p_node uuid,p_body text,
 p_labels uuid[],p_new_labels text[],p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); caller_role public.user_role:=public.get_user_role();
 manager boolean; receipt taskpulse_private.command_receipts; cmd text:='mission_note_'||coalesce(p_op,'');
 v_body text:=btrim(coalesce(p_body,'')); saved public.mission_learnings; result jsonb; t public.tasks;
 ids uuid[]:='{}'; nm text; v_slug text; v_name text; found_id uuid; v_kind text; v_types text; line text; node_title text;
 request jsonb:=jsonb_build_array(p_op,p_task,p_note,p_node,p_body,p_labels,p_new_labels); BEGIN
 IF actor IS NULL OR org IS NULL OR caller_role IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 manager:=caller_role IN ('managing_director','project_engineer');
 IF p_op IS NULL OR p_op NOT IN ('add','edit','delete') OR p_operation IS NULL OR p_task IS NULL
  OR (p_op<>'add' AND p_note IS NULL) THEN
  RAISE EXCEPTION 'Add, edit or delete a note, with a mission and an operation id' USING ERRCODE='23514'; END IF;
 SELECT * INTO t FROM public.tasks x WHERE x.id=p_task AND x.organization_id=org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mission not found' USING ERRCODE='P0002'; END IF;
 IF NOT taskpulse_private.can_read_mission_work(p_task) THEN
  RAISE EXCEPTION 'This mission''s notes are private to its people' USING ERRCODE='42501'; END IF;
 IF p_op='add' AND NOT taskpulse_private.mission_learning_writer(p_task) THEN
  RAISE EXCEPTION 'Only the mission''s Crew, Managers on it and the managing director add notes' USING ERRCODE='42501'; END IF;
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
  -- A company without any type hashtag gets the starter set (once; never a duplicate slug).
  IF NOT EXISTS(SELECT 1 FROM public.labels l WHERE l.organization_id=org AND l.note_type) THEN
   PERFORM taskpulse_private.note_starter_hashtags(org,actor); END IF;
  ids:=ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_labels,'{}'::uuid[])) x WHERE x IS NOT NULL);
  -- Hashtags typed by name: an existing one by slug; a new one only for managers.
  FOREACH nm IN ARRAY coalesce(p_new_labels,'{}'::text[]) LOOP
   v_name:=regexp_replace(ltrim(btrim(coalesce(nm,'')),'#'),'\s+',' ','g');
   v_slug:=taskpulse_private.label_slug(v_name);
   IF v_slug IS NULL OR length(v_name)>40 THEN
    RAISE EXCEPTION 'A hashtag needs a name of up to 40 characters with a letter or number' USING ERRCODE='23514'; END IF;
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
   RAISE EXCEPTION 'Hashtag not found' USING ERRCODE='P0002'; END IF;
  IF EXISTS(SELECT 1 FROM public.labels l WHERE l.id=ANY(ids) AND l.archived_at IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.label_links k WHERE k.label_id=l.id AND k.subject_kind='mission_learning'
    AND k.subject_id IS NOT DISTINCT FROM p_note)) THEN
   RAISE EXCEPTION 'An archived hashtag cannot be added' USING ERRCODE='23514'; END IF;
  IF coalesce(array_length(ids,1),0)>20 THEN
   RAISE EXCEPTION 'A note carries up to 20 hashtags' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.labels l WHERE l.id=ANY(ids) AND l.note_type) THEN
   SELECT string_agg('#'||l.name,', ' ORDER BY lower(l.name)) INTO v_types FROM public.labels l
   WHERE l.organization_id=org AND l.note_type AND l.archived_at IS NULL;
   RAISE EXCEPTION 'Add at least one type hashtag: %',coalesce(v_types,'#mistake, #learning') USING ERRCODE='23514'; END IF;
  v_kind:=CASE WHEN EXISTS(SELECT 1 FROM public.labels l WHERE l.id=ANY(ids) AND l.slug='mistake') THEN 'mistake'
   WHEN EXISTS(SELECT 1 FROM public.labels l WHERE l.id=ANY(ids) AND l.slug='learning') THEN 'learning' END;
 END IF;

 IF p_op='add' THEN
  IF p_node IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id
   WHERE n.id=p_node AND c.task_id=p_task) THEN
   RAISE EXCEPTION 'That Quest or objective is not on this mission' USING ERRCODE='23514'; END IF;
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
  RAISE EXCEPTION 'Only the person who wrote a note can edit it; they or a manager can delete it' USING ERRCODE='P0002'; END IF;

 IF p_op IN ('add','edit') THEN
  DELETE FROM public.label_links WHERE subject_kind='mission_learning' AND subject_id=saved.id AND label_id<>ALL(ids);
  INSERT INTO public.label_links(label_id,subject_kind,subject_id,organization_id,created_by)
  SELECT x,'mission_learning',saved.id,org,actor FROM unnest(ids) x ON CONFLICT DO NOTHING;
 END IF;
 line:=taskpulse_private.note_hashtag_line(saved.id);
 SELECT n.title INTO node_title FROM public.checklist_nodes n WHERE n.id=saved.checklist_node_id;

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

-- 7. The read --------------------------------------------------------------------
CREATE FUNCTION public.mission_notes(p_task uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE me uuid:=auth.uid(); manager boolean:=public.get_user_role() IN ('managing_director','project_engineer');
 writer boolean; is_open boolean; BEGIN
 IF me IS NULL OR public.get_user_role() IS NULL OR public.current_organization() IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 SELECT t.archived_effective_date IS NULL INTO is_open FROM public.tasks t
 WHERE t.id=p_task AND t.organization_id=public.current_organization();
 IF NOT FOUND THEN RAISE EXCEPTION 'Mission not found' USING ERRCODE='P0002'; END IF;
 IF NOT taskpulse_private.can_read_mission_work(p_task) THEN
  RAISE EXCEPTION 'This mission''s notes are private to its people' USING ERRCODE='42501'; END IF;
 writer:=taskpulse_private.mission_learning_writer(p_task) AND is_open;
 RETURN jsonb_build_object('canAdd',writer,'items',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',l.id,'body',l.body,'authorId',l.author_id,'authorName',u.full_name,
   'createdAt',l.created_at,'updatedAt',l.updated_at,'edited',l.updated_at>l.created_at,
   'canEdit',is_open AND l.author_id=me,'canDelete',is_open AND (manager OR l.author_id=me),
   'nodeId',n.id,'nodeTitle',n.title,
   'nodeKind',CASE WHEN n.id IS NULL THEN NULL
    WHEN EXISTS(SELECT 1 FROM public.task_checklists c WHERE c.owner_node_id=n.id) THEN 'quest' ELSE 'objective' END,
   'labels',(SELECT coalesce(jsonb_agg(taskpulse_private.label_json(b) ORDER BY NOT b.note_type, lower(b.name)),'[]'::jsonb)
     FROM public.label_links k JOIN public.labels b ON b.id=k.label_id
     WHERE k.subject_kind='mission_learning' AND k.subject_id=l.id))
   ORDER BY l.created_at DESC, l.id),'[]'::jsonb)
  FROM public.mission_learnings l LEFT JOIN public.users u ON u.id=l.author_id
  LEFT JOIN public.checklist_nodes n ON n.id=l.checklist_node_id
  WHERE l.task_id=p_task AND l.record_state='active'));
END $$;

-- 8. Hashtags on each mission's notes (Missions page filter) ---------------------
CREATE FUNCTION public.mission_note_hashtags(p_tasks uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM taskpulse_private.label_require_member();
 IF coalesce(array_length(p_tasks,1),0)>5000 THEN RAISE EXCEPTION 'At most 5000 missions per call' USING ERRCODE='22023'; END IF;
 RETURN coalesce((SELECT jsonb_object_agg(x.task_id,x.slugs) FROM (
   SELECT m.task_id,jsonb_agg(DISTINCT l.slug) AS slugs
   FROM public.mission_learnings m
   JOIN public.label_links k ON k.subject_kind='mission_learning' AND k.subject_id=m.id
   JOIN public.labels l ON l.id=k.label_id AND l.archived_at IS NULL
   WHERE m.organization_id=public.current_organization() AND m.record_state='active'
    AND m.task_id=ANY(coalesce(p_tasks,'{}')) AND taskpulse_private.can_read_mission_work(m.task_id)
   GROUP BY m.task_id) x),'{}'::jsonb);
END $$;

-- 9. Label pages and mission history name where a note came from ----------------
SELECT pg_temp.m126_patch('public.labelled(text)',
 $f$'learningKind',m.kind,'taskTag',t.task_tag,$f$,
 $f$'learningKind',m.kind,'taskTag',t.task_tag,'taskId',t.id,'nodeId',m.checklist_node_id,
      'nodeTitle',(SELECT n.title FROM public.checklist_nodes n WHERE n.id=m.checklist_node_id),$f$);

SELECT pg_temp.m126_patch('public.mission_activity(uuid,jsonb,integer)',
 $f$coalesce(n.title::text, l.pc ->> 'file_name',$f$,
 $f$coalesce(n.title::text, l.pc ->> 'file_name', l.pc ->> 'node_title',$f$);

-- 10. The old command keeps working during the deploy ----------------------------
CREATE OR REPLACE FUNCTION public.mission_learning_command(p_op text,p_task uuid,p_learning uuid,p_kind text,p_body text,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[]; BEGIN
 IF p_op IN ('add','edit') AND (p_kind IS NULL OR p_kind NOT IN ('mistake','learning')) THEN
  RAISE EXCEPTION 'Choose mistake or learning' USING ERRCODE='23514'; END IF;
 IF p_op='edit' THEN
  ids:=ARRAY(SELECT k.label_id FROM public.label_links k WHERE k.subject_kind='mission_learning' AND k.subject_id=p_learning);
 END IF;
 RETURN public.mission_note_command(CASE p_op WHEN 'withdraw' THEN 'delete' WHEN 'add' THEN 'add' WHEN 'edit' THEN 'edit' END,
  p_task,p_learning,NULL,p_body,ids,CASE WHEN p_op IN ('add','edit') THEN ARRAY[p_kind] END,p_operation);
END $$;

REVOKE ALL ON FUNCTION public.mission_note_command(text,uuid,uuid,uuid,text,uuid[],text[],uuid),
 public.mission_notes(uuid),public.mission_note_hashtags(uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mission_note_command(text,uuid,uuid,uuid,text,uuid[],text[],uuid),
 public.mission_notes(uuid),public.mission_note_hashtags(uuid[]) TO authenticated;

COMMIT;
SELECT taskpulse_private.m15_secure();
