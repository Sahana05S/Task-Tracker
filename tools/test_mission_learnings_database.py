"""Mistakes and learning on the mission page, migration 111: public.mission_learnings, mission_learnings(task) and
mission_learning_command(add/edit/withdraw). Fresh install 01-latest and upgrade (seeded before 111), no direct
table access, who may write (managing director, project engineers, the mission's assignees) and who may read
(every active member of the company), author-or-manager edits, validation, idempotent replay, archived missions,
the audit line in activity_feed, and company separation. Disposable PostgreSQL; JWT shim only; no hosted connection."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_learnings_fresh_test','taskpulse_learnings_upgrade_test')
U=lambda n:'00000000-0000-0000-0000-'+str(n).zfill(12)
MD,PE,DM,M4,M5,M6,INACTIVE=U(1),U(2),U(3),U(4),U(5),U(6),U(7)
B_DIR='00000000-0000-0000-0000-0000000000b1'
T1,T2='10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002'
MIGRATIONS=sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0]))
LATEST=int(MIGRATIONS[-1].name.split('_')[0])
CMD='public.mission_learning_command(text,uuid,uuid,text,text,uuid)'

def migrate(db,numbers):
    for m in MIGRATIONS:
        if int(m.name.split('_')[0]) in numbers:sql(db,m.read_text(encoding='utf-8'))
def run(db,uid,statement):
    role='anon' if uid is None else 'authenticated'
    return subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],
        input=f"BEGIN; SET LOCAL ROLE {role}; SELECT set_config('request.jwt.claim.sub','{uid or ''}',true);\n{statement.rstrip(';')};\nCOMMIT;",
        text=True,capture_output=True,encoding='utf-8')
def ok(db,uid,statement):
    r=run(db,uid,statement)
    assert r.returncode==0,(statement[:300],r.stderr[:800])
    return [x for x in r.stdout.splitlines() if x and x not in ('BEGIN','COMMIT','SET')][-1]
def expect_code(db,uid,statement,code):
    r=run(db,uid,statement)
    assert r.returncode and code in r.stderr,(statement[:300],r.stderr[:800])
def cmd(op,task,learning=None,kind='learning',body='Check the soil report first',operation=None):
    learning_sql='NULL' if learning is None else f"'{learning}'"
    kind_sql='NULL' if kind is None else literal(kind)
    body_sql='NULL' if body is None else literal(body)
    return f"SELECT public.mission_learning_command('{op}','{task}',{learning_sql},{kind_sql},{body_sql},'{operation or uuid4()}')"
def read(db,uid,task=T1):return json.loads(ok(db,uid,f"SELECT public.mission_learnings('{task}')"))
def add(db,uid,task=T1,**kw):return json.loads(ok(db,uid,cmd('add',task,**kw)))['id']
def rows(db):return value(db,'count(*) FROM public.mission_learnings')

assert LATEST>=111
for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    every=[int(m.name.split('_')[0]) for m in MIGRATIONS]
    if db==DBS[1]:
        migrate(db,[n for n in every if n<111]); sql(db,seed)
        tasks=value(db,'count(*) FROM public.tasks')
        migrate(db,[n for n in every if n>=111])
        assert value(db,'count(*) FROM public.tasks')==tasks and rows(db)=='0'
        print('PASS',db,'upgrade to 111 keeps every mission and starts with no notes')
    else:
        migrate(db,every); sql(db,seed)
        print('PASS',db,f'fresh install 01-{LATEST} including 111')

    # ---- ownership and grants -------------------------------------------------------------------------------
    assert value(db,"taskpulse_private.m15_secure()")=='0 tables and 0 functions moved to taskpulse_definer'
    assert value(db,"pg_get_userbyid(relowner)||relforcerowsecurity FROM pg_class WHERE oid='public.mission_learnings'::regclass")=='taskpulse_definertrue'
    assert value(db,"count(*) FROM taskpulse_private.m15_tenant_tables WHERE table_schema='public' AND table_name='mission_learnings'")=='1'
    assert value(db,f"has_function_privilege('authenticated','{CMD}','EXECUTE') AND NOT has_function_privilege('anon','{CMD}','EXECUTE')")=='t'
    for uid in (MD,M4):
        expect_code(db,uid,'SELECT count(*) FROM public.mission_learnings','42501')
        expect_code(db,uid,f"INSERT INTO public.mission_learnings(organization_id,task_id,kind,body,author_id) SELECT organization_id,id,'mistake','x','{uid}' FROM public.tasks LIMIT 1",'42501')
    print('PASS',db,'the table is definer-owned with FORCE RLS and no direct access; the command is for signed-in users only')

    # ---- who may write ----------------------------------------------------------------------------------------
    for uid in (M5,M6,DM,INACTIVE):expect_code(db,uid,cmd('add',T1),'42501')
    expect_code(db,None,cmd('add',T1),'42501')
    assert rows(db)=='0'
    own=add(db,M4,kind='mistake',body='  Ordered the wrong cable  ')
    pe=add(db,PE)
    add(db,MD,body='Book the crane a week ahead')
    assert value(db,f"body FROM public.mission_learnings WHERE id='{own}'")=='Ordered the wrong cable'
    print('PASS',db,"the assignee, a project engineer and the director add; another member, the reviewer, a data manager, inactive and anonymous callers are refused")

    # ---- who may read -----------------------------------------------------------------------------------------
    for uid in (MD,PE,DM,M4,M5,M6):
        r=read(db,uid)
        assert len(r['items'])==3 and r['canAdd']==(uid in (MD,PE,M4)),(uid,r)
    expect_code(db,INACTIVE,f"SELECT public.mission_learnings('{T1}')",'42501')
    mine={i['id']:i for i in read(db,M4)['items']}
    assert mine[own]['canEdit'] and not mine[pe]['canEdit'] and mine[own]['kind']=='mistake' and mine[own]['authorName']
    assert all(i['canEdit'] for i in read(db,PE)['items']) and not any(i['canEdit'] for i in read(db,M5)['items'])
    assert read(db,M5,T2)=={'canAdd':True,'items':[]}
    print('PASS',db,'every active member reads the notes; canAdd and canEdit follow the rules')

    # ---- validation ---------------------------------------------------------------------------------------------
    before=rows(db)
    for bad in (dict(kind='Mistake'),dict(kind=None),dict(body='   '),dict(body=None),dict(body='x'*2001)):
        expect_code(db,M4,cmd('add',T1,**bad),'23514')
    expect_code(db,M4,cmd('remove',T1),'23514')
    expect_code(db,M4,cmd('add',str(uuid4())),'P0002')
    assert rows(db)==before
    print('PASS',db,'bad kind, blank or overlong text, an unknown operation and an unknown mission are refused')

    # ---- edit and withdraw ----------------------------------------------------------------------------------------
    op=uuid4()
    edited=json.loads(ok(db,M4,cmd('edit',T1,own,kind='learning',body='Check cable specs against the drawing',operation=op)))
    assert edited=={'id':own,'state':'active'}
    assert json.loads(ok(db,M4,cmd('edit',T1,own,kind='learning',body='Check cable specs against the drawing',operation=op)))==edited
    expect_code(db,M4,cmd('edit',T1,own,kind='learning',body='Other text',operation=op),'PT409')
    item={i['id']:i for i in read(db,M5)['items']}[own]
    assert (item['kind'],item['body'],item['edited'])==('learning','Check cable specs against the drawing',True)
    expect_code(db,M4,cmd('edit',T1,pe,body='Not mine'),'P0002')
    expect_code(db,M4,cmd('withdraw',T1,pe),'P0002')
    expect_code(db,M5,cmd('withdraw',T1,own),'42501')
    ok(db,PE,cmd('edit',T1,own,kind='mistake',body='Ordered the wrong cable (corrected by PE)'))
    expect_code(db,M4,cmd('edit',T2,own),'42501')
    ok(db,M4,cmd('withdraw',T1,own))
    assert own not in {i['id'] for i in read(db,MD)['items']} and len(read(db,MD)['items'])==2
    expect_code(db,M4,cmd('edit',T1,own),'P0002')
    assert value(db,f"record_state FROM public.mission_learnings WHERE id='{own}'")=='withdrawn'
    print('PASS',db,'authors and managers edit and withdraw; replay returns the receipt; reuse, other notes and withdrawn notes are refused')

    # ---- audit and activity feed ----------------------------------------------------------------------------------
    audit=value(db,"string_agg(command,',' ORDER BY id) FROM taskpulse_private.audit_events WHERE table_name='mission_learnings'")
    assert audit.split(',')==['mission_learning_add']*3+['mission_learning_edit']*2+['mission_learning_withdraw'],audit
    assert value(db,"count(*) FROM taskpulse_private.audit_events WHERE table_name='mission_learnings' AND protected_changes::text LIKE '%cable%'")=='0'
    today=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    feed=f"SELECT string_agg(action||':'||coalesce(task_tag,'-'),',') FROM public.activity_feed('{today}','{today}','missions',NULL,NULL,200) WHERE record_kind='mission_learnings'"
    assert ok(db,MD,feed).count('mission_learning_add:T1')==3
    assert ok(db,M4,feed).count('mission_learning_')==6,'the assignee sees every line on their mission'
    r=run(db,M5,feed); assert r.returncode==0 and 'mission_learning_' not in r.stdout
    print('PASS',db,'each change is one audit line without the text, and shows in the activity feed under the mission')

    # ---- archived mission is read-only ------------------------------------------------------------------------------
    sql(db,f"SET session_replication_role=replica; UPDATE public.tasks SET archived_effective_date=current_date WHERE id='{T1}';")
    assert read(db,M4)['canAdd'] is False and not any(i['canEdit'] for i in read(db,MD)['items'])
    expect_code(db,MD,cmd('add',T1),'23514')
    expect_code(db,PE,cmd('withdraw',T1,pe),'23514')
    sql(db,f"SET session_replication_role=replica; UPDATE public.tasks SET archived_effective_date=NULL WHERE id='{T1}';")
    print('PASS',db,'an archived mission keeps its notes read-only')

    # ---- company separation -------------------------------------------------------------------------------------------
    sql(db,"INSERT INTO public.organizations(name,slug) VALUES('Beta Builders','beta')")
    B=value(db,"id FROM public.organizations WHERE slug='beta'")
    sql(db,f"""INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
      ('{B_DIR}','bdir@beta.test','{{"employee_id":"BETA-1"}}','{{"organization_id":"{B}"}}')""")
    sql(db,f"UPDATE public.users SET role='managing_director' WHERE id='{B_DIR}'")
    before=rows(db)
    expect_code(db,B_DIR,f"SELECT public.mission_learnings('{T1}')",'P0002')
    expect_code(db,B_DIR,cmd('add',T1),'P0002')
    expect_code(db,B_DIR,cmd('withdraw',T1,pe),'P0002')
    assert rows(db)==before
    print('PASS',db,"company B's director can neither read nor change company A's notes")
