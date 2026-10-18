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
DBS = ('taskpulse_m01_fresh_test', 'taskpulse_m01_upgrade_test')

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
               + statement + '\nCOMMIT;', success).splitlines()

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
INSERT INTO public.report_snapshots(employee_id,report_type,title,payload,status) VALUES
 ('00000000-0000-0000-0000-000000000005','Employee','private','{"secret":"private"}','Final');
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

for db in DBS:
    # Names are literal test databases; no caller-controlled destructive target.
    sql('postgres', f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres', f'CREATE DATABASE {db};')
    sql(db, bootstrap)
    migrations = sorted((ROOT / 'supabase/migrations').glob('*.sql'))
    migrations = [m for m in migrations if int(m.name.split('_')[0]) <= 11]
    for migration in migrations:
        if db == DBS[1] and migration.name.startswith('10_'):
            sql(db, seed)
            sql(db, f"INSERT INTO public.task_assignees(task_id,user_id) VALUES ({T1},{U5});")
            before = sql(db, 'SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.tasks t;')
            snapshots_before = sql(db,'SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.monthly_performance_snapshots s;')
            participants_before = sql(db,'SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.task_assignees a;')
        if migration.name.startswith('10_'):
            sql(db,'GRANT UPDATE(task_scale) ON public.tasks TO anon,service_role; GRANT UPDATE(priority) ON public.tasks TO PUBLIC;')
        sql(db, migration.read_text(encoding='utf-8'))
    if db == DBS[0]:
        sql(db, seed)
    else:
        after = sql(db, "SELECT jsonb_agg(to_jsonb(t)-ARRAY['participant_version','participant_credit_mode'] ORDER BY id) FROM public.tasks t;")
        assert json.loads(before) == json.loads(after), 'Upgrade changed legacy task values'
        assert sql(db, 'SELECT count(*) FROM public.task_assignees WHERE share_units IS NOT NULL;') == '0'
        assert json.loads(snapshots_before)==json.loads(sql(db,'SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.monthly_performance_snapshots s;'))
        assert json.loads(participants_before)==json.loads(sql(db,"SELECT jsonb_agg(to_jsonb(a)-'share_units' ORDER BY id) FROM public.task_assignees a;"))
        print('PASS upgrade leaves historical rows/shares unchanged')
        dry_run = actor(db,'00000000-0000-0000-0000-000000000001','SELECT public.participant_reconciliation();')
        artifact = {'source':'Disposable synthetic upgrade fixture, not deployed records',
                    'migration':'10_permissions_and_participant_contract.sql',
                    'rows':json.loads(next(line for line in dry_run if line.startswith('[')))}
        (ROOT/'__tests__/fixtures/m01-synthetic-reconciliation.json').write_text(json.dumps(artifact,indent=2)+'\n',encoding='utf-8')

    for column, value in [('task_scale','90'),('priority',"'Focus'"),('assignee_id',U5),
                          ('task_productivity','99'),('valid_for_metrics','false'),('freshness',"'Rotten'"),
                          ('participant_version','99'),('reviewer_id',U4),('completed_date',"'2026-10-01'"),('met_deadline','true'),('comments',"'forged review'")]:
        check(db,'deny assignee '+column,f'UPDATE public.tasks SET {column}={value} WHERE id={T1};',success=False)
    check(db,'allowed assignee progress',f'UPDATE public.tasks SET progress_percentage=25 WHERE id={T1};')
    check(db,'unsettled completion blocked',f"UPDATE public.tasks SET status='Done' WHERE id={T1};",success=False)
    check(db,'manager scale',f'UPDATE public.tasks SET task_scale=9 WHERE id={T1};',uid='2')
    assert '0' in actor(db,'00000000-0000-0000-0000-000000000003',f'WITH changed AS (UPDATE public.tasks SET task_scale=77 WHERE id={T1} RETURNING id) SELECT count(*) FROM changed;')
    print('PASS data manager structural write filtered')
    check(db,'deny share DML',f'UPDATE public.task_assignees SET share_units=1 WHERE task_id={T1};',uid='1',success=False)
    check(db,'deny role escalation',"UPDATE public.users SET role='managing_director' WHERE id="+U4+';',success=False)
    assert '0' in actor(db,'00000000-0000-0000-0000-000000000007',f'WITH changed AS (UPDATE public.tasks SET title=\'inactive\' WHERE id={T1} RETURNING id) SELECT count(*) FROM changed;')
    check(db,'deny anonymous',f'UPDATE public.tasks SET title=\'x\' WHERE id={T1};',uid='',role='anon',success=False)
    check(db,'deny inactive command',f'SELECT public.recalculate_task_metrics({T1},0);',uid='7',success=False)
    check(db,'assignee checklist completion allowed',"UPDATE public.checklist_nodes SET is_complete=true,completed_by="+U4+" WHERE id='30000000-0000-0000-0000-000000000001';")
    check(db,'manager checklist structure',"INSERT INTO public.checklist_nodes(checklist_id,node_type,title) VALUES('20000000-0000-0000-0000-000000000001','Item','Manager node');",uid='2')
    check(db,'inactive checklist write denied',"INSERT INTO public.checklist_nodes(checklist_id,node_type,title) VALUES('20000000-0000-0000-0000-000000000001','Item','Inactive node');",uid='7',success=False)
    check(db,'manager preserves another worker completion during structural edit',"UPDATE public.checklist_nodes SET title='Manager edited' WHERE id='30000000-0000-0000-0000-000000000001';",uid='2')
    check(db,'deny checklist move',"UPDATE public.checklist_nodes SET checklist_id='20000000-0000-0000-0000-000000000002' WHERE id='30000000-0000-0000-0000-000000000001';",success=False)
    check(db,'deny checklist structure',"UPDATE public.checklist_nodes SET title='x' WHERE id='30000000-0000-0000-0000-000000000001';",success=False)
    check(db,'deny member checklist creation',f"INSERT INTO public.task_checklists(task_id,title) VALUES({T1},'x');",success=False)
    check(db,'deny forged log identity',f'INSERT INTO public.daily_task_logs(task_id,user_id,hours_worked) VALUES({T1},{U5},1);',success=False)
    check(db,'own log allowed',f'INSERT INTO public.daily_task_logs(task_id,user_id,hours_worked,log_date) VALUES({T1},{U4},2,\'2026-10-01\');')
    sql(db,f"INSERT INTO public.task_timers(id,task_id,user_id) VALUES('60000000-0000-0000-0000-000000000001',{T1},{U5});")
    check(db,'forged source timer denied',f"INSERT INTO public.daily_task_logs(task_id,user_id,hours_worked,source_timer_id,log_source) VALUES({T1},{U4},1,'60000000-0000-0000-0000-000000000001','Timer');",success=False)
    check(db,'derived metric command',f'SELECT public.recalculate_task_metrics({T1},0);')
    check(db,'self-validation denied',"UPDATE public.daily_facts SET is_validated=true WHERE id='40000000-0000-0000-0000-000000000001';",uid='3',success=False)
    check(db,'independent validation',"UPDATE public.daily_facts SET is_validated=true WHERE id='40000000-0000-0000-0000-000000000002';",uid='3')
    check(db,'forged validator denied',"UPDATE public.daily_facts SET validated_by="+U5+" WHERE id='40000000-0000-0000-0000-000000000002';",uid='3',success=False)
    assert '0' in actor(db,U4.strip("'"),'SELECT count(*) FROM public.report_snapshots;')
    assert '1' in actor(db,U5.strip("'"),'SELECT count(*) FROM public.report_snapshots;')
    assert '1' in actor(db,'00000000-0000-0000-0000-000000000002','SELECT count(*) FROM public.report_snapshots;')
    print('PASS private report self/manager visibility')
    assert '0' in actor(db,'00000000-0000-0000-0000-000000000002',"WITH changed AS (UPDATE public.report_snapshots SET title='x' RETURNING id) SELECT count(*) FROM changed;")
    assert '0' in actor(db,'00000000-0000-0000-0000-000000000002','WITH deleted AS (DELETE FROM public.report_snapshots RETURNING id) SELECT count(*) FROM deleted;')
    check(db,'engineer cannot override award',f'INSERT INTO public.daily_star_records(user_id,is_override) VALUES({U4},true);',uid='2',success=False)
    if db == DBS[1]:
        result = actor(db,'00000000-0000-0000-0000-000000000001','SELECT public.participant_reconciliation();')
        assert any('legacy' in line for line in result)
        check(db,'legacy conversion requires review',f'SELECT public.set_task_participants({T1},ARRAY[{U4},{U5}],ARRAY[{U6}],NULL,0,false);',uid='1',success=False)
    check(db,'invalid share total',f'SELECT public.set_task_participants({T1},ARRAY[{U4},{U5}],ARRAY[{U6}],ARRAY[1,1],0,true);',uid='1',success=False)
    check(db,'logged redistribution blocked',f'SELECT public.set_task_participants({T1},ARRAY[{U4},{U5}],ARRAY[{U6}],NULL,0,true);',uid='1',success=False)
    # Clear only synthetic work after proving the historical-credit gate.
    sql(db,f'DELETE FROM public.daily_task_logs WHERE task_id={T1};')
    check(db,'equal thirds',f'SELECT public.set_task_participants({T1},ARRAY[{U4},{U5},{U6}],ARRAY[{U6}],NULL,0,true);',uid='1')
    assert sql(db,f'SELECT string_agg(share_units::text,\',\' ORDER BY user_id) FROM public.task_assignees WHERE task_id={T1};') == '333334,333333,333333'
    check(db,'stale participant version',f'SELECT public.set_task_participants({T1},ARRAY[{U4}],ARRAY[{U6}],NULL,0,true);',uid='1',success=False)
    check(db,'assigned review',f'SELECT public.record_task_review({T1},true);',uid='6')
    check(db,'unassigned review denied',f'SELECT public.record_task_review({T1},true);',uid='8',success=False)
    check(db,'reviewer no structural task command',f'SELECT public.set_task_participants({T1},ARRAY[{U6}],ARRAY[]::uuid[],NULL,1,true);',uid='6',success=False)
    assert int(sql(db,'SELECT count(*) FROM taskpulse_private.audit_events;')) > 0
    check(db,'audit tampering denied','DELETE FROM taskpulse_private.audit_events;',uid='1',success=False)
    check(db,'worker command denied to member','SELECT public.decay_task_freshness();',success=False)
    check(db,'worker narrowly allowed','SELECT public.decay_task_freshness();',uid='',role='service_role')
    # Late share failure must roll back task creation, join writes and receipts.
    request = "SELECT public.save_task_with_participants(NULL,'{\"task_tag\":\"atomic\",\"title\":\"Atomic\",\"category\":\"T\",\"priority\":\"Medium\",\"task_scale\":8}',ARRAY["+U4+','+U5+"],ARRAY[]::uuid[],ARRAY[1,1],NULL,false,'50000000-0000-0000-0000-000000000001');"
    check(db,'multi-row failure rollback',request,uid='1',success=False)
    assert sql(db,"SELECT count(*) FROM public.tasks WHERE task_tag='atomic';") == '0'
    request = request.replace('ARRAY[1,1]','ARRAY[400000,600000]')
    check(db,'atomic creation',request,uid='1')
    check(db,'idempotent creation retry',request,uid='1')
    assert sql(db,"SELECT count(*) FROM public.tasks WHERE task_tag='atomic';") == '1'
    check(db,'operation key conflict',request.replace('Atomic','Different'),uid='1',success=False)
    sql(db,f"INSERT INTO public.daily_task_logs(task_id,user_id,hours_worked,log_date,update_notes) VALUES({T1},{U5},3,'2026-10-02','private note');\n"
           + f"INSERT INTO public.attendance_records(user_id,attendance_date,status,attendance_hours,notes) VALUES({U5},'2026-10-02','Present',8,'private attendance');")
    hidden=actor(db,U4.strip("'"),'SELECT count(*) FROM public.daily_task_logs; SELECT count(*) FROM public.attendance_records;')
    assert hidden.count('0')>=2, hidden
    summary=actor(db,U4.strip("'"),'SELECT public.team_summary_inputs(2026,10);')
    parsed=json.loads(next(line for line in summary if line.startswith('{')))
    assert parsed['logs'][0]['hours_worked']==3 and parsed['attendance'][0]['record_count']==1
    assert set(parsed['logs'][0])=={'user_id','task_id','hours_worked','progress_delta'}
    assert parsed['report_summary']=={'total':1,'final':1,'draft':0,'employeeReports':1,'generalReports':0}
    assert 'private note' not in str(parsed) and 'payload' not in str(parsed) and 'check_in_at' not in str(parsed)
    check(db,'inactive summary denied','SELECT public.team_summary_inputs(2026,10);',uid='7',success=False)
    check(db,'anonymous summary denied','SELECT public.team_summary_inputs(2026,10);',uid='',role='anon',success=False)
    assert '3.00' in actor(db,U4.strip("'"),f'SELECT hours_logged FROM public.task_effort_summary({T1});')
    check(db,'private full-denominator metric recalculation',f'SELECT public.recalculate_task_metrics({T1},0);')
    assert sql(db,f'SELECT task_productivity FROM public.tasks WHERE id={T1};')=='0.75'
    check(db,'inactive task summary denied',f'SELECT * FROM public.task_effort_summary({T1});',uid='7',success=False)
    # Reviewer-only assignment changes must preserve configured custom credit.
    review_edit=f"SELECT public.save_task_with_participants({T1},'{{\"task_tag\":\"T1\",\"title\":\"A\",\"category\":\"T\",\"priority\":\"Medium\",\"task_scale\":9}}',ARRAY[{U4},{U5},{U6}],ARRAY[{U6},'00000000-0000-0000-0000-000000000008'],NULL,1,false,'50000000-0000-0000-0000-000000000002');"
    check(db,'reviewer edit preserves logged credit',review_edit,uid='1')
    assert sql(db,f'SELECT string_agg(share_units::text,\',\' ORDER BY user_id) FROM public.task_assignees WHERE task_id={T1};')=='333334,333333,333333'
    # Both clients submit version 2; the parent lock permits exactly one commit.
    concurrent_statement=f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true); SELECT public.set_task_participants({T1},ARRAY[{U4},{U5},{U6}]::uuid[],ARRAY[{U6},'00000000-0000-0000-0000-000000000008']::uuid[],ARRAY[333334,333333,333333],2,false); SELECT pg_sleep(0.3); COMMIT;"
    def concurrent_request(_):
        return subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],input=concurrent_statement,text=True,capture_output=True)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(concurrent_request,range(2)))
    assert sum(result.returncode==0 for result in results)==1
    assert any('40001' in result.stderr for result in results)
    print('PASS two real concurrent participant writers: one commit, one version conflict')
    assert sql(db,"SELECT count(*) FROM pg_proc WHERE pronamespace IN ('public'::regnamespace,'taskpulse_private'::regnamespace) AND prosecdef AND NOT coalesce(proconfig @> ARRAY['search_path=\"\"'],false);")=='0'
    assert sql(db,"SELECT count(*) FROM information_schema.column_privileges WHERE table_schema='public' AND grantee IN ('anon','service_role');")=='0'
    assert sql(db,"SELECT has_column_privilege('anon','public.tasks','priority','UPDATE') OR has_column_privilege('service_role','public.tasks','task_scale','UPDATE');")=='f'
    print('PASS private inputs hidden, approved aggregates available, safe definer paths and grants')
    print('PASS', db, 'fresh/upgrade atomicity and authorization suite')
print('Database suites passed; isolated test databases retained for grant inspection.')
