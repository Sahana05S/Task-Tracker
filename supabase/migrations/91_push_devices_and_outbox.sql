-- ===========================================================================
-- TaskPulse - M20 phone notifications: devices and the push outbox (forward only)
--
-- The Android app (Capacitor shell, DECISIONS "M20 mobile app", 29 October
-- 2026) shows every in-app notification as a phone notification too.
--
-- 1. taskpulse_private.user_devices: one row per company and FCM token. The
--    signed-in member registers the phone they are on (device_register) and
--    removes it on sign-out (device_unregister). A token that FCM reports as
--    gone is disabled, not deleted, until the phone registers it again.
-- 2. taskpulse_private.push_outbox: one row per notification and device. An
--    AFTER INSERT trigger on taskpulse_private.notifications queues a row for
--    each enabled device of the recipient and wakes the sender once per
--    transaction.
-- 3. taskpulse_push.wake(): POSTs to the send-push Edge Function through
--    pg_net, with the URL and bearer secret read from Supabase Vault
--    (taskpulse_push_url, taskpulse_push_secret, written by
--    .github/workflows/configure-push.yml through taskpulse_push.configure).
--    Without pg_net, Vault or those secrets it does nothing, so rows wait as
--    pending; a wake never makes the notification's own write fail. The
--    schema stays owned by the migration role (outside m15_secure's reach)
--    because only that role reads Vault and calls pg_net on Supabase.
-- 4. pg_cron runs taskpulse_private.push_retry_tick() every minute: it wakes
--    the sender when rows are due (retries, expired leases), expires rows
--    older than a day so a late configuration never sends stale news, and
--    prunes old rows. Skipped where pg_cron is not preloaded.
-- 5. Sender RPCs for the Edge Function (service role only): push_claim leases
--    due rows with their token and text; push_complete records each outcome
--    (sent, retry with backoff, invalid token, failed).
-- 6. push_status(): the managing director's Data checks line.
-- ===========================================================================
BEGIN;

CREATE TABLE taskpulse_private.user_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 token text NOT NULL CHECK (token ~ '^[A-Za-z0-9:_.-]{20,4096}$'),
 platform text NOT NULL CHECK (platform IN ('android','ios')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 disabled_at timestamptz,
 disabled_reason text CHECK (disabled_reason IS NULL OR length(disabled_reason)<=200),
 UNIQUE (organization_id,token)
);
CREATE INDEX user_devices_user_idx ON taskpulse_private.user_devices(user_id) WHERE disabled_at IS NULL;

CREATE TABLE taskpulse_private.push_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 notification_id uuid NOT NULL REFERENCES taskpulse_private.notifications(id) ON DELETE CASCADE,
 device_id uuid NOT NULL REFERENCES taskpulse_private.user_devices(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','dropped','expired')),
 attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_id uuid,
 lease_until timestamptz,
 sent_at timestamptz,
 last_error text CHECK (last_error IS NULL OR length(last_error)<=300),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE (notification_id,device_id),
 CHECK ((status='sending')=(lease_id IS NOT NULL))
);
CREATE INDEX push_outbox_due_idx ON taskpulse_private.push_outbox(next_attempt_at) WHERE status IN ('pending','sending');
CREATE INDEX push_outbox_recent_idx ON taskpulse_private.push_outbox(organization_id,created_at);

REVOKE ALL ON taskpulse_private.user_devices, taskpulse_private.push_outbox FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO taskpulse_private.m15_tenant_tables(table_schema,table_name) VALUES
 ('taskpulse_private','user_devices'),('taskpulse_private','push_outbox')
ON CONFLICT DO NOTHING;
INSERT INTO taskpulse_private.m15_org_refs(table_schema,table_name,column_name,ref_schema,ref_table) VALUES
 ('taskpulse_private','user_devices','user_id','public','users'),
 ('taskpulse_private','push_outbox','device_id','taskpulse_private','user_devices')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Vault and pg_net (owned by the migration role; never by a signed-in caller)
-- ---------------------------------------------------------------------------
DO $do$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name='pg_net') THEN
  CREATE EXTENSION IF NOT EXISTS pg_net;
 ELSE
  RAISE NOTICE 'pg_net is not available here; phone notifications wait as pending.';
 END IF;
END $do$;

CREATE SCHEMA taskpulse_push;
REVOKE ALL ON SCHEMA taskpulse_push FROM PUBLIC;
GRANT USAGE ON SCHEMA taskpulse_push TO taskpulse_definer;

-- The sender's URL and secret, or NULLs when push is not configured here.
CREATE FUNCTION taskpulse_push.settings(OUT url text,OUT secret text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF to_regclass('vault.decrypted_secrets') IS NULL
    OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN RETURN; END IF;
 EXECUTE $q$SELECT max(decrypted_secret) FILTER (WHERE name='taskpulse_push_url'),
   max(decrypted_secret) FILTER (WHERE name='taskpulse_push_secret')
  FROM vault.decrypted_secrets WHERE name IN ('taskpulse_push_url','taskpulse_push_secret')$q$ INTO url,secret;
 IF url !~ '^https://[A-Za-z0-9.-]+/' OR length(coalesce(secret,''))<32 THEN url:=NULL; secret:=NULL; END IF;
END $$;

-- Asks send-push to drain the outbox. pg_net sends after the transaction
-- commits (nothing on rollback). Returns whether a request was queued.
CREATE FUNCTION taskpulse_push.wake() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s record; BEGIN
 SELECT * INTO s FROM taskpulse_push.settings();
 IF s.url IS NULL THEN RETURN false; END IF;
 EXECUTE 'SELECT net.http_post(url:=$1,body:=$2,params:=$3,headers:=$4,timeout_milliseconds:=10000)'
 USING s.url,'{"reason":"wake"}'::jsonb,'{}'::jsonb,
  jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||s.secret);
 RETURN true;
EXCEPTION WHEN others THEN
 RAISE WARNING 'Phone notification wake failed: %',SQLERRM;
 RETURN false;
END $$;

-- Writes (or replaces) the two Vault secrets. Called only by the migration
-- role from configure-push.yml; no API role can execute it.
CREATE FUNCTION taskpulse_push.configure(p_url text,p_secret text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pair record; existing uuid; BEGIN
 IF to_regclass('vault.secrets') IS NULL THEN RAISE EXCEPTION 'Supabase Vault is not installed here' USING ERRCODE='55000'; END IF;
 IF p_url IS NULL OR p_url !~ '^https://[A-Za-z0-9.-]+/functions/v1/send-push$' THEN
  RAISE EXCEPTION 'The URL must be https://<project>.supabase.co/functions/v1/send-push' USING ERRCODE='22023'; END IF;
 IF length(coalesce(p_secret,''))<32 THEN RAISE EXCEPTION 'The secret must be at least 32 characters' USING ERRCODE='22023'; END IF;
 FOR pair IN SELECT * FROM (VALUES ('taskpulse_push_url',p_url),('taskpulse_push_secret',p_secret)) v(name,value) LOOP
  EXECUTE 'SELECT id FROM vault.secrets WHERE name=$1' INTO existing USING pair.name;
  IF existing IS NULL THEN
   EXECUTE 'SELECT vault.create_secret($1,$2,$3)' USING pair.value,pair.name,'TaskPulse phone notifications (migration 91)';
  ELSE
   EXECUTE 'SELECT vault.update_secret($1,$2)' USING existing,pair.value;
  END IF;
 END LOOP;
 RETURN 'Phone notifications configured';
END $$;

REVOKE ALL ON FUNCTION taskpulse_push.settings(),taskpulse_push.wake(),taskpulse_push.configure(text,text)
 FROM PUBLIC,anon,authenticated,service_role,taskpulse_definer;
GRANT EXECUTE ON FUNCTION taskpulse_push.wake() TO taskpulse_definer;

-- Whether a sender is configured (no secret leaves the schema).
CREATE FUNCTION taskpulse_push.configured() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT url IS NOT NULL FROM taskpulse_push.settings() $$;
REVOKE ALL ON FUNCTION taskpulse_push.configured() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION taskpulse_push.configured() TO taskpulse_definer;

-- ---------------------------------------------------------------------------
-- Queue: one row per new notification and enabled device of its recipient
-- ---------------------------------------------------------------------------
CREATE FUNCTION taskpulse_private.push_enqueue() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE queued integer; BEGIN
 INSERT INTO taskpulse_private.push_outbox(organization_id,notification_id,device_id)
 SELECT n.organization_id,n.id,d.id
 FROM fresh n
 JOIN taskpulse_private.user_devices d ON d.user_id=n.recipient_id AND d.organization_id=n.organization_id AND d.disabled_at IS NULL
 JOIN public.users u ON u.id=n.recipient_id AND u.is_active
 WHERE n.read_at IS NULL
 ON CONFLICT (notification_id,device_id) DO NOTHING;
 GET DIAGNOSTICS queued=ROW_COUNT;
 -- One wake per transaction is enough: the sender drains everything due.
 IF queued>0 AND coalesce(current_setting('taskpulse.push_woken',true),'')<>'on' THEN
  PERFORM set_config('taskpulse.push_woken','on',true);
  PERFORM taskpulse_push.wake();
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.push_enqueue() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER m91_push_enqueue AFTER INSERT ON taskpulse_private.notifications
 REFERENCING NEW TABLE AS fresh FOR EACH STATEMENT EXECUTE FUNCTION taskpulse_private.push_enqueue();

-- ---------------------------------------------------------------------------
-- Devices: the signed-in member's own phone
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.device_register(p_token text,p_platform text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); BEGIN
 IF actor IS NULL OR org IS NULL OR public.get_user_role() IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9:_.-]{20,4096}$' THEN
  RAISE EXCEPTION 'A valid device token is required' USING ERRCODE='23514'; END IF;
 IF p_platform IS NULL OR p_platform NOT IN ('android','ios') THEN
  RAISE EXCEPTION 'Platform must be android or ios' USING ERRCODE='23514'; END IF;
 -- The phone now belongs to whoever signed in on it last.
 INSERT INTO taskpulse_private.user_devices AS d(organization_id,user_id,token,platform)
 VALUES(org,actor,p_token,p_platform)
 ON CONFLICT (organization_id,token) DO UPDATE SET user_id=EXCLUDED.user_id,platform=EXCLUDED.platform,
  last_seen_at=clock_timestamp(),disabled_at=NULL,disabled_reason=NULL;
 -- At most ten phones per member: the least recently seen go first.
 DELETE FROM taskpulse_private.user_devices WHERE user_id=actor AND id NOT IN
  (SELECT id FROM taskpulse_private.user_devices WHERE user_id=actor ORDER BY last_seen_at DESC,id LIMIT 10);
 RETURN jsonb_build_object('registered',true);
END $$;

CREATE FUNCTION public.device_unregister(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); n integer; BEGIN
 IF actor IS NULL OR org IS NULL THEN RAISE EXCEPTION 'Signed-in account required' USING ERRCODE='42501'; END IF;
 IF p_token IS NULL OR length(p_token)>4096 THEN RAISE EXCEPTION 'A device token is required' USING ERRCODE='23514'; END IF;
 DELETE FROM taskpulse_private.user_devices WHERE organization_id=org AND user_id=actor AND token=p_token;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('removed',n>0);
END $$;

REVOKE ALL ON FUNCTION public.device_register(text,text),public.device_unregister(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.device_register(text,text),public.device_unregister(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Sender RPCs (service role: the send-push Edge Function)
-- ---------------------------------------------------------------------------
-- Leases up to p_limit due rows for two minutes. A row whose lease ran out
-- (the function died mid-send) is due again.
CREATE FUNCTION public.push_claim(p_limit integer DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE now_at timestamptz:=clock_timestamp(); lease uuid:=gen_random_uuid(); result jsonb; BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Limit between 1 and 500 required' USING ERRCODE='23514'; END IF;
 WITH due AS (
  SELECT o.id FROM taskpulse_private.push_outbox o
  WHERE ((o.status='pending' AND o.next_attempt_at<=now_at) OR (o.status='sending' AND o.lease_until<now_at AND o.attempts<5))
   AND EXISTS(SELECT 1 FROM taskpulse_private.user_devices d WHERE d.id=o.device_id AND d.disabled_at IS NULL)
  ORDER BY o.next_attempt_at,o.id LIMIT p_limit FOR UPDATE OF o SKIP LOCKED
 ), leased AS (
  UPDATE taskpulse_private.push_outbox o SET status='sending',lease_id=lease,lease_until=now_at+interval '2 minutes',
   attempts=least(o.attempts+1,20)
  FROM due WHERE o.id=due.id RETURNING o.*
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'lease',l.lease_id,'organizationId',l.organization_id,
   'attempt',l.attempts,'token',d.token,'platform',d.platform,'notificationId',n.id,'kind',n.kind,
   'title',n.title,'body',n.body,'href',n.href) ORDER BY l.next_attempt_at,l.id),'[]'::jsonb) INTO result
 FROM leased l JOIN taskpulse_private.user_devices d ON d.id=l.device_id
 JOIN taskpulse_private.notifications n ON n.id=l.notification_id;
 RETURN jsonb_build_object('items',result);
END $$;

-- p_results: [{id, lease, outcome: sent|retry|invalid_token|failed, error}].
-- Retries back off 1, 2, 4, 8 minutes; the fifth failed attempt is final.
CREATE FUNCTION public.push_complete(p_results jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb; row_out taskpulse_private.push_outbox; outcome text; err text; done integer:=0; BEGIN
 IF p_results IS NULL OR jsonb_typeof(p_results)<>'array' OR jsonb_array_length(p_results)>500 THEN
  RAISE EXCEPTION 'An array of at most 500 results is required' USING ERRCODE='23514'; END IF;
 FOR r IN SELECT * FROM jsonb_array_elements(p_results) LOOP
  outcome:=r->>'outcome'; err:=left(nullif(r->>'error',''),300);
  IF outcome IS NULL OR outcome NOT IN ('sent','retry','invalid_token','failed')
     OR coalesce(r->>'id','') !~* '^[0-9a-f-]{36}$' OR coalesce(r->>'lease','') !~* '^[0-9a-f-]{36}$' THEN
   RAISE EXCEPTION 'Each result needs an id, its lease and an outcome' USING ERRCODE='23514'; END IF;
  SELECT * INTO row_out FROM taskpulse_private.push_outbox
  WHERE id=(r->>'id')::uuid AND lease_id=(r->>'lease')::uuid AND status='sending' FOR UPDATE;
  IF NOT FOUND THEN CONTINUE; END IF; -- the lease ran out and another run took the row
  IF outcome='sent' THEN
   UPDATE taskpulse_private.push_outbox SET status='sent',sent_at=clock_timestamp(),lease_id=NULL,lease_until=NULL,last_error=NULL
   WHERE id=row_out.id;
  ELSIF outcome='retry' AND row_out.attempts<5 THEN
   UPDATE taskpulse_private.push_outbox SET status='pending',lease_id=NULL,lease_until=NULL,last_error=err,
    next_attempt_at=clock_timestamp()+make_interval(mins=>(2^(row_out.attempts-1))::integer)
   WHERE id=row_out.id;
  ELSIF outcome='invalid_token' THEN
   UPDATE taskpulse_private.push_outbox SET status='dropped',lease_id=NULL,lease_until=NULL,last_error=coalesce(err,'Token no longer valid')
   WHERE id=row_out.id;
   UPDATE taskpulse_private.user_devices SET disabled_at=clock_timestamp(),disabled_reason=left(coalesce(err,'Token no longer valid'),200)
   WHERE id=row_out.device_id AND disabled_at IS NULL;
   -- Other rows waiting for the same phone would fail the same way.
   UPDATE taskpulse_private.push_outbox SET status='dropped',last_error='Token no longer valid'
   WHERE device_id=row_out.device_id AND status='pending';
  ELSE
   UPDATE taskpulse_private.push_outbox SET status='failed',lease_id=NULL,lease_until=NULL,last_error=err WHERE id=row_out.id;
  END IF;
  done:=done+1;
 END LOOP;
 RETURN jsonb_build_object('recorded',done);
END $$;

REVOKE ALL ON FUNCTION public.push_claim(integer),public.push_complete(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.push_claim(integer),public.push_complete(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Retry tick (pg_cron) and the Data checks line
-- ---------------------------------------------------------------------------
CREATE FUNCTION taskpulse_private.push_retry_tick() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE expired integer; pruned integer; woke boolean:=false; BEGIN
 UPDATE taskpulse_private.push_outbox SET status='expired',lease_id=NULL,lease_until=NULL,last_error='Not sent within a day'
 WHERE status IN ('pending','sending') AND created_at<clock_timestamp()-interval '1 day'
  AND (status='pending' OR lease_until<clock_timestamp());
 GET DIAGNOSTICS expired=ROW_COUNT;
 -- A row whose sender died five times is not tried again.
 UPDATE taskpulse_private.push_outbox SET status='failed',lease_id=NULL,lease_until=NULL,last_error='The sender stopped before finishing'
 WHERE status='sending' AND lease_until<clock_timestamp() AND attempts>=5;
 DELETE FROM taskpulse_private.push_outbox WHERE status NOT IN ('pending','sending') AND created_at<clock_timestamp()-interval '30 days';
 GET DIAGNOSTICS pruned=ROW_COUNT;
 IF EXISTS(SELECT 1 FROM taskpulse_private.push_outbox WHERE (status='pending' AND next_attempt_at<=clock_timestamp())
   OR (status='sending' AND lease_until<clock_timestamp() AND attempts<5)) THEN
  woke:=taskpulse_push.wake();
 END IF;
 RETURN jsonb_build_object('expired',expired,'pruned',pruned,'woke',woke);
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.push_retry_tick() FROM PUBLIC,anon,authenticated,service_role;

-- Managing director: is the sender set up, and how did the last day go?
CREATE FUNCTION public.push_status() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.current_organization(); since timestamptz:=clock_timestamp()-interval '1 day'; BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR public.get_user_role() IS DISTINCT FROM 'managing_director' THEN
  RAISE EXCEPTION 'Only the managing director can see phone notification health' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object(
  'configured',taskpulse_push.configured(),
  'devices',(SELECT count(*) FROM taskpulse_private.user_devices d WHERE d.organization_id=org AND d.disabled_at IS NULL),
  'waiting',count(*) FILTER (WHERE o.status IN ('pending','sending')),
  'oldestWaitingAt',min(o.created_at) FILTER (WHERE o.status IN ('pending','sending')),
  'sent',count(*) FILTER (WHERE o.status='sent' AND o.sent_at>=since),
  'failed',count(*) FILTER (WHERE o.status IN ('failed','expired') AND o.created_at>=since),
  'dropped',count(*) FILTER (WHERE o.status='dropped' AND o.created_at>=since),
  'lastSentAt',max(o.sent_at))
 FROM taskpulse_private.push_outbox o WHERE o.organization_id=org);
END $$;
REVOKE ALL ON FUNCTION public.push_status() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.push_status() TO authenticated;

-- Every minute where pg_cron is preloaded (the hosted demo project); the
-- contract-check server has neither pg_cron nor pg_net and skips this.
DO $do$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name='pg_cron')
    OR coalesce(current_setting('shared_preload_libraries',true),'') NOT LIKE '%pg_cron%' THEN
  RAISE NOTICE 'pg_cron is not available here; phone notification retries run only on new notifications.';
  RETURN;
 END IF;
 CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
 EXECUTE format('GRANT EXECUTE ON FUNCTION taskpulse_private.push_retry_tick() TO %I', current_user);
 EXECUTE $q$SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='taskpulse-push-retry'$q$;
 EXECUTE $q$SELECT cron.schedule('taskpulse-push-retry','* * * * *','SELECT taskpulse_private.push_retry_tick()')$q$;
END
$do$;

COMMIT;
SELECT taskpulse_private.m15_secure();
