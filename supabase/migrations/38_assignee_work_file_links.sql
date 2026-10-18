-- ===========================================================================
-- TaskPulse - M14 assignee work-file links (forward only, after 37)
--
-- "Create work file" without Google Drive credentials: the user opens a new
-- Doc/Sheet/Slides file in their own Google account and pastes its link into
-- the task's Inputs/Process/Outputs. In the sheet tracker the task owner fills
-- those columns, but task_details_command 'link' was manager-only.
--
-- This lets an active task assignee add an ordinary http(s) link through the
-- same command. Linking a related employee or report, and every other detail
-- command, stays manager-only via task_details_command_m05. The assignee path
-- copies the manager path's validation, version and status checks, review
-- invalidation, audit, outbox notice, metric refresh and receipt (migration
-- 18). Saving a link never creates or renames a Drive file.
-- ===========================================================================

CREATE FUNCTION taskpulse_private.assignee_work_file_link(p_task uuid,p_payload jsonb,p_expected_version bigint,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE role public.user_role; t public.tasks; receipt taskpulse_private.command_receipts; request jsonb:=jsonb_build_array(p_task,'link',p_payload,p_expected_version); result jsonb; link_id uuid; path text; BEGIN
 SELECT u.role INTO role FROM public.users u WHERE u.id=auth.uid() AND u.is_active FOR SHARE;
 IF role IS NULL OR NOT public.is_task_assignee(p_task) THEN RAISE EXCEPTION 'Assigned actor or task manager required' USING ERRCODE='42501'; END IF;
 IF p_operation IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'Invalid detail command' USING ERRCODE='23514'; END IF;
 IF p_payload-ARRAY['ipo_role','link_type','label','url','notes','employee_id','report_id']<>'{}' THEN RAISE EXCEPTION 'Explicit IPO role and label required' USING ERRCODE='23514'; END IF;
 IF p_payload->>'employee_id' IS NOT NULL OR p_payload->>'report_id' IS NOT NULL THEN RAISE EXCEPTION 'Task manager links related employees and reports' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'detail_link'||p_operation::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=auth.uid() AND command='detail_link' AND operation_id=p_operation;
 IF FOUND THEN IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='23514'; END IF; RETURN receipt.result_payload; END IF;
 SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task FOR UPDATE;
 IF p_expected_version IS DISTINCT FROM t.lifecycle_version THEN RAISE EXCEPTION 'Task changed; reload details' USING ERRCODE='40001'; END IF;
 IF t.status IN ('Done','Discarded') THEN RAISE EXCEPTION 'Reopen before content edits' USING ERRCODE='23514'; END IF;
 PERFORM taskpulse_private.assert_task_open_date(p_task,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
 IF p_payload->>'ipo_role' IS NULL OR p_payload->>'ipo_role' NOT IN ('input','process','output','reference') OR nullif(btrim(p_payload->>'label'),'') IS NULL OR length(p_payload->>'label')>120 THEN RAISE EXCEPTION 'Explicit IPO role and label required' USING ERRCODE='23514'; END IF;
 path:=nullif(p_payload->>'url','');
 IF path IS NULL OR path!~'^https?://' OR length(path)>2048 THEN RAISE EXCEPTION 'HTTP(S) asset URL required' USING ERRCODE='23514'; END IF;
 INSERT INTO public.task_links(task_id,ipo_role,link_type,label,url,notes,created_by)
  VALUES(p_task,p_payload->>'ipo_role',(p_payload->>'link_type')::public.task_link_type,p_payload->>'label',path,p_payload->>'notes',auth.uid()) RETURNING public.task_links.id INTO link_id;
 -- Link edits also invalidate previous reviews (as on the manager path).
 UPDATE public.tasks SET work_revision=work_revision+1,lifecycle_version=lifecycle_version+1 WHERE public.tasks.id=p_task;
 UPDATE public.task_reviewers SET review_approved=false,reviewed_at=NULL,reviewed_revision=NULL WHERE task_id=p_task;
 result:=jsonb_build_object('taskId',p_task,'id',link_id,'nativeState',CASE WHEN EXISTS(SELECT 1 FROM public.task_detail_instances WHERE task_id=p_task) THEN 'ready' ELSE 'not_initialized' END,'providerState','not_requested');
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id) VALUES(auth.uid(),role::text,'detail_link','tasks',p_task,ARRAY['task_content'],jsonb_build_object('fields',ARRAY(SELECT jsonb_object_keys(p_payload)),'path','assignee_work_file_link'),p_operation);
 INSERT INTO taskpulse_private.outbox_jobs(kind,entity_id,entity_version,operation_id,payload) SELECT 'task_details_invalidated',p_task,lifecycle_version,p_operation,jsonb_build_object('provider_requested',false) FROM public.tasks WHERE public.tasks.id=p_task;
 PERFORM taskpulse_private.refresh_task_metrics(p_task,p_operation,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date);
 result:=result||jsonb_build_object('version',(SELECT lifecycle_version FROM public.tasks WHERE public.tasks.id=p_task));
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload) VALUES(auth.uid(),'detail_link',p_operation,request,p_task,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.assignee_work_file_link(uuid,jsonb,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Same wrapper as migration 26, plus the assignee link path for non-managers.
CREATE OR REPLACE FUNCTION public.task_details_command(p_task uuid,p_command text,p_payload jsonb,p_expected_version bigint,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF p_command='rename_link' AND EXISTS(SELECT 1 FROM public.task_links WHERE id=(p_payload->>'id')::uuid AND provider_asset_key IS NOT NULL) THEN RAISE EXCEPTION 'Use provider rename for verified assets' USING ERRCODE='42501';END IF;
 IF p_command='link' AND NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.is_active AND u.role IN ('managing_director','project_engineer')) THEN
  RETURN taskpulse_private.assignee_work_file_link(p_task,p_payload,p_expected_version,p_operation);
 END IF;
 RETURN public.task_details_command_m05(p_task,p_command,p_payload,p_expected_version,p_operation);
END $$;
