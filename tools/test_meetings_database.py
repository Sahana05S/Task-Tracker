"""Meetings, migration 136: public.meetings, meeting_members, meeting_missions and meeting_points.meeting_id,
meeting_command, meeting_point_command, meetings_list and meeting_detail. Fresh install 01-latest and upgrade (old
meeting points seeded before 136 are grouped into meetings and made private). Members and the managing director read a
meeting, its points, their labels, Team > Activity lines and record history; everyone else (Managers included) reads
nothing. Member add/remove rules, minutes version conflicts, idempotent replay and company separation.
Disposable PostgreSQL; JWT shim only; no hosted connection."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_meetings_fresh_test','taskpulse_meetings_upgrade_test')
U=lambda n:'00000000-0000-0000-0000-'+str(n).zfill(12)
MD,PE,DM,M4,M5,M6,INACTIVE,M8=U(1),U(2),U(3),U(4),U(5),U(6),U(7),U(8)
B_DIR='00000000-0000-0000-0000-0000000000b1'
T1,T2='10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002'
LP=['60000000-0000-0000-0000-00000000000'+str(i) for i in range(1,5)]
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
def meeting_sql(op,meeting=None,payload=None,version=None,operation=None):
    return (f"SELECT public.meeting_command('{op}',{q(meeting)}::uuid,{literal(json.dumps(payload or {}))}::jsonb,"
            f"{'NULL' if version is None else version},'{operation or uuid4()}')")
def point_sql(op,meeting,point=None,payload=None,version=None,operation=None):
    return (f"SELECT public.meeting_point_command('{op}','{meeting}',{q(point)}::uuid,{literal(json.dumps(payload or {}))}::jsonb,"
            f"{'NULL' if version is None else version},'{operation or uuid4()}')")
def meeting(db,uid,op,meeting=None,payload=None,version=None,operation=None):
    return json.loads(ok(db,uid,meeting_sql(op,meeting,payload,version,operation)))
def point(db,uid,op,meeting,point=None,payload=None,version=None,operation=None):
    return json.loads(ok(db,uid,point_sql(op,meeting,point,payload,version,operation)))
def listed(db,uid,task=None):
    return json.loads(ok(db,uid,f"SELECT public.meetings_list(NULL,NULL,{q(task)}::uuid)"))
def detail(db,uid,mid):return json.loads(ok(db,uid,f"SELECT public.meeting_detail('{mid}')"))
def visible_points(db,uid,mid):
    return int(ok(db,uid,f"SELECT count(*) FROM public.meeting_points WHERE meeting_id='{mid}'"))

assert LATEST>=136
for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    numbers=[int(m.name.split('_')[0]) for m in MIGRATIONS]
    if db==DBS[1]:
        migrate(db,[n for n in numbers if n<136]); sql(db,seed)
        sql(db,f"""INSERT INTO public.meeting_points(id,meeting_date,meeting_type,posted_by,owner_id,point,created_at) VALUES
          ('{LP[0]}','2026-10-01','Project Progress','{M4}','{M5}','Crane booking slipped','2026-10-01 10:00+05:30'),
          ('{LP[1]}','2026-10-01','Project Progress','{M6}',NULL,'Drawings late','2026-10-01 10:05+05:30'),
          ('{LP[2]}','2026-10-01',NULL,NULL,NULL,'Unattributed sheet row','2026-10-01 11:00+05:30'),
          ('{LP[3]}','2026-10-02','Weekly meeting','{M4}',NULL,'Withdrawn point','2026-10-02 09:00+05:30');
          UPDATE public.meeting_points SET validation_state='withdrawn' WHERE id='{LP[3]}';""")
        migrate(db,[n for n in numbers if n>=136])
        groups=json.loads(value(db,"""jsonb_agg(jsonb_build_object('title',m.title,'state',m.record_state,'creator',m.created_by,
          'points',(SELECT jsonb_agg(p.id ORDER BY p.id) FROM public.meeting_points p WHERE p.meeting_id=m.id),
          'members',(SELECT coalesce(jsonb_agg(x.user_id ORDER BY x.user_id),'[]') FROM public.meeting_members x WHERE x.meeting_id=m.id)) ORDER BY m.title)
          FROM public.meetings m"""))
        assert groups==[
            {'title':'Meeting','state':'active','creator':None,'points':[LP[2]],'members':[]},
            {'title':'Project Progress meeting','state':'active','creator':M4,'points':[LP[0],LP[1]],'members':[M4,M5,M6]},
            {'title':'Weekly meeting','state':'withdrawn','creator':M4,'points':[LP[3]],'members':[M4]}],groups
        assert value(db,f"validation_state FROM public.meeting_points WHERE id='{LP[3]}'")=='withdrawn'
        assert value(db,"count(*) FROM public.meeting_points WHERE meeting_id IS NULL")=='0'
        old=value(db,"id FROM public.meetings WHERE title='Project Progress meeting'")
        assert [m['id'] for m in listed(db,M5)]==[old] and listed(db,DM)==[] and listed(db,PE)==[]
        assert visible_points(db,M6,old)==2 and visible_points(db,PE,old)==0 and visible_points(db,DM,old)==0
        assert len(listed(db,MD))==2,'the director reads every active meeting, including the one with no members'
        print('PASS',db,'upgrade: old points grouped by date and type into private meetings of their authors and resolvers')
    else:
        migrate(db,numbers); sql(db,seed)
        print('PASS',db,f'fresh install 01-{LATEST} including 136')

    # ---- no direct access ----------------------------------------------------------------------------------------
    for table in ('meetings','meeting_members','meeting_missions'):
        assert value(db,f"pg_get_userbyid(relowner)||relforcerowsecurity FROM pg_class WHERE oid='public.{table}'::regclass")=='taskpulse_definertrue'
        expect_code(db,MD,f'SELECT count(*) FROM public.{table}','42501')
    expect_code(db,M4,f"INSERT INTO public.meeting_points(meeting_id,point) SELECT id,'x' FROM public.meetings LIMIT 1",'42501')
    for uid in (INACTIVE,None):expect_code(db,uid,meeting_sql('create',payload={'title':'X','meeting_date':'2026-11-01'}),'42501')
    print('PASS',db,'tables are definer-owned with FORCE RLS; no direct writes; inactive and anonymous callers refused')

    # ---- create and read ------------------------------------------------------------------------------------------
    agenda=value(db,"coalesce((SELECT meeting_agenda FROM taskpulse_private.organization_settings LIMIT 1),'')")
    op=uuid4()
    created=meeting(db,M4,'create',payload={'title':'  Site   review ','meeting_date':'2026-11-05','start_time':'10:30',
        'meeting_type':'Project Progress','members':[M5],'missions':[T1]},operation=op)
    assert meeting(db,M4,'create',payload={'title':'  Site   review ','meeting_date':'2026-11-05','start_time':'10:30',
        'meeting_type':'Project Progress','members':[M5],'missions':[T1]},operation=op)==created,'replay returns the receipt'
    expect_code(db,M4,meeting_sql('create',payload={'title':'Other','meeting_date':'2026-11-05'},operation=op),'PT409')
    mid=created['id']
    d=detail(db,M5,mid)
    assert (d['title'],d['date'],d['startTime'],d['meetingType'],d['minutes'],d['version'])==('Site review','2026-11-05','10:30','Project Progress',agenda,1),d
    assert sorted(m['id'] for m in d['members'])==sorted([M4,M5]) and [m['tag'] for m in d['missions']]==['T1']
    assert d['canEdit'] and not d['canManage'] and detail(db,M4,mid)['canManage'] and detail(db,MD,mid)['canManage']
    for uid in (M6,DM,PE,M8):
        expect_code(db,uid,f"SELECT public.meeting_detail('{mid}')",'P0002')
        assert mid not in [m['id'] for m in listed(db,uid)]
    assert mid in [m['id'] for m in listed(db,MD)]
    assert [m['id'] for m in listed(db,M5,T1)]==[mid] and listed(db,M5,T2)==[]
    for bad in ({'title':' ','meeting_date':'2026-11-05'},{'title':'x'*201,'meeting_date':'2026-11-05'},{'title':'X'},
                {'title':'X','meeting_date':'2099-01-01'},{'title':'X','meeting_date':'2026-11-05','start_time':'25'},
                {'title':'X','meeting_date':'2026-11-05','members':[INACTIVE]}):
        expect_code(db,M4,meeting_sql('create',payload=bad),'23514')
    expect_code(db,M4,meeting_sql('create',payload={'title':'X','meeting_date':'2026-11-05','missions':[str(uuid4())]}),'P0002')
    expect_code(db,M4,f"SELECT public.dated_record_command('meeting',NULL,'save','{{\"business_date\":\"2026-11-05\",\"content\":\"x\"}}'::jsonb,0,'{uuid4()}')",'23514')
    print('PASS',db,'create: members and missions; minutes start from the agenda; only members and the director read it; replay')

    # ---- points ---------------------------------------------------------------------------------------------------
    p1=point(db,M5,'add',mid,payload={'point':'Order rebar','owner_id':M8,'resolution_due':'2026-11-10','related_task_id':T1})
    assert sorted(m['id'] for m in detail(db,M8,mid)['members'])==sorted([M4,M5,M8]),'the person to resolve it joins'
    expect_code(db,M6,point_sql('add',mid,payload={'point':'Sneaky'}),'P0002')
    expect_code(db,PE,point_sql('add',mid,payload={'point':'Sneaky'}),'P0002')
    expect_code(db,M5,point_sql('add',mid,payload={'point':' '}),'23514')
    expect_code(db,M5,point_sql('add',mid,payload={'point':'x','point_type':'Gossip'}),'23514')
    done=point(db,M8,'set_status',mid,p1['id'],{'resolution_status':'Done'},version=p1['version'])
    row=detail(db,M4,mid)['points'][0]
    assert row['status']=='Done' and row['resolvedOn'] is not None and row['ownerId']==M8 and row['due']=='2026-11-10'
    expect_code(db,M4,point_sql('set_status',mid,p1['id'],{'resolution_status':'In Progress'},version=p1['version']),'PT409')
    again=point(db,M4,'edit',mid,p1['id'],{'point':'Order rebar today','resolution_status':'In Progress'},version=done['version'])
    row=detail(db,M4,mid)['points'][0]
    assert row['point']=='Order rebar today' and row['status']=='In Progress' and row['resolvedOn'] is None
    p2=point(db,M4,'add',mid,payload={'point':'Second point'})
    expect_code(db,M8,point_sql('withdraw',mid,p2['id'],version=p2['version']),'42501')
    point(db,M4,'withdraw',mid,p2['id'],version=p2['version'])
    assert [p['id'] for p in detail(db,M5,mid)['points']]==[p1['id']]
    assert visible_points(db,M5,mid)==2 and visible_points(db,M6,mid)==0 and visible_points(db,PE,mid)==0 and visible_points(db,MD,mid)==2
    assert detail(db,M5,mid)['openPoints']==1
    print('PASS',db,'points: members add, edit and set status (version-checked); the resolver joins; author/creator/director withdraw')

    # ---- labels -----------------------------------------------------------------------------------------------------
    crane=json.loads(ok(db,MD,f"SELECT public.label_command('create',NULL,'Crane',NULL,NULL,'{uuid4()}')"))
    link=lambda uid,subject:f"SELECT public.label_link_command('attach','meeting_point','{subject}','{crane['id']}',NULL,'{uuid4()}')"
    ok(db,M8,link(M8,p1['id']))
    expect_code(db,PE,link(PE,p1['id']),'P0002')
    expect_code(db,M6,link(M6,p1['id']),'P0002')
    lf=lambda uid:json.loads(ok(db,uid,f"SELECT public.labels_for('meeting_point',ARRAY['{p1['id']}']::uuid[])"))
    assert [l['slug'] for l in lf(M5)[p1['id']]]==['crane'] and lf(M6)=={} and lf(PE)=={}
    items=lambda uid:[i for i in json.loads(ok(db,uid,"SELECT public.labelled('crane')"))['items'] if i['kind']=='meeting_point']
    assert [i['meetingId'] for i in items(M5)]==[mid] and items(M6)==[] and items(PE)==[] and len(items(MD))==1
    assert detail(db,M5,mid)['labelIds']==[crane['id']]
    print('PASS',db,'labels on points: members label them; labels_for and labelled show them to members and the director only')

    # ---- history and activity ------------------------------------------------------------------------------------------
    hist=lambda uid:f"SELECT public.dated_record_history('meeting','{p1['id']}')"
    assert len(json.loads(ok(db,M8,hist(M8))))==3 and len(json.loads(ok(db,MD,hist(MD))))==3
    for uid in (PE,M6,DM):expect_code(db,uid,hist(uid),'42501')
    today=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    def lines(uid):
        return json.loads(ok(db,uid,f"""SELECT coalesce(jsonb_agg(jsonb_build_object('action',f.action,'kind',f.record_kind)),'[]')
          FROM public.activity_feed('{today}','{today}') f WHERE f.record_kind IN ('meeting','meetings')
           OR (f.record_kind='label_links' AND f.action='label_link_attach')"""))
    md_lines=lines(MD)
    assert {'action':'meeting_create','kind':'meetings'} in md_lines and {'action':'save','kind':'meeting'} in md_lines
    assert {'action':'label_link_attach','kind':'label_links'} in md_lines
    assert lines(PE)==[] and lines(M6)==[] and lines(DM)==[],'a Manager outside the meeting sees none of its lines'
    assert {'action':'save','kind':'meeting'} in lines(M5)
    assert not [a for a in value(db,"string_agg(protected_changes::text,' ') FROM taskpulse_private.audit_events WHERE table_name='meetings'").split() if 'Order rebar' in a]
    print('PASS',db,'record history and Team > Activity lines reach members and the director only')

    # ---- minutes ----------------------------------------------------------------------------------------------------
    v=detail(db,M4,mid)['version']
    key=uuid4()
    saved=meeting(db,M4,'save_minutes',mid,{'minutes':'1. Rebar\n2. Crane'},version=v,operation=key)
    assert saved['version']==v+1 and meeting(db,M4,'save_minutes',mid,{'minutes':'1. Rebar\n2. Crane'},version=v,operation=key)==saved
    expect_code(db,M5,meeting_sql('save_minutes',mid,{'minutes':'stale tab'},version=v),'PT409')
    meeting(db,M5,'save_minutes',mid,{'minutes':'merged'},version=v+1)
    assert detail(db,M8,mid)['minutes']=='merged' and detail(db,M8,mid)['minutesSavedBy']==M5
    expect_code(db,M6,meeting_sql('save_minutes',mid,{'minutes':'x'},version=v+2),'P0002')
    expect_code(db,M4,meeting_sql('save_minutes',mid,{'minutes':'x'*50001},version=v+2),'23514')
    assert 'merged' not in value(db,"string_agg(request::text,' ') FROM taskpulse_private.command_receipts WHERE command='meeting_save_minutes'")
    print('PASS',db,'minutes: version-checked saves, a stale save is refused (PT409), replay, members only, text kept out of receipts')

    # ---- edit -------------------------------------------------------------------------------------------------------
    meeting(db,M8,'edit',mid,{'title':'Site review 2','meeting_date':'2026-11-06','missions':[T1,T2]})
    d=detail(db,M4,mid)
    assert d['title']=='Site review 2' and d['date']=='2026-11-06' and [m['tag'] for m in d['missions']]==['T1','T2']
    assert value(db,f"string_agg(DISTINCT meeting_date::text,',') FROM public.meeting_points WHERE meeting_id='{mid}'")=='2026-11-06'
    expect_code(db,M4,meeting_sql('edit',mid,{'minutes':'no'}),'23514')
    expect_code(db,PE,meeting_sql('edit',mid,{'title':'Mine'}),'P0002')
    print('PASS',db,'edit: any member changes title, date and missions; the points follow the date; others refused')

    # ---- members ----------------------------------------------------------------------------------------------------
    meeting(db,M5,'add_member',mid,{'user_id':M6})
    assert mid in [m['id'] for m in listed(db,M6)] and visible_points(db,M6,mid)==2
    expect_code(db,M5,meeting_sql('remove_member',mid,{'user_id':M6}),'42501')
    expect_code(db,M5,meeting_sql('add_member',mid,{'user_id':INACTIVE}),'23514')
    meeting(db,M4,'remove_member',mid,{'user_id':M6})
    assert mid not in [m['id'] for m in listed(db,M6)] and visible_points(db,M6,mid)==0
    meeting(db,MD,'remove_member',mid,{'user_id':M8})
    expect_code(db,M4,meeting_sql('remove_member',mid,{'user_id':M6}),'P0002')
    solo=meeting(db,M5,'create',payload={'title':'Solo','meeting_date':'2026-11-05'})['id']
    expect_code(db,M5,meeting_sql('remove_member',solo,{'user_id':M5}),'23514')
    expect_code(db,MD,meeting_sql('remove_member',solo,{'user_id':M5}),'23514')
    print('PASS',db,'members: any member adds; the creator or the director removes; the last member stays')

    # ---- withdraw ---------------------------------------------------------------------------------------------------
    expect_code(db,M5,meeting_sql('withdraw',mid),'42501')
    meeting(db,M4,'withdraw',mid)
    assert mid not in [m['id'] for m in listed(db,M5)] and mid not in [m['id'] for m in listed(db,MD)]
    expect_code(db,M5,point_sql('add',mid,payload={'point':'late'}),'23514')
    expect_code(db,M4,meeting_sql('save_minutes',mid,{'minutes':'x'},version=detail(db,M4,mid)['version']),'23514')
    assert lf(M5)=={} and items(MD)==[],'labels of a withdrawn meeting are hidden'
    assert detail(db,M4,mid)['canEdit'] is False
    print('PASS',db,'withdraw: the creator or the director; a withdrawn meeting leaves the lists and refuses changes')

    # ---- company separation -----------------------------------------------------------------------------------------
    sql(db,"INSERT INTO public.organizations(name,slug) VALUES('Beta Builders','beta')")
    B=value(db,"id FROM public.organizations WHERE slug='beta'")
    sql(db,f"""INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
      ('{B_DIR}','bdir@beta.test','{{"employee_id":"BETA-1"}}','{{"organization_id":"{B}"}}')""")
    sql(db,f"UPDATE public.users SET role='managing_director' WHERE id='{B_DIR}'")
    assert listed(db,B_DIR)==[]
    expect_code(db,B_DIR,f"SELECT public.meeting_detail('{solo}')",'P0002')
    expect_code(db,B_DIR,meeting_sql('add_member',solo,{'user_id':B_DIR}),'P0002')
    expect_code(db,B_DIR,meeting_sql('create',payload={'title':'X','meeting_date':'2026-11-05','members':[M4]}),'23514')
    expect_code(db,B_DIR,meeting_sql('create',payload={'title':'X','meeting_date':'2026-11-05','missions':[T1]}),'P0002')
    assert visible_points(db,B_DIR,solo)==0
    print('PASS',db,"company B's director reads none of company A's meetings and cannot add A's people or missions")
