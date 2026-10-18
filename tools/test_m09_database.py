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
DBS = ('taskpulse_m09_fresh_test', 'taskpulse_m09_upgrade_test')

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



def lifecycle(db,tid,command,payload,uid="1",success=True):
    return domain(db,command,payload,uid=uid,success=success,tid=tid)

def preview(db,command,payload,uid='1',success=True):
    lines=actor(db,'00000000-0000-0000-0000-'+uid.zfill(12),'SELECT public.task_tools_preview('+literal(command)+','+literal(json.dumps(payload))+'::jsonb);',success)
    if success:return json.loads(next(x for x in lines if x.startswith('{')))
def commit(db,p,key=None,uid='1',success=True):
    lines=actor(db,'00000000-0000-0000-0000-'+uid.zfill(12),'SELECT public.task_tools_command('+literal(p['id'])+','+literal(key or uuid4())+');',success)
    if success:return json.loads(next(x for x in lines if x.startswith('{')))
def new_task(db,tag):
    fields={'task_tag':tag,'title':tag,'category':'T','priority':'High','task_scale':10,'description':'source description','initialize_details':True}
    q='SELECT public.save_task_with_participants(NULL,'+literal(json.dumps(fields))+"::jsonb,ARRAY["+U4+"],ARRAY["+U6+"],ARRAY[1000000],NULL,false,"+literal(uuid4())+');'
    tid=[x for x in actor(db,'00000000-0000-0000-0000-000000000001',q) if re.fullmatch(r'[a-f0-9-]{36}',x)][-1]
    lifecycle(db,tid,'scale',{'mode':'manual','inputs':{'value':10},'reason':'independent source','provenance':'synthetic M09 fixture'})
    return tid

def checklist(db,tid,command,payload,uid='1',success=True):
    v=int(value(db,'lifecycle_version FROM public.tasks WHERE id='+literal(tid)))
    q='SELECT public.checklist_command('+literal(tid)+','+literal(command)+','+literal(json.dumps(payload))+'::jsonb,'+str(v)+','+literal(uuid4())+');'
    lines=actor(db,'00000000-0000-0000-0000-'+uid.zfill(12),q,success)
    if success:return json.loads(next(x for x in lines if x.startswith('{')))
def make_done_ready(db,tid):
    for section in ('setup','activity','closure'):checklist(db,tid,'section',{'section':section,'intentional_empty':True,'reason':'Intentionally no work in synthetic fixture'})
    lifecycle(db,tid,'progress',{'progress':100},uid='4')
    lifecycle(db,tid,'review',{'approved':True},uid='6')

DRAFT_POLICY={'id':'m09-draft-fixture-only','unevenMaximum':'whole','copies':'reset_snapshot','phases':'independent_repeats','batch':'atomic','carryover':'remaining_handoff','archive':True,'historicalImport':False}
for db in DBS:
    assert db in ('taskpulse_m09_fresh_test','taskpulse_m09_upgrade_test')
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);');sql('postgres',f'CREATE DATABASE {db};');sql(db,bootstrap)
    for migration in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        if int(migration.name.split('_')[0])>23:break
        sql(db,migration.read_text(encoding='utf-8'))
    if db==DBS[0]:sql(db,(ROOT/'supabase/migrations/24_task_tools_atomic_previews.sql').read_text())
    sql(db,seed)
    frozen=value(db,"(SELECT jsonb_agg(to_jsonb(s)) FROM public.monthly_performance_snapshots s)")
    if db==DBS[1]:sql(db,(ROOT/'supabase/migrations/24_task_tools_atomic_previews.sql').read_text())
    tid=new_task(db,'M09-SOURCE')
    base={'sourceTaskId':tid,'supportKind':'effort','splitMode':'split-even','assigneeId':U4.strip("'"),'reason':'Separate effort'}
    p=preview(db,'support',base);assert not p['ready'] and 'task_tool_policy_unapproved' in p['reasons'];commit(db,p,success=False)
    for uid in ('3','4','7'):preview(db,'support',base,uid,False)
    check(db,'anonymous command denied',"SELECT public.task_tools_preview('refresh','{}')",uid='',success=False,role='anon')
    p=preview(db,'refresh',{'taskIds':[tid]},uid='4');assert p['ready'];before=value(db,"(SELECT jsonb_build_array(assigned_date,due_date,progress_percentage) FROM public.tasks WHERE id="+literal(tid)+')');r=commit(db,p,uid='4');assert r['items'][0]['status']=='shared_recomputation_queued';assert before==value(db,"(SELECT jsonb_build_array(assigned_date,due_date,progress_percentage) FROM public.tasks WHERE id="+literal(tid)+')')
    preview(db,'refresh',{'taskIds':[tid]},uid='5',success=False)
    p=preview(db,'bulk_done',{'taskIds':[tid]});commit(db,p,success=False)
    p=preview(db,'section',{'taskIds':[tid],'section':'setup','intentionalEmpty':True,'reason':'No setup work'});commit(db,p)
    good=new_task(db,'independent-done');make_done_ready(db,good)
    p=preview(db,'bulk_done',{'taskIds':[good]},uid='4');commit(db,p,uid='4')
    p=preview(db,'bulk_reopen',{'taskIds':[good]});commit(db,p,success=False)
    p=preview(db,'bulk_reopen',{'taskIds':[good],'reason':'Additional work'});commit(db,p)
    check(db,'service cannot run user tools',"SELECT public.task_tools_preview('refresh','{}')",uid='',success=False,role='service_role')
    commit(db,preview(db,'refresh',{'taskIds':[tid]}),uid='2',success=False)
    assert not preview(db,'duplicate',{'sourceTaskId':task})['ready'] # existing unmapped checklist needs reconciliation
    # Tests proposed semantics only; no policy is approved or activated by a fixture.
    sql(db,'UPDATE taskpulse_private.tool_policy SET config='+literal(json.dumps(DRAFT_POLICY))+'::jsonb;')
    retained=new_task(db,'retained-earned')
    lifecycle(db,retained,'progress',{'progress':40},uid='4')
    old_credit=value(db,'(SELECT sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='+literal(retained)+')')
    p=preview(db,'support',{**base,'sourceTaskId':retained});commit(db,p)
    assert old_credit==value(db,'(SELECT sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='+literal(retained)+')')
    lifecycle(db,retained,'progress',{'progress':50},uid='4')
    assert float(value(db,'(SELECT sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='+literal(retained)+')'))==4.5
    for kind in ('effort','skill'):
      for mode,amount,expected,after in [('split-even',None,5,5),('split-uneven','7',7,3),('proportional',None,2,10),('absolute','15',15,10)]:
        src=new_task(db,kind+'-'+mode);payload={**base,'sourceTaskId':src,'supportKind':kind,'splitMode':mode,'amount':amount,'percentage':'20'}
        p=preview(db,'support',payload);assert p['ready'],p
        key=str(uuid4());r=commit(db,p,key);assert r==commit(db,p,key)
        child=r['items'][0]['taskId'];assert float(value(db,'(SELECT task_scale FROM public.tasks WHERE id='+literal(src)+')'))==after
        assert float(value(db,'(SELECT task_scale FROM public.tasks WHERE id='+literal(child)+')'))==expected
        assert value(db,'(SELECT category FROM public.tasks WHERE id='+literal(child)+')')==('SD' if kind=='skill' else 'T')
        assert value(db,"(SELECT progress_percentage=0 AND status='Not Started' FROM public.tasks WHERE id="+literal(child)+')')=='t'
        if mode=='proportional':
          lifecycle(db,child,'progress',{'progress':50},uid='4');earned=value(db,'(SELECT sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='+literal(child)+')')
          lifecycle(db,src,'scale',{'mode':'manual','inputs':{'value':20},'reason':'New source scale','provenance':'fixture'})
          assert float(value(db,'(SELECT task_scale FROM public.tasks WHERE id='+literal(child)+')'))==4
          assert earned==value(db,'(SELECT sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='+literal(child)+')')
          lifecycle(db,src,'scale',{'mode':'linked','inputs':{'source_task_id':child,'percentage':100},'reason':'cycle','provenance':'fixture'},success=False)
    shaped=new_task(db,'copy-structure')
    node=checklist(db,shaped,'add',{'title':'Applicable setup','section':'setup','node_type':'Item'})['nodeId']
    checklist(db,shaped,'state',{'node_id':node,'state':'Yes'},uid='4')
    p=preview(db,'section',{'taskIds':[shaped],'section':'setup','intentionalEmpty':True,'reason':'Cannot skip applicable work'});commit(db,p,success=False)
    old=value(db,'(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id) FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE c.task_id='+literal(shaped)+')')
    p=preview(db,'duplicate',{'sourceTaskId':shaped});copied=commit(db,p)['items'][0]['taskId']
    assert old==value(db,'(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id) FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE c.task_id='+literal(shaped)+')')
    assert value(db,"(SELECT bool_and(completion_state='No' AND NOT is_complete) FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE c.task_id="+literal(copied)+')')=='t'
    assert value(db,'(SELECT bool_and(NOT initialized) FROM public.checklist_sections s JOIN public.task_checklists c ON c.id=s.checklist_id WHERE c.task_id='+literal(copied)+')')=='t'
    assert value(db,'(SELECT bool_and(NOT review_approved) FROM public.task_reviewers WHERE task_id='+literal(copied)+')')=='t'
    b1=new_task(db,'bulk-first');b2=new_task(db,'bulk-fails');first,second=sorted([b1,b2]);make_done_ready(db,first)
    p=preview(db,'bulk_done',{'taskIds':[first,second]});commit(db,p,success=False)
    assert value(db,'(SELECT status FROM public.tasks WHERE id='+literal(first)+')')=='Not Started'
    src=new_task(db,'failure');p=preview(db,'support',{**base,'sourceTaskId':src})
    rollback_before=value(db,"jsonb_build_array((SELECT count(*) FROM public.tasks),(SELECT count(*) FROM taskpulse_private.audit_events),(SELECT count(*) FROM taskpulse_private.command_receipts),(SELECT count(*) FROM taskpulse_private.outbox_jobs))")
    sql(db,"CREATE FUNCTION public.m09_forced_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced insertion' USING ERRCODE='23514';END $$;CREATE TRIGGER m09_forced_failure BEFORE INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.m09_forced_failure();")
    commit(db,p,success=False);assert float(value(db,'(SELECT task_scale FROM public.tasks WHERE id='+literal(src)+')'))==10
    assert rollback_before==value(db,"jsonb_build_array((SELECT count(*) FROM public.tasks),(SELECT count(*) FROM taskpulse_private.audit_events),(SELECT count(*) FROM taskpulse_private.command_receipts),(SELECT count(*) FROM taskpulse_private.outbox_jobs))")
    sql(db,'DROP TRIGGER m09_forced_failure ON public.tasks;DROP FUNCTION public.m09_forced_failure();')
    p=preview(db,'duplicate',{'sourceTaskId':tid});lifecycle(db,tid,'progress',{'progress':10},uid='4');commit(db,p,success=False)
    src=new_task(db,'concurrent');p1=preview(db,'support',{**base,'sourceTaskId':src});p2=preview(db,'support',{**base,'sourceTaskId':src})
    q=lambda p:'SELECT public.task_tools_command('+literal(p['id'])+','+literal(uuid4())+');'
    def attempt(p):
      try:actor(db,'00000000-0000-0000-0000-000000000001',q(p));return True
      except AssertionError as e:assert '40001' in str(e);return False
    with ThreadPoolExecutor(max_workers=2) as pool:assert sorted(pool.map(attempt,[p1,p2]))==[False,True]
    assert float(value(db,'(SELECT task_scale FROM public.tasks WHERE id='+literal(src)+')'))==5
    for command,params in [('duplicate',{}),('weekly',{'count':2,'startDate':'2026-11-01'}),('day_count',{'count':2,'phaseDays':3,'startDate':'2026-11-01'}),('all_team',{}),('number_suffix',{'count':3,'suffix':'Phase'})]:
      p=preview(db,command,{'sourceTaskId':tid,**params});assert p['ready'],p;r=commit(db,p);assert len(r['items'])==len(p['items'])
    race_source=new_task(db,'batch-race')
    def batch_preview(_):return preview(db,'number_suffix',{'sourceTaskId':race_source,'count':3,'suffix':'Concurrent'})
    with ThreadPoolExecutor(max_workers=2) as pool:plans=list(pool.map(batch_preview,[1,2]))
    assert len({i['taskTag'] for p in plans for i in p['items']})==6
    with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(attempt,plans))
    assert any(results)
    assert value(db,'(SELECT count(*)=count(DISTINCT task_tag) FROM public.tasks)')=='t'
    assert frozen==value(db,"(SELECT jsonb_agg(to_jsonb(s)) FROM public.monthly_performance_snapshots s)")
    today=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    previous=value(db,"date_trunc('month',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date)-interval '1 month'")[:10]
    carry=new_task(db,'carryover-draft');lifecycle(db,carry,'progress',{'progress':40},uid='4')
    sql(db,'UPDATE public.tasks SET assigned_date='+literal(previous)+' WHERE id='+literal(carry)+';')
    p=preview(db,'carryover',{'sourceTaskId':carry,'startDate':today,'targetMonth':today[:7],'reason':'Remaining work'})
    assert not p['ready'] and float(p['items'][0]['scale'])==6;commit(db,p,success=False)
    assert not preview(db,'archive',{'taskIds':[carry],'reason':'Redundant task'})['ready']
    evidence={'contract':'m09-independent-draft-verification','database':db,'businessPolicyApproved':False,'copyItems':p['items'],'preservedFrozenSnapshot':True,'checks':['fresh_or_upgrade','policy_guard','authorization','single_done_review_gates','single_reopen_reason','all8_draft_splits','rollback_all_writes','idempotency','stale_preview','concurrent_conflict','proportional_future_scale_retained_credit','cycle_denial','draft_batch_tags','draft_reset_structure_reviews','atomic_bulk_failure','carryover_archive_execution_guard']}
    (ROOT/'__tests__/fixtures'/('m09-independent-'+('fresh' if db==DBS[0] else 'upgrade')+'.json')).write_text(json.dumps(evidence,indent=2)+'\n')
    sql(db,'UPDATE taskpulse_private.tool_policy SET config=NULL;')
    print('PASS',db,'fresh/upgrade; policy denial; all8 draft splits; rollback; retry; races; versions; linked credit; cycles; draft batches; history preserved',flush=True)
