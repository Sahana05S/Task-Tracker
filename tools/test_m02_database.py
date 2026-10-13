"""Real PostgreSQL migration/authorization tests; loopback disposable DB only.

Supply --psql and --port for an already-running isolated cluster. The auth shim
models verified JWT subjects; it is not a GoTrue/PostgREST integration test.
Never reads .env.local or contacts the configured Supabase project.
"""
import argparse
import json
import re
from concurrent.futures import ThreadPoolExecutor
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--psql', required=True)
parser.add_argument('--port', type=int, default=15432)
args = parser.parse_args()
assert 1024 < args.port < 65536
DBS = ('taskpulse_m02_fresh_test', 'taskpulse_m02_upgrade_test')

def sql(db, statement, success=True):
    result = subprocess.run([args.psql, '-X', '-h', '127.0.0.1', '-p', str(args.port),
                             '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-At'],
                            input=statement, text=True, capture_output=True, encoding='utf-8')
    if success and result.returncode:
        raise AssertionError(result.stderr + '\n' + statement[:300])
    if not success and result.returncode == 0:
        raise AssertionError('Expected database denial: ' + statement)
    if not success and not any(code in result.stderr for code in ('42501','23514','40001')):
        raise AssertionError('Failure was not an authorization/contract denial: ' + result.stderr)
    return result.stdout.strip()

def actor(db, uid, statement, success=True, role='authenticated'):
    statement = re.sub(r"ARRAY\[('[0-9a-f-]+'(?:,'[0-9a-f-]+')*)\]", r'ARRAY[\1]::uuid[]', statement)
    return sql(db, f"BEGIN; SET LOCAL ROLE {role}; SELECT set_config('request.jwt.claim.sub','{uid}',true);\n"
               + statement.rstrip(';') + ';\nCOMMIT;', success).splitlines()

def check(db, label, statement, uid='4', success=True, role='authenticated'):
    identity = '00000000-0000-0000-0000-' + uid.zfill(12) if uid else ''
    actor(db, identity, statement, success, role)
    print('PASS', db, label)

bootstrap = """
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}',raw_app_meta_data jsonb DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
-- Deliberately broad Supabase-style initial grants expose policy/column gaps.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon,authenticated,service_role;
"""
seed = """
INSERT INTO auth.users(id,email,raw_user_meta_data) SELECT ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
 'user'||i||'@example.test',jsonb_build_object('employee_id','TEST-'||i) FROM generate_series(1,8) i;
UPDATE public.users SET role=CASE right(id::text,1) WHEN '1' THEN 'managing_director'::public.user_role
 WHEN '2' THEN 'project_engineer'::public.user_role WHEN '3' THEN 'data_manager'::public.user_role ELSE 'team_member'::public.user_role END;
UPDATE public.users SET is_active=false WHERE right(id::text,1)='7';
INSERT INTO public.tasks(id,task_tag,title,assignee_id,reviewer_id,task_scale) VALUES
 ('10000000-0000-0000-0000-000000000001','T1','A','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000006',8),
 ('10000000-0000-0000-0000-000000000002','T2','B','00000000-0000-0000-0000-000000000005',NULL,10);
INSERT INTO public.task_checklists(id,task_id,title) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','C1'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','C2');
INSERT INTO public.checklist_nodes(id,checklist_id,node_type,title) VALUES
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Item','A'),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','Item','B');
INSERT INTO public.report_snapshots(employee_id,report_type,title,payload,status,period_start,period_end) VALUES
 ('00000000-0000-0000-0000-000000000005','Employee','private','{"secret":"private"}','Final','2026-09-01','2026-09-30');
INSERT INTO public.monthly_performance_snapshots(user_id,snapshot_year,snapshot_month,total_logged_hours,productivity_score)
 VALUES('00000000-0000-0000-0000-000000000005',2026,9,8,0.25);
INSERT INTO public.daily_facts(id,posted_by,fact) VALUES
 ('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','DM contribution'),
 ('40000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004','Member contribution');
"""
T1 = "'10000000-0000-0000-0000-000000000001'"
U4 = "'00000000-0000-0000-0000-000000000004'"
U5 = "'00000000-0000-0000-0000-000000000005'"
U6 = "'00000000-0000-0000-0000-000000000006'"



from uuid import uuid4

def literal(value):
    return "'"+str(value).replace("'","''")+"'"
def rpc(command,entity,payload,key=None,version=None):
    types={'create_task_log':'task','correct_task_log':'log','reverse_task_log':'log','start_task_timer':'task','stop_task_timer':'timer','discard_task_timer':'timer'}
    values=[literal(entity)+'::uuid',literal(json.dumps(payload))+'::jsonb',literal(key or uuid4())+'::uuid']
    if types[command]!='task': values.append('NULL' if version is None else str(version))
    return 'SELECT public.'+command+'('+','.join(values)+');'
def call(db,command,entity,payload,key=None,version=None,uid='4',success=True):
    lines=actor(db,'00000000-0000-0000-0000-'+uid.zfill(12),rpc(command,entity,payload,key,version),success)
    if success:
        return json.loads(next(x for x in lines if x.startswith('{')))

def value(db,query): return sql(db,'SELECT '+query+';')

task='10000000-0000-0000-0000-000000000001'
user4='00000000-0000-0000-0000-000000000004'
user5='00000000-0000-0000-0000-000000000005'

for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db};')
    sql(db,bootstrap)
    for m in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        if int(m.name.split('_')[0])>13: continue
        if db==DBS[1] and m.name.startswith('12_'):
            sql(db,seed)
            sql(db,f"UPDATE public.tasks SET progress_percentage=40 WHERE id='{task}';")
            sql(db,f"INSERT INTO public.daily_task_logs(id,task_id,user_id,log_date,hours_worked,progress_delta) VALUES ('30000000-0000-0000-0000-000000000099','{task}','{user4}','2026-09-10',1,10);")
            before=json.loads(sql(db,'SELECT jsonb_agg(to_jsonb(l)) FROM public.daily_task_logs l;'))
            snapshots_before=sql(db,'SELECT jsonb_agg(to_jsonb(s)) FROM public.monthly_performance_snapshots s;')
        sql(db,m.read_text(encoding='utf-8'))
    if db==DBS[0]: sql(db,seed)
    else:
        old=json.loads(sql(db,"SELECT jsonb_agg(to_jsonb(l)-ARRAY['requested_progress_delta','effective_progress_delta','execution_version','reversed_at','participant_version','credit_shares','credit_scale','effect_contract']) FROM public.daily_task_logs l;"))
        assert old==before
        assert value(db,'count(*) FROM public.daily_task_logs WHERE effective_progress_delta IS NOT NULL')=='0'
        assert sql(db,'SELECT jsonb_agg(to_jsonb(s)) FROM public.monthly_performance_snapshots s;')==snapshots_before
        legacy='30000000-0000-0000-0000-000000000099'
        call(db,'correct_task_log',legacy,{'log_date':'2026-09-10','hours_worked':2,'requested_delta':5,'reason':'historical'},version=0,success=False)
        # Historical evidence is preserved; no destructive cleanup for fixtures.
        print('PASS',db,'legacy log/snapshot preservation; unknown effects not inferred')
    # Seed date is from PostgreSQL, tests never spoof production app time.
    day=value(db,"(clock_timestamp() AT TIME ZONE 'UTC')::date")
    payload={'log_date':day,'hours_worked':1,'requested_delta':10,'notes':'private sentinel','raw_links':['https://example.test/private']}
    for uid in ('7','8','6'):
        call(db,'create_task_log',task,payload,uid=uid,success=False)
    check(db,'anonymous RPC rejected',rpc('create_task_log',task,payload),uid='',success=False,role='anon')
    forged=payload|{'user_id':user5}
    call(db,'create_task_log',task,forged,success=False)
    for query in [f"INSERT INTO public.daily_task_logs(task_id,user_id,hours_worked) VALUES ('{task}','{user4}',1)",
        f"INSERT INTO public.task_timers(task_id,user_id) VALUES ('{task}','{user4}')",
        "UPDATE taskpulse_private.audit_events SET command='forged'", "DELETE FROM taskpulse_private.outbox_jobs",
        "SELECT taskpulse_private.execution_command('create_log',NULL,NULL,'{}',NULL,NULL)"]:
        check(db,'direct execution/history boundary',query,success=False)
    # Configure approved equal shares prospectively, even with old logs.
    actor(db,'00000000-0000-0000-0000-000000000001',f"SELECT public.set_task_participants('{task}',ARRAY['{user4}','{user5}']::uuid[],ARRAY[]::uuid[],ARRAY[500000,500000],0,true);")
    sql(db,f"UPDATE public.tasks SET progress_percentage=95 WHERE id='{task}';")
    key=str(uuid4())
    first=call(db,'create_task_log',task,payload,key)
    assert first['requestedDelta']==10 and first['effectiveDelta']==5
    assert call(db,'create_task_log',task,payload,key)==first
    call(db,'create_task_log',task,payload|{'hours_worked':2},key,success=False)
    log=first['logId']
    assert value(db,f"progress_percentage FROM public.tasks WHERE id='{task}'")=='100.00'
    assert value(db,f"progress_delta FROM public.daily_task_logs WHERE id='{log}'")=='5.00'
    assert value(db,f"count(*) FROM public.daily_task_logs WHERE id='{log}'")=='1'
    hours=float(value(db,f"sum(hours_worked) FROM public.daily_task_logs WHERE task_id='{task}' AND reversed_at IS NULL"))
    assert float(value(db,f"task_productivity FROM public.tasks WHERE id='{task}'"))==round(100/hours,2)
    sql(db,f"DELETE FROM public.daily_task_logs WHERE id='{log}';",success=False)
    print('PASS',db,'95+10 effective5, confirmed task points/hour, retained history, identical/network retry, payload conflict')
    # Notes/hours corrections do not reapply clamped requested progress.
    sql(db,f"UPDATE public.tasks SET progress_percentage=80 WHERE id='{task}';")
    fixed=call(db,'correct_task_log',log,payload|{'hours_worked':2,'reason':'Correct duration'},version=1)
    assert value(db,f"progress_percentage FROM public.tasks WHERE id='{task}'")=='80.00'
    fixed=call(db,'correct_task_log',log,payload|{'requested_delta':3,'reason':'Correct progress'},version=2)
    assert fixed['effectiveDelta']==3
    assert value(db,f"progress_percentage FROM public.tasks WHERE id='{task}'")=='78.00'
    # Original five reversed, new three applied; manual 100->80 correction survives.
    call(db,'correct_task_log',log,payload|{'requested_delta':1,'reason':'stale'},version=2,success=False)
    call(db,'correct_task_log',log,payload|{'requested_delta':1,'reason':'other'},version=3,uid='5',success=False)
    call(db,'reverse_task_log',log,{'reason':'remove'},version=3,success=False)
    assert value(db,f"count(*) FROM public.daily_task_logs WHERE id='{log}'")=='1'
    print('PASS',db,'manual correction preserved; stale/other-author/removal safeguards')
    # 0-10 applied0 and impossible reversal cannot consume a manual correction.
    sql(db,f"UPDATE public.tasks SET progress_percentage=0 WHERE id='{task}';")
    zero=call(db,'create_task_log',task,payload|{'requested_delta':-10})
    assert zero['effectiveDelta']==0
    call(db,'correct_task_log',log,payload|{'requested_delta':0,'reason':'would underflow'},version=3,success=False)
    for bad in [{'hours_worked':-1},{'hours_worked':25},{'hours_worked':0.001},{'requested_delta':101},
                {'requested_delta':'NaN'},{'log_date':'2026-02-30'},{'raw_links':['javascript:alert(1)']}]:
        call(db,'create_task_log',task,payload|bad,success=False)
    call(db,'create_task_log',task,payload|{'requested_delta':0,'raw_links':['HTTPS://example.test/valid']})
    yesterday=value(db,"(clock_timestamp() AT TIME ZONE 'UTC')::date-1")
    call(db,'create_task_log',task,payload|{'log_date':yesterday,'requested_delta':0})
    call(db,'create_task_log',task,payload|{'log_date':yesterday,'requested_delta':10},success=False)
    call(db,'correct_task_log',log,payload|{'log_date':yesterday,'requested_delta':3,'reason':'Cannot invent earlier credit'},version=3,success=False)
    print('PASS',db,'zero boundary, finite/precision/date/link validation; independent hours and backdated credit guards')
    # Concurrent requests use actual PG connections and task locks.
    p1=payload|{'requested_delta':10}
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda _:call(db,'create_task_log',task,p1),range(2)))
    assert value(db,f"progress_percentage FROM public.tasks WHERE id='{task}'")=='20.00'
    assert sorted(r['effectiveDelta'] for r in results)==[10,10]
    edit=results[0]['logId']
    def racing_edit(delta):
        statement=rpc('correct_task_log',edit,payload|{'requested_delta':delta,'reason':'race'},version=1)
        result=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],
          input=f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{user4}',true);"+statement+'COMMIT;',text=True,capture_output=True)
        return result
    with ThreadPoolExecutor(max_workers=2) as pool: races=list(pool.map(racing_edit,[2,3]))
    assert sum(r.returncode==0 for r in races)==1 and any('40001' in r.stderr for r in races)
    print('PASS',db,'concurrent increments/corrections: no lost update, one version winner')
    # Future 70/30 applies to new work only; earlier shares/version unchanged.
    old_shares=value(db,f"credit_shares FROM public.daily_task_logs WHERE id='{log}'")
    old_balance=json.loads(sql(db,f"SELECT jsonb_object_agg(user_id::text,scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='{task}';"))
    actor(db,'00000000-0000-0000-0000-000000000001',f"SELECT public.set_task_participants('{task}',ARRAY['{user4}','{user5}']::uuid[],ARRAY[]::uuid[],ARRAY[700000,300000],1,true);")
    assert old_shares==value(db,f"credit_shares FROM public.daily_task_logs WHERE id='{log}'")
    assert old_balance==json.loads(sql(db,f"SELECT jsonb_object_agg(user_id::text,scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='{task}';"))
    later=call(db,'create_task_log',task,payload|{'requested_delta':10})
    assert json.loads(value(db,f"credit_shares FROM public.daily_task_logs WHERE id='{later['logId']}'"))[user4]==700000
    assert value(db,f"count(*) FROM taskpulse_private.participant_versions WHERE task_id='{task}'")=='3'
    # A correction after share change stays on the original 50/50 credit.
    current=value(db,f"execution_version FROM public.daily_task_logs WHERE id='{edit}'")
    before_bal=json.loads(sql(db,f"SELECT jsonb_object_agg(user_id::text,scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='{task}';"))
    effect=value(db,f"effective_progress_delta FROM public.daily_task_logs WHERE id='{edit}'")
    call(db,'correct_task_log',edit,payload|{'requested_delta':float(effect)+1,'reason':'prospective correction'},version=int(current))
    after_bal=json.loads(sql(db,f"SELECT jsonb_object_agg(user_id::text,scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='{task}';"))
    assert abs((after_bal[user4]-before_bal[user4])-0.04)<1e-9 and abs((after_bal[user5]-before_bal[user5])-0.04)<1e-9
    print('PASS',db,'prospective 50/50->70/30 preserves old/current credit and correction version')
    # Fault after dependent source/progress writes: actual trigger exception rolls back all.
    baseline=sql(db,"SELECT jsonb_build_array((SELECT count(*) FROM public.daily_task_logs),(SELECT count(*) FROM taskpulse_private.audit_events),(SELECT count(*) FROM taskpulse_private.outbox_jobs),(SELECT count(*) FROM taskpulse_private.command_receipts),(SELECT jsonb_agg(to_jsonb(t)) FROM public.tasks t),(SELECT jsonb_agg(to_jsonb(b)) FROM taskpulse_private.task_credit_balances b));")
    sql(db,"CREATE FUNCTION taskpulse_private.test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected failure' USING ERRCODE='23514'; END $$; CREATE TRIGGER test_failure BEFORE INSERT ON taskpulse_private.outbox_jobs FOR EACH ROW WHEN (NEW.payload->>'affected_date' IS NOT NULL) EXECUTE FUNCTION taskpulse_private.test_fail();")
    fail_key=str(uuid4())
    call(db,'create_task_log',task,payload|{'requested_delta':1},fail_key,success=False)
    after=sql(db,"SELECT jsonb_build_array((SELECT count(*) FROM public.daily_task_logs),(SELECT count(*) FROM taskpulse_private.audit_events),(SELECT count(*) FROM taskpulse_private.outbox_jobs),(SELECT count(*) FROM taskpulse_private.command_receipts),(SELECT jsonb_agg(to_jsonb(t)) FROM public.tasks t),(SELECT jsonb_agg(to_jsonb(b)) FROM taskpulse_private.task_credit_balances b));")
    assert baseline==after
    sql(db,'DROP TRIGGER test_failure ON taskpulse_private.outbox_jobs;')
    call(db,'create_task_log',task,payload|{'requested_delta':1},fail_key)
    print('PASS',db,'failure after source/progress writes rolls back task/log/credit/audit/outbox/receipt; key reusable')
    # The client really times out after COMMIT, rather than cancelling the transaction.
    timeout_key=str(uuid4()); timeout_request=rpc('create_task_log',task,payload|{'requested_delta':0},timeout_key)
    client=subprocess.Popen([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    try:
        client.communicate(f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{user4}',true);"+timeout_request+'COMMIT; SELECT pg_sleep(2);',timeout=0.75)
        raise AssertionError('Expected simulated lost response timeout')
    except subprocess.TimeoutExpired:
        client.kill(); client.communicate()
    assert value(db,f"count(*) FROM taskpulse_private.command_receipts WHERE operation_id='{timeout_key}' AND command='create_log'")=='1'
    recovered=call(db,'create_task_log',task,payload|{'requested_delta':0},timeout_key)
    assert value(db,f"count(*) FROM public.daily_task_logs WHERE id='{recovered['logId']}'")=='1'
    print('PASS',db,'actual post-COMMIT client timeout recovered by receipt')
    check(db,'manager cannot race/change checklist progress ownership',f"UPDATE public.task_checklists SET sync_progress_to_task=true WHERE task_id='{task}';",uid='1',success=False)
    # Checklist-owned progress is explicitly guarded; hours-only remains permitted.
    sql(db,f"UPDATE public.task_checklists SET sync_progress_to_task=true WHERE task_id='{task}';")
    call(db,'create_task_log',task,payload,success=False)
    call(db,'create_task_log',task,payload|{'requested_delta':0})
    sql(db,f"UPDATE public.task_checklists SET sync_progress_to_task=false WHERE task_id='{task}';")
    # Frozen-period input correction cannot mutate snapshots/report periods.
    sql(db,f"INSERT INTO public.report_snapshots(report_type,title,status,employee_id,period_start,period_end) VALUES ('Employee','Frozen','Final','{user4}','{day}','{day}');")
    call(db,'create_task_log',task,payload,success=False)
    sql(db,"DELETE FROM public.report_snapshots WHERE title='Frozen';")
    print('PASS',db,'checklist/frozen-period boundaries')
    # Timers: enforced one running, durable state, forged owner denied.
    timer_key=str(uuid4()); started=call(db,'start_task_timer',task,{},timer_key)
    timer=started['timerId']; assert call(db,'start_task_timer',task,{},timer_key)==started
    # Unique violation is expected specifically (the existing 07 partial index).
    statement=rpc('start_task_timer',task,{})
    raw=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],input=f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{user4}',true);"+statement,text=True,capture_output=True)
    assert raw.returncode!=0 and '23505' in raw.stderr
    call(db,'stop_task_timer',timer,{},version=0,uid='5',success=False)
    # Deterministic portable test time: update only synthetic owner fixture.
    # Stop's date policy is guarded; use the actual day only when UTC/local agree.
    sql(db,f"UPDATE public.task_timers SET started_at=clock_timestamp()-interval '0.001 second' WHERE id='{timer}';")
    call(db,'stop_task_timer',timer,{},version=0,success=False)
    sql(db,f"UPDATE public.task_timers SET started_at=clock_timestamp()-interval '2 days' WHERE id='{timer}';")
    call(db,'stop_task_timer',timer,{},version=0,success=False)
    assert value(db,f"status FROM public.task_timers WHERE id='{timer}'")=='Running'
    now_dates=value(db,"jsonb_build_array((clock_timestamp() AT TIME ZONE 'UTC')::date,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date)")
    if len(set(json.loads(now_dates)))==1 and int(value(db,"extract(hour FROM clock_timestamp() AT TIME ZONE 'UTC')"))>0:
        sql(db,f"UPDATE public.task_timers SET started_at=clock_timestamp()-interval '1 minute' WHERE id='{timer}';")
        # Inject failure after log insert but before timer update.
        sql(db,"CREATE TRIGGER test_failure BEFORE UPDATE ON public.task_timers FOR EACH ROW EXECUTE FUNCTION taskpulse_private.test_fail();")
        before_count=value(db,'count(*) FROM public.daily_task_logs')
        call(db,'stop_task_timer',timer,{},version=0,success=False)
        assert value(db,'count(*) FROM public.daily_task_logs')==before_count
        assert value(db,f"status FROM public.task_timers WHERE id='{timer}'")=='Running'
        sql(db,'DROP TRIGGER test_failure ON public.task_timers;')
        stop_key=str(uuid4())
        with ThreadPoolExecutor(max_workers=2) as pool:
            stops=list(pool.map(lambda _:call(db,'stop_task_timer',timer,{},stop_key,version=0),range(2)))
        assert stops[0]==stops[1]
        assert value(db,f"count(*) FROM public.daily_task_logs WHERE source_timer_id='{timer}'")=='1'
        assert value(db,f"status FROM public.task_timers WHERE id='{timer}'")=='Stopped'
        assert call(db,'stop_task_timer',timer,{},stop_key,version=0)==stops[0]
        call(db,'stop_task_timer',timer,{},version=0,success=False)
        print('PASS',db,'concurrent/retried stops exactly one log; injected mid-stop rollback')
    else:
        print('NOT RUN same-day stop success: current UTC/local date ambiguity; policy safeguard tested')
        call(db,'discard_task_timer',timer,{'reason':'Ambiguous test date'},version=0)
    # Different stop keys race as well: one commits, one sees a stopped version.
    second=call(db,'start_task_timer',task,{})['timerId']
    sql(db,f"UPDATE public.task_timers SET started_at=clock_timestamp()-interval '1 minute' WHERE id='{second}';")
    if len(set(json.loads(now_dates)))==1 and int(value(db,"extract(hour FROM clock_timestamp() AT TIME ZONE 'UTC')"))>0:
        def race_stop(_):
            statement=rpc('stop_task_timer',second,{},version=0)
            return subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],input=f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{user4}',true);"+statement+'COMMIT;',text=True,capture_output=True)
        with ThreadPoolExecutor(max_workers=2) as pool: stop_race=list(pool.map(race_stop,range(2)))
        assert sum(r.returncode==0 for r in stop_race)==1 and any('40001' in r.stderr for r in stop_race)
        assert value(db,f"count(*) FROM public.daily_task_logs WHERE source_timer_id='{second}'")=='1'
        print('PASS',db,'different-key concurrent stops one winner/one conflict')
    else: call(db,'discard_task_timer',second,{'reason':'Ambiguous date'},version=0)
    # Discard only running, required reason, terminal stopped records not discarded.
    discard=call(db,'start_task_timer',task,{})['timerId']
    call(db,'discard_task_timer',discard,{},version=0,success=False)
    call(db,'discard_task_timer',discard,{'reason':'Abandoned'},version=0)
    call(db,'discard_task_timer',discard,{'reason':'Again'},version=1,success=False)
    if len(set(json.loads(now_dates)))==1 and int(value(db,"extract(hour FROM clock_timestamp() AT TIME ZONE 'UTC')"))>0:
        managed=call(db,'start_task_timer',task,{})['timerId']
        sql(db,f"UPDATE public.task_timers SET started_at=clock_timestamp()-interval '1 minute' WHERE id='{managed}';")
        managed_result=call(db,'stop_task_timer',managed,{},version=0,uid='2')
        assert value(db,f"user_id FROM public.daily_task_logs WHERE id='{managed_result['logId']}'")==user4
        assert value(db,f"actor_id FROM taskpulse_private.audit_events WHERE command='stop_timer' AND row_id='{managed}'")== '00000000-0000-0000-0000-000000000002'
        print('PASS',db,'engineer administration retains actual worker identity and audited actor')
    # A correction and a removal request cannot silently delete each other's work.
    edit_version=int(value(db,f"execution_version FROM public.daily_task_logs WHERE id='{edit}'"))
    statements=[rpc('correct_task_log',edit,payload|{'requested_delta':2,'reason':'last correction'},version=edit_version),rpc('reverse_task_log',edit,{'reason':'concurrent removal'},version=edit_version)]
    def run_request(statement):
        return subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],input=f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{user4}',true);"+statement+'COMMIT;',text=True,capture_output=True)
    with ThreadPoolExecutor(max_workers=2) as pool: mixed=list(pool.map(run_request,statements))
    assert mixed[0].returncode==0 and mixed[1].returncode!=0 and ('23514' in mixed[1].stderr or '40001' in mixed[1].stderr)
    assert value(db,f"count(*) FROM public.daily_task_logs WHERE id='{edit}'")=='1'
    # Both receipt and audit row sets persist; no raw private notes in aggregate.
    aggregate=actor(db,user4,f"SELECT public.team_summary_inputs(2026,10);")
    result=json.loads(next(x for x in aggregate if x.startswith('{')))
    assert 'private sentinel' not in json.dumps(result) and 'update_notes' not in json.dumps(result)
    actor(db,user4,'SELECT public.team_task_effort_totals(); SELECT public.task_credit_summary();')
    print('PASS',db,'concurrent correction/removal safeguard and private aggregate reads')
    # Audit command correlation/safe content and private privileges.
    assert value(db,f"count(*) FROM taskpulse_private.audit_events WHERE operation_id='{key}' AND command='create_log'")=='1'
    assert value(db,"count(*) FROM taskpulse_private.audit_events WHERE protected_changes::text LIKE '%private sentinel%' OR protected_changes::text LIKE '%example.test/private%'")=='0'
    assert value(db,"count(*) FROM pg_proc WHERE pronamespace IN ('public'::regnamespace,'taskpulse_private'::regnamespace) AND prosecdef AND NOT(coalesce(proconfig,'{}') @> ARRAY['search_path=\"\"'])")=='0'
    check(db,'protected actor audit/outbox/credit',"UPDATE taskpulse_private.task_credit_balances SET scaled_credit=999",uid='1',success=False)
    check(db,'direct forged task metadata',f"UPDATE public.tasks SET metric_version=999 WHERE id='{task}'",uid='1',success=False)
    print('PASS',db,'audit correlation/private content/definer search path/grants')
    print('PASS',db,'M02 acceptance complete (native auth/API/browser checks remain separate)')

artifact={"source":"Disposable PostgreSQL auth shim, not deployed/native Supabase","migrations":["12_atomic_execution_commands.sql","13_execution_credit_summary.sql"],"databases":list(DBS),"checks":"fresh/upgrade/auth/RLS/retries/rollback/concurrency/credit; record/date safeguards retained","catalog":json.loads(sql(DBS[1],"SELECT jsonb_build_object('execution_commands',(SELECT jsonb_agg(proname ORDER BY proname) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('create_task_log','correct_task_log','reverse_task_log','start_task_timer','stop_task_timer','discard_task_timer')),'private_tables',(SELECT jsonb_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='taskpulse_private'),'timer_unique_indexes',(SELECT jsonb_agg(indexdef ORDER BY indexname) FROM pg_indexes WHERE tablename IN ('task_timers','daily_task_logs') AND indexdef LIKE '%UNIQUE%'));"))}
(ROOT/'docs/plans/fixtures/m02-local-evidence.json').write_text(json.dumps(artifact,indent=2)+'\n',encoding='utf-8')
