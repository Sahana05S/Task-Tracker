"""M15.1 tenancy foundation: two-company disposable PostgreSQL checks. JWT shim only; no hosted connection."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_m15_fresh_test','taskpulse_m15_upgrade_test')
T1='10000000-0000-0000-0000-000000000001'
A_DIR,A4,A5='00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000005'
B_DIR,B4='00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4'
BT='20000000-0000-0000-0000-0000000000b1'

def first_json(rows):return json.loads(next(x for x in rows if x.startswith('{')))
def as_user(db,uid,statement,success=True):return actor(db,uid,statement,success)
def scalar(db,uid,query):
    rows=[r for r in as_user(db,uid,f"SELECT 'v:'||coalesce(({query})::text,'NULL')") if r.startswith('v:')]
    return rows[-1][2:]
def expect_code(db,statement,code):
    r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],
                     input=statement,text=True,capture_output=True,encoding='utf-8')
    assert r.returncode and code in r.stderr,(code,r.stderr[:300])
def migrate(db,upto):
    for m in sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0])):
        if int(m.name.split('_')[0])>upto:break
        sql(db,m.read_text(encoding='utf-8'))
def tables(db):
    return value(db,"string_agg(table_name,' ' ORDER BY table_name) FROM taskpulse_private.m15_tenant_tables").split()

for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    if db==DBS[1]:
        migrate(db,38); sql(db,seed)
        # Real activity before the upgrade: a checklist item, a log and a review approval.
        version=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{T1}'"))
        as_user(db,A_DIR,f"SELECT public.checklist_command('{T1}','add','{{\"title\":\"Pre-upgrade item\",\"section\":\"activity\",\"node_type\":\"Item\"}}'::jsonb,{version},'{uuid4()}')")
        call(db,'create_task_log',T1,{'log_date':value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date"),'hours_worked':'1.5','requested_delta':'0','notes':'pre-upgrade','raw_links':None,'reason':None})
        sql(db,f"UPDATE public.task_reviewers SET review_approved=true WHERE task_id='{T1}'")
        counts={t:value(db,f"count(*) FROM public.{t}") for t in value(db,"string_agg(tablename,' ') FROM pg_tables WHERE schemaname='public'").split()}
        revisions=value(db,f"work_revision||'/'||lifecycle_version FROM public.tasks WHERE id='{T1}'")
        sql(db,(ROOT/'supabase/migrations/39_organizations_tenancy_foundation.sql').read_text(encoding='utf-8'))
        default=value(db,"id FROM public.organizations WHERE is_default")
        for t in tables(db):
            assert value(db,f"count(*) FROM public.{t}")==counts[t],t
            assert value(db,f"count(*) FROM public.{t} WHERE organization_id IS DISTINCT FROM '{default}'")=='0',t
        assert value(db,f"work_revision||'/'||lifecycle_version FROM public.tasks WHERE id='{T1}'")==revisions,'backfill must not count as work'
        assert value(db,f"bool_and(review_approved) FROM public.task_reviewers WHERE task_id='{T1}'")=='t','backfill must not reset reviews'
        print('PASS',db,'upgrade 38->39 assigns every existing row to company #1 without counting it as work or resetting reviews')
    else:
        migrate(db,39); sql(db,seed)
        print('PASS',db,'fresh install 01-39')
    default=value(db,"id FROM public.organizations WHERE is_default")
    assert value(db,"name FROM public.organizations WHERE is_default")=='Saahithyaa Realtors and Builders'
    assert len(tables(db))==30 and 'task_detail_fields' not in tables(db)
    assert value(db,"has_function_privilege('authenticated','taskpulse_private.m15_organization()','EXECUTE')")=='f'

    # Company B with its own director and member, provisioned from server-set app metadata.
    sql(db,"INSERT INTO public.organizations(name,slug) VALUES('Beta Builders','beta')")
    B=value(db,"id FROM public.organizations WHERE slug='beta'")
    sql(db,f"""INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
      ('{B_DIR}','bdir@beta.test','{{"employee_id":"TEST-1"}}','{{"organization_id":"{B}"}}'),
      ('{B4}','b4@beta.test','{{"employee_id":"TEST-4"}}','{{"organization_id":"{B}"}}')""")
    sql(db,f"UPDATE public.users SET role='managing_director' WHERE id='{B_DIR}'")
    assert value(db,f"string_agg(organization_id::text||':'||is_active,',' ORDER BY id) FROM public.users WHERE id IN ('{B_DIR}','{B4}')")==f"{B}:true,{B}:true"
    print('PASS',db,'company B members join B from app metadata; employee IDs repeat across companies')

    # Provisioning safety: user metadata cannot pick a company; unknown companies leave the account inactive.
    sql(db,f"""INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
      ('00000000-0000-0000-0000-0000000000c1','spoof@x.test','{{"organization_id":"{B}"}}','{{}}'),
      ('00000000-0000-0000-0000-0000000000c2','lost@x.test','{{}}','{{"organization_id":"{uuid4()}"}}')""")
    assert value(db,"organization_id FROM public.users WHERE id='00000000-0000-0000-0000-0000000000c1'")==default
    assert value(db,"coalesce(organization_id::text,'none')||':'||is_active FROM public.users WHERE id='00000000-0000-0000-0000-0000000000c2'")=='none:false'
    assert scalar(db,'00000000-0000-0000-0000-0000000000c2',"SELECT count(*) FROM public.users")=='1','an account without a company sees only itself'
    assert scalar(db,'00000000-0000-0000-0000-0000000000c2',"SELECT count(*) FROM public.tasks")=='0'
    sql(db,"UPDATE public.users SET is_active=true WHERE id='00000000-0000-0000-0000-0000000000c2'",success=False)
    print('PASS',db,'user-set metadata cannot choose a company; an unknown company leaves the account inactive and isolated')

    # Company B data: a task with the same tag as company A's T1, through the normal triggers.
    sql(db,f"INSERT INTO public.tasks(id,task_tag,title,assignee_id,task_scale) VALUES('{BT}','T1','Beta task','{B4}',5)")
    assert value(db,f"organization_id FROM public.tasks WHERE id='{BT}'")==B,'company derived from the assignee'
    expect_code(db,f"INSERT INTO public.tasks(task_tag,title,assignee_id) VALUES('T1','Duplicate in B','{B4}')",'23505')
    print('PASS',db,'task tags are unique per company; the company is derived from the parent references')

    # Reads: each company sees only itself, across every company-owned table.
    for uid,org in ((A_DIR,default),(B_DIR,B),(A4,default),(B4,B)):
        for t in tables(db):
            assert scalar(db,uid,f"SELECT count(*) FROM public.{t} WHERE organization_id<>'{org}'")=='0',(uid,t)
        assert scalar(db,uid,"SELECT count(*) FROM public.organizations")=='1'
        assert scalar(db,uid,"SELECT id FROM public.organizations")==org
    assert scalar(db,B_DIR,"SELECT count(*) FROM public.tasks")=='1' and scalar(db,B_DIR,f"SELECT count(*) FROM public.users")=='2'
    assert scalar(db,A_DIR,f"SELECT count(*) FROM public.tasks WHERE id='{BT}'")=='0'
    assert scalar(db,B_DIR,f"SELECT public.can_read_employee_details('{A4}')")=='false'
    assert scalar(db,B_DIR,f"SELECT public.can_read_employee_details('{B4}')")=='true'
    assert scalar(db,A_DIR,f"SELECT public.can_read_employee_details('{B4}')")=='false'
    actor(db,'',"SELECT count(*) FROM public.organizations",False,role='anon')
    print('PASS',db,'every company-owned table, the company list and employee-detail checks are limited to the caller\'s company')

    # Writes: cross-company links and writes are refused, even inside SECURITY DEFINER commands.
    sql(db,f"INSERT INTO public.task_assignees(task_id,user_id) VALUES('{BT}','{A4}')",success=False)
    sql(db,f"INSERT INTO public.task_dependencies(predecessor_task_id,successor_task_id,relation_type) VALUES('{T1}','{BT}','Related')",success=False)
    as_user(db,B_DIR,f"INSERT INTO public.task_dependencies(predecessor_task_id,successor_task_id,relation_type) VALUES('{BT}','{T1}','Related')",False)
    version=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{T1}'"))
    as_user(db,B_DIR,f"SELECT public.checklist_command('{T1}','add','{{\"title\":\"Intruder\",\"section\":\"activity\",\"node_type\":\"Item\"}}'::jsonb,{version},'{uuid4()}')",False)
    before=value(db,f"title FROM public.tasks WHERE id='{T1}'")
    as_user(db,B_DIR,f"UPDATE public.tasks SET title='Hijacked' WHERE id='{T1}'",False)
    as_user(db,B_DIR,f"DELETE FROM public.tasks WHERE id='{T1}'",False)
    assert value(db,f"title FROM public.tasks WHERE id='{T1}'")==before,'RLS hides the other company\'s task from direct writes'
    as_user(db,B_DIR,f"UPDATE public.users SET organization_id='{B}' WHERE id='{B4}'")
    as_user(db,B_DIR,f"UPDATE public.users SET organization_id='{default}' WHERE id='{B4}'",False)
    print('PASS',db,'cross-company links, commands, direct writes and company moves are refused')

    # Work inside each company still runs through the normal commands.
    log=call(db,'create_task_log',BT,{'log_date':value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date"),'hours_worked':'2','requested_delta':'0','notes':'beta work','raw_links':None,'reason':None},uid='b4')
    assert value(db,f"organization_id FROM public.daily_task_logs WHERE id='{log['logId']}'")==B
    version=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{T1}'"))
    node=first_json(as_user(db,A4,f"SELECT public.checklist_command('{T1}','add','{{\"title\":\"A work\",\"section\":\"activity\",\"node_type\":\"Item\"}}'::jsonb,{version},'{uuid4()}')"))['nodeId']
    assert value(db,f"organization_id FROM public.checklist_nodes WHERE id='{node}'")==default
    print('PASS',db,'each company\'s commands still work and stamp their own company')

    # A suspended company is locked out.
    sql(db,f"UPDATE public.organizations SET status='suspended' WHERE id='{B}'")
    assert scalar(db,B_DIR,"SELECT public.get_user_role()")=='NULL'
    assert scalar(db,B_DIR,"SELECT count(*) FROM public.tasks")=='0'
    call(db,'create_task_log',BT,{'log_date':value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date"),'hours_worked':'1','requested_delta':'0','notes':'suspended','raw_links':None,'reason':None},uid='b4',success=False)
    sql(db,f"UPDATE public.organizations SET status='active' WHERE id='{B}'")
    print('PASS',db,'a suspended company sees nothing and its commands are refused')
print('ALL M15.1 DATABASE CHECKS PASSED')
