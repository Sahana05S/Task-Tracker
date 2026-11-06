-- ===========================================================================
-- TaskPulse - Activity lines say exactly what changed (forward only; 6 November 2026)
--
-- User request (6 November 2026): Team > Activity said only "Added a
-- checklist objective"; it should name the objective and show what changed.
--
-- 1. checklist_command keeps the row's title in its audit row (node_before /
--    node_after gain 'title'), so an added, renamed, ticked or removed
--    objective or Quest is named even after it is renamed or removed. An
--    edit (rename, move, link) no longer requires a reason: the row menu
--    stopped asking for one (user decision, 6 November 2026).
-- 2. A note's text is never copied into the audit (126: a deleted note leaves
--    no copy behind); its lines keep their hashtags and where it was written.
-- 3. activity_feed (Team > Activity) returns two more columns:
--    detail  - what the line is about: the objective or Quest's title (stored
--              from now on; the live title for older lines), or the Quest or
--              objective a note was written on;
--    changes - before -> after values: the mission's changed fields on an edit
--              (title, dates, category, scale ...), status / progress / scale /
--              priority on a lifecycle command, and an objective's new title or
--              tick.
--    (A copy's "(copy)" title is not a rename: only an edit lists a title change.)
--    Both are given only to callers who may read the mission's work
--    (can_read_mission_work, migration 117); anyone else gets the line as
--    before. The return type changes, so the function is dropped and
--    re-created from its live definition (111+116+120+124) with these
--    additions, and its grants are restored.
-- 4. mission_activity (the mission's History tab) prefers the stored title,
--    and lists an objective's title and tick change.
--
-- Every function is patched from its live definition; each fragment must
-- occur exactly once. No scoring, award or data change; the only rule change
-- is the optional edit reason above.
-- ===========================================================================
BEGIN;

CREATE FUNCTION pg_temp.m128_patch(def text, fn text, frag text, repl text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
 IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
  RAISE EXCEPTION '% does not contain this fragment exactly once; update migration 128: %',fn,left(frag,80); END IF;
 RETURN replace(def,frag,repl);
END $$;

CREATE FUNCTION pg_temp.m128_apply(fn regprocedure, frag text, repl text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
 EXECUTE pg_temp.m128_patch(pg_catalog.pg_get_functiondef(fn),fn::text,frag,repl);
END $$;

-- 1. Checklist commands keep the row's title -----------------------------------
SELECT pg_temp.m128_apply('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $f$'node_before',jsonb_build_object('id',n.id,$f$,
 $f$'node_before',jsonb_build_object('id',n.id,'title',n.title,$f$);
SELECT pg_temp.m128_apply('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $f$'node_after',(SELECT jsonb_build_object('id',x.id,$f$,
 $f$'node_after',(SELECT jsonb_build_object('id',x.id,'title',x.title,$f$);

-- ... and an edit, move or link no longer needs a reason (user decision, 6 November 2026: the row
-- menu has no reason box; a removal still sends the row's title as its reason).
SELECT pg_temp.m128_apply('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $f$IF change_reason IS NULL THEN RAISE EXCEPTION 'Structure correction needs a reason' USING ERRCODE='23514'; END IF;$f$,
 $f$NULL; /* 128: no reason is needed to edit, move or link a row */$f$);

-- 3. Team > Activity returns the detail and the before -> after values ----------
DO $do$
DECLARE
 fn text:='public.activity_feed(date,date,text,uuid,jsonb,integer)';
 def text:=pg_catalog.pg_get_functiondef(fn::regprocedure);
BEGIN
 def:=pg_temp.m128_patch(def,fn,'reason text, period date)','reason text, period date, detail text, changes jsonb)');
 -- The audit lines: what the line is about, and its before -> after values.
 def:=pg_temp.m128_patch(def,fn,
  $f$a.protected_changes ->> 'reason' AS reason, NULL::date AS period
    FROM taskpulse_private.audit_events a$f$,
  $f$a.protected_changes ->> 'reason' AS reason, NULL::date AS period,
      CASE WHEN a.table_name = 'task_checklists' THEN coalesce(a.protected_changes -> 'node_after' ->> 'title',
          a.protected_changes -> 'node_before' ->> 'title', cn.title::text)
        WHEN a.table_name = 'mission_learnings' THEN a.protected_changes ->> 'node_title'
      END AS detail,
      CASE WHEN a.command IN ('INSERT', 'DELETE') THEN NULL
        WHEN a.command = 'UPDATE' THEN
          (SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each(a.protected_changes) e
            WHERE e.key = ANY (ARRAY['status', 'priority', 'title', 'category', 'assigned_date', 'due_date', 'completed_date',
              'task_scale', 'scale_override', 'archived_effective_date', 'review_approved', 'share_units'])
              AND jsonb_typeof(e.value) = 'object')
        WHEN a.table_name = 'tasks' AND jsonb_typeof(a.protected_changes -> 'before') = 'object'
          AND jsonb_typeof(a.protected_changes -> 'after') = 'object' THEN
          (SELECT jsonb_object_agg(k, jsonb_build_object('before', a.protected_changes -> 'before' -> k, 'after', a.protected_changes -> 'after' -> k))
            FROM unnest(ARRAY['status', 'progress', 'scale', 'priority']) k
            WHERE a.protected_changes -> 'after' ? k
              AND (a.protected_changes -> 'before' -> k) IS DISTINCT FROM (a.protected_changes -> 'after' -> k))
        WHEN a.table_name = 'task_checklists' THEN
          nullif(jsonb_strip_nulls(jsonb_build_object(
            'title', CASE WHEN a.command = 'checklist_edit' AND a.protected_changes -> 'node_before' ->> 'title' <> a.protected_changes -> 'node_after' ->> 'title'
              THEN jsonb_build_object('before', a.protected_changes -> 'node_before' -> 'title', 'after', a.protected_changes -> 'node_after' -> 'title') END,
            'state', CASE WHEN a.command = 'checklist_state' AND a.protected_changes -> 'node_before' ->> 'state' <> a.protected_changes -> 'node_after' ->> 'state'
              THEN jsonb_build_object('before', a.protected_changes -> 'node_before' -> 'state', 'after', a.protected_changes -> 'node_after' -> 'state') END)),
            '{}'::jsonb)
      END AS changes
    FROM taskpulse_private.audit_events a$f$);
 def:=pg_temp.m128_patch(def,fn,
  $f$LEFT JOIN public.task_checklists c ON a.table_name = 'task_checklists' AND c.id = a.row_id$f$,
  $f$LEFT JOIN public.task_checklists c ON a.table_name = 'task_checklists' AND c.id = a.row_id
    -- Lines written before 128 name the row by its current title.
    LEFT JOIN public.checklist_nodes cn ON a.table_name = 'task_checklists'
      AND cn.id = taskpulse_private.activity_uuid(coalesce(a.protected_changes ->> 'node_id', a.protected_changes -> 'node_after' ->> 'id'))$f$);
 -- The other sources have neither.
 def:=pg_temp.m128_patch(def,fn,'h.record_id, NULL::text[] AS fields, h.reason, NULL::date AS period',
  'h.record_id, NULL::text[] AS fields, h.reason, NULL::date AS period, NULL::text AS detail, NULL::jsonb AS changes');
 def:=pg_temp.m128_patch(def,fn,'r.log_id AS record_id, NULL::text[] AS fields, r.reason, NULL::date AS period',
  'r.log_id AS record_id, NULL::text[] AS fields, r.reason, NULL::date AS period, NULL::text AS detail, NULL::jsonb AS changes');
 def:=pg_temp.m128_patch(def,fn,'::date END AS period',
  '::date END AS period, NULL::text AS detail, NULL::jsonb AS changes');
 -- Only those who may read the mission's work see what was written in it (117).
 def:=pg_temp.m128_patch(def,fn,'f.fields, f.reason, f.period',
  $f$f.fields, f.reason, f.period,
    CASE WHEN f.task_id IS NULL OR taskpulse_private.can_read_mission_work(f.task_id) THEN f.detail END,
    CASE WHEN f.task_id IS NULL OR taskpulse_private.can_read_mission_work(f.task_id) THEN f.changes END$f$);
 DROP FUNCTION public.activity_feed(date, date, text, uuid, jsonb, integer);
 EXECUTE def;
END $do$;
REVOKE ALL ON FUNCTION public.activity_feed(date, date, text, uuid, jsonb, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activity_feed(date, date, text, uuid, jsonb, integer) TO authenticated;

-- 4. A mission's History names the row as it was, and shows title and tick changes
SELECT pg_temp.m128_apply('public.mission_activity(uuid,jsonb,integer)',
 $f$coalesce(n.title::text, l.pc ->> 'file_name', l.pc ->> 'node_title',$f$,
 $f$coalesce(l.pc -> 'node_after' ->> 'title', l.pc -> 'node_before' ->> 'title', n.title::text, l.pc ->> 'file_name', l.pc ->> 'node_title',$f$);
SELECT pg_temp.m128_apply('public.mission_activity(uuid,jsonb,integer)',
 $f$        WHERE l.pc -> 'after' ? k AND (l.pc -> 'before' -> k) IS DISTINCT FROM (l.pc -> 'after' -> k))
    END,$f$,
 $f$        WHERE l.pc -> 'after' ? k AND (l.pc -> 'before' -> k) IS DISTINCT FROM (l.pc -> 'after' -> k))
    WHEN l.tbl = 'task_checklists' THEN
      -- An objective's new title or tick (128).
      nullif(jsonb_strip_nulls(jsonb_build_object(
        'title', CASE WHEN l.command = 'checklist_edit' AND l.pc -> 'node_before' ->> 'title' <> l.pc -> 'node_after' ->> 'title'
          THEN jsonb_build_object('before', l.pc -> 'node_before' -> 'title', 'after', l.pc -> 'node_after' -> 'title') END,
        'state', CASE WHEN l.command = 'checklist_state' AND l.pc -> 'node_before' ->> 'state' <> l.pc -> 'node_after' ->> 'state'
          THEN jsonb_build_object('before', l.pc -> 'node_before' -> 'state', 'after', l.pc -> 'node_after' -> 'state') END)),
        '{}'::jsonb)
    END,$f$);

COMMIT;
SELECT taskpulse_private.m15_secure();
