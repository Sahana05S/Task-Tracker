"""Businesses, migration 134: taskpulse_private.businesses and user_businesses, tasks.business_id, business_command,
user_businesses_command, task_business_command, businesses(), my_businesses() and business_summary(). Fresh install
01-latest and upgrade (seeded before 134): company #1 gets its three businesses, no direct table access, only the
managing director manages businesses and assigns them to people, who may set a mission's business (the MD, Managers,
the Crew; save_task_with_participants on create and edit), sub-missions inherit their parent's business, idempotent
replay, the per-business summary, and company separation. Disposable PostgreSQL; JWT shim only; no hosted connection."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_businesses_fresh_test','taskpulse_businesses_upgrade_test')
U=lambda n:'00000000-0000-0000-0000-'+str(n).zfill(12)
MD,PE,DM,M4,M5,M6,INACTIVE=U(1),U(2),U(3),U(4),U(5),U(6),U(7)
B_DIR='00000000-0000-0000-0000-0000000000b1'
T1,T2='10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002'
MIGRATIONS=sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0]))
LATEST=int(MIGRATIONS[-1].name.split('_')[0])

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
def q(v):return 'NULL' if v is None else literal(v)
def biz_sql(op,business=None,name=None,colour=None,sort=None,operation=None):
    return (f"SELECT public.business_command('{op}',{q(business)},{q(name)},{q(colour)},"
            f"{'NULL' if sort is None else int(sort)},'{operation or uuid4()}')")
def people_sql(user,ids,operation=None):
    arr='ARRAY[]::uuid[]' if not ids else 'ARRAY['+','.join(literal(i) for i in ids)+']::uuid[]'
    return f"SELECT public.user_businesses_command('{user}',{arr},'{operation or uuid4()}')"
def mission_sql(task,business,operation=None):
    return f"SELECT public.task_business_command('{task}',{q(business)},'{operation or uuid4()}')"
def catalogue(db,uid):return json.loads(ok(db,uid,'SELECT public.businesses()'))
def mine(db,uid):return json.loads(ok(db,uid,'SELECT public.my_businesses()'))
def summary(db,uid):return json.loads(ok(db,uid,'SELECT public.business_summary()'))
def business_of(db,task):
    v=value(db,f"coalesce(business_id::text,'none') FROM public.tasks WHERE id='{task}'")
    return None if v=='none' else v

assert LATEST>=134
for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    every=[int(m.name.split('_')[0]) for m in MIGRATIONS]
    if db==DBS[1]:
        migrate(db,[n for n in every if n<134]); sql(db,seed)
        migrate(db,[n for n in every if n>=134])
        print('PASS',db,'upgrade to 134 over a seeded company')
    else:
        migrate(db,every); sql(db,seed)
        print('PASS',db,f'fresh install 01-{LATEST} including 134')

    # ---- ownership, grants and the seeded list -----------------------------------------------------------------
    assert value(db,"taskpulse_private.m15_secure()")=='0 tables and 0 functions moved to taskpulse_definer'
    for table in ('businesses','user_businesses'):
        assert value(db,f"pg_get_userbyid(relowner)||relforcerowsecurity FROM pg_class WHERE oid='taskpulse_private.{table}'::regclass")=='taskpulse_definertrue'
        expect_code(db,MD,f'SELECT count(*) FROM taskpulse_private.{table}','42501')
    expect_code(db,MD,f"UPDATE public.tasks SET business_id=NULL WHERE id='{T1}'",'42501')
    expect_code(db,None,'SELECT public.businesses()','42501')
    expect_code(db,INACTIVE,'SELECT public.businesses()','42501')
    seeded=catalogue(db,M4)
    assert seeded['canManage'] is False and catalogue(db,MD)['canManage'] is True
    assert [(b['name'],b['slug'],b['archived']) for b in seeded['businesses']]==[
        ('3D printing','3d-printing',False),('Fish sales','fish-sales',False),('Construction services','construction-services',False)],seeded
    ids={b['slug']:b['id'] for b in seeded['businesses']}
    PRINT,FISH,BUILD=ids['3d-printing'],ids['fish-sales'],ids['construction-services']
    assert mine(db,M4)==[]
    print('PASS',db,'definer-owned FORCE RLS tables with no direct access; company #1 has its three businesses')

    # ---- managing businesses: the managing director only ------------------------------------------------------
    for uid in (PE,DM,M4,INACTIVE,None):expect_code(db,uid,biz_sql('create',name='Solar'),'42501')
    op=uuid4()
    solar=json.loads(ok(db,MD,biz_sql('create',name='  Solar   panels ',colour='recognition',operation=op)))
    assert (solar['name'],solar['slug'],solar['colour'],solar['archived'],solar['sort'])==('Solar panels','solar-panels','recognition',False,40),solar
    assert json.loads(ok(db,MD,biz_sql('create',name='  Solar   panels ',colour='recognition',operation=op)))==solar,'replay returns the receipt'
    expect_code(db,MD,biz_sql('create',name='Other',operation=op),'PT409')
    expect_code(db,MD,biz_sql('create',name='solar PANELS'),'23505')
    expect_code(db,MD,biz_sql('create',name='Bad colour',colour='#ff0000'),'23514')
    expect_code(db,MD,biz_sql('create',name='  '),'23514')
    renamed=json.loads(ok(db,MD,biz_sql('update',business=solar['id'],name='Solar',sort=5)))
    assert renamed['id']==solar['id'] and renamed['slug']=='solar' and renamed['colour']=='recognition' and renamed['sort']==5
    assert catalogue(db,M5)['businesses'][0]['name']=='Solar','sorted by order'
    for uid in (PE,M4):expect_code(db,uid,biz_sql('archive',business=solar['id']),'42501')
    print('PASS',db,'only the managing director creates and edits businesses; names are unique per company; replay is idempotent')

    # ---- assigning businesses to people -------------------------------------------------------------------------
    for uid in (PE,DM,M4,M5):expect_code(db,uid,people_sql(M4,[PRINT]),'42501')
    op=uuid4()
    got=json.loads(ok(db,MD,people_sql(M4,[FISH,PRINT,PRINT],operation=op)))
    assert got=={'userId':M4,'businessIds':[PRINT,FISH]},got
    assert json.loads(ok(db,MD,people_sql(M4,[FISH,PRINT,PRINT],operation=op)))==got
    expect_code(db,MD,people_sql(M4,[FISH],operation=op),'PT409')
    assert mine(db,M4)==[PRINT,FISH] and mine(db,M5)==[]
    members={b['id']:b['memberIds'] for b in catalogue(db,M6)['businesses']}
    assert members[PRINT]==[M4] and members[FISH]==[M4] and members[BUILD]==[]
    ok(db,MD,people_sql(M5,[solar['id'],BUILD]))
    ok(db,MD,biz_sql('archive',business=solar['id']))
    assert [b['archived'] for b in catalogue(db,M5)['businesses'] if b['id']==solar['id']]==[True]
    assert catalogue(db,M5)['businesses'][-1]['id']==solar['id'],'archived businesses come last'
    assert mine(db,M5)==[BUILD],'an archived business is not one of the person\'s chips'
    ok(db,MD,people_sql(M5,[solar['id'],BUILD,FISH]))  # an archived business already held may stay
    expect_code(db,MD,people_sql(M6,[solar['id']]),'23514')  # but is not newly given
    expect_code(db,MD,people_sql(M6,[str(uuid4())]),'23514')
    ok(db,MD,people_sql(M5,[FISH]))
    assert mine(db,M5)==[FISH]
    assert value(db,"count(*) FROM taskpulse_private.audit_events WHERE command='user_businesses_set'")=='4'
    print('PASS',db,'the managing director sets each person\'s businesses; archived ones stay but are never newly given')

    # ---- a mission's business -----------------------------------------------------------------------------------
    expect_code(db,M5,mission_sql(T1,PRINT),'42501')   # not on T1
    expect_code(db,M6,mission_sql(T1,PRINT),'42501')   # T1's reviewer
    expect_code(db,DM,mission_sql(T1,PRINT),'42501')
    op=uuid4()
    assert json.loads(ok(db,M4,mission_sql(T1,PRINT,operation=op)))=={'taskId':T1,'businessId':PRINT}  # T1's Crew
    assert json.loads(ok(db,M4,mission_sql(T1,PRINT,operation=op)))=={'taskId':T1,'businessId':PRINT}
    expect_code(db,M4,mission_sql(T1,FISH,operation=op),'PT409')
    assert business_of(db,T1)==PRINT
    expect_code(db,PE,mission_sql(T2,solar['id']),'23514')   # archived
    expect_code(db,PE,mission_sql(T2,str(uuid4())),'23514')
    ok(db,PE,mission_sql(T2,FISH)); assert business_of(db,T2)==FISH
    ok(db,MD,mission_sql(T2,None)); assert business_of(db,T2) is None
    ok(db,MD,mission_sql(T2,FISH))
    audits=lambda:int(value(db,"count(*) FROM taskpulse_private.audit_events WHERE command='task_business_set'"))
    before=audits(); ok(db,M4,mission_sql(T1,PRINT)); assert audits()==before,'an unchanged business writes no audit line'
    print('PASS',db,'the managing director, Managers and the Crew choose a mission\'s business (active, own company); others cannot')

    # Create and edit carry the business (the New mission form and the edit dialog).
    fields={'task_tag':None,'title':'Printer farm','category':'T','priority':'Medium','task_scale':4,'business_id':BUILD}
    key=str(uuid4())
    create=(f"SELECT public.save_task_with_participants(NULL,{literal(json.dumps(fields))}::jsonb,ARRAY['{M4}']::uuid[],"
            f"ARRAY[]::uuid[],NULL,NULL,false,'{key}')")
    expect_code(db,M4,create,'42501')
    T3=ok(db,MD,create)
    assert business_of(db,T3)==BUILD
    tv=lambda c:value(db,f"{c} FROM public.tasks WHERE id='{T3}'")
    def edit_sql(business):
        f={'task_tag':tv('task_tag'),'title':'Printer farm','category':'T','priority':'Medium','expected_lifecycle_version':int(tv('lifecycle_version')),'business_id':business}
        return (f"SELECT public.save_task_with_participants('{T3}',{literal(json.dumps(f))}::jsonb,ARRAY['{M4}']::uuid[],"
                f"ARRAY[]::uuid[],NULL,{tv('participant_version')},false,'{uuid4()}')")
    edit=lambda business:ok(db,PE,edit_sql(business))
    edit(PRINT); assert business_of(db,T3)==PRINT
    edit(''); assert business_of(db,T3) is None
    expect_code(db,PE,edit_sql(solar['id']),'23514')
    assert business_of(db,T3) is None
    print('PASS',db,'save_task_with_participants sets, changes and clears the business on create and edit')

    # Sub-missions take their parent's business.
    edit(FISH)
    v=int(tv('lifecycle_version'))
    made=json.loads(ok(db,MD,f"SELECT public.submission_create('{T3}',NULL,'activity',NULL,{literal(json.dumps({'title':'Spare nozzles'}))}::jsonb,{v},'{uuid4()}')"))
    child=made['subMissionId']
    assert business_of(db,child)==FISH,'a sub-mission takes its parent\'s business'
    ok(db,M4,mission_sql(child,PRINT)); assert business_of(db,child)==PRINT,'and may then be changed'
    print('PASS',db,'a sub-mission starts in its parent\'s business')

    # ---- the per-business line ----------------------------------------------------------------------------------
    today=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    call(db,'create_task_log',T1,{'log_date':today,'hours_worked':1.5,'requested_delta':0},uid='4')
    call(db,'create_task_log',T2,{'log_date':today,'hours_worked':2,'requested_delta':0},uid='5')
    s=summary(db,M6)
    rows={r['businessId']:r for r in s['rows']}
    assert s['today']==today and s['weekStart']<=today
    assert s['permanentAvailable']==(value(db,"count(*) FROM pg_attribute WHERE attrelid='public.tasks'::regclass AND attname='is_permanent' AND NOT attisdropped")=='1')
    assert rows[PRINT]['openMissions']==2 and float(rows[PRINT]['weekHours'])==1.5,rows   # T1 and the sub-mission
    assert rows[FISH]['openMissions']==2 and float(rows[FISH]['weekHours'])==2,rows       # T2 and T3
    if not s['permanentAvailable']:assert rows[PRINT]['permanentMissions'] is None
    print('PASS',db,'business_summary counts open missions and this week\'s logged hours per business')

    # ---- company separation -----------------------------------------------------------------------------------------
    sql(db,"INSERT INTO public.organizations(name,slug) VALUES('Beta Builders','beta')")
    B=value(db,"id FROM public.organizations WHERE slug='beta'")
    sql(db,f"""INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
      ('{B_DIR}','bdir@beta.test','{{"employee_id":"BETA-1"}}','{{"organization_id":"{B}"}}')""")
    sql(db,f"UPDATE public.users SET role='managing_director' WHERE id='{B_DIR}'")
    assert catalogue(db,B_DIR)['businesses']==[],'a new company starts with no businesses'
    assert summary(db,B_DIR)['rows']==[]
    expect_code(db,B_DIR,biz_sql('update',business=PRINT,name='Taken'),'P0002')
    expect_code(db,B_DIR,people_sql(M4,[]),'P0002')
    expect_code(db,B_DIR,mission_sql(T1,None),'P0002')
    beta=json.loads(ok(db,B_DIR,biz_sql('create',name='3D printing')))
    assert beta['slug']=='3d-printing' and beta['id']!=PRINT,'the same name is free in another company'
    expect_code(db,MD,mission_sql(T1,beta['id']),'23514')
    expect_code(db,MD,people_sql(M4,[beta['id']]),'23514')
    expect_code(db,B_DIR,people_sql(B_DIR,[PRINT]),'23514')
    assert business_of(db,T1)==PRINT and mine(db,M4)==[PRINT,FISH]
    print('PASS',db,"company B sees none of company A's businesses, cannot change them, and keeps its own list")

print('PASS all businesses checks')
