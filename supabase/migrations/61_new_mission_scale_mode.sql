-- Migration 61: choose a new mission's scale mode when it is created, and a
-- company default for that choice (Settings > Company > New missions).
--
-- Until now a mission made in the New mission dialog always started with a
-- manual scale; a formula scale (hours logged x 12.5 x multiplier, or a
-- numeric activity count x unit scale) could only be set afterwards from the
-- mission's Lifecycle and scale panel. Month setup already creates a mission
-- and then applies its standing scale mode in the same transaction (55); this
-- gives the dialog the same path.
--
-- 1. organization_settings.default_scale_mode ('manual' for every existing
--    company, so nothing changes until a director picks another default).
-- 2. company_settings() returns it as defaultScaleMode; company_settings_command
--    gains the 'mission_defaults' section to change it (same version, receipt
--    and audit rules as the other sections). Both are patched by replacing one
--    known fragment of the deployed definition, as 52 and 53 did.
-- 3. public.create_task_with_scale(...): one call that runs the existing
--    save_task_with_participants (scale 0) and the existing versioned
--    task_lifecycle_command 'scale', with its own receipt so a retried request
--    returns the same mission. Manual missions keep using
--    save_task_with_participants unchanged.
--
-- No scoring, eligibility or scale rule changes: the scale command validates
-- the inputs and derive_scale computes the value exactly as before, and the
-- z_m03_task_state trigger keeps eligibility in step as the scale changes.

BEGIN;

ALTER TABLE taskpulse_private.organization_settings
 ADD COLUMN default_scale_mode text NOT NULL DEFAULT 'manual'
  CHECK (default_scale_mode IN ('manual','hours','activity_count'));

DO $$
DECLARE def text; fn regprocedure; frag text; spec record; BEGIN
 FOR spec IN SELECT * FROM (VALUES
  ('public.company_settings()',
   '''categoryOverrides'',coalesce(s.category_overrides,''{}''::jsonb),',
   '''categoryOverrides'',coalesce(s.category_overrides,''{}''::jsonb),
  ''defaultScaleMode'',coalesce(s.default_scale_mode,''manual''),'),
  ('public.company_settings_command(text,jsonb,bigint,uuid)',
   'p_section NOT IN (''agenda'',''categories'',''meeting_types'',''standing_missions'',''holidays'')',
   'p_section NOT IN (''agenda'',''categories'',''meeting_types'',''standing_missions'',''holidays'',''mission_defaults'')'),
  ('public.company_settings_command(text,jsonb,bigint,uuid)',
   'ELSIF p_section=''categories'' THEN',
   'ELSIF p_section=''mission_defaults'' THEN
  IF p_payload-''scaleMode''<>''{}'' OR jsonb_typeof(p_payload->''scaleMode'') IS DISTINCT FROM ''string''
   OR p_payload->>''scaleMode'' NOT IN (''manual'',''hours'',''activity_count'') THEN
   RAISE EXCEPTION ''A default scale mode of manual, hours or activity_count is required'' USING ERRCODE=''23514''; END IF;
  UPDATE taskpulse_private.organization_settings SET default_scale_mode=p_payload->>''scaleMode'' WHERE organization_id=org;

 ELSIF p_section=''categories'' THEN')
 ) v(sig,old_text,new_text) LOOP
  fn:=spec.sig::regprocedure; frag:=spec.old_text;
  def:=pg_catalog.pg_get_functiondef(fn);
  IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
   RAISE EXCEPTION '% no longer has exactly one "%"; update migration 61',spec.sig,frag; END IF;
  EXECUTE replace(def,frag,spec.new_text);
 END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Create a mission with an hours or activity-count scale in one transaction
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.create_task_with_scale(p_fields jsonb,p_assignees uuid[],p_reviewers uuid[],p_share_units integer[],
 p_accept_legacy boolean,p_scale jsonb,p_operation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); receipt taskpulse_private.command_receipts; request jsonb; target uuid; version bigint;
 mode text:=p_scale->>'mode'; BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.is_active
   AND u.role IN ('managing_director','project_engineer')) THEN
  RAISE EXCEPTION 'Active task manager required' USING ERRCODE='42501'; END IF;
 IF p_operation_id IS NULL OR jsonb_typeof(p_fields) IS DISTINCT FROM 'object' OR jsonb_typeof(p_scale) IS DISTINCT FROM 'object'
  OR p_scale-ARRAY['mode','inputs']<>'{}' OR mode IS NULL OR mode NOT IN ('hours','activity_count') OR p_fields?'task_scale' THEN
  RAISE EXCEPTION 'A new mission with an hours or activity-count scale (and no fixed weight) is required' USING ERRCODE='23514'; END IF;
 request:=jsonb_build_array(p_fields,p_assignees,p_reviewers,p_share_units,p_accept_legacy,p_scale);
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||'create_task_with_scale'||p_operation_id::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts
 WHERE actor_id=actor AND command='create_task_with_scale' AND operation_id=p_operation_id;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation key reused with different input' USING ERRCODE='23514'; END IF;
  RETURN receipt.result;
 END IF;
 target:=public.save_task_with_participants(NULL,p_fields||jsonb_build_object('task_scale',0),p_assignees,p_reviewers,
  p_share_units,NULL,p_accept_legacy,md5(p_operation_id::text||':save')::uuid);
 SELECT t.lifecycle_version INTO version FROM public.tasks t WHERE t.id=target;
 PERFORM public.task_lifecycle_command(target,'scale',jsonb_build_object('mode',mode,'inputs',p_scale->'inputs','override',NULL,
  'reason','Chosen when the mission was created',
  'provenance','New mission ('||CASE mode WHEN 'hours' THEN 'hours logged' ELSE 'activity count' END||')'),
  version,md5(p_operation_id::text||':scale')::uuid);
 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,'create_task_with_scale',p_operation_id,request,target,to_jsonb(target));
 RETURN target;
END $$;
REVOKE ALL ON FUNCTION public.create_task_with_scale(jsonb,uuid[],uuid[],integer[],boolean,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_task_with_scale(jsonb,uuid[],uuid[],integer[],boolean,jsonb,uuid) TO authenticated;

COMMIT;
SELECT taskpulse_private.m15_secure();
