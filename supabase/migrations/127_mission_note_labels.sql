-- ===========================================================================
-- TaskPulse - A mission carries its notes' hashtags (forward only; 6 November 2026)
--
-- User decision (6 November 2026): the mission's own Labels panel goes; a
-- mission carries the hashtags of its notes instead, so there is one place
-- to type a hashtag on a mission page (the Notes panel).
--
-- public.labels_for('task', ids) now returns, per mission, its own label
-- links (kept: nothing is deleted, older missions keep theirs) together with
-- the hashtags on its active notes (its own and its Quests' and objectives'),
-- each label once. A note's hashtags count only for callers who may read the
-- note (label_subject_readable: can_read_mission_work, migration 117), so the
-- privacy of notes is unchanged. Other kinds read exactly as before.
--
-- Every reader of a mission's labels follows: the chips on Missions cards and
-- rows, the Missions Labels filter, the mission page header, Today's list and
-- map. Labels still feed no score (D14). Body from 112 (never patched since).
-- ===========================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.labels_for(p_kind text,p_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM taskpulse_private.label_require_member();
 IF p_kind IS NULL OR p_kind NOT IN ('task','mission_learning','meeting_point') THEN
  RAISE EXCEPTION 'Unknown labelled record kind' USING ERRCODE='22023'; END IF;
 IF coalesce(array_length(p_ids,1),0)>1000 THEN RAISE EXCEPTION 'At most 1000 records per call' USING ERRCODE='22023'; END IF;
 RETURN coalesce((SELECT jsonb_object_agg(s.subject_id,s.labels) FROM (
   SELECT x.subject_id,jsonb_agg(taskpulse_private.label_json(l) ORDER BY lower(l.name)) AS labels
   FROM (
    -- The record's own labels.
    SELECT k.subject_id,k.label_id
    FROM public.label_links k
    WHERE k.subject_kind=p_kind AND k.subject_id=ANY(coalesce(p_ids,'{}'))
     AND taskpulse_private.label_subject_readable(k.subject_kind,k.subject_id)
    UNION
    -- A mission also carries the hashtags of its readable notes (127).
    SELECT m.task_id,k.label_id
    FROM public.mission_learnings m
    JOIN public.label_links k ON k.subject_kind='mission_learning' AND k.subject_id=m.id
    WHERE p_kind='task' AND m.task_id=ANY(coalesce(p_ids,'{}')) AND m.record_state='active'
     AND taskpulse_private.label_subject_readable('mission_learning',m.id)
   ) x
   JOIN public.labels l ON l.id=x.label_id AND l.archived_at IS NULL
    AND l.organization_id=public.current_organization()
   GROUP BY x.subject_id) s),'{}'::jsonb);
END $$;

COMMIT;
SELECT taskpulse_private.m15_secure();
