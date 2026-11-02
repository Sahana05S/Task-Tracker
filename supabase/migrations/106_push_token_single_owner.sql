-- 106: one push token, one owner, across companies (security audit, 2 November 2026).
--
-- device_register (94) meant to take a phone's token away from every earlier
-- owner "in whichever company", but it runs as taskpulse_definer under the
-- company-scoped m15_scope policy, so its DELETE never sees another company's
-- rows (and the m15 trigger would refuse them). A phone used by a member of
-- company B and then by a member of company A kept both registrations, and kept
-- receiving company B's notifications.
--
-- A token's current owner is now kept in taskpulse_private.push_token_owners.
-- It has no organization_id column on purpose: m15_secure gives such tables an
-- open policy for the definer, so every company's commands can read who owns a
-- token, while no API role has any grant on it. Queueing and sending skip a
-- device row that is not the owner; no company's rows are changed by another's
-- command.
--
-- Functions rewritten from their live definitions at 105 (pg_get_functiondef).

BEGIN;

CREATE TABLE taskpulse_private.push_token_owners (
 token text PRIMARY KEY CHECK (length(token) BETWEEN 20 AND 4096),
 owner_organization uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 owner_user uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON taskpulse_private.push_token_owners FROM PUBLIC, anon, authenticated, service_role;

-- Today's owner of each token: its most recently seen live registration.
INSERT INTO taskpulse_private.push_token_owners(token,owner_organization,owner_user,claimed_at)
SELECT DISTINCT ON (token) token,organization_id,user_id,last_seen_at FROM taskpulse_private.user_devices
WHERE disabled_at IS NULL ORDER BY token,last_seen_at DESC,id;

CREATE OR REPLACE FUNCTION public.device_register(p_token text, p_platform text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); BEGIN
 IF actor IS NULL OR org IS NULL OR public.get_user_role() IS NULL THEN
  RAISE EXCEPTION 'Active authenticated account required' USING ERRCODE='42501'; END IF;
 IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9:_.-]+$' OR length(p_token) NOT BETWEEN 20 AND 4096 THEN
  RAISE EXCEPTION 'A valid device token is required' USING ERRCODE='23514'; END IF;
 IF p_platform IS NULL OR p_platform NOT IN ('android','ios') THEN
  RAISE EXCEPTION 'Platform must be android or ios' USING ERRCODE='23514'; END IF;
 -- The phone now belongs to whoever signed in on it last, in whichever company:
 -- one installed app is one token, so earlier owners stop receiving its pushes.
 DELETE FROM taskpulse_private.user_devices WHERE token=p_token AND (organization_id<>org OR user_id<>actor);
 INSERT INTO taskpulse_private.user_devices AS d(organization_id,user_id,token,platform)
 VALUES(org,actor,p_token,p_platform)
 ON CONFLICT (organization_id,token) DO UPDATE SET user_id=EXCLUDED.user_id,platform=EXCLUDED.platform,
  last_seen_at=clock_timestamp(),disabled_at=NULL,disabled_reason=NULL;
 -- Migration 106: the DELETE above cannot see another company's rows (company
 -- scope), so the owner is kept in a table every company's commands read, and
 -- queueing and sending skip any device row that is no longer the owner.
 INSERT INTO taskpulse_private.push_token_owners(token,owner_organization,owner_user) VALUES(p_token,org,actor)
 ON CONFLICT (token) DO UPDATE SET owner_organization=EXCLUDED.owner_organization,owner_user=EXCLUDED.owner_user,claimed_at=clock_timestamp();
 -- At most ten phones per member: the least recently seen go first.
 DELETE FROM taskpulse_private.user_devices WHERE user_id=actor AND id NOT IN
  (SELECT id FROM taskpulse_private.user_devices WHERE user_id=actor ORDER BY last_seen_at DESC,id LIMIT 10);
 RETURN jsonb_build_object('registered',true);
END $function$

;

CREATE OR REPLACE FUNCTION public.device_unregister(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid:=auth.uid(); org uuid:=public.current_organization(); n integer; BEGIN
 IF actor IS NULL OR org IS NULL THEN RAISE EXCEPTION 'Signed-in account required' USING ERRCODE='42501'; END IF;
 IF p_token IS NULL OR length(p_token)>4096 THEN RAISE EXCEPTION 'A device token is required' USING ERRCODE='23514'; END IF;
 DELETE FROM taskpulse_private.user_devices WHERE organization_id=org AND user_id=actor AND token=p_token;
 GET DIAGNOSTICS n=ROW_COUNT;
 DELETE FROM taskpulse_private.push_token_owners WHERE token=p_token AND owner_organization=org AND owner_user=actor;
 RETURN jsonb_build_object('removed',n>0);
END $function$

;

CREATE OR REPLACE FUNCTION public.push_claim(p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE now_at timestamptz:=clock_timestamp(); lease uuid:=gen_random_uuid(); result jsonb; BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Limit between 1 and 500 required' USING ERRCODE='23514'; END IF;
 WITH due AS (
  SELECT o.id FROM taskpulse_private.push_outbox o
  WHERE ((o.status='pending' AND o.next_attempt_at<=now_at) OR (o.status='sending' AND o.lease_until<now_at AND o.attempts<5))
   AND EXISTS(SELECT 1 FROM taskpulse_private.user_devices d WHERE d.id=o.device_id AND d.disabled_at IS NULL
    -- Migration 106: not if the phone now belongs to someone else (any company).
    AND NOT EXISTS(SELECT 1 FROM taskpulse_private.push_token_owners w WHERE w.token=d.token
     AND (w.owner_organization<>d.organization_id OR w.owner_user<>d.user_id)))
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
END $function$

;

CREATE OR REPLACE FUNCTION taskpulse_private.push_enqueue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE queued integer; BEGIN
 INSERT INTO taskpulse_private.push_outbox(organization_id,notification_id,device_id)
 SELECT n.organization_id,n.id,d.id
 FROM fresh n
 JOIN taskpulse_private.user_devices d ON d.user_id=n.recipient_id AND d.organization_id=n.organization_id AND d.disabled_at IS NULL
 JOIN public.users u ON u.id=n.recipient_id AND u.is_active
 WHERE n.read_at IS NULL
  -- Migration 106: only the phone's current owner, in whichever company, is notified.
  AND NOT EXISTS(SELECT 1 FROM taskpulse_private.push_token_owners w WHERE w.token=d.token
   AND (w.owner_organization<>d.organization_id OR w.owner_user<>d.user_id))
 ON CONFLICT (notification_id,device_id) DO NOTHING;
 GET DIAGNOSTICS queued=ROW_COUNT;
 -- One wake per transaction is enough: the sender drains everything due.
 IF queued>0 AND coalesce(current_setting('taskpulse.push_woken',true),'')<>'on' THEN
  PERFORM set_config('taskpulse.push_woken','on',true);
  PERFORM taskpulse_push.wake();
 END IF;
 RETURN NULL;
END $function$

;

SELECT taskpulse_private.m15_secure();
COMMIT;
