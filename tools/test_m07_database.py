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
DBS = ('taskpulse_m07_fresh_test', 'taskpulse_m07_upgrade_test')

def sql(db, statement, success=True):
    result = subprocess.run([args.psql, '-X', '-h', '127.0.0.1', '-p', str(args.port),
                             '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-At'],
                            input=statement, text=True, capture_output=True, encoding='utf-8')
    if success and result.returncode:
        raise AssertionError(result.stderr + '\n' + statement[:300])
    if not success and result.returncode == 0:
        raise AssertionError('Expected database denial: ' + statement)
    if not success and not any(code in result.stderr for code in ('42501','23514','40001','23503')):
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

def source(db,start,end,asof=None,uid='00000000-0000-0000-0000-000000000002',role='authenticated'):
    q=f"SELECT public.performance_source_context('{start}','{end}',"+('clock_timestamp()' if asof is None else literal(asof)+'::timestamptz')+');'
    return json.loads(next(x for x in actor(db,uid,q,role=role) if x.startswith('{')))

for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);');sql('postgres',f'CREATE DATABASE {db};');sql(db,bootstrap)
    for migration in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        if int(migration.name.split('_')[0])>20:break
        sql(db,migration.read_text(encoding='utf-8'))
    sql(db,seed)
    day=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    end=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date+1")
    sql(db,f"UPDATE public.tasks SET assigned_date='{day}',due_date='{end}',status='In Progress',progress_percentage=50,priority='High' WHERE id='{task}';")
    fields={'task_tag':'T1','title':'A','category':'T','priority':'High','due_date':end,'task_scale':8,'expected_lifecycle_version':int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{task}'"))}
    actor(db,'00000000-0000-0000-0000-000000000001',"SELECT public.save_task_with_participants("+literal(task)+','+literal(json.dumps(fields))+"::jsonb,ARRAY["+U4+"]::uuid[],ARRAY["+U6+"]::uuid[],ARRAY[1000000],0,true,"+literal(uuid4())+");")
    record(db,'attendance',{'business_date':day,'attendance_status':'Present','attendance_hours':'8','off_hours':'0','content':'Private attendance fixture text'})
    fact=record(db,'fact',{'business_date':day,'content':'Private contribution fixture text'})
    first=call(db,'create_task_log',task,{'log_date':day,'hours_worked':1,'requested_delta':20})
    old_instant=value(db,'clock_timestamp()')
    preserved=value(db,"jsonb_build_object('tasks',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.tasks t),'snapshots',(SELECT jsonb_agg(to_jsonb(s)-ARRAY['calculation_rule_version','calculation_context','factor_components'] ORDER BY id) FROM public.monthly_performance_snapshots s),'attendance',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.attendance_records a),'facts',(SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM public.daily_facts f))")
    sql(db,(ROOT/'supabase/migrations/21_performance_sources_and_recomputation.sql').read_text())
    assert preserved==value(db,"jsonb_build_object('tasks',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.tasks t),'snapshots',(SELECT jsonb_agg(to_jsonb(s)-ARRAY['calculation_rule_version','calculation_context','factor_components'] ORDER BY id) FROM public.monthly_performance_snapshots s),'attendance',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.attendance_records a),'facts',(SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM public.daily_facts f))")
    assert not source(db,day,end,old_instant)['historyAvailable']
    current=source(db,day,end);assert current['historyAvailable']
    t=next(t for t in current['tasks'] if t['id']==task)
    assert float(t['periodCredits'][user4])==1.6 and float(t['credits'][user4])==5.6
    assert 'Private attendance fixture text' not in json.dumps(current) and 'Private contribution fixture text' not in json.dumps(current)
    assert 'attendanceId' not in json.dumps(current['attendance']) and 'check_in_at' not in json.dumps(current)
    check(db,'private attendance days still denied',f"SELECT public.attendance_input_context('{user4}','{day}','{end}',clock_timestamp())",uid='5',success=False)
    check(db,'inactive source denied',f"SELECT public.performance_source_context('{day}','{end}',clock_timestamp())",uid='7',success=False)
    check(db,'anonymous source denied',f"SELECT public.performance_source_context('{day}','{end}',clock_timestamp())",uid='',role='anon',success=False)
    check(db,'member cannot claim worker jobs',"SELECT public.claim_performance_jobs(1)",success=False)
    check(db,'private observations inaccessible','SELECT count(*) FROM taskpulse_private.performance_observations',success=False)
    check(db,'team cannot infer private attendance through one-day context',f"SELECT public.performance_source_context('{day}','{end}',clock_timestamp())",success=False)
    month_start=value(db,"date_trunc('month',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date)::date")
    month_end=value(db,"(date_trunc('month',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date)+interval '1 month')::date")
    assert source(db,month_start,month_end,uid=user4)['contract']=='m07-sources-v1'
    earlier_cutoff=value(db,"clock_timestamp()-interval '1 day'")
    check(db,'team cannot reconstruct daily attendance by moving aggregate cutoff',f"SELECT public.performance_source_context('{month_start}','{month_end}',{literal(earlier_cutoff)}::timestamptz)",success=False)
    # Normal self-profile updates keep their existing rights and update source revision.
    actor(db,user4,"UPDATE public.users SET full_name='Updated own name' WHERE id=auth.uid();")
    assert source(db,day,end)['sourceWatermark']!=current['sourceWatermark']
    print('PASS',db,'fresh/upgrade01-20 to21; sources/snapshots unchanged; pre-baseline unavailable; aggregate privacy; role boundary; self-profile compatibility')
    before_scale=value(db,'clock_timestamp()')
    domain(db,'scale',{'mode':'manual','inputs':{'value':16},'override':None,'reason':'Prospective scale','provenance':'Fixture manual scale'},uid='2')
    old=source(db,day,end,before_scale);assert next(t for t in old['tasks'] if t['id']==task)['scale']=='8'
    t=next(t for t in source(db,day,end)['tasks'] if t['id']==task);assert float(t['periodCredits'][user4])==1.6 and float(t['credits'][user4])==5.6
    second=call(db,'create_task_log',task,{'log_date':day,'hours_worked':1,'requested_delta':10})
    call(db,'correct_task_log',first['logId'],{'log_date':day,'hours_worked':1,'requested_delta':10,'reason':'Correct applied effect at original scale'},version=1)
    t=next(t for t in source(db,day,end)['tasks'] if t['id']==task);assert float(t['periodCredits'][user4])==2.4
    user8='00000000-0000-0000-0000-000000000008'
    fields['expected_lifecycle_version']=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{task}'"));fields.pop('task_scale')
    pv=value(db,f"participant_version FROM public.tasks WHERE id='{task}'")
    actor(db,'00000000-0000-0000-0000-000000000001',"SELECT public.save_task_with_participants("+literal(task)+','+literal(json.dumps(fields))+"::jsonb,ARRAY["+U4+','+literal(user8)+"]::uuid[],ARRAY["+U6+"]::uuid[],ARRAY[500000,500000],"+pv+",false,"+literal(uuid4())+");")
    call(db,'create_task_log',task,{'log_date':day,'hours_worked':1,'requested_delta':10})
    domain(db,'progress',{'progress':85})
    current=source(db,day,end);t=next(t for t in current['tasks'] if t['id']==task)
    assert round(float(t['periodCredits'][user4]),8)==3.6 and round(float(t['periodCredits'][user8]),8)==1.2
    assert not t['periodCreditUnknown'] and float(t['taskHours'])==3
    before_review=value(db,'clock_timestamp()');record(db,'fact',{'state':'validated','reason':'Independent later review'},cmd='validate',id=fact['id'],uid='3')
    assert next(x for x in source(db,day,end,before_review)['contributions']['sources'] if x['id']==fact['id'])['state']=='pending'
    assert next(x for x in source(db,day,end)['contributions']['sources'] if x['id']==fact['id'])['state']=='validated'
    output=source(db,day,end)
    (ROOT/'__tests__/fixtures'/('m07-source-'+('fresh' if db==DBS[0] else 'upgrade')+'.json')).write_text(json.dumps(output,indent=2)+'\n')
    print('PASS',db,'as-of scale/share states; original captured scale correction; applied period log/manual credit; no extra manual effort; contribution history')
    # Synthetic terminal observations verify completion captures; M05 separately owns real Done gates.
    sql(db,f"UPDATE public.tasks SET status='Done',completed_date='{day}',progress_percentage=100 WHERE id='{task}';")
    t=next(t for t in source(db,day,end)['tasks'] if t['id']==task);assert t['completionShares'][user4]==500000 and t['completionShares'][user8]==500000
    sql(db,f"UPDATE public.task_assignees SET share_units=CASE WHEN user_id='{user4}' THEN 700000 ELSE 300000 END WHERE task_id='{task}';")
    t=next(t for t in source(db,day,end)['tasks'] if t['id']==task);assert t['shares'][user4]==700000 and t['completionShares'][user4]==500000
    # Worker-only leases, safe failure codes, stale rejection and immutable run state.
    leased=json.loads(next(x for x in actor(db,'','SELECT public.claim_performance_jobs(1);',role='service_role') if x.startswith('[')))[0]
    ctx={'ruleVersion':'m07-ten-factor-v1','periodStart':day,'periodEndExclusive':end,'asOf':value(db,'clock_timestamp()'),'sourceWatermark':source(db,day,end)['sourceWatermark']}
    result={'context':ctx,'status':'incomplete','members':[],'reasons':['sales_field_mapping_missing']}
    def finish(payload,lease=None,error=None,success=True):
        q='SELECT public.finish_performance_job('+','.join([literal(leased['id']),literal(lease or leased['lease_token']),'NULL' if payload is None else literal(json.dumps(payload))+'::jsonb','NULL' if error is None else literal(error)])+');'
        return actor(db,'',q,success,role='service_role')
    finish(result,lease=str(uuid4()),success=False)
    finish({'context':ctx|{'sourceWatermark':'stale'},'status':'incomplete','members':[]},success=False)
    finish(result);finish(result);assert value(db,f"count(*) FROM taskpulse_private.performance_runs WHERE job_id='{leased['id']}'")=='1'
    assert value(db,f"count(*) FROM taskpulse_private.audit_events WHERE command='finish_performance_job' AND row_id='{leased['id']}'")=='1'
    finish(result|{'reasons':['different']},success=False)
    assert value(db,f"status FROM taskpulse_private.outbox_jobs WHERE id='{leased['id']}'")=='blocked'
    assert value(db,f"last_error_code FROM taskpulse_private.outbox_jobs WHERE id='{leased['id']}'")=='required_inputs_unavailable'
    sql(db,'DELETE FROM taskpulse_private.performance_runs;',success=False)
    sql(db,'DELETE FROM taskpulse_private.performance_observations;',success=False)
    # Every new input observation and its job must roll back with the source write.
    counts="jsonb_build_object('obs',(SELECT count(*) FROM taskpulse_private.performance_observations),'credit',(SELECT sum(scaled_credit) FROM taskpulse_private.task_credit_balances),'manual',(SELECT count(*) FROM taskpulse_private.manual_credit_inputs),'jobs',(SELECT count(*) FROM taskpulse_private.outbox_jobs),'audit',(SELECT count(*) FROM taskpulse_private.audit_events),'receipts',(SELECT count(*) FROM taskpulse_private.command_receipts))"
    before=value(db,counts)
    sql(db,"CREATE FUNCTION public.m07_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected performance invalidation failure' USING ERRCODE='23514'; END $$;CREATE TRIGGER m07_fail BEFORE INSERT ON taskpulse_private.outbox_jobs FOR EACH ROW EXECUTE FUNCTION public.m07_fail();")
    record(db,'fact',{'business_date':day,'content':'Must roll back'},success=False)
    assert before==value(db,counts)
    sql(db,'DROP TRIGGER m07_fail ON taskpulse_private.outbox_jobs;DROP FUNCTION public.m07_fail();')
    print('PASS',db,'completion-time shares retained; service-only leases/stale/partial status; source observation/outbox rollback; immutable history/runs')
    # Existing legacy archives retain values and cannot be overwritten by an ordinary director write.
    check(db,'director cannot rewrite frozen monthly legacy snapshot',"UPDATE public.monthly_performance_snapshots SET productivity_score=999 WHERE user_id='00000000-0000-0000-0000-000000000005'",uid='1',success=False)
    check(db,'director cannot rewrite final legacy report',"UPDATE public.report_snapshots SET payload='{}' WHERE status='Final'",uid='1',success=False)
print('PASS M07 independent PostgreSQL checks through21')

