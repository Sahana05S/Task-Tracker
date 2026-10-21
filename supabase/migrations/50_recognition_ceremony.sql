-- ===========================================================================
-- TaskPulse - M16 recognition: the monthly award ceremony (forward only,
-- after 49; 50 was reserved for it on 20 October 2026)
--
-- The ceremony adds no scoring rule. For an elapsed month it publishes:
--   * one category award per performance factor: the highest raw value of
--     that factor in the shared ten-factor calculation (M07), among members
--     with the factor available, no attendance eligibility reason and a value
--     above zero; an exact tie at the top gives no winner (the M08 rule);
--   * the monthly star, derived here from the daily award slots exactly as
--     the M12 archive checks it (most certified effective daily wins,
--     overrides included; equal counts broken by the shared composite; an
--     exact tie gives no winner). It reads the live award evidence, so it does
--     not depend on a certified month archive (month-close certification is
--     not achievable yet).
--
-- The calculation comes from the app (the same engine every page uses), as
-- for the M12 close; it must be current (as-of within 15 minutes, current
-- source watermark), cover exactly the company's active members and carry all
-- ten factors. The database derives the winners from it itself, and refuses a
-- payload whose monthly star differs from the daily evidence.
--
-- Publication is managing-director only, idempotent per operation and
-- versioned: a republish (after a correction) is a new immutable revision
-- with a reason; the latest revision is the official ceremony. Recognition
-- points (hall of fame) are derived on read from the daily award slots and the
-- latest ceremony revisions; no points are stored and none feed a score.
-- ===========================================================================
BEGIN;

CREATE TABLE taskpulse_private.recognition_ceremonies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 period_start date NOT NULL CHECK (period_start=date_trunc('month',period_start)::date),
 revision_number integer NOT NULL CHECK (revision_number>0),
 prior_ceremony uuid REFERENCES taskpulse_private.recognition_ceremonies(id),
 published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 published_by uuid NOT NULL REFERENCES public.users(id),
 reason text NOT NULL CHECK (length(btrim(reason))>=8),
 as_of timestamptz NOT NULL,
 source_watermark text NOT NULL,
 rule_version text NOT NULL DEFAULT 'recognition-ceremony-v1',
 monthly_star jsonb NOT NULL CHECK (jsonb_typeof(monthly_star)='object'),
 monthly_star_winner uuid REFERENCES public.users(id),
 UNIQUE (organization_id,period_start,revision_number),
 CHECK ((revision_number=1)=(prior_ceremony IS NULL))
);
CREATE INDEX recognition_ceremonies_prior_idx ON taskpulse_private.recognition_ceremonies(prior_ceremony) WHERE prior_ceremony IS NOT NULL;
CREATE INDEX recognition_ceremonies_published_by_idx ON taskpulse_private.recognition_ceremonies(published_by);
CREATE INDEX recognition_ceremonies_star_idx ON taskpulse_private.recognition_ceremonies(monthly_star_winner) WHERE monthly_star_winner IS NOT NULL;

CREATE TABLE taskpulse_private.recognition_ceremony_awards (
 ceremony_id uuid NOT NULL REFERENCES taskpulse_private.recognition_ceremonies(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 category text NOT NULL CHECK (category IN ('productivity','criticality','loading','completion','progress','sales','facts','ideas','suggestions','freshness')),
 status text NOT NULL CHECK (status IN ('awarded','tie','no_eligible','unavailable')),
 winner_id uuid REFERENCES public.users(id),
 winning_raw jsonb CHECK (winning_raw IS NULL OR jsonb_typeof(winning_raw)='object'),
 tied_ids uuid[] NOT NULL DEFAULT '{}',
 reasons text[] NOT NULL DEFAULT '{}',
 PRIMARY KEY (ceremony_id,category),
 CHECK ((status='awarded')=(winner_id IS NOT NULL)),
 CHECK (status<>'tie' OR cardinality(tied_ids)>1)
);
CREATE INDEX recognition_ceremony_awards_winner_idx ON taskpulse_private.recognition_ceremony_awards(winner_id) WHERE winner_id IS NOT NULL;

CREATE TABLE taskpulse_private.recognition_ceremony_receipts (
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 actor_id uuid NOT NULL REFERENCES public.users(id),
 operation uuid NOT NULL,
 request jsonb NOT NULL,
 response jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (actor_id,operation)
);

CREATE TRIGGER m16_ceremony_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.recognition_ceremonies FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();
CREATE TRIGGER m16_ceremony_award_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.recognition_ceremony_awards FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();
CREATE TRIGGER m16_ceremony_receipt_immutable BEFORE UPDATE OR DELETE ON taskpulse_private.recognition_ceremony_receipts FOR EACH ROW EXECUTE FUNCTION taskpulse_private.input_history_immutable();

-- Company-owned private tables and the links that tell a row its company
-- (the 40 stamp trigger checks every linked row is in the same company).
INSERT INTO taskpulse_private.m15_tenant_tables(table_schema,table_name) VALUES
 ('taskpulse_private','recognition_ceremonies'),('taskpulse_private','recognition_ceremony_awards'),('taskpulse_private','recognition_ceremony_receipts')
ON CONFLICT DO NOTHING;
INSERT INTO taskpulse_private.m15_org_refs(table_schema,table_name,column_name,ref_schema,ref_table) VALUES
 ('taskpulse_private','recognition_ceremonies','published_by','public','users'),
 ('taskpulse_private','recognition_ceremonies','monthly_star_winner','public','users'),
 ('taskpulse_private','recognition_ceremonies','prior_ceremony','taskpulse_private','recognition_ceremonies'),
 ('taskpulse_private','recognition_ceremony_awards','ceremony_id','taskpulse_private','recognition_ceremonies'),
 ('taskpulse_private','recognition_ceremony_awards','winner_id','public','users'),
 ('taskpulse_private','recognition_ceremony_receipts','actor_id','public','users')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Daily award evidence for one company and month: the effective winner of
-- each certified, non-stale slot (an override replaces the automatic winner),
-- as in the M12 archive check (migration 29).
-- ---------------------------------------------------------------------------
CREATE FUNCTION taskpulse_private.recognition_daily_wins(p_org uuid,p_from date,p_to_exclusive date)
RETURNS TABLE(business_date date,decided boolean,winner uuid)
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT g.day::date,
  coalesce(NOT s.stale AND e.certified AND e.status IN ('completed_winner','completed_none'),false),
  CASE WHEN NOT s.stale AND e.certified AND e.status='completed_winner' THEN coalesce(o.user_id,e.winner_id) END
 FROM generate_series(p_from,p_to_exclusive-1,interval '1 day') g(day)
 LEFT JOIN taskpulse_private.award_slots s ON s.organization_id=p_org AND s.business_date=g.day::date
 LEFT JOIN taskpulse_private.award_runs e ON e.id=s.effective_run
 LEFT JOIN taskpulse_private.award_overrides o ON o.id=s.override_id;
$$;

-- ---------------------------------------------------------------------------
-- Category winners from a calculation (members[] of the M07 result).
-- ---------------------------------------------------------------------------
CREATE FUNCTION taskpulse_private.recognition_category(p_calc jsonb,p_factor text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 WITH m AS (
  SELECT x->>'userId' uid,x->'factors'->p_factor f,x->'reasons' rs FROM jsonb_array_elements(p_calc->'members') x
 ), avail AS (
  SELECT * FROM m WHERE f->>'available'='true' AND jsonb_typeof(f->'rawExact')='object'
 ), cand AS (
  SELECT uid,f->'rawExact' raw,(f->'rawExact'->>'numerator')::numeric n,(f->'rawExact'->>'denominator')::numeric d FROM avail
  WHERE NOT (coalesce(rs,'[]'::jsonb) ?| ARRAY['attendance_invalid','attendance_unavailable'])
   AND (f->'rawExact'->>'denominator')::numeric>0 AND (f->'rawExact'->>'numerator')::numeric>0
 ), top AS (
  SELECT c.* FROM cand c WHERE NOT EXISTS(SELECT 1 FROM cand o WHERE o.n*c.d>c.n*o.d)
 )
 SELECT CASE
  WHEN NOT EXISTS(SELECT 1 FROM avail) THEN jsonb_build_object('category',p_factor,'status','unavailable','winnerId',NULL,'winningRaw',NULL,'tiedIds','[]'::jsonb,
   'reasons',(SELECT coalesce(jsonb_agg(DISTINCT r ORDER BY r),'[]'::jsonb) FROM m,jsonb_array_elements_text(coalesce(m.f->'reasons','[]'::jsonb)) r))
  WHEN NOT EXISTS(SELECT 1 FROM cand) THEN jsonb_build_object('category',p_factor,'status','no_eligible','winnerId',NULL,'winningRaw',NULL,'tiedIds','[]'::jsonb,'reasons','[]'::jsonb)
  WHEN (SELECT count(*) FROM top)>1 THEN jsonb_build_object('category',p_factor,'status','tie','winnerId',NULL,'winningRaw',(SELECT raw FROM top LIMIT 1),
   'tiedIds',(SELECT jsonb_agg(uid ORDER BY uid) FROM top),'reasons','[]'::jsonb)
  ELSE (SELECT jsonb_build_object('category',p_factor,'status','awarded','winnerId',uid,'winningRaw',raw,'tiedIds','[]'::jsonb,'reasons','[]'::jsonb) FROM top)
 END;
$$;

-- ---------------------------------------------------------------------------
-- The monthly star from the daily evidence and the calculation's composite.
-- Mirrors scoring's selectMonthly for an elapsed month (every day required).
-- ---------------------------------------------------------------------------
CREATE FUNCTION taskpulse_private.recognition_monthly_star(p_org uuid,p_from date,p_calc jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE to_ex date:=(p_from+interval '1 month')::date; missing jsonb; counts jsonb; top integer; tied text[]; pick text;
 n numeric; d numeric; best_n numeric; best_d numeric; winners text[]:='{}'; score jsonb; BEGIN
 WITH w AS MATERIALIZED (SELECT * FROM taskpulse_private.recognition_daily_wins(p_org,p_from,to_ex))
 SELECT (SELECT coalesce(jsonb_agg(business_date ORDER BY business_date),'[]'::jsonb) FROM w WHERE NOT decided),
  (SELECT coalesce(jsonb_object_agg(winner,wins),'{}'::jsonb) FROM (SELECT winner::text winner,count(*) wins FROM w WHERE winner IS NOT NULL GROUP BY winner) c)
 INTO missing,counts;
 IF jsonb_array_length(missing)>0 THEN
  RETURN jsonb_build_object('status','incomplete','winnerId',NULL,'counts',counts,'tiedIds','[]'::jsonb,'reasons',jsonb_build_array('daily_coverage_incomplete'),'missingDates',missing);
 END IF;
 SELECT max(value::text::integer) INTO top FROM jsonb_each(counts);
 IF top IS NULL OR top=0 THEN
  RETURN jsonb_build_object('status','complete','winnerId',NULL,'counts',counts,'tiedIds','[]'::jsonb,'reasons',jsonb_build_array('no_effective_daily_wins'),'missingDates','[]'::jsonb);
 END IF;
 SELECT array_agg(key ORDER BY key) INTO tied FROM jsonb_each(counts) WHERE value::text::integer=top;
 IF cardinality(tied)=1 THEN
  RETURN jsonb_build_object('status','complete','winnerId',tied[1],'counts',counts,'tiedIds','[]'::jsonb,'reasons','[]'::jsonb,'missingDates','[]'::jsonb);
 END IF;
 FOREACH pick IN ARRAY tied LOOP
  SELECT CASE WHEN m->>'status'='complete' AND m->>'eligibleForRanking'='true' THEN m->'compositeExact' END INTO score
  FROM jsonb_array_elements(p_calc->'members') m WHERE m->>'userId'=pick;
  IF score IS NULL OR jsonb_typeof(score)<>'object' THEN
   RETURN jsonb_build_object('status','incomplete','winnerId',NULL,'counts',counts,'tiedIds',to_jsonb(tied),'reasons',jsonb_build_array('monthly_tie_break_unavailable'),'missingDates','[]'::jsonb);
  END IF;
  n:=(score->>'numerator')::numeric; d:=(score->>'denominator')::numeric;
  IF best_d IS NULL OR n*best_d>best_n*d THEN best_n:=n; best_d:=d; winners:=ARRAY[pick];
  ELSIF n*best_d=best_n*d THEN winners:=winners||pick; END IF;
 END LOOP;
 IF cardinality(winners)>1 THEN
  RETURN jsonb_build_object('status','complete','winnerId',NULL,'counts',counts,'tiedIds',to_jsonb(winners),'reasons',jsonb_build_array('exact_monthly_tie'),'missingDates','[]'::jsonb);
 END IF;
 RETURN jsonb_build_object('status','complete','winnerId',winners[1],'counts',counts,'tiedIds','[]'::jsonb,'reasons','[]'::jsonb,'missingDates','[]'::jsonb);
END $$;

-- ---------------------------------------------------------------------------
-- Publish (managing director, elapsed month, current calculation)
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.recognition_ceremony_command(p_period date,p_payload jsonb,p_operation uuid,p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid; prior taskpulse_private.recognition_ceremony_receipts; response jsonb;
 request jsonb:=jsonb_build_object('period',p_period,'payload',p_payload,'expectedRevision',p_expected_revision);
 end_date date; calc jsonb; asof timestamptz; current_id uuid; current_num integer; reason text; star jsonb; cid uuid; f text; award jsonb; awarded integer:=0;
 factors text[]:=ARRAY['productivity','criticality','loading','completion','progress','sales','facts','ideas','suggestions','freshness']; BEGIN
 IF current_setting('role',true)<>'authenticated' OR actor IS NULL OR public.get_user_role() IS DISTINCT FROM 'managing_director' THEN
  RAISE EXCEPTION 'Active managing director required' USING ERRCODE='42501'; END IF;
 org:=public.current_organization();
 IF org IS NULL THEN RAISE EXCEPTION 'Company membership required' USING ERRCODE='42501'; END IF;
 IF p_operation IS NULL OR p_period IS NULL OR p_period<>date_trunc('month',p_period)::date OR p_expected_revision IS NULL
  OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN
  RAISE EXCEPTION 'Explicit month, expected revision, object payload and operation required' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('reason','calculation','monthlySelection')) THEN
  RAISE EXCEPTION 'Unknown ceremony field' USING ERRCODE='23514'; END IF;
 end_date:=(p_period+interval '1 month')::date;
 IF end_date>(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date THEN
  RAISE EXCEPTION 'The ceremony can be published once the month has ended' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('taskpulse-recognition-ceremony:'||org::text||':'||p_period::text,0));
 SELECT * INTO prior FROM taskpulse_private.recognition_ceremony_receipts WHERE actor_id=actor AND operation=p_operation;
 IF FOUND THEN
  IF prior.request IS DISTINCT FROM request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='40001'; END IF;
  RETURN prior.response;
 END IF;
 SELECT id,revision_number INTO current_id,current_num FROM taskpulse_private.recognition_ceremonies
 WHERE organization_id=org AND period_start=p_period ORDER BY revision_number DESC LIMIT 1;
 current_num:=coalesce(current_num,0);
 IF p_expected_revision<>current_num THEN RAISE EXCEPTION 'The ceremony changed; refresh and try again' USING ERRCODE='40001'; END IF;
 reason:=btrim(coalesce(p_payload->>'reason',''));
 IF current_num=0 AND reason='' THEN reason:='First publication'; END IF;
 IF length(reason)<8 THEN RAISE EXCEPTION 'A reason of at least 8 characters is required to republish' USING ERRCODE='23514'; END IF;

 calc:=p_payload->'calculation';
 IF calc IS NULL OR jsonb_typeof(calc)<>'object' OR jsonb_typeof(calc->'members')<>'array' THEN RAISE EXCEPTION 'Matching M07 calculation required' USING ERRCODE='23514'; END IF;
 BEGIN asof:=(calc->'context'->>'asOf')::timestamptz; EXCEPTION WHEN others THEN asof:=NULL; END;
 IF calc->'context'->>'ruleVersion' IS DISTINCT FROM 'm07-ten-factor-v1'
  OR (calc->'context'->>'periodStart') IS DISTINCT FROM p_period::text OR (calc->'context'->>'periodEndExclusive') IS DISTINCT FROM end_date::text
  OR asof IS NULL OR NOT isfinite(asof) OR asof>clock_timestamp() OR asof<clock_timestamp()-interval '15 minutes'
  OR calc->'context'->>'sourceWatermark' IS DISTINCT FROM taskpulse_private.performance_watermark(clock_timestamp()) THEN
  RAISE EXCEPTION 'A current calculation for this month is required; refresh and try again' USING ERRCODE='40001'; END IF;
 IF (SELECT array_agg(x->>'userId' ORDER BY x->>'userId') FROM jsonb_array_elements(calc->'members') x)
   IS DISTINCT FROM (SELECT array_agg(u.id::text ORDER BY u.id::text) FROM public.users u WHERE u.organization_id=org AND u.is_active)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(calc->'members') x WHERE jsonb_typeof(x->'factors')<>'object'
   OR (SELECT count(*) FROM jsonb_object_keys(x->'factors') k WHERE k=ANY(factors))<>10) THEN
  RAISE EXCEPTION 'All active members and ten factors required' USING ERRCODE='23514'; END IF;

 star:=taskpulse_private.recognition_monthly_star(org,p_period,calc);
 IF jsonb_typeof(p_payload->'monthlySelection')<>'object' OR (p_payload->'monthlySelection'->'winnerId') IS DISTINCT FROM (star->'winnerId') THEN
  RAISE EXCEPTION 'The monthly star does not match the daily award evidence; refresh and try again' USING ERRCODE='40001'; END IF;

 INSERT INTO taskpulse_private.recognition_ceremonies(organization_id,period_start,revision_number,prior_ceremony,published_by,reason,as_of,source_watermark,monthly_star,monthly_star_winner)
 VALUES(org,p_period,current_num+1,current_id,actor,reason,asof,calc->'context'->>'sourceWatermark',star,(star->>'winnerId')::uuid)
 RETURNING id INTO cid;
 FOREACH f IN ARRAY factors LOOP
  award:=taskpulse_private.recognition_category(calc,f);
  INSERT INTO taskpulse_private.recognition_ceremony_awards(ceremony_id,organization_id,category,status,winner_id,winning_raw,tied_ids,reasons)
  VALUES(cid,org,f,award->>'status',(award->>'winnerId')::uuid,nullif(award->'winningRaw','null'::jsonb),
   ARRAY(SELECT jsonb_array_elements_text(award->'tiedIds')::uuid),ARRAY(SELECT jsonb_array_elements_text(award->'reasons')));
  IF award->>'status'='awarded' THEN awarded:=awarded+1; END IF;
 END LOOP;
 response:=jsonb_build_object('period',p_period,'ceremonyId',cid,'revisionNumber',current_num+1,'monthlyStar',star,'awarded',awarded);
 INSERT INTO taskpulse_private.recognition_ceremony_receipts(organization_id,actor_id,operation,request,response) VALUES(org,actor,p_operation,request,response);
 INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,operation_id)
 VALUES(actor,'managing_director','recognition_ceremony_publish','recognition_ceremonies',cid,ARRAY['revision_number'],
  jsonb_build_object('period',p_period,'revision',current_num+1,'reason',reason,'monthlyStar',star->'winnerId'),p_operation);
 RETURN response;
END $$;

-- ---------------------------------------------------------------------------
-- Read the official (latest) ceremony of a month. Everyone in the company sees
-- winners, statuses and names; winning values only the winner and managers.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.recognition_ceremony_read(p_period date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE role text:=public.get_user_role(); viewer uuid:=auth.uid(); org uuid; manager boolean; c taskpulse_private.recognition_ceremonies; BEGIN
 IF role IS NULL OR viewer IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_period IS NULL OR p_period<>date_trunc('month',p_period)::date THEN RAISE EXCEPTION 'A calendar month is required' USING ERRCODE='23514'; END IF;
 org:=public.current_organization(); manager:=role IN ('managing_director','project_engineer');
 SELECT * INTO c FROM taskpulse_private.recognition_ceremonies WHERE organization_id=org AND period_start=p_period ORDER BY revision_number DESC LIMIT 1;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('period',p_period,'published',false,'revisionNumber',0,'canPublish',role='managing_director');
 END IF;
 RETURN jsonb_build_object('period',p_period,'published',true,'ceremonyId',c.id,'revisionNumber',c.revision_number,
  'publishedAt',c.published_at,'publishedBy',c.published_by,'reason',CASE WHEN manager THEN c.reason END,'asOf',c.as_of,
  'sourceWatermark',c.source_watermark,'ruleVersion',c.rule_version,'monthlyStar',c.monthly_star,'canPublish',role='managing_director',
  'names',(SELECT coalesce(jsonb_object_agg(u.id,u.full_name),'{}'::jsonb) FROM public.users u WHERE u.organization_id=org),
  'awards',(SELECT coalesce(jsonb_agg(jsonb_build_object('category',a.category,'status',a.status,'winnerId',a.winner_id,
    'winningRaw',CASE WHEN manager OR a.winner_id=viewer THEN a.winning_raw END,'tiedIds',to_jsonb(a.tied_ids),'reasons',to_jsonb(a.reasons))
   ORDER BY array_position(ARRAY['productivity','criticality','loading','completion','progress','sales','facts','ideas','suggestions','freshness'],a.category)),'[]'::jsonb)
   FROM taskpulse_private.recognition_ceremony_awards a WHERE a.ceremony_id=c.id));
END $$;

-- ---------------------------------------------------------------------------
-- Recognition points, derived (no ledger): per active member of the caller's
-- company, certified effective daily stars, category awards and monthly stars
-- on each month's latest ceremony revision, with the policy's points. Counts
-- are public within the company (the ceremony is); dated entries only for
-- the member themself or a manager.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.recognition_points(p_employee uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE role text:=public.get_user_role(); viewer uuid:=auth.uid(); org uuid; manager boolean; entries jsonb; BEGIN
 IF role IS NULL OR viewer IS NULL THEN RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 org:=public.current_organization(); manager:=role IN ('managing_director','project_engineer');
 IF p_employee IS NOT NULL AND p_employee<>viewer AND NOT manager THEN RAISE EXCEPTION 'Own entries or manager authority required' USING ERRCODE='42501'; END IF;
 IF p_employee IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_employee AND u.organization_id=org) THEN
  RAISE EXCEPTION 'A member of your company is required' USING ERRCODE='42501'; END IF;
 IF p_employee IS NOT NULL THEN
  WITH latest AS (
   SELECT DISTINCT ON (period_start) * FROM taskpulse_private.recognition_ceremonies WHERE organization_id=org ORDER BY period_start,revision_number DESC
  ), e AS (
   SELECT 'dailyStar' kind,s.business_date date,NULL::text category FROM taskpulse_private.award_slots s
   JOIN taskpulse_private.award_runs r ON r.id=s.effective_run LEFT JOIN taskpulse_private.award_overrides o ON o.id=s.override_id
   WHERE s.organization_id=org AND NOT s.stale AND r.certified AND r.status='completed_winner' AND coalesce(o.user_id,r.winner_id)=p_employee
   UNION ALL
   SELECT 'categoryAward',l.period_start,a.category FROM latest l JOIN taskpulse_private.recognition_ceremony_awards a ON a.ceremony_id=l.id
   WHERE a.status='awarded' AND a.winner_id=p_employee
   UNION ALL
   SELECT 'monthlyStar',l.period_start,NULL FROM latest l WHERE l.monthly_star_winner=p_employee
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'date',date,'category',category) ORDER BY date DESC,kind,category),'[]'::jsonb) INTO entries FROM e;
 END IF;
 RETURN jsonb_build_object('policy',(SELECT config->'points' FROM taskpulse_private.recognition_policy),'entries',entries,
  'members',(WITH latest AS (
    SELECT DISTINCT ON (period_start) * FROM taskpulse_private.recognition_ceremonies WHERE organization_id=org ORDER BY period_start,revision_number DESC
   ), daily AS (
    SELECT coalesce(o.user_id,r.winner_id) uid,count(*) n FROM taskpulse_private.award_slots s
    JOIN taskpulse_private.award_runs r ON r.id=s.effective_run LEFT JOIN taskpulse_private.award_overrides o ON o.id=s.override_id
    WHERE s.organization_id=org AND NOT s.stale AND r.certified AND r.status='completed_winner' GROUP BY 1
   ), cat AS (
    SELECT a.winner_id uid,jsonb_object_agg(a.category,a.n) per,sum(a.n)::integer n FROM (
     SELECT a.winner_id,a.category,count(*) n FROM latest l JOIN taskpulse_private.recognition_ceremony_awards a ON a.ceremony_id=l.id
     WHERE a.status='awarded' GROUP BY 1,2) a GROUP BY 1
   ), star AS (
    SELECT monthly_star_winner uid,count(*) n FROM latest WHERE monthly_star_winner IS NOT NULL GROUP BY 1
   )
   SELECT coalesce(jsonb_agg(jsonb_build_object('userId',u.id,'name',u.full_name,'dailyStars',coalesce(d.n,0),'categoryAwards',coalesce(c.n,0),
     'categories',coalesce(c.per,'{}'::jsonb),'monthlyStars',coalesce(m.n,0)) ORDER BY u.id),'[]'::jsonb)
   FROM public.users u LEFT JOIN daily d ON d.uid=u.id LEFT JOIN cat c ON c.uid=u.id LEFT JOIN star m ON m.uid=u.id
   WHERE u.organization_id=org AND u.is_active));
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA taskpulse_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION taskpulse_private.recognition_daily_wins(uuid,date,date),taskpulse_private.recognition_category(jsonb,text),
 taskpulse_private.recognition_monthly_star(uuid,date,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.recognition_ceremony_command(date,jsonb,uuid,integer),public.recognition_ceremony_read(date),
 public.recognition_points(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.recognition_ceremony_command(date,jsonb,uuid,integer),public.recognition_ceremony_read(date),
 public.recognition_points(uuid) TO authenticated;

SELECT taskpulse_private.m15_secure();
COMMIT;
