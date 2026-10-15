-- M13: Task Tools preview applies the closed-month rule before commit (15 October 2026).
-- Forward only. Replaces task_tools_preview from migration 25 with two changes:
-- a closed-period reason for planned new-task dates in a non-live month, and
-- TT- tags allocated/reserved only for a committable plan. The m12 month source
-- guard on commit remains authoritative; grants are unchanged.
BEGIN;
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
  -- Same rule the commit-time month source guard enforces for a new task: no
  -- planned assignment/due date may fall in a non-live month (an unsaved task
  -- cannot be named in a director correction scope).
  IF EXISTS(SELECT 1 FROM generate_series(1,count) g(i)
    CROSS JOIN LATERAL (VALUES(CASE WHEN p_command IN ('weekly','day_count') THEN start_date+(g.i-1)*span ELSE start_date END)) a(d)
    CROSS JOIN LATERAL (VALUES(a.d),(CASE WHEN p_command IN ('weekly','day_count') THEN a.d+span-1 ELSE due END)) planned(d)
    JOIN taskpulse_private.month_periods m ON m.period_start=date_trunc('month',planned.d)::date AND m.state<>'live')
  THEN reasons:=reasons||'"closed_period_requires_named_correction"'::jsonb;END IF;
  FOR idx IN 1..count LOOP
   assigned:=CASE WHEN p_command IN ('weekly','day_count') THEN start_date+(idx-1)*span ELSE start_date END;
   -- Tags are allocated only for a committable plan, so predictable refusals
   -- do not consume task numbers (numbering is still not gapless).
   new_tag:=CASE WHEN jsonb_array_length(reasons)=0 THEN taskpulse_private.tool_tag() END;
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
 FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP IF item->>'taskId' IS NULL AND item->>'taskTag' IS NOT NULL THEN INSERT INTO taskpulse_private.tool_tag_reservations VALUES(item->>'taskTag',pid);END IF;END LOOP;
 RETURN (SELECT plan FROM taskpulse_private.tool_previews WHERE id=pid);
END $$;
COMMIT;
