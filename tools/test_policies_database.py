"""Policies and notifications, migration 56: facts visibility, the policy command (MD-only management,
worker/MD run recording, receipts, PT409 conflicts), evaluation upsert, commendation notifications and
their de-duplication, failure runs, invalidation -> due work, reads and company separation.
Two-company disposable PostgreSQL checks. JWT/header shim only; no hosted connection."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_policies_fresh_test','taskpulse_policies_upgrade_test')
U=lambda n:'00000000-0000-0000-0000-'+str(n).zfill(12)
A_DIR,A2,A3,A4,A5,A6,A8=U(1),U(2),U(3),U(4),U(5),U(6),U(8)
B_DIR,B4='00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4'
T1='10000000-0000-0000-0000-000000000001'
MIGRATION=(ROOT/'supabase/migrations/56_policies_and_notifications.sql').read_text(encoding='utf-8')
TABLES=('policies','policy_revisions','policy_runs','policy_evaluations','policy_period_states','policy_invalidations','policy_receipts','notifications')
FUNCTIONS=('policy_period_facts(date,date,uuid)','policy_due_work(date,integer,uuid)','policy_command(text,jsonb,uuid)','policy_list()',
           'policy_evaluations_read(uuid,text)','policy_runs_read(integer)','policy_commendations(date,date,uuid)',
           'notifications_list(integer)','notifications_unread_count()','notifications_mark_read(uuid[])')

def migrations():
    return sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0]))
def apply(db,skip=()):
    for m in migrations():
        if int(m.name.split('_')[0]) not in skip:sql(db,m.read_text(encoding='utf-8'))

def run(db,who,statement):
    """who: a user id, None for anon, or ('worker', org|None) for the service-role worker."""
    if isinstance(who,tuple):
        headers='{}' if who[1] is None else json.dumps({'x-taskpulse-organization':who[1]})
        prelude=("SET LOCAL ROLE service_role; SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',true);"
                 f"SELECT set_config('request.headers',{literal(headers)},true);")
    elif who is None:prelude="SET LOCAL ROLE anon;"
    else:prelude=f"SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{who}',true);"
    return subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],
        input=f"BEGIN; {prelude}\n{statement.rstrip(';')};\nCOMMIT;",text=True,capture_output=True,encoding='utf-8')
def ok(db,who,statement):
    r=run(db,who,statement)
    assert r.returncode==0,(statement[:200],r.stderr[:600])
    line=[x for x in r.stdout.splitlines() if x and not x.startswith(('BEGIN','COMMIT','SET'))][-1]
    return json.loads(line) if line[:1] in '{[' else line
def refused(db,who,statement,code):
    r=run(db,who,statement)
    assert r.returncode and code in r.stderr,(statement[:200],code,r.stderr[:400])
def j(value):return literal(json.dumps(value))+'::jsonb'
def command(name,payload,op=None):return f"SELECT public.policy_command({literal(name)},{j(payload)},{literal(op or uuid4())}::uuid)"
def facts(frm,to,employee=None):return f"SELECT public.policy_period_facts('{frm}','{to}',{'NULL' if employee is None else literal(employee)+'::uuid'})"
def due(through=None,limit=20,policy=None):
    return f"SELECT public.policy_due_work({'NULL' if through is None else literal(through)},{limit},{'NULL' if policy is None else literal(policy)+'::uuid'})"
def definition(name,template='logged_every_working_day',kind='day',audience=None,points=15,**params):
    return {'name':name,'description':'','templateKey':template,'parameters':params,'periodKind':kind,
            'audience':audience or {'kind':'everyone'},'reward':{'kind':'commendation','badge':'Steady logger','points':points},'ruleVersion':template+'@1'}
def item(entry,evaluations,facts_at=None):
    return {'policyId':entry['policyId'],'policyVersion':entry['policyVersion'],'periodKey':entry['periodKey'],'periodStart':entry['periodStart'],
            'periodEnd':entry['periodEnd'],'final':not entry['open'],'evaluations':evaluations,**({'factsAt':facts_at} if facts_at else {})}
def ev(uid,outcome,code=None):return {'employeeId':uid,'outcome':outcome,'reasons':[{'code':code}] if code else [],'evidence':{'n':1}}
def recording(trigger,items,op=None):return command('record_run',{'trigger':trigger,'items':items},op)
def member(model,uid):return next(m for m in model['members'] if m['userId']==uid)

LATEST=max(int(p.name.split('_')[0]) for p in migrations())
assert LATEST>=57 and any(p.name.startswith('56_') for p in migrations())

for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    if db==DBS[1]:
        apply(db,skip={56}); sql(db,seed)
        current=sorted(int(m.name.split('_')[0]) for m in migrations() if not m.name.startswith('56_'))
        before={t:value(db,f"count(*) FROM {t}") for t in ('public.users','public.tasks','public.attendance_records','taskpulse_private.input_history','taskpulse_private.audit_events')}
        r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],
            input=MIGRATION.replace('SELECT taskpulse_private.m15_secure();','SELECT 1/0;'),text=True,capture_output=True,encoding='utf-8')
        assert r.returncode and 'division by zero' in r.stderr,r.stderr[-300:]
        assert value(db,"count(*) FROM pg_class WHERE relname IN ('policies','policy_evaluations','notifications')")=='0'
        assert value(db,"count(*) FROM pg_proc WHERE proname LIKE 'policy%' OR proname LIKE 'notifications%'")=='0'
        print('PASS',db,'a failed 56 rolls back completely (no tables, no functions)')
        sql(db,MIGRATION)
        for t,n in before.items():assert value(db,f"count(*) FROM {t}")==n,t
        print('PASS',db,f'upgrade {current[0]:02d}-{current[-1]} (without 56) -> 56 adds policies and notifications without touching existing rows')
    else:
        apply(db); sql(db,seed)
        print('PASS',db,f'fresh install 01-{LATEST}')
    assert value(db,"taskpulse_private.m15_secure()")=='0 tables and 0 functions moved to taskpulse_definer'
    for t in TABLES:
        assert value(db,f"pg_get_userbyid(relowner)||'/'||relforcerowsecurity FROM pg_class WHERE oid='taskpulse_private.{t}'::regclass")=='taskpulse_definer/true',t
        assert value(db,f"count(*) FROM pg_policies WHERE schemaname='taskpulse_private' AND tablename='{t}' AND policyname='m15_scope'")=='1',t
        assert value(db,f"count(*) FROM pg_trigger WHERE tgrelid='taskpulse_private.{t}'::regclass AND tgname='aaa_m15_organization'")=='1',t
        for role in ('anon','authenticated','service_role'):
            assert value(db,f"has_table_privilege('{role}','taskpulse_private.{t}','SELECT')")=='f',(t,role)
    for f in FUNCTIONS:
        assert value(db,f"pg_get_userbyid(proowner)||'/'||prosecdef FROM pg_proc WHERE oid='public.{f}'::regprocedure")=='taskpulse_definer/true',f
        assert value(db,f"has_function_privilege('anon','public.{f}','EXECUTE')")=='f',f
        assert value(db,f"has_function_privilege('authenticated','public.{f}','EXECUTE')")=='t',f
        assert value(db,f"has_function_privilege('service_role','public.{f}','EXECUTE')")==('t' if f.split('(')[0] in ('policy_period_facts','policy_due_work','policy_command') else 'f'),f
    print('PASS',db,'private tables owned by taskpulse_definer with FORCE RLS, scope policy and company stamp; functions SECURITY DEFINER; anon none; worker only facts, due work and the command')

    A=value(db,"id FROM public.organizations WHERE is_default")
    sql(db,"INSERT INTO public.organizations(name,slug) VALUES('Beta Builders','beta')")
    B=value(db,"id FROM public.organizations WHERE slug='beta'")
    sql(db,f"""INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
      ('{B_DIR}','bdir@beta.test','{{"employee_id":"TEST-1"}}','{{"organization_id":"{B}"}}'),
      ('{B4}','b4@beta.test','{{"employee_id":"TEST-4"}}','{{"organization_id":"{B}"}}')""")
    sql(db,f"UPDATE public.users SET role='managing_director' WHERE id='{B_DIR}'")
    today=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    d=lambda n:value(db,f"('{today}'::date-({n}))::date")
    W=('worker',A)

    # ------------------------------------------------------------------ management commands
    p1_def=definition('Logged every day')
    op=str(uuid4())
    created=ok(db,A_DIR,command('create',p1_def,op))
    P1=created['policyId']
    assert created=={'policyId':P1,'version':1,'active':True}
    assert ok(db,A_DIR,command('create',p1_def,op))==created,'a replay returns the first response'
    refused(db,A_DIR,command('create',{**p1_def,'name':'Something else'},op),'PT409')
    assert value(db,"count(*) FROM taskpulse_private.policies")=='1'
    print('PASS',db,'receipt replay returns the first response; the same operation with different input is PT409 (never 40001)')

    for who in (A2,A3,A4):refused(db,who,command('create',definition('Not allowed')),'42501')
    refused(db,None,command('create',definition('Anon')),'42501')
    refused(db,W,command('create',definition('Worker')),'42501')
    refused(db,B_DIR,command('revise',{**p1_def,'policyId':P1,'expectedVersion':1}),'42501')
    refused(db,('worker',None),facts(today,today),'42501')
    sql(db,f"UPDATE public.users SET role='managing_director' WHERE id='{A8}'; UPDATE public.users SET is_active=false WHERE id='{A_DIR}'")
    refused(db,A_DIR,command('create',definition('Inactive')),'42501')
    sql(db,f"UPDATE public.users SET is_active=true WHERE id='{A_DIR}'; UPDATE public.users SET role='team_member' WHERE id='{A8}'")
    refused(db,A_DIR,command('create',{**p1_def,'name':' logged EVERY day '}),'23514')
    for bad in ({**p1_def,'periodKind':'year'},{**p1_def,'reward':{'kind':'cash','badge':'x','points':1}},{**p1_def,'reward':{**p1_def['reward'],'points':2.5}},
                {**p1_def,'templateKey':'DROP TABLE'},{**p1_def,'parameters':{'x':{'nested':1}}},{**p1_def,'audience':{'kind':'roles','roles':['king']}},
                {**p1_def,'name':''}):
        refused(db,A_DIR,command('create',bad),'23514')
    print('PASS',db,'only an active managing director manages policies; engineers, data managers, members, anon, the worker, inactive and other-company accounts are refused; names, rewards, templates, parameters and audiences are validated')

    refused(db,A_DIR,command('revise',{**p1_def,'policyId':P1,'expectedVersion':0}),'PT409')
    rev=ok(db,A_DIR,command('revise',{**p1_def,'parameters':{'minHours':0.5},'policyId':P1,'expectedVersion':1,'reason':'Half an hour'}))
    assert rev['version']==2
    assert ok(db,A_DIR,command('deactivate',{'policyId':P1,'expectedVersion':2}))['active'] is False
    assert ok(db,A_DIR,command('activate',{'policyId':P1,'expectedVersion':3}))['active'] is True
    assert value(db,f"string_agg(command||':'||version,',' ORDER BY version) FROM taskpulse_private.policy_revisions WHERE policy_id='{P1}'")=='create:1,revise:2,deactivate:3,activate:4'
    sql(db,"UPDATE taskpulse_private.policy_revisions SET reason='rewritten'",False)
    print('PASS',db,'revise/deactivate/activate bump the version and keep immutable revisions; a stale version is PT409')

    # ------------------------------------------------------------------ facts
    def att(uid,day,status,check=None,hours=8):
        payload={'business_date':day,'author_id':uid,'attendance_status':status,'attendance_hours':str(hours if status in ('Present','Half Day') else 0),'off_hours':'0'}
        if check:
            h,m=map(int,check.split(':'))
            payload['check_in_at']=f'{day}T{check}:00+05:30'
            payload['check_out_at']=f'{day}T{h+hours:02d}:{m:02d}:00+05:30'
        return ok(db,uid,f"SELECT public.dated_record_command('attendance',NULL,'save',{j(payload)},0,gen_random_uuid())")
    att(A4,d(3),'Present','09:05'); att(A4,d(2),'Present','09:47')
    sql(db,f"BEGIN; SELECT set_config('request.jwt.claim.sub','{A4}',true); INSERT INTO public.daily_task_logs(task_id,user_id,log_date,hours_worked) VALUES('{T1}','{A4}','{d(3)}',2); COMMIT;")
    # Everyone in company A on Holiday on d(5): a team holiday under 37's rule.
    sql(db,f"INSERT INTO public.attendance_records(user_id,attendance_date,status) SELECT id,'{d(5)}','Holiday' FROM public.users WHERE organization_id='{A}' AND is_active")
    sql(db,f"UPDATE public.tasks SET assigned_date='{d(20)}',due_date='{d(10)}' WHERE id='{T1}'")
    mine=ok(db,A4,facts(d(6),today))
    assert [m['userId'] for m in mine['members']]==[A4] and mine['through']==today and mine['timezone']=='Asia/Kolkata'
    days={x['date']:x for x in member(mine,A4)['days']}
    assert len(days)==7 and days[d(3)]['checkIn']=='09:05' and days[d(2)]['checkIn']=='09:47' and days[d(3)]['loggedHours']==2
    assert days[d(3)]['status']=='Present' and days[d(3)]['regularHours']==8 and days[d(3)]['hoursConfirmed'] is True and days[d(3)]['active'] is True
    assert days[d(4)]['status'] is None and days[d(4)]['active'] is False and days[d(5)]['teamHoliday'] is True and mine['teamHolidays']==[d(5)]
    assert mine['holidaySource']=='team_holiday_dates'
    assert member(mine,A4)['tasks']['overdue']==1 and member(mine,A4)['tasks']['rotten']==1 and member(mine,A4)['tasks']['open']==1
    assert set(member(mine,A4)['contributions'])=={'facts','ideas','suggestions','sales'}
    refused(db,A4,facts(d(6),today,A5),'42501')
    assert [m['userId'] for m in ok(db,A4,facts(d(6),today,A4))['members']]==[A4]
    company=ok(db,A_DIR,facts(d(6),today))
    ids={m['userId'] for m in company['members']}
    assert {A_DIR,A2,A4,A5}<=ids and B4 not in ids and U(7) not in ids,'director reads active members of company A only'
    assert [m['userId'] for m in ok(db,A2,facts(d(6),today,A5))['members']]==[A5]
    refused(db,B_DIR,facts(d(6),today,A4),'42501')
    worker=ok(db,W,facts(d(6),today))
    assert {m['userId'] for m in worker['members']}==ids and worker['teamHolidays']==[d(5)] and worker['holidaySource'] in ('derived_rule','team_holiday_dates')
    assert {m['userId'] for m in ok(db,('worker',B),facts(d(6),today))['members']}=={B_DIR,B4}
    refused(db,A4,facts(d(62),today),'23514')
    future=ok(db,A4,facts(value(db,f"('{today}'::date+1)::date"),value(db,f"('{today}'::date+3)::date")))
    assert future['through'] is None and member(future,A4)['days']==[]
    refused(db,None,facts(today,today),'42501')
    print('PASS',db,'facts: members read themselves, managers their company or one member, the scoped worker its company; check-in HH:MM in Asia/Kolkata, confirmed hours, logs, activity, team holidays and period-end task counts; unscoped worker, anon, other companies and ranges over 62 days are refused')

    # ------------------------------------------------------------------ due work and recording
    # P1 existed for the last four days: backdate it (as the owner, triggers off) so closed days are due.
    sql(db,f"""ALTER TABLE taskpulse_private.policies DISABLE TRIGGER USER; ALTER TABLE taskpulse_private.policy_revisions DISABLE TRIGGER USER;
      UPDATE taskpulse_private.policies SET created_at=('{d(4)}'::timestamp AT TIME ZONE 'Asia/Kolkata')+interval '9 hours' WHERE id='{P1}';
      UPDATE taskpulse_private.policy_revisions SET recorded_at=('{d(4)}'::timestamp AT TIME ZONE 'Asia/Kolkata')+interval '9 hours'+version*interval '1 minute' WHERE policy_id='{P1}';
      ALTER TABLE taskpulse_private.policies ENABLE TRIGGER USER; ALTER TABLE taskpulse_private.policy_revisions ENABLE TRIGGER USER;""")
    work=ok(db,W,due())
    assert work['today']==today and work['remaining']==5,work
    by={i['periodKey']:i for i in work['items']}
    assert sorted(by)==[d(n) for n in (4,3,2,1,0)] and all(i['reason']=='new' for i in work['items'])
    assert by[today]['open'] is True and not any(i['open'] for k,i in by.items() if k!=today)
    assert all(i['policyVersion']==4 and i['definition']['parameters']=={'minHours':0.5} for i in work['items']),'the version in force at each day end'
    assert ok(db,A_DIR,due())['remaining']==5
    for who in (A2,A4):refused(db,who,due(),'42501')
    refused(db,W,due(value(db,f"('{today}'::date+1)::date")),'23514')
    assert ok(db,('worker',B),due())['remaining']==0
    req=ok(db,A_DIR,due(policy=P1))
    assert [(i['periodKey'],i['reason']) for i in req['items']]==[(d(1),'requested'),(today,'requested')]
    print('PASS',db,'due work: new periods since creation with the version in force; managing director and scoped worker only; Evaluate now returns the current and previous period')

    first=ok(db,W,recording('nightly',[item(by[d(3)],[ev(A4,'met'),ev(A5,'unavailable','attendance_missing')])],op:=str(uuid4())))
    assert first['changed']==2 and first['notified']==1 and first['met']==1 and first['unavailable']==1,first
    assert ok(db,W,recording('nightly',[item(by[d(3)],[ev(A4,'met'),ev(A5,'unavailable','attendance_missing')])],op))==first
    refused(db,W,recording('nightly',[item(by[d(3)],[ev(A4,'not_met')])],op),'PT409')
    again=ok(db,W,recording('nightly',[item(by[d(3)],[ev(A4,'met'),ev(A5,'unavailable','attendance_missing')])]))
    assert again['changed']==0 and again['notified']==0
    assert value(db,"count(*) FROM taskpulse_private.policy_evaluations")=='2' and value(db,f"count(*) FROM taskpulse_private.notifications WHERE recipient_id='{A4}'")=='1'
    print('PASS',db,'recording upserts one row per member and period; unchanged results change nothing; a final met notifies once; replay is PT409-safe')

    corrected=ok(db,W,recording('invalidation',[item(by[d(3)],[ev(A4,'not_met','below_min_hours'),ev(A5,'unavailable','attendance_missing')])]))
    assert corrected['changed']==1 and corrected['notified']==0
    row=value(db,f"outcome||'/'||previous_outcome||'/'||(commended_at IS NOT NULL) FROM taskpulse_private.policy_evaluations WHERE employee_id='{A4}'")
    assert row=='not_met/met/true',row
    read=ok(db,A_DIR,f"SELECT public.policy_evaluations_read('{P1}','{d(3)}')")['evaluations']
    assert {e['employeeId']:e['withdrawn'] for e in read}=={A4:True,A5:False}
    remet=ok(db,W,recording('invalidation',[item(by[d(3)],[ev(A4,'met'),ev(A5,'unavailable','attendance_missing')])]))
    assert remet['changed']==1 and remet['notified']==0 and value(db,f"count(*) FROM taskpulse_private.notifications WHERE recipient_id='{A4}'")=='1'
    print('PASS',db,'a correction to not met keeps the commendation date (withdrawn after correction); met again is not notified twice')

    refused(db,W,recording('nightly',[{**item(by[today],[ev(A4,'met')]),'final':True}]),'PT409')
    refused(db,W,recording('nightly',[{**item(by[d(2)],[ev(A4,'met')]),'periodKey':d(1)}]),'23514')
    refused(db,W,recording('nightly',[item(by[d(2)],[ev(B4,'met')])]),'42501')
    refused(db,W,recording('nightly',[item(by[d(2)],[ev(A4,'maybe')])]),'23514')
    refused(db,W,recording('nightly',[item(by[d(2)],[{**ev(A4,'met'),'evidence':{'x':'y'*9000}}])]),'23514')
    refused(db,('worker',B),recording('nightly',[item(by[d(2)],[ev(A4,'met')])]),'42501')
    refused(db,W,recording('on_demand',[item(by[d(2)],[ev(A4,'met')])]),'23514')
    refused(db,A_DIR,recording('nightly',[item(by[d(2)],[ev(A4,'met')])]),'23514')
    for who in (A2,A4,B_DIR):refused(db,who,recording('on_demand',[item(by[d(2)],[ev(A4,'met')])]),'42501')
    P2=ok(db,A_DIR,command('create',definition('Only Asha',audience={'kind':'members','ids':[A4]})))['policyId']
    p2=ok(db,A_DIR,due(policy=P2))['items'][-1]
    refused(db,A_DIR,recording('on_demand',[item(p2,[ev(A5,'met')])]),'23514')
    assert ok(db,A_DIR,recording('on_demand',[item(p2,[ev(A4,'met')])]))['changed']==1
    assert value(db,"count(*) FROM taskpulse_private.policy_runs WHERE trigger='on_demand' AND status='completed' AND actor_id IS NOT NULL")=='1'
    print('PASS',db,'refused: a period that closed meanwhile (PT409), mismatched keys, other-company members, unknown outcomes, oversized evidence, other-company workers, wrong triggers, non-directors and members outside the audience')

    for k,i in by.items():
        if k!=d(3):ok(db,W,recording('nightly',[item(i,[ev(A4,'not_met','below_min_hours'),ev(A5,'unavailable','attendance_missing')])]))
    rest=ok(db,W,due())
    assert rest['remaining']==0,rest
    print('PASS',db,'after recording, due work for the policy is empty (the worker loop ends)')

    # ------------------------------------------------------------------ invalidation -> due work
    att(A4,d(1),'Present','09:00')
    assert value(db,f"count(*) FROM taskpulse_private.policy_invalidations WHERE organization_id='{A}' AND from_date='{d(1)}' AND to_date='{d(1)}' AND source='attendance'")=='1'
    again=ok(db,W,due())
    assert (d(1),'invalidated') in [(i['periodKey'],i['reason']) for i in again['items'] if i['policyId']==P1]
    stale_read=value(db,"to_char(clock_timestamp()-interval '10 minutes','YYYY-MM-DD\"T\"HH24:MI:SS.MSOF')")
    ok(db,W,recording('invalidation',[item(by[d(1)],[ev(A4,'met'),ev(A5,'unavailable','attendance_missing')],facts_at=stale_read)]))
    assert d(1) in [i['periodKey'] for i in ok(db,W,due())['items'] if i['policyId']==P1],'facts read before the change: still due'
    ok(db,W,recording('invalidation',[item(by[d(1)],[ev(A4,'met'),ev(A5,'unavailable','attendance_missing')])]))
    assert d(1) not in [i['periodKey'] for i in ok(db,W,due())['items'] if i['policyId']==P1]
    sql(db,f"BEGIN; SELECT set_config('request.jwt.claim.sub','{A_DIR}',true); UPDATE public.tasks SET due_date='{d(2)}' WHERE id='{T1}'; COMMIT;")
    assert value(db,f"from_date||'/'||to_date FROM taskpulse_private.policy_invalidations WHERE source='task' ORDER BY id DESC LIMIT 1")==f'{d(10)}/{today}'
    assert {i['periodKey'] for i in ok(db,W,due())['items'] if i['policyId']==P1}>={d(4),d(3),d(2),d(1),today}
    att(B4,d(1),'Present','09:00')
    assert value(db,f"count(*) FROM taskpulse_private.policy_invalidations WHERE organization_id='{B}'")=='0','no live policy in B: nothing recorded'
    print('PASS',db,'attendance and mission changes record invalidated ranges; due work returns the touched periods until evaluated with facts read after the change; companies without policies record nothing')

    # ------------------------------------------------------------------ notifications
    inbox=ok(db,A4,"SELECT public.notifications_list(20)")
    assert inbox['unread']==2 and len(inbox['items'])==2 and inbox['items'][0]['kind']=='policy_met' and inbox['items'][0]['href']=='/policies'
    assert 'Steady logger' in inbox['items'][0]['body'] and '15 recognition points' in inbox['items'][0]['body']
    nid=inbox['items'][0]['id']
    assert ok(db,A5,"SELECT public.notifications_list(20)")['items']==[] and ok(db,B4,"SELECT public.notifications_list(20)")['items']==[]
    assert ok(db,A5,f"SELECT public.notifications_mark_read(ARRAY['{nid}']::uuid[])")=='0'
    assert ok(db,A4,"SELECT public.notifications_unread_count()")=='2'
    assert ok(db,A4,f"SELECT public.notifications_mark_read(ARRAY['{nid}']::uuid[])")=='1' and ok(db,A4,"SELECT public.notifications_unread_count()")=='1'
    assert ok(db,A4,"SELECT public.notifications_mark_read(NULL)")=='1' and ok(db,A4,"SELECT public.notifications_unread_count()")=='0'
    refused(db,W,"SELECT public.notifications_list(20)",'42501')
    failed=ok(db,W,command('record_failure',{'trigger':'nightly','errorCode':'facts_read_failed','errorDetail':'timeout'}))
    assert failed['status']=='failed' and failed['notified']==1
    assert ok(db,W,command('record_failure',{'trigger':'nightly','errorCode':'facts_read_failed'}))['notified']==0,'one failure notice a day'
    assert ok(db,A_DIR,"SELECT public.notifications_list(5)")['items'][0]['kind']=='policy_run_failed'
    assert ok(db,A2,"SELECT public.notifications_list(5)")['items']==[]
    refused(db,W,command('record_failure',{'trigger':'nightly','errorCode':'Bad Code!'}),'23514')
    runs=ok(db,A2,"SELECT public.policy_runs_read(20)")['runs']
    assert runs[0]['status']=='failed' and runs[0]['errorCode']=='facts_read_failed' and any(r['status']=='completed' for r in runs)
    refused(db,A4,"SELECT public.policy_runs_read(20)",'42501')
    assert ok(db,B_DIR,"SELECT public.policy_runs_read(20)")['runs']==[]
    print('PASS',db,'notifications: self only, unread count, mark read (own only); failures are runs with a code and notify the managing director once a day; runs are manager-only and company-scoped')

    # ------------------------------------------------------------------ reads
    listing=ok(db,A4,"SELECT public.policy_list()")
    p={x['id']:x for x in listing['policies']}
    assert listing['canManage'] is False and set(p)=={P1,P2} and p[P1]['counts'] is None and p[P1]['audience']=={'kind':'everyone'}
    assert p[P1]['mine']['outcome']=='not_met' and p[P1]['period']['key']==today
    assert P2 not in {x['id'] for x in ok(db,A5,"SELECT public.policy_list()")['policies']},'members see only policies that apply to them'
    md=ok(db,A_DIR,"SELECT public.policy_list()")
    assert md['canManage'] is True and {x['id']:x for x in md['policies']}[P1]['counts']=={'met':0,'notMet':1,'unavailable':1}
    assert ok(db,B_DIR,"SELECT public.policy_list()")['policies']==[]
    refused(db,B_DIR,f"SELECT public.policy_evaluations_read('{P1}',NULL)",'42501')
    assert {e['employeeId'] for e in ok(db,A4,f"SELECT public.policy_evaluations_read('{P1}',NULL)")['evaluations']}=={A4}
    praise=ok(db,A5,"SELECT public.policy_commendations(NULL,NULL,NULL)")['commendations']
    assert [(c['employeeId'],c['periodKey'],c['badge'],c['points']) for c in praise]==[(A4,d(1),'Steady logger',15),(A4,d(3),'Steady logger',15)],praise
    assert ok(db,A4,f"SELECT public.policy_commendations('{d(2)}','{today}','{A4}')")['commendations'][0]['periodKey']==d(1)
    assert ok(db,B4,"SELECT public.policy_commendations(NULL,NULL,NULL)")['commendations']==[]
    refused(db,B_DIR,f"SELECT public.policy_commendations(NULL,NULL,'{A4}')",'42501')
    print('PASS',db,'reads: members see applicable active policies and their own status; managers see counts; commendations are public within the company only, with the evaluated version\'s badge and points')

    refused(db,A_DIR,command('archive',{'policyId':P2,'expectedVersion':2}),'PT409')
    assert ok(db,A_DIR,command('archive',{'policyId':P2,'expectedVersion':1}))['archived'] is True
    refused(db,A_DIR,command('activate',{'policyId':P2,'expectedVersion':2}),'23514')
    assert ok(db,A_DIR,command('create',definition('Only Asha')))['version']==1,'an archived name can be reused'
    print('PASS',db,'archive frees the name and freezes the policy')

    assert value(db,"taskpulse_private.m15_secure()")=='0 tables and 0 functions moved to taskpulse_definer'
    assert '40001' not in MIGRATION
    print('PASS',db,'m15_secure() leaves nothing to move; migration 56 never raises 40001')

print('ALL PASS')
