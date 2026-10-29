-- ===========================================================================
-- TaskPulse - M20 notification events (forward only)
--
-- The bell (and, through migration 91, the phone) now tells people about the
-- things that happen to them (DECISIONS "M20 mobile app", 29 October 2026):
--
--   task_assigned       a manager put you on a mission (public.task_assignees)
--   task_reviewer       a manager made you a reviewer (public.task_reviewers)
--   task_status         a mission you are on changed status (public.tasks);
--                       the automatic Not Started -> In Progress on first
--                       work is left out
--   daily_star          you are the day's star (taskpulse_private.award_runs)
--   monthly_star,       the month's ceremony was published: its monthly star
--   category_award,     and each category winner hear it personally, and
--   ceremony_published  every member hears that the awards are out (M16)
--
-- Mission events come only from a signed-in person's change, never from
-- imports, seeds or the nightly jobs, and nobody is told about their own
-- change. Award events come from the award run and the ceremony, whoever
-- records them. taskpulse_private.notify() writes the rows for active members
-- of the company only, once per recipient and event (dedupe key); a failed
-- notification is a warning, never a failed mission or award write.
-- ===========================================================================
BEGIN;

CREATE FUNCTION taskpulse_private.notify(p_org uuid,p_recipients uuid[],p_kind text,p_title text,p_body text,p_href text,p_dedupe text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer; BEGIN
 IF p_org IS NULL OR p_recipients IS NULL OR cardinality(p_recipients)=0 OR coalesce(btrim(p_title),'')='' THEN RETURN 0; END IF;
 INSERT INTO taskpulse_private.notifications(organization_id,recipient_id,kind,title,body,href,dedupe_key)
 SELECT p_org,u.id,p_kind,left(btrim(p_title),140),left(coalesce(p_body,''),500),
  CASE WHEN p_href ~ '^/[A-Za-z0-9/_?=&%.-]{0,199}$' THEN p_href END,left(p_dedupe,200)
 FROM public.users u
 WHERE u.id=ANY(p_recipients) AND u.organization_id=p_org AND u.is_active AND u.id IS DISTINCT FROM auth.uid()
 ON CONFLICT (recipient_id,dedupe_key) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
EXCEPTION WHEN others THEN
 RAISE WARNING 'Notification % could not be written: %',p_kind,SQLERRM;
 RETURN 0;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.notify(uuid,uuid[],text,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;

-- The in-app link of a mission (tags with other characters open the list).
CREATE FUNCTION taskpulse_private.notify_task_href(p_tag text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p_tag ~ '^[A-Za-z0-9_.-]{1,80}$' THEN '/tasks/'||p_tag ELSE '/tasks' END;
$$;
REVOKE ALL ON FUNCTION taskpulse_private.notify_task_href(text) FROM PUBLIC,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Missions
-- ---------------------------------------------------------------------------
CREATE FUNCTION taskpulse_private.notify_task_participant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.tasks; actor_name text; BEGIN
 IF auth.uid() IS NULL OR NEW.user_id=auth.uid() THEN RETURN NULL; END IF;
 SELECT * INTO t FROM public.tasks WHERE id=NEW.task_id;
 IF NOT FOUND OR t.status IN ('Done','Discarded') THEN RETURN NULL; END IF;
 SELECT full_name INTO actor_name FROM public.users WHERE id=auth.uid();
 IF TG_TABLE_NAME='task_assignees' THEN
  PERFORM taskpulse_private.notify(t.organization_id,ARRAY[NEW.user_id],'task_assigned',
   format('New mission %s: %s',t.task_tag,t.title),
   CASE WHEN actor_name IS NOT NULL THEN format('Assigned by %s.',actor_name) ELSE '' END
    ||CASE WHEN t.due_date IS NOT NULL THEN format(' Due %s.',to_char(t.due_date,'FMDD Mon')) ELSE '' END,
   taskpulse_private.notify_task_href(t.task_tag),'task_assigned:'||NEW.id);
 ELSE
  PERFORM taskpulse_private.notify(t.organization_id,ARRAY[NEW.user_id],'task_reviewer',
   format('Review %s: %s',t.task_tag,t.title),
   CASE WHEN actor_name IS NOT NULL THEN format('%s made you a reviewer.',actor_name) ELSE 'You are a reviewer.' END,
   taskpulse_private.notify_task_href(t.task_tag),'task_reviewer:'||NEW.id);
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.notify_task_participant() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER m92_notify_assignee AFTER INSERT ON public.task_assignees
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.notify_task_participant();
CREATE TRIGGER m92_notify_reviewer AFTER INSERT ON public.task_reviewers
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.notify_task_participant();

CREATE FUNCTION taskpulse_private.notify_task_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE people uuid[]; actor_name text; BEGIN
 IF auth.uid() IS NULL OR (OLD.status='Not Started' AND NEW.status='In Progress') THEN RETURN NULL; END IF;
 SELECT array_agg(DISTINCT p) INTO people FROM (
  SELECT NEW.assignee_id AS p
  UNION SELECT user_id FROM public.task_assignees WHERE task_id=NEW.id
  UNION SELECT user_id FROM public.task_reviewers WHERE task_id=NEW.id) x WHERE p IS NOT NULL;
 SELECT full_name INTO actor_name FROM public.users WHERE id=auth.uid();
 PERFORM taskpulse_private.notify(NEW.organization_id,people,'task_status',
  format('%s is now %s',NEW.task_tag,NEW.status),
  NEW.title||CASE WHEN actor_name IS NOT NULL THEN format(' (changed by %s)',actor_name) ELSE '' END,
  taskpulse_private.notify_task_href(NEW.task_tag),'task_status:'||NEW.id||':'||NEW.status||':'||txid_current());
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.notify_task_status() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER m92_notify_task_status AFTER UPDATE OF status ON public.tasks
 FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION taskpulse_private.notify_task_status();

-- ---------------------------------------------------------------------------
-- Awards and recognition (M08 daily runs, M16 ceremony)
-- ---------------------------------------------------------------------------
-- A recalculation that names the same winner again tells nobody twice.
CREATE FUNCTION taskpulse_private.notify_daily_star() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE day date; BEGIN
 SELECT business_date INTO day FROM taskpulse_private.award_slots WHERE id=NEW.slot_id;
 IF day IS NULL THEN RETURN NULL; END IF;
 PERFORM taskpulse_private.notify(NEW.organization_id,ARRAY[NEW.winner_id],'daily_star',
  format('You are the Daily star for %s',to_char(day,'FMDD Mon')),
  'Congratulations! See it in the Hall of fame.','/hall-of-fame','daily_star:'||day);
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.notify_daily_star() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER m92_notify_daily_star AFTER INSERT ON taskpulse_private.award_runs
 FOR EACH ROW WHEN (NEW.status='completed_winner' AND NEW.winner_id IS NOT NULL) EXECUTE FUNCTION taskpulse_private.notify_daily_star();

-- A ceremony revision repeats nothing: only a new winner hears about it.
CREATE FUNCTION taskpulse_private.notify_ceremony() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c taskpulse_private.recognition_ceremonies; month_label text; href text; everyone uuid[]; BEGIN
 IF TG_TABLE_NAME='recognition_ceremonies' THEN
  c:=NEW;
 ELSE
  SELECT * INTO c FROM taskpulse_private.recognition_ceremonies WHERE id=NEW.ceremony_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
 END IF;
 month_label:=to_char(c.period_start,'FMMonth YYYY');
 href:='/awards?month='||to_char(c.period_start,'YYYY-MM');
 IF TG_TABLE_NAME='recognition_ceremony_awards' THEN
  PERFORM taskpulse_private.notify(c.organization_id,ARRAY[NEW.winner_id],'category_award',
   format('You won %s for %s',initcap(NEW.category),month_label),'Congratulations! See the awards ceremony.',href,
   'category_award:'||to_char(c.period_start,'YYYY-MM')||':'||NEW.category);
  RETURN NULL;
 END IF;
 IF c.monthly_star_winner IS NOT NULL THEN
  PERFORM taskpulse_private.notify(c.organization_id,ARRAY[c.monthly_star_winner],'monthly_star',
   format('You are the Monthly star for %s',month_label),'Congratulations! See the awards ceremony.',href,
   'monthly_star:'||to_char(c.period_start,'YYYY-MM'));
 END IF;
 SELECT array_agg(id) INTO everyone FROM public.users WHERE organization_id=c.organization_id AND is_active;
 PERFORM taskpulse_private.notify(c.organization_id,everyone,'ceremony_published',
  format('The %s awards are out',month_label),'See who won each award this month.',href,
  'ceremony_published:'||to_char(c.period_start,'YYYY-MM'));
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION taskpulse_private.notify_ceremony() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER m92_notify_ceremony AFTER INSERT ON taskpulse_private.recognition_ceremonies
 FOR EACH ROW EXECUTE FUNCTION taskpulse_private.notify_ceremony();
CREATE TRIGGER m92_notify_category_award AFTER INSERT ON taskpulse_private.recognition_ceremony_awards
 FOR EACH ROW WHEN (NEW.status='awarded' AND NEW.winner_id IS NOT NULL) EXECUTE FUNCTION taskpulse_private.notify_ceremony();

COMMIT;
SELECT taskpulse_private.m15_secure();
