-- ===========================================================================
-- Stellar - Mistakes and learning on the mission page (update plan 3 November
-- 2026, workstream E; user's choice: tied to the mission, on its page).
--
-- 1. public.mission_learnings: one note per row, kind 'mistake' or 'learning',
--    on one mission. No direct grants; reads and writes go through the two
--    functions below. Not a dated record, never in any score.
-- 2. mission_learnings(task): every active member of the mission's company
--    reads the mission's active notes, plus whether they may add one.
-- 3. mission_learning_command(op, task, learning, kind, body, operation):
--    add (managing director, project engineers, the mission's assignees by
--    public.is_task_assignee); edit and withdraw (the note's author while
--    still one of those, or a managing director / project engineer).
--    Archived missions are read-only. Idempotent through command_receipts;
--    each change is audited as mission_learning_<op> (task and kind only,
--    never the text).
-- 4. activity_feed: the body of migration 59 with mission_learnings added to
--    its rules as a missions line (no other change).
-- ===========================================================================
BEGIN;

CREATE TABLE public.mission_learnings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK (kind IN ('mistake','learning')),
 body text NOT NULL CHECK (body=btrim(body) AND length(body) BETWEEN 1 AND 2000),
 author_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 record_state text NOT NULL DEFAULT 'active' CHECK (record_state IN ('active','withdrawn'))
);
CREATE INDEX mission_learnings_task_idx ON public.mission_learnings(task_id,created_at) WHERE record_state='active';
CREATE INDEX mission_learnings_company_idx ON public.mission_learnings(organization_id);

REVOKE ALL ON public.mission_learnings FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO taskpulse_private.m15_tenant_tables(table_schema,table_name) VALUES ('public','mission_learnings')
ON CONFLICT DO NOTHING;
INSERT INTO taskpulse_private.m15_org_refs(table_schema,table_name,column_name,ref_schema,ref_table) VALUES
 ('public','mission_learnings','task_id','public','tasks'),
 ('public','mission_learnings','author_id','public','users')
ON CONFLICT DO NOTHING;

-- May the caller add notes to this mission: an active member of its company who is the managing director,
-- a project engineer or one of its assignees.
CREATE FUNCTION taskpulse_private.mission_learning_writer(p_task uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND public.get_user_role() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.tasks t WHERE t.id=p_task AND t.organization_id=public.current_organization())
  AND (public.get_user_role() IN ('managing_director','project_engineer') OR public.is_task_assignee(p_task));
$$;

CREATE FUNCTION public.mission_learnings(p_task uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE me uuid:=auth.uid(); manager boolean:=public.get_user_role() IN ('managing_director','project_engineer');
 writer boolean; is_open boolean; BEGIN
 IF me IS NULL OR public.get_user_role() IS NULL OR public.current_organization() IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 SELECT t.archived_effective_date IS NULL INTO is_open FROM public.tasks t
 WHERE t.id=p_task AND t.organization_id=public.current_organization();
 IF NOT FOUND THEN RAISE EXCEPTION 'Mission not found' USING ERRCODE='P0002'; END IF;
 writer:=taskpulse_private.mission_learning_writer(p_task) AND is_open;
 RETURN jsonb_build_object('canAdd',writer,'items',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',l.id,'kind',l.kind,'body',l.body,'authorId',l.author_id,'authorName',u.full_name,
   'createdAt',l.created_at,'updatedAt',l.updated_at,'edited',l.updated_at>l.created_at,
   'canEdit',is_open AND (manager OR (writer AND l.author_id=me))) ORDER BY l.created_at DESC, l.id),'[]'::jsonb)
  FROM public.mission_learnings l LEFT JOIN public.users u ON u.id=l.author_id
  WHERE l.task_id=p_task AND l.record_state='active'));
END $$;

CREATE FUNCTION public.mission_learning_command(p_op text,p_task uuid,p_learning uuid,p_kind text,p_body text,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); caller_role public.user_role:=public.get_user_role();
 manager boolean; receipt taskpulse_private.command_receipts; cmd text:='mission_learning_'||coalesce(p_op,'');
 v_body text:=btrim(coalesce(p_body,'')); saved public.mission_learnings; result jsonb; t public.tasks;
 request jsonb:=jsonb_build_array(p_op,p_task,p_learning,p_kind,p_body); BEGIN
 IF actor IS NULL OR org IS NULL OR caller_role IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 manager:=caller_role IN ('managing_director','project_engineer');
 IF p_op IS NULL OR p_op NOT IN ('add','edit','withdraw') OR p_operation IS NULL OR p_task IS NULL THEN
  RAISE EXCEPTION 'Add, edit or withdraw, with a mission and an operation id' USING ERRCODE='23514'; END IF;
 SELECT * INTO t FROM public.tasks x WHERE x.id=p_task AND x.organization_id=org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mission not found' USING ERRCODE='P0002'; END IF;
 IF NOT taskpulse_private.mission_learning_writer(p_task) THEN
  RAISE EXCEPTION 'Only the mission''s assignees, project engineers and the managing director can write its mistakes and learning'
   USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mission_learnings:'||p_task::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=cmd AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;
 IF t.archived_effective_date IS NOT NULL THEN
  RAISE EXCEPTION 'This mission is archived and read-only' USING ERRCODE='23514'; END IF;
 IF p_op IN ('add','edit') THEN
  IF p_kind IS NULL OR p_kind NOT IN ('mistake','learning') THEN
   RAISE EXCEPTION 'Choose mistake or learning' USING ERRCODE='23514'; END IF;
  IF v_body='' OR length(v_body)>2000 THEN
   RAISE EXCEPTION 'Write between 1 and 2000 characters' USING ERRCODE='23514'; END IF;
 END IF;

 IF p_op='add' THEN
  IF (SELECT count(*) FROM public.mission_learnings WHERE task_id=p_task AND record_state='active')>=500 THEN
   RAISE EXCEPTION 'A mission keeps up to 500 notes; withdraw one first' USING ERRCODE='23514'; END IF;
  INSERT INTO public.mission_learnings(organization_id,task_id,kind,body,author_id)
  VALUES(org,p_task,p_kind,v_body,actor) RETURNING * INTO saved;
 ELSIF p_op='edit' THEN
  UPDATE public.mission_learnings SET kind=p_kind,body=v_body,updated_at=clock_timestamp()
  WHERE id=p_learning AND task_id=p_task AND record_state='active' AND (manager OR author_id=actor)
  RETURNING * INTO saved;
 ELSE
  UPDATE public.mission_learnings SET record_state='withdrawn',updated_at=clock_timestamp()
  WHERE id=p_learning AND task_id=p_task AND record_state='active' AND (manager OR author_id=actor)
  RETURNING * INTO saved;
 END IF;
 IF saved.id IS NULL THEN
  RAISE EXCEPTION 'Only the person who wrote a note, or a manager, can change it' USING ERRCODE='P0002'; END IF;

 INSERT INTO taskpulse_private.audit_events(organization_id,actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(org,actor,caller_role::text,cmd,'mission_learnings',saved.id,
  CASE p_op WHEN 'withdraw' THEN ARRAY['record_state'] WHEN 'edit' THEN ARRAY['kind','body'] ELSE ARRAY['kind','body','task_id'] END,
  jsonb_build_object('task_id',jsonb_build_object('after',p_task),'kind',jsonb_build_object('after',saved.kind)),p_operation);
 result:=jsonb_build_object('id',saved.id,'state',saved.record_state);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,cmd,p_operation,request,saved.id,result);
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION taskpulse_private.mission_learning_writer(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mission_learnings(uuid),public.mission_learning_command(text,uuid,uuid,text,text,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mission_learnings(uuid),public.mission_learning_command(text,uuid,uuid,text,text,uuid)
 TO authenticated;

-- ---------------------------------------------------------------------------
-- Activity feed: migration 59's body, with mission_learnings in its rules.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activity_feed(
  p_from date,
  p_to date,
  p_kind text DEFAULT NULL,
  p_member uuid DEFAULT NULL,
  p_before jsonb DEFAULT NULL,
  p_limit integer DEFAULT 50
) RETURNS TABLE (
  id text,
  occurred_at timestamptz,
  kind text,
  action text,
  actor_id uuid,
  subject_user_id uuid,
  task_id uuid,
  task_tag text,
  record_kind text,
  record_id uuid,
  fields text[],
  reason text,
  period date
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
  caller public.user_role := public.get_user_role();
  org uuid := public.current_organization();
  manager boolean;
  my_tasks uuid[];
  member_tasks uuid[];
  lim integer;
  start_at timestamptz;
  end_at timestamptz;
  before_at timestamptz;
  before_id text;
  -- Mission columns whose change is worth a line; other updates are derived.
  shown text[] := ARRAY['status', 'priority', 'title', 'category', 'assignee_id', 'reviewer_id', 'assigned_date',
    'due_date', 'completed_date', 'task_scale', 'scale_override', 'archived_effective_date', 'is_primary',
    'share_units', 'review_approved'];
BEGIN
  IF me IS NULL OR caller IS NULL OR org IS NULL THEN
    RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE = '42501';
  END IF;
  manager := caller IN ('managing_director', 'project_engineer');
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 92 THEN
    RAISE EXCEPTION 'A date range of at most 93 days is required' USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NOT NULL AND p_kind NOT IN ('missions', 'records', 'time', 'people', 'month', 'company') THEN
    RAISE EXCEPTION 'Unknown activity kind' USING ERRCODE = '22023';
  END IF;
  IF NOT manager AND p_member IS NOT NULL AND p_member <> me THEN
    RAISE EXCEPTION 'Members can only list their own activity' USING ERRCODE = '42501';
  END IF;
  IF p_before IS NOT NULL THEN
    BEGIN
      before_at := (p_before ->> 'at')::timestamptz;
      before_id := p_before ->> 'id';
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Invalid page cursor' USING ERRCODE = '22023';
    END;
    IF before_at IS NULL OR before_id IS NULL THEN
      RAISE EXCEPTION 'Invalid page cursor' USING ERRCODE = '22023';
    END IF;
  END IF;
  lim := least(greatest(coalesce(p_limit, 50), 1), 200);
  start_at := p_from::timestamp AT TIME ZONE 'Asia/Kolkata';
  end_at := (p_to + 1)::timestamp AT TIME ZONE 'Asia/Kolkata';
  IF before_at IS NOT NULL THEN end_at := least(end_at, before_at + interval '1 microsecond'); END IF;
  IF NOT manager THEN my_tasks := taskpulse_private.activity_tasks(me); END IF;
  IF p_member IS NOT NULL THEN member_tasks := taskpulse_private.activity_tasks(p_member); END IF;

  RETURN QUERY
  WITH rules (table_name, kind, row_changes) AS (
    -- Only these audited tables appear; row_changes adds their create/delete
    -- and shown-column updates to their command events.
    VALUES
      ('tasks', 'missions', true), ('task_assignees', 'missions', true), ('task_reviewers', 'missions', true),
      ('task_dependencies', 'missions', true), ('task_links', 'missions', true),
      ('task_detail_sections', 'missions', false), ('task_detail_template_versions', 'missions', false),
      ('task_checklists', 'missions', false), ('checklist_nodes', 'missions', false),
      ('checklist_templates', 'missions', false), ('checklist_template_nodes', 'missions', false),
      ('tool_previews', 'missions', false),
      ('users', 'people', false), ('member_invitations', 'people', false),
      ('company_statements', 'company', true), ('company_milestones', 'company', true), ('report_snapshots', 'company', true),
      -- Settings > Company saves (migration 53): one company_settings_<section> command line each;
      -- the settings row's own version bump is not listed.
      ('organization_settings', 'company', false),
      -- Mistakes and learning on a mission (migration 111): one mission_learning_<op> line each.
      ('mission_learnings', 'missions', false)
  ),
  audit AS (
    SELECT 'audit:' || lpad(a.id::text, 19, '0') AS id, a.occurred_at, r.kind::text AS kind,
      a.command AS action, a.actor_id,
      CASE WHEN a.table_name = 'users' THEN a.row_id
        ELSE taskpulse_private.activity_uuid(coalesce(a.protected_changes -> 'user_id' ->> 'after', a.protected_changes -> 'user_id' ->> 'before'))
      END AS subject_user_id,
      CASE WHEN a.table_name = 'tasks' THEN a.row_id
        WHEN a.table_name = 'task_checklists' THEN c.task_id
        ELSE taskpulse_private.activity_uuid(coalesce(a.protected_changes -> 'task_id' ->> 'after', a.protected_changes -> 'task_id' ->> 'before'))
      END AS task_id,
      a.table_name::text AS record_kind, a.row_id AS record_id,
      CASE WHEN a.command = 'UPDATE' THEN ARRAY(SELECT x FROM unnest(a.changed_fields) x WHERE x = ANY (shown) ORDER BY x) END AS fields,
      a.protected_changes ->> 'reason' AS reason, NULL::date AS period
    FROM taskpulse_private.audit_events a
    JOIN rules r ON r.table_name = a.table_name
    LEFT JOIN public.task_checklists c ON a.table_name = 'task_checklists' AND c.id = a.row_id
    WHERE a.organization_id = org AND a.occurred_at >= start_at AND a.occurred_at < end_at
      AND (p_kind IS NULL OR r.kind = p_kind)
      AND a.actor_id IS NOT NULL
      AND a.command NOT LIKE '%refresh%'
      AND (a.command NOT IN ('INSERT', 'UPDATE', 'DELETE')
        OR (r.row_changes AND (a.command <> 'UPDATE' OR a.changed_fields && shown)
          -- A row change made inside a shown command already has that
          -- command's line: same transaction, so the same occurred_at.
          AND NOT EXISTS (
            SELECT 1 FROM taskpulse_private.audit_events e
            JOIN rules re ON re.table_name = e.table_name
            WHERE e.organization_id = org AND e.occurred_at = a.occurred_at
              AND e.actor_id IS NOT NULL
              AND e.command NOT IN ('INSERT', 'UPDATE', 'DELETE') AND e.command NOT LIKE '%refresh%')))
  ),
  records AS (
    SELECT 'input:' || lpad(h.sequence::text, 19, '0') AS id, h.recorded_at AS occurred_at, 'records'::text AS kind,
      h.command AS action, h.actor_id,
      taskpulse_private.activity_uuid(coalesce(h.source ->> 'user_id', h.source ->> 'owner_id', h.source ->> 'posted_by', h.source ->> 'sales_by')) AS subject_user_id,
      taskpulse_private.activity_uuid(h.source ->> 'related_task_id') AS task_id,
      h.kind AS record_kind, h.record_id, NULL::text[] AS fields, h.reason, NULL::date AS period
    FROM taskpulse_private.input_history h
    WHERE (p_kind IS NULL OR p_kind = 'records')
      AND h.organization_id = org AND h.recorded_at >= start_at AND h.recorded_at < end_at
      AND h.actor_id IS NOT NULL
      AND h.kind IN ('attendance', 'fact', 'idea', 'suggestion', 'sale', 'meeting')
      AND h.command <> 'legacy_current_baseline'
  ),
  logs AS (
    SELECT 'log:' || lpad(r.id::text, 19, '0') AS id, r.occurred_at, 'time'::text AS kind,
      r.command AS action, r.actor_id, l.user_id AS subject_user_id, l.task_id,
      'log'::text AS record_kind, r.log_id AS record_id, NULL::text[] AS fields, r.reason, NULL::date AS period
    FROM taskpulse_private.log_revisions r
    LEFT JOIN public.daily_task_logs l ON l.id = r.log_id
    WHERE (p_kind IS NULL OR p_kind = 'time')
      AND r.organization_id = org AND r.occurred_at >= start_at AND r.occurred_at < end_at
  ),
  months AS (
    SELECT 'month:' || m.actor_id::text || ':' || m.operation::text AS id, m.recorded_at AS occurred_at, 'month'::text AS kind,
      'month_' || (m.request ->> 'command') AS action, m.actor_id, NULL::uuid AS subject_user_id, NULL::uuid AS task_id,
      NULL::text AS record_kind, NULL::uuid AS record_id, NULL::text[] AS fields,
      m.request -> 'payload' ->> 'reason' AS reason,
      CASE WHEN m.request ->> 'period' ~ '^\d{4}-\d{2}-\d{2}$' THEN (m.request ->> 'period')::date END AS period
    FROM taskpulse_private.month_receipts m
    WHERE (p_kind IS NULL OR p_kind = 'month')
      AND m.organization_id = org AND m.recorded_at >= start_at AND m.recorded_at < end_at
  ),
  feed AS (
    SELECT * FROM audit UNION ALL SELECT * FROM records UNION ALL SELECT * FROM logs UNION ALL SELECT * FROM months
  )
  SELECT f.id, f.occurred_at, f.kind, f.action, f.actor_id, f.subject_user_id, f.task_id, t.task_tag::text,
    f.record_kind, f.record_id, f.fields, f.reason, f.period
  FROM feed f
  LEFT JOIN public.tasks t ON t.id = f.task_id
  WHERE (before_at IS NULL OR f.occurred_at < before_at OR (f.occurred_at = before_at AND f.id COLLATE "C" < before_id COLLATE "C"))
    AND (manager OR f.actor_id = me OR f.subject_user_id = me OR (f.kind = 'missions' AND f.task_id = ANY (my_tasks)))
    AND (p_member IS NULL OR f.actor_id = p_member OR f.subject_user_id = p_member
      OR (f.kind = 'missions' AND f.task_id = ANY (member_tasks)))
  ORDER BY f.occurred_at DESC, f.id COLLATE "C" DESC
  LIMIT lim;
END $$;

COMMIT;
SELECT taskpulse_private.m15_secure();
