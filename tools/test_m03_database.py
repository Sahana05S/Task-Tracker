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
DBS = ('taskpulse_m03_fresh_test', 'taskpulse_m03_upgrade_test')

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


def domain(db,command,payload,uid='4',success=True,key=None,version=None,tid=task):
    if version is None: version=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{tid}'"))
    query='SELECT public.task_lifecycle_command('+','.join([literal(tid),literal(command),literal(json.dumps(payload))+'::jsonb',str(version),literal(key or uuid4())])+');'
    lines=actor(db,'00000000-0000-0000-0000-'+uid.zfill(12),query,success)
    if success: return json.loads(next(x for x in lines if x.startswith('{')))

for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db};')
    sql(db,bootstrap)
    for m in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        if int(m.name.split('_')[0])>16: break
        if db==DBS[1] and m.name.startswith('14_'):
            sql(db,seed)
            sql(db,f"INSERT INTO public.daily_task_logs(task_id,user_id,log_date,hours_worked,progress_delta) VALUES ('{task}','{user4}','2026-09-10',1,10);")
            snapshots_before=sql(db,'SELECT jsonb_agg(to_jsonb(s)) FROM public.monthly_performance_snapshots s;')
            logs_before=json.loads(sql(db,'SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.daily_task_logs l;'))
            joins_before=json.loads(sql(db,"SELECT jsonb_build_object('assignees',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.task_assignees a),'reviewers',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.task_reviewers r));"))
            identities_before=sql(db,'SELECT jsonb_agg(jsonb_build_array(id,task_tag) ORDER BY id) FROM public.tasks;')
        if db==DBS[1] and m.name.startswith('16_'):
            preview=json.loads(sql(db,(ROOT/'supabase/reconcile_m02_m03.sql').read_text(encoding='utf-8')).splitlines()[-1])
            (ROOT/'docs/plans/fixtures/m03-pre16-upgrade-preview.json').write_text(json.dumps(preview,indent=2)+'\n',encoding='utf-8')
        sql(db,m.read_text(encoding='utf-8'))
    if db==DBS[0]: sql(db,seed)
    else:
        assert snapshots_before==sql(db,'SELECT jsonb_agg(to_jsonb(s)) FROM public.monthly_performance_snapshots s;')
        assert value(db,'count(*) FROM public.daily_task_logs WHERE effective_progress_delta IS NULL')=='1'
        assert logs_before==json.loads(sql(db,"SELECT jsonb_agg(to_jsonb(l)-ARRAY['timer_segment_number','timer_segment_start','timer_segment_end','timer_duration_seconds','scale_version'] ORDER BY id) FROM public.daily_task_logs l;"))
        assert joins_before==json.loads(sql(db,"SELECT jsonb_build_object('assignees',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.task_assignees a),'reviewers',(SELECT jsonb_agg(to_jsonb(r)-'reviewed_revision' ORDER BY id) FROM public.task_reviewers r));"))
        assert identities_before==sql(db,'SELECT jsonb_agg(jsonb_build_array(id,task_tag) ORDER BY id) FROM public.tasks;')
    report=json.loads(sql(db,(ROOT/'supabase/reconcile_m02_m03.sql').read_text(encoding='utf-8')).splitlines()[-1])
    (ROOT/'docs/plans/fixtures'/('m03-'+('fresh' if db==DBS[0] else 'upgrade')+'-reconciliation.json')).write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    assert value(db,"task_productivity IS NULL FROM public.tasks WHERE task_tag='T2'")=='t'
    print('PASS',db,'migrations and retained upgrade identity/history')
    assert json.loads(value(db,"(SELECT jsonb_object_agg(p,taskpulse_private.priority_weight(p)) FROM unnest(enum_range(NULL::public.task_priority)) p)"))=={'No':0.25,'Low':0.5,'Medium':0.75,'High':1,'Focus':1.2}
    # Fresh/upgrade eligibility is derived, independent of logged-hour rate availability.
    for priority,status,progress,scale,reasons in [
        ('Medium','In Progress',14.99,8,'progress_below_15'),('Medium','In Progress',15,8,''),
        ('No','In Progress',15,8,'priority_no'),('Medium','Not Started',15,8,'not_started'),
        ('Medium','Discarded',15,8,'discarded'),('Medium','In Progress',15,0,'scale_nonpositive')]:
        got=value(db,f"array_to_string(taskpulse_private.eligibility_reasons('{priority}','{status}',{progress},{scale}),',')")
        assert got==reasons,(got,reasons)
    sql(db,f"UPDATE public.tasks SET status='In Progress',assigned_date='2026-10-01',due_date='2026-10-03',progress_percentage=95 WHERE id='{task}';")
    fields={'task_tag':'T1','title':'A','category':'OT','priority':'Medium','due_date':'2026-10-03','task_scale':8,
            'expected_lifecycle_version':int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{task}'"))}
    actor(db,'00000000-0000-0000-0000-000000000001',"SELECT public.save_task_with_participants("+literal(task)+','+literal(json.dumps(fields))+"::jsonb,ARRAY["+U4+"]::uuid[],ARRAY["+U6+"]::uuid[],ARRAY[1000000],0,true,"+literal(uuid4())+");")
    assert value(db,f"valid_for_metrics FROM public.tasks WHERE id='{task}'")=='t'
    assert value(db,f"productivity_available FROM public.tasks WHERE id='{task}'")==('f' if db==DBS[0] else 't')
    for age,overdue,expected in [(3,8,'Super Fresh'),(4,0,'Fresh'),(8,2,'Almost Fresh'),(8,3,'Almost Stale'),(8,4,'Almost Stale'),(10,5,'Stale'),(10,7,'Stale'),(12,8,'Rotten')]:
        result=json.loads(value(db,f"taskpulse_private.freshness_result('2026-10-20'::date-{age},'2026-10-20'::date-{overdue},NULL,'In Progress','2026-10-20')"))
        assert result['state']==expected,(age,overdue,result)
    assert json.loads(value(db,"taskpulse_private.freshness_result('2026-10-01','2026-10-06','2026-10-05','Done','2026-10-20')"))['state']=='Fresh'
    assert json.loads(value(db,"taskpulse_private.freshness_result('2026-10-01',NULL,NULL,'In Progress','2026-10-20')"))['state'] is None
    assert json.loads(value(db,"taskpulse_private.freshness_result('2026-10-01','infinity',NULL,'In Progress','2026-10-20')"))['state'] is None
    check(db,'freshness worker denied to members','SELECT * FROM public.decay_task_freshness()',success=False)
    actor(db,'','SELECT * FROM public.decay_task_freshness()',role='service_role')
    assert int(value(db,"count(*) FROM taskpulse_private.audit_events WHERE command='calendar_freshness_refresh'"))>=1
    print('PASS',db,'eligibility thresholds/reasons/OT and ordered calendar freshness')
    day=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    created=call(db,'create_task_log',task,{'log_date':day,'hours_worked':2,'requested_delta':10})
    assert created['effectiveDelta']==5
    domain(db,'progress',{'progress':80})
    key=str(uuid4()); reversed_result=call(db,'reverse_task_log',created['logId'],{'reason':'Mistaken entry'},key,version=1)
    assert value(db,f"progress_percentage FROM public.tasks WHERE id='{task}'")=='75.00'
    assert call(db,'reverse_task_log',created['logId'],{'reason':'Mistaken entry'},key,version=1)==reversed_result
    assert value(db,f"hours_worked FROM public.daily_task_logs WHERE id='{created['logId']}'")=='2'
    assert value(db,f"reversed_at IS NOT NULL FROM public.daily_task_logs WHERE id='{created['logId']}'")=='t'
    if db==DBS[1]:
        legacy=value(db,'id FROM public.daily_task_logs WHERE effective_progress_delta IS NULL LIMIT 1')
        call(db,'reverse_task_log',legacy,{'reason':'Legacy'},version=0,success=False)
    for uid in ('7','8','6','3'): domain(db,'progress',{'progress':40},uid=uid,success=False)
    # Actual M03 structural/share command: old credit stays stable, new work uses its version.
    user8='00000000-0000-0000-0000-000000000008'
    def save_shares(units):
        fields={'task_tag':'T1','title':'A','category':'OT','priority':'Medium','due_date':'2026-10-03',
                'expected_lifecycle_version':int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{task}'"))}
        pv=value(db,f"participant_version FROM public.tasks WHERE id='{task}'")
        statement="SELECT public.save_task_with_participants("+literal(task)+','+literal(json.dumps(fields))+"::jsonb,ARRAY["+U4+','+literal(user8)+"]::uuid[],ARRAY["+U6+"]::uuid[],ARRAY["+','.join(map(str,units))+"],"+pv+",false,"+literal(uuid4())+");"
        actor(db,'00000000-0000-0000-0000-000000000001',statement)
    prior_balance=value(db,f"sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='{task}'")
    original_shares=value(db,f"credit_shares FROM public.daily_task_logs WHERE id='{created['logId']}'")
    save_shares([500000,500000])
    assert prior_balance==value(db,f"sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='{task}'")
    share_log=call(db,'create_task_log',task,{'log_date':day,'hours_worked':0,'requested_delta':5})['logId']
    assert json.loads(value(db,f"credit_shares FROM public.daily_task_logs WHERE id='{share_log}'"))=={user4:500000,user8:500000}
    earned_before=value(db,f"jsonb_agg(to_jsonb(b) ORDER BY user_id) FROM taskpulse_private.task_credit_balances b WHERE task_id='{task}'")
    save_shares([700000,300000])
    assert earned_before==value(db,f"jsonb_agg(to_jsonb(b) ORDER BY user_id) FROM taskpulse_private.task_credit_balances b WHERE task_id='{task}'")
    assert original_shares==value(db,f"credit_shares FROM public.daily_task_logs WHERE id='{created['logId']}'")
    assert value(db,f"exists(SELECT 1 FROM taskpulse_private.audit_events WHERE command='save_task_with_participants' AND row_id='{task}' AND operation_id IS NOT NULL)")=='t'
    print('PASS',db,'canonical shared participants and prospective 50/50 to70/30 credit with correlated audit')
    domain(db,'review',{},uid='6',success=False)
    domain(db,'scale',{'mode':'manual','inputs':{'value':'NaN'},'reason':'Invalid','provenance':'Test'},uid='2',success=False)
    domain(db,'transition',{'status':'Done'},success=False)
    domain(db,'transition',{'status':'Discarded','reason':'Cancel'},success=False)
    domain(db,'transition',{'status':'Discarded'},uid='2',success=False)
    domain(db,'transition',{'status':'Discarded','reason':'Cancelled by engineer'},uid='2')
    domain(db,'transition',{'status':'In Progress','reason':'Reopen corrected scope'},uid='2')
    assert value(db,f"reopened_at IS NOT NULL FROM public.tasks WHERE id='{task}'")=='t'
    dates_before=value(db,f"jsonb_build_array(assigned_date,started_date,due_date) FROM public.tasks WHERE id='{task}'")
    domain(db,'transition',{'status':'Stopped'})
    domain(db,'transition',{'status':'On-Hold'})
    domain(db,'transition',{'status':'In Progress'})
    domain(db,'transition',{'status':'Carryover','reason':'Next month'},success=False)
    domain(db,'transition',{'status':'Carryover','reason':'Next month'},uid='2')
    assert dates_before==value(db,f"jsonb_build_array(assigned_date,started_date,due_date) FROM public.tasks WHERE id='{task}'")
    domain(db,'transition',{'status':'In Progress'})
    domain(db,'review',{'approved':True},uid='6')
    domain(db,'progress',{'progress':76})
    assert value(db,f"review_approved FROM public.task_reviewers WHERE task_id='{task}' AND user_id="+U6)=='f'
    print('PASS',db,'actual-effect reversal preserves later work; lifecycle authorization/reasons/review invalidation')
    before_credit=value(db,f"sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='{task}'")
    domain(db,'scale',{'mode':'manual','inputs':{'value':16},'reason':'New future weighting','provenance':'Explicit manager input'},uid='2')
    assert before_credit==value(db,f"sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='{task}'")
    domain(db,'scale',{'mode':'activity_count','inputs':{'activity_count':3,'unit_scale':2.5},'override':0,'reason':'Override','provenance':'Workbook numeric activity count'},uid='2')
    assert value(db,f"task_scale FROM public.tasks WHERE id='{task}'")=='0'
    domain(db,'scale',{'mode':'activity_count','inputs':{'activity_count':3,'unit_scale':2.5},'reason':'Remove override','provenance':'Workbook numeric activity count'},uid='2')
    assert float(value(db,f"task_scale FROM public.tasks WHERE id='{task}'"))==7.5
    domain(db,'scale',{'mode':'hours','inputs':{'multiplier':1.5},'reason':'Use measured effort','provenance':'ACTIVITY_HOURSSCALE'},uid='2')
    log=call(db,'create_task_log',task,{'log_date':day,'hours_worked':1,'requested_delta':0})
    expected=(2 if db==DBS[1] else 1)*12.5*1.5
    assert float(value(db,f"task_scale FROM public.tasks WHERE id='{task}'"))==expected
    tid2='10000000-0000-0000-0000-000000000002'
    domain(db,'scale',{'mode':'linked','inputs':{'source_task_id':task,'percentage':50},'reason':'Linked proportional source','provenance':'Proportional support formula'},uid='2',tid=tid2)
    assert float(value(db,f"task_scale FROM public.tasks WHERE id='{tid2}'"))==expected/2
    domain(db,'scale',{'mode':'linked','inputs':{'source_task_id':tid2,'percentage':50},'reason':'Cycle attempt','provenance':'Test'},uid='2',success=False)
    call(db,'reverse_task_log',log['logId'],{'reason':'Effort error'},version=1)
    assert float(value(db,f"task_scale FROM public.tasks WHERE id='{tid2}'"))==(expected-18.75)/2
    print('PASS',db,'manual/derived/zero override/cycle rejection and prospective credit retention')
    # Independently approved ordering: new effort's scale credits its own progress.
    fields={'task_tag':'ORDER','title':'New hours scale','category':'OT','priority':'Medium',
            'due_date':day,'task_scale':0}
    lines=actor(db,'00000000-0000-0000-0000-000000000002',
        "SELECT public.save_task_with_participants(NULL,"+literal(json.dumps(fields))+"::jsonb,ARRAY["+U4+"]::uuid[],ARRAY[]::uuid[],ARRAY[1000000],NULL,false,"+literal(uuid4())+");")
    ordered=next(x for x in reversed(lines) if re.fullmatch(r'[0-9a-f-]{36}',x))
    domain(db,'transition',{'status':'In Progress'},tid=ordered)
    domain(db,'scale',{'mode':'hours','inputs':{'multiplier':1},'reason':'Hours scale','provenance':'Approved ordering fixture'},uid='2',tid=ordered)
    key=str(uuid4())
    first=call(db,'create_task_log',ordered,{'log_date':day,'hours_worked':1,'requested_delta':20},key)
    assert float(value(db,f"task_scale FROM public.tasks WHERE id='{ordered}'"))==12.5
    assert float(value(db,f"sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='{ordered}'"))==2.5
    first_capture=value(db,f"jsonb_build_array(credit_scale,scale_version) FROM public.daily_task_logs WHERE id='{first['logId']}'")
    assert value(db,f"l.credit_scale=t.task_scale AND l.scale_version=t.scale_version FROM public.daily_task_logs l JOIN public.tasks t ON t.id=l.task_id WHERE l.id='{first['logId']}'")=='t'
    assert call(db,'create_task_log',ordered,{'log_date':day,'hours_worked':1,'requested_delta':20},key)==first
    call(db,'create_task_log',ordered,{'log_date':day,'hours_worked':1,'requested_delta':20})
    assert float(value(db,f"sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='{ordered}'"))==7.5
    assert first_capture==value(db,f"jsonb_build_array(credit_scale,scale_version) FROM public.daily_task_logs WHERE id='{first['logId']}'")
    # Fail after effort, scale, progress and credits: every related record rolls back.
    state="jsonb_build_object('tasks',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.tasks t),'logs',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.daily_task_logs l),'credits',(SELECT jsonb_agg(to_jsonb(c) ORDER BY task_id,user_id) FROM taskpulse_private.task_credit_balances c),'scales',(SELECT jsonb_agg(to_jsonb(v) ORDER BY task_id,version) FROM taskpulse_private.scale_versions v),'audit',(SELECT count(*) FROM taskpulse_private.audit_events),'receipts',(SELECT count(*) FROM taskpulse_private.command_receipts),'jobs',(SELECT count(*) FROM taskpulse_private.outbox_jobs),'revisions',(SELECT count(*) FROM taskpulse_private.log_revisions),'events',(SELECT count(*) FROM taskpulse_private.earned_credit_events))"
    before=value(db,state)
    sql(db,"CREATE FUNCTION public.m03_fail_credit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.command='create_log' THEN RAISE EXCEPTION 'Injected after-credit failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$; CREATE TRIGGER m03_fail_credit BEFORE INSERT ON taskpulse_private.audit_events FOR EACH ROW EXECUTE FUNCTION public.m03_fail_credit();")
    call(db,'create_task_log',ordered,{'log_date':day,'hours_worked':1,'requested_delta':20},success=False)
    assert before==value(db,state)
    sql(db,'DROP TRIGGER m03_fail_credit ON taskpulse_private.audit_events; DROP FUNCTION public.m03_fail_credit();')
    # A missing original capture is unavailable even if today's scale is known.
    sql(db,f"UPDATE public.daily_task_logs SET credit_scale=NULL WHERE id='{first['logId']}';")
    summary=json.loads(next(x for x in actor(db,user4,f"SELECT public.team_summary_inputs({day[:4]},{int(day[5:7])});") if x.startswith('{')))
    assert any(x['task_id']==ordered and x['effect_unknown'] for x in summary['logs'])
    sql(db,f"UPDATE public.daily_task_logs SET credit_scale=12.5 WHERE id='{first['logId']}'; UPDATE public.tasks SET task_scale=NULL,scale_mode='manual',scale_inputs='{{}}' WHERE id='{ordered}';")
    count=value(db,'count(*) FROM public.daily_task_logs')
    call(db,'create_task_log',ordered,{'log_date':day,'hours_worked':1,'requested_delta':1},success=False)
    domain(db,'progress',{'progress':41},tid=ordered,success=False)
    assert count==value(db,'count(*) FROM public.daily_task_logs')
    print('PASS',db,'new effort scale credits its log; original capture/retry/after-credit rollback/missing-scale guards')
    segments=json.loads(value(db,"(SELECT jsonb_agg(to_jsonb(s)) FROM taskpulse_private.timer_segments('2026-10-31 23:30+05:30','2026-11-01 00:30+05:30') s)"))
    assert [x['hours'] for x in segments]==[0.5,0.5]
    # Actual stop: previous local midnight crossed, all linked segments use original worker.
    timer=call(db,'start_task_timer',task,{})['timerId']
    sql(db,f"UPDATE public.task_timers SET started_at=((clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date::timestamp AT TIME ZONE 'Asia/Kolkata')-interval '30 minutes' WHERE id='{timer}';")
    key=str(uuid4()); stopped=call(db,'stop_task_timer',timer,{},key,version=0)
    assert len(stopped['logIds'])==2
    assert stopped['logId']==stopped['logIds'][0]
    assert value(db,f"generated_log_id FROM public.task_timers WHERE id='{timer}'")==stopped['logId']
    assert call(db,'stop_task_timer',timer,{},key,version=0)==stopped
    assert value(db,f"count(*) FROM public.daily_task_logs WHERE source_timer_id='{timer}'")=='2'
    short=call(db,'start_task_timer',task,{})['timerId']
    sql(db,f"UPDATE public.task_timers SET started_at=clock_timestamp()-interval '2 seconds' WHERE id='{short}';")
    call(db,'stop_task_timer',short,{},version=0)
    assert float(value(db,f"hours_worked FROM public.daily_task_logs WHERE source_timer_id='{short}'"))>0
    long_timer=call(db,'start_task_timer',task,{})['timerId']
    sql(db,f"UPDATE public.task_timers SET started_at=((date_trunc('month',clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date-1)::timestamp AT TIME ZONE 'Asia/Kolkata')+interval '23 hours 30 minutes' WHERE id='{long_timer}';")
    long_stop=call(db,'stop_task_timer',long_timer,{},version=0)
    assert len(long_stop['logIds'])>2
    assert value(db,f"count(DISTINCT date_trunc('month',log_date::timestamp)) FROM public.daily_task_logs WHERE source_timer_id='{long_timer}'")=='2'
    assert value(db,f"(SELECT sum(timer_duration_seconds) FROM public.daily_task_logs WHERE source_timer_id='{long_timer}')=extract(epoch FROM stopped_at-started_at) FROM public.task_timers WHERE id='{long_timer}'")=='t'
    # Inject failure after timer segments inserted; no partial log/timer/receipt survives.
    timer=call(db,'start_task_timer',task,{})['timerId']
    sql(db,f"UPDATE public.task_timers SET started_at=clock_timestamp()-interval '2 seconds' WHERE id='{timer}';")
    sql(db,"CREATE FUNCTION public.m03_fail_timer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='Stopped' THEN RAISE EXCEPTION 'Injected timer failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$; CREATE TRIGGER m03_fail BEFORE UPDATE ON public.task_timers FOR EACH ROW EXECUTE FUNCTION public.m03_fail_timer();")
    call(db,'stop_task_timer',timer,{},version=0,success=False)
    assert value(db,f"count(*) FROM public.daily_task_logs WHERE source_timer_id='{timer}'")=='0'
    assert value(db,f"status FROM public.task_timers WHERE id='{timer}'")=='Running'
    sql(db,'DROP TRIGGER m03_fail ON public.task_timers; DROP FUNCTION public.m03_fail_timer();')
    key=str(uuid4())
    with ThreadPoolExecutor(2) as pool:
        results=list(pool.map(lambda _:call(db,'stop_task_timer',timer,{},key,version=0),range(2)))
    assert results[0]==results[1]
    fault_log=call(db,'create_task_log',task,{'log_date':day,'hours_worked':1,'requested_delta':0})['logId']
    state_query=f"jsonb_build_object('task',(SELECT to_jsonb(t) FROM public.tasks t WHERE id='{task}'),'log',(SELECT to_jsonb(l) FROM public.daily_task_logs l WHERE id='{fault_log}'),'audit',(SELECT count(*) FROM taskpulse_private.audit_events),'receipts',(SELECT count(*) FROM taskpulse_private.command_receipts),'jobs',(SELECT count(*) FROM taskpulse_private.outbox_jobs),'credits',(SELECT jsonb_agg(to_jsonb(b) ORDER BY user_id) FROM taskpulse_private.task_credit_balances b))"
    before_fault=value(db,state_query)
    sql(db,"CREATE FUNCTION public.m03_fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected post-source failure' USING ERRCODE='23514'; END $$; CREATE TRIGGER m03_fail BEFORE INSERT ON taskpulse_private.outbox_jobs FOR EACH ROW EXECUTE FUNCTION public.m03_fail_outbox();")
    call(db,'reverse_task_log',fault_log,{'reason':'Failure rehearsal'},version=1,success=False)
    assert before_fault==value(db,state_query)
    sql(db,'DROP TRIGGER m03_fail ON taskpulse_private.outbox_jobs; DROP FUNCTION public.m03_fail_outbox();')
    check(db,'protected direct task edits',f"UPDATE public.tasks SET priority='Focus' WHERE id='{task}'",uid='2',success=False)
    check(db,'protected private scale versions','DELETE FROM taskpulse_private.scale_versions',uid='2',success=False)
    domain(db,'scale',{'mode':'manual','inputs':{'value':0.05},'reason':'Small future scale','provenance':'Independent precision fixture'},uid='2')
    domain(db,'scale',{'mode':'linked','inputs':{'source_task_id':task,'percentage':12.5},'reason':'Small linked fraction','provenance':'Independent precision fixture'},uid='2',tid=tid2)
    assert float(value(db,f"task_scale FROM public.tasks WHERE id='{tid2}'"))==0.00625
    assert json.loads(sql(db,(ROOT/'supabase/reconcile_m02_m03.sql').read_text(encoding='utf-8')).splitlines()[-1])['duplicate_timer_links']==[]
    print('PASS',db,'midnight/month segments, short positive duration, stop rollback and concurrent retry')

# Read-only pre-12 duplicate-link rehearsal: preserve and report, never auto-merge.
db='taskpulse_m03_reconciliation_test'
sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
sql('postgres',f'CREATE DATABASE {db};'); sql(db,bootstrap)
for migration in sorted((ROOT/'supabase/migrations').glob('*.sql')):
    if int(migration.name.split('_')[0])>11: break
    sql(db,migration.read_text(encoding='utf-8'))
sql(db,seed)
sql(db,f"INSERT INTO public.task_timers(id,task_id,user_id,status) VALUES ('50000000-0000-0000-0000-000000000001','{task}','{user4}','Stopped'); INSERT INTO public.daily_task_logs(task_id,user_id,log_date,hours_worked,progress_delta,source_timer_id) SELECT '{task}','{user4}','2026-09-10',1,10,'50000000-0000-0000-0000-000000000001' FROM generate_series(1,2);")
report=json.loads(sql(db,(ROOT/'supabase/reconcile_m02_m03.sql').read_text(encoding='utf-8')).splitlines()[-1])
assert len(report['duplicate_timer_links'])==1 and report['duplicate_timer_links'][0]['link_count']==2
assert report['legacy_unknown_effect_count']==2
(ROOT/'docs/plans/fixtures/m03-duplicate-timer-reconciliation.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
assert value(db,'count(*) FROM public.daily_task_logs')=='2'
print('PASS',db,'dry-run duplicate/unknown-effect report preserves all uncertain history')
