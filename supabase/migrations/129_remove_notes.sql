-- ===========================================================================
-- TaskPulse - Notes removed; labels stay (forward only; 6 November 2026)
--
-- User decision (6 November 2026): "I do not want notes at all, I only want
-- labels", and existing notes and the starter hashtags are to be deleted.
--
-- 1. Every note is deleted: its label links, then the notes themselves
--    (public.mission_learnings, active and withdrawn). Their past activity
--    lines stay in the audit (they never held the note's text, 126).
-- 2. The 26 starter hashtags migration 126 created (#mistake #learning #idea
--    #decision #risk #blocker #followup and the topics, causes and impact) are
--    deleted in every company, with every link to them (missions and meeting
--    points included). Labels the company made itself are untouched.
-- 3. Notes can no longer be written: mission_note_command and the older
--    mission_learning_command are revoked from every caller. The reads stay
--    (they return nothing) so older pages degrade quietly.
-- 4. labels_for('task') returns only a mission's own labels again (the 112
--    body; 127 had added its notes' hashtags).
-- No scoring, award or permission change beyond the revoked note commands.
-- ===========================================================================
BEGIN;

-- 1. Notes ----------------------------------------------------------------------
DO $$ DECLARE links integer; notes integer; BEGIN
 DELETE FROM public.label_links WHERE subject_kind='mission_learning';
 GET DIAGNOSTICS links=ROW_COUNT;
 DELETE FROM public.mission_learnings;
 GET DIAGNOSTICS notes=ROW_COUNT;
 RAISE NOTICE 'Notes removed: % notes and % hashtag links deleted', notes, links;
END $$;

-- 2. Starter hashtags -------------------------------------------------------------
DO $$ DECLARE links integer; labels integer;
 starters text[]:=ARRAY['mistake','learning','idea','decision','risk','blocker','followup','client','vendor','approval',
  'government','site','design','drawing','estimate','payment','documentation','communication','delay','rework',
  'missinginfo','quality','budget','critical','minor','repeat'];
BEGIN
 DELETE FROM public.label_links k USING public.labels l WHERE l.id=k.label_id AND l.slug=ANY(starters);
 GET DIAGNOSTICS links=ROW_COUNT;
 DELETE FROM public.labels WHERE slug=ANY(starters);
 GET DIAGNOSTICS labels=ROW_COUNT;
 RAISE NOTICE 'Starter hashtags removed: % labels and % links deleted', labels, links;
END $$;

-- 3. No more notes ----------------------------------------------------------------
REVOKE ALL ON FUNCTION public.mission_note_command(text,uuid,uuid,uuid,text,uuid[],text[],uuid),
 public.mission_learning_command(text,uuid,uuid,text,text,uuid)
 FROM PUBLIC,anon,authenticated,service_role;

-- 4. A mission's labels are its own (body from 112) ---------------------------------
CREATE OR REPLACE FUNCTION public.labels_for(p_kind text,p_ids uuid[]) RETURNS jsonb
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

COMMIT;
SELECT taskpulse_private.m15_secure();
