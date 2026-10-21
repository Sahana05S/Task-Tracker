-- Activity log (candidate E, DECISIONS "Company settings and activity log",
-- 21 October 2026): one read over what the company already retains, newest
-- first. Writes nothing and adds no table. Needs only migrations 01-49
-- (50-53 are other features; the gap in numbering is intended).
--
-- public.activity_feed(p_from, p_to, p_kind, p_member, p_before, p_limit)
--   * Sources, de-duplicated against each other:
--       records  taskpulse_private.input_history (dated record saves, reviews,
--                withdrawals; not the migration baseline, not effort rows)
--       time     taskpulse_private.log_revisions (log create/edit/reverse),
--                joined to the log for its member and mission
--       month    taskpulse_private.month_receipts (draft/close/correction)
--       missions taskpulse_private.audit_events on missions and checklists:
--                command events (task tools, details, checklist commands) and
--                row changes that a person made on purpose (create, delete,
--                assignment, status, priority, dates, scale, title)
--       people   audit command events on users and invitations
--       company  company statements, milestones and saved reports
--     Audited tables come from one list in the function; anything else (logs,
--     timers and dated records, which the sources above tell better, award and
--     month bookkeeping) is not shown. Derived refresh events and rows without
--     a person (system, worker, migration) are left out.
--   * Company: the caller's company only (explicitly, and by the FORCE RLS
--     of M15.2, because this function runs as taskpulse_definer).
--   * Role: managing director and project engineer see every row; any other
--     active member sees rows they made and rows about their own records
--     (their account, their dated records (a meeting point's owner, else its
--     author), their logs, missions they are assigned to). p_member
--     narrows to rows made by or about one member (the same "about"); a
--     member may only pass themselves.
--   * Bounds: p_from..p_to are Asia/Kolkata dates, at most 93 days; at most
--     200 rows per call; keyset paging on (occurred_at, id) through
--     p_before = {"at": <timestamptz>, "id": <id of the last row seen>}.
--   * record_kind/record_id name the row: the dated record kind and id, 'log'
--     and the log id, or for audit rows the audited table and row id. fields
--     are the shown columns a mission update changed.
--   * Inactive or signed-out callers are refused (42501); bad bounds 22023.

BEGIN;

CREATE INDEX audit_events_feed_idx ON taskpulse_private.audit_events (organization_id, occurred_at DESC, id DESC);
CREATE INDEX input_history_feed_idx ON taskpulse_private.input_history (organization_id, recorded_at DESC, sequence DESC);
CREATE INDEX log_revisions_feed_idx ON taskpulse_private.log_revisions (organization_id, occurred_at DESC, id DESC);
CREATE INDEX month_receipts_feed_idx ON taskpulse_private.month_receipts (organization_id, recorded_at DESC);

-- Text from retained jsonb as a uuid, or NULL when it is not one, so one odd
-- value never breaks the whole read.
CREATE FUNCTION taskpulse_private.activity_uuid(p_value text) RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p_value::uuid END;
$$;
REVOKE ALL ON FUNCTION taskpulse_private.activity_uuid(text) FROM PUBLIC, anon, authenticated, service_role;

-- Missions a member is assigned to, by the rule of public.is_task_assignee
-- (participants; the single assignee only in legacy credit mode).
CREATE FUNCTION taskpulse_private.activity_tasks(p_user uuid) RETURNS uuid[]
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(array_agg(t.id), '{}') FROM public.tasks t
  WHERE EXISTS (SELECT 1 FROM public.task_assignees a WHERE a.task_id = t.id AND a.user_id = p_user)
    OR (t.participant_credit_mode = 'legacy' AND t.assignee_id = p_user);
$$;
REVOKE ALL ON FUNCTION taskpulse_private.activity_tasks(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.activity_feed(
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
      ('company_statements', 'company', true), ('company_milestones', 'company', true), ('report_snapshots', 'company', true)
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
        OR (r.row_changes AND (a.command <> 'UPDATE' OR a.changed_fields && shown)))
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

REVOKE ALL ON FUNCTION public.activity_feed(date, date, text, uuid, jsonb, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activity_feed(date, date, text, uuid, jsonb, integer) TO authenticated;

COMMIT;
SELECT taskpulse_private.m15_secure();
