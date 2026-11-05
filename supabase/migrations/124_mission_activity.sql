-- ===========================================================================
-- TaskPulse - mission activity history (forward only; 5 November 2026)
--
-- Adding people to a mission left no understandable line anywhere (user
-- request, 5 November 2026: every meaningful mission change appears in the
-- mission's own history, with real names and actions). Team > Activity hides a
-- row-level change when the same transaction wrote a named command, so an Edit
-- dialog that adds two people read only "Saved the mission and its assignees";
-- mission files wrote no line at all.
--
-- 1. audit_write also keeps the before and after values a person reads on a
--    mission line: a mission's title, type and dates, a participant's role, a
--    link's label and type, and both missions of a dependency. Only future
--    rows carry them; nothing is backfilled and no other table gains a value.
-- 2. task_proof_command writes one audit row per file it adds or removes
--    ('task_proof_add' / 'task_proof_withdraw', table 'task_proofs', the file's
--    name and kind with the mission). A replay returns from its receipt first,
--    so a retried upload writes no second line.
-- 3. activity_feed (Team > Activity) lists 'task_proofs' (missions kind), and
--    a task_people_* line names its member (the command stores the user id as
--    a plain value). Nothing else in the feed changes.
-- 4. public.mission_activity(task, before, limit): one mission's history,
--    newest first, keyset paged, read only. The managing director and the
--    mission's people (can_read_mission_work) read it; anyone else is refused.
--    It lists the mission's commands (lifecycle with before and after values,
--    checklist with the objective's title, details, labels, learning, files,
--    people) and the row-level participant, dependency, link and mission
--    changes that Team > Activity folds into their command, so each person
--    added or removed has a line of their own. A save or people command whose
--    rows are listed is not repeated; a lifecycle command (status, progress,
--    scale) and an owner transfer stay one line with their before and after.
--    Time logs and timer sessions keep their own panels and are not listed.
-- 5. Two indexes make the per-mission read independent of the company's audit
--    volume.
--
-- audit_write (12+40), task_proof_command (113+117) and activity_feed
-- (111+116+120) are patched from their live definitions; each fragment must
-- occur exactly once. No scoring, award, permission or data change.
-- ===========================================================================
BEGIN;

CREATE FUNCTION pg_temp.m124_patch(fn regprocedure, frag text, repl text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(fn);
BEGIN
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION '% does not contain this fragment exactly once; update migration 124: %',fn,left(frag,80); END IF;
 EXECUTE replace(def,frag,repl);
END $$;

-- 1. Mission lines keep their before and after values -----------------------
SELECT pg_temp.m124_patch('taskpulse_private.audit_write()',
 $f$FROM unnest(fields) k WHERE k=ANY(ARRAY[$f$,
 $f$FROM unnest(fields) k WHERE (TG_TABLE_NAME='tasks' AND k=ANY(ARRAY['title','category','due_date','assigned_date',
      'completed_date','scale_override','archived_effective_date']))
     OR (TG_TABLE_NAME='task_assignees' AND k='assignment_role') OR (TG_TABLE_NAME='task_reviewers' AND k='reviewer_role')
     OR (TG_TABLE_NAME='task_links' AND k=ANY(ARRAY['label','link_type']))
     OR (TG_TABLE_NAME='task_dependencies' AND k=ANY(ARRAY['predecessor_task_id','successor_task_id','relation_type']))
     OR k=ANY(ARRAY[$f$);

-- 2. Mission files are audited ----------------------------------------------
SELECT pg_temp.m124_patch('public.task_proof_command(text,uuid,text,text,text,integer,uuid,uuid,text)',
 $f$ result:=jsonb_build_object('id',saved,'released',to_jsonb(released));$f$,
 $f$ INSERT INTO taskpulse_private.audit_events(organization_id,actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 SELECT org,actor,public.get_user_role()::text,cmd,'task_proofs',x.id,ARRAY['record_state'],
  jsonb_build_object('task_id',jsonb_build_object('after',p_task),'kind',x.kind,'file_name',x.file_name,'reason',x.file_name),p_operation
 FROM taskpulse_private.task_proofs x WHERE x.id=saved;
 result:=jsonb_build_object('id',saved,'released',to_jsonb(released));$f$);

-- 3. Team > Activity lists them ---------------------------------------------
SELECT pg_temp.m124_patch('public.activity_feed(date,date,text,uuid,jsonb,integer)',
 $f$('label_links', 'missions', false)$f$,
 $f$('label_links', 'missions', false),
      -- Mission files (migration 124): one task_proof_<op> line per upload or removal.
      ('task_proofs', 'missions', false)$f$);
-- ... and a people command names its member (task_people_* keep the user id as a plain value).
SELECT pg_temp.m124_patch('public.activity_feed(date,date,text,uuid,jsonb,integer)',
 $f$coalesce(a.protected_changes -> 'user_id' ->> 'after', a.protected_changes -> 'user_id' ->> 'before')$f$,
 $f$coalesce(a.protected_changes -> 'user_id' ->> 'after', a.protected_changes -> 'user_id' ->> 'before', a.protected_changes ->> 'user_id')$f$);

-- 4. One mission's history ---------------------------------------------------
-- The mission an audit row is about, from the row itself (no table lookup), so
-- it can be indexed. Checklist rows and a dependency's second mission are
-- matched separately.
CREATE FUNCTION taskpulse_private.audit_mission(p_table text, p_row uuid, p_changes jsonb) RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN p_table = 'tasks' THEN p_row
    WHEN p_table = 'task_dependencies' THEN taskpulse_private.activity_uuid(coalesce(
      p_changes -> 'predecessor_task_id' ->> 'after', p_changes -> 'predecessor_task_id' ->> 'before'))
    ELSE taskpulse_private.activity_uuid(coalesce(p_changes -> 'task_id' ->> 'after',
      p_changes -> 'task_id' ->> 'before', p_changes ->> 'task_id')) END;
$$;
REVOKE ALL ON FUNCTION taskpulse_private.audit_mission(text, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
-- The index is built and maintained as the table's owner (taskpulse_definer), which must call it.
GRANT EXECUTE ON FUNCTION taskpulse_private.audit_mission(text, uuid, jsonb) TO taskpulse_definer;

CREATE INDEX audit_events_mission_idx ON taskpulse_private.audit_events
  (organization_id, taskpulse_private.audit_mission(table_name, row_id, protected_changes), occurred_at DESC, id DESC);
CREATE INDEX audit_events_checklist_idx ON taskpulse_private.audit_events (row_id, occurred_at DESC)
  WHERE table_name = 'task_checklists';

CREATE FUNCTION public.mission_activity(
  p_task uuid,
  p_before jsonb DEFAULT NULL,
  p_limit integer DEFAULT 50
) RETURNS TABLE (
  id text,
  occurred_at timestamptz,
  action text,
  actor_id uuid,
  subject_user_id uuid,
  record_kind text,
  record_id uuid,
  fields text[],
  changes jsonb,
  detail text,
  role text,
  reason text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
  org uuid := public.current_organization();
  lim integer;
  before_at timestamptz;
  before_id text;
  lists uuid[];
  -- Mission columns whose change is worth a line (as in activity_feed).
  shown text[] := ARRAY['status', 'priority', 'title', 'category', 'assignee_id', 'reviewer_id', 'assigned_date',
    'due_date', 'completed_date', 'task_scale', 'scale_override', 'archived_effective_date', 'review_approved'];
  -- Values a line may show as before -> after.
  values_shown text[] := ARRAY['status', 'priority', 'title', 'category', 'assigned_date', 'due_date', 'completed_date',
    'task_scale', 'scale_override', 'archived_effective_date', 'review_approved', 'share_units', 'assignment_role',
    'reviewer_role', 'label', 'link_type', 'relation_type'];
BEGIN
  IF me IS NULL OR public.get_user_role() IS NULL OR org IS NULL THEN
    RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE = '42501';
  END IF;
  IF p_task IS NULL OR NOT taskpulse_private.can_read_mission_work(p_task) THEN
    RAISE EXCEPTION 'This mission''s history is private to its people' USING ERRCODE = '42501';
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
  SELECT coalesce(array_agg(c.id), '{}') INTO lists FROM public.task_checklists c WHERE c.task_id = p_task;

  RETURN QUERY
  WITH base AS (
    SELECT a.id AS aid, a.occurred_at AS at, a.command, a.actor_id AS actor, a.table_name AS tbl, a.row_id,
      a.changed_fields, a.protected_changes AS pc,
      a.command IN ('INSERT', 'UPDATE', 'DELETE') AS row_change
    FROM taskpulse_private.audit_events a
    WHERE a.organization_id = org
      AND (taskpulse_private.audit_mission(a.table_name, a.row_id, a.protected_changes) = p_task
        OR (a.table_name = 'task_checklists' AND a.row_id = ANY (lists))
        OR (a.table_name = 'task_dependencies' AND taskpulse_private.activity_uuid(coalesce(
          a.protected_changes -> 'successor_task_id' ->> 'after', a.protected_changes -> 'successor_task_id' ->> 'before')) = p_task))
      AND a.actor_id IS NOT NULL
      AND a.command NOT LIKE '%refresh%'
      AND a.table_name NOT IN ('task_timers', 'daily_task_logs')
      AND (before_at IS NULL OR a.occurred_at <= before_at)
  ),
  kept AS (
    SELECT b.* FROM base b
    WHERE NOT b.row_change
      OR (b.tbl = 'tasks' AND (b.command = 'INSERT' OR (b.command = 'UPDATE' AND b.changed_fields && shown)))
      OR (b.tbl IN ('task_assignees', 'task_reviewers')
        AND (b.command <> 'UPDATE' OR b.pc ?| ARRAY['share_units', 'assignment_role', 'reviewer_role']))
      OR (b.tbl IN ('task_dependencies', 'task_links') AND b.command <> 'UPDATE')
  ),
  listed AS (
    SELECT k.* FROM kept k
    WHERE NOT (
        -- A save or people command whose participant rows have lines of their own.
        (k.command = 'save_task_with_participants'
          OR (k.command LIKE 'task\_people\_%' AND k.command <> 'task_people_transfer_owner'))
        AND EXISTS (SELECT 1 FROM kept r WHERE r.row_change AND r.at = k.at AND r.actor = k.actor))
      AND NOT (
        -- A lifecycle, people or tools command on the mission already carries its own
        -- before and after values; only the Edit dialog's save lists its row changes.
        k.row_change AND k.command = 'UPDATE' AND k.tbl = 'tasks'
        AND EXISTS (SELECT 1 FROM kept c WHERE NOT c.row_change AND c.tbl = 'tasks' AND c.at = k.at
          AND c.command <> 'save_task_with_participants'))
      AND NOT (
        -- An owner transfer is one line, not its row updates.
        k.row_change AND k.command = 'UPDATE' AND k.tbl = 'task_assignees'
        AND EXISTS (SELECT 1 FROM kept c WHERE c.command = 'task_people_transfer_owner' AND c.at = k.at))
  ),
  lines AS (
    SELECT 'audit:' || lpad(l.aid::text, 19, '0') AS line_id, l.* FROM listed l
  )
  SELECT l.line_id, l.at, l.command, l.actor,
    taskpulse_private.activity_uuid(coalesce(l.pc -> 'user_id' ->> 'after', l.pc -> 'user_id' ->> 'before', l.pc ->> 'user_id')),
    l.tbl::text, l.row_id,
    CASE WHEN l.command = 'UPDATE' THEN ARRAY(SELECT x FROM unnest(l.changed_fields) x WHERE x = ANY (shown) ORDER BY x) END,
    CASE WHEN l.row_change THEN
      (SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each(l.pc) e
        WHERE e.key = ANY (values_shown) AND jsonb_typeof(e.value) = 'object')
    WHEN jsonb_typeof(l.pc -> 'before') = 'object' AND jsonb_typeof(l.pc -> 'after') = 'object' AND l.tbl = 'tasks' THEN
      -- Lifecycle commands keep their before and after values (status, progress, scale).
      (SELECT jsonb_object_agg(k, jsonb_build_object('before', l.pc -> 'before' -> k, 'after', l.pc -> 'after' -> k))
        FROM unnest(ARRAY['status', 'progress', 'scale', 'priority']) k
        WHERE l.pc -> 'after' ? k AND (l.pc -> 'before' -> k) IS DISTINCT FROM (l.pc -> 'after' -> k))
    END,
    coalesce(n.title::text, l.pc ->> 'file_name',
      l.pc -> 'label' ->> 'after', l.pc -> 'label' ->> 'before', lk.label::text,
      CASE WHEN l.tbl = 'task_dependencies' THEN dt.task_tag::text || ' - ' || dt.title::text END),
    coalesce(l.pc -> 'reviewer_role' ->> 'after', l.pc -> 'reviewer_role' ->> 'before',
      l.pc -> 'assignment_role' ->> 'after', l.pc -> 'assignment_role' ->> 'before',
      rv.reviewer_role::text, asg.assignment_role::text,
      CASE WHEN l.tbl = 'task_proofs' THEN l.pc ->> 'kind' END),
    coalesce(l.pc ->> 'reason', CASE WHEN l.tbl = 'mission_learnings' THEN l.pc -> 'kind' ->> 'after' END)
  FROM lines l
  LEFT JOIN public.checklist_nodes n ON l.tbl = 'task_checklists'
    AND n.id = taskpulse_private.activity_uuid(coalesce(l.pc ->> 'node_id', l.pc -> 'node_after' ->> 'id'))
  LEFT JOIN public.task_links lk ON l.tbl = 'task_links' AND lk.id = l.row_id
  LEFT JOIN public.task_reviewers rv ON l.tbl = 'task_reviewers' AND rv.id = l.row_id
  LEFT JOIN public.task_assignees asg ON l.tbl = 'task_assignees' AND asg.id = l.row_id
  LEFT JOIN public.tasks dt ON l.tbl = 'task_dependencies' AND dt.id = taskpulse_private.activity_uuid(
    CASE WHEN taskpulse_private.audit_mission(l.tbl, l.row_id, l.pc) = p_task
      THEN coalesce(l.pc -> 'successor_task_id' ->> 'after', l.pc -> 'successor_task_id' ->> 'before')
      ELSE coalesce(l.pc -> 'predecessor_task_id' ->> 'after', l.pc -> 'predecessor_task_id' ->> 'before') END)
  WHERE before_at IS NULL OR l.at < before_at OR (l.at = before_at AND l.line_id COLLATE "C" < before_id COLLATE "C")
  ORDER BY l.at DESC, l.line_id COLLATE "C" DESC
  LIMIT lim;
END $$;
REVOKE ALL ON FUNCTION public.mission_activity(uuid, jsonb, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mission_activity(uuid, jsonb, integer) TO authenticated;

COMMIT;
SELECT taskpulse_private.m15_secure();
