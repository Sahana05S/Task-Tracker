-- ===========================================================================
-- TaskPulse - what happened during a timer session (forward only, read only)
--
-- Update plan of 3 November 2026, section 5: one mission timer and a session
-- report. Per-row timers leave the interface (their data and RPCs stay), and
-- each stopped timer on a mission lists the commands its owner ran on that
-- mission and its checklists between start and stop. Time and audit stay
-- separate tables; this is a derived read with no new column and no scoring
-- effect.
--
-- public.timer_session_activity(p_task, p_limit) returns the mission's latest
-- stopped timers (newest first, at most p_limit, 1-100, default 30), each with
-- its owner, start, stop, hours, note and the commands as jsonb
-- [{at, action, recordKind, nodeId, nodeTitle, state, reason}] (at most 100
-- per session, oldest first). Row-level audit lines, recalculations and the
-- time records themselves are left out; a command line already says what was
-- done.
--
-- Visibility follows task_timers (m01_read, can_read_employee_details): the
-- managing director and project engineers read every session, other members
-- their own. Company scoped like activity_feed (migrations 54, 57, 59).
-- ===========================================================================
BEGIN;
SET LOCAL lock_timeout = '120s';

CREATE FUNCTION public.timer_session_activity(p_task uuid, p_limit integer DEFAULT 30)
RETURNS TABLE(timer_id uuid, user_id uuid, started_at timestamptz, stopped_at timestamptz, hours numeric, notes text, events jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  me uuid := auth.uid();
  caller public.user_role := public.get_user_role();
  org uuid := public.current_organization();
  manager boolean;
  lim integer := least(greatest(coalesce(p_limit, 30), 1), 100);
BEGIN
  IF me IS NULL OR caller IS NULL OR org IS NULL THEN
    RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE = '42501';
  END IF;
  IF p_task IS NULL OR NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = p_task AND t.organization_id = org) THEN
    RAISE EXCEPTION 'Mission not found' USING ERRCODE = '22023';
  END IF;
  manager := caller IN ('managing_director', 'project_engineer');

  RETURN QUERY
  SELECT tm.id, tm.user_id, tm.started_at, tm.stopped_at, round(tm.elapsed_seconds / 3600.0, 2), tm.notes,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'at', e.occurred_at, 'action', e.command, 'recordKind', e.table_name,
          'nodeId', e.node_id, 'nodeTitle', n.title,
          'state', e.protected_changes ->> 'state', 'reason', e.protected_changes ->> 'reason')
        ORDER BY e.occurred_at, e.id)
      FROM (
        SELECT a.id, a.occurred_at, a.command, a.table_name, a.protected_changes,
          taskpulse_private.activity_uuid(a.protected_changes ->> 'node_id') AS node_id
        FROM taskpulse_private.audit_events a
        WHERE a.organization_id = org AND a.actor_id = tm.user_id
          AND a.occurred_at >= tm.started_at AND a.occurred_at <= tm.stopped_at
          AND a.command NOT IN ('INSERT', 'UPDATE', 'DELETE') AND a.command NOT LIKE '%refresh%'
          AND a.table_name NOT IN ('task_timers', 'daily_task_logs')
          AND ((a.table_name = 'tasks' AND a.row_id = p_task)
            OR (a.table_name = 'task_checklists' AND EXISTS (
              SELECT 1 FROM public.task_checklists c WHERE c.id = a.row_id AND c.task_id = p_task))
            OR taskpulse_private.activity_uuid(coalesce(a.protected_changes -> 'task_id' ->> 'after',
              a.protected_changes -> 'task_id' ->> 'before', a.protected_changes ->> 'task_id')) = p_task)
        ORDER BY a.occurred_at, a.id
        LIMIT 100) e
      LEFT JOIN public.checklist_nodes n ON n.id = e.node_id), '[]'::jsonb)
  FROM public.task_timers tm
  WHERE tm.task_id = p_task AND tm.organization_id = org
    AND tm.status = 'Stopped' AND tm.stopped_at IS NOT NULL
    AND (manager OR tm.user_id = me)
  ORDER BY tm.started_at DESC, tm.id DESC
  LIMIT lim;
END $$;
REVOKE ALL ON FUNCTION public.timer_session_activity(uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.timer_session_activity(uuid, integer) TO authenticated;

COMMIT;
SELECT taskpulse_private.m15_secure();
