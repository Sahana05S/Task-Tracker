-- ===========================================================================
-- TaskPulse - a Quest is one list of items (forward only)
--
-- User decision (25 October 2026): "I want a quest to only have items. No
-- need for separate setup and stuff." With the recommended answers:
--   1. Existing Quests keep every row and tick: their Setup rows move to the
--      top of the Quest's list and their Closure rows to the end (rows under a
--      row move with it). Quests of archived, Done or Discarded missions are
--      left as they were; their pages still show those rows.
--   2. A Quest's progress is the equal average of its items, which is its own
--      Activity rollup (migration 67) now that every item is there. It is
--      complete when every item is complete or N/A.
--   3. A Quest counts as one row of the section it sits in, as before.
--
-- From now on every row added to, copied into or moved within a Quest's own
-- checklist is filed in its single list (stored as the Activity section, which
-- the rollup reads), and a Quest holds items only: no Quest or Sub-mission
-- inside a Quest. Missions whose Quest changed are recalculated the normal
-- way, so a Quest's new average reaches its mission's Activity progress.
-- ===========================================================================
BEGIN;
SET LOCAL lock_timeout = '120s';

CREATE FUNCTION pg_temp.m77_patch(p_sig text,p_old text,p_new text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE def text:=pg_catalog.pg_get_functiondef(p_sig::regprocedure); BEGIN
 IF (length(def)-length(replace(def,p_old,'')))/length(p_old)<>1 THEN
  RAISE EXCEPTION '% no longer has exactly one "%"; update migration 77',p_sig,left(p_old,120); END IF;
 EXECUTE replace(def,p_old,p_new);
END $$;

-- 1. Quests of open missions, and their missions (recalculated below).
CREATE TEMP TABLE m77_quests ON COMMIT DROP AS
 SELECT c.id checklist_id,c.task_id,t.organization_id,t.task_tag,t.progress_percentage before_progress
 FROM public.task_checklists c JOIN public.tasks t ON t.id=c.task_id
 WHERE c.owner_node_id IS NOT NULL AND t.archived_effective_date IS NULL AND t.status NOT IN ('Done','Discarded')
  AND EXISTS(SELECT 1 FROM public.checklist_nodes n WHERE n.checklist_id=c.id AND n.detail_section IS DISTINCT FROM 'activity');

-- Top-level order: Setup rows, then the Quest's own items, then Closure rows.
UPDATE public.checklist_nodes n SET sort_order=o.position
 FROM (SELECT x.id,(row_number() OVER (PARTITION BY x.checklist_id ORDER BY
   CASE x.detail_section WHEN 'setup' THEN 0 WHEN 'activity' THEN 1 ELSE 2 END,x.sort_order,x.created_at,x.id))::int-1 position
  FROM public.checklist_nodes x JOIN m77_quests q ON q.checklist_id=x.checklist_id WHERE x.parent_node_id IS NULL) o
 WHERE n.id=o.id;
UPDATE public.checklist_nodes n SET detail_section='activity'
 FROM m77_quests q WHERE n.checklist_id=q.checklist_id AND n.detail_section IS DISTINCT FROM 'activity';

-- 2. Rows in a Quest are its items: filed in its single list, never a
-- Sub-mission. Runs before the other row guards (aa_ sorts first).
CREATE FUNCTION taskpulse_private.quest_items_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.task_checklists c WHERE c.id=NEW.checklist_id AND c.owner_node_id IS NOT NULL) THEN RETURN NEW; END IF;
 IF NEW.linked_task_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.linked_task_id IS DISTINCT FROM OLD.linked_task_id) THEN
  RAISE EXCEPTION 'A Quest holds items only; add the Sub-mission to the mission''s own checklist' USING ERRCODE='23514'; END IF;
 -- New and moved rows join the single list; untouched rows of a closed
 -- mission's Quest keep their place.
 IF TG_OP='INSERT' OR NEW.detail_section IS DISTINCT FROM OLD.detail_section THEN NEW.detail_section:='activity'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.quest_items_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER aa_m77_quest_items BEFORE INSERT OR UPDATE OF detail_section,linked_task_id,checklist_id ON public.checklist_nodes
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.quest_items_guard();

-- No Quest inside a Quest.
CREATE FUNCTION taskpulse_private.quest_nesting_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.owner_node_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.owner_node_id IS DISTINCT FROM OLD.owner_node_id)
  AND EXISTS(SELECT 1 FROM public.checklist_nodes n JOIN public.task_checklists p ON p.id=n.checklist_id
   WHERE n.id=NEW.owner_node_id AND p.owner_node_id IS NOT NULL) THEN
  RAISE EXCEPTION 'A Quest holds items only; add the Quest to the mission''s own checklist' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.quest_nesting_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER aa_m77_quest_nesting BEFORE INSERT OR UPDATE OF owner_node_id ON public.task_checklists
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.quest_nesting_guard();

-- The owner-row message no longer mentions sections.
SELECT pg_temp.m77_patch('taskpulse_private.submission_guard()',
 $m$RAISE EXCEPTION 'Open the Quest and add rows to its Setup, Activity or Closure'$m$,
 $m$RAISE EXCEPTION 'Open the Quest and add items to it'$m$);

-- 3. Recalculate the missions whose Quest changed; one that cannot be
-- recalculated today keeps its progress until its next change (as in 66).
DO $$ DECLARE q record; skipped text:=''; moved int; BEGIN
 FOR q IN SELECT DISTINCT task_id,organization_id,task_tag FROM m77_quests ORDER BY task_tag LOOP
  BEGIN
   PERFORM set_config('taskpulse.organization',q.organization_id::text,true);
   PERFORM taskpulse_private.refresh_task_metrics(q.task_id,gen_random_uuid(),(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
  EXCEPTION WHEN others THEN skipped:=skipped||q.task_tag||' ('||SQLERRM||'); ';
  END;
 END LOOP;
 PERFORM set_config('taskpulse.organization','',true);
 SELECT count(*) INTO moved FROM (SELECT DISTINCT task_id,before_progress FROM m77_quests) x JOIN public.tasks t ON t.id=x.task_id
  WHERE t.progress_percentage IS DISTINCT FROM x.before_progress;
 RAISE NOTICE 'Migration 77: % Quests now one list; % missions changed progress',(SELECT count(*) FROM m77_quests),moved;
 IF skipped<>'' THEN RAISE NOTICE 'Migration 77: not recalculated now: %',skipped; END IF;
END $$;

COMMIT;
SELECT taskpulse_private.m15_secure();
