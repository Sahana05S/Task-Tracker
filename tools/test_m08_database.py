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
DBS = ('taskpulse_m08_fresh_test', 'taskpulse_m08_upgrade_test')

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

def source(db,start,end,asof=None,uid='00000000-0000-0000-0000-000000000002',role='authenticated'):
    q=f"SELECT public.performance_source_context('{start}','{end}',"+('clock_timestamp()' if asof is None else literal(asof)+'::timestamptz')+');'
    return json.loads(next(x for x in actor(db,uid,q,role=role) if x.startswith('{')))

def award(db,command,payload,key=None,uid='1',worker=False,success=True):
    q='SELECT public.award_command('+literal(command)+','+literal(json.dumps(payload))+'::jsonb,'+literal(key or uuid4())+');'
    lines=actor(db,'' if worker else '00000000-0000-0000-0000-'+uid.zfill(12),q,success,role='service_role' if worker else 'authenticated')
    if success:return json.loads(next(x for x in lines if x.startswith('{')))

def read_awards(db,start,end,uid='1',employee=None,success=True):
    q='SELECT public.award_read_model('+literal(start)+','+literal(end)+','+('NULL' if employee is None else literal(employee))+');'
    lines=actor(db,'00000000-0000-0000-0000-'+uid.zfill(12),q,success)
    if success:return json.loads(next(x for x in lines if x.startswith('{')))

def claim(db):
    return json.loads(next(x for x in actor(db,'','SELECT public.claim_award_jobs(50)',role='service_role') if x.startswith('[')))

for db in DBS:
    assert db in ('taskpulse_m08_fresh_test','taskpulse_m08_upgrade_test')
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);');sql('postgres',f'CREATE DATABASE {db};');sql(db,bootstrap)
    for migration in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        if int(migration.name.split('_')[0])>21:break
        sql(db,migration.read_text(encoding='utf-8'))
    if db==DBS[0]:
        sql(db,(ROOT/'supabase/migrations/22_award_runs_and_atomic_commands.sql').read_text())
        sql(db,(ROOT/'supabase/migrations/23_approved_award_policy.sql').read_text())
        sql(db,'UPDATE taskpulse_private.award_policy SET config=NULL;') # independent22 guard fixture phase
    sql(db,seed)
    day=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date-1");end=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    sql(db,f"INSERT INTO public.daily_star_records(star_date,user_id,score) VALUES('{day}','{user4}',3.25);")
    before=value(db,"jsonb_build_object('legacy',(SELECT jsonb_agg(to_jsonb(r)-ARRAY['calculation_rule_version','certified']) FROM public.daily_star_records r),'frozen',(SELECT jsonb_agg(to_jsonb(r)) FROM public.monthly_performance_snapshots r))")
    if db==DBS[1]:sql(db,(ROOT/'supabase/migrations/22_award_runs_and_atomic_commands.sql').read_text())
    assert before==value(db,"jsonb_build_object('legacy',(SELECT jsonb_agg(to_jsonb(r)-ARRAY['calculation_rule_version','certified']) FROM public.daily_star_records r),'frozen',(SELECT jsonb_agg(to_jsonb(r)) FROM public.monthly_performance_snapshots r))")
    for uid in ('2','3','4','7'):award(db,'request',{'date':day},uid=uid,success=False)
    check(db,'anonymous award writes denied',"SELECT public.award_command('request',jsonb_build_object('date',current_date),gen_random_uuid())",uid='',role='anon',success=False)
    check(db,'ordinary worker claim denied','SELECT public.claim_award_jobs(1)',success=False)
    check(db,'private candidate reads denied','SELECT * FROM taskpulse_private.award_candidates',success=False)
    check(db,'legacy protected writes denied',f"UPDATE public.daily_star_records SET score=99 WHERE star_date='{day}'",uid='1',success=False)
    read_awards(db,day,end,uid='3',employee=user4,success=False)
    key=str(uuid4());request=award(db,'request',{'date':day},key);assert request==award(db,'request',{'date':day},key)
    award(db,'request',{'date':end},key,success=False)
    with ThreadPoolExecutor(2) as pool:
        repeated=list(pool.map(lambda _:award(db,'request',{'date':day},key),range(2)))
    assert all(r==request for r in repeated)
    job=next(j for j in claim(db) if j['date']==day)
    blocked={'status':'blocked','winnerId':None,'reasons':['award_policy_unapproved'],'context':{'businessDate':day,'asOf':value(db,'clock_timestamp()')},'candidates':[]}
    payload={'jobId':job['id'],'leaseToken':job['leaseToken'],'expectedVersion':job['version'],'result':blocked}
    award(db,'commit',payload,uid='1',success=False)
    award(db,'commit',payload|{'leaseToken':str(uuid4())},worker=True,success=False)
    result=award(db,'commit',payload,job['leaseToken'],worker=True)
    assert result==award(db,'commit',payload,job['leaseToken'],worker=True)
    award(db,'commit',payload|{'result':blocked|{'reasons':['different']}},job['leaseToken'],worker=True,success=False)
    assert value(db,'count(*) FROM taskpulse_private.award_runs')=='1'
    assert read_awards(db,day,end)['days'][0]['status']=='blocked'
    assert not read_awards(db,day,end)['days'][0]['certified']
    assert read_awards(db,day,end)['legacy'][0]['ruleVersion']=='legacy-five-factor-before-m07'
    assert not read_awards(db,day,end)['legacy'][0]['certified']
    disabled=json.loads(next(x for x in actor(db,'',f"SELECT public.queue_due_awards('{day}','{day}',gen_random_uuid())",role='service_role') if x.startswith('{')));assert disabled['enabled'] is False
    # Owner-only fixture policy is rolled back/replaced, never shipped as approval.
    policy={'id':'database-fixture-only','window':'one_day','cutoffHour':0,'cutoffMinute':0,'cutoffDayOffset':0,'requirePositiveDayAttendance':True,'exactTie':'no_winner','override':'eligible_complete_replace'}
    sql(db,'UPDATE taskpulse_private.award_policy SET config='+literal(json.dumps(policy))+'::jsonb;')
    sql(db,f"SELECT taskpulse_private.queue_award('{day}',true);")
    job=next(j for j in claim(db) if j['date']==day)
    current=source(db,day,end,role='service_role',uid='');asof=value(db,'clock_timestamp()')
    cutoff=value(db,f"'{day} 00:00:00 Asia/Kolkata'::timestamptz")
    context={'businessDate':day,'awardRuleVersion':'m08-shared-performance-v1','policyId':policy['id'],'periodStart':day,'periodEndExclusive':end,'cutoff':cutoff,'asOf':asof,'sourceWatermark':current['sourceWatermark']}
    candidates=[]
    for m in current['members']:
        if not m['active']:continue
        factors={f:{'available':True,'rawExact':{'numerator':'0','denominator':'1'},'medianExact':{'numerator':'0','denominator':'1'},'deltaExact':{'numerator':'0','denominator':'1'},'contributionExact':{'numerator':'0','denominator':'1'}} for f in ('productivity','criticality','loading','completion','progress','sales','facts','ideas','suggestions','freshness')}
        candidates.append({'userId':m['id'],'gate':{'userId':m['id'],'state':'eligible','reasons':[]},'calculation':{'userId':m['id'],'status':'complete','eligibleForRanking':True,'compositeExact':{'numerator':'0','denominator':'1'},'factors':factors}})
    completed={'status':'completed_winner','winnerId':user4,'context':context,'candidates':candidates,'calculation':{'status':'complete','context':{'ruleVersion':'m07-ten-factor-v1','periodStart':day,'periodEndExclusive':end,'asOf':asof,'sourceWatermark':current['sourceWatermark']}},'reasons':[]}
    payload={'jobId':job['id'],'leaseToken':job['leaseToken'],'expectedVersion':job['version'],'result':completed}
    award(db,'commit',payload,worker=True,success=False) # actual missing sales forbids certification
    award(db,'commit',payload|{'result':completed|{'candidates':candidates[1:],'status':'blocked','winnerId':None}},worker=True,success=False)
    completed['status']='blocked';completed['winnerId']=None;completed['reasons']=['shared_calculation_incomplete','sales_field_mapping_missing']
    awarded=award(db,'commit',payload|{'result':completed},job['leaseToken'],worker=True)
    own=read_awards(db,day,end,uid='4',employee=user4);assert len(own['history'])==1 and own['history'][0]['calculation']['userId']==user4
    assert read_awards(db,day,end,uid='3')['days'][0]['candidates']==[]
    award(db,'override',{'date':day,'runId':awarded['runId'],'expectedVersion':job['version'],'userId':user4,'reason':'No incomplete overrides'},success=False)
    # Source update and its invalidation/job/audit/receipt are one transaction.
    version=value(db,f"version FROM taskpulse_private.award_slots WHERE business_date='{day}'")
    sql(db,f"UPDATE public.users SET full_name='Changed fixture' WHERE id='{user4}';")
    assert int(value(db,f"version FROM taskpulse_private.award_slots WHERE business_date='{day}'"))>int(version)
    assert read_awards(db,day,end)['days'][0]['status']=='stale'
    job=next(j for j in claim(db) if j['date']==day)
    payload={'jobId':job['id'],'leaseToken':job['leaseToken'],'expectedVersion':job['version'],'result':completed}
    sql(db,f"UPDATE public.users SET full_name='Concurrent correction' WHERE id='{user4}';")
    award(db,'commit',payload,worker=True,success=False)
    failed=award(db,'fail',{'jobId':job['id'],'leaseToken':job['leaseToken'],'errorCode':'source_changed'},job['leaseToken'],worker=True)
    assert failed['status']=='failed'
    before=value(db,"jsonb_build_array((SELECT count(*) FROM taskpulse_private.award_runs),(SELECT count(*) FROM taskpulse_private.award_candidates),(SELECT count(*) FROM taskpulse_private.audit_events),(SELECT count(*) FROM taskpulse_private.award_receipts))")
    sql(db,"CREATE FUNCTION public.m08_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected award failure' USING ERRCODE='23514';END $$; CREATE TRIGGER m08_fail BEFORE INSERT ON taskpulse_private.award_runs FOR EACH ROW EXECUTE FUNCTION public.m08_fail();")
    sql(db,"UPDATE taskpulse_private.outbox_jobs SET available_at=clock_timestamp() WHERE kind='award_daily' AND status='failed';")
    job=next(j for j in claim(db) if j['date']==day)
    after_claim=value(db,"jsonb_build_array((SELECT count(*) FROM taskpulse_private.award_runs),(SELECT count(*) FROM taskpulse_private.award_candidates),(SELECT count(*) FROM taskpulse_private.audit_events),(SELECT count(*) FROM taskpulse_private.award_receipts))")
    award(db,'fail',{'jobId':job['id'],'leaseToken':job['leaseToken'],'errorCode':'calculation_failed'},worker=True,success=False)
    assert after_claim==value(db,"jsonb_build_array((SELECT count(*) FROM taskpulse_private.award_runs),(SELECT count(*) FROM taskpulse_private.award_candidates),(SELECT count(*) FROM taskpulse_private.audit_events),(SELECT count(*) FROM taskpulse_private.award_receipts))")
    sql(db,'DROP TRIGGER m08_fail ON taskpulse_private.award_runs;DROP FUNCTION public.m08_fail();')
    # Complete-score persistence/override rehearsal uses an owner-only synthetic
    # sales availability adapter in this disposable database. It is not a mapped
    # business sales formula or native source-conformance certification.
    for uid in ('1','2','3','4','5','6','8'):
        record(db,'attendance',{'business_date':day,'attendance_status':'Present','attendance_hours':'8','off_hours':'0'},uid=uid)
    sql(db,"ALTER FUNCTION taskpulse_private.contribution_inputs(date,date,timestamptz) RENAME TO m08_original_contribution_inputs;")
    sql(db,"""CREATE FUNCTION taskpulse_private.contribution_inputs(p_from date,p_to_exclusive date,p_as_of timestamptz) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
     SELECT jsonb_set(input,'{employeeFactors}',(SELECT jsonb_agg(jsonb_set(f,'{factors,sale,available}','true')) FROM jsonb_array_elements(input->'employeeFactors') f))
     FROM (SELECT taskpulse_private.m08_original_contribution_inputs(p_from,p_to_exclusive,p_as_of) input) q;
    $$;""")
    # Reuse the still-running lease at its latest source version, as a worker would.
    sql(db,"UPDATE taskpulse_private.outbox_jobs SET locked_until=clock_timestamp()-interval '1 second' WHERE kind='award_daily' AND status='running';")
    job=next(j for j in claim(db) if j['date']==day)
    current=source(db,day,end,role='service_role',uid='')
    completed.update(status='completed_winner',winnerId=user4,reasons=[])
    completed['context'].update(asOf=value(db,'clock_timestamp()'),sourceWatermark=current['sourceWatermark'])
    completed['calculation']['context'].update(asOf=completed['context']['asOf'],sourceWatermark=completed['context']['sourceWatermark'])
    for c in candidates:
        if c['userId']==user4:
            c['calculation']['compositeExact']={'numerator':'1','denominator':'1'}
            c['calculation']['factors']['progress'].update(rawExact={'numerator':'80','denominator':'1'},deltaExact={'numerator':'80','denominator':'1'},contributionExact={'numerator':'1','denominator':'1'})
    payload={'jobId':job['id'],'leaseToken':job['leaseToken'],'expectedVersion':job['version'],'result':completed}
    final=award(db,'commit',payload,job['leaseToken'],worker=True)
    assert read_awards(db,day,end)['days'][0]['winnerId']==user4
    ov={'date':day,'runId':final['runId'],'expectedVersion':job['version'],'userId':user5,'reason':'Independent eligible fixture override'}
    award(db,'override',ov,uid='2',success=False)
    override=award(db,'override',ov,key=str(uuid4()))
    model=read_awards(db,day,end);assert model['days'][0]['winnerId']==user5 and model['days'][0]['automaticWinnerId']==user4
    assert model['days'][0]['certified'] and model['days'][0]['override']
    own=read_awards(db,day,end,uid='5',employee=user5);assert own['history'][-1]['calculation']['userId']==user5
    assert own['history'][-1]['certified'] # complete nonwinner history survives override
    sql(db,f"UPDATE public.users SET full_name='After override source correction' WHERE id='{user4}';")
    assert read_awards(db,day,end)['days'][0]['status']=='stale'
    # Never turn a preserved override into a current eligible award silently.
    assert read_awards(db,day,end)['days'][0]['winnerId'] is None
    sql(db,'UPDATE taskpulse_private.award_policy SET schedule_enabled=true;')
    schedule_key=str(uuid4())
    def schedule():
        return actor(db,'',f"SELECT public.queue_due_awards('{day}','{day}','{schedule_key}');",role='service_role')
    schedule();schedule()
    assert value(db,"count(*) FROM taskpulse_private.outbox_jobs WHERE kind='award_daily' AND status IN ('pending','running','failed','blocked')")=='1'
    # SQL sandbox dispatch and replay are real; no OS scheduler/HTTP delivery is claimed.
    sql(db,'DROP FUNCTION taskpulse_private.contribution_inputs(date,date,timestamptz); ALTER FUNCTION taskpulse_private.m08_original_contribution_inputs(date,date,timestamptz) RENAME TO contribution_inputs;')
    for table in ('award_runs','award_candidates','award_receipts'):sql(db,f'DELETE FROM taskpulse_private.{table}',success=False)
    award(db,'request',{'date':'2026-09-15'},success=False)
    # No policy/schedule is left activated in this independent rehearsal.
    sql(db,'UPDATE taskpulse_private.award_policy SET config=NULL,schedule_enabled=false;')
    print('PASS',db,'independent22 guards; preserved legacy; roles/privacy; same-key concurrency; completeness; replay; source conflict; atomic failure; overrides; frozen and immutable guards; sandbox SQL replay')
    sql(db,(ROOT/'supabase/migrations/23_approved_award_policy.sql').read_text())
    active_policy=json.loads(value(db,'config FROM taskpulse_private.award_policy'))
    assert active_policy['id']=='m08-approved-2026-10-13' and active_policy['window']=='month_to_date'
    assert value(db,'schedule_enabled FROM taskpulse_private.award_policy')=='f'
    # Today before its precise end-of-day cutoff waits durably, without certifying
    # partial data. This temporary clock context is a real pre-cutoff observation.
    today=end;tomorrow=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date+1")
    award(db,'request',{'date':today})
    jobs=claim(db);job=next(j for j in jobs if j['date']==today);assert job['isRevision'] is False
    cutoff=value(db,f"('{today} 23:59:59.999 Asia/Kolkata')::timestamptz")
    approved_context={'businessDate':today,'awardRuleVersion':'m08-shared-performance-v1','policyId':active_policy['id'],'periodStart':today[:8]+'01','periodEndExclusive':tomorrow,'cutoff':cutoff,'asOf':value(db,'clock_timestamp()')}
    wait={'status':'blocked','winnerId':None,'reasons':['award_cutoff_not_reached'],'context':approved_context,'candidates':[]}
    award(db,'commit',{'jobId':job['id'],'leaseToken':job['leaseToken'],'expectedVersion':job['version'],'result':wait},job['leaseToken'],worker=True)
    assert value(db,f"status FROM taskpulse_private.outbox_jobs WHERE id='{job['id']}'")=='pending'
    assert value(db,f"available_at='{cutoff}'::timestamptz FROM taskpulse_private.outbox_jobs WHERE id='{job['id']}'")=='t'
    assert read_awards(db,today,tomorrow)['days'][0]['status']=='blocked'
    # Historical initial cutoff vs current revisions: observed membership/sources
    # cannot be substituted. Genuine missing histories/sales remain blocked.
    prior=next((j for j in jobs if j['date']==day),None)
    if prior:
        initial_source=source(db,day[:8]+'01',end,asof=value(db,f"'{day} 23:59:59.999 Asia/Kolkata'::timestamptz"),uid='',role='service_role')
        ctx={'businessDate':day,'awardRuleVersion':'m08-shared-performance-v1','policyId':active_policy['id'],'periodStart':day[:8]+'01','periodEndExclusive':end,'cutoff':value(db,f"'{day} 23:59:59.999 Asia/Kolkata'::timestamptz"),'asOf':value(db,f"'{day} 23:59:59.999 Asia/Kolkata'::timestamptz"),'sourceWatermark':initial_source['sourceWatermark']}
        members=initial_source['members'];rows=[{'userId':m['id'],'calculation':{'userId':m['id'],'status':'incomplete'},'gate':{'userId':m['id'],'state':'unavailable','reasons':['source_history_unavailable']}} for m in members if m['active']]
        blocked={'status':'blocked','winnerId':None,'context':ctx,'candidates':rows,'reasons':['shared_calculation_incomplete'],'calculation':{'status':'incomplete'}}
        award(db,'commit',{'jobId':prior['id'],'leaseToken':prior['leaseToken'],'expectedVersion':prior['version'],'result':blocked},prior['leaseToken'],worker=True)
        assert not read_awards(db,day,end)['days'][0]['certified']
    # Approved-context actual sources are exported for independent TS expectations.
    actual=source(db,day[:8]+'01',end,uid='',role='service_role')
    (ROOT/'__tests__/fixtures'/('m08-approved-source-'+('fresh' if db==DBS[0] else 'upgrade')+'.json')).write_text(json.dumps(actual,indent=2)+'\n')
    # Reaffirmation/closed protection under the upgraded command/read model.
    # Positive complete vectors remain explicit owner-only sales fixtures.
    sql(db,'UPDATE taskpulse_private.award_policy SET config='+literal(json.dumps(policy))+'::jsonb;')
    sql(db,"ALTER FUNCTION taskpulse_private.contribution_inputs(date,date,timestamptz) RENAME TO m08_original_contribution_inputs;")
    sql(db,"""CREATE FUNCTION taskpulse_private.contribution_inputs(p_from date,p_to_exclusive date,p_as_of timestamptz) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
     SELECT jsonb_set(input,'{employeeFactors}',(SELECT jsonb_agg(jsonb_set(f,'{factors,sale,available}','true')) FROM jsonb_array_elements(input->'employeeFactors') f)) FROM (SELECT taskpulse_private.m08_original_contribution_inputs(p_from,p_to_exclusive,p_as_of) input) q;
    $$;""")
    sql(db,f"SELECT taskpulse_private.queue_award('{day}',true);")
    job=next(j for j in claim(db) if j['date']==day);assert job['isRevision'] is True
    current=source(db,day,end,uid='',role='service_role');new_asof=value(db,'clock_timestamp()')
    completed.update(status='completed_winner',winnerId=user4,reasons=[])
    completed['context'].update(policyId=policy['id'],periodStart=day,periodEndExclusive=end,cutoff=value(db,f"'{day} 00:00:00 Asia/Kolkata'::timestamptz"),asOf=new_asof,sourceWatermark=current['sourceWatermark'])
    completed['calculation']['context'].update(periodStart=day,periodEndExclusive=end,asOf=new_asof,sourceWatermark=current['sourceWatermark'])
    fresh=award(db,'commit',{'jobId':job['id'],'leaseToken':job['leaseToken'],'expectedVersion':job['version'],'result':completed},job['leaseToken'],worker=True)
    view=read_awards(db,day,end)['days'][0];assert view['reaffirmationRequired'] and view['winnerId'] is None and not view['certified']
    reaffirm=award(db,'override',{'date':day,'runId':fresh['runId'],'expectedVersion':view['version'],'userId':user5,'reason':'Reaffirm after fresh complete fixture inputs'})
    view=read_awards(db,day,end)['days'][0];assert view['winnerId']==user5 and view['automaticWinnerId']==user4 and view['certified'] and not view['reaffirmationRequired']
    sql(db,'DROP FUNCTION taskpulse_private.contribution_inputs(date,date,timestamptz); ALTER FUNCTION taskpulse_private.m08_original_contribution_inputs(date,date,timestamptz) RENAME TO contribution_inputs;')
    sql(db,'UPDATE taskpulse_private.award_policy SET config='+literal(json.dumps(active_policy))+'::jsonb,schedule_enabled=false;')
    # Simulate an already frozen period, without implementing M12 close commands.
    sql(db,f"INSERT INTO public.monthly_performance_snapshots(user_id,snapshot_year,snapshot_month) VALUES('{user4}',extract(year FROM '{day}'::date)::integer,extract(month FROM '{day}'::date)::integer);")
    frozen=value(db,f"to_jsonb(s) FROM taskpulse_private.award_slots s WHERE business_date='{day}'")
    sql(db,f"UPDATE public.users SET full_name='Frozen-period source change' WHERE id='{user4}';")
    assert frozen==value(db,f"to_jsonb(s) FROM taskpulse_private.award_slots s WHERE business_date='{day}'")
    award(db,'request',{'date':day},success=False)
    award(db,'override',{'date':day,'runId':fresh['runId'],'expectedVersion':reaffirm['version'],'userId':user4,'reason':'Frozen override forbidden'},success=False)
    print('PASS',db,'forward23 approved MTD/precise cutoff; pre-cutoff durable wait; historical source watermark; schedule remains disabled; no certification of missing sales/history')
print('PASS M08 PostgreSQL through23; native JWT/API/delivery unverified')

