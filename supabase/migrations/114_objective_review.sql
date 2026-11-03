-- ===========================================================================
-- 114: objective review and "Work needed" (Stellar update plan, 3 November 2026,
-- section 6; user decisions D-D2, and the accepted defaults D-D1, D-D3, D06).
--
-- Each objective (a checklist row ticked Yes / No / N/A) now carries its own
-- review, beside the mission-level approval that stays the last step:
--
--   review_state  none | pending | acknowledged | work_needed
--   reviewed_by, reviewed_at, review_note
--
-- * Ticking Yes leaves the objective pending when the mission has a Primary or
--   Secondary reviewer, otherwise none; any later tick change resets it the same
--   way (trigger zz_m114_review_follows_tick). Existing rows start as none, so
--   no open mission is held up by this migration.
-- * checklist_command('review', {node_id, decision, note}) lets the managing
--   director, project engineers and the mission's Primary / Secondary reviewers
--   (not Observers) acknowledge a pending objective or send it back. Nobody
--   decides their own tick (D-D1). Work needed needs a note and puts the tick
--   back to No through the same update the state command makes, so progress and
--   credit move by the ordinary change (D06: no new scoring rule). Acknowledged
--   changes no progress. The mission version check stops two reviewers deciding
--   at once; a decided objective waits for its next Yes.
-- * Every decision is an audit_events row (command 'checklist_review', the
--   decision and note in its reason), which the activity feed shows. No second
--   history table.
-- * assert_checklist_done refuses Done while any objective is pending or has
--   work needed (D-D2).
-- * Reviewers hear about ticks waiting for them once per mission per day; the
--   mission's assignees and the person who ticked hear about Work needed
--   (taskpulse_private.notify).
-- * D-D3: a new time log no longer clears the mission's approvals (trigger
--   m03_invalidate_log_review dropped); checklist and detail changes still do.
-- * public.checklist_reviews(task) reads the reviews that are not none and
--   whether the viewer may decide.
-- ===========================================================================
BEGIN;

ALTER TABLE public.checklist_nodes
  ADD COLUMN review_state text NOT NULL DEFAULT 'none',
  ADD COLUMN reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN review_note text,
  ADD CONSTRAINT checklist_nodes_review_state_check CHECK (review_state IN ('none','pending','acknowledged','work_needed')),
  ADD CONSTRAINT checklist_nodes_review_note_check CHECK (review_note IS NULL OR length(review_note)<=1000),
  ADD CONSTRAINT checklist_nodes_work_needed_note CHECK (review_state<>'work_needed' OR review_note IS NOT NULL);
CREATE INDEX checklist_nodes_review_open_idx ON public.checklist_nodes(checklist_id) WHERE review_state IN ('pending','work_needed');

-- Any tick change sets the review again: Yes waits for a reviewer when the mission
-- has a Primary or Secondary one; anything else clears it. The review command marks
-- its own update (taskpulse.checklist_review) so Work needed keeps its decision.
CREATE FUNCTION taskpulse_private.checklist_review_follows_tick()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF NEW.completion_state IS NOT DISTINCT FROM OLD.completion_state THEN RETURN NEW; END IF;
 IF current_setting('taskpulse.checklist_review',true)=NEW.id::text THEN RETURN NEW; END IF;
 NEW.review_state:=CASE WHEN NEW.completion_state='Yes' AND NEW.linked_task_id IS NULL AND EXISTS(
   SELECT 1 FROM public.task_checklists c JOIN public.task_reviewers r ON r.task_id=c.task_id JOIN public.users u ON u.id=r.user_id AND u.is_active
   WHERE c.id=NEW.checklist_id AND r.reviewer_role IN ('Primary','Secondary')) THEN 'pending' ELSE 'none' END;
 NEW.reviewed_by:=NULL; NEW.reviewed_at:=NULL; NEW.review_note:=NULL;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION taskpulse_private.checklist_review_follows_tick() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_m114_review_follows_tick BEFORE UPDATE ON public.checklist_nodes
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.checklist_review_follows_tick();

-- D-D3: per-objective review replaces "every log clears the mission approval".
DROP TRIGGER IF EXISTS m03_invalidate_log_review ON public.daily_task_logs;

-- checklist_command: rewritten from the live definition (pg_get_functiondef).
CREATE OR REPLACE FUNCTION public.checklist_command(p_task uuid, p_command text, p_payload jsonb, p_expected_version bigint, p_operation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid:=auth.uid(); role public.user_role; t public.tasks; c public.task_checklists; n public.checklist_nodes; receipt taskpulse_private.command_receipts; request jsonb:=jsonb_build_array(p_task,p_command,p_payload,p_expected_version); result jsonb; node_id uuid; section_role text; change_reason text; before_state jsonb; rollup jsonb; enabled boolean; owned_id uuid; copy_row record; neighbour uuid; BEGIN
 SELECT u.role INTO role FROM public.users u WHERE u.id=actor AND u.is_active FOR SHARE;
 IF role IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_command='section' THEN RAISE EXCEPTION 'Section reviews were retired; an empty section is N/A' USING ERRCODE='23514'; END IF;
 IF p_operation IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_command IS NULL OR p_command NOT IN ('create','add','state','edit','map','delete','section','mode','duplicate','submission','reorder','review') THEN RAISE EXCEPTION 'Invalid checklist command' USING ERRCODE='23514'; END IF;
 IF (p_payload-'checklist_id')-(CASE p_command WHEN 'create' THEN ARRAY['title'] WHEN 'submission' THEN ARRAY['title','description','section','parent_id','priority'] WHEN 'add' THEN ARRAY['title','description','section','parent_id','linked_task_id','node_type','links','estimated_minutes','priority'] WHEN 'state' THEN ARRAY['node_id','state'] WHEN 'edit' THEN ARRAY['node_id','title','parent_id','linked_task_id','node_type','section','reason','links','estimated_minutes','priority'] WHEN 'map' THEN ARRAY['node_id','section','reason'] WHEN 'delete' THEN ARRAY['node_id','reason'] WHEN 'duplicate' THEN ARRAY['node_id'] WHEN 'review' THEN ARRAY['node_id','decision','note'] WHEN 'section' THEN ARRAY['section','intentional_empty','reason'] WHEN 'mode' THEN ARRAY['enabled','reason','preview_progress'] END)<>'{}' THEN RAISE EXCEPTION 'Unexpected checklist fields' USING ERRCODE='23514'; END IF;
 -- M14: assignees build and maintain their own checklist pages; section mapping,
 -- section gates and progress ownership stay with managers.
 IF p_command IN ('map','section','mode') AND role NOT IN ('managing_director','project_engineer') THEN RAISE EXCEPTION 'Manager controls section mapping, gates and progress ownership' USING ERRCODE='42501'; END IF;
 IF p_command IN ('create','add','edit','delete','duplicate','submission') AND NOT(role IN ('managing_director','project_engineer') OR public.is_task_assignee(p_task)) THEN RAISE EXCEPTION 'Assigned actor or manager required for checklist structure' USING ERRCODE='42501'; END IF;
 IF p_command='state' AND NOT(role IN ('managing_director','project_engineer') OR public.is_task_assignee(p_task)) THEN RAISE EXCEPTION 'Assigned actor required for completion' USING ERRCODE='42501'; END IF;
 -- 114: objectives are acknowledged or sent back by managers and the mission's
 -- Primary / Secondary reviewers; Observers only watch.
 IF p_command='review' AND NOT(role IN ('managing_director','project_engineer') OR EXISTS(SELECT 1 FROM public.task_reviewers r WHERE r.task_id=p_task AND r.user_id=actor AND r.reviewer_role IN ('Primary','Secondary'))) THEN RAISE EXCEPTION 'Only a manager or a Primary or Secondary reviewer of this mission reviews objectives' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||'checklist_'||p_command||p_operation::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command='checklist_'||p_command AND operation_id=p_operation;
 IF FOUND THEN IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF; RETURN receipt.result_payload; END IF;
 SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task FOR UPDATE;
 IF p_expected_version IS DISTINCT FROM t.lifecycle_version THEN RAISE EXCEPTION 'Task changed; reload checklist and try again' USING ERRCODE='PT409'; END IF;
 IF t.status IN ('Done','Discarded') THEN RAISE EXCEPTION 'Manager must reopen before checklist edits' USING ERRCODE='23514'; END IF;
 PERFORM taskpulse_private.assert_task_open_date(p_task,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
 SELECT * INTO c FROM public.task_checklists WHERE task_id=p_task AND ((p_payload->>'checklist_id' IS NULL AND owner_node_id IS NULL) OR id=(p_payload->>'checklist_id')::uuid) FOR UPDATE;
 IF p_payload->>'checklist_id' IS NOT NULL AND c.id IS NULL THEN RAISE EXCEPTION 'Checklist does not belong to this mission' USING ERRCODE='23514'; END IF;
 IF c.owner_node_id IS NOT NULL AND p_command IN ('create','mode') THEN RAISE EXCEPTION 'Only the root checklist controls mission progress' USING ERRCODE='23514'; END IF;
 IF p_payload?'priority' AND ((p_payload->>'priority') IS NULL OR (p_payload->>'priority') !~ '^[0-3]$') THEN RAISE EXCEPTION 'Priority must be 0 to 3' USING ERRCODE='23514'; END IF;
 change_reason:=nullif(btrim(p_payload->>'reason'),'');
 IF length(coalesce(change_reason,''))>1000 THEN RAISE EXCEPTION 'Reason too long' USING ERRCODE='23514'; END IF;
 IF p_command='review' THEN
  IF length(coalesce(p_payload->>'note',''))>1000 THEN RAISE EXCEPTION 'Keep the review note under 1000 characters' USING ERRCODE='23514'; END IF;
  change_reason:=CASE p_payload->>'decision' WHEN 'acknowledged' THEN 'Acknowledged'||coalesce(': '||nullif(btrim(p_payload->>'note'),''),'') WHEN 'work_needed' THEN 'Work needed: '||btrim(p_payload->>'note') END;
 END IF;
 before_state:=taskpulse_private.checklist_rollup(p_task);
 IF p_command='create' THEN
  IF c.id IS NOT NULL THEN RAISE EXCEPTION 'Checklist already exists' USING ERRCODE='23514'; END IF;
  INSERT INTO public.task_checklists(task_id,title,created_by,sync_progress_to_task,credit_anchor) VALUES(p_task,coalesce(nullif(btrim(p_payload->>'title'),''),'Master checklist'),actor,false,t.progress_percentage) RETURNING * INTO c;
 ELSE
  IF c.id IS NULL THEN RAISE EXCEPTION 'Initialize a checklist first' USING ERRCODE='23514'; END IF;
  section_role:=p_payload->>'section';
  IF p_command IN ('add','map','section','edit','submission') AND (section_role IS NULL OR section_role NOT IN ('setup','activity','closure')) THEN RAISE EXCEPTION 'Choose Setup, Activity or Closure explicitly' USING ERRCODE='23514'; END IF;
  IF p_command IN ('state','edit','map','delete','duplicate','reorder','review') THEN
   node_id:=(p_payload->>'node_id')::uuid;
   SELECT * INTO n FROM public.checklist_nodes WHERE id=node_id AND checklist_id=c.id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Item is not in this task checklist' USING ERRCODE='23514'; END IF;
  END IF;
  IF role NOT IN ('managing_director','project_engineer') AND ((p_command='add' AND p_payload->>'linked_task_id' IS NOT NULL) OR (p_command='edit' AND (p_payload->>'linked_task_id')::uuid IS DISTINCT FROM n.linked_task_id)) THEN RAISE EXCEPTION 'Manager controls links to real tasks' USING ERRCODE='42501'; END IF;
  IF p_command='submission' THEN
   IF nullif(btrim(p_payload->>'title'),'') IS NULL THEN RAISE EXCEPTION 'Quest title required' USING ERRCODE='23514'; END IF;
   INSERT INTO public.checklist_nodes(checklist_id,parent_node_id,node_type,title,description,detail_section,priority,sort_order) VALUES(c.id,(p_payload->>'parent_id')::uuid,'Page',btrim(p_payload->>'title'),p_payload->>'description',section_role,coalesce((p_payload->>'priority')::smallint,1),coalesce((SELECT max(x.sort_order)+1 FROM public.checklist_nodes x WHERE x.checklist_id=c.id AND x.parent_node_id IS NOT DISTINCT FROM (p_payload->>'parent_id')::uuid),0)) RETURNING id INTO node_id;
   INSERT INTO public.task_checklists(task_id,owner_node_id,title,created_by,sync_progress_to_task) VALUES(p_task,node_id,btrim(p_payload->>'title'),actor,false) RETURNING id INTO owned_id;
  ELSIF p_command='add' THEN
   IF nullif(btrim(p_payload->>'title'),'') IS NULL THEN RAISE EXCEPTION 'Title required' USING ERRCODE='23514'; END IF;
   -- A row that gets rows under it takes its progress from them.
   UPDATE public.checklist_nodes SET completion_state='No',is_complete=false,completed_by=NULL,completed_at=NULL WHERE id=(p_payload->>'parent_id')::uuid AND checklist_id=c.id AND (completion_state<>'No' OR is_complete);
   INSERT INTO public.checklist_nodes(checklist_id,parent_node_id,linked_task_id,node_type,title,description,detail_section,links,estimated_minutes,priority,sort_order) VALUES(c.id,(p_payload->>'parent_id')::uuid,(p_payload->>'linked_task_id')::uuid,coalesce((p_payload->>'node_type')::public.checklist_node_type,'Item'),btrim(p_payload->>'title'),p_payload->>'description',section_role,taskpulse_private.checklist_links(p_payload->'links'),taskpulse_private.checklist_estimate(p_payload->'estimated_minutes'),coalesce((p_payload->>'priority')::smallint,0),coalesce((SELECT max(s.sort_order)+1 FROM public.checklist_nodes s WHERE s.checklist_id=c.id AND s.parent_node_id IS NOT DISTINCT FROM (p_payload->>'parent_id')::uuid),0)) RETURNING id INTO node_id;
  ELSIF p_command='reorder' THEN
   IF p_payload->>'direction' IS NULL OR p_payload->>'direction' NOT IN ('up','down') THEN RAISE EXCEPTION 'Move a row up or down' USING ERRCODE='23514'; END IF;
   UPDATE public.checklist_nodes s SET sort_order=r.position FROM (
     SELECT x.id,(row_number() OVER (ORDER BY x.priority DESC,x.sort_order,x.id))::int AS position FROM public.checklist_nodes x
     WHERE x.checklist_id=c.id AND x.detail_section IS NOT DISTINCT FROM n.detail_section AND x.parent_node_id IS NOT DISTINCT FROM n.parent_node_id) r
    WHERE s.id=r.id AND s.sort_order<>r.position;
   SELECT x.id INTO neighbour FROM public.checklist_nodes x
    WHERE x.checklist_id=c.id AND x.detail_section IS NOT DISTINCT FROM n.detail_section AND x.parent_node_id IS NOT DISTINCT FROM n.parent_node_id
      AND x.sort_order=(SELECT y.sort_order FROM public.checklist_nodes y WHERE y.id=n.id)+CASE p_payload->>'direction' WHEN 'up' THEN -1 ELSE 1 END;
   IF neighbour IS NULL THEN RAISE EXCEPTION 'This row is already at the % of its list',CASE p_payload->>'direction' WHEN 'up' THEN 'top' ELSE 'bottom' END USING ERRCODE='23514'; END IF;
   UPDATE public.checklist_nodes x SET
     sort_order=CASE WHEN x.id=n.id THEN (SELECT z.sort_order FROM public.checklist_nodes z WHERE z.id=neighbour) ELSE (SELECT z.sort_order FROM public.checklist_nodes z WHERE z.id=n.id) END,
     priority=CASE WHEN x.id=n.id THEN (SELECT z.priority FROM public.checklist_nodes z WHERE z.id=neighbour) ELSE x.priority END
    WHERE x.id IN (n.id,neighbour);
  ELSIF p_command='state' THEN
   IF p_payload->>'state' IS NULL OR p_payload->>'state' NOT IN ('Yes','No','N/A') OR EXISTS(SELECT 1 FROM public.checklist_nodes WHERE parent_node_id=n.id) THEN RAISE EXCEPTION 'Yes, No or N/A applies to rows with nothing under them; a row with rows under it takes their progress' USING ERRCODE='23514'; END IF;
   IF n.linked_task_id IS NOT NULL AND p_payload->>'state'<>'N/A' AND p_payload->>'state'<>'No' THEN RAISE EXCEPTION 'Linked completion follows the real task; use No to restore applicability' USING ERRCODE='23514'; END IF;
   PERFORM set_config('taskpulse.checklist_state',n.id::text,true); UPDATE public.checklist_nodes SET completion_state=p_payload->>'state',is_complete=p_payload->>'state'='Yes',completed_by=CASE WHEN p_payload->>'state'='Yes' THEN actor END,completed_at=CASE WHEN p_payload->>'state'='Yes' THEN clock_timestamp() END WHERE id=n.id; PERFORM set_config('taskpulse.checklist_state','',true);
   -- 114: a tick waiting for review tells the mission's reviewers, once per mission per day.
   IF (SELECT x.review_state FROM public.checklist_nodes x WHERE x.id=n.id)='pending' THEN
    PERFORM taskpulse_private.notify(t.organization_id,ARRAY(SELECT r.user_id FROM public.task_reviewers r WHERE r.task_id=p_task AND r.reviewer_role IN ('Primary','Secondary')),'objective_review',
     format('Objectives to review on %s',t.task_tag),format('"%s" was ticked and waits for your review.',left(n.title,120)),
     taskpulse_private.notify_task_href(t.task_tag),'objective_review:'||p_task||':'||(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
   END IF;
  ELSIF p_command='review' THEN
   -- 114 (plan section 6): one decision per Yes tick. The version check stops two
   -- reviewers deciding at once; a decided objective is not decided again until it
   -- is ticked again. Work needed puts the tick back to No exactly as the state
   -- path does, so progress and credit move by the ordinary change (no new rule).
   IF p_payload->>'decision' IS NULL OR p_payload->>'decision' NOT IN ('acknowledged','work_needed') THEN RAISE EXCEPTION 'Choose Acknowledge or Work needed' USING ERRCODE='23514'; END IF;
   IF p_payload->>'decision'='work_needed' AND nullif(btrim(p_payload->>'note'),'') IS NULL THEN RAISE EXCEPTION 'Say what work is needed' USING ERRCODE='23514'; END IF;
   IF n.linked_task_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.checklist_nodes x WHERE x.parent_node_id=n.id) OR EXISTS(SELECT 1 FROM public.task_checklists o WHERE o.owner_node_id=n.id) THEN RAISE EXCEPTION 'Only objectives are reviewed; rows with rows under them follow those rows' USING ERRCODE='23514'; END IF;
   IF n.review_state<>'pending' THEN RAISE EXCEPTION 'This objective is not waiting for review' USING ERRCODE='23514'; END IF;
   IF n.completed_by=actor THEN RAISE EXCEPTION 'Someone else reviews an objective you ticked' USING ERRCODE='42501'; END IF;
   PERFORM set_config('taskpulse.checklist_state',n.id::text,true); PERFORM set_config('taskpulse.checklist_review',n.id::text,true);
   IF p_payload->>'decision'='acknowledged' THEN
    UPDATE public.checklist_nodes SET review_state='acknowledged',reviewed_by=actor,reviewed_at=clock_timestamp(),review_note=nullif(btrim(p_payload->>'note'),'') WHERE id=n.id;
   ELSE
    UPDATE public.checklist_nodes SET completion_state='No',is_complete=false,completed_by=NULL,completed_at=NULL,review_state='work_needed',reviewed_by=actor,reviewed_at=clock_timestamp(),review_note=btrim(p_payload->>'note') WHERE id=n.id;
    PERFORM taskpulse_private.notify(t.organization_id,ARRAY(SELECT a.user_id FROM public.task_assignees a WHERE a.task_id=p_task)||n.completed_by,'objective_work_needed',
     format('Work needed on %s',t.task_tag),format('"%s": %s',left(n.title,120),left(btrim(p_payload->>'note'),300)),
     taskpulse_private.notify_task_href(t.task_tag),'objective_work_needed:'||n.id||':'||p_operation);
   END IF;
   PERFORM set_config('taskpulse.checklist_state','',true); PERFORM set_config('taskpulse.checklist_review','',true);
  ELSIF p_command='map' THEN
   IF change_reason IS NULL OR n.parent_node_id IS NOT NULL THEN RAISE EXCEPTION 'Map a legacy root with a reason; its entire subtree follows that explicit role' USING ERRCODE='23514'; END IF;
   -- One statement maps descendants; defer graph trigger until every row is mapped.
   WITH RECURSIVE subtree(id) AS (SELECT n.id UNION SELECT x.id FROM public.checklist_nodes x JOIN subtree s ON x.parent_node_id=s.id)
   UPDATE public.checklist_nodes SET detail_section=section_role WHERE id IN (SELECT id FROM subtree);
  ELSIF p_command='edit' THEN
   IF change_reason IS NULL THEN RAISE EXCEPTION 'Structure correction needs a reason' USING ERRCODE='23514'; END IF;
   WITH RECURSIVE subtree(id) AS (SELECT n.id UNION SELECT x.id FROM public.checklist_nodes x JOIN subtree s ON x.parent_node_id=s.id)
   UPDATE public.checklist_nodes x SET detail_section=section_role,
    title=CASE WHEN x.id=n.id THEN coalesce(nullif(btrim(p_payload->>'title'),''),x.title) ELSE x.title END,
    parent_node_id=CASE WHEN x.id=n.id THEN (p_payload->>'parent_id')::uuid ELSE x.parent_node_id END,
    linked_task_id=CASE WHEN x.id=n.id THEN (p_payload->>'linked_task_id')::uuid ELSE x.linked_task_id END,
    node_type=CASE WHEN x.id=n.id THEN coalesce((p_payload->>'node_type')::public.checklist_node_type,x.node_type) ELSE x.node_type END,
    links=CASE WHEN x.id=n.id AND p_payload?'links' THEN taskpulse_private.checklist_links(p_payload->'links') ELSE x.links END,
    priority=CASE WHEN x.id=n.id AND p_payload?'priority' THEN (p_payload->>'priority')::smallint ELSE x.priority END,
    estimated_minutes=CASE WHEN x.id=n.id AND p_payload?'estimated_minutes' THEN taskpulse_private.checklist_estimate(p_payload->'estimated_minutes') ELSE x.estimated_minutes END
    WHERE x.id IN (SELECT id FROM subtree);
   UPDATE public.checklist_nodes SET completion_state='No',is_complete=false,completed_by=NULL,completed_at=NULL WHERE id=(p_payload->>'parent_id')::uuid AND checklist_id=c.id AND (completion_state<>'No' OR is_complete);
  ELSIF p_command='duplicate' THEN
   -- M14: copy a row or page with everything inside it, right after the original.
   -- Copies start as fresh work (No); rows linked to real tasks are not copied.
   IF n.linked_task_id IS NOT NULL THEN RAISE EXCEPTION 'Rows linked to real tasks cannot be duplicated' USING ERRCODE='23514'; END IF;
   IF n.detail_section IS NULL THEN RAISE EXCEPTION 'Map this row to a section before duplicating it' USING ERRCODE='23514'; END IF;
   UPDATE public.checklist_nodes SET sort_order=sort_order+1 WHERE checklist_id=c.id AND parent_node_id IS NOT DISTINCT FROM n.parent_node_id AND sort_order>n.sort_order;
   CREATE TEMP TABLE m14_copy ON COMMIT DROP AS
    WITH RECURSIVE subtree(id) AS (SELECT n.id UNION ALL SELECT x.id FROM public.checklist_nodes x JOIN subtree s ON x.parent_node_id=s.id WHERE x.linked_task_id IS NULL)
    SELECT id AS old_id,gen_random_uuid() AS new_id FROM subtree;
   INSERT INTO public.checklist_nodes(id,checklist_id,parent_node_id,linked_task_id,node_type,title,description,is_complete,completion_state,sort_order,estimated_minutes,links,detail_section,priority)
    SELECT m.new_id,x.checklist_id,CASE WHEN x.id=n.id THEN x.parent_node_id ELSE p.new_id END,NULL,x.node_type,
     CASE WHEN x.id=n.id THEN left(x.title,173)||' (copy)' ELSE x.title END,x.description,false,'No',
     CASE WHEN x.id=n.id THEN x.sort_order+1 ELSE x.sort_order END,x.estimated_minutes,x.links,x.detail_section,x.priority
    FROM m14_copy m JOIN public.checklist_nodes x ON x.id=m.old_id LEFT JOIN m14_copy p ON p.old_id=x.parent_node_id;
   SELECT new_id INTO node_id FROM m14_copy WHERE old_id=n.id;
   FOR copy_row IN SELECT m.new_id,child.* FROM m14_copy m JOIN public.task_checklists child ON child.owner_node_id=m.old_id LOOP
    INSERT INTO public.task_checklists(task_id,owner_node_id,title,created_by,sync_progress_to_task) VALUES(p_task,copy_row.new_id,copy_row.title,actor,false) RETURNING id INTO owned_id;
    PERFORM taskpulse_private.copy_owned_checklist(copy_row.id,owned_id);
   END LOOP;
   DROP TABLE m14_copy;
  ELSIF p_command='delete' THEN
   IF change_reason IS NULL THEN RAISE EXCEPTION 'Give a reason for removing this row' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM public.checklist_nodes WHERE parent_node_id=n.id) AND (p_payload->>'with_children') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'This row has rows under it; remove them with it or move them first' USING ERRCODE='23514'; END IF;
   IF EXISTS(WITH RECURSIVE sub(id) AS (SELECT x.id FROM public.checklist_nodes x WHERE x.parent_node_id=n.id
      UNION SELECT x.id FROM public.checklist_nodes x JOIN sub ON x.parent_node_id=sub.id)
     SELECT 1 FROM public.task_checklists o WHERE o.owner_node_id IN (SELECT id FROM sub)) THEN
    RAISE EXCEPTION 'A Quest is inside this row; empty and remove the Quest first' USING ERRCODE='23514'; END IF;
   SELECT id INTO owned_id FROM public.task_checklists WHERE owner_node_id=n.id FOR UPDATE;
   IF owned_id IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM public.checklist_nodes WHERE checklist_id=owned_id) THEN RAISE EXCEPTION 'Remove the rows inside this Quest first.' USING ERRCODE='23514'; END IF;
    DELETE FROM public.task_checklists WHERE id=owned_id;
   END IF;
   DELETE FROM public.checklist_nodes WHERE id=n.id;
  ELSIF p_command='section' THEN
   IF change_reason IS NULL OR jsonb_typeof(p_payload->'intentional_empty') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Section review needs an explicit empty decision and reason' USING ERRCODE='23514'; END IF;
   IF (p_payload->>'intentional_empty')::boolean AND EXISTS(SELECT 1 FROM public.checklist_nodes WHERE checklist_id=c.id AND detail_section=section_role AND (node_type IN ('Item','Task') OR EXISTS(SELECT 1 FROM public.task_checklists owned WHERE owned.owner_node_id=public.checklist_nodes.id))) THEN RAISE EXCEPTION 'This section contains work; mark irrelevant leaves N/A or confirm initialized work' USING ERRCODE='23514'; END IF;
   UPDATE public.checklist_sections SET initialized=true,intentional_empty=(p_payload->>'intentional_empty')::boolean,reason=change_reason WHERE checklist_id=c.id AND checklist_sections.role=section_role;
  ELSIF p_command='mode' THEN
   IF change_reason IS NULL OR jsonb_typeof(p_payload->'enabled') IS DISTINCT FROM 'boolean' OR NOT p_payload?'preview_progress' THEN RAISE EXCEPTION 'Mode switch needs a reason and reviewed preview' USING ERRCODE='23514'; END IF;
   rollup:=taskpulse_private.checklist_rollup(p_task);enabled:=(p_payload->>'enabled')::boolean; IF NOT enabled THEN RAISE EXCEPTION 'A mission with a checklist always takes its progress from the checklist' USING ERRCODE='23514'; END IF;
   IF (p_payload->>'preview_progress')::numeric IS DISTINCT FROM (rollup->>'taskProgress')::numeric THEN RAISE EXCEPTION 'Preview changed; reload before switching' USING ERRCODE='PT409'; END IF;
   IF enabled AND jsonb_array_length(rollup->'errors')>0 THEN RAISE EXCEPTION 'Fix the checklist issues before the checklist drives progress' USING ERRCODE='23514'; END IF;
   UPDATE public.task_checklists SET sync_progress_to_task=enabled,credit_anchor=coalesce((rollup->>'taskProgress')::numeric,t.progress_percentage,credit_anchor) WHERE id=c.id;
   INSERT INTO taskpulse_private.checklist_credit_events(task_id,operation_id,progress_before,progress_after,scale,scale_version,participant_version,scaled_credit,event_kind,reason) VALUES(p_task,p_operation,t.progress_percentage,CASE WHEN enabled THEN (rollup->>'taskProgress')::numeric ELSE t.progress_percentage END,t.task_scale,t.scale_version,t.participant_version,0,'mode_switch',change_reason);
  END IF;
  IF p_command IN ('add','map','edit','submission','duplicate') THEN UPDATE public.checklist_sections SET initialized=true,intentional_empty=false WHERE checklist_id=c.id AND checklist_sections.role=section_role AND EXISTS(SELECT 1 FROM public.checklist_nodes WHERE checklist_id=c.id AND detail_section=section_role AND (node_type IN ('Item','Task') OR parent_node_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.task_checklists owned WHERE owned.owner_node_id=public.checklist_nodes.id))); END IF;
 END IF;
 PERFORM taskpulse_private.refresh_task_metrics(p_task,p_operation,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
 UPDATE public.tasks SET lifecycle_version=lifecycle_version+1 WHERE id=p_task;
 result:=jsonb_build_object('taskId',p_task,'taskTag',t.task_tag,'checklistId',c.id,'ownedChecklistId',owned_id,'nodeId',node_id,'version',(SELECT lifecycle_version FROM public.tasks WHERE id=p_task),'rollup',taskpulse_private.checklist_result(c.id),'rootRollup',taskpulse_private.checklist_rollup(p_task));
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id) VALUES(actor,role::text,'checklist_'||p_command,'task_checklists',c.id,ARRAY[p_command],jsonb_build_object('before',before_state,'after',result->'rollup','node_id',node_id,'reason',change_reason,'state',p_payload->'state','decision',p_payload->'decision','node_before',jsonb_build_object('id',n.id,'parent',n.parent_node_id,'section',n.detail_section,'linked_task',n.linked_task_id,'type',n.node_type,'state',n.completion_state),'node_after',(SELECT jsonb_build_object('id',x.id,'parent',x.parent_node_id,'section',x.detail_section,'linked_task',x.linked_task_id,'type',x.node_type,'state',x.completion_state,'review',x.review_state) FROM public.checklist_nodes x WHERE x.id=node_id)),p_operation);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload) VALUES(actor,'checklist_'||p_command,p_operation,request,p_task,result);
 RETURN result;
END $function$;

-- assert_checklist_done: rewritten from the live definition.
CREATE OR REPLACE FUNCTION taskpulse_private.assert_checklist_done(p_task uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ DECLARE r jsonb; t public.tasks; BEGIN
 SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task;
 -- 114 (D-D2): objectives waiting for review or sent back hold up Done.
 IF EXISTS(SELECT 1 FROM public.checklist_nodes x JOIN public.task_checklists c ON c.id=x.checklist_id WHERE c.task_id=p_task AND x.review_state IN ('pending','work_needed')) THEN
  RAISE EXCEPTION 'Done needs every objective reviewed: % waiting for review, % with work needed',
   (SELECT count(*) FROM public.checklist_nodes x JOIN public.task_checklists c ON c.id=x.checklist_id WHERE c.task_id=p_task AND x.review_state='pending'),
   (SELECT count(*) FROM public.checklist_nodes x JOIN public.task_checklists c ON c.id=x.checklist_id WHERE c.task_id=p_task AND x.review_state='work_needed') USING ERRCODE='23514';
 END IF;
 r:=taskpulse_private.checklist_rollup(p_task);
 IF NOT(r->>'isComplete')::boolean THEN RAISE EXCEPTION 'Done needs every Setup, Activity and Closure row complete or N/A, and no checklist issues' USING ERRCODE='23514'; END IF;
 IF t.progress_percentage IS NOT NULL AND t.progress_percentage<>100 THEN RAISE EXCEPTION 'Checklist gates passed, but current manual task progress is not 100; reconcile progress or enable Activity ownership before Done' USING ERRCODE='23514'; END IF;
 IF t.reviewer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.task_reviewers WHERE task_id=p_task AND user_id=t.reviewer_id) THEN RAISE EXCEPTION 'Reconcile the legacy primary reviewer before Done' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.task_reviewers r LEFT JOIN public.users u ON u.id=r.user_id WHERE r.task_id=p_task AND (NOT coalesce(u.is_active,false) OR NOT r.review_approved OR r.reviewed_revision IS DISTINCT FROM t.work_revision)) THEN RAISE EXCEPTION 'Done needs every assigned reviewer approval for the current work revision' USING ERRCODE='23514'; END IF;
END $function$;

-- The mission's objective reviews that are not none, and whether the viewer decides them.
CREATE FUNCTION public.checklist_reviews(p_task uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid:=auth.uid(); role public.user_role:=public.get_user_role(); BEGIN
 IF role IS NULL THEN RAISE EXCEPTION 'Active authenticated read required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=p_task) THEN RAISE EXCEPTION 'Mission not found' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object(
  'viewerId',actor,
  'canDecide',role IN ('managing_director','project_engineer') OR EXISTS(SELECT 1 FROM public.task_reviewers r WHERE r.task_id=p_task AND r.user_id=actor AND r.reviewer_role IN ('Primary','Secondary')),
  'reviews',coalesce((SELECT jsonb_agg(jsonb_build_object('nodeId',x.id,'checklistId',x.checklist_id,'parentNodeId',x.parent_node_id,'section',x.detail_section,
     'title',x.title,'state',x.review_state,'completedBy',x.completed_by,'reviewedBy',x.reviewed_by,'reviewedAt',x.reviewed_at,'note',x.review_note)
     ORDER BY CASE x.review_state WHEN 'pending' THEN 0 WHEN 'work_needed' THEN 1 ELSE 2 END,c.owner_node_id NULLS FIRST,x.detail_section,x.sort_order,x.id)
   FROM (SELECT x.* FROM public.checklist_nodes x JOIN public.task_checklists c ON c.id=x.checklist_id
         WHERE c.task_id=p_task AND x.review_state<>'none' ORDER BY x.review_state<>'pending',x.reviewed_at DESC NULLS FIRST LIMIT 300) x
   JOIN public.task_checklists c ON c.id=x.checklist_id),'[]'::jsonb));
END $function$;
REVOKE ALL ON FUNCTION public.checklist_reviews(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.checklist_reviews(uuid) TO authenticated;

SELECT taskpulse_private.m15_secure();
COMMIT;
