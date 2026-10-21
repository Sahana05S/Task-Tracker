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
DBS = ('taskpulse_m06_fresh_test', 'taskpulse_m06_upgrade_test')

def sql(db, statement, success=True):
    result = subprocess.run([args.psql, '-X', '-h', '127.0.0.1', '-p', str(args.port),
                             '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-At'],
                            input=statement, text=True, capture_output=True, encoding='utf-8')
    if success and result.returncode:
        raise AssertionError(result.stderr + '\n' + statement[:300])
    if not success and result.returncode == 0:
        raise AssertionError('Expected database denial: ' + statement)
    if not success and not any(code in result.stderr for code in ('42501','23514','40001','PT409','23503')):
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


def domain(db,command,payload,uid='4',success=True,key=None,version=None,tid=task):
    if version is None: version=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{tid}'"))
    query='SELECT public.task_lifecycle_command('+','.join([literal(tid),literal(command),literal(json.dumps(payload))+'::jsonb',str(version),literal(key or uuid4())])+');'
    lines=actor(db,'00000000-0000-0000-0000-'+uid.zfill(12),query,success)
    if success: return json.loads(next(x for x in lines if x.startswith('{')))


def record(db,kind,payload,cmd='save',id=None,uid='4',version=None,key=None,success=True):
    if version is None:version=int(value(db,f"record_version FROM public.{ {'attendance':'attendance_records','fact':'daily_facts','idea':'ideas','suggestion':'suggestions','sale':'sales_logs','meeting':'meeting_points'}[kind]} WHERE id='{id}'")) if id else 0
    q='SELECT public.dated_record_command('+','.join([literal(kind),'NULL' if id is None else literal(id),literal(cmd),literal(json.dumps(payload))+'::jsonb',str(version),literal(key or uuid4())])+');'
    lines=actor(db,'00000000-0000-0000-0000-'+uid.zfill(12),q,success)
    if success:return json.loads(next(x for x in lines if x.startswith('{')))

def context(db,from_day,to_day,asof=None,uid='4'):
    q=f"SELECT public.attendance_input_context('00000000-0000-0000-0000-{uid.zfill(12)}','{from_day}','{to_day}',"+('clock_timestamp()' if asof is None else literal(asof)+'::timestamptz')+');'
    return json.loads(next(x for x in actor(db,'00000000-0000-0000-0000-'+uid.zfill(12),q) if x.startswith('{')))

for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);');sql('postgres',f'CREATE DATABASE {db};');sql(db,bootstrap)
    for migration in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        if int(migration.name.split('_')[0])>20:break
        if db==DBS[1] and migration.name.startswith('19_'):
            sql(db,seed)
            sql(db,"UPDATE public.daily_facts SET is_validated=true WHERE id='40000000-0000-0000-0000-000000000001'; INSERT INTO public.meeting_points(meeting_date,posted_by,point) VALUES((clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date,'00000000-0000-0000-0000-000000000004','Legacy point with unknown resolver');")
            legacy=value(db,'jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.daily_facts t')
            snapshot=value(db,'jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.monthly_performance_snapshots t')
        sql(db,migration.read_text(encoding='utf-8'))
    if db==DBS[0]:sql(db,seed)
    else:
        assert snapshot==value(db,'jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.monthly_performance_snapshots t')
        old=json.loads(legacy);new=json.loads(value(db,'jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.daily_facts t'))
        for before,after in zip(old,new):
            for key in ('id','fact','posted_by','fact_date','is_validated','validated_by','created_at'):assert before[key]==after[key]
            assert after['validation_state']==('validated' if before['is_validated'] else 'legacy_unvalidated')
            assert after['validation_at'] is None
        assert value(db,"owner_id IS NULL AND resolution_status IS NULL FROM public.meeting_points WHERE point='Legacy point with unknown resolver'")=='t'
    print('PASS',db,'fresh/upgrade through20; originals/snapshots retained; unknown legacy state not guessed pending')
    day=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    nextday=value(db,"((clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date+1)")
    payload={'business_date':day,'author_id':user4,'attendance_status':'Present','attendance_hours':'8','off_hours':'0','check_in_at':day+'T09:00:00+05:30','check_out_at':day+'T17:00:00+05:30'}
    att=record(db,'attendance',payload);attid=att['id']
    assert context(db,day,nextday)['days'][0]['attendanceHours']=='8'
    record(db,'attendance',payload,success=False)
    corrected={**payload,'attendance_hours':'7.5','reason':'Measured correction'}
    record(db,'attendance',corrected,id=attid)
    assert context(db,day,nextday)['days'][0]['attendanceHours']=='7.5'
    record(db,'attendance',{**corrected,'author_id':user5},id=attid,success=False)
    for change in [{'attendance_hours':None},{'attendance_hours':-1},{'attendance_hours':'NaN'},{'check_out_at':day+'T08:00:00+05:30'},{'check_out_at':None}]:record(db,'attendance',{**corrected,**change},id=attid,success=False)
    for uid in ('3','5','7'):
        record(db,'attendance',corrected,id=attid,uid=uid,success=False)
    check(db,'direct attendance denied',f"UPDATE public.attendance_records SET attendance_hours=10 WHERE id='{attid}'",success=False)
    # Six labels retain explicitly measured inputs, no state-derived default budget.
    for status in ('Present','Absent','Half Day','Holiday','Leave','Off Hours'):
        record(db,'attendance',{**corrected,'attendance_status':status,'attendance_hours':'0','off_hours':'0','check_in_at':None,'check_out_at':None},id=attid)
        inp=context(db,day,nextday);assert inp['valid'] is True and inp['days'][0]['status']==status and inp['days'][0]['attendanceHours']=='0'
    for status in ('Absent','Leave','Holiday','Off Hours'):
        record(db,'attendance',corrected|{'attendance_status':status,'check_in_at':None,'check_out_at':None},id=attid,success=False)
    for status in ('Absent','Leave'):
        record(db,'attendance',corrected|{'attendance_status':status,'attendance_hours':'0','off_hours':'1','check_in_at':None,'check_out_at':None},id=attid,success=False)
    record(db,'attendance',corrected,id=attid)
    print('PASS',db,'six explicit states; measured zero/missing distinction; local clock consistency; own active identity; approved daily validity')
    fact=record(db,'fact',{'business_date':day,'content':'Independent fact','author_id':user4,'asset_url':'https://example.test/fact'})
    fid=fact['id'];cut=value(db,'clock_timestamp()')
    record(db,'fact',{'state':'validated','reason':'Independent review'},cmd='validate',id=fid,uid='3')
    assert value(db,f"validation_state FROM public.daily_facts WHERE id='{fid}'")=='validated'
    for uid in ('4','5','7'):
        record(db,'fact',{'state':'validated','reason':'Forbidden review'},cmd='validate',id=fid,uid=uid,success=False)
    own=record(db,'fact',{'business_date':day,'content':'Admin contribution'},uid='3')
    record(db,'fact',{'state':'validated','reason':'Self validation'},cmd='validate',id=own['id'],uid='3',success=False)
    record(db,'fact',{'state':'rejected','reason':'Rejected independently'},cmd='validate',id=fid,uid='2')
    assert value(db,f"NOT is_validated AND validation_state='rejected' FROM public.daily_facts WHERE id='{fid}'")=='t'
    record(db,'fact',{'business_date':day,'content':'Reviewed work corrected atomically','reason':'Approved reset'},id=fid,uid='3')
    assert value(db,f"validation_state='pending' AND NOT is_validated AND validation_at IS NULL AND validated_by IS NULL FROM public.daily_facts WHERE id='{fid}'")=='t'
    record(db,'fact',{'state':'pending','reason':'Return for correction'},cmd='validate',id=fid,uid='3')
    record(db,'fact',{'business_date':day,'content':'Retained correction','reason':'Corrected source'},id=fid,uid='3')
    record(db,'fact',{'reason':'Retained withdrawal'},cmd='withdraw',id=fid,uid='3')
    assert value(db,f"validation_state FROM public.daily_facts WHERE id='{fid}'")=='withdrawn'
    q=f"SELECT public.contribution_input_context('{day}','{nextday}',{literal(cut)}::timestamptz);"
    old_context=json.loads(next(x for x in actor(db,user4,q) if x.startswith('{')))
    assert next(x for x in old_context['sources'] if x['id']==fid)['state']=='pending'
    assert 'contribution_population_and_effective_date_unapproved' not in old_context['reasons'] and old_context['factors']['sale']['rawValue'] is None
    history=actor(db,user4,f"SELECT public.dated_record_history('fact','{fid}');")
    rows=json.loads(next(x for x in history if x.startswith('[')));assert [x['source']['validation_state'] for x in rows]==['pending','validated','rejected','pending','pending','pending','withdrawn']
    assert rows[0]['source']['fact']=='Independent fact' and rows[-1]['source']['fact']=='Retained correction'
    check(db,'other employee history denied',f"SELECT public.dated_record_history('fact','{fid}')",uid='5',success=False)
    check(db,'direct validation denied',f"UPDATE public.daily_facts SET is_validated=true WHERE id='{fid}'",uid='3',success=False)
    check(db,'private effort history cannot be queried by data manager',"SELECT public.dated_record_history('effort','00000000-0000-0000-0000-000000000004')",uid='3',success=False)
    print('PASS',db,'independent/self validation boundary; pending/validated/rejected/withdrawn history; reproducible as-of; approved state populations; sales raw remains unavailable')
    sale=record(db,'sale',{'business_date':day,'content':'Sale notes','project_built_up_area':'1,200 sq ft','project_location':'Fixture site','client_name':'Fixture client','is_new_project':True,'basement_payment_received':False})
    meeting=record(db,'meeting',{'business_date':day,'content':'Blocking issue','meeting_type':'Project meeting','owner_id':user5,'point_type':'Blocking Issue','resolution_status':'In Progress','related_task_id':task,'asset_url':'https://example.test/meeting'})
    assert value(db,f"owner_id='{user5}' AND related_task_id='{task}' FROM public.meeting_points WHERE id='{meeting['id']}'")=='t'
    record(db,'sale',{'reason':'Keep history'},cmd='withdraw',id=sale['id'],uid='3')
    print('PASS',db,'typed sales fields without guessed BO/BN/BP; meeting owner/type/task relationship and retained withdrawal')
    # Literal source-row fixtures for the now-approved populations, isolated author8.
    def contribution_ctx(start=day,end=nextday,asof=None):
        q=f"SELECT public.contribution_input_context('{start}','{end}',"+('clock_timestamp()' if asof is None else literal(asof)+'::timestamptz')+');'
        return json.loads(next(x for x in actor(db,user4,q) if x.startswith('{')))
    def employee_raw(asof=None):
        return next(x['factors'] for x in contribution_ctx(asof=asof)['employeeFactors'] if x['userId'].endswith('000008'))
    fixtures=[]
    for kind in ('fact','idea','suggestion'):
        made=[record(db,kind,{'business_date':day,'content':f'{kind} classified source {i}'},uid='8') for i in range(3)]
        for r in made[:2 if kind=='fact' else 1]:record(db,kind,{'state':'validated','reason':'Independent fixture review'},cmd='validate',id=r['id'],uid='3')
        fixtures.append(made)
    rejected=record(db,'fact',{'business_date':day,'content':'Excluded rejected fact'},uid='8')
    record(db,'fact',{'state':'rejected','reason':'Does not qualify'},cmd='validate',id=rejected['id'],uid='3')
    own_pending=record(db,'fact',{'business_date':day,'content':'Own pending correction'},uid='8')
    record(db,'fact',{'business_date':day,'content':'Own corrected pending','reason':'Fix source content'},id=own_pending['id'],uid='8')
    record(db,'fact',{'reason':'Own pending withdrawal'},cmd='withdraw',id=own_pending['id'],uid='8')
    raw=employee_raw();assert raw['fact']['rawValue']==1.88 and raw['idea']['rawValue']==3.5 and raw['suggestion']['rawValue']==3.5
    assert raw['sale']['rawValue'] is None and not raw['sale']['available']
    record(db,'fact',{'business_date':day,'content':'Author cannot overwrite reviewed evidence','reason':'Denied'},id=fixtures[0][0]['id'],uid='8',success=False)
    record(db,'fact',{'reason':'Author cannot withdraw reviewed evidence'},cmd='withdraw',id=fixtures[0][0]['id'],uid='8',success=False)
    old_instant=value(db,'clock_timestamp()')
    record(db,'fact',{'business_date':day,'content':'Manager revised reviewed fact','reason':'Approved atomic reset'},id=fixtures[0][0]['id'],uid='3')
    assert employee_raw()['fact']['rawValue']==1.51 and employee_raw(old_instant)['fact']['rawValue']==1.88
    assert value(db,f"validation_state='pending' AND validation_at IS NULL AND validated_by IS NULL FROM public.daily_facts WHERE id='{fixtures[0][0]['id']}'")=='t'
    # Validation credits the source business date, never the later review day.
    earlier=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date-2")
    earlier_end=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date-1")
    dated_fact=record(db,'fact',{'business_date':earlier,'content':'Earlier source date'},uid='8')
    before_review=value(db,'clock_timestamp()')
    record(db,'fact',{'state':'validated','reason':'Observed later review'},cmd='validate',id=dated_fact['id'],uid='3')
    def earlier_raw(asof=None):return next(x['factors']['fact']['rawValue'] for x in contribution_ctx(earlier,earlier_end,asof)['employeeFactors'] if x['userId'].endswith('000008'))
    assert earlier_raw(before_review)==0.38 and earlier_raw()==0.75
    print('PASS',db,'approved own pending edit/withdraw; reviewed correction atomic reset; rejected/withdrawn excluded; source-row raw1.88/3.50; original-date/as-of credit')
    # Midnight timer segments enter one dated effort stream; retries never duplicate it.
    manual=call(db,'create_task_log',task,{'log_date':day,'hours_worked':8,'requested_delta':0})
    observed=value(db,'clock_timestamp()')
    assert float(context(db,day,nextday)['days'][0]['effortHours'])==8
    record(db,'attendance',payload|{'reason':'Confirm eight hours'},id=attid)
    assert context(db,day,nextday)['valid'] is True
    call(db,'correct_task_log',manual['logId'],{'log_date':day,'hours_worked':8.01,'requested_delta':0,'reason':'Measured effort correction'},version=1)
    assert float(context(db,day,nextday)['days'][0]['effortHours'])==8.01
    assert context(db,day,nextday)['valid'] is False
    record(db,'attendance',payload|{'off_hours':'0.01','reason':'Separately measured off-hours'},id=attid)
    assert context(db,day,nextday)['valid'] is True
    extra=call(db,'create_task_log',task,{'log_date':day,'hours_worked':2,'requested_delta':0})
    record(db,'attendance',payload|{'off_hours':'2','reason':'Record two off-hours separately'},id=attid)
    assert context(db,day,nextday)['valid'] is False # 8.01+2 > 8+2; off hours are not counted twice.
    call(db,'correct_task_log',extra['logId'],{'log_date':day,'hours_worked':1.99,'requested_delta':0,'reason':'Correct extra effort'},version=1)
    assert context(db,day,nextday)['valid'] is True # Exactly10 fits regular8+off2.
    call(db,'reverse_task_log',extra['logId'],{'reason':'Retain correction history'},version=2)
    assert float(context(db,day,nextday,observed)['days'][0]['effortHours'])==8
    call(db,'reverse_task_log',manual['logId'],{'reason':'Retained reversal'},version=2)
    assert float(context(db,day,nextday)['days'][0]['effortHours'])==0
    yesterday=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date-1")
    timer=call(db,'start_task_timer',task,{})['timerId']
    sql(db,f"UPDATE public.task_timers SET started_at=((clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date::timestamp AT TIME ZONE 'Asia/Kolkata')-interval '30 minutes' WHERE id='{timer}';")
    key=str(uuid4());stopped=call(db,'stop_task_timer',timer,{},key,version=0)
    assert len(stopped['logIds'])==2 and call(db,'stop_task_timer',timer,{},key,version=0)==stopped
    dated=context(db,yesterday,nextday)['days']
    assert float(dated[0]['effortHours'])==0.5 and len(dated[0]['effortSources'])==1
    assert sum(len(d['effortSources']) for d in dated)==2
    assert value(db,f"sum(timer_duration_seconds)=extract(epoch FROM (SELECT stopped_at-started_at FROM public.task_timers WHERE id='{timer}')) FROM public.daily_task_logs WHERE source_timer_id='{timer}'")=='t'
    assert dated[0]['attendanceHours'] is None
    assert context(db,yesterday,nextday)['valid'] is None
    # Current-day spare capacity cannot cover an excessive previous day.
    record(db,'attendance',payload|{'attendance_hours':'24','off_hours':'0','check_in_at':None,'check_out_at':None,'reason':'Measured current-day capacity'},id=attid)
    prev=record(db,'attendance',{'business_date':yesterday,'attendance_status':'Present','attendance_hours':'0.25','off_hours':'0'})
    period=context(db,yesterday,nextday)
    assert period['validityAvailable'] and period['valid'] is False
    assert period['days'][1]['valid'] is True and period['days'][0]['valid'] is False
    record(db,'attendance',{'business_date':yesterday,'attendance_status':'Half Day','attendance_hours':'0.5','off_hours':'0','reason':'Measured prior-day correction'},id=prev['id'])
    assert context(db,yesterday,nextday)['valid'] is True
    assert context(db,earlier,nextday)['valid'] is None # Missing elapsed day remains unavailable.
    print('PASS',db,'8/8.01 exact recorded effort; as-of correction/reversal; local midnight segments/retry; missing attendance stays unavailable')
    # Same operation and same version converge to one review and history revision.
    pending=record(db,'idea',{'business_date':day,'content':'Concurrent idea'})
    key=str(uuid4())
    with ThreadPoolExecutor(2) as pool:
        outcomes=list(pool.map(lambda _:record(db,'idea',{'state':'validated','reason':'Concurrent independent review'},cmd='validate',id=pending['id'],uid='3',version=1,key=key),range(2)))
    assert outcomes[0]==outcomes[1]
    assert value(db,f"count(*) FROM taskpulse_private.input_history WHERE kind='idea' AND record_id='{pending['id']}'")=='2'
    racing=record(db,'suggestion',{'business_date':day,'content':'Concurrent suggestion'})
    def race(cmd):
        try:
            payload={'state':'validated','reason':'Review race'} if cmd=='validate' else {'business_date':day,'content':'Corrected content','reason':'Correction race'}
            record(db,'suggestion',payload,cmd=cmd,id=racing['id'],uid='3',version=1);return True
        except AssertionError as error:
            assert any(c in str(error) for c in ('40001','PT409'));return False
    with ThreadPoolExecutor(2) as pool:results=list(pool.map(race,['validate','save']))
    assert sorted(results)==[False,True]
    # Midway outbox failure undoes source, history, audit and receipt.
    counts="jsonb_build_object('facts',(SELECT count(*) FROM public.daily_facts),'attendance',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.attendance_records a),'history',(SELECT count(*) FROM taskpulse_private.input_history),'audit',(SELECT count(*) FROM taskpulse_private.audit_events),'jobs',(SELECT count(*) FROM taskpulse_private.outbox_jobs),'receipts',(SELECT count(*) FROM taskpulse_private.command_receipts),'logs',(SELECT count(*) FROM public.daily_task_logs))"
    before=value(db,counts)
    sql(db,"CREATE FUNCTION public.m06_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected input invalidation failure' USING ERRCODE='23514'; END $$; CREATE TRIGGER m06_fail BEFORE INSERT ON taskpulse_private.outbox_jobs FOR EACH ROW EXECUTE FUNCTION public.m06_fail();")
    record(db,'fact',{'business_date':day,'content':'Rolled back fact'},success=False)
    assert before==value(db,counts)
    call(db,'create_task_log',task,{'log_date':day,'hours_worked':1,'requested_delta':0},success=False)
    assert before==value(db,counts)
    sql(db,'DROP TRIGGER m06_fail ON taskpulse_private.outbox_jobs;DROP FUNCTION public.m06_fail();')
    sql(db,'DELETE FROM taskpulse_private.input_history;',success=False)
    sql(db,f"DELETE FROM public.daily_facts WHERE id='{fid}';",success=False)
    print('PASS',db,'concurrent validation/correction version conflict; same-key review convergence; input/effort/outbox rollback; immutable history')
    # Attribution corrections preserve each employee's private historical slice.
    record(db,'attendance',{**corrected,'author_id':user5,'content':'Private replacement for another employee'},id=attid,uid='2')
    own_history=json.loads(next(x for x in actor(db,user4,f"SELECT public.dated_record_history('attendance','{attid}');") if x.startswith('[')))
    assert all(x['source']['user_id']==user4 for x in own_history)
    assert not any(x['source'].get('notes')=='Private replacement for another employee' for x in own_history)
    check(db,'data manager cannot inspect other attendance history',f"SELECT public.dated_record_history('attendance','{attid}')",uid='3',success=False)
    record(db,'attendance',{**corrected,'author_id':user4},id=attid,uid='2')
    check(db,'other employee context denied',f"SELECT public.attendance_input_context('{user4}','{day}','{nextday}',clock_timestamp())",uid='5',success=False)
    check(db,'anonymous dated command denied',f"SELECT public.dated_record_command('fact',NULL,'save','{{}}',0,'{uuid4()}')",uid='',role='anon',success=False)
    # Frozen old and new dates cannot be bypassed by validation/date/author edits.
    blocked=record(db,'fact',{'business_date':day,'content':'Frozen source'})
    sql(db,f"INSERT INTO public.monthly_performance_snapshots(user_id,snapshot_year,snapshot_month) VALUES('{user4}',extract(year FROM '{day}'::date)::integer,extract(month FROM '{day}'::date)::integer);")
    before=value(db,counts)
    record(db,'attendance',corrected,id=attid,uid='2',success=False)
    record(db,'fact',{'state':'validated','reason':'Frozen review'},cmd='validate',id=blocked['id'],uid='3',success=False)
    record(db,'fact',{'business_date':yesterday,'author_id':user5,'content':'Cannot move out of freeze','reason':'Frozen reassignment'},id=blocked['id'],uid='3',success=False)
    assert before==value(db,counts)
    sql(db,f"DELETE FROM public.monthly_performance_snapshots WHERE user_id='{user4}' AND snapshot_year=extract(year FROM '{day}'::date) AND snapshot_month=extract(month FROM '{day}'::date);")
    print('PASS',db,'private history/context/report boundary; anonymous denial; old-date frozen validation/correction/reassignment protection')
print('PASS M06 approved PostgreSQL integration checks through20')
