-- M17 Sales factor mapping (user decision D05, 20 October 2026).
-- The workbook's B_Summary & Analysis!BQ6 computes (1.5*BO + 1*BN + 0.75*BP)/50 per
-- member, but BN/BO/BP had no headers or formulas, so sales was always unavailable
-- and every composite score, ranking, award and certified archive stayed blocked.
-- The user defined them as flag counts over the member's sales_logs in the period:
--   BN = entries, BO = entries with is_new_project, BP = entries with basement_payment_received.
-- Validation treatment mirrors daily facts/ideas/suggestions (M06): pending and
-- validated entries count once; rejected/withdrawn are excluded; legacy, unattributed
-- or self/undated validations leave the factor unavailable with its reason. No sales
-- entries is a measured zero. Business date is sale_date with the M06 as-of rules.
-- The factor is still the difference from the team median (M07 engine, unchanged).
-- Forward of 44 (45 is M16 streaks, independent). Replaces the latest bodies from 20 and 21.
BEGIN;

-- Pure source arithmetic only: no eligibility cohort, median subtraction or composite score.
-- NULL p_user is a source-wide total; each employee also has an explicit factor input.
-- Facts, ideas and suggestions are unchanged from migration 20.
-- Sales (D05, approved 20 October 2026): BN = eligible entries, BO = eligible entries
-- flagged as a new project, BP = eligible entries with the basement payment received.
-- raw = (1.5*BO + BN + 0.75*BP)/50 = (6*BO + 4*BN + 3*BP)/200, always exact in three decimals.
CREATE OR REPLACE FUNCTION taskpulse_private.contribution_raw_inputs(p_sources jsonb,p_known boolean,p_user uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k text;validated bigint;pending bigint;unknown boolean;flags_missing boolean;bn bigint;bo bigint;bp bigint;reasons text[];result jsonb:='{}';raw numeric;entry jsonb; BEGIN
 FOREACH k IN ARRAY ARRAY['fact','idea','suggestion','sale'] LOOP
  SELECT count(*) FILTER(WHERE s->>'state'='validated'),count(*) FILTER(WHERE s->>'state'='pending'),
   coalesce(bool_or(s->>'state' NOT IN ('rejected','withdrawn') AND
    (s->>'attributedTo' IS NULL OR s->>'state'='legacy_unvalidated' OR
     (s->>'state'='validated' AND (s->>'validatedAt' IS NULL OR s->>'validator' IS NULL OR s->>'validator'=s->>'attributedTo')))),false),
   count(*) FILTER(WHERE s->>'state' IN ('validated','pending') AND s->'salesFields'->'isNewProject'='true'::jsonb),
   count(*) FILTER(WHERE s->>'state' IN ('validated','pending') AND s->'salesFields'->'basementPaymentReceived'='true'::jsonb),
   coalesce(bool_or(s->>'state' IN ('validated','pending') AND
    (jsonb_typeof(s->'salesFields'->'isNewProject') IS DISTINCT FROM 'boolean' OR jsonb_typeof(s->'salesFields'->'basementPaymentReceived') IS DISTINCT FROM 'boolean')),false)
   INTO validated,pending,unknown,bo,bp,flags_missing FROM jsonb_array_elements(p_sources) s
   WHERE s->>'kind'=k AND (p_user IS NULL OR s->>'attributedTo'=p_user::text OR s->>'attributedTo' IS NULL);
  bn:=validated+pending;
  reasons:=array_remove(ARRAY[CASE WHEN NOT p_known THEN 'history_before_input_baseline' END,
   CASE WHEN unknown THEN 'legacy_population_or_validation_provenance_missing' END,
   CASE WHEN k='sale' AND flags_missing THEN 'sales_flags_missing' END],NULL);
  raw:=CASE WHEN cardinality(reasons)>0 THEN NULL
   WHEN k='sale' THEN trim_scale((1.5*bo+bn+0.75*bp)/50)
   ELSE validated*CASE WHEN k='fact' THEN 0.75 ELSE 2 END+pending*CASE WHEN k='fact' THEN 0.38 ELSE 0.75 END END;
  entry:=jsonb_build_object('available',cardinality(reasons)=0,'rawValue',raw,'validatedCount',validated,'eligibleUnvalidatedCount',pending,'reasons',reasons);
  IF k='sale' THEN entry:=entry||jsonb_build_object('salesCounts',jsonb_build_object('BN',bn,'BO',bo,'BP',bp)); END IF;
  result:=result||jsonb_build_object(k,entry);
 END LOOP;RETURN result;
END $$;

CREATE OR REPLACE FUNCTION taskpulse_private.contribution_inputs(p_from date,p_to_exclusive date,p_as_of timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE cutoff timestamptz;known boolean;sources jsonb;populations jsonb;factors jsonb;employees jsonb; BEGIN
 IF p_from IS NULL OR p_to_exclusive IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to_exclusive) OR p_to_exclusive<=p_from OR p_to_exclusive-p_from>366 OR p_as_of IS NULL OR NOT isfinite(p_as_of) OR p_as_of>clock_timestamp() THEN RAISE EXCEPTION 'Explicit valid period and nonfuture as-of instant required' USING ERRCODE='23514'; END IF;
 SELECT available_from INTO cutoff FROM taskpulse_private.input_contract;known:=p_as_of>=cutoff;
 WITH snapshots AS (
  SELECT DISTINCT ON(kind,record_id) kind,record_id,record_version,recorded_at,source FROM taskpulse_private.input_history
  WHERE kind IN ('fact','idea','suggestion','sale') AND recorded_at<=p_as_of ORDER BY kind,record_id,recorded_at DESC,sequence DESC
 ), dated AS (
  SELECT *,source->>CASE kind WHEN 'fact' THEN 'fact_date' WHEN 'idea' THEN 'idea_date' WHEN 'suggestion' THEN 'suggestion_date' ELSE 'sale_date' END business_date,
   source->>CASE WHEN kind='sale' THEN 'sales_by' ELSE 'posted_by' END author FROM snapshots
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',record_id,'kind',kind,'version',record_version,'attributedTo',author,'businessDate',business_date,
  'state',source->>'validation_state','validator',source->>'validated_by','validatedAt',source->>'validation_at','observedAt',recorded_at,
  'salesFields',CASE WHEN kind='sale' THEN jsonb_build_object('builtUpAreaSource',source->>'project_built_up_area','isNewProject',source->'is_new_project','basementPaymentReceived',source->'basement_payment_received') END,
  'provenanceReason',CASE WHEN author IS NULL THEN 'legacy_author_missing' WHEN source->>'validation_state'='legacy_unvalidated' THEN 'legacy_population_unknown'
   WHEN source->>'validation_state'='validated' AND (source->>'validation_at' IS NULL OR source->>'validated_by' IS NULL OR source->>'validated_by'=author) THEN 'legacy_validation_provenance_missing' END,
  'exclusionReason',CASE WHEN source->>'validation_state' IN ('rejected','withdrawn') THEN source->>'validation_state' END) ORDER BY kind,record_id),'[]') INTO sources
 FROM dated WHERE business_date::date>=p_from AND business_date::date<p_to_exclusive AND business_date::date<=(p_as_of AT TIME ZONE 'Asia/Kolkata')::date;
 SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') INTO populations FROM (SELECT s->>'kind' kind,s->>'attributedTo' author,s->>'state' state,count(*) count FROM jsonb_array_elements(sources) s GROUP BY 1,2,3) c;
 factors:=taskpulse_private.contribution_raw_inputs(sources,known);
 -- Listing source inputs for all known identities does not choose a scoring cohort.
 SELECT coalesce(jsonb_agg(jsonb_build_object('userId',u.id,'factors',taskpulse_private.contribution_raw_inputs(sources,known,u.id)) ORDER BY u.id),'[]') INTO employees FROM public.users u;
 RETURN jsonb_build_object('ruleVersion','m06-support-inputs-v3','periodStart',p_from,'periodEndExclusive',p_to_exclusive,'asOf',p_as_of,
  'historyAvailableFrom',cutoff,'historyAvailable',known,
  'available',(SELECT coalesce(bool_and((f.value->>'available')::boolean),false) FROM jsonb_each(factors) f),
  'reasons',ARRAY(SELECT DISTINCT r FROM jsonb_each(factors) f CROSS JOIN LATERAL jsonb_array_elements_text(f.value->'reasons') r ORDER BY r),
  'sources',sources,'populations',populations,'factors',factors,'employeeFactors',employees,
  'raw',jsonb_build_object('fact',factors->'fact'->'rawValue','idea',factors->'idea'->'rawValue','suggestion',factors->'suggestion'->'rawValue','sale',factors->'sale'->'rawValue'),
  'coefficients',jsonb_build_object('fact',jsonb_build_array(0.75,0.38),'idea',jsonb_build_array(2,0.75),'suggestion',jsonb_build_array(2,0.75),'sale',jsonb_build_object('BO',1.5,'BN',1,'BP',0.75,'divisor',50)),
  'salesMapping',jsonb_build_object('approved','2026-10-20','decision','D05',
   'BN','eligible (validated or pending) sales_logs entries attributed to the member by sales_by',
   'BO','BN entries with is_new_project',
   'BP','BN entries with basement_payment_received',
   'businessDate','sale_date'));
END $$;

REVOKE ALL ON FUNCTION taskpulse_private.contribution_raw_inputs(jsonb,boolean,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION taskpulse_private.contribution_inputs(date,date,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

-- Replacing a function body records no observation, so the M08 invalidation trigger
-- never fires. Re-queue every open award day once so blocked runs are recomputed with
-- sales available. Frozen days (closed month, legacy snapshot, Final report) are left
-- alone: they certify only through a director month revision (M12). Each slot is
-- handled in its own company's scope.
DO $$ DECLARE s record; BEGIN
 FOR s IN SELECT id,business_date,organization_id FROM taskpulse_private.award_slots ORDER BY organization_id,business_date LOOP
  PERFORM set_config('taskpulse.organization',coalesce(s.organization_id::text,''),true);
  IF NOT taskpulse_private.award_date_frozen(s.business_date) THEN
   PERFORM taskpulse_private.queue_award(s.business_date,true);
   INSERT INTO taskpulse_private.audit_events(organization_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
   VALUES(s.organization_id,'system','invalidate_award','award_slots',s.id,ARRAY['stale','version'],jsonb_build_object('sourceTable','46_sales_factor_mapping'),gen_random_uuid());
  END IF;
 END LOOP;
 PERFORM set_config('taskpulse.organization','',true);
END $$;
COMMIT;
SELECT taskpulse_private.m15_secure();
