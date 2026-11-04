-- ===========================================================================
-- Stellar - workspace labels (update plan 3 November 2026, workstream G).
-- "Label" is the word everywhere; "tag" stays the mission identifier
-- (tasks.task_tag). `#` is only how a label is typed.
--
-- 1. public.labels: one per company name (slug unique per company), with a
--    theme colour token (never a literal colour), archived instead of deleted.
-- 2. public.label_links: a label on one subject. First subject kinds (D-G1):
--    'task' (mission), 'mission_learning' (migration 111), 'meeting_point'.
-- 3. label_command(create, rename, archive, restore): managing director and
--    project engineers. Rename keeps the id, so every link survives.
-- 4. label_link_command(attach, detach): anyone who may edit the subject:
--    task: managing director, project engineer or an assignee (not archived);
--    mission_learning: its author while still a writer, or a manager;
--    meeting_point: managing director, project engineer, data manager or its
--    author. Attach by id, or by name (a manager may create it on the way).
-- 5. Reads: label_catalogue() (every active member), labels_for(kind, ids)
--    and labelled(slug), which returns only subjects the caller may read.
-- Labels feed no score and no graph (D14). No direct table grants.
-- ===========================================================================
BEGIN;

CREATE TABLE public.labels (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK (name=btrim(name) AND length(name) BETWEEN 1 AND 40),
 slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug)<=40),
 colour_token text NOT NULL DEFAULT 'neutral'
  CHECK (colour_token IN ('neutral','primary','success','attention','danger','recognition')),
 description text CHECK (description IS NULL OR length(description)<=300),
 created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 archived_at timestamptz,
 UNIQUE (organization_id,slug)
);

CREATE TABLE public.label_links (
 label_id uuid NOT NULL REFERENCES public.labels(id) ON DELETE RESTRICT,
 subject_kind text NOT NULL CHECK (subject_kind IN ('task','mission_learning','meeting_point')),
 subject_id uuid NOT NULL,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (label_id,subject_kind,subject_id)
);
CREATE INDEX label_links_subject_idx ON public.label_links(subject_kind,subject_id);
CREATE INDEX label_links_company_idx ON public.label_links(organization_id);

REVOKE ALL ON public.labels,public.label_links FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO taskpulse_private.m15_tenant_tables(table_schema,table_name) VALUES ('public','labels'),('public','label_links')
ON CONFLICT DO NOTHING;
INSERT INTO taskpulse_private.m15_org_refs(table_schema,table_name,column_name,ref_schema,ref_table) VALUES
 ('public','labels','created_by','public','users'),
 ('public','label_links','label_id','public','labels'),
 ('public','label_links','created_by','public','users')
ON CONFLICT DO NOTHING;

-- Lower-case words joined by hyphens; NULL when nothing is left.
CREATE FUNCTION taskpulse_private.label_slug(p_name text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT nullif(left(btrim(regexp_replace(lower(coalesce(p_name,'')),'[^a-z0-9]+','-','g'),'-'),40),'');
$$;

CREATE FUNCTION taskpulse_private.label_json(l public.labels) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',l.id,'name',l.name,'slug',l.slug,'colour',l.colour_token,'description',l.description,
  'archived',l.archived_at IS NOT NULL);
$$;

-- May the caller read this subject: it belongs to their company and is not withdrawn.
CREATE FUNCTION taskpulse_private.label_subject_readable(p_kind text,p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND public.get_user_role() IS NOT NULL AND CASE p_kind
  WHEN 'task' THEN EXISTS(SELECT 1 FROM public.tasks t WHERE t.id=p_id AND t.organization_id=public.current_organization())
  WHEN 'mission_learning' THEN EXISTS(SELECT 1 FROM public.mission_learnings l WHERE l.id=p_id
   AND l.organization_id=public.current_organization() AND l.record_state='active')
  WHEN 'meeting_point' THEN EXISTS(SELECT 1 FROM public.meeting_points m WHERE m.id=p_id
   AND m.organization_id=public.current_organization() AND m.validation_state<>'withdrawn')
  ELSE false END;
$$;

-- May the caller change this subject's labels.
CREATE FUNCTION taskpulse_private.label_subject_editable(p_kind text,p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT taskpulse_private.label_subject_readable(p_kind,p_id) AND CASE p_kind
  WHEN 'task' THEN EXISTS(SELECT 1 FROM public.tasks t WHERE t.id=p_id AND t.archived_effective_date IS NULL)
   AND (public.get_user_role() IN ('managing_director','project_engineer') OR public.is_task_assignee(p_id))
  WHEN 'mission_learning' THEN EXISTS(SELECT 1 FROM public.mission_learnings l JOIN public.tasks t ON t.id=l.task_id
   WHERE l.id=p_id AND t.archived_effective_date IS NULL
    AND (public.get_user_role() IN ('managing_director','project_engineer')
     OR (l.author_id=auth.uid() AND taskpulse_private.mission_learning_writer(l.task_id))))
  WHEN 'meeting_point' THEN public.get_user_role() IN ('managing_director','project_engineer','data_manager')
   OR EXISTS(SELECT 1 FROM public.meeting_points m WHERE m.id=p_id AND m.posted_by=auth.uid())
  ELSE false END;
$$;

CREATE FUNCTION taskpulse_private.label_require_member() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF auth.uid() IS NULL OR public.get_user_role() IS NULL OR public.current_organization() IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------
-- Every label of the company with its count of readable links (archived ones last, flagged).
CREATE FUNCTION public.label_catalogue() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM taskpulse_private.label_require_member();
 RETURN jsonb_build_object(
  'canManage',public.get_user_role() IN ('managing_director','project_engineer'),
  'labels',(SELECT coalesce(jsonb_agg(taskpulse_private.label_json(l)||jsonb_build_object('uses',
    (SELECT count(*) FROM public.label_links k WHERE k.label_id=l.id AND taskpulse_private.label_subject_readable(k.subject_kind,k.subject_id)))
   ORDER BY l.archived_at IS NOT NULL, lower(l.name)),'[]'::jsonb)
   FROM public.labels l WHERE l.organization_id=public.current_organization()));
END $$;

-- {subject id: [label, ...]} for readable subjects of one kind; archived labels are left out.
CREATE FUNCTION public.labels_for(p_kind text,p_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM taskpulse_private.label_require_member();
 IF p_kind IS NULL OR p_kind NOT IN ('task','mission_learning','meeting_point') THEN
  RAISE EXCEPTION 'Unknown labelled record kind' USING ERRCODE='22023'; END IF;
 IF coalesce(array_length(p_ids,1),0)>1000 THEN RAISE EXCEPTION 'At most 1000 records per call' USING ERRCODE='22023'; END IF;
 RETURN coalesce((SELECT jsonb_object_agg(s.subject_id,s.labels) FROM (
   SELECT k.subject_id,jsonb_agg(taskpulse_private.label_json(l) ORDER BY lower(l.name)) AS labels
   FROM public.label_links k JOIN public.labels l ON l.id=k.label_id
   WHERE k.subject_kind=p_kind AND k.subject_id=ANY(coalesce(p_ids,'{}')) AND l.archived_at IS NULL
    AND l.organization_id=public.current_organization()
    AND taskpulse_private.label_subject_readable(k.subject_kind,k.subject_id)
   GROUP BY k.subject_id) s),'{}'::jsonb);
END $$;

-- One label and the readable records carrying it, newest first, with what a list needs to show them.
CREATE FUNCTION public.labelled(p_slug text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE l public.labels; BEGIN
 PERFORM taskpulse_private.label_require_member();
 SELECT * INTO l FROM public.labels x WHERE x.organization_id=public.current_organization() AND x.slug=lower(btrim(coalesce(p_slug,'')));
 IF NOT FOUND THEN RAISE EXCEPTION 'Label not found' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('label',taskpulse_private.label_json(l),'items',(SELECT coalesce(jsonb_agg(i.item ORDER BY i.at DESC),'[]'::jsonb) FROM (
   SELECT k.created_at AS at,CASE k.subject_kind
    WHEN 'task' THEN (SELECT jsonb_build_object('kind','task','id',t.id,'title',t.title,'taskTag',t.task_tag,'status',t.status,
      'date',t.assigned_date) FROM public.tasks t WHERE t.id=k.subject_id)
    WHEN 'mission_learning' THEN (SELECT jsonb_build_object('kind','mission_learning','id',m.id,'title',left(m.body,200),
      'learningKind',m.kind,'taskTag',t.task_tag,'date',(m.created_at AT TIME ZONE 'Asia/Kolkata')::date)
      FROM public.mission_learnings m JOIN public.tasks t ON t.id=m.task_id WHERE m.id=k.subject_id)
    WHEN 'meeting_point' THEN (SELECT jsonb_build_object('kind','meeting_point','id',p.id,'title',left(p.point,200),
      'date',p.meeting_date) FROM public.meeting_points p WHERE p.id=k.subject_id)
   END AS item
   FROM public.label_links k
   WHERE k.label_id=l.id AND taskpulse_private.label_subject_readable(k.subject_kind,k.subject_id)
   LIMIT 500) i WHERE i.item IS NOT NULL));
END $$;

-- ---------------------------------------------------------------------------
-- Commands
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.label_command(p_op text,p_label uuid,p_name text,p_colour text,p_description text,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); caller_role public.user_role:=public.get_user_role();
 receipt taskpulse_private.command_receipts; cmd text:='label_'||coalesce(p_op,''); v_name text:=btrim(coalesce(p_name,''));
 v_slug text; saved public.labels; result jsonb; request jsonb:=jsonb_build_array(p_op,p_label,p_name,p_colour,p_description); BEGIN
 PERFORM taskpulse_private.label_require_member();
 IF caller_role NOT IN ('managing_director','project_engineer') THEN
  RAISE EXCEPTION 'Only the managing director and project engineers manage labels' USING ERRCODE='42501'; END IF;
 IF p_op IS NULL OR p_op NOT IN ('create','rename','archive','restore') OR p_operation IS NULL THEN
  RAISE EXCEPTION 'Create, rename, archive or restore, with an operation id' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('labels:'||org::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=cmd AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;
 IF p_op IN ('create','rename') THEN
  v_name:=regexp_replace(ltrim(v_name,'#'),'\s+',' ','g');
  v_slug:=taskpulse_private.label_slug(v_name);
  IF v_slug IS NULL OR length(v_name)>40 THEN
   RAISE EXCEPTION 'A label needs a name of up to 40 characters with a letter or number' USING ERRCODE='23514'; END IF;
  IF p_colour IS NOT NULL AND p_colour NOT IN ('neutral','primary','success','attention','danger','recognition') THEN
   RAISE EXCEPTION 'Unknown label colour' USING ERRCODE='23514'; END IF;
  IF p_description IS NOT NULL AND length(p_description)>300 THEN
   RAISE EXCEPTION 'Keep the description under 300 characters' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.labels x WHERE x.organization_id=org AND x.slug=v_slug AND x.id IS DISTINCT FROM p_label) THEN
   RAISE EXCEPTION 'A label with that name already exists' USING ERRCODE='23505'; END IF;
 END IF;
 IF p_op='create' THEN
  IF (SELECT count(*) FROM public.labels WHERE organization_id=org)>=500 THEN
   RAISE EXCEPTION 'A company keeps up to 500 labels' USING ERRCODE='23514'; END IF;
  INSERT INTO public.labels(organization_id,name,slug,colour_token,description,created_by)
  VALUES(org,v_name,v_slug,coalesce(p_colour,'neutral'),nullif(btrim(coalesce(p_description,'')),''),actor) RETURNING * INTO saved;
 ELSIF p_op='rename' THEN
  UPDATE public.labels SET name=v_name,slug=v_slug,colour_token=coalesce(p_colour,colour_token),
   description=CASE WHEN p_description IS NULL THEN description ELSE nullif(btrim(p_description),'') END
  WHERE id=p_label AND organization_id=org RETURNING * INTO saved;
 ELSE
  UPDATE public.labels SET archived_at=CASE p_op WHEN 'archive' THEN coalesce(archived_at,clock_timestamp()) END
  WHERE id=p_label AND organization_id=org RETURNING * INTO saved;
 END IF;
 IF saved.id IS NULL THEN RAISE EXCEPTION 'Label not found' USING ERRCODE='P0002'; END IF;
 INSERT INTO taskpulse_private.audit_events(organization_id,actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(org,actor,caller_role::text,cmd,'labels',saved.id,
  CASE p_op WHEN 'create' THEN ARRAY['name','slug','colour_token'] WHEN 'rename' THEN ARRAY['name','slug','colour_token','description'] ELSE ARRAY['archived_at'] END,
  jsonb_build_object('name',jsonb_build_object('after',saved.name)),p_operation);
 result:=taskpulse_private.label_json(saved);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,cmd,p_operation,request,saved.id,result);
 RETURN result;
END $$;

CREATE FUNCTION public.label_link_command(p_op text,p_kind text,p_subject uuid,p_label uuid,p_name text,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); caller_role public.user_role:=public.get_user_role();
 receipt taskpulse_private.command_receipts; cmd text:='label_link_'||coalesce(p_op,''); l public.labels; v_slug text;
 result jsonb; request jsonb:=jsonb_build_array(p_op,p_kind,p_subject,p_label,p_name); BEGIN
 PERFORM taskpulse_private.label_require_member();
 IF p_op IS NULL OR p_op NOT IN ('attach','detach') OR p_operation IS NULL OR p_subject IS NULL
  OR p_kind IS NULL OR p_kind NOT IN ('task','mission_learning','meeting_point') THEN
  RAISE EXCEPTION 'Attach or detach a label on a mission, a learning note or a meeting point' USING ERRCODE='23514'; END IF;
 IF NOT taskpulse_private.label_subject_readable(p_kind,p_subject) THEN
  RAISE EXCEPTION 'Record not found' USING ERRCODE='P0002'; END IF;
 IF NOT taskpulse_private.label_subject_editable(p_kind,p_subject) THEN
  RAISE EXCEPTION 'Only people who may edit this record can change its labels' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('labels:'||org::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=cmd AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;
 IF p_label IS NOT NULL THEN
  SELECT * INTO l FROM public.labels x WHERE x.id=p_label AND x.organization_id=org;
 ELSE
  v_slug:=taskpulse_private.label_slug(ltrim(btrim(coalesce(p_name,'')),'#'));
  SELECT * INTO l FROM public.labels x WHERE x.organization_id=org AND x.slug=v_slug;
  IF NOT FOUND AND p_op='attach' AND v_slug IS NOT NULL THEN
   IF caller_role NOT IN ('managing_director','project_engineer') THEN
    RAISE EXCEPTION 'That label does not exist yet; ask a project engineer or the managing director to create it' USING ERRCODE='42501'; END IF;
   result:=public.label_command('create',NULL,ltrim(btrim(p_name),'#'),NULL,NULL,p_operation);
   SELECT * INTO l FROM public.labels x WHERE x.id=(result->>'id')::uuid;
  END IF;
 END IF;
 IF l.id IS NULL THEN RAISE EXCEPTION 'Label not found' USING ERRCODE='P0002'; END IF;
 IF p_op='attach' THEN
  IF l.archived_at IS NOT NULL THEN RAISE EXCEPTION 'This label is archived' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM public.label_links WHERE subject_kind=p_kind AND subject_id=p_subject)>=20 THEN
   RAISE EXCEPTION 'A record carries up to 20 labels' USING ERRCODE='23514'; END IF;
  INSERT INTO public.label_links(label_id,subject_kind,subject_id,organization_id,created_by)
  VALUES(l.id,p_kind,p_subject,org,actor) ON CONFLICT DO NOTHING;
 ELSE
  DELETE FROM public.label_links WHERE label_id=l.id AND subject_kind=p_kind AND subject_id=p_subject;
 END IF;
 result:=taskpulse_private.label_json(l);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,cmd,p_operation,request,l.id,result);
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION taskpulse_private.label_slug(text),taskpulse_private.label_json(public.labels),
 taskpulse_private.label_subject_readable(text,uuid),taskpulse_private.label_subject_editable(text,uuid),
 taskpulse_private.label_require_member() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.label_catalogue(),public.labels_for(text,uuid[]),public.labelled(text),
 public.label_command(text,uuid,text,text,text,uuid),public.label_link_command(text,text,uuid,uuid,text,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.label_catalogue(),public.labels_for(text,uuid[]),public.labelled(text),
 public.label_command(text,uuid,text,text,text,uuid),public.label_link_command(text,text,uuid,uuid,text,uuid)
 TO authenticated;

COMMIT;
SELECT taskpulse_private.m15_secure();
