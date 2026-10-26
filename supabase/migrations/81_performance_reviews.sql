-- ===========================================================================
-- TaskPulse - M19 performance reviews (forward only)
--
-- User request (DECISIONS "M19 HR", 26 October 2026), the page earlier called
-- "HR acknowledgement", renamed Performance reviews for what it holds:
--   * a review sheet: the employee rates their own performance (1-5) on each
--     metric, then the managing director gives their own rating;
--   * a pros and cons template: the employee and the managing director each
--     list strengths ("pros") and areas to improve ("cons").
-- The managing director keeps the list of metrics (user choice) and picks the
-- metrics of each review; a review keeps a copy of their names, so editing
-- the list later never changes a past review.
--
-- Flow: awaiting_self (the employee fills and submits) -> awaiting_md (the
-- managing director rates and completes) -> completed. The managing director
-- can send a review back a step or withdraw it. The employee sees the
-- managing director's side only once the review is completed.
-- Reviews are visible to the employee and the managing director only; they
-- never reach the activity feed or audit protected changes. They add no
-- scoring rule and never feed a performance score.
-- ===========================================================================
BEGIN;

CREATE TABLE taskpulse_private.review_metrics (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK (name=btrim(name) AND length(name) BETWEEN 1 AND 60),
 description text NOT NULL DEFAULT '' CHECK (length(description)<=200),
 active boolean NOT NULL DEFAULT true,
 sort integer NOT NULL DEFAULT 0 CHECK (sort BETWEEN 0 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX review_metrics_name ON taskpulse_private.review_metrics(organization_id,lower(name));

CREATE TABLE taskpulse_private.performance_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 employee_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 title text NOT NULL CHECK (title=btrim(title) AND length(title) BETWEEN 1 AND 120),
 status text NOT NULL DEFAULT 'awaiting_self' CHECK (status IN ('awaiting_self','awaiting_md','completed','withdrawn')),
 self_pros jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(self_pros)='array'),
 self_cons jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(self_cons)='array'),
 md_pros jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(md_pros)='array'),
 md_cons jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(md_cons)='array'),
 md_summary text NOT NULL DEFAULT '' CHECK (length(md_summary)<=2000),
 self_submitted_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.users(id),
 version bigint NOT NULL DEFAULT 0 CHECK (version>=0)
);
CREATE INDEX performance_reviews_company_idx ON taskpulse_private.performance_reviews(organization_id,created_at DESC);
CREATE INDEX performance_reviews_employee_idx ON taskpulse_private.performance_reviews(employee_id,created_at DESC);

CREATE TABLE taskpulse_private.performance_review_ratings (
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 review_id uuid NOT NULL REFERENCES taskpulse_private.performance_reviews(id) ON DELETE CASCADE,
 sort integer NOT NULL CHECK (sort BETWEEN 0 AND 100),
 metric_name text NOT NULL CHECK (length(metric_name) BETWEEN 1 AND 60),
 metric_description text NOT NULL DEFAULT '',
 self_score smallint CHECK (self_score BETWEEN 1 AND 5),
 self_comment text NOT NULL DEFAULT '' CHECK (length(self_comment)<=500),
 md_score smallint CHECK (md_score BETWEEN 1 AND 5),
 md_comment text NOT NULL DEFAULT '' CHECK (length(md_comment)<=500),
 PRIMARY KEY (review_id,sort)
);

REVOKE ALL ON taskpulse_private.review_metrics,taskpulse_private.performance_reviews,taskpulse_private.performance_review_ratings
 FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO taskpulse_private.m15_tenant_tables(table_schema,table_name) VALUES
 ('taskpulse_private','review_metrics'),('taskpulse_private','performance_reviews'),('taskpulse_private','performance_review_ratings')
ON CONFLICT DO NOTHING;
INSERT INTO taskpulse_private.m15_org_refs(table_schema,table_name,column_name,ref_schema,ref_table) VALUES
 ('taskpulse_private','performance_reviews','employee_id','public','users'),
 ('taskpulse_private','performance_reviews','created_by','public','users')
ON CONFLICT DO NOTHING;

-- The starting list; the managing director renames, adds or switches them off.
CREATE FUNCTION taskpulse_private.review_seed_metrics(p_org uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 INSERT INTO taskpulse_private.review_metrics(organization_id,name,description,sort)
 SELECT p_org,v.name,v.description,v.sort FROM (VALUES
  ('Quality of work','Accuracy, finish and attention to detail',0),
  ('Punctuality','On time for work, meetings and deadlines',1),
  ('Ownership','Takes responsibility and follows through without reminders',2),
  ('Teamwork','Helps colleagues and shares information',3),
  ('Communication','Clear, timely updates to the team and customers',4),
  ('Learning','Builds new skills and acts on feedback',5)
 ) v(name,description,sort)
 WHERE NOT EXISTS(SELECT 1 FROM taskpulse_private.review_metrics m WHERE m.organization_id=p_org)
$$;
REVOKE ALL ON FUNCTION taskpulse_private.review_seed_metrics(uuid) FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE o uuid; BEGIN
 FOR o IN SELECT id FROM public.organizations LOOP PERFORM taskpulse_private.review_seed_metrics(o); END LOOP;
END $$;

-- The caller's company (any active member); every review function starts here.
CREATE FUNCTION taskpulse_private.review_actor() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.current_organization(); BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR public.get_user_role() IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 RETURN org;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.review_actor() FROM PUBLIC,anon,authenticated,service_role;

-- One review as the caller may see it: the managing director's side only for
-- the managing director, or for the employee once the review is completed.
CREATE FUNCTION taskpulse_private.review_json(p_review taskpulse_private.performance_reviews,p_full boolean) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',p_review.id,'employeeId',p_review.employee_id,'employeeCode',u.employee_id,'employeeName',u.full_name,
  'jobTitle',u.job_title,'title',p_review.title,'status',p_review.status,'version',p_review.version,
  'createdAt',p_review.created_at,'selfSubmittedAt',p_review.self_submitted_at,'completedAt',p_review.completed_at,
  'selfPros',p_review.self_pros,'selfCons',p_review.self_cons,
  'mdVisible',p_full,
  'mdPros',CASE WHEN p_full THEN p_review.md_pros END,'mdCons',CASE WHEN p_full THEN p_review.md_cons END,
  'mdSummary',CASE WHEN p_full THEN p_review.md_summary END,
  'ratings',(SELECT coalesce(jsonb_agg(jsonb_build_object('sort',r.sort,'metric',r.metric_name,'description',r.metric_description,
     'selfScore',r.self_score,'selfComment',r.self_comment,
     'mdScore',CASE WHEN p_full THEN r.md_score END,'mdComment',CASE WHEN p_full THEN r.md_comment END) ORDER BY r.sort),'[]')
   FROM taskpulse_private.performance_review_ratings r WHERE r.review_id=p_review.id))
 FROM public.users u WHERE u.id=p_review.employee_id
$$;
REVOKE ALL ON FUNCTION taskpulse_private.review_json(taskpulse_private.performance_reviews,boolean) FROM PUBLIC,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------
-- The managing director: every review in the company, the metric list and
-- the active members to review. Anyone else: their own reviews.
CREATE FUNCTION public.performance_reviews() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=taskpulse_private.review_actor(); director boolean:=public.get_user_role()='managing_director'; BEGIN
 RETURN jsonb_build_object(
  'director',director,
  'reviews',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'employeeId',p.employee_id,'employeeCode',u.employee_id,
     'employeeName',u.full_name,'title',p.title,'status',p.status,'createdAt',p.created_at,'completedAt',p.completed_at,
     'selfAverage',(SELECT round(avg(r.self_score),2) FROM taskpulse_private.performance_review_ratings r WHERE r.review_id=p.id),
     'mdAverage',CASE WHEN director OR p.status='completed' THEN
       (SELECT round(avg(r.md_score),2) FROM taskpulse_private.performance_review_ratings r WHERE r.review_id=p.id) END)
    ORDER BY p.created_at DESC),'[]')
   FROM taskpulse_private.performance_reviews p JOIN public.users u ON u.id=p.employee_id
   WHERE p.organization_id=org AND p.status<>'withdrawn' AND (director OR p.employee_id=auth.uid())),
  'metrics',CASE WHEN director THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'description',m.description,
     'active',m.active,'sort',m.sort) ORDER BY m.sort,m.name),'[]') FROM taskpulse_private.review_metrics m WHERE m.organization_id=org) END,
  'members',CASE WHEN director THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'employeeCode',u.employee_id,'fullName',u.full_name)
     ORDER BY u.full_name),'[]') FROM public.users u WHERE u.organization_id=org AND u.is_active) END);
END $$;
REVOKE ALL ON FUNCTION public.performance_reviews() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.performance_reviews() TO authenticated;

CREATE FUNCTION public.performance_review(p_review uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=taskpulse_private.review_actor(); director boolean:=public.get_user_role()='managing_director';
 rv taskpulse_private.performance_reviews; BEGIN
 SELECT * INTO rv FROM taskpulse_private.performance_reviews WHERE id=p_review AND organization_id=org AND status<>'withdrawn';
 IF NOT FOUND OR NOT (director OR rv.employee_id=auth.uid()) THEN
  RAISE EXCEPTION 'No such review' USING ERRCODE='P0002'; END IF;
 RETURN taskpulse_private.review_json(rv,director OR rv.status='completed');
END $$;
REVOKE ALL ON FUNCTION public.performance_review(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.performance_review(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Command
-- ---------------------------------------------------------------------------
-- A list of 0-10 short lines, trimmed, empty lines dropped.
CREATE FUNCTION taskpulse_private.review_lines(p_value jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result jsonb; BEGIN
 IF p_value IS NULL OR jsonb_typeof(p_value)<>'array' OR jsonb_array_length(p_value)>10
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_value) e WHERE jsonb_typeof(e)<>'string' OR length(btrim(e#>>'{}'))>300) THEN
  RAISE EXCEPTION 'Pros and cons take up to 10 lines of up to 300 characters each' USING ERRCODE='23514'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(btrim(e#>>'{}'))),'[]') INTO result FROM jsonb_array_elements(p_value) e WHERE btrim(e#>>'{}')<>'';
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.review_lines(jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Operations:
--   create   (MD)        {employeeIds, title, metricIds}: one review per employee
--   self     (employee)  {ratings:[{sort,score,comment}], pros, cons, submit}: while awaiting_self
--   director (MD)        {ratings:[{sort,score,comment}], pros, cons, summary, complete}: while awaiting_md
--   return   (MD)        {}: completed -> awaiting_md, awaiting_md -> awaiting_self
--   withdraw (MD)        {}: hides the review
--   metric   (MD)        {id?, name, description, active, sort}
-- Every review operation checks the review's version (PT409 when stale) and
-- is idempotent per operation id.
CREATE FUNCTION public.performance_review_command(p_op text,p_review uuid,p_payload jsonb,p_expected_version bigint,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=taskpulse_private.review_actor(); director boolean:=public.get_user_role()='managing_director';
 receipt taskpulse_private.command_receipts; cmd text:='performance_review_'||coalesce(p_op,''); result jsonb; saved uuid;
 request jsonb:=jsonb_build_array(p_op,p_review,p_payload,p_expected_version); rv taskpulse_private.performance_reviews;
 rating jsonb; target uuid; n integer; created integer:=0; missing integer;
 uuid_re text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; BEGIN
 IF p_op IS NULL OR p_op NOT IN ('create','self','director','return','withdraw','metric') OR p_operation IS NULL
  OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'A known operation, an object payload and an operation id are required' USING ERRCODE='23514'; END IF;
 IF p_op<>'self' AND NOT director THEN
  RAISE EXCEPTION 'Only the managing director can do this' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('performance_reviews:'||org::text,0));
 SELECT * INTO receipt FROM taskpulse_private.command_receipts WHERE actor_id=actor AND command=cmd AND operation_id=p_operation;
 IF FOUND THEN
  IF receipt.request<>request THEN RAISE EXCEPTION 'Operation reused with different input' USING ERRCODE='PT409'; END IF;
  RETURN receipt.result_payload;
 END IF;
 PERFORM taskpulse_private.review_seed_metrics(org);

 IF p_op='metric' THEN
  IF p_payload-ARRAY['id','name','description','active','sort']<>'{}' OR coalesce(jsonb_typeof(p_payload->'name'),'')<>'string'
   OR length(btrim(p_payload->>'name')) NOT BETWEEN 1 AND 60 OR length(coalesce(p_payload->>'description',''))>200
   OR coalesce(jsonb_typeof(p_payload->'active'),'boolean')<>'boolean' OR coalesce(p_payload->>'sort','0') !~ '^\d{1,4}$' THEN
   RAISE EXCEPTION 'A metric needs a name (1-60 characters), an optional description (up to 200) and a sort order' USING ERRCODE='23514'; END IF;
  IF p_payload ? 'id' THEN
   IF coalesce(p_payload->>'id','') !~* uuid_re THEN RAISE EXCEPTION 'Unknown metric' USING ERRCODE='P0002'; END IF;
   UPDATE taskpulse_private.review_metrics SET name=btrim(p_payload->>'name'),description=btrim(coalesce(p_payload->>'description','')),
    active=coalesce((p_payload->>'active')::boolean,active),sort=least(coalesce((p_payload->>'sort')::integer,sort),1000)
   WHERE id=(p_payload->>'id')::uuid AND organization_id=org RETURNING id INTO saved;
   IF saved IS NULL THEN RAISE EXCEPTION 'Unknown metric' USING ERRCODE='P0002'; END IF;
  ELSE
   INSERT INTO taskpulse_private.review_metrics(organization_id,name,description,active,sort)
   VALUES(org,btrim(p_payload->>'name'),btrim(coalesce(p_payload->>'description','')),coalesce((p_payload->>'active')::boolean,true),
    least(coalesce((p_payload->>'sort')::integer,(SELECT coalesce(max(sort)+1,0) FROM taskpulse_private.review_metrics WHERE organization_id=org)),1000))
   RETURNING id INTO saved;
  END IF;
  result:=jsonb_build_object('id',saved);

 ELSIF p_op='create' THEN
  IF p_payload-ARRAY['employeeIds','title','metricIds']<>'{}' OR jsonb_typeof(p_payload->'employeeIds') IS DISTINCT FROM 'array'
   OR jsonb_typeof(p_payload->'metricIds') IS DISTINCT FROM 'array' OR coalesce(jsonb_typeof(p_payload->'title'),'')<>'string'
   OR length(btrim(p_payload->>'title')) NOT BETWEEN 1 AND 120 THEN
   RAISE EXCEPTION 'A review needs employees, a title (1-120 characters) and metrics' USING ERRCODE='23514'; END IF;
  IF jsonb_array_length(p_payload->'employeeIds') NOT BETWEEN 1 AND 200 OR jsonb_array_length(p_payload->'metricIds') NOT BETWEEN 1 AND 30
   OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'employeeIds') e WHERE e !~* uuid_re)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'metricIds') e WHERE e !~* uuid_re) THEN
   RAISE EXCEPTION 'Choose 1-200 employees and 1-30 metrics' USING ERRCODE='23514'; END IF;
  SELECT count(*) INTO n FROM taskpulse_private.review_metrics
   WHERE organization_id=org AND id IN (SELECT e::uuid FROM jsonb_array_elements_text(p_payload->'metricIds') e);
  IF n<>(SELECT count(DISTINCT e) FROM jsonb_array_elements_text(p_payload->'metricIds') e) THEN
   RAISE EXCEPTION 'Unknown metric' USING ERRCODE='P0002'; END IF;
  FOR target IN SELECT DISTINCT e::uuid FROM jsonb_array_elements_text(p_payload->'employeeIds') e LOOP
   IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=target AND u.organization_id=org AND u.is_active) THEN
    RAISE EXCEPTION 'Every employee must be an active member of your company' USING ERRCODE='P0002'; END IF;
   INSERT INTO taskpulse_private.performance_reviews(organization_id,employee_id,title,created_by)
   VALUES(org,target,btrim(p_payload->>'title'),actor) RETURNING id INTO saved;
   INSERT INTO taskpulse_private.performance_review_ratings(organization_id,review_id,sort,metric_name,metric_description)
   SELECT org,saved,(row_number() OVER (ORDER BY m.sort,m.name))::integer-1,m.name,m.description
   FROM taskpulse_private.review_metrics m
   WHERE m.organization_id=org AND m.id IN (SELECT e::uuid FROM jsonb_array_elements_text(p_payload->'metricIds') e);
   created:=created+1;
  END LOOP;
  result:=jsonb_build_object('created',created);
  saved:=org;

 ELSE
  SELECT * INTO rv FROM taskpulse_private.performance_reviews WHERE id=p_review AND organization_id=org AND status<>'withdrawn' FOR UPDATE;
  IF NOT FOUND OR NOT (director OR rv.employee_id=actor) THEN RAISE EXCEPTION 'No such review' USING ERRCODE='P0002'; END IF;
  IF rv.version IS DISTINCT FROM p_expected_version THEN
   RAISE EXCEPTION 'This review was changed meanwhile; reload the page' USING ERRCODE='PT409'; END IF;

  IF p_op IN ('self','director') THEN
   IF p_op='self' AND (rv.employee_id<>actor OR rv.status<>'awaiting_self') THEN
    RAISE EXCEPTION 'Your self-review can be changed only until you submit it' USING ERRCODE='42501'; END IF;
   IF p_op='director' AND rv.status<>'awaiting_md' THEN
    RAISE EXCEPTION 'You can rate this review once the employee has submitted it' USING ERRCODE='23514'; END IF;
   IF jsonb_typeof(p_payload->'ratings') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Ratings are required' USING ERRCODE='23514'; END IF;
   FOR rating IN SELECT * FROM jsonb_array_elements(p_payload->'ratings') LOOP
    IF jsonb_typeof(rating) IS DISTINCT FROM 'object' OR coalesce(rating->>'sort','') !~ '^\d{1,3}$'
     OR coalesce(jsonb_typeof(rating->'score'),'null') NOT IN ('number','null')
     OR (jsonb_typeof(rating->'score')='number' AND (rating->>'score') NOT IN ('1','2','3','4','5'))
     OR length(coalesce(rating->>'comment',''))>500 THEN
     RAISE EXCEPTION 'Each rating is a score of 1 to 5 with a comment of up to 500 characters' USING ERRCODE='23514'; END IF;
    IF p_op='self' THEN
     UPDATE taskpulse_private.performance_review_ratings SET self_score=(rating->>'score')::smallint,self_comment=btrim(coalesce(rating->>'comment',''))
     WHERE review_id=rv.id AND sort=(rating->>'sort')::integer;
    ELSE
     UPDATE taskpulse_private.performance_review_ratings SET md_score=(rating->>'score')::smallint,md_comment=btrim(coalesce(rating->>'comment',''))
     WHERE review_id=rv.id AND sort=(rating->>'sort')::integer;
    END IF;
   END LOOP;
   IF p_op='self' THEN
    UPDATE taskpulse_private.performance_reviews SET self_pros=taskpulse_private.review_lines(coalesce(p_payload->'pros','[]')),
     self_cons=taskpulse_private.review_lines(coalesce(p_payload->'cons','[]')) WHERE id=rv.id;
    IF (p_payload->>'submit')::boolean IS TRUE THEN
     SELECT count(*) INTO missing FROM taskpulse_private.performance_review_ratings WHERE review_id=rv.id AND self_score IS NULL;
     IF missing>0 THEN RAISE EXCEPTION 'Rate every metric before you submit' USING ERRCODE='23514'; END IF;
     UPDATE taskpulse_private.performance_reviews SET status='awaiting_md',self_submitted_at=clock_timestamp() WHERE id=rv.id;
    END IF;
   ELSE
    IF length(coalesce(p_payload->>'summary',''))>2000 THEN RAISE EXCEPTION 'Keep the summary under 2000 characters' USING ERRCODE='23514'; END IF;
    UPDATE taskpulse_private.performance_reviews SET md_pros=taskpulse_private.review_lines(coalesce(p_payload->'pros','[]')),
     md_cons=taskpulse_private.review_lines(coalesce(p_payload->'cons','[]')),md_summary=btrim(coalesce(p_payload->>'summary',''))
    WHERE id=rv.id;
    IF (p_payload->>'complete')::boolean IS TRUE THEN
     SELECT count(*) INTO missing FROM taskpulse_private.performance_review_ratings WHERE review_id=rv.id AND md_score IS NULL;
     IF missing>0 THEN RAISE EXCEPTION 'Rate every metric before you complete the review' USING ERRCODE='23514'; END IF;
     UPDATE taskpulse_private.performance_reviews SET status='completed',completed_at=clock_timestamp() WHERE id=rv.id;
    END IF;
   END IF;
  ELSIF p_op='return' THEN
   IF rv.status='awaiting_self' THEN RAISE EXCEPTION 'The review is already with the employee' USING ERRCODE='23514'; END IF;
   UPDATE taskpulse_private.performance_reviews SET
    status=CASE rv.status WHEN 'completed' THEN 'awaiting_md' ELSE 'awaiting_self' END,
    completed_at=NULL,self_submitted_at=CASE WHEN rv.status='awaiting_md' THEN NULL ELSE self_submitted_at END
   WHERE id=rv.id;
  ELSE
   UPDATE taskpulse_private.performance_reviews SET status='withdrawn' WHERE id=rv.id;
  END IF;
  UPDATE taskpulse_private.performance_reviews SET version=version+1 WHERE id=rv.id RETURNING version INTO n;
  saved:=rv.id;
  result:=jsonb_build_object('id',rv.id,'version',n);
 END IF;

 INSERT INTO taskpulse_private.command_receipts(actor_id,command,operation_id,request,result,result_payload)
 VALUES(actor,cmd,p_operation,request,saved,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.performance_review_command(text,uuid,jsonb,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.performance_review_command(text,uuid,jsonb,bigint,uuid) TO authenticated;

COMMIT;
SELECT taskpulse_private.m15_secure();
