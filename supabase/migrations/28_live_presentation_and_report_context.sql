-- M11 read-only presentation, detail visibility and prospective nonmetric history.
-- Existing score/award contracts and frozen report payloads are not rewritten.
BEGIN;
-- Reuse the installed M07 source adapter with a private entry point. Its
-- arithmetic and source selection are unchanged. Only M11's bounded, active,
-- employee/manager-authorized wrapper may request dated aggregate contexts.
DO $$ DECLARE definition text;start_pos integer;end_pos integer;BEGIN
 definition:=pg_get_functiondef('public.performance_source_context(date,date,timestamptz)'::regprocedure);
 definition:=replace(definition,'public.performance_source_context','taskpulse_private.presentation_performance_sources');
 start_pos:=strpos(definition,' -- Team aggregate rights');
 end_pos:=strpos(definition,' SELECT available_from INTO cutoff');
 IF start_pos=0 OR end_pos<=start_pos THEN RAISE EXCEPTION 'Expected installed M07 adapter boundary';END IF;
 definition:=substr(definition,1,start_pos-1)||substr(definition,end_pos);
 EXECUTE definition;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.presentation_performance_sources(date,date,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE taskpulse_private.presentation_contract(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),available_from timestamptz NOT NULL DEFAULT clock_timestamp());
INSERT INTO taskpulse_private.presentation_contract(singleton) VALUES(true);
CREATE TABLE taskpulse_private.presentation_history(
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,kind text NOT NULL,
 row_id uuid NOT NULL,task_id uuid,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),source jsonb NOT NULL);
CREATE INDEX m11_presentation_lookup ON taskpulse_private.presentation_history(kind,row_id,recorded_at DESC,sequence DESC);
CREATE TRIGGER m11_presentation_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.presentation_history FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();
CREATE FUNCTION taskpulse_private.observe_presentation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row jsonb;tid uuid;BEGIN
 row:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD)||'{"deleted":true}'::jsonb ELSE to_jsonb(NEW) END;
 IF TG_TABLE_NAME='tasks' THEN tid:=(row->>'id')::uuid;
 ELSIF TG_TABLE_NAME='task_dependencies' THEN tid:=(row->>'successor_task_id')::uuid;
 ELSE tid:=(row->>'task_id')::uuid;END IF;
 INSERT INTO taskpulse_private.presentation_history(kind,row_id,task_id,source) VALUES(TG_TABLE_NAME,(row->>'id')::uuid,tid,row);
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DO $$ DECLARE name text;BEGIN
 FOREACH name IN ARRAY ARRAY['tasks','task_links','task_dependencies','task_detail_sections'] LOOP
  EXECUTE format('INSERT INTO taskpulse_private.presentation_history(kind,row_id,task_id,source) SELECT %L,id,%s,to_jsonb(t) FROM public.%I t',name,CASE WHEN name='tasks' THEN 'id' WHEN name='task_dependencies' THEN 'successor_task_id' ELSE 'task_id' END,name);
  EXECUTE format('CREATE TRIGGER zz_m11_presentation AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION taskpulse_private.observe_presentation()',name);
 END LOOP;
END $$;
-- Checklist summaries capture only the existing M05 rollup, never another formula.
CREATE FUNCTION taskpulse_private.observe_checklist_presentation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE data jsonb;tid uuid;BEGIN
 data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF TG_TABLE_NAME='task_checklists' THEN tid:=(data->>'task_id')::uuid;
 ELSE SELECT task_id INTO tid FROM public.task_checklists WHERE id=(data->>'checklist_id')::uuid;END IF;
 IF tid IS NOT NULL THEN INSERT INTO taskpulse_private.presentation_history(kind,row_id,task_id,source) VALUES('checklist',tid,tid,taskpulse_private.checklist_rollup(tid));END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
INSERT INTO taskpulse_private.presentation_history(kind,row_id,task_id,source) SELECT 'checklist',task_id,task_id,taskpulse_private.checklist_rollup(task_id) FROM public.task_checklists;
CREATE TRIGGER zz_m11_checklist AFTER INSERT OR UPDATE OR DELETE ON public.task_checklists FOR EACH ROW EXECUTE FUNCTION taskpulse_private.observe_checklist_presentation();
CREATE TRIGGER zz_m11_checklist AFTER INSERT OR UPDATE OR DELETE ON public.checklist_nodes FOR EACH ROW EXECUTE FUNCTION taskpulse_private.observe_checklist_presentation();
CREATE TRIGGER zz_m11_checklist AFTER INSERT OR UPDATE OR DELETE ON public.checklist_sections FOR EACH ROW EXECUTE FUNCTION taskpulse_private.observe_checklist_presentation();
REVOKE ALL ON ALL TABLES IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION taskpulse_private.observe_presentation(),taskpulse_private.observe_checklist_presentation() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.live_presentation_context(p_from date,p_to_exclusive date,p_as_of timestamptz,p_employee uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE role text:=public.get_user_role();sources jsonb;cutoff timestamptz;known boolean;tasks jsonb;checklists jsonb;assets jsonb;relations jsonb;logs jsonb;contributions jsonb;attendance jsonb;series jsonb;detail_user uuid;watermark text;BEGIN
 IF role IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'Active authenticated viewer required' USING ERRCODE='42501';END IF;
 IF p_employee IS NOT NULL AND NOT public.can_read_employee_details(p_employee) THEN RAISE EXCEPTION 'Employee/manager detail access required' USING ERRCODE='42501';END IF;
 IF p_employee IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_employee) THEN RAISE EXCEPTION 'Employee required' USING ERRCODE='23514';END IF;
 IF p_from IS NULL OR p_to_exclusive IS NULL OR p_to_exclusive<=p_from OR p_to_exclusive-p_from>62 OR p_as_of IS NULL OR p_as_of>clock_timestamp() OR NOT isfinite(p_as_of) THEN RAISE EXCEPTION 'Bounded nonfuture live context required' USING ERRCODE='23514';END IF;
 sources:=taskpulse_private.presentation_performance_sources(p_from,p_to_exclusive,p_as_of);
 SELECT available_from INTO cutoff FROM taskpulse_private.presentation_contract;known:=p_as_of>=cutoff;
 detail_user:=CASE WHEN p_employee IS NOT NULL THEN p_employee WHEN role IN ('managing_director','project_engineer') THEN NULL ELSE auth.uid() END;
 WITH latest AS(SELECT DISTINCT ON(kind,row_id) kind,row_id,task_id,sequence,source FROM taskpulse_private.presentation_history WHERE recorded_at<=p_as_of ORDER BY kind,row_id,recorded_at DESC,sequence DESC),selected AS(
 SELECT t.* FROM latest t WHERE kind='tasks' AND coalesce(source->>'deleted','false')='false' AND
 (p_employee IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(sources->'tasks') s WHERE s->>'id'=t.row_id::text AND (s->'participants'?p_employee::text OR s->'periodCredits'?p_employee::text)))
 ) SELECT coalesce(jsonb_agg(source ORDER BY row_id),'[]') INTO tasks FROM selected WHERE known;
 WITH latest AS(SELECT DISTINCT ON(kind,row_id) kind,row_id,task_id,source FROM taskpulse_private.presentation_history WHERE recorded_at<=p_as_of ORDER BY kind,row_id,recorded_at DESC,sequence DESC)
 SELECT coalesce(jsonb_agg(source||jsonb_build_object('taskId',task_id)) FILTER(WHERE kind='checklist'),'[]'),
 coalesce(jsonb_agg(source) FILTER(WHERE kind='task_links' AND (source->>'related_report_id' IS NULL OR EXISTS(SELECT 1 FROM public.report_snapshots r WHERE r.id=(source->>'related_report_id')::uuid AND public.can_read_employee_details(r.employee_id)))),'[]'),
 coalesce(jsonb_agg(source) FILTER(WHERE kind='task_dependencies'),'[]') INTO checklists,assets,relations
 FROM latest WHERE known AND coalesce(source->>'deleted','false')='false' AND EXISTS(SELECT 1 FROM jsonb_array_elements(tasks) t WHERE t->>'id'=task_id::text);
 WITH latest AS(SELECT DISTINCT ON(kind,record_id) kind,record_id,source FROM taskpulse_private.input_history WHERE recorded_at<=p_as_of ORDER BY kind,record_id,recorded_at DESC,sequence DESC)
 SELECT coalesce(jsonb_agg(source) FILTER(WHERE kind='effort' AND source->>'reversed_at' IS NULL AND (detail_user IS NULL OR source->>'user_id'=detail_user::text) AND (source->>'log_date')::date>=p_from AND (source->>'log_date')::date<p_to_exclusive AND (source->>'log_date')::date<=(p_as_of AT TIME ZONE 'Asia/Kolkata')::date),'[]'),
 coalesce(jsonb_agg(jsonb_build_object('kind',kind,'source',source)) FILTER(WHERE kind IN ('fact','idea','suggestion','sale','meeting') AND (detail_user IS NULL OR source->>CASE WHEN kind='sale' THEN 'sales_by' WHEN kind='meeting' THEN 'posted_by' ELSE 'posted_by' END=detail_user::text) AND
 (source->>CASE kind WHEN 'fact' THEN 'fact_date' WHEN 'idea' THEN 'idea_date' WHEN 'suggestion' THEN 'suggestion_date' WHEN 'sale' THEN 'sale_date' ELSE 'meeting_date' END)::date>=p_from AND
 (source->>CASE kind WHEN 'fact' THEN 'fact_date' WHEN 'idea' THEN 'idea_date' WHEN 'suggestion' THEN 'suggestion_date' WHEN 'sale' THEN 'sale_date' ELSE 'meeting_date' END)::date<least(p_to_exclusive,(p_as_of AT TIME ZONE 'Asia/Kolkata')::date+1)),'[]') INTO logs,contributions FROM latest;
 SELECT coalesce(jsonb_agg(taskpulse_private.attendance_inputs(u.id,p_from,p_to_exclusive,p_as_of)),'[]') INTO attendance FROM public.users u WHERE (detail_user IS NULL OR u.id=detail_user) AND (u.is_active OR u.id=p_employee);
 SELECT coalesce(jsonb_agg(jsonb_build_object('date',day::date,'sources',taskpulse_private.presentation_performance_sources(p_from,day::date+1,least(p_as_of,((day::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata')-interval '1 millisecond'))) ORDER BY day),'[]') INTO series
 FROM generate_series(p_from::timestamp,least(p_to_exclusive-1,(p_as_of AT TIME ZONE 'Asia/Kolkata')::date)::timestamp,interval '1 day') day WHERE p_employee IS NOT NULL;
 SELECT coalesce(max(sequence),0)::text INTO watermark FROM taskpulse_private.presentation_history WHERE recorded_at<=p_as_of;
 RETURN jsonb_build_object('contract','m11-live-presentation-v1','sources',sources,'presentationAvailable',known,'presentationAvailableFrom',cutoff,'presentationWatermark',watermark,
 'scope',CASE WHEN p_employee IS NOT NULL THEN 'employee_detail' WHEN detail_user IS NULL THEN 'manager_team_detail' ELSE 'team_summary_with_own_details' END,'detailUserId',detail_user,
 'tasks',tasks,'checklists',checklists,'assets',assets,'relations',relations,'logs',logs,'contributions',contributions,'attendance',attendance,'series',series);
END $$;
REVOKE ALL ON FUNCTION public.live_presentation_context(date,date,timestamptz,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.live_presentation_context(date,date,timestamptz,uuid) TO authenticated;
COMMIT;
