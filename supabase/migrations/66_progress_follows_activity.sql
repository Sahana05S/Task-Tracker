-- Migration 66: a mission with a checklist always takes its progress from
-- Activity (user decision, 23 October 2026).
--
-- Before this, task_checklists.sync_progress_to_task defaulted to false, so a
-- mission kept the progress typed by hand until a manager switched Activity on.
-- Ticking or adding rows then moved only the "Activity checklist" figure, not
-- the mission's progress (a mission at 100% stayed at 100% after new rows).
--
-- 1. Every root checklist follows Activity. A trigger keeps it that way for new
--    checklists (create, native initialisation, task-tool copies) and refuses
--    to switch it off. Credit anchors start at the mission's current progress,
--    which is the level already credited.
-- 2. refresh_task_metrics no longer refuses a change it cannot credit (no scale,
--    no measured anchor, or legacy shares with a non-zero change). Progress
--    still follows Activity; the credit waits, with the anchor kept, until the
--    scale and shares are reconciled, and is then given in one step.
-- 3. An Activity section with nothing applicable (taskProgress NULL) leaves the
--    mission's progress as it was instead of clearing it.
-- 4. Open missions are brought to their Activity figure now, with credit given
--    or reversed from their current progress, dated today. Closed periods and
--    month snapshots are not touched. Done/Discarded missions switch over but
--    are not recalculated until reopened. Archived missions are left alone.
--
-- Setup and Closure still only gate Done; the scoring rule is unchanged.

BEGIN;
SET LOCAL lock_timeout = '120s';

CREATE FUNCTION pg_temp.m66_patch(p_sig text,p_old text,p_new text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(p_sig::regprocedure); BEGIN
 IF (length(def)-length(replace(def,p_old,'')))/length(p_old)<>1 THEN
  RAISE EXCEPTION '% no longer has exactly one "%"; update migration 66',p_sig,left(p_old,120); END IF;
 EXECUTE replace(def,p_old,p_new);
END $$;
-- Two replacements in one rebuild, for an IF opened by one and closed by the other.
CREATE FUNCTION pg_temp.m66_patch2(p_sig text,p_old1 text,p_new1 text,p_old2 text,p_new2 text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(p_sig::regprocedure); BEGIN
 IF (length(def)-length(replace(def,p_old1,'')))/length(p_old1)<>1 OR (length(def)-length(replace(def,p_old2,'')))/length(p_old2)<>1 THEN
  RAISE EXCEPTION '% no longer has exactly one of the two fragments; update migration 66',p_sig; END IF;
 EXECUTE replace(replace(def,p_old1,p_new1),p_old2,p_new2);
END $$;

-- 1. Always follow Activity.
CREATE FUNCTION taskpulse_private.checklist_follows_activity() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.owner_node_id IS NOT NULL THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  NEW.credit_anchor:=coalesce(NEW.credit_anchor,(SELECT t.progress_percentage FROM public.tasks t WHERE t.id=NEW.task_id),0);
 END IF;
 NEW.sync_progress_to_task:=true;
 RETURN NEW;
END $$;
CREATE TRIGGER aa_m66_follow_activity BEFORE INSERT OR UPDATE ON public.task_checklists
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.checklist_follows_activity();

SELECT pg_temp.m66_patch('public.checklist_command(uuid,text,jsonb,bigint,uuid)',
 $m$enabled:=(p_payload->>'enabled')::boolean;$m$,
 $m$enabled:=(p_payload->>'enabled')::boolean; IF NOT enabled THEN RAISE EXCEPTION 'A mission with a checklist always takes its progress from Activity' USING ERRCODE='23514'; END IF;$m$);

-- 2 and 3. Follow Activity even when the credit has to wait.
SELECT pg_temp.m66_patch('taskpulse_private.refresh_task_metrics(uuid,uuid,date)',
 $m$IF progress IS DISTINCT FROM t.progress_percentage THEN$m$,
 $m$IF progress IS NOT NULL AND progress IS DISTINCT FROM t.progress_percentage THEN$m$);
SELECT pg_temp.m66_patch('taskpulse_private.refresh_task_metrics(uuid,uuid,date)',
 $m$IF progress IS NOT NULL AND (delta IS NULL OR (delta<>0 AND t.participant_credit_mode='legacy')) THEN RAISE EXCEPTION 'Checklist credit needs a measured baseline, scale and approved participant shares; reconcile before saving' USING ERRCODE='23514'; END IF;$m$,
 $m$IF delta IS NULL OR (delta<>0 AND t.participant_credit_mode='legacy') THEN delta:=NULL; END IF;$m$);
SELECT pg_temp.m66_patch2('taskpulse_private.refresh_task_metrics(uuid,uuid,date)',
 $m$PERFORM taskpulse_private.apply_credit(tid,coalesce(delta,0),shares,t.assignee_id);$m$,
 $m$IF delta IS NOT NULL THEN PERFORM taskpulse_private.apply_credit(tid,delta,shares,t.assignee_id);$m$,
 $m$VALUES(tid,p_operation,c.credit_anchor,progress,t.task_scale,t.scale_version,t.participant_version,shares,coalesce(delta,0),'prospective_rollup');$m$,
 $m$VALUES(tid,p_operation,c.credit_anchor,progress,t.task_scale,t.scale_version,t.participant_version,shares,delta,'prospective_rollup'); END IF;$m$);
SELECT pg_temp.m66_patch('taskpulse_private.refresh_task_metrics(uuid,uuid,date)',
 $m$UPDATE public.task_checklists SET credit_anchor=coalesce(progress,credit_anchor) WHERE id=c.id;$m$,
 $m$IF delta IS NOT NULL THEN UPDATE public.task_checklists SET credit_anchor=progress WHERE id=c.id; END IF;$m$);

-- 4. Switch existing checklists. Anchors start at current (credited) progress.
CREATE TEMP TABLE m66_before ON COMMIT DROP AS
 SELECT t.id task_id,t.task_tag,t.organization_id,t.status,t.progress_percentage before_progress
 FROM public.tasks t JOIN public.task_checklists c ON c.task_id=t.id AND c.owner_node_id IS NULL
 WHERE NOT c.sync_progress_to_task AND t.archived_effective_date IS NULL;

ALTER TABLE public.task_checklists DISABLE TRIGGER m03_invalidate_structure_review;
ALTER TABLE public.task_checklists DISABLE TRIGGER zz_m11_checklist;
UPDATE public.task_checklists c SET sync_progress_to_task=true,credit_anchor=coalesce(t.progress_percentage,0)
 FROM m66_before b JOIN public.tasks t ON t.id=b.task_id WHERE c.task_id=b.task_id AND c.owner_node_id IS NULL;
ALTER TABLE public.task_checklists ENABLE TRIGGER m03_invalidate_structure_review;
ALTER TABLE public.task_checklists ENABLE TRIGGER zz_m11_checklist;

-- Recalculate open missions one by one; one that cannot be recalculated today
-- (for example a closed date) keeps its progress until its next change.
DO $$ DECLARE b record; skipped text:=''; moved int:=0; BEGIN
 FOR b IN SELECT * FROM m66_before WHERE status NOT IN ('Done','Discarded') ORDER BY task_tag LOOP
  BEGIN
   PERFORM set_config('taskpulse.organization',b.organization_id::text,true);
   PERFORM taskpulse_private.refresh_task_metrics(b.task_id,gen_random_uuid(),(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
  EXCEPTION WHEN others THEN skipped:=skipped||b.task_tag||' ('||SQLERRM||'); ';
  END;
 END LOOP;
 PERFORM set_config('taskpulse.organization','',true);
 SELECT count(*) INTO moved FROM m66_before b JOIN public.tasks t ON t.id=b.task_id WHERE t.progress_percentage IS DISTINCT FROM b.before_progress;
 RAISE NOTICE 'Migration 66: % checklists now follow Activity; % missions changed progress', (SELECT count(*) FROM m66_before), moved;
 IF skipped<>'' THEN RAISE NOTICE 'Migration 66: not recalculated now: %', skipped; END IF;
END $$;

COMMIT;
SELECT taskpulse_private.m15_secure();
