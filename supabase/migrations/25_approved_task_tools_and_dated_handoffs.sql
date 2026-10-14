-- M09 approved support/copy/batch and dated read-only handoff/archive contract.
-- Additive forward activation; prior migrations and retained observations stay unchanged.
BEGIN;

CREATE FUNCTION taskpulse_private.assert_task_writable(p_task uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.tasks WHERE id=p_task AND archived_effective_date IS NOT NULL) THEN RAISE EXCEPTION 'Archived task is read-only; use its successor or create new work' USING ERRCODE='23514';END IF;
END $$;
CREATE OR REPLACE FUNCTION taskpulse_private.assert_task_open_date(p_task uuid,p_date date) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$ DECLARE uid uuid;BEGIN
 PERFORM taskpulse_private.assert_task_writable(p_task);
 FOR uid IN SELECT user_id FROM taskpulse_private.task_credit_balances WHERE task_id=p_task UNION SELECT user_id FROM public.task_assignees WHERE task_id=p_task UNION SELECT assignee_id FROM public.tasks WHERE id=p_task LOOP
  PERFORM taskpulse_private.assert_open_date(uid,p_date);
 END LOOP;
END $$;
CREATE FUNCTION taskpulse_private.guard_archived_task() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_row jsonb;new_row jsonb;row_data jsonb;tid uuid;cid uuid;BEGIN
 IF TG_OP<>'INSERT' THEN old_row:=to_jsonb(OLD);END IF;IF TG_OP<>'DELETE' THEN new_row:=to_jsonb(NEW);END IF;
 IF TG_TABLE_NAME='tasks' THEN
  IF old_row->>'archived_effective_date' IS NOT NULL THEN RAISE EXCEPTION 'Archived task and history are read-only' USING ERRCODE='23514';END IF;
 ELSE
  FOR row_data IN SELECT v FROM (VALUES(old_row),(new_row)) q(v) WHERE v IS NOT NULL LOOP
   IF TG_TABLE_NAME='task_dependencies' THEN PERFORM taskpulse_private.assert_task_writable((row_data->>'predecessor_task_id')::uuid);PERFORM taskpulse_private.assert_task_writable((row_data->>'successor_task_id')::uuid);
   ELSIF row_data?'task_id' THEN PERFORM taskpulse_private.assert_task_writable((row_data->>'task_id')::uuid);
   ELSIF row_data?'checklist_id' THEN SELECT task_id INTO tid FROM public.task_checklists WHERE id=(row_data->>'checklist_id')::uuid;PERFORM taskpulse_private.assert_task_writable(tid);
   END IF;
  END LOOP;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DO $$ DECLARE table_name text;BEGIN
 FOREACH table_name IN ARRAY ARRAY['tasks','task_assignees','task_reviewers','task_detail_instances','task_detail_sections','task_links','task_checklists','checklist_nodes','checklist_sections','task_dependencies','daily_task_logs','task_timers'] LOOP
  EXECUTE format('CREATE TRIGGER a_m09_archive_read_only BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION taskpulse_private.guard_archived_task()',table_name);
 END LOOP;
END $$;
CREATE FUNCTION taskpulse_private.observe_task_archive() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF (NEW.archived_effective_date,NEW.handoff_successor_id) IS DISTINCT FROM (OLD.archived_effective_date,OLD.handoff_successor_id) THEN
  INSERT INTO taskpulse_private.performance_observations(kind,source_key,entity_id,data) VALUES('task',NEW.id::text,NEW.id,taskpulse_private.task_observation(NEW.id));
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER zz_m09_archive_observation AFTER UPDATE OF archived_effective_date,handoff_successor_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION taskpulse_private.observe_task_archive();

CREATE OR REPLACE FUNCTION taskpulse_private.task_observation(p_task uuid) RETURNS jsonb LANGUAGE sql SET search_path='' AS $$
 SELECT jsonb_build_object('id',t.id,'tag',t.task_tag,'category',t.category,'priority',t.priority,'status',t.status,
 'assignedDate',t.assigned_date,'dueDate',t.due_date,'completedDate',t.completed_date,'progress',t.progress_percentage::text,'scale',t.task_scale::text,
 'scaleVersion',t.scale_version::text,'shareVersion',t.participant_version::text,'creditMode',t.participant_credit_mode,'primaryAssignee',t.assignee_id,
 'shares',(SELECT jsonb_object_agg(a.user_id::text,a.share_units) FROM public.task_assignees a WHERE a.task_id=t.id),
 'participants',(SELECT jsonb_agg(DISTINCT u ORDER BY u) FROM (SELECT t.assignee_id u UNION SELECT user_id FROM public.task_assignees WHERE task_id=t.id) q),
 'progressOwner',t.progress_owner,'workRevision',t.work_revision::text,'lifecycleVersion',t.lifecycle_version::text,'deleted',false,'archivedEffectiveDate',t.archived_effective_date,'handoffSuccessorId',t.handoff_successor_id) FROM public.tasks t WHERE id=p_task;
$$;
CREATE OR REPLACE FUNCTION taskpulse_private.refresh_task_metrics(p_task uuid,p_operation uuid,p_date date) RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE tid uuid; t public.tasks; c public.task_checklists; amount numeric; total_hours numeric; v bigint; root_version bigint; rollup jsonb; prior jsonb; fingerprint jsonb; shares jsonb; delta numeric; progress numeric; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 PERFORM taskpulse_private.assert_checklist_graph(p_task);
 -- Longest distance, rather than first traversal, orders diamonds child-first.
 FOR tid IN WITH RECURSIVE ancestors(id,path,cycle) AS (
  SELECT p_task,ARRAY[p_task],false UNION ALL SELECT e.owner_id,a.path||e.owner_id,e.owner_id=ANY(a.path) FROM ancestors a JOIN taskpulse_private.checklist_edges() e ON e.source_id=a.id WHERE NOT a.cycle AND NOT EXISTS(SELECT 1 FROM public.tasks x WHERE x.id=a.id AND x.archived_effective_date IS NOT NULL)),
 ordered AS (SELECT id,max(cardinality(path)) depth,bool_or(cycle) cycle FROM ancestors GROUP BY id)
 SELECT id FROM ordered ORDER BY depth,id LOOP
  PERFORM taskpulse_private.assert_checklist_graph(tid);
  SELECT * INTO STRICT t FROM public.tasks WHERE id=tid FOR UPDATE;
  IF t.archived_effective_date IS NOT NULL THEN
   IF tid=p_task THEN RAISE EXCEPTION 'Archived task is read-only' USING ERRCODE='23514';END IF;
   CONTINUE;
  END IF;
  IF tid<>p_task AND t.status IN ('Done','Discarded') THEN RAISE EXCEPTION 'A linked parent is closed; a manager must reopen it before changing its reviewed source' USING ERRCODE='23514'; END IF;
  PERFORM taskpulse_private.assert_task_open_date(tid,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
  IF t.scale_mode<>'manual' AND t.status NOT IN ('Done','Discarded') THEN
   amount:=taskpulse_private.derive_scale(tid);
   IF amount IS DISTINCT FROM t.task_scale THEN UPDATE public.tasks SET task_scale=amount,scale_version=scale_version+1,scale_effective_at=clock_timestamp() WHERE id=tid; END IF;
  END IF;
  SELECT * INTO STRICT t FROM public.tasks WHERE id=tid;
  SELECT * INTO c FROM public.task_checklists WHERE task_id=tid FOR UPDATE;
  IF FOUND THEN
   rollup:=taskpulse_private.checklist_rollup(tid);
   fingerprint:=rollup||jsonb_build_object('sources',(SELECT coalesce(jsonb_agg(jsonb_build_array(n.id,n.completion_state,n.parent_node_id,n.detail_section,n.title,n.linked_task_id,src.work_revision,src.status) ORDER BY n.id),'[]') FROM public.checklist_nodes n LEFT JOIN public.tasks src ON src.id=n.linked_task_id WHERE n.checklist_id=c.id));
   SELECT result INTO prior FROM taskpulse_private.checklist_projections WHERE task_id=tid;
   IF prior IS DISTINCT FROM fingerprint THEN
    UPDATE public.tasks SET work_revision=work_revision+1,lifecycle_version=lifecycle_version+1 WHERE id=tid;
    UPDATE public.task_reviewers SET review_approved=false,reviewed_at=NULL,reviewed_revision=NULL WHERE task_id=tid;
    INSERT INTO taskpulse_private.checklist_projections VALUES(tid,fingerprint) ON CONFLICT(task_id) DO UPDATE SET result=excluded.result;
   END IF;
   IF c.sync_progress_to_task AND t.status NOT IN ('Done','Discarded') THEN
    progress:=(rollup->>'taskProgress')::numeric;
    IF progress IS DISTINCT FROM t.progress_percentage THEN
     delta:=CASE WHEN progress IS NULL THEN 0 WHEN progress=c.credit_anchor THEN 0 WHEN c.credit_anchor IS NULL THEN NULL ELSE (progress-c.credit_anchor)*t.task_scale/100 END;
     IF progress IS NOT NULL AND (delta IS NULL OR (delta<>0 AND t.participant_credit_mode='legacy')) THEN RAISE EXCEPTION 'Checklist credit needs a measured baseline, scale and approved participant shares; reconcile before saving' USING ERRCODE='23514'; END IF;
     SELECT pv.shares INTO shares FROM taskpulse_private.participant_versions pv WHERE pv.task_id=tid AND pv.version=t.participant_version;
     PERFORM taskpulse_private.apply_credit(tid,coalesce(delta,0),shares,t.assignee_id);
     INSERT INTO taskpulse_private.checklist_credit_events(task_id,operation_id,progress_before,progress_after,scale,scale_version,participant_version,shares,scaled_credit,event_kind)
      VALUES(tid,p_operation,c.credit_anchor,progress,t.task_scale,t.scale_version,t.participant_version,shares,coalesce(delta,0),'prospective_rollup');
     UPDATE public.tasks SET progress_percentage=progress WHERE id=tid;
     UPDATE public.task_checklists SET credit_anchor=coalesce(progress,credit_anchor) WHERE id=c.id;
    END IF;
   END IF;
  END IF;
  SELECT coalesce(sum(hours_worked),0) INTO total_hours FROM public.daily_task_logs WHERE task_id=tid AND reversed_at IS NULL;
  IF EXISTS(SELECT 1 FROM public.daily_task_logs WHERE task_id=tid AND reversed_at IS NULL AND NOT(hours_worked>=0 AND hours_worked<'Infinity'::numeric)) THEN total_hours:=NULL; END IF;
  UPDATE public.tasks SET task_productivity=CASE WHEN total_hours>0 AND total_hours<'Infinity'::numeric THEN round(progress_percentage/total_hours,2) ELSE NULL END,
   productivity_available=coalesce(total_hours>0 AND total_hours<'Infinity'::numeric AND progress_percentage IS NOT NULL,false),metric_version=metric_version+1 WHERE id=tid RETURNING metric_version INTO v;
  INSERT INTO taskpulse_private.outbox_jobs(kind,entity_id,entity_version,operation_id,payload) VALUES('task_metrics_invalidated',tid,v,p_operation,jsonb_build_object('contract','m05-checklist-v1','affected_date',p_date,'dependencies',ARRAY['M07'],'reason','atomic_graph_refresh'));
  INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
   VALUES(auth.uid(),coalesce(public.get_user_role()::text,'system'),'checklist_metric_refresh','tasks',tid,ARRAY['progress','metrics'],jsonb_build_object('source',p_task,'before_progress',t.progress_percentage,'after_progress',(SELECT progress_percentage FROM public.tasks WHERE id=tid),'metric_version',v),p_operation);
  IF tid=p_task THEN root_version:=v; END IF;
 END LOOP;
 RETURN root_version;
END $$;
CREATE OR REPLACE FUNCTION public.decay_task_freshness() RETURNS TABLE(updated_count integer,rotten_count integer,stale_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE owner_name name; row_data record; operation uuid:=gen_random_uuid(); BEGIN
 SELECT pg_get_userbyid(relowner) INTO owner_name FROM pg_class WHERE oid='taskpulse_private.audit_events'::regclass;
 IF current_setting('role',true)<>'service_role' AND session_user<>owner_name THEN RAISE EXCEPTION 'Trusted freshness worker required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 updated_count:=0; rotten_count:=0; stale_count:=0;
 FOR row_data IN SELECT t.id FROM public.tasks t WHERE t.archived_effective_date IS NULL AND (freshness,freshness_reason) IS DISTINCT FROM
  ((taskpulse_private.freshness_result(t.assigned_date,t.due_date,t.completed_date,t.status,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date)->>'state')::public.task_freshness,
   taskpulse_private.freshness_result(t.assigned_date,t.due_date,t.completed_date,t.status,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date)->>'reason') ORDER BY t.id FOR UPDATE LOOP
  PERFORM taskpulse_private.refresh_task_metrics(row_data.id,operation,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
  updated_count:=updated_count+1;
  IF (SELECT freshness FROM public.tasks WHERE id=row_data.id)='Rotten' THEN rotten_count:=rotten_count+1; END IF;
  IF (SELECT freshness FROM public.tasks WHERE id=row_data.id)='Stale' THEN stale_count:=stale_count+1; END IF;
 END LOOP;
 INSERT INTO taskpulse_private.audit_events(actor_role,command,table_name,changed_fields,protected_changes,operation_id)
  VALUES(CASE WHEN current_setting('role',true)='service_role' THEN 'service_role' ELSE 'cron_owner' END,'calendar_freshness_refresh','tasks',ARRAY['freshness'],jsonb_build_object('updated_count',updated_count,'as_of',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date),operation);
 RETURN NEXT;
END $$;
CREATE OR REPLACE FUNCTION public.task_tools_preview(p_command text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role text:=public.get_user_role();actor uuid:=auth.uid();policy jsonb;t public.tasks;ids uuid[];tid uuid;fingerprints jsonb:='{}';items jsonb:='[]';item jsonb;new_tag text;pid uuid:=gen_random_uuid();
 count integer:=1;span integer:=1;start_date date;due date;assigned date;assignees uuid[];reviewers uuid[];shares integer[];idx integer;amount numeric;source_after numeric;source_before numeric;mode text;kind text;target date;scale_mode text;inputs jsonb;override_scale numeric;template uuid;reasons jsonb:='[]';inheritance jsonb;
BEGIN
 SELECT u.role::text INTO role FROM public.users u WHERE u.id=actor AND u.is_active FOR SHARE;
 IF role IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501';END IF;
 IF p_command IS NULL OR p_command NOT IN ('support','duplicate','weekly','day_count','all_team','number_suffix','carryover','bulk_done','bulk_reopen','section','refresh','archive') OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Supported operation and object inputs required' USING ERRCODE='23514';END IF;
 IF role NOT IN ('managing_director','project_engineer') AND p_command NOT IN ('bulk_done','refresh') THEN RAISE EXCEPTION 'Task manager required' USING ERRCODE='42501';END IF;
 IF p_payload-ARRAY['sourceTaskId','taskIds','startDate','dueDate','count','phaseDays','suffix','supportKind','splitMode','amount','percentage','assigneeId','reason','section','intentionalEmpty','targetMonth']<>'{}' THEN RAISE EXCEPTION 'Unexpected tool parameters' USING ERRCODE='23514';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT config INTO policy FROM taskpulse_private.tool_policy WHERE id;
 IF p_command IN ('bulk_done','bulk_reopen','section','refresh','archive') THEN SELECT array_agg(v::uuid ORDER BY v) INTO ids FROM jsonb_array_elements_text(p_payload->'taskIds') v;
 ELSE ids:=ARRAY[(p_payload->>'sourceTaskId')::uuid];END IF;
 IF ids IS NULL OR cardinality(ids)=0 OR cardinality(ids)>100 OR cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'Select 1-100 distinct tasks' USING ERRCODE='23514';END IF;
 FOREACH tid IN ARRAY ids LOOP
  SELECT * INTO t FROM public.tasks WHERE id=tid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected task missing' USING ERRCODE='23503';END IF;
  IF role NOT IN ('managing_director','project_engineer') AND NOT public.is_task_assignee(tid) THEN RAISE EXCEPTION 'Assigned actor required' USING ERRCODE='42501';END IF;
  IF t.archived_effective_date IS NOT NULL THEN reasons:=reasons||'"task_archived_read_only"'::jsonb;END IF;
  IF p_command IN ('archive','carryover') AND EXISTS(SELECT 1 FROM public.task_timers WHERE task_id=tid AND status='Running') THEN reasons:=reasons||'"stop_running_timer_before_archive"'::jsonb;END IF;
  fingerprints:=fingerprints||jsonb_build_object(tid,taskpulse_private.tool_fingerprint(tid));
 END LOOP;
 IF p_command IN ('support','duplicate','weekly','day_count','all_team','number_suffix','carryover') THEN
  FOR tid IN WITH RECURSIVE chain(id,path) AS (SELECT t.id,ARRAY[t.id] UNION ALL SELECT (a.scale_inputs->>'source_task_id')::uuid,c.path||(a.scale_inputs->>'source_task_id')::uuid FROM chain c JOIN public.tasks a ON a.id=c.id WHERE a.scale_mode='linked' AND a.scale_inputs->>'source_task_id' IS NOT NULL AND NOT (a.scale_inputs->>'source_task_id')::uuid=ANY(c.path)) SELECT id FROM chain LOOP fingerprints:=fingerprints||jsonb_build_object(tid,taskpulse_private.tool_fingerprint(tid));END LOOP;
  IF policy IS NULL THEN reasons:=reasons||'"task_tool_policy_unapproved"'::jsonb;END IF;
  IF nullif(p_payload->>'startDate','') IS NULL THEN RAISE EXCEPTION 'Explicit new assignment date required' USING ERRCODE='23514';END IF;
  start_date:=coalesce((p_payload->>'startDate')::date,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);due:=(p_payload->>'dueDate')::date;
  IF NOT isfinite(start_date) OR due IS NOT NULL AND NOT isfinite(due) THEN RAISE EXCEPTION 'Finite calendar dates required' USING ERRCODE='23514';END IF;
  IF p_command IN ('weekly','day_count','number_suffix') THEN count:=(p_payload->>'count')::integer;END IF;
  IF p_command='weekly' THEN span:=7;ELSIF p_command='day_count' THEN span:=(p_payload->>'phaseDays')::integer;END IF;
  IF count IS NULL OR count<1 OR count>100 OR span IS NULL OR span<1 OR span>366 THEN RAISE EXCEPTION '1-100 copies and 1-366 calendar days per phase required' USING ERRCODE='23514';END IF;
  SELECT array_agg(u ORDER BY primary_first DESC,u) INTO assignees FROM (SELECT u,bool_or(primary_first) primary_first FROM (SELECT t.assignee_id u,true primary_first UNION ALL SELECT user_id,is_primary FROM public.task_assignees WHERE task_id=t.id) raw GROUP BY u) p;
  SELECT array_agg(u ORDER BY u) INTO reviewers FROM (SELECT t.reviewer_id u WHERE t.reviewer_id IS NOT NULL UNION SELECT user_id FROM public.task_reviewers WHERE task_id=t.id) p;
  SELECT array_agg(a.share_units ORDER BY x.n) INTO shares FROM unnest(assignees) WITH ORDINALITY x(uid,n) LEFT JOIN public.task_assignees a ON a.task_id=t.id AND a.user_id=x.uid;
  IF cardinality(assignees)=1 THEN shares:=ARRAY[1000000];ELSIF shares IS NULL OR array_position(shares,NULL) IS NOT NULL OR (SELECT sum(s) FROM unnest(shares) s)<>1000000 THEN reasons:=reasons||'"participant_share_reconciliation_required"'::jsonb;END IF;
  source_before:=t.task_scale;amount:=t.task_scale;scale_mode:=t.scale_mode;inputs:=t.scale_inputs;override_scale:=t.scale_override;
  IF p_command='all_team' THEN SELECT array_agg(id ORDER BY id) INTO assignees FROM public.users WHERE is_active;count:=cardinality(assignees);fingerprints:=fingerprints||jsonb_build_object('@team',md5(to_jsonb(assignees)::text));END IF;
  IF p_command='support' THEN
   mode:=p_payload->>'splitMode';kind:=p_payload->>'supportKind';
   IF mode IS NULL OR mode NOT IN ('split-even','split-uneven','proportional','absolute') OR kind IS NULL OR kind NOT IN ('effort','skill') THEN RAISE EXCEPTION 'Explicit support kind/mode required' USING ERRCODE='23514';END IF;
   IF mode<>'absolute' AND (source_before IS NULL OR NOT(source_before>=0 AND source_before<'Infinity'::numeric)) THEN RAISE EXCEPTION 'Source scale is unavailable' USING ERRCODE='23514';END IF;
   IF mode='split-even' THEN amount:=source_before/2;source_after:=source_before-amount;
   ELSIF mode='split-uneven' THEN amount:=(p_payload->>'amount')::numeric;IF amount IS NULL OR NOT(amount>=0 AND amount<=source_before/CASE WHEN policy->>'unevenMaximum'='half' THEN 2 ELSE 1 END) THEN RAISE EXCEPTION 'Uneven amount exceeds source bound' USING ERRCODE='23514';END IF;source_after:=source_before-amount;
   ELSIF mode='proportional' THEN amount:=(p_payload->>'percentage')::numeric;IF amount IS NULL OR NOT(amount>=0 AND amount<=100) THEN RAISE EXCEPTION 'Percentage requires 0-100' USING ERRCODE='23514';END IF;inputs:=jsonb_build_object('source_task_id',t.id,'percentage',amount);amount:=source_before*amount/100;
   ELSE amount:=(p_payload->>'amount')::numeric;IF amount IS NULL OR NOT(amount>=0 AND amount<=500) THEN RAISE EXCEPTION 'Absolute scale requires 0-500' USING ERRCODE='23514';END IF;END IF;
   scale_mode:=CASE WHEN mode='proportional' THEN 'linked' ELSE 'manual' END;IF mode<>'proportional' THEN inputs:=jsonb_build_object('value',amount);END IF;override_scale:=NULL;
   assignees:=ARRAY[(p_payload->>'assigneeId')::uuid];shares:=ARRAY[1000000];
  ELSIF p_command='carryover' THEN
   target:=(p_payload->>'targetMonth'||'-01')::date;
   IF target IS NULL OR target<>date_trunc('month',start_date)::date OR target<>date_trunc('month',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date)::date OR date_trunc('month',t.assigned_date)::date>=target OR t.status IN ('Done','Discarded') OR t.assigned_date IS NULL OR t.progress_percentage IS NULL OR NOT(t.progress_percentage BETWEEN 0 AND 100) OR source_before IS NULL OR NOT(source_before>=0 AND source_before<'Infinity'::numeric) THEN RAISE EXCEPTION 'Carryover requires unfinished measured earlier-period work and the current target month' USING ERRCODE='23514';END IF;
   amount:=source_before*(100-t.progress_percentage)/100;scale_mode:='manual';inputs:=jsonb_build_object('value',amount);override_scale:=NULL;
  ELSIF scale_mode='hours' AND override_scale IS NULL THEN amount:=0;END IF;
  SELECT template_version_id INTO template FROM public.task_detail_instances WHERE task_id=t.id;template:=coalesce(template,t.detail_template_preference,'04000000-0000-0000-0000-000000000002');
  IF count IS NULL OR count<1 OR count>100 THEN RAISE EXCEPTION 'Batch requires 1-100 active participants/tasks' USING ERRCODE='23514';END IF;
  IF due IS NOT NULL AND due<start_date THEN RAISE EXCEPTION 'Deadline precedes assignment' USING ERRCODE='23514';END IF;
  IF amount IS NULL THEN reasons:=reasons||'"scale_source_reconciliation_required"'::jsonb;END IF;
  IF EXISTS(SELECT 1 FROM unnest(assignees||coalesce(reviewers,ARRAY[]::uuid[])) uid LEFT JOIN public.users u ON u.id=uid WHERE u.id IS NULL OR NOT u.is_active) THEN reasons:=reasons||'"inactive_or_missing_participant"'::jsonb;END IF;
  IF EXISTS(SELECT 1 FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE c.task_id=t.id AND n.detail_section IS NULL) THEN reasons:=reasons||'"checklist_section_reconciliation_required"'::jsonb;END IF;
  IF source_after IS NOT NULL OR p_command='carryover' THEN IF nullif(btrim(p_payload->>'reason'),'') IS NULL THEN reasons:=reasons||'"reason_required"'::jsonb;END IF;END IF;
  FOR idx IN 1..count LOOP
   assigned:=CASE WHEN p_command IN ('weekly','day_count') THEN start_date+(idx-1)*span ELSE start_date END;
   new_tag:=taskpulse_private.tool_tag();
   item:=jsonb_build_object('taskTag',new_tag,'title',left(t.title||CASE WHEN p_command='support' THEN ' - '||initcap(kind)||' Support' WHEN p_command='carryover' THEN ' - Carryover' WHEN p_command='number_suffix' THEN ' '||coalesce(p_payload->>'suffix','')||' '||idx ELSE ' (Copy '||idx||')' END,255),
    'category',CASE WHEN p_command='support' AND kind='skill' THEN 'SD' ELSE t.category::text END,'priority',t.priority,'assignedDate',assigned,'dueDate',CASE WHEN p_command IN ('weekly','day_count') THEN assigned+span-1 ELSE due END,
    'scale',amount::text,'scaleMode',scale_mode,'scaleInputs',inputs,'scaleOverride',override_scale,'assignees',CASE WHEN p_command='all_team' THEN to_jsonb(ARRAY[assignees[idx]]) ELSE to_jsonb(assignees) END,
    'reviewers',coalesce(to_jsonb(reviewers),'[]'),'shares',CASE WHEN p_command='all_team' THEN '[1000000]'::jsonb ELSE to_jsonb(shares) END,'templateVersionId',template,'sourceTaskId',t.id);
   items:=items||jsonb_build_array(item);
  END LOOP;
 ELSE
  IF (p_command IN ('archive') OR cardinality(ids)>1) AND policy IS NULL THEN reasons:=reasons||'"task_tool_policy_unapproved"'::jsonb;END IF;
  FOREACH tid IN ARRAY ids LOOP SELECT * INTO t FROM public.tasks WHERE id=tid;items:=items||jsonb_build_array(jsonb_build_object('taskId',tid,'taskTag',t.task_tag,'title',t.title,'version',t.lifecycle_version,'category',t.category,'assignedDate',t.assigned_date,'dueDate',t.due_date,'scale',t.task_scale::text,'scaleMode',t.scale_mode));END LOOP;
 END IF;
 inheritance:=jsonb_build_object('execution','Not Started / 0%; no logs, timers or approvals','template','captured published version; new independent instance','checklist','current structure; reset leaves to No; linked leaves become ordinary reviewable items; sections uninitialized; manual progress','editableContent','description only; other current content cleared','assetLinks','none; no provider operation','scale','supported family retained; hours reset unless an explicit override; carryover remaining manual snapshot');
 INSERT INTO taskpulse_private.tool_previews(id,actor_id,command,request,plan,fingerprints) VALUES(pid,actor,p_command,p_payload,jsonb_build_object('id',pid,'command',p_command,'expiresAt',clock_timestamp()+interval '15 minutes','policyId',policy->>'id','policyFingerprint',md5(policy::text),'ready',jsonb_array_length(reasons)=0,'reasons',reasons,'items',items,'sourceScaleBefore',source_before::text,'sourceScaleAfter',source_after::text,'inheritance',inheritance),fingerprints);
 FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP IF item->>'taskId' IS NULL THEN INSERT INTO taskpulse_private.tool_tag_reservations VALUES(item->>'taskTag',pid);END IF;END LOOP;
 RETURN (SELECT plan FROM taskpulse_private.tool_previews WHERE id=pid);
END $$;
CREATE OR REPLACE FUNCTION public.task_tools_command(p_preview uuid,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();role text:=public.get_user_role();p taskpulse_private.tool_previews;receipt taskpulse_private.command_receipts;policy jsonb;k text;fingerprint text;t public.tasks;item jsonb;target uuid;result jsonb:='[]';operation uuid;assignees uuid[];reviewers uuid[];shares integer[];state jsonb;cid uuid;BEGIN
 SELECT u.role::text INTO role FROM public.users u WHERE u.id=actor AND u.is_active FOR SHARE;
 IF role IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501';END IF;
 IF p_operation IS NULL THEN RAISE EXCEPTION 'Operation required' USING ERRCODE='23514';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command='task_tools' AND operation_id=p_operation;
 IF FOUND THEN IF receipt.request IS DISTINCT FROM to_jsonb(p_preview) THEN RAISE EXCEPTION 'Operation reused with another preview' USING ERRCODE='40001';END IF;RETURN receipt.result_payload;END IF;
 SELECT * INTO p FROM taskpulse_private.tool_previews WHERE id=p_preview FOR SHARE;
 IF NOT FOUND OR p.actor_id<>actor THEN RAISE EXCEPTION 'Own Task Tools preview required' USING ERRCODE='42501';END IF;
 IF p.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Preview expired; prepare a new preview' USING ERRCODE='40001';END IF;
 IF NOT(p.plan->>'ready')::boolean THEN RAISE EXCEPTION 'Preview contains unresolved policy/source decisions' USING ERRCODE='23514';END IF;
 SELECT config INTO policy FROM taskpulse_private.tool_policy WHERE id;
 IF p.plan->>'policyId' IS DISTINCT FROM policy->>'id' OR p.plan->>'policyFingerprint' IS DISTINCT FROM md5(policy::text) THEN RAISE EXCEPTION 'Policy changed; preview again' USING ERRCODE='40001';END IF;
 FOR k,fingerprint IN SELECT key,value FROM jsonb_each_text(p.fingerprints) LOOP
  IF k='@team' THEN IF fingerprint IS DISTINCT FROM (SELECT md5(to_jsonb(array_agg(id ORDER BY id))::text) FROM public.users WHERE is_active) THEN RAISE EXCEPTION 'Active team changed; preview again' USING ERRCODE='40001';END IF;
  ELSE PERFORM 1 FROM public.tasks WHERE id=k::uuid FOR UPDATE;IF fingerprint IS DISTINCT FROM taskpulse_private.tool_fingerprint(k::uuid) THEN RAISE EXCEPTION 'Source changed; preview again' USING ERRCODE='40001';END IF;END IF;
 END LOOP;
 IF role NOT IN ('managing_director','project_engineer') AND p.command NOT IN ('bulk_done','refresh') THEN RAISE EXCEPTION 'Task manager required' USING ERRCODE='42501';END IF;
 IF p.command IN ('support','duplicate','weekly','day_count','all_team','number_suffix','carryover','archive') OR jsonb_array_length(p.plan->'items')>1 THEN IF policy IS NULL THEN RAISE EXCEPTION 'Task Tool policy unapproved' USING ERRCODE='23514';END IF;END IF;
 IF p.command IN ('archive','carryover') THEN
  IF nullif(btrim(p.request->>'reason'),'') IS NULL OR length(p.request->>'reason')>1000 THEN RAISE EXCEPTION 'Handoff/archive requires a reason up to 1000 characters' USING ERRCODE='23514';END IF;
  IF EXISTS(SELECT 1 FROM public.task_timers WHERE status='Running' AND task_id IN (SELECT key::uuid FROM jsonb_each(p.fingerprints) WHERE key<>'@team')) THEN RAISE EXCEPTION 'Stop running timers before handoff/archive' USING ERRCODE='23514';END IF;
 END IF;
 IF p.command='support' AND p.plan->>'sourceScaleAfter' IS NOT NULL THEN
  SELECT * INTO t FROM public.tasks WHERE id=(p.request->>'sourceTaskId')::uuid;
  PERFORM public.task_lifecycle_command(t.id,'scale',jsonb_build_object('mode',t.scale_mode,'inputs',t.scale_inputs,'override',(p.plan->>'sourceScaleAfter')::numeric,'reason',p.request->>'reason','provenance','M09 support split preserving prior earned credit'),t.lifecycle_version,md5(p_operation::text||':reduce')::uuid);
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p.plan->'items') LOOP
  BEGIN
  operation:=md5(p_operation::text||coalesce(item->>'taskTag',item->>'taskId'))::uuid;
  IF p.command IN ('support','duplicate','weekly','day_count','all_team','number_suffix','carryover') THEN
   IF EXISTS(SELECT 1 FROM public.tasks WHERE task_tag=item->>'taskTag') THEN RAISE EXCEPTION 'Preview tag already used; prepare a new preview' USING ERRCODE='40001';END IF;
   SELECT array_agg(v::uuid) INTO assignees FROM jsonb_array_elements_text(item->'assignees') v;SELECT coalesce(array_agg(v::uuid),ARRAY[]::uuid[]) INTO reviewers FROM jsonb_array_elements_text(item->'reviewers') v;SELECT array_agg(v::integer) INTO shares FROM jsonb_array_elements_text(item->'shares') v;
   target:=public.save_task_with_participants(NULL,jsonb_build_object('task_tag',item->>'taskTag','title',item->>'title','category',item->>'category','priority',item->>'priority','task_scale',(item->>'scale')::numeric,'due_date',item->>'dueDate','description',(SELECT description FROM public.tasks WHERE id=(item->>'sourceTaskId')::uuid),'template_version_id',item->>'templateVersionId','initialize_details',true),assignees,reviewers,shares,NULL,false,operation);
   PERFORM taskpulse_private.assert_task_open_date(target,(item->>'assignedDate')::date);
   UPDATE public.tasks SET assigned_date=(item->>'assignedDate')::date WHERE id=target;
   PERFORM taskpulse_private.clone_tool_structure((item->>'sourceTaskId')::uuid,target);
   SELECT * INTO t FROM public.tasks WHERE id=target;
   PERFORM public.task_lifecycle_command(target,'scale',jsonb_build_object('mode',item->>'scaleMode','inputs',item->'scaleInputs','override',item->'scaleOverride','reason',coalesce(p.request->>'reason','New copied task'),'provenance','M09 previewed source scale family'),t.lifecycle_version,md5(operation::text||':scale')::uuid);
   INSERT INTO public.task_dependencies(predecessor_task_id,successor_task_id,relation_type,notes,created_by) VALUES((item->>'sourceTaskId')::uuid,target,CASE WHEN p.command='support' THEN 'Support' WHEN p.command='carryover' THEN 'Carryover' ELSE 'Related' END::public.task_relation_type,'M09 native lineage; no provider asset copied',actor);
   INSERT INTO taskpulse_private.tool_lineage VALUES(target,(item->>'sourceTaskId')::uuid,p.command,p.id,p_operation,clock_timestamp());
   result:=result||jsonb_build_array(jsonb_build_object('taskId',target,'taskTag',item->>'taskTag','status','created'));
  ELSE
   target:=(item->>'taskId')::uuid;SELECT * INTO t FROM public.tasks WHERE id=target;
   IF role NOT IN ('managing_director','project_engineer') AND NOT public.is_task_assignee(target) THEN RAISE EXCEPTION 'Assigned actor required' USING ERRCODE='42501';END IF;
   IF p.command IN ('bulk_done','bulk_reopen') THEN PERFORM public.task_lifecycle_command(target,'transition',jsonb_build_object('status',CASE WHEN p.command='bulk_done' THEN 'Done' ELSE 'In Progress' END,'reason',p.request->>'reason'),t.lifecycle_version,operation);
   ELSIF p.command='section' THEN
    IF (p.request->>'intentionalEmpty')::boolean THEN SELECT id INTO cid FROM public.task_checklists WHERE task_id=target;IF EXISTS(SELECT 1 FROM public.checklist_nodes WHERE checklist_id=cid AND detail_section=p.request->>'section' AND node_type IN ('Item','Task')) THEN RAISE EXCEPTION 'Applicable work cannot be auto-completed' USING ERRCODE='23514';END IF;END IF;
    PERFORM public.checklist_command(target,'section',jsonb_build_object('section',p.request->>'section','intentional_empty',(p.request->>'intentionalEmpty')::boolean,'reason',p.request->>'reason'),t.lifecycle_version,operation);
   ELSIF p.command='refresh' THEN
    PERFORM taskpulse_private.assert_task_open_date(target,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
    PERFORM taskpulse_private.refresh_task_metrics(target,operation,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
    INSERT INTO taskpulse_private.performance_observations(kind,source_key,entity_id,data) VALUES('task',target::text,target,taskpulse_private.task_observation(target));
   ELSIF p.command='archive' THEN
    IF NOT coalesce((policy->>'archive')::boolean,false) OR nullif(btrim(p.request->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Approved archive policy and reason required' USING ERRCODE='23514';END IF;
    PERFORM taskpulse_private.assert_task_open_date(target,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
    UPDATE public.tasks SET archived_effective_date=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date,archive_reason=p.request->>'reason',lifecycle_version=lifecycle_version+1 WHERE id=target;
   END IF;
   result:=result||jsonb_build_array(jsonb_build_object('taskId',target,'taskTag',t.task_tag,'status',CASE WHEN p.command='refresh' THEN 'shared_recomputation_queued' ELSE 'committed' END));
  END IF;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION '%: %',item->>'taskTag',SQLERRM USING ERRCODE=SQLSTATE;END;
 END LOOP;
 IF p.command='carryover' THEN
  SELECT * INTO t FROM public.tasks WHERE id=(p.request->>'sourceTaskId')::uuid;PERFORM taskpulse_private.assert_task_open_date(t.id,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
  IF nullif(btrim(p.request->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Carryover handoff reason required' USING ERRCODE='23514';END IF;
  UPDATE public.tasks SET archived_effective_date=(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date,archive_reason=p.request->>'reason',handoff_successor_id=target,lifecycle_version=lifecycle_version+1 WHERE id=t.id;
 END IF;
 state:=jsonb_build_object('previewId',p.id,'items',result,'status','committed','providerState','not_requested');
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id) VALUES(actor,role,'task_tools_'||p.command,'tool_previews',p.id,ARRAY['native_workflow'],jsonb_build_object('itemCount',jsonb_array_length(result),'providerRequested',false),p_operation);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload) VALUES(actor,'task_tools',p_operation,to_jsonb(p.id),p.id,state);
 RETURN state;
END $$;
UPDATE taskpulse_private.tool_policy SET config='{"id": "m09-approved-2026-10-13", "unevenMaximum": "whole", "copies": "reset_snapshot", "phases": "independent_repeats", "batch": "atomic", "carryover": "remaining_handoff", "archive": true, "historicalImport": false}'::jsonb;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
