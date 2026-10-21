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
DBS = ('taskpulse_m05_fresh_test', 'taskpulse_m05_upgrade_test')

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


def checklist(db,tid,cmd,payload,uid='2',success=True,version=None,key=None):
    if version is None:version=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{tid}'"))
    query='SELECT public.checklist_command('+','.join([literal(tid),literal(cmd),literal(json.dumps(payload))+'::jsonb',str(version),literal(key or uuid4())])+');'
    lines=actor(db,'00000000-0000-0000-0000-'+uid.zfill(12),query,success)
    if success:return json.loads(next(x for x in lines if x.startswith('{')))

def create(db,tag,reviewer=False,scale=10,assignee='4',auto=True,template=None):
    fields={'task_tag':tag,'title':'Independent '+tag,'category':'T','priority':'Medium','task_scale':scale,'due_date':None,'initialize_details':auto,'template_version_id':template}
    query='SELECT public.save_task_with_participants(NULL,'+literal(json.dumps(fields))+"::jsonb,ARRAY["+literal('00000000-0000-0000-0000-'+assignee.zfill(12))+"]::uuid[],"+('ARRAY['+U6+']::uuid[]' if reviewer else 'ARRAY[]::uuid[]')+",NULL,NULL,false,"+literal(uuid4())+");"
    return next(x for x in reversed(actor(db,'00000000-0000-0000-0000-000000000002',query)) if re.fullmatch(r'[0-9a-f-]{36}',x))

def add(db,tid,title,state='No',parent=None,section='activity',linked=None,kind='Item'):
    result=checklist(db,tid,'add',{'title':title,'section':section,'parent_id':parent,'node_type':kind,'linked_task_id':linked})
    node=result['nodeId']
    if state!='No':checklist(db,tid,'state',{'node_id':node,'state':state},uid='4')
    return node

def empty(db,tid,roles=('setup','activity','closure')):
    for role in roles:checklist(db,tid,'section',{'section':role,'intentional_empty':True,'reason':'Reviewed omission in independent fixture'})

def rollup(db,tid):return json.loads(value(db,f"taskpulse_private.checklist_rollup('{tid}')"))
def enable(db,tid):return checklist(db,tid,'mode',{'enabled':True,'reason':'Reviewed prospective Activity ownership','preview_progress':rollup(db,tid)['taskProgressDecimal']})

def publish(db,tid=None,version=0,instruction='Describe the target',uid='2',success=True,key=None):
    payload={'instructions':{'smart_specific':instruction},'checklist_nodes':[{'key':'prep','section':'setup','node_type':'Item','title':'Prepare inputs'},{'key':'work','section':'activity','node_type':'Group','title':'Work'},{'key':'check','parent_key':'work','section':'activity','node_type':'Item','title':'Check work'},{'key':'close','section':'closure','node_type':'Item','title':'Deliver'}]}
    query='SELECT public.publish_task_detail_template('+','.join(['NULL' if tid is None else literal(tid),literal('Independent fixture template'),literal(json.dumps(payload))+'::jsonb',str(version),literal(key or uuid4())])+');'
    lines=actor(db,'00000000-0000-0000-0000-'+uid.zfill(12),query,success)
    if success:return json.loads(next(x for x in lines if x.startswith('{')))

for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);');sql('postgres',f'CREATE DATABASE {db};');sql(db,bootstrap)
    for migration in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        if int(migration.name.split('_')[0])>18:break
        if db==DBS[1] and migration.name.startswith('18_'):
            sql(db,seed)
            sql(db,"UPDATE public.checklist_nodes SET is_complete=true WHERE id='30000000-0000-0000-0000-000000000001';")
            originals=value(db,"jsonb_agg(jsonb_build_array(id,checklist_id,parent_node_id,linked_task_id,title,is_complete) ORDER BY id) FROM public.checklist_nodes")
            balances=value(db,"coalesce(jsonb_agg(to_jsonb(b)),'[]') FROM taskpulse_private.task_credit_balances b")
            template_versions=value(db,"jsonb_agg(to_jsonb(v) ORDER BY id) FROM public.task_detail_template_versions v")
            snapshots=value(db,"jsonb_agg(to_jsonb(s)) FROM public.monthly_performance_snapshots s")
        sql(db,migration.read_text(encoding='utf-8'))
    if db==DBS[0]:sql(db,seed)
    else:
        assert originals==value(db,"jsonb_agg(jsonb_build_array(id,checklist_id,parent_node_id,linked_task_id,title,is_complete) ORDER BY id) FROM public.checklist_nodes")
        assert balances==value(db,"coalesce(jsonb_agg(to_jsonb(b)),'[]') FROM taskpulse_private.task_credit_balances b")
        assert template_versions==value(db,"jsonb_agg(to_jsonb(v) ORDER BY id) FROM public.task_detail_template_versions v")
        assert snapshots==value(db,"jsonb_agg(to_jsonb(s)) FROM public.monthly_performance_snapshots s")
        assert value(db,'count(*) FROM public.checklist_nodes WHERE detail_section IS NULL')=='2'
        assert value(db,"completion_state FROM public.checklist_nodes WHERE id='30000000-0000-0000-0000-000000000001'")=='Yes'
    assert rollup(db,task)['taskProgress'] is None
    assert rollup(db,task)['errors']
    print('PASS',db,'fresh/upgrade; two ambiguous legacy nodes retained; credit and snapshots unchanged')
    tid=create(db,'ROLLUP');empty(db,tid,('setup','closure'))
    a=add(db,tid,'Yes','Yes');b=add(db,tid,'No');c=add(db,tid,'Excluded','N/A')
    assert rollup(db,tid)['taskProgress']==50
    checklist(db,tid,'state',{'node_id':b,'state':'N/A'},uid='4');assert rollup(db,tid)['taskProgress']==100
    checklist(db,tid,'state',{'node_id':a,'state':'N/A'},uid='4');r=rollup(db,tid);assert r['taskProgress'] is None and r['isComplete'] and r['sections']['activity']['state']=='not_applicable'
    empty_task=create(db,'EMPTY');assert rollup(db,empty_task)['isComplete'] is False;empty(db,empty_task);assert rollup(db,empty_task)['isComplete'] is True and rollup(db,empty_task)['taskProgress'] is None
    print('PASS',db,'Yes/No/NA=50; denominator transitions; explicit empty and all-NA completion; uninitialized blocked')
    nested=create(db,'NESTED');empty(db,nested,('setup','closure'))
    g1=add(db,nested,'Group 100',kind='Group');g2=add(db,nested,'Group 0',kind='Group')
    for i in range(4):add(db,nested,'Complete '+str(i),'Yes',g1)
    add(db,nested,'Incomplete',parent=g2)
    assert rollup(db,nested)['taskProgress']==50
    distinct=create(db,'SECTIONS');
    add(db,distinct,'Setup no',section='setup');add(db,distinct,'Closure no',section='closure')
    for i in range(5):add(db,distinct,'Activity '+str(i),'Yes' if i<4 else 'No')
    assert rollup(db,distinct)['sections']['setup']['progressPercentage']==0 and rollup(db,distinct)['taskProgress']==80 and rollup(db,distinct)['sections']['closure']['progressPercentage']==0
    assert rollup(db,distinct)['isComplete'] is False
    # Preserve earned balance while switching 40 -> 80; later 80 -> 100 earns two scale units.
    domain(db,'transition',{'status':'In Progress'},tid=distinct);domain(db,'progress',{'progress':40},tid=distinct)
    earned=value(db,f"sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='{distinct}'")
    enable(db,distinct);assert float(value(db,f"progress_percentage FROM public.tasks WHERE id='{distinct}'"))==80
    assert earned==value(db,f"sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='{distinct}'")
    last=value(db,f"n.id FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE c.task_id='{distinct}' AND n.title='Activity 4'")
    checklist(db,distinct,'state',{'node_id':last,'state':'Yes'},uid='4');assert float(value(db,f"sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='{distinct}'"))==6
    assert value(db,f"count(*) FROM public.daily_task_logs WHERE task_id='{distinct}'")=='0'
    day=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    call(db,'create_task_log',distinct,{'log_date':day,'hours_worked':2,'requested_delta':0})
    assert float(value(db,f"task_productivity FROM public.tasks WHERE id='{distinct}'"))==50
    call(db,'create_task_log',distinct,{'log_date':day,'hours_worked':1,'requested_delta':5},success=False)
    domain(db,'progress',{'progress':20},tid=distinct,success=False)
    checklist(db,distinct,'mode',{'enabled':False,'reason':'Manual ownership review','preview_progress':100});assert float(value(db,f"progress_percentage FROM public.tasks WHERE id='{distinct}'"))==100
    assert float(value(db,f"sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='{distinct}'"))==6
    print('PASS',db,'unequal group weighting; section independence; mode-switch no retrocredit; later effective credit; no invented logs; productivity and ownership guards')
    # Shared diamond: A -> B,C -> D; B also depends on E so A must await both parents.
    leaf=create(db,'LEAF');domain(db,'transition',{'status':'In Progress'},tid=leaf)
    parents=[create(db,'P1'),create(db,'P2')];top=create(db,'TOP')
    for parent in parents:
        empty(db,parent,('setup','closure'));add(db,parent,'Shared leaf',linked=leaf,kind='Task');enable(db,parent)
    empty(db,top,('setup','closure'))
    for parent in parents:add(db,top,'Parent',linked=parent,kind='Task')
    enable(db,top)
    domain(db,'progress',{'progress':50},tid=leaf)
    for parent in parents+[top]:assert float(value(db,f"progress_percentage FROM public.tasks WHERE id='{parent}'"))==50
    domain(db,'progress',{'progress':100},tid=leaf)
    for parent in parents+[top]:assert float(value(db,f"progress_percentage FROM public.tasks WHERE id='{parent}'"))==100 and rollup(db,parent)['isComplete'] is False
    assert value(db,f"status FROM public.tasks WHERE id='{leaf}'")=='In Progress'
    checklist(db,leaf,'add',{'title':'Cycle','section':'activity','node_type':'Task','linked_task_id':top},success=False)
    # Different-parent weights create a diamond whose incorrect first-visited order gives stale TOP.
    extra=add(db,parents[1],'No extra')
    domain(db,'progress',{'progress':20},tid=leaf)
    assert float(value(db,f"progress_percentage FROM public.tasks WHERE id='{parents[0]}'"))==20
    assert float(value(db,f"progress_percentage FROM public.tasks WHERE id='{parents[1]}'"))==10
    assert float(value(db,f"progress_percentage FROM public.tasks WHERE id='{top}'"))==15
    print('PASS',db,'shared diamond all parents refreshed in dependency order; no auto-Done; computational cycle rejected')
    # Atomic failure after derived state/credit changes: no partial child/parent writes.
    counts=f"jsonb_build_object('tasks',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.tasks t),'credits',(SELECT jsonb_agg(to_jsonb(b) ORDER BY task_id,user_id) FROM taskpulse_private.task_credit_balances b),'audit',(SELECT count(*) FROM taskpulse_private.audit_events),'receipts',(SELECT count(*) FROM taskpulse_private.command_receipts),'events',(SELECT count(*) FROM taskpulse_private.checklist_credit_events),'cache',(SELECT jsonb_agg(to_jsonb(c) ORDER BY task_id) FROM taskpulse_private.checklist_projections c))"
    before=value(db,counts)
    sql(db,"CREATE FUNCTION public.m05_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected propagation failure' USING ERRCODE='23514'; END $$; CREATE TRIGGER m05_fail BEFORE INSERT ON taskpulse_private.outbox_jobs FOR EACH ROW EXECUTE FUNCTION public.m05_fail();")
    domain(db,'progress',{'progress':30},tid=leaf,success=False);assert value(db,counts)==before
    sql(db,'DROP TRIGGER m05_fail ON taskpulse_private.outbox_jobs;DROP FUNCTION public.m05_fail();')
    # Same operation retry returns original committed result, not duplicate credit/audit.
    key=str(uuid4());observed=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{tid}'"))
    first=checklist(db,tid,'state',{'node_id':a,'state':'Yes'},uid='4',key=key,version=observed)
    after=value(db,counts);assert checklist(db,tid,'state',{'node_id':a,'state':'Yes'},uid='4',key=key,version=observed)==first and value(db,counts)==after
    checklist(db,tid,'state',{'node_id':a,'state':'No'},uid='4',key=key,version=observed,success=False)
    observed=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{tid}'"))
    def competing(node):
        try:checklist(db,tid,'state',{'node_id':node,'state':'Yes'},uid='4',version=observed);return True
        except AssertionError as err:
            assert any(c in str(err) for c in ('40001','PT409'));return False
    with ThreadPoolExecutor(2) as pool:outcomes=list(pool.map(competing,[b,c]))
    assert sorted(outcomes)==[False,True]
    checklist(db,tid,'state',{'node_id':b if not outcomes[0] else c,'state':'Yes'},uid='4')
    assert rollup(db,tid)['taskProgress']==100
    print('PASS',db,'complete propagation rollback; idempotent receipt replay; concurrent stale-version rejection and successful reload')
    # Authorization and graph boundary, including table owner structural attempts.
    for uid in ('3','4','5','6','7'):
        checklist(db,tid,'add',{'title':'Forbidden','section':'activity','node_type':'Item'},uid=uid,success=False)
    for uid in ('3','5','6','7'):
        checklist(db,tid,'state',{'node_id':a,'state':'No'},uid=uid,success=False)
    check(db,'anonymous RPC denied',f"SELECT public.checklist_command('{tid}','state','{{}}',0,'{uuid4()}')",uid='',role='anon',success=False)
    check(db,'direct completion denied',f"UPDATE public.checklist_nodes SET completion_state='No' WHERE id='{a}'",uid='4',success=False)
    checklist(db,tid,'state',{'node_id':extra,'state':'Yes'},uid='4',success=False)
    sql(db,f"UPDATE public.checklist_nodes SET parent_node_id=id WHERE id='{a}';",success=False)
    sql(db,f"UPDATE public.checklist_nodes SET parent_node_id='{g1}' WHERE id='{a}';",success=False)
    sql(db,f"UPDATE public.checklist_nodes SET detail_section='setup' WHERE id='{g1}';",success=False)
    sql(db,f"UPDATE public.checklist_nodes SET parent_node_id='{g2}' WHERE id='{g1}';")
    sql(db,f"UPDATE public.checklist_nodes SET parent_node_id='{g1}' WHERE id='{g2}';",success=False)
    checklist(db,nested,'edit',{'node_id':g2,'title':'Mapped group','parent_id':None,'linked_task_id':None,'node_type':'Group','section':'setup','reason':'Explicit entire subtree role correction'})
    assert value(db,f"count(*) FROM public.checklist_nodes WHERE parent_node_id='{g2}' AND detail_section<>'setup'")=='0'
    checklist(db,tid,'add',{'title':'Missing','section':'activity','node_type':'Task','linked_task_id':str(uuid4())},success=False)
    print('PASS',db,'active role/relationship/field matrix; cross-task spoofing; self/cross/ancestor/dangling graph rejection')
    finish=create(db,'FINISH',reviewer=True);empty(db,finish,('setup','closure'));done_item=add(db,finish,'Work')
    domain(db,'transition',{'status':'Done'},tid=finish,success=False)
    enable(db,finish);checklist(db,finish,'state',{'node_id':done_item,'state':'Yes'},uid='4')
    domain(db,'transition',{'status':'Done'},tid=finish,success=False)
    domain(db,'review',{'approved':True},uid='6',tid=finish)
    domain(db,'transition',{'status':'Done'},tid=finish)
    assert value(db,f"review_approved AND reviewed_revision=(SELECT work_revision FROM public.tasks WHERE id='{finish}') FROM public.task_reviewers WHERE task_id='{finish}'")=='t'
    assert value(db,f"completed_date IS NOT NULL FROM public.tasks WHERE id='{finish}'")=='t'
    domain(db,'transition',{'status':'In Progress','reason':'Approved reopen'},uid='2',tid=finish)
    assert value(db,f"review_approved FROM public.task_reviewers WHERE task_id='{finish}'")=='f'
    domain(db,'review',{'approved':True},uid='6',tid=finish)
    checklist(db,finish,'state',{'node_id':done_item,'state':'No'},uid='4')
    assert value(db,f"review_approved FROM public.task_reviewers WHERE task_id='{finish}'")=='f'
    print('PASS',db,'Done section/current-review gates; completion dates; Done preserves approvals; reopen and work invalidate approvals')
    # Manager mapping preserves original node identity/content; no title-based guess.
    original_node='30000000-0000-0000-0000-000000000001'
    before_title=value(db,f"title FROM public.checklist_nodes WHERE id='{original_node}'")
    checklist(db,task,'map',{'node_id':original_node,'section':'activity','reason':'Explicit manager interpretation of original work'})
    assert value(db,f"title FROM public.checklist_nodes WHERE id='{original_node}'")==before_title
    assert value(db,f"detail_section FROM public.checklist_nodes WHERE id='{original_node}'")=='activity'
    # Combined checklist + scale/dependency cycles are denied at the DB boundary.
    domain(db,'scale',{'mode':'linked','inputs':{'source_task_id':top,'percentage':50},'reason':'Cycle probe','provenance':'Independent test'},uid='2',tid=leaf,success=False)
    sql(db,f"INSERT INTO public.task_dependencies(predecessor_task_id,successor_task_id,relation_type) VALUES('{top}','{leaf}','Dependency');",success=False)
    # First log still captures newly computed scale; prior captures never reweight.
    ordered=create(db,'ORDER',scale=None)
    domain(db,'transition',{'status':'In Progress'},tid=ordered)
    domain(db,'scale',{'mode':'hours','inputs':{'multiplier':1},'reason':'Confirmed ordering','provenance':'User approved M03 decision'},uid='2',tid=ordered)
    call(db,'create_task_log',ordered,{'log_date':day,'hours_worked':1,'requested_delta':20})
    assert float(value(db,f"sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='{ordered}'"))==2.5
    capture=value(db,f"jsonb_agg(jsonb_build_array(id,credit_scale,scale_version,credit_shares,effective_progress_delta)) FROM public.daily_task_logs WHERE task_id='{ordered}'")
    call(db,'create_task_log',ordered,{'log_date':day,'hours_worked':1,'requested_delta':0})
    assert float(value(db,f"sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='{ordered}'"))==2.5
    assert capture==value(db,f"jsonb_agg(jsonb_build_array(id,credit_scale,scale_version,credit_shares,effective_progress_delta)) FROM public.daily_task_logs WHERE task_id='{ordered}' AND hours_worked=1 AND effective_progress_delta=20")
    # Disposable month freeze on a parent-only employee must roll source changes back.
    frozen=create(db,'FROZEN',assignee='8');empty(db,frozen,('setup','closure'));add(db,frozen,'Leaf',linked=leaf,kind='Task');enable(db,frozen)
    sql(db,"INSERT INTO public.monthly_performance_snapshots(user_id,snapshot_year,snapshot_month) SELECT '00000000-0000-0000-0000-000000000008',extract(year FROM clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::integer,extract(month FROM clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::integer;")
    before=value(db,counts)
    domain(db,'progress',{'progress':30},tid=leaf,success=False);assert before==value(db,counts)
    prior=value(db,f"jsonb_build_array(t.work_revision,t.lifecycle_version,t.metric_version,t.progress_percentage) FROM public.tasks t WHERE t.id='{frozen}'")
    ver=value(db,f"lifecycle_version FROM public.tasks WHERE id='{frozen}'")
    actor(db,'00000000-0000-0000-0000-000000000002',f"SELECT public.task_details_command('{frozen}','initialize','{{}}',{ver},'{uuid4()}');")
    assert prior==value(db,f"jsonb_build_array(t.work_revision,t.lifecycle_version,t.metric_version,t.progress_percentage) FROM public.tasks t WHERE t.id='{frozen}'")
    sql(db,"DELETE FROM public.monthly_performance_snapshots WHERE user_id='00000000-0000-0000-0000-000000000008';")
    # Child content-only changes invalidate approved parent reviews too.
    reviewing=create(db,'REVIEW_PARENT',reviewer=True);empty(db,reviewing,('setup','closure'));add(db,reviewing,'Leaf',linked=leaf,kind='Task');enable(db,reviewing)
    domain(db,'review',{'approved':True},uid='6',tid=reviewing)
    ver=value(db,f"lifecycle_version FROM public.tasks WHERE id='{leaf}'")
    actor(db,'00000000-0000-0000-0000-000000000002',f"SELECT public.task_details_command('{leaf}','save','{{\"smart_specific\":\"Relevant reviewed content change\"}}',{ver},'{uuid4()}');")
    assert value(db,f"review_approved FROM public.task_reviewers WHERE task_id='{reviewing}'")=='f'
    # Shared pure fixtures are evaluated independently in PostgreSQL with fixed expected results.
    for fixture in json.loads((ROOT/'__tests__/fixtures/m05-rollups.json').read_text(encoding='utf-8')):
        if 'expectedError' in fixture or fixture['name'].startswith('Linked'):continue
        fid=create(db,'FX'+str(uuid4())[:8],auto=False)
        checklist(db,fid,'create',{'title':'Independent parity fixture'})
        cid=value(db,f"id FROM public.task_checklists WHERE task_id='{fid}'")
        nodes={n['id']:str(uuid4()) for n in fixture['nodes']}
        for n in fixture['nodes']:
            sql(db,'INSERT INTO public.checklist_nodes(id,checklist_id,parent_node_id,node_type,title,detail_section,completion_state,is_complete) VALUES('+','.join([literal(nodes[n['id']]),literal(cid),'NULL' if not n['parentNodeId'] else literal(nodes[n['parentNodeId']]),literal(n['nodeType']),literal(n['id']),literal(n['section']),literal(n['completionState']),'true' if n['completionState']=='Yes' else 'false'])+');')
        sql(db,f"DELETE FROM public.checklist_sections WHERE checklist_id='{cid}';")
        for section,state in fixture['initialization'].items():sql(db,f"INSERT INTO public.checklist_sections(checklist_id,role,initialized,intentional_empty) VALUES('{cid}','{section}',{str(state['initialized']).lower()},{str(state['intentionalEmpty']).lower()});")
        actual=rollup(db,fid)
        if fixture['expectedProgress'] is None:assert actual['taskProgress'] is None
        else:assert abs(actual['taskProgress']-fixture['expectedProgress'])<1e-12
        if 'expectedComplete' in fixture:assert actual['isComplete']==fixture['expectedComplete']
        if 'expectedActivityState' in fixture:assert actual['sections']['activity']['state']==fixture['expectedActivityState']
        if fixture['name']=='Retain intermediate thirds':
            enable(db,fid)
            assert abs(float(value(db,f"progress_percentage FROM public.tasks WHERE id='{fid}'"))-100/3)<1e-12
    # Native templates retain distinct roles, blank completion and manual defaults.
    published=publish(db); template=published['templateVersionId']
    automatic=create(db,'TEMPLATE_AUTO',template=template)
    manual=create(db,'TEMPLATE_MANUAL',auto=False,template=template)
    ver=value(db,f"lifecycle_version FROM public.tasks WHERE id='{manual}'")
    actor(db,'00000000-0000-0000-0000-000000000002',f"SELECT public.task_details_command('{manual}','initialize','{{}}',{ver},'{uuid4()}');")
    for entry in (automatic,manual):
        r=rollup(db,entry)
        assert all(r['sections'][role]['state']=='partial' for role in ('setup','activity','closure'))
        assert r['taskProgress']==0 and not r['isComplete']
        assert value(db,f"sync_progress_to_task FROM public.task_checklists WHERE task_id='{entry}'")=='f'
        assert value(db,f"count(*) FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE c.task_id='{entry}' AND n.completion_state<>'No'")=='0'
    assert value(db,f"jsonb_agg(jsonb_build_array(n.title,n.detail_section,n.node_type) ORDER BY n.title) FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE c.task_id='{automatic}'")==value(db,f"jsonb_agg(jsonb_build_array(n.title,n.detail_section,n.node_type) ORDER BY n.title) FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE c.task_id='{manual}'")
    print('PASS',db,'explicit legacy mapping; combined cycles; original scale captures; frozen-parent rollback; content-only review invalidation; SQL/TypeScript shared fixtures; both native template paths')
print('PASS M05 disposable PostgreSQL integration checks')
