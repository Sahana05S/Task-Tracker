-- M10: no account, root, credentials or sharing defaults. Owner-reviewed sandbox
-- configuration is deliberately NULL. Sidecars are receipts, not another queue.
BEGIN;
CREATE TABLE taskpulse_private.drive_configuration(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),policy jsonb);
INSERT INTO taskpulse_private.drive_configuration VALUES(true,NULL);
CREATE TABLE taskpulse_private.drive_requests(
 job_id uuid PRIMARY KEY REFERENCES taskpulse_private.outbox_jobs(id) ON DELETE RESTRICT,
 task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE RESTRICT,actor_id uuid NOT NULL REFERENCES public.users(id),
 command text NOT NULL CHECK(command IN ('initialize','blank','copy_template','rename','carryover_shortcut')),
 request jsonb NOT NULL,policy jsonb,context jsonb NOT NULL,steps jsonb,
 init_key text UNIQUE,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE taskpulse_private.drive_assets(
 account_scope text NOT NULL,asset_key text NOT NULL,owner_id uuid NOT NULL,state jsonb NOT NULL DEFAULT '{"externalId":null,"reservedId":null,"dispatched":false,"verified":null}',
 job_id uuid,lease_token uuid,locked_until timestamptz,PRIMARY KEY(account_scope,asset_key));
CREATE TABLE taskpulse_private.drive_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,job_id uuid NOT NULL REFERENCES taskpulse_private.drive_requests(job_id),
 asset_key text,phase text NOT NULL,lease_token uuid,at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TRIGGER m10_events_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.drive_events FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();
ALTER TABLE public.task_links ADD COLUMN provider_asset_key text;
CREATE UNIQUE INDEX m10_verified_link ON public.task_links(task_id,provider_asset_key) WHERE provider_asset_key IS NOT NULL;
REVOKE ALL ON ALL TABLES IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE INSERT(provider_asset_key),UPDATE(provider_asset_key) ON public.task_links FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION taskpulse_private.enqueue_drive(p_task uuid,p_command text,p_payload jsonb,p_operation uuid) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE t public.tasks;cfg jsonb;ctx jsonb;job uuid;init text;v bigint;BEGIN
 SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task FOR UPDATE;
 SELECT policy INTO cfg FROM taskpulse_private.drive_configuration;
 IF p_command='initialize' THEN
  init:=p_task::text;
  SELECT job_id INTO job FROM taskpulse_private.drive_requests WHERE init_key=init;
  IF FOUND THEN
   IF cfg IS NOT NULL THEN
    UPDATE taskpulse_private.drive_requests SET policy=cfg WHERE job_id=job AND policy IS NULL AND steps IS NULL;
    IF FOUND THEN UPDATE taskpulse_private.outbox_jobs SET status='pending',last_error_code=NULL,available_at=clock_timestamp() WHERE id=job AND status='blocked';END IF;
   END IF;RETURN job;
  END IF;
 END IF;
 ctx:=jsonb_build_object('taskTag',t.task_tag,'taskTitle',t.title,'employeeUserId',t.assignee_id,
 'employeeId',(SELECT employee_id FROM public.users WHERE id=t.assignee_id),
 'templateVersionId',(SELECT template_version_id FROM public.task_detail_instances WHERE task_id=p_task),
 'reviewerIds',coalesce((SELECT jsonb_agg(uid ORDER BY uid) FROM (SELECT user_id uid FROM public.task_reviewers WHERE task_id=p_task UNION SELECT reviewer_id FROM public.tasks WHERE id=p_task AND reviewer_id IS NOT NULL) reviewers),'[]'));
 job:=gen_random_uuid();v:=1+coalesce((SELECT max(entity_version) FROM taskpulse_private.outbox_jobs WHERE kind='drive_operation' AND entity_id=p_task),0);
 INSERT INTO taskpulse_private.outbox_jobs(id,kind,entity_id,entity_version,operation_id,payload,status,last_error_code)
 VALUES(job,'drive_operation',p_task,v,p_operation,'{}',CASE WHEN cfg IS NULL THEN 'blocked' ELSE 'pending' END,CASE WHEN cfg IS NULL THEN 'configuration_missing' END);
 INSERT INTO taskpulse_private.drive_requests(job_id,task_id,actor_id,command,request,policy,context,init_key)
 VALUES(job,p_task,auth.uid(),p_command,p_payload,cfg,ctx,init);
 UPDATE public.task_detail_instances SET provider_state='pending' WHERE task_id=p_task;
 INSERT INTO taskpulse_private.drive_events(job_id,phase) VALUES(job,'queued');
 RETURN job;
END $$;
-- One native initialization hook serves both M04 entry paths. No approved
-- configuration means no automatic request and no provider dependency.
ALTER FUNCTION taskpulse_private.initialize_native_details(uuid,uuid,uuid) RENAME TO initialize_native_details_m05;
CREATE FUNCTION taskpulse_private.initialize_native_details(p_task uuid,p_template uuid,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE result jsonb;cfg jsonb;job uuid;state text;BEGIN
 result:=taskpulse_private.initialize_native_details_m05(p_task,p_template,p_operation);
 SELECT policy INTO cfg FROM taskpulse_private.drive_configuration;
 IF result->>'nativeState'='ready' AND cfg->>'sandbox'='true' AND cfg->>'autoInitialize'='true' THEN
  job:=taskpulse_private.enqueue_drive(p_task,'initialize','{}',p_operation);
  SELECT CASE WHEN status='complete' THEN 'succeeded' WHEN status IN ('blocked','failed') THEN 'failed' ELSE 'pending' END INTO state FROM taskpulse_private.outbox_jobs WHERE id=job;
  result:=jsonb_set(result,'{providerState}',to_jsonb(state));
 END IF;RETURN result;
END $$;
CREATE FUNCTION public.drive_command(p_task uuid,p_command text,p_payload jsonb,p_expected_version bigint,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.tasks;r taskpulse_private.command_receipts;request jsonb:=jsonb_build_array(p_task,p_command,p_payload,p_expected_version);result jsonb;job uuid;cfg jsonb;BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active AND role IN ('managing_director','project_engineer')) THEN RAISE EXCEPTION 'Active task manager required' USING ERRCODE='42501';END IF;
 IF p_operation IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'Operation and object payload required' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('name','ipoRole','fileKind','templateKey','assetKey','jobId')) THEN RAISE EXCEPTION 'Only command fields accepted; no credentials or provider overrides' USING ERRCODE='23514';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-domain-writes',0));
 SELECT * INTO t FROM public.tasks WHERE id=p_task FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Task required' USING ERRCODE='23514';END IF;
 PERFORM taskpulse_private.assert_task_writable(p_task);
 SELECT * INTO r FROM taskpulse_private.command_receipts WHERE actor_id=auth.uid() AND command='drive' AND operation_id=p_operation;
 IF FOUND THEN IF r.request IS DISTINCT FROM request THEN RAISE EXCEPTION 'Operation reused' USING ERRCODE='40001';END IF;RETURN r.result_payload;END IF;
 IF t.lifecycle_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Reload task version' USING ERRCODE='40001';END IF;
 IF p_command='retry' THEN
  SELECT job_id INTO job FROM taskpulse_private.drive_requests WHERE job_id=(p_payload->>'jobId')::uuid AND task_id=p_task;
  IF job IS NULL THEN RAISE EXCEPTION 'Task job required' USING ERRCODE='42501';END IF;
  UPDATE taskpulse_private.drive_requests SET policy=(SELECT policy FROM taskpulse_private.drive_configuration) WHERE job_id=job AND policy IS NULL AND steps IS NULL;
  UPDATE taskpulse_private.outbox_jobs SET status='pending',available_at=clock_timestamp() WHERE id=job AND status IN ('failed','blocked');
  IF NOT FOUND THEN RAISE EXCEPTION 'Failed or blocked job required' USING ERRCODE='23514';END IF;
 ELSE
  IF p_command NOT IN ('initialize','blank','copy_template','rename','carryover_shortcut') OR p_command IS NULL THEN RAISE EXCEPTION 'Unsupported provider command' USING ERRCODE='23514';END IF;
  IF p_command IN ('blank','rename') AND (nullif(btrim(p_payload->>'name'),'') IS NULL OR length(p_payload->>'name')>300) THEN RAISE EXCEPTION 'Name required' USING ERRCODE='23514';END IF;
  IF p_command='blank' AND (coalesce(p_payload->>'fileKind','') NOT IN ('document','sheet','slides','drawing','form') OR coalesce(p_payload->>'ipoRole','') NOT IN ('input','process','output')) THEN RAISE EXCEPTION 'Explicit kind and role required' USING ERRCODE='23514';END IF;
  IF p_command='copy_template' AND coalesce(p_payload->>'templateKey','')!~'^[A-Za-z0-9_-]{1,80}$' THEN RAISE EXCEPTION 'Configured template key required' USING ERRCODE='23514';END IF;
  SELECT policy INTO cfg FROM taskpulse_private.drive_configuration;
  IF p_command='rename' AND NOT EXISTS(SELECT 1 FROM taskpulse_private.drive_assets WHERE account_scope=cfg->>'accountScope' AND asset_key=p_payload->>'assetKey' AND owner_id=p_task AND state->'verified'->>'id' IS NOT NULL) THEN RAISE EXCEPTION 'Verified task provider asset required' USING ERRCODE='42501';END IF;
  IF p_command='carryover_shortcut' AND NOT EXISTS(SELECT 1 FROM taskpulse_private.tool_lineage WHERE task_id=p_task AND command='carryover') THEN RAISE EXCEPTION 'Approved carryover lineage required' USING ERRCODE='23514';END IF;
  PERFORM taskpulse_private.initialize_native_details_m05(p_task,NULL,p_operation);
  IF NOT EXISTS(SELECT 1 FROM public.task_detail_instances WHERE task_id=p_task) THEN RAISE EXCEPTION 'Complete native task fields first' USING ERRCODE='23514';END IF;
  job:=taskpulse_private.enqueue_drive(p_task,p_command,p_payload,p_operation);
 END IF;
 result:=jsonb_build_object('jobId',job,'providerState',(SELECT CASE WHEN status='complete' THEN 'succeeded' WHEN status IN ('blocked','failed') THEN 'failed' ELSE 'pending' END FROM taskpulse_private.outbox_jobs WHERE id=job));
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload) VALUES(auth.uid(),'drive',p_operation,request,job,result);
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(auth.uid(),public.get_user_role()::text,'drive_'||p_command,'tasks',p_task,ARRAY['provider_job'],jsonb_build_object('jobId',job),p_operation);
 RETURN result;
END $$;
CREATE FUNCTION taskpulse_private.drive_lease(p_job uuid,p_lease uuid) RETURNS taskpulse_private.drive_requests LANGUAGE plpgsql SET search_path='' AS $$
DECLARE j taskpulse_private.outbox_jobs;r taskpulse_private.drive_requests;cfg jsonb;BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Narrow Drive worker only' USING ERRCODE='42501';END IF;
 SELECT * INTO j FROM taskpulse_private.outbox_jobs WHERE id=p_job FOR UPDATE;
 IF NOT FOUND OR j.kind<>'drive_operation' OR j.status<>'running' OR j.lease_token IS DISTINCT FROM p_lease OR j.locked_until<=clock_timestamp() THEN RAISE EXCEPTION 'Current Drive lease required' USING ERRCODE='40001';END IF;
 SELECT * INTO STRICT r FROM taskpulse_private.drive_requests WHERE job_id=p_job;
 PERFORM taskpulse_private.assert_task_writable(r.task_id);
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=r.actor_id AND is_active AND role IN ('managing_director','project_engineer')) THEN RAISE EXCEPTION 'Active requesting manager required' USING ERRCODE='42501';END IF;
 SELECT policy INTO cfg FROM taskpulse_private.drive_configuration;
 IF cfg IS NULL THEN RAISE EXCEPTION 'Drive configuration missing' USING ERRCODE='40001';END IF;
 IF cfg IS DISTINCT FROM r.policy THEN RAISE EXCEPTION 'Drive configuration changed' USING ERRCODE='40001';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tasks t WHERE t.id=r.task_id AND t.assignee_id::text=r.context->>'employeeUserId' AND t.task_tag=r.context->>'taskTag' AND t.title=r.context->>'taskTitle')
 OR coalesce((SELECT jsonb_agg(uid ORDER BY uid) FROM (SELECT user_id uid FROM public.task_reviewers WHERE task_id=r.task_id UNION SELECT reviewer_id FROM public.tasks WHERE id=r.task_id AND reviewer_id IS NOT NULL) reviewers),'[]') IS DISTINCT FROM r.context->'reviewerIds' THEN RAISE EXCEPTION 'Drive task context changed' USING ERRCODE='40001';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(r.context->'reviewerIds') id WHERE NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=id::uuid AND u.is_active)) THEN RAISE EXCEPTION 'Drive task context changed' USING ERRCODE='40001';END IF;
 UPDATE taskpulse_private.outbox_jobs SET locked_until=clock_timestamp()+interval '5 minutes' WHERE id=p_job;
 RETURN r;
END $$;
CREATE FUNCTION public.claim_drive_jobs(p_limit integer DEFAULT 1) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Narrow Drive worker only' USING ERRCODE='42501';END IF;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>5 THEN RAISE EXCEPTION 'Bounded Drive batch required' USING ERRCODE='23514';END IF;
 WITH selected AS(SELECT id FROM taskpulse_private.outbox_jobs WHERE kind='drive_operation' AND available_at<=clock_timestamp() AND (status='pending' OR status='failed' AND last_error_code IN ('quota_limited','provider_unavailable','resource_busy') OR status='running' AND locked_until<clock_timestamp()) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit),claimed AS(
 UPDATE taskpulse_private.outbox_jobs j SET status='running',attempts=attempts+1,locked_until=clock_timestamp()+interval '5 minutes',lease_token=gen_random_uuid() FROM selected s WHERE j.id=s.id RETURNING j.id,j.lease_token)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'leaseToken',c.lease_token)),'[]') INTO result FROM claimed c;
 INSERT INTO taskpulse_private.drive_events(job_id,phase,lease_token) SELECT (x->>'id')::uuid,'claimed',(x->>'leaseToken')::uuid FROM jsonb_array_elements(result) x;
 RETURN result;
END $$;
CREATE FUNCTION public.drive_job_context(p_job uuid,p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r taskpulse_private.drive_requests;asset jsonb;prior jsonb;BEGIN
 r:=taskpulse_private.drive_lease(p_job,p_lease);
 SELECT state->'verified' INTO asset FROM taskpulse_private.drive_assets WHERE account_scope=r.policy->>'accountScope' AND asset_key=r.request->>'assetKey' AND owner_id=r.task_id;
 SELECT a.state->'verified' INTO prior FROM taskpulse_private.tool_lineage l JOIN taskpulse_private.drive_assets a ON a.asset_key='task:'||l.source_task_id::text AND a.account_scope=r.policy->>'accountScope' WHERE l.task_id=r.task_id AND l.command='carryover';
 RETURN r.context||jsonb_build_object('id',p_job,'leaseToken',p_lease,'taskId',r.task_id,'command',r.command,'request',r.request,'policy',r.policy,'steps',r.steps,'asset',asset,'predecessorAsset',prior);
END $$;
CREATE FUNCTION public.drive_job_plan(p_job uuid,p_lease uuid,p_steps jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r taskpulse_private.drive_requests;BEGIN
 r:=taskpulse_private.drive_lease(p_job,p_lease);
 IF jsonb_typeof(p_steps)<>'array' OR jsonb_array_length(p_steps)>500 THEN RAISE EXCEPTION 'Bounded manifest required' USING ERRCODE='23514';END IF;
 IF r.steps IS NOT NULL AND r.steps IS DISTINCT FROM p_steps THEN RAISE EXCEPTION 'Manifest immutable' USING ERRCODE='40001';END IF;
 UPDATE taskpulse_private.drive_requests SET steps=p_steps WHERE job_id=p_job;
 INSERT INTO taskpulse_private.drive_events(job_id,phase) VALUES(p_job,'manifest');
END $$;
CREATE FUNCTION public.drive_asset_checkpoint(p_job uuid,p_lease uuid,p_key text,p_state jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r taskpulse_private.drive_requests;a taskpulse_private.drive_assets;s jsonb;file jsonb;parent text;BEGIN
 r:=taskpulse_private.drive_lease(p_job,p_lease);
 SELECT value INTO s FROM jsonb_array_elements(r.steps) WHERE value->>'key'=p_key;
 IF s IS NULL THEN RAISE EXCEPTION 'Manifest asset required' USING ERRCODE='42501';END IF;
 INSERT INTO taskpulse_private.drive_assets(account_scope,asset_key,owner_id) VALUES(r.policy->>'accountScope',p_key,(s->>'owner')::uuid) ON CONFLICT DO NOTHING;
 SELECT * INTO a FROM taskpulse_private.drive_assets WHERE account_scope=r.policy->>'accountScope' AND asset_key=p_key FOR UPDATE;
 IF a.owner_id IS DISTINCT FROM (s->>'owner')::uuid THEN RAISE EXCEPTION 'Asset owner mismatch' USING ERRCODE='42501';END IF;
 IF a.locked_until>clock_timestamp() AND (a.job_id IS DISTINCT FROM p_job OR a.lease_token IS DISTINCT FROM p_lease) THEN RAISE EXCEPTION 'Drive resource busy' USING ERRCODE='40001';END IF;
 UPDATE taskpulse_private.drive_assets SET job_id=p_job,lease_token=p_lease,locked_until=clock_timestamp()+interval '5 minutes' WHERE account_scope=a.account_scope AND asset_key=p_key;
 IF p_state IS NOT NULL THEN
  IF a.state->>'reservedId' IS NOT NULL AND p_state->>'reservedId' IS DISTINCT FROM a.state->>'reservedId' THEN RAISE EXCEPTION 'Reserved identity immutable' USING ERRCODE='40001';END IF;
  IF a.state->>'externalId' IS NOT NULL AND p_state->>'externalId' IS DISTINCT FROM a.state->>'externalId' THEN RAISE EXCEPTION 'External identity immutable' USING ERRCODE='40001';END IF;
  file:=p_state->'verified';
  IF a.state->'verified' IS NOT NULL AND a.state->'verified'<>'null'::jsonb AND (file IS NULL OR file='null'::jsonb) THEN RAISE EXCEPTION 'Verified evidence cannot be erased' USING ERRCODE='40001';END IF;
  IF file IS NOT NULL AND file<>'null'::jsonb AND s->>'kind'<>'permission' THEN
   IF coalesce(file->>'trashed','false')<>'false' OR file->>'id' IS NULL OR file->>'mimeType' IS DISTINCT FROM s->>'mimeType' OR file->>'name' IS DISTINCT FROM s->>'name' OR file->'appProperties'->>'taskpulse' IS DISTINCT FROM encode(sha256(convert_to(a.account_scope||'|'||p_key,'UTF8')),'hex') THEN RAISE EXCEPTION 'Verified metadata required' USING ERRCODE='23514';END IF;
   IF p_state->>'externalId' IS DISTINCT FROM file->>'id' OR p_state->>'reservedId' IS NOT NULL AND p_state->>'reservedId' IS DISTINCT FROM file->>'id' THEN RAISE EXCEPTION 'Bound identity required' USING ERRCODE='23514';END IF;
   IF file->>'webViewLink' IS NOT NULL AND file->>'webViewLink'!~'^https://(drive|docs)\.google\.com/' THEN RAISE EXCEPTION 'Provider URL required' USING ERRCODE='23514';END IF;
   parent:=s->>'parent';
   IF s->>'parentKey' IS NOT NULL THEN SELECT state->'verified'->>'id' INTO parent FROM taskpulse_private.drive_assets WHERE account_scope=a.account_scope AND asset_key=s->>'parentKey';END IF;
   IF parent IS NULL OR NOT coalesce(file->'parents' @> jsonb_build_array(parent),false) THEN RAISE EXCEPTION 'Verified parent required' USING ERRCODE='23514';END IF;
  END IF;
  UPDATE taskpulse_private.drive_assets SET state=p_state WHERE account_scope=a.account_scope AND asset_key=p_key;
  INSERT INTO taskpulse_private.drive_events(job_id,asset_key,phase) VALUES(p_job,p_key,CASE WHEN file IS NOT NULL AND file<>'null'::jsonb THEN 'verified' WHEN p_state->>'dispatched'='true' THEN 'dispatched' ELSE 'reserved' END);
  IF file IS NOT NULL AND file<>'null'::jsonb AND s->>'owner'=r.task_id::text AND s->>'kind'<>'permission' THEN
   INSERT INTO public.task_links(task_id,ipo_role,link_type,label,url,created_by,provider_asset_key)
   VALUES(r.task_id,coalesce(s->>'ipoRole','reference'),CASE WHEN file->>'mimeType'='application/vnd.google-apps.folder' THEN 'Folder' ELSE 'Raw Link' END::public.task_link_type,file->>'name',file->>'webViewLink',r.actor_id,p_key)
   ON CONFLICT(task_id,provider_asset_key) WHERE provider_asset_key IS NOT NULL DO UPDATE SET label=excluded.label,url=excluded.url;
  END IF;
  RETURN p_state;
 END IF;RETURN a.state;
END $$;
CREATE FUNCTION public.finish_drive_job(p_job uuid,p_lease uuid,p_error text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j taskpulse_private.outbox_jobs;r taskpulse_private.drive_requests;prior text;BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Narrow Drive worker only' USING ERRCODE='42501';END IF;
 SELECT * INTO j FROM taskpulse_private.outbox_jobs WHERE id=p_job FOR UPDATE;
 SELECT phase INTO prior FROM taskpulse_private.drive_events WHERE job_id=p_job AND lease_token=p_lease AND phase<>'claimed';
 IF FOUND THEN IF prior IS DISTINCT FROM coalesce(p_error,'complete') THEN RAISE EXCEPTION 'Lease outcome cannot change' USING ERRCODE='40001';END IF;RETURN;END IF;
 IF j.id IS NULL OR j.kind<>'drive_operation' OR j.status<>'running' OR j.lease_token IS DISTINCT FROM p_lease OR j.locked_until<=clock_timestamp() THEN RAISE EXCEPTION 'Current Drive lease required' USING ERRCODE='40001';END IF;
 SELECT * INTO STRICT r FROM taskpulse_private.drive_requests WHERE job_id=p_job;
 IF p_error IS NULL THEN
  PERFORM taskpulse_private.drive_lease(p_job,p_lease);
  IF r.steps IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.steps) s LEFT JOIN taskpulse_private.drive_assets a ON a.account_scope=r.policy->>'accountScope' AND a.asset_key=s->>'key' WHERE a.state->'verified' IS NULL OR a.state->'verified'='null'::jsonb) THEN RAISE EXCEPTION 'All manifest steps must be verified' USING ERRCODE='23514';END IF;
 ELSIF p_error NOT IN ('configuration_missing','configuration_changed','credentials_missing','credentials_revoked','access_denied','root_unavailable','template_missing','template_changed','quota_limited','provider_unavailable','remote_uncertain','identity_mismatch','unsupported_type','sharing_failed','sharing_conflict','predecessor_asset_missing','task_archived','resource_busy') THEN RAISE EXCEPTION 'Safe error code required' USING ERRCODE='23514';END IF;
 UPDATE taskpulse_private.outbox_jobs SET status=CASE WHEN p_error IS NULL THEN 'complete' WHEN p_error IN ('quota_limited','provider_unavailable','resource_busy') THEN 'failed' ELSE 'blocked' END,last_error_code=p_error,available_at=clock_timestamp()+interval '5 minutes',lease_token=NULL,locked_until=NULL WHERE id=p_job;
 UPDATE taskpulse_private.drive_assets SET locked_until=NULL,lease_token=NULL,job_id=NULL WHERE job_id=p_job AND lease_token=p_lease;
 IF EXISTS(SELECT 1 FROM public.tasks WHERE id=r.task_id AND archived_effective_date IS NULL) THEN UPDATE public.task_detail_instances SET provider_state=CASE WHEN p_error IS NULL THEN 'succeeded' ELSE 'failed' END WHERE task_id=r.task_id;END IF;
 INSERT INTO taskpulse_private.drive_events(job_id,phase,lease_token) VALUES(p_job,coalesce(p_error,'complete'),p_lease);
 INSERT INTO taskpulse_private.audit_events(actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id) VALUES('service_role','finish_drive_job','outbox_jobs',p_job,ARRAY['status'],jsonb_build_object('errorCode',p_error),p_lease);
END $$;
CREATE FUNCTION public.drive_read_model() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'Active authentication required' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('configured',(SELECT policy IS NOT NULL FROM taskpulse_private.drive_configuration),'configuration',(SELECT jsonb_build_object('blankKinds',policy->'blankKinds','templates',coalesce((SELECT jsonb_agg(jsonb_build_object('key',key,'label',value->>'label')) FROM jsonb_each(policy->'templates')),'[]')) FROM taskpulse_private.drive_configuration),'jobs',coalesce((SELECT jsonb_agg(jsonb_build_object('id',j.id,'taskId',r.task_id,'command',r.command,'status',j.status,'attempts',j.attempts,'errorCode',j.last_error_code,'retryAfter',j.available_at,'assets',coalesce((SELECT jsonb_agg(jsonb_build_object('key',s->>'key','kind',s->>'kind','name',a.state->'verified'->>'name','url',a.state->'verified'->>'webViewLink','verified',a.state->'verified' IS NOT NULL AND a.state->'verified'<>'null'::jsonb)) FROM jsonb_array_elements(r.steps) s LEFT JOIN taskpulse_private.drive_assets a ON a.account_scope=r.policy->>'accountScope' AND a.asset_key=s->>'key'),'[]'))) FROM taskpulse_private.drive_requests r JOIN taskpulse_private.outbox_jobs j ON j.id=r.job_id),'[]'));
END $$;
-- Prevent the legacy label-only command from claiming a provider rename.
ALTER FUNCTION public.task_details_command(uuid,text,jsonb,bigint,uuid) RENAME TO task_details_command_m05;
CREATE FUNCTION public.task_details_command(p_task uuid,p_command text,p_payload jsonb,p_expected_version bigint,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF p_command='rename_link' AND EXISTS(SELECT 1 FROM public.task_links WHERE id=(p_payload->>'id')::uuid AND provider_asset_key IS NOT NULL) THEN RAISE EXCEPTION 'Use provider rename for verified assets' USING ERRCODE='42501';END IF;
 RETURN public.task_details_command_m05(p_task,p_command,p_payload,p_expected_version,p_operation);
END $$;
REVOKE ALL ON FUNCTION public.task_details_command_m05(uuid,text,jsonb,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='taskpulse_private' AND (p.proname LIKE '%drive%' OR p.proname IN ('initialize_native_details','initialize_native_details_m05')) LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.name);END LOOP;
 FOR f IN SELECT p.oid::regprocedure AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('drive_command','drive_read_model','claim_drive_jobs','drive_job_context','drive_job_plan','drive_asset_checkpoint','finish_drive_job','task_details_command') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.name);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',f.name,CASE WHEN f.name::text LIKE 'drive_command(%' OR f.name::text LIKE 'drive_read_model(%' OR f.name::text LIKE 'task_details_command(%' THEN 'authenticated' ELSE 'service_role' END);
 END LOOP;
END $$;
COMMIT;
