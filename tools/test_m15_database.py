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
    assert r.returncode and (code in r.stderr or (code=='40001' and 'PT409' in r.stderr)),(code,r.stderr[:300])
def refused(db,uid,statement):
    """A refusal as the given user: permission, contract or (after 40) not visible at all."""
    r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],
        input=f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{uid}',true);\n{statement.rstrip(';')};\nCOMMIT;",
        text=True,capture_output=True,encoding='utf-8')
    assert r.returncode and any(c in r.stderr for c in ('42501','23514','P0002','40001','PT409','23503')),(statement[:120],r.stderr[:300])
def migrate(db,upto):
    for m in sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0])):
        if int(m.name.split('_')[0])>upto:break
        sql(db,m.read_text(encoding='utf-8'))
def tables(db):
    # Public company-owned tables; the column exists from migration 40 onward.
    has_schema=value(db,"count(*) FROM information_schema.columns WHERE table_schema='taskpulse_private' AND table_name='m15_tenant_tables' AND column_name='table_schema'")=='1'
    where=" WHERE table_schema='public'" if has_schema else ''
    return value(db,f"string_agg(table_name,' ' ORDER BY table_name) FROM taskpulse_private.m15_tenant_tables{where}").split()

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
        sql(db,(ROOT/'supabase/migrations/40_company_scoped_commands.sql').read_text(encoding='utf-8'))
        print('PASS',db,'upgrade 39->40 applies (company-scoped commands)')
    else:
        migrate(db,40); sql(db,seed)
        print('PASS',db,'fresh install 01-40')
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
    refused(db,B_DIR,f"SELECT public.checklist_command('{T1}','add','{{\"title\":\"Intruder\",\"section\":\"activity\",\"node_type\":\"Item\"}}'::jsonb,{version},'{uuid4()}')")
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

    # ---------------- M15.2: reads inside commands and workers ----------------
    A_IDS=[f'00000000-0000-0000-0000-00000000000{i}' for i in range(1,9)]+[T1,'10000000-0000-0000-0000-000000000002',
           '20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002']
    B_IDS=[B_DIR,B4,BT]
    today=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    month=today[:8]+'01'
    nxt=value(db,f"('{month}'::date+interval '1 month')::date")
    asof="clock_timestamp()-interval '5 seconds'"
    READS=[f"public.award_read_model('{month}','{nxt}')",f"public.checklist_rollups(ARRAY['{T1}','{BT}']::uuid[])",
           f"public.contribution_input_context('{month}','{nxt}',{asof})",f"public.live_presentation_context('{month}','{nxt}',{asof})",
           f"public.month_archive_history('{month}')",f"public.month_archive_read('{month}')",'public.participant_reconciliation()',
           f"public.performance_source_context('{month}','{nxt}',{asof})",'public.task_credit_summary()',
           f"public.task_effort_breakdown('{T1}')",f"public.team_summary_inputs({today[:4]},{int(today[5:7])})",
           f"public.team_holiday_dates('{month}','{today}')",f"(SELECT jsonb_agg(x) FROM public.task_effort_summary('{T1}') x)",
           f"public.attendance_input_context('{A4}','{month}','{nxt}',{asof})",'public.drive_read_model()']
    def leaks(uid,expr,foreign):
        r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-At'],
            input=f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{uid}',true);\nSELECT ({expr})::text;\nCOMMIT;",
            text=True,capture_output=True,encoding='utf-8')
        if r.returncode:
            assert any(c in r.stderr for c in ('42501','23514','P0002','40001','PT409')),(expr,r.stderr[:300]); return []
        return [i for i in foreign if i in r.stdout]
    for uid,foreign in ((B_DIR,A_IDS),(B4,A_IDS),(A_DIR,B_IDS),(A4,B_IDS)):
        for expr in READS:
            assert not leaks(uid,expr,foreign),(uid,expr,leaks(uid,expr,foreign))
    assert first_json(as_user(db,B_DIR,f"SELECT public.task_effort_breakdown('{T1}')"))['by_node']=={}
    print('PASS',db,'every read command returns only the caller\'s company (15 reads, both roles, both companies)')

    def as_service(expr,org=None,claims_role='service_role'):
        headers=json.dumps({'x-taskpulse-organization':org}) if org else '{}'
        r=sql(db,f"BEGIN; SET LOCAL ROLE service_role; SELECT set_config('request.jwt.claims','{{\"role\":\"{claims_role}\"}}',true);"
                 f" SELECT set_config('request.headers',{literal(headers)},true);\nSELECT ({expr})::text;\nCOMMIT;")
        return r
    psc=f"public.performance_source_context('{month}','{nxt}',{asof})"
    scoped_b=as_service(psc,B); unscoped=as_service(psc)
    assert B4 in scoped_b and not any(i in scoped_b for i in A_IDS[:8]),'worker header scopes to company B'
    assert B4 in unscoped and A4 in unscoped,'an unscoped system read sees every company'
    ignored=sql(db,f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{A_DIR}',true);"
                   f" SELECT set_config('request.headers',{literal(json.dumps({'x-taskpulse-organization':B}))},true);\nSELECT ({psc})::text;\nCOMMIT;")
    assert A4 in ignored and B4 not in ignored,'a signed-in caller cannot pick another company with the header'
    print('PASS',db,'workers are scoped by the company header; unscoped system reads see all; signed-in callers cannot use the header')

    queued=json.loads(next(x for x in as_service(f"public.queue_due_awards('{month}','{today}','{uuid4()}')").splitlines() if x.startswith('{"companies"')))
    assert sorted(c['organizationId'] for c in queued['companies'])==sorted([default,B]),queued
    slots=value(db,f"count(DISTINCT organization_id) FROM taskpulse_private.award_slots WHERE business_date BETWEEN '{month}' AND '{today}'")
    assert slots in ('0','2'),slots
    if slots=='2':
        assert value(db,f"count(*) FROM (SELECT business_date FROM taskpulse_private.award_slots GROUP BY business_date HAVING count(*)=2) x")!='0','the same date has a slot per company'
    per_company=sql(db,f"""BEGIN; SET LOCAL ROLE taskpulse_definer;
      SELECT set_config('taskpulse.organization','{default}',true);
      SELECT taskpulse_private.queue_award('2026-10-02',false) IS NOT NULL; SELECT taskpulse_private.queue_award('2026-10-02',false) IS NOT NULL;
      SELECT set_config('taskpulse.organization','{B}',true); SELECT taskpulse_private.queue_award('2026-10-02',false) IS NOT NULL;
      RESET ROLE;
      SELECT 'slots:'||count(*)||'/'||count(DISTINCT organization_id) FROM taskpulse_private.award_slots WHERE business_date='2026-10-02';
      ROLLBACK;""")
    assert 'slots:2/2' in per_company,per_company
    claimed=json.loads(next(x for x in as_service('public.claim_award_jobs(5)').splitlines() if x.startswith('[')))
    assert all('organizationId' in j for j in claimed if isinstance(j,dict)),claimed
    print('PASS',db,f'awards queue once per company (slot companies: {slots}); claimed jobs carry their company')

    stamped=value(db,f"string_agg(DISTINCT organization_id::text,',') FROM taskpulse_private.log_revisions WHERE log_id='{log['logId']}'")
    assert stamped==B,stamped
    assert value(db,"count(*) FROM taskpulse_private.earned_credit_events WHERE organization_id IS NULL")=='0'
    print('PASS',db,'private records are stamped with their company from their links')

    assert value(db,"taskpulse_private.m15_secure()")=='0 tables and 0 functions moved to taskpulse_definer'
    sql(db,"CREATE TABLE taskpulse_private.zz_m15_probe(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid);"
           "CREATE FUNCTION public.zz_m15_probe_fn() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path='' AS 'SELECT 1';")
    assert value(db,"taskpulse_private.m15_secure()")=='1 tables and 1 functions moved to taskpulse_definer'
    assert value(db,"relforcerowsecurity::text||pg_get_userbyid(relowner) FROM pg_class WHERE oid='taskpulse_private.zz_m15_probe'::regclass")=='truetaskpulse_definer'
    assert value(db,"count(*) FROM pg_policies WHERE tablename='zz_m15_probe' AND policyname='m15_scope'")=='1'
    sql(db,"DROP FUNCTION public.zz_m15_probe_fn(); DROP TABLE taskpulse_private.zz_m15_probe;")
    bad=value(db,"count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','taskpulse_private') AND p.prosecdef AND pg_get_userbyid(p.proowner)<>'taskpulse_definer' AND p.oid::regprocedure::text NOT IN ('current_organization()','get_user_role()','handle_new_user()','taskpulse_private.m15_organization()','taskpulse_private.m15_scope()','taskpulse_private.m15_unscoped()')")
    assert bad=='0',bad
    assert value(db,"count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','taskpulse_private') AND c.relkind='r' AND (NOT c.relforcerowsecurity OR pg_get_userbyid(c.relowner)<>'taskpulse_definer')")=='0'
    print('PASS',db,'m15_secure is idempotent, secures objects a later migration adds, and leaves no bypass-owned table or command')

    # A suspended company is locked out.
    sql(db,f"UPDATE public.organizations SET status='suspended' WHERE id='{B}'")
    assert scalar(db,B_DIR,"SELECT public.get_user_role()")=='NULL'
    assert scalar(db,B_DIR,"SELECT count(*) FROM public.tasks")=='0'
    call(db,'create_task_log',BT,{'log_date':value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date"),'hours_worked':'1','requested_delta':'0','notes':'suspended','raw_links':None,'reason':None},uid='b4',success=False)
    sql(db,f"UPDATE public.organizations SET status='active' WHERE id='{B}'")
    print('PASS',db,'a suspended company sees nothing and its commands are refused')
print('ALL M15.1-M15.2 DATABASE CHECKS PASSED')
