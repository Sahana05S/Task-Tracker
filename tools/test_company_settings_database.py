"""Company settings, migration 53: settings tables and seeds, the read and the director command, the sheet tag
allocator (new missions and Task Tools copies), the attendance holiday default and team_holiday_dates. Fresh
install 01-latest, upgrade from the 57 set without 53, authorization for director / manager / member / another
company, allocator uniqueness under concurrency, holiday default on and off, rollback. Two-company disposable
PostgreSQL checks; JWT shim only; no hosted connection."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_settings_fresh_test','taskpulse_settings_upgrade_test')
U=lambda n:'00000000-0000-0000-0000-'+str(n).zfill(12)
MD,PE,DM,M4,M5=U(1),U(2),U(3),U(4),U(5)
B_DIR,B4='00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4'
MIGRATIONS=sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0]))
M53=next(p for p in MIGRATIONS if p.name.startswith('53_')).read_text(encoding='utf-8')
LATEST=int(MIGRATIONS[-1].name.split('_')[0])
TAG=re.compile(r'^[A-Z][a-z]{2}\d{2}_[A-Z][A-Z0-9]*\d+$')
NEW_TABLES=('organization_settings','meeting_types','company_holidays','standing_missions','task_tag_counters')

def migrate(db,numbers):
    for m in MIGRATIONS:
        if int(m.name.split('_')[0]) in numbers:sql(db,m.read_text(encoding='utf-8'))
def run(db,uid,statement,role=None):
    role=role or ('anon' if uid is None else 'authenticated')
    return subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],
        input=f"BEGIN; SET LOCAL ROLE {role}; SELECT set_config('request.jwt.claim.sub','{uid or ''}',true);\n{statement.rstrip(';')};\nCOMMIT;",
        text=True,capture_output=True,encoding='utf-8')
def ok(db,uid,statement):
    r=run(db,uid,statement)
    assert r.returncode==0,(statement[:160],r.stderr[:400])
    return r.stdout.splitlines()
def first_json(lines):return json.loads(next(x for x in lines if x[:1] in '{['))
def expect_code(db,uid,statement,code,text=None):
    r=run(db,uid,statement)
    assert r.returncode and code in r.stderr and (text is None or text in r.stderr),(statement[:160],r.stderr[:400])
def settings(db,uid):return first_json(ok(db,uid,'SELECT public.company_settings()'))
def command_sql(section,payload,version,op=None):
    return ('SELECT public.company_settings_command('+literal(section)+','+literal(json.dumps(payload))+'::jsonb,'
            +str(version)+','+literal(op or uuid4())+')')
def save(db,uid,section,payload,version=None,op=None):
    if version is None:version=settings(db,uid)['version']
    return first_json(ok(db,uid,command_sql(section,payload,version,op)))
def create_task(db,uid,fields,assignee=M4):
    fields={'initialize_details':False,**fields}
    q=('SELECT public.save_task_with_participants(NULL,'+literal(json.dumps(fields))+'::jsonb,ARRAY['+literal(assignee)+']::uuid[],'
       'ARRAY[]::uuid[],ARRAY[1000000],NULL,false,'+literal(uuid4())+')')
    tid=[x for x in ok(db,uid,q) if re.fullmatch(r'[a-f0-9-]{36}',x)][-1]
    return tid,value(db,f"task_tag FROM public.tasks WHERE id='{tid}'")
def attendance(db,uid,payload,success=True):
    q=('SELECT public.dated_record_command(\'attendance\',NULL,\'save\','+literal(json.dumps(payload))+'::jsonb,0,'+literal(uuid4())+')')
    r=run(db,uid,q)
    if success:
        assert r.returncode==0,r.stderr[:400]
        return first_json(r.stdout.splitlines())
    return r
def broken_apply(db):
    r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],
        input=M53.replace('\nCOMMIT;','\nSELECT 1/0;\nCOMMIT;',1),text=True,capture_output=True,encoding='utf-8')
    assert r.returncode and 'division by zero' in r.stderr,r.stderr[-300:]
def counts(db):
    return {t:value(db,f"count(*) FROM {t}") for t in ('public.users','public.tasks','public.attendance_records','public.meeting_points',
        'taskpulse_private.audit_events','taskpulse_private.command_receipts','taskpulse_private.tool_tag_reservations')}

assert LATEST>=57
for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    every=[int(m.name.split('_')[0]) for m in MIGRATIONS]
    if db==DBS[1]:
        # The hosted test project had 01-52, 54 and 57; 53 arrived later (--include-all),
        # then everything after it (55 month setup builds on 53).
        HOSTED=[n for n in every if n<=52 or n in (54,57)]
        migrate(db,HOSTED); sql(db,seed)
        typed=new_task(db,'TT-000042')
        before=counts(db)
        dated_before=value(db,"md5(pg_get_functiondef('public.dated_record_command(text,uuid,text,jsonb,bigint,uuid)'::regprocedure))")
        broken_apply(db)
        assert value(db,"count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='taskpulse_private' AND c.relname IN ("
                     +','.join(literal(t) for t in NEW_TABLES)+")")=='0'
        assert value(db,"count(*) FROM pg_proc WHERE proname IN ('allocate_task_tag','assign_task_tag','company_settings','company_settings_command','dated_record_command_m53')")=='0'
        assert value(db,"count(*) FROM pg_trigger WHERE tgname='m53_assign_task_tag'")=='0'
        assert value(db,"md5(pg_get_functiondef('public.dated_record_command(text,uuid,text,jsonb,bigint,uuid)'::regprocedure))")==dated_before
        assert counts(db)==before
        print('PASS',db,'a failed migration 53 rolls back completely (tables, functions, trigger, attendance command)')
        sql(db,M53); migrate(db,[n for n in every if n!=53 and n not in HOSTED])
        assert counts(db)==before,'53 changes no existing rows'
        assert value(db,f"task_tag FROM public.tasks WHERE id='{typed}'")=='TT-000042','existing TT- tags stay valid'
        print('PASS',db,'upgrade 01-52+54+57 -> +53 keeps every existing row and TT- tag')
    else:
        migrate(db,every); sql(db,seed)
        print('PASS',db,f'fresh install 01-{LATEST} including 53')

    # ---- ownership, row security, grants ------------------------------------------------------------------
    assert value(db,"taskpulse_private.m15_secure()")=='0 tables and 0 functions moved to taskpulse_definer'
    for t in NEW_TABLES:
        assert value(db,f"pg_get_userbyid(relowner)||relrowsecurity||relforcerowsecurity FROM pg_class WHERE oid='taskpulse_private.{t}'::regclass")=='taskpulse_definertruetrue',t
        r=run(db,M4,f'SELECT count(*) FROM taskpulse_private.{t}'); assert r.returncode and '42501' in r.stderr,t
    for f in ('taskpulse_private.allocate_task_tag(uuid,date,text)','taskpulse_private.dated_record_command_m53(text,uuid,text,jsonb,bigint,uuid)'):
        assert value(db,f"has_function_privilege('authenticated','{f}','EXECUTE')")=='f',f
    for f in ('public.company_settings()','public.company_settings_command(text,jsonb,bigint,uuid)','public.dated_record_command(text,uuid,text,jsonb,bigint,uuid)'):
        assert value(db,f"has_function_privilege('authenticated','{f}','EXECUTE') AND NOT has_function_privilege('anon','{f}','EXECUTE')")=='t',f
    expect_code(db,None,'SELECT public.company_settings()','42501')
    print('PASS',db,'new tables are definer-owned with FORCE RLS and closed to signed-in roles; only the read/command/attendance wrappers are callable')

    # ---- seeds for company #1 -----------------------------------------------------------------------------
    mine=settings(db,MD)
    assert [m['prefix'] for m in mine['meetingTypes']]==['DL','WL','ML','QTL','PRF','SCD','PP','AH']
    assert [m['name'] for m in mine['meetingTypes']][4:]==['Performance Review','Scheduled Discussion','Project Progress','Ad-Hoc']
    assert mine['meetingAgenda'].startswith('Regular Meeting Agenda:') and '3. Pitch in Ideas' in mine['meetingAgenda'] and '4. Share lessons learnt' in mine['meetingAgenda']
    assert mine['categoryOverrides']=={} and mine['holidays']==[]
    titles=[(s['titlePattern'],s['category'],s['priority'],s['ownerMode']) for s in mine['standingMissions']]
    assert titles==[('Off Hours - {month} - {member}','OT','No','per_member'),('Non-Documented Tasks - {month} - {member}','T','Medium','per_member'),
        ('Non-Task and Ad-Hoc Meetings - {month} - {member}','T','Medium','per_member'),
        ('Tasks Tracker, Accounts Book and Attendance Sheet - {month}','AD','Medium','single'),('HRC Tasks - {month}','T','Medium','single'),
        ('Database Re-Organisation','WK','Medium','single')],titles
    print('PASS',db,'company #1 seeded from the workbook: 8 meeting types, the agenda and 6 standing missions')

    # ---- second company -----------------------------------------------------------------------------------
    sql(db,"INSERT INTO public.organizations(name,slug) VALUES('Beta Builders','beta')")
    B=value(db,"id FROM public.organizations WHERE slug='beta'")
    A=value(db,"id FROM public.organizations WHERE is_default")
    sql(db,f"""INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
      ('{B_DIR}','bdir@beta.test','{{"employee_id":"BETA-1"}}','{{"organization_id":"{B}"}}'),
      ('{B4}','b4@beta.test','{{"employee_id":"BETA-4"}}','{{"organization_id":"{B}"}}')""")
    sql(db,f"UPDATE public.users SET role='managing_director' WHERE id='{B_DIR}'")

    # ---- read visibility ----------------------------------------------------------------------------------
    member=settings(db,M4)
    assert member['standingMissions']==[] and member['meetingTypes']==mine['meetingTypes'] and member['meetingAgenda']==mine['meetingAgenda']
    assert len(settings(db,PE)['standingMissions'])==6
    beta=settings(db,B_DIR)
    assert beta['meetingTypes']==[] and beta['meetingAgenda']=='' and beta['standingMissions']==[] and beta['version']==0
    print('PASS',db,'every active member reads their company settings; standing missions only for managers; company B sees none of A')

    # ---- command authorization, versions and idempotency --------------------------------------------------
    for uid in (PE,DM,M4,U(7)):expect_code(db,uid,command_sql('agenda',{'agenda':'x'},mine['version']),'42501')
    expect_code(db,None,command_sql('agenda',{'agenda':'x'},0),'42501')
    v=mine['version']; op=str(uuid4())
    r=save(db,MD,'agenda',{'agenda':'  1. Review Reports  '},v,op)
    assert r=={'section':'agenda','version':v+1}
    assert save(db,MD,'agenda',{'agenda':'  1. Review Reports  '},v,op)==r,'a replayed operation returns its first result'
    expect_code(db,MD,command_sql('agenda',{'agenda':'different'},v,op),'PT409','Operation reused')
    expect_code(db,MD,command_sql('agenda',{'agenda':'stale'},v),'PT409','reload')
    r2=run(db,MD,command_sql('agenda',{'agenda':'stale'},v)); assert '40001' not in r2.stderr
    assert settings(db,M4)['meetingAgenda']=='1. Review Reports'
    assert value(db,f"count(*) FROM taskpulse_private.audit_events WHERE command='company_settings_agenda' AND row_id='{A}'")=='1'
    assert value(db,f"organization_id FROM taskpulse_private.audit_events WHERE command='company_settings_agenda'")==A
    save(db,B_DIR,'agenda',{'agenda':'Beta agenda'})
    assert settings(db,B_DIR)['meetingAgenda']=='Beta agenda' and settings(db,MD)['meetingAgenda']=='1. Review Reports'
    print('PASS',db,'only an active director writes; stale versions and reused operations raise PT409 (never 40001); replay is idempotent; audited per company')

    # ---- section validation -------------------------------------------------------------------------------
    cur=lambda:settings(db,MD)['version']
    save(db,MD,'categories',{'overrides':{'PJT':{'label':'Project Task','sort':0},'MKT':{'active':False},'T':{'label':' General ','active':True,'sort':3}}})
    assert settings(db,M4)['categoryOverrides']=={'PJT':{'label':'Project Task','sort':0},'MKT':{'active':False},'T':{'label':'General','active':True,'sort':3}}
    expect_code(db,MD,command_sql('categories',{'overrides':{'XX':{'label':'Nope'}}},cur()),'23514','Unknown mission type')
    expect_code(db,MD,command_sql('categories',{'overrides':{'T':{'label':''}}},cur()),'23514')
    expect_code(db,MD,command_sql('categories',{'overrides':{'T':{'colour':'red'}}},cur()),'23514')
    allOff={c:{'active':False} for c in ('SD','WK','T','PJT','RSC','QAC','MKT','ACC','ITH','OFM','MG','AD','OT')}
    expect_code(db,MD,command_sql('categories',{'overrides':allOff},cur()),'23514','At least one')
    swapped=[{**m} for m in settings(db,MD)['meetingTypes']]
    swapped[0]['prefix'],swapped[1]['prefix']=swapped[1]['prefix'],swapped[0]['prefix']
    swapped[7]['active']=False
    save(db,MD,'meeting_types',{'types':swapped})
    after=settings(db,M4)['meetingTypes']
    assert [m['id'] for m in after]==[m['id'] for m in swapped] and after[0]['prefix']=='WL' and after[7]['active'] is False,'ids kept; prefixes swapped in one save'
    expect_code(db,MD,command_sql('meeting_types',{'types':[{'prefix':'DL','name':'Daily'},{'prefix':'DL','name':'Other'}]},cur()),'23505')
    expect_code(db,MD,command_sql('meeting_types',{'types':[{'prefix':'dl','name':'Daily'}]},cur()),'23514')
    missions=settings(db,MD)['standingMissions']
    missions[3]['ownerId']=MD
    save(db,MD,'standing_missions',{'missions':missions})
    assert settings(db,PE)['standingMissions'][3]['ownerId']==MD
    bad=[{**missions[0],'titlePattern':'Off Hours {week}'}]
    expect_code(db,MD,command_sql('standing_missions',{'missions':bad},cur()),'23514','placeholders')
    expect_code(db,MD,command_sql('standing_missions',{'missions':[{**missions[3],'ownerId':B4}]},cur()),'23514','active member of your company')
    expect_code(db,MD,command_sql('standing_missions',{'missions':[{**missions[0],'ownerId':M4}]},cur()),'23514')
    print('PASS',db,'mission types, meeting types (swap in one save) and standing missions validate and save; foreign owners refused')

    # ---- tag allocator ------------------------------------------------------------------------------------
    today=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    mon=value(db,f"to_char('{today}'::date,'Mon')||to_char('{today}'::date,'YY')")
    # A typed tag that takes number 1 this month is skipped, and the number runs across prefixes.
    create_task(db,MD,{'task_tag':f'{mon}_T1','title':'typed','category':'T','priority':'Medium'})
    _,t2=create_task(db,MD,{'title':'blank tag','category':'T','priority':'Medium'})
    _,t3=create_task(db,MD,{'task_tag':'  ','title':'space tag','category':'PJT','priority':'Medium'})
    assert (t2,t3)==(f'{mon}_T2',f'{mon}_PJT3'),(t2,t3)
    tid,_=create_task(db,MD,{'title':'edit me','category':'OT','priority':'No'})
    v=value(db,f"participant_version||'/'||lifecycle_version FROM public.tasks WHERE id='{tid}'").split('/')
    q=("SELECT public.save_task_with_participants("+literal(tid)+","+literal(json.dumps({'task_tag':'','title':'edit me','category':'OT','priority':'No','expected_lifecycle_version':int(v[1])}))
       +"::jsonb,ARRAY["+literal(M4)+"]::uuid[],ARRAY[]::uuid[],NULL,"+v[0]+",false,"+literal(uuid4())+")")
    expect_code(db,MD,q,'23514','Nonblank identity')
    expect_code(db,M4,"SELECT taskpulse_private.allocate_task_tag("+literal(A)+",current_date,'T')",'42501')
    # Company B numbers its own month independently.
    _,bt=create_task(db,B_DIR,{'title':'beta blank','category':'T','priority':'Medium'},assignee=B4)
    assert bt==f'{mon}_T1',bt
    # Task Tools copies take sheet tags (support skill copies use SD).
    src=new_task(db,'tools-source')
    p=preview(db,'duplicate',{'sourceTaskId':src,'startDate':today})
    assert p['ready'] and TAG.match(p['items'][0]['taskTag']) and p['items'][0]['taskTag'].startswith(mon+'_T'),p['items']
    copied=commit(db,p)['items'][0]['taskId']
    assert value(db,f"task_tag FROM public.tasks WHERE id='{copied}'")==p['items'][0]['taskTag']
    w=preview(db,'weekly',{'sourceTaskId':src,'startDate':today,'count':2})
    assert all(TAG.match(i['taskTag']) for i in w['items']) and len({i['taskTag'] for i in w['items']})==2
    sp=preview(db,'support',{'sourceTaskId':src,'supportKind':'skill','splitMode':'split-even','assigneeId':M4,'reason':'Skill support copy','startDate':today})
    assert sp['ready'] and sp['items'][0]['taskTag'].startswith(mon+'_SD'),sp
    print('PASS',db,f'allocator: {t2}, {t3} (running number per company per month, typed tags skipped); company B starts at {bt}; Tools copies use sheet tags')

    # Concurrency: 40 parallel allocations, 8 parallel blank-tag creates, all distinct and gap-free in order.
    nxt=value(db,"(date_trunc('month',clock_timestamp() AT TIME ZONE 'Asia/Kolkata')+interval '2 month')::date")
    nmon=value(db,f"to_char('{nxt}'::date,'Mon')||to_char('{nxt}'::date,'YY')")
    with ThreadPoolExecutor(max_workers=12) as pool:
        tags=list(pool.map(lambda i:value(db,f"taskpulse_private.allocate_task_tag('{A}','{nxt}','{('T','PJT','AD')[i%3]}')"),range(40)))
    assert len(set(tags))==40 and sorted(int(re.search(r'(\d+)$',t).group(1)) for t in tags)==list(range(1,41)),tags
    assert all(t.startswith(nmon+'_') for t in tags)
    assert value(db,f"last_number FROM taskpulse_private.task_tag_counters WHERE organization_id='{A}' AND period_start='{nxt}'")=='40'
    with ThreadPoolExecutor(max_workers=8) as pool:
        made=list(pool.map(lambda i:create_task(db,MD,{'title':f'race {i}','category':'T','priority':'Medium'})[1],range(8)))
    assert len(set(made))==8 and all(m.startswith(mon+'_T') for m in made),made
    assert value(db,'(SELECT count(*)=count(DISTINCT (organization_id,task_tag)) FROM public.tasks)')=='t'
    print('PASS',db,'40 concurrent allocations and 8 concurrent blank-tag creates get distinct tags')

    # ---- holiday default ----------------------------------------------------------------------------------
    d=lambda n:value(db,f"('{today}'::date-{n})::date")
    base={'attendance_hours':0,'off_hours':0}
    r=attendance(db,M4,{**base,'business_date':d(3)},success=False)
    assert r.returncode and 'Attendance status required' in r.stderr,'no calendar: a missing status is still refused'
    holidays=lambda uid,frm:first_json(ok(db,uid,f"SELECT to_jsonb(public.team_holiday_dates('{frm}','{today}'))"))
    assert holidays(M4,d(5))==[]
    save(db,MD,'holidays',{'holidays':[{'date':d(3),'name':'Ayudha Pooja'},{'date':d(2),'name':'Vijayadashami'}]})
    assert settings(db,M5)['holidays']==[{'date':d(3),'name':'Ayudha Pooja'},{'date':d(2),'name':'Vijayadashami'}]
    attendance(db,M4,{**base,'business_date':d(3)})
    assert value(db,f"status||'/'||holiday_name||'/'||attendance_hours FROM public.attendance_records WHERE user_id='{M4}' AND attendance_date='{d(3)}'")=='Holiday/Ayudha Pooja/0'
    attendance(db,M5,{'off_hours':2,'business_date':d(3),'holiday_name':'Own name'})
    assert value(db,f"status||'/'||holiday_name||'/'||off_hours FROM public.attendance_records WHERE user_id='{M5}' AND attendance_date='{d(3)}'")=='Holiday/Own name/2'
    attendance(db,U(6),{'attendance_hours':None,'off_hours':0,'business_date':d(3),'attendance_status':''})
    assert value(db,f"status||'/'||attendance_hours FROM public.attendance_records WHERE user_id='{U(6)}' AND attendance_date='{d(3)}'")=='Holiday/0','JSON null hours and a blank status default too'
    attendance(db,M4,{'attendance_hours':8,'off_hours':0,'business_date':d(2),'attendance_status':'Present'})
    assert value(db,f"status FROM public.attendance_records WHERE user_id='{M4}' AND attendance_date='{d(2)}'")=='Present','recorded attendance stays the truth'
    r=attendance(db,M4,{**base,'business_date':d(1)},success=False)
    assert r.returncode and 'Attendance status required' in r.stderr,'a non-calendar date still needs a status'
    r=attendance(db,B4,{**base,'business_date':d(3)},success=False)
    assert r.returncode and 'Attendance status required' in r.stderr,"company A's calendar does not default company B"
    assert holidays(M4,d(5))==[d(3),d(2)]
    assert holidays(B4,d(5))==[]
    # A service-role worker scoped by the company header (policies worker, 56) reads its company's dates only.
    def worker(org):
        r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],
            input="BEGIN; SET LOCAL ROLE service_role; SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',true);"
                  +("" if org is None else f"SELECT set_config('request.headers','{{\"x-taskpulse-organization\":\"{org}\"}}',true);")
                  +f"\nSELECT to_jsonb(public.team_holiday_dates('{d(5)}','{today}'));\nCOMMIT;",text=True,capture_output=True,encoding='utf-8')
        return r
    r=worker(A); assert r.returncode==0 and json.loads([x for x in r.stdout.splitlines() if x.startswith("[")][-1])==[d(3),d(2)],r.stderr[:300]
    r=worker(B); assert r.returncode==0 and json.loads([x for x in r.stdout.splitlines() if x.startswith("[")][-1])==[],r.stderr[:300]
    r=worker(None); assert r.returncode and '42501' in r.stderr,'an unscoped worker is refused'
    expect_code(db,None,f"SELECT public.team_holiday_dates('{d(5)}','{today}')",'42501')
    expect_code(db,MD,command_sql('holidays',{'holidays':[{'date':d(3),'name':'A'},{'date':d(3),'name':'B'}]},cur()),'23505')
    expect_code(db,MD,command_sql('holidays',{'holidays':[{'date':'2026-02-30','name':'A'}]},cur()),'23514')
    save(db,MD,'holidays',{'holidays':[]})
    r=attendance(db,M4,{**base,'business_date':d(4)},success=False)
    assert r.returncode and 'Attendance status required' in r.stderr,'an emptied calendar stops defaulting'
    assert value(db,f"count(*) FROM public.attendance_records WHERE attendance_date='{d(3)}' AND status='Holiday'")=='3','saved records are not rewritten'
    print('PASS',db,'holiday default only on calendar dates of the caller\'s company; explicit status wins; team_holiday_dates adds calendar dates')

    # The derived rule still applies without a calendar date.
    for uid in [x for x in value(db,"string_agg(id::text,',') FROM public.users WHERE is_active AND organization_id='"+A+"'").split(',')]:
        sql(db,"BEGIN; SELECT set_config('request.jwt.claim.sub','"+uid+"',true);"+f"INSERT INTO public.attendance_records(user_id,attendance_date,status) VALUES('{uid}','{d(6)}','Holiday') ON CONFLICT DO NOTHING; COMMIT;")
    assert d(6) in holidays(M4,d(7))
    print('PASS',db,'the derived everyone-on-Holiday rule still marks dates')
print('ALL PASS')
