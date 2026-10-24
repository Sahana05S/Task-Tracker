-- Mission change log (DECISIONS "Mission change log", 23 October 2026): the
-- user wants to see exactly what was done in a mission, every update in
-- detail. The audit trigger already writes a row for every change to a
-- mission and its rows, but kept the values of only a few protected columns
-- and nothing tied a row to its mission. This keeps the values and the
-- mission; it changes no rule and no command.
--
--   * audit_events.detail: before/after of every changed column of the
--     mission tables (and company statements, milestones, saved reports),
--     except bookkeeping columns (taskpulse_private.audit_noise()). Text
--     longer than 400 characters is cut. protected_changes is unchanged, so
--     its readers (manual credit capture, activity_feed) see what they did.
--   * audit_events.task_id: the mission a row belongs to. Row changes set it
--     from the row (checklist rows through their checklist, a dependency
--     belongs to its successor mission); command events get it from a BEFORE INSERT
--     trigger (the row it names, else its task_id / task_before payload).
--     Existing rows are back-filled the same way where the row still exists
--     or its payload names the mission.
--   * public.mission_history(p_task, p_before, p_limit): one mission's
--     changes, newest first, whole transactions at a time (one action and
--     everything it changed share occurred_at), p_limit transactions per
--     call (at most 100), keyset paging on occurred_at. Managers, the
--     mission's assignees and its reviewers see every change; any other
--     member of the company sees only their own. Rows without a person
--     (system, worker, migration) and derived refresh events are left out,
--     as are updates that changed only bookkeeping columns.
--   * Rows written before this migration have no detail: the read falls back
--     to protected_changes (status, priority, progress, hours, people, timer
--     times), otherwise it names the changed columns only.

BEGIN;

ALTER TABLE taskpulse_private.audit_events
  ADD COLUMN task_id uuid,
  ADD COLUMN detail jsonb;

CREATE INDEX audit_events_task_idx ON taskpulse_private.audit_events (task_id, occurred_at DESC, id DESC)
  WHERE task_id IS NOT NULL;

-- Columns that change as bookkeeping, not because a person edited them.
CREATE FUNCTION taskpulse_private.audit_noise() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT ARRAY['id', 'organization_id', 'created_at', 'updated_at', 'metric_version', 'lifecycle_version',
    'execution_version', 'participant_version', 'scale_version', 'freshness', 'valid_for_metrics',
    'scaled_progress', 'task_productivity', 'credit_anchor', 'provider_asset_key', 'reviewed_revision',
    'participant_credit_mode', 'storage_path'];
$$;

-- A retained value: long text is cut so one large description cannot bloat the log.
CREATE FUNCTION taskpulse_private.audit_value(p_value jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN jsonb_typeof(p_value) = 'string' AND length(p_value #>> '{}') > 400
    THEN to_jsonb(left(p_value #>> '{}', 400) || '…') ELSE p_value END;
$$;

CREATE OR REPLACE FUNCTION taskpulse_private.audit_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n jsonb := CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
        o jsonb := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END; fields text[]; changes jsonb;
        row_data jsonb := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END; mission uuid; shown jsonb;
BEGIN
  SELECT coalesce(array_agg(k ORDER BY k),ARRAY[]::text[]) INTO fields
    FROM (SELECT jsonb_object_keys(n || o) k) s WHERE n->k IS DISTINCT FROM o->k;
  SELECT coalesce(jsonb_object_agg(k,jsonb_build_object('before',o->k,'after',n->k)),'{}'::jsonb) INTO changes
    FROM unnest(fields) k WHERE k=ANY(ARRAY['role','is_active','assignee_id','reviewer_id','user_id','task_id',
      'participant_credit_mode','participant_version','share_units','is_primary','review_approved','reviewed_at',
      'is_validated','validated_by','is_override','override_by','status','task_scale','priority','task_productivity','score','progress_percentage','hours_worked','progress_delta','requested_progress_delta','effective_progress_delta','execution_version','metric_version','reversed_at','started_at','stopped_at','elapsed_seconds','source_timer_id','generated_log_id']);
  -- Mission change log (70): the mission and every changed value of the tables people edit by hand.
  IF TG_TABLE_NAME IN ('tasks','task_assignees','task_reviewers','task_dependencies','task_links','task_detail_sections',
      'task_checklists','checklist_nodes','task_timers','daily_task_logs','company_statements','company_milestones','report_snapshots') THEN
    mission := CASE TG_TABLE_NAME
      WHEN 'tasks' THEN taskpulse_private.activity_uuid(row_data->>'id')
      WHEN 'task_dependencies' THEN taskpulse_private.activity_uuid(row_data->>'successor_task_id')
      WHEN 'checklist_nodes' THEN (SELECT c.task_id FROM public.task_checklists c
        WHERE c.id=taskpulse_private.activity_uuid(row_data->>'checklist_id'))
      ELSE taskpulse_private.activity_uuid(row_data->>'task_id') END;
    SELECT jsonb_object_agg(k,jsonb_build_object('before',taskpulse_private.audit_value(o->k),'after',taskpulse_private.audit_value(n->k)))
      INTO shown FROM unnest(fields) k WHERE NOT k=ANY(taskpulse_private.audit_noise());
  END IF;
  INSERT INTO taskpulse_private.audit_events(organization_id,actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,task_id,detail)
    VALUES(coalesce(n->>'organization_id',o->>'organization_id')::uuid,auth.uid(),coalesce(public.get_user_role()::text,'system'),TG_OP,TG_TABLE_NAME,
      coalesce(n->>'id',o->>'id')::uuid,fields,changes,mission,shown);
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

-- The mission of an audit row that does not say it: the row it names, else its payload.
CREATE FUNCTION taskpulse_private.audit_mission(p_table text, p_row uuid, p_payload jsonb) RETURNS uuid
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(
    CASE p_table
      WHEN 'tasks' THEN p_row
      WHEN 'task_checklists' THEN (SELECT c.task_id FROM public.task_checklists c WHERE c.id = p_row)
      WHEN 'checklist_nodes' THEN (SELECT c.task_id FROM public.checklist_nodes x
        JOIN public.task_checklists c ON c.id = x.checklist_id WHERE x.id = p_row)
      WHEN 'task_timers' THEN (SELECT x.task_id FROM public.task_timers x WHERE x.id = p_row)
      WHEN 'daily_task_logs' THEN (SELECT x.task_id FROM public.daily_task_logs x WHERE x.id = p_row)
      WHEN 'task_assignees' THEN (SELECT x.task_id FROM public.task_assignees x WHERE x.id = p_row)
      WHEN 'task_reviewers' THEN (SELECT x.task_id FROM public.task_reviewers x WHERE x.id = p_row)
      WHEN 'task_links' THEN (SELECT x.task_id FROM public.task_links x WHERE x.id = p_row)
      WHEN 'task_detail_sections' THEN (SELECT x.task_id FROM public.task_detail_sections x WHERE x.id = p_row)
      WHEN 'task_dependencies' THEN (SELECT x.successor_task_id FROM public.task_dependencies x WHERE x.id = p_row)
    END,
    taskpulse_private.activity_uuid(coalesce(p_payload -> 'task_id' ->> 'after', p_payload -> 'task_id' ->> 'before',
      p_payload -> 'task_before' ->> 'id')));
$$;
REVOKE ALL ON FUNCTION taskpulse_private.audit_mission(text, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION taskpulse_private.audit_noise() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION taskpulse_private.audit_value(jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION taskpulse_private.audit_event_mission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.task_id IS NULL AND NEW.table_name IN ('tasks','task_assignees','task_reviewers','task_dependencies','task_links',
      'task_detail_sections','task_checklists','checklist_nodes','task_timers','daily_task_logs') THEN
    NEW.task_id := taskpulse_private.audit_mission(NEW.table_name, NEW.row_id, NEW.protected_changes);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.audit_event_mission() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER m70_mission BEFORE INSERT ON taskpulse_private.audit_events
  FOR EACH ROW EXECUTE FUNCTION taskpulse_private.audit_event_mission();

-- Back-fill, set-based per table (a per-row lookup was too slow for the demo's
-- pooled connection): rows whose row still exists, then rows whose payload
-- names the mission.
UPDATE taskpulse_private.audit_events a SET task_id = a.row_id WHERE a.task_id IS NULL AND a.table_name = 'tasks';
UPDATE taskpulse_private.audit_events a SET task_id = x.task_id FROM public.task_checklists x
  WHERE a.task_id IS NULL AND a.table_name = 'task_checklists' AND x.id = a.row_id;
UPDATE taskpulse_private.audit_events a SET task_id = c.task_id FROM public.checklist_nodes x JOIN public.task_checklists c ON c.id = x.checklist_id
  WHERE a.task_id IS NULL AND a.table_name = 'checklist_nodes' AND x.id = a.row_id;
UPDATE taskpulse_private.audit_events a SET task_id = x.task_id FROM public.task_timers x
  WHERE a.task_id IS NULL AND a.table_name = 'task_timers' AND x.id = a.row_id;
UPDATE taskpulse_private.audit_events a SET task_id = x.task_id FROM public.daily_task_logs x
  WHERE a.task_id IS NULL AND a.table_name = 'daily_task_logs' AND x.id = a.row_id;
UPDATE taskpulse_private.audit_events a SET task_id = x.task_id FROM public.task_assignees x
  WHERE a.task_id IS NULL AND a.table_name = 'task_assignees' AND x.id = a.row_id;
UPDATE taskpulse_private.audit_events a SET task_id = x.task_id FROM public.task_reviewers x
  WHERE a.task_id IS NULL AND a.table_name = 'task_reviewers' AND x.id = a.row_id;
UPDATE taskpulse_private.audit_events a SET task_id = x.task_id FROM public.task_links x
  WHERE a.task_id IS NULL AND a.table_name = 'task_links' AND x.id = a.row_id;
UPDATE taskpulse_private.audit_events a SET task_id = x.task_id FROM public.task_detail_sections x
  WHERE a.task_id IS NULL AND a.table_name = 'task_detail_sections' AND x.id = a.row_id;
UPDATE taskpulse_private.audit_events a SET task_id = x.successor_task_id FROM public.task_dependencies x
  WHERE a.task_id IS NULL AND a.table_name = 'task_dependencies' AND x.id = a.row_id;
UPDATE taskpulse_private.audit_events a
  SET task_id = taskpulse_private.activity_uuid(coalesce(a.protected_changes -> 'task_id' ->> 'after',
    a.protected_changes -> 'task_id' ->> 'before', a.protected_changes -> 'task_before' ->> 'id'))
  WHERE a.task_id IS NULL AND (a.protected_changes ? 'task_id' OR a.protected_changes ? 'task_before')
    AND a.table_name IN ('task_assignees','task_reviewers','task_links','task_detail_sections','task_checklists',
      'checklist_nodes','task_timers','daily_task_logs');

CREATE FUNCTION public.mission_history(
  p_task uuid,
  p_before timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 40
) RETURNS TABLE (
  id bigint,
  occurred_at timestamptz,
  actor_id uuid,
  command text,
  table_name text,
  row_id uuid,
  fields text[],
  changes jsonb,
  payload jsonb,
  label text,
  reason text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
  caller public.user_role := public.get_user_role();
  org uuid := public.current_organization();
  sees_all boolean;
  lim integer := least(greatest(coalesce(p_limit, 40), 1), 100);
  noise text[] := taskpulse_private.audit_noise();
BEGIN
  IF me IS NULL OR caller IS NULL OR org IS NULL THEN
    RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = p_task AND t.organization_id = org) THEN
    RAISE EXCEPTION 'Mission not found' USING ERRCODE = 'P0002';
  END IF;
  sees_all := caller IN ('managing_director', 'project_engineer')
    OR p_task = ANY (taskpulse_private.activity_tasks(me))
    OR EXISTS (SELECT 1 FROM public.task_reviewers r WHERE r.task_id = p_task AND r.user_id = me)
    OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = p_task AND t.reviewer_id = me);

  RETURN QUERY
  WITH shown AS (
    SELECT a.* FROM taskpulse_private.audit_events a
    WHERE a.task_id = p_task AND a.organization_id = org
      AND a.actor_id IS NOT NULL
      AND (sees_all OR a.actor_id = me)
      AND a.command NOT LIKE '%refresh%'
      AND (p_before IS NULL OR a.occurred_at < p_before)
      -- An update that touched only bookkeeping columns says nothing.
      AND (a.command <> 'UPDATE' OR EXISTS (SELECT 1 FROM unnest(a.changed_fields) f WHERE NOT f = ANY (noise)))
  ),
  moments AS (
    SELECT DISTINCT s.occurred_at FROM shown s ORDER BY s.occurred_at DESC LIMIT lim
  )
  SELECT s.id, s.occurred_at, s.actor_id, s.command, s.table_name::text, s.row_id, s.changed_fields,
    CASE WHEN s.command IN ('INSERT', 'UPDATE', 'DELETE') THEN coalesce(s.detail, s.protected_changes) END,
    CASE WHEN s.command NOT IN ('INSERT', 'UPDATE', 'DELETE') THEN s.protected_changes END,
    CASE s.table_name
      WHEN 'checklist_nodes' THEN coalesce((SELECT x.title FROM public.checklist_nodes x WHERE x.id = s.row_id)::text,
        s.detail -> 'title' ->> 'after', s.detail -> 'title' ->> 'before')
      WHEN 'task_checklists' THEN (SELECT x.title FROM public.checklist_nodes x
        WHERE x.id = taskpulse_private.activity_uuid(s.protected_changes ->> 'node_id'))::text
      WHEN 'task_timers' THEN (SELECT x.title FROM public.task_timers m JOIN public.checklist_nodes x ON x.id = m.checklist_node_id
        WHERE m.id = s.row_id)::text
      WHEN 'daily_task_logs' THEN (SELECT x.title FROM public.daily_task_logs m JOIN public.checklist_nodes x ON x.id = m.checklist_node_id
        WHERE m.id = s.row_id)::text
      WHEN 'task_links' THEN coalesce((SELECT coalesce(nullif(x.label, ''), x.url) FROM public.task_links x WHERE x.id = s.row_id)::text,
        s.detail -> 'label' ->> 'before', s.detail -> 'url' ->> 'before')
      WHEN 'task_detail_sections' THEN (SELECT x.title FROM public.task_detail_sections x WHERE x.id = s.row_id)::text
      WHEN 'task_assignees' THEN (SELECT u.full_name FROM public.users u WHERE u.id = coalesce(
        (SELECT x.user_id FROM public.task_assignees x WHERE x.id = s.row_id),
        taskpulse_private.activity_uuid(coalesce(s.protected_changes -> 'user_id' ->> 'after', s.protected_changes -> 'user_id' ->> 'before'))))::text
      WHEN 'task_reviewers' THEN (SELECT u.full_name FROM public.users u WHERE u.id = coalesce(
        (SELECT x.user_id FROM public.task_reviewers x WHERE x.id = s.row_id),
        taskpulse_private.activity_uuid(coalesce(s.protected_changes -> 'user_id' ->> 'after', s.protected_changes -> 'user_id' ->> 'before'))))::text
      WHEN 'task_dependencies' THEN (SELECT t.task_tag || ' · ' || t.title FROM public.tasks t WHERE t.id = (
        SELECT CASE WHEN o.successor = p_task THEN o.predecessor ELSE o.successor END FROM (
          SELECT coalesce(d.successor_task_id, taskpulse_private.activity_uuid(coalesce(s.detail -> 'successor_task_id' ->> 'after', s.detail -> 'successor_task_id' ->> 'before'))) AS successor,
            coalesce(d.predecessor_task_id, taskpulse_private.activity_uuid(coalesce(s.detail -> 'predecessor_task_id' ->> 'after', s.detail -> 'predecessor_task_id' ->> 'before'))) AS predecessor
          FROM (SELECT 1) one LEFT JOIN public.task_dependencies d ON d.id = s.row_id) o))::text
    END,
    s.protected_changes ->> 'reason'
  FROM shown s
  JOIN moments m ON m.occurred_at = s.occurred_at
  ORDER BY s.occurred_at DESC, s.id;
END $$;
REVOKE ALL ON FUNCTION public.mission_history(uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mission_history(uuid, timestamptz, integer) TO authenticated;

-- audit_write (owned by taskpulse_definer) calls these on every audited write,
-- so they are re-owned before COMMIT rather than only by m15_secure below.
ALTER FUNCTION taskpulse_private.audit_noise() OWNER TO taskpulse_definer;
ALTER FUNCTION taskpulse_private.audit_value(jsonb) OWNER TO taskpulse_definer;
ALTER FUNCTION taskpulse_private.audit_mission(text, uuid, jsonb) OWNER TO taskpulse_definer;
ALTER FUNCTION taskpulse_private.audit_event_mission() OWNER TO taskpulse_definer;
ALTER FUNCTION taskpulse_private.audit_write() OWNER TO taskpulse_definer;
ALTER FUNCTION public.mission_history(uuid, timestamptz, integer) OWNER TO taskpulse_definer;

COMMIT;
SELECT taskpulse_private.m15_secure();
