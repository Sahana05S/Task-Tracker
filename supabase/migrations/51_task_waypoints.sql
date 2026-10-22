-- ===========================================================================
-- TaskPulse - M16 recognition: mission waypoints (forward only, after 49;
-- 50 is reserved for the ceremony)
--
-- Waypoints are per-mission progress stages (user decision, 20 October 2026):
-- 30% Ignition, 50% Escape Velocity, 70% Deep Space, 90% Final Approach and
-- 100% Landing. They are recognition only: no points, no performance score.
--
--   * recognition_policy.config gains `waypoints` (the names and thresholds)
--     and reserves `points.waypoint` / `points.landing` at 0 for the Hall of
--     Fame. The TypeScript mirror is DEFAULT_WAYPOINTS.
--   * taskpulse_private.task_waypoints stores each mission's first crossing
--     of each waypoint. Rows are written by triggers on public.tasks, so every
--     progress write path (progress input, logs with deltas, checklist
--     rollups, Task Tools) is covered. A crossing is never deleted when
--     progress later drops; re-crossing is a no-op (ON CONFLICT DO NOTHING).
--     Existing missions are backfilled with source 'backfill', which never
--     counts towards anyone's waypoints.
--   * Nothing here writes performance_observations or input_history, so
--     awards, "as of" reads and month close are untouched.
--   * Reads: recognition_task_waypoints(task_ids) for missions of the
--     caller's company, and recognition_waypoint_counts(from, to, employee)
--     with the visibility rules of recognition_activity_days. Every current
--     assignee of a mission is credited with its waypoints.
-- ===========================================================================
BEGIN;

UPDATE taskpulse_private.recognition_policy
SET config=config
 || jsonb_build_object('waypoints','[{"key":"ignition","label":"Ignition","percent":30},{"key":"escape_velocity","label":"Escape Velocity","percent":50},{"key":"deep_space","label":"Deep Space","percent":70},{"key":"final_approach","label":"Final Approach","percent":90},{"key":"landing","label":"Landing","percent":100}]'::jsonb)
 || jsonb_build_object('points',coalesce(config->'points','{}'::jsonb)||'{"waypoint":0,"landing":0}'::jsonb)
WHERE id AND config->'waypoints' IS NULL;

CREATE TABLE taskpulse_private.task_waypoints (
 task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
 waypoint_key text NOT NULL CHECK(waypoint_key ~ '^[a-z][a-z0-9_]{0,39}$'),
 percent numeric(5,2) NOT NULL CHECK(percent>0 AND percent<=100),
 progress_at numeric(5,2) NOT NULL CHECK(progress_at BETWEEN 0 AND 100),
 reached_at timestamptz NOT NULL DEFAULT now(),
 -- The signed-in account whose save crossed it (NULL for system writes);
 -- an audit stamp like audit_events.actor_id, so no foreign key.
 reached_by uuid,
 source text NOT NULL CHECK(source IN ('progress','insert','backfill')),
 organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
 PRIMARY KEY (task_id,waypoint_key)
);
-- Counts scan one company's recent crossings; backfilled rows never count.
CREATE INDEX task_waypoints_counted ON taskpulse_private.task_waypoints(organization_id,reached_at) WHERE source<>'backfill';
REVOKE ALL ON taskpulse_private.task_waypoints FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO taskpulse_private.m15_tenant_tables(table_schema,table_name) VALUES('taskpulse_private','task_waypoints') ON CONFLICT DO NOTHING;
INSERT INTO taskpulse_private.m15_org_refs(table_schema,table_name,column_name,ref_schema,ref_table)
 VALUES('taskpulse_private','task_waypoints','task_id','public','tasks') ON CONFLICT DO NOTHING;

-- The policy's valid waypoints with p_above < percent <= p_upto, first entry per
-- key (malformed entries are ignored). (0,100) is the whole list.
CREATE FUNCTION taskpulse_private.waypoints_between(p_above numeric,p_upto numeric) RETURNS TABLE(waypoint_key text,label text,percent numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT DISTINCT ON (w.key) w.key,coalesce(nullif(btrim(w.label),''),w.key),w.percent
 FROM taskpulse_private.recognition_policy p
 CROSS JOIN LATERAL ROWS FROM (jsonb_to_recordset(CASE WHEN jsonb_typeof(p.config->'waypoints')='array' THEN p.config->'waypoints' ELSE '[]'::jsonb END)
  AS (key text,label text,percent numeric)) WITH ORDINALITY AS w(key,label,percent,ord)
 WHERE p.id AND w.key ~ '^[a-z][a-z0-9_]{0,39}$' AND w.percent>0 AND w.percent<=100 AND w.percent>p_above AND w.percent<=p_upto
 ORDER BY w.key,w.ord;
$$;
REVOKE ALL ON FUNCTION taskpulse_private.waypoints_between(numeric,numeric) FROM PUBLIC,anon,authenticated,service_role;

-- Only thresholds this write newly passes; a re-crossing after a drop hits ON CONFLICT.
CREATE FUNCTION taskpulse_private.record_task_waypoints() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 INSERT INTO taskpulse_private.task_waypoints(task_id,waypoint_key,percent,progress_at,reached_by,source,organization_id)
 SELECT NEW.id,w.waypoint_key,w.percent,NEW.progress_percentage,auth.uid(),CASE TG_OP WHEN 'INSERT' THEN 'insert' ELSE 'progress' END,NEW.organization_id
 FROM taskpulse_private.waypoints_between(CASE TG_OP WHEN 'UPDATE' THEN coalesce(OLD.progress_percentage,0) ELSE 0 END,NEW.progress_percentage) w
 ON CONFLICT (task_id,waypoint_key) DO NOTHING;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.record_task_waypoints() FROM PUBLIC,anon,authenticated,service_role;

-- Backfill before the triggers exist: current progress, no actor, never counted.
INSERT INTO taskpulse_private.task_waypoints(task_id,waypoint_key,percent,progress_at,reached_by,source,organization_id)
SELECT t.id,w.waypoint_key,w.percent,t.progress_percentage,NULL,'backfill',t.organization_id
FROM public.tasks t CROSS JOIN LATERAL taskpulse_private.waypoints_between(0,t.progress_percentage) w
WHERE t.progress_percentage>0
ON CONFLICT (task_id,waypoint_key) DO NOTHING;

-- Two triggers so each can carry its own WHEN guard: an update fires only when
-- progress actually rises (IS DISTINCT FROM, then upward), so unrelated task
-- writes and bulk Done on finished missions cost nothing.
CREATE TRIGGER zz_m16_task_waypoints_insert AFTER INSERT ON public.tasks FOR EACH ROW
 WHEN (NEW.progress_percentage>0) EXECUTE FUNCTION taskpulse_private.record_task_waypoints();
CREATE TRIGGER zz_m16_task_waypoints_progress AFTER UPDATE OF progress_percentage ON public.tasks FOR EACH ROW
 WHEN (NEW.progress_percentage IS DISTINCT FROM OLD.progress_percentage AND NEW.progress_percentage>coalesce(OLD.progress_percentage,0))
 EXECUTE FUNCTION taskpulse_private.record_task_waypoints();

-- The policy's waypoints and the crossings of the named missions in the
-- caller's company (missions without any are left out). Missions are readable
-- by every active member of the company, so their waypoints are too; who saved
-- is reduced to "was it you" for the celebration.
CREATE FUNCTION public.recognition_task_waypoints(p_task_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;me uuid:=auth.uid();waypoints jsonb;tasks jsonb; BEGIN
 IF public.get_user_role() IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_task_ids IS NULL OR cardinality(p_task_ids)>500 THEN RAISE EXCEPTION 'Between 0 and 500 missions required' USING ERRCODE='23514'; END IF;
 org:=public.current_organization();
 SELECT coalesce(jsonb_agg(jsonb_build_object('key',w.waypoint_key,'label',w.label,'percent',w.percent) ORDER BY w.percent,w.waypoint_key),'[]'::jsonb)
 INTO waypoints FROM taskpulse_private.waypoints_between(0,100) w;
 SELECT coalesce(jsonb_agg(jsonb_build_object('taskId',x.task_id,'reached',x.reached) ORDER BY x.task_id),'[]'::jsonb) INTO tasks
 FROM (SELECT w.task_id,jsonb_agg(jsonb_build_object('key',w.waypoint_key,'percent',w.percent,'reachedAt',w.reached_at,'source',w.source,'mine',coalesce(w.reached_by=me,false)) ORDER BY w.percent,w.waypoint_key) AS reached
  FROM taskpulse_private.task_waypoints w
  WHERE w.task_id=ANY(p_task_ids) AND w.organization_id=org
  GROUP BY w.task_id) x;
 RETURN jsonb_build_object('waypoints',waypoints,'tasks',tasks);
END $$;
REVOKE ALL ON FUNCTION public.recognition_task_waypoints(uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.recognition_task_waypoints(uuid[]) TO authenticated;

-- Waypoints reached per member between two Asia/Kolkata dates (inclusive).
-- Same visibility as recognition_activity_days: members read themselves;
-- managing directors and project engineers read any member or everyone.
CREATE FUNCTION public.recognition_waypoint_counts(p_from date,p_to date,p_employee uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;role text;manager boolean;focus uuid;members jsonb; BEGIN
 role:=public.get_user_role();
 IF role IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 org:=public.current_organization();
 manager:=role IN ('managing_director','project_engineer');
 IF p_employee IS NOT NULL AND p_employee<>auth.uid() AND NOT manager THEN
  RAISE EXCEPTION 'Own waypoints or manager authority required' USING ERRCODE='42501';
 END IF;
 IF p_employee IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_employee AND u.is_active AND u.organization_id=org) THEN
  RAISE EXCEPTION 'Active member of your company required' USING ERRCODE='42501';
 END IF;
 IF p_from IS NULL OR p_to IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to) OR p_from>p_to OR p_to-p_from>400 THEN
  RAISE EXCEPTION 'A date range of at most 401 days required' USING ERRCODE='23514';
 END IF;
 -- One member's count (a named member, or a member reading themselves) only
 -- looks at missions that member is on.
 focus:=coalesce(p_employee,CASE WHEN manager THEN NULL ELSE auth.uid() END);
 WITH people AS (
  SELECT u.id FROM public.users u
  WHERE u.is_active AND u.organization_id=org
   AND (u.id=coalesce(p_employee,CASE WHEN manager THEN u.id ELSE auth.uid() END))),
 reached AS (
  SELECT w.task_id,w.waypoint_key FROM taskpulse_private.task_waypoints w
  WHERE w.organization_id=org AND w.source<>'backfill'
   AND w.reached_at>=(p_from::timestamp AT TIME ZONE 'Asia/Kolkata')
   AND w.reached_at<((p_to+1)::timestamp AT TIME ZONE 'Asia/Kolkata')
   AND (focus IS NULL OR EXISTS(SELECT 1 FROM public.tasks t WHERE t.id=w.task_id AND t.assignee_id=focus)
        OR EXISTS(SELECT 1 FROM public.task_assignees a WHERE a.task_id=w.task_id AND a.user_id=focus))),
 credited AS (
  SELECT DISTINCT r.task_id,r.waypoint_key,x.user_id
  FROM reached r JOIN public.tasks t ON t.id=r.task_id
  CROSS JOIN LATERAL (SELECT t.assignee_id UNION SELECT a.user_id FROM public.task_assignees a WHERE a.task_id=t.id) x(user_id)),
 per_key AS (
  SELECT c.user_id,c.waypoint_key,count(*) AS n FROM credited c JOIN people p ON p.id=c.user_id GROUP BY c.user_id,c.waypoint_key)
 SELECT coalesce(jsonb_agg(jsonb_build_object('userId',p.id,'total',coalesce(k.total,0),'byKey',coalesce(k.by_key,'{}'::jsonb)) ORDER BY p.id),'[]'::jsonb) INTO members
 FROM people p
 LEFT JOIN (SELECT user_id,sum(n)::integer AS total,jsonb_object_agg(waypoint_key,n) AS by_key FROM per_key GROUP BY user_id) k ON k.user_id=p.id;
 RETURN jsonb_build_object('from',p_from,'to',p_to,'timezone','Asia/Kolkata','members',members);
END $$;
REVOKE ALL ON FUNCTION public.recognition_waypoint_counts(date,date,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.recognition_waypoint_counts(date,date,uuid) TO authenticated;

SELECT taskpulse_private.m15_secure();
COMMIT;
