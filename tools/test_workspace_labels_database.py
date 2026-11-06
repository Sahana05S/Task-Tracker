"""Workspace labels, migration 112: public.labels and public.label_links, label_command, label_link_command,
label_catalogue, labels_for and labelled. Fresh install 01-latest and upgrade (seeded before 112), no direct table
access, managers manage labels, rename keeps the id and every link, who may label a mission / learning note /
meeting point, archived labels, idempotent replay, labelled() returns only readable subjects, and company
separation. Disposable PostgreSQL; JWT shim only; no hosted connection."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_labels_fresh_test','taskpulse_labels_upgrade_test')
U=lambda n:'00000000-0000-0000-0000-'+str(n).zfill(12)
MD,PE,DM,M4,M5,M6,INACTIVE=U(1),U(2),U(3),U(4),U(5),U(6),U(7)
B_DIR='00000000-0000-0000-0000-0000000000b1'
T1,T2='10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002'
MP1,MP2='50000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002'
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
def label_sql(op,label=None,name=None,colour=None,description=None,operation=None):
    return f"SELECT public.label_command('{op}',{q(label)},{q(name)},{q(colour)},{q(description)},'{operation or uuid4()}')"
def link_sql(op,kind,subject,label=None,name=None,operation=None):
    return f"SELECT public.label_link_command('{op}','{kind}','{subject}',{q(label)},{q(name)},'{operation or uuid4()}')"
def create(db,uid,name,**kw):return json.loads(ok(db,uid,label_sql('create',name=name,**kw)))
def labels_for(db,uid,kind,ids):return json.loads(ok(db,uid,f"SELECT public.labels_for('{kind}',ARRAY[{','.join(repr(i) for i in ids)}]::uuid[])"))
def labelled(db,uid,slug):return json.loads(ok(db,uid,f"SELECT public.labelled({literal(slug)})"))
def links(db):return value(db,'count(*) FROM public.label_links')

assert LATEST>=112
for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    # The note cases run up to 128; 129 removes notes and the starter hashtags (checked at the end).
    every=[int(m.name.split('_')[0]) for m in MIGRATIONS if int(m.name.split('_')[0])<=128]
    later=[int(m.name.split('_')[0]) for m in MIGRATIONS if int(m.name.split('_')[0])>128]
    if db==DBS[1]:
        migrate(db,[n for n in every if n<112]); sql(db,seed)
        migrate(db,[n for n in every if n>=112])
        # Migration 126 adds the 26 starter hashtags to a company that has members.
        assert value(db,'count(*) FROM public.labels')==('26' if LATEST>=126 else '0')
        print('PASS',db,'upgrade to 112 starts with no labels of its own')
    else:
        migrate(db,every); sql(db,seed)
        print('PASS',db,f'fresh install 01-{LATEST} including 112')
    sql(db,f"""INSERT INTO public.meeting_points(id,meeting_date,posted_by,point) VALUES
      ('{MP1}','2026-11-02','{M5}','Crane booking slipped'),('{MP2}','2026-11-02','{M6}','Withdrawn point');
      UPDATE public.meeting_points SET validation_state='withdrawn' WHERE id='{MP2}';""")

    # ---- ownership and grants ---------------------------------------------------------------------------------
    assert value(db,"taskpulse_private.m15_secure()")=='0 tables and 0 functions moved to taskpulse_definer'
    for table in ('labels','label_links'):
        assert value(db,f"pg_get_userbyid(relowner)||relforcerowsecurity FROM pg_class WHERE oid='public.{table}'::regclass")=='taskpulse_definertrue'
        expect_code(db,MD,f'SELECT count(*) FROM public.{table}','42501')
    print('PASS',db,'both tables are definer-owned with FORCE RLS and no direct access')

    # ---- managing labels --------------------------------------------------------------------------------------
    for uid in (DM,M4,INACTIVE):expect_code(db,uid,label_sql('create',name='Site safety'),'42501')
    expect_code(db,None,label_sql('create',name='Site safety'),'42501')
    op=uuid4()
    safety=create(db,PE,'  #Site   Safety ',colour='attention',operation=op)
    assert (safety['name'],safety['slug'],safety['colour'],safety['archived'])==('Site Safety','site-safety','attention',False)
    assert create(db,PE,'  #Site   Safety ',colour='attention',operation=op)==safety,'replay returns the receipt'
    expect_code(db,PE,label_sql('create',name='Other',operation=op),'PT409')
    expect_code(db,MD,label_sql('create',name='site safety'),'23505')
    for bad in (dict(name='   '),dict(name='###'),dict(name='x'*41),dict(name='Ok',colour='#ff0000'),dict(name='Ok2',description='x'*301)):
        expect_code(db,MD,label_sql('create',**bad),'23514')
    crane=create(db,MD,'Crane')
    print('PASS',db,'the director and project engineers create labels; slug, colour and name rules hold; replay and duplicates')

    # ---- linking ----------------------------------------------------------------------------------------------
    ok(db,M4,link_sql('attach','task',T1,label=safety['id']))
    ok(db,M4,link_sql('attach','task',T1,label=safety['id']))  # attaching twice keeps one link
    expect_code(db,M5,link_sql('attach','task',T1,label=safety['id']),'42501')
    expect_code(db,DM,link_sql('attach','task',T1,label=safety['id']),'42501')
    ok(db,PE,link_sql('attach','task',T2,name='#crane'))
    expect_code(db,M4,link_sql('attach','task',T1,name='Brand new'),'42501')
    created=json.loads(ok(db,MD,link_sql('attach','task',T1,name='#Brand new')))
    assert created['slug']=='brand-new'
    note=json.loads(ok(db,M4,f"SELECT public.mission_learning_command('add','{T1}',NULL,'learning','Book the crane early','{uuid4()}')"))['id']
    ok(db,M4,link_sql('attach','mission_learning',note,label=crane['id']))
    expect_code(db,M6,link_sql('attach','mission_learning',note,label=crane['id']),'42501')  # T1's reviewer reads the note but does not edit it
    ok(db,M5,link_sql('attach','meeting_point',MP1,label=crane['id']))
    expect_code(db,M4,link_sql('attach','meeting_point',MP1,label=safety['id']),'42501')
    ok(db,DM,link_sql('attach','meeting_point',MP1,label=safety['id']))
    expect_code(db,MD,link_sql('attach','meeting_point',MP2,label=safety['id']),'P0002')
    expect_code(db,MD,link_sql('attach','task',str(uuid4()),label=safety['id']),'P0002')
    expect_code(db,MD,link_sql('attach','sale',T1,label=safety['id']),'23514')
    assert links(db)==('7' if LATEST>=126 else '6')  # 126: the note also carries #learning
    got=labels_for(db,M6,'task',[T1,T2])
    # 127: a mission also carries its notes' hashtags (#crane and #learning on T1's note), for those who may read the note.
    noted=['brand-new','crane','learning','site-safety'] if LATEST>=127 else ['brand-new','site-safety']
    assert sorted(l['slug'] for l in got[T1])==noted and [l['slug'] for l in got[T2]]==['crane'],got
    assert sorted(l['slug'] for l in labels_for(db,M5,'task',[T1])[T1])==['brand-new','site-safety'],'M5 may not read T1\'s notes'
    print('PASS',db,'assignees, managers, data managers (meeting points) and authors label what they may edit; others are refused')

    # ---- rename keeps the id and every link ---------------------------------------------------------------------
    renamed=json.loads(ok(db,PE,label_sql('rename',label=safety['id'],name='Safety first',colour='danger')))
    assert renamed['id']==safety['id'] and renamed['slug']=='safety-first' and renamed['colour']=='danger'
    assert value(db,f"count(*) FROM public.label_links WHERE label_id='{safety['id']}'")=='2'
    assert [l['name'] for l in labels_for(db,M4,'task',[T1])[T1] if l['id']==safety['id']]==['Safety first']
    expect_code(db,PE,label_sql('rename',label=safety['id'],name='Crane'),'23505')
    expect_code(db,M4,label_sql('rename',label=safety['id'],name='Mine'),'42501')
    print('PASS',db,'rename keeps the id, so both links follow the new name; a clash or a member is refused')

    # ---- labelled returns only readable subjects -----------------------------------------------------------------
    items=labelled(db,M6,'crane')['items']
    assert sorted(i['kind'] for i in items)==['meeting_point','mission_learning','task'],items
    # Migration 117: a learning note is listed only to those who may read its mission (M5 is not on T1).
    assert sorted(i['kind'] for i in labelled(db,M5,'crane')['items'])==['meeting_point','task']
    ok(db,M4,f"SELECT public.mission_learning_command('withdraw','{T1}','{note}',NULL,NULL,'{uuid4()}')")
    assert sorted(i['kind'] for i in labelled(db,M5,'crane')['items'])==['meeting_point','task']
    assert note not in labels_for(db,MD,'mission_learning',[note])
    assert 'crane' not in [l['slug'] for l in labels_for(db,M4,'task',[T1])[T1]],'a withdrawn note no longer labels its mission'
    sql(db,f"UPDATE public.meeting_points SET validation_state='withdrawn' WHERE id='{MP1}'")
    assert [i['kind'] for i in labelled(db,M5,'crane')['items']]==['task']
    sql(db,f"UPDATE public.meeting_points SET validation_state='pending' WHERE id='{MP1}'")
    expect_code(db,M5,"SELECT public.labelled('no-such-label')",'P0002')
    cat=json.loads(ok(db,M6,'SELECT public.label_catalogue()'))
    own={l['slug']:l['uses'] for l in cat['labels'] if not l['description'] or l['slug'] in ('brand-new','crane','safety-first')}
    assert cat['canManage'] is False and own=={'brand-new':1,'crane':2,'safety-first':2},own
    assert json.loads(ok(db,PE,'SELECT public.label_catalogue()'))['canManage'] is True
    print('PASS',db,'labelled() and labels_for() leave out withdrawn notes and meeting points; the catalogue counts readable uses')

    # ---- archive ------------------------------------------------------------------------------------------------------
    ok(db,MD,label_sql('archive',label=created['id']))
    assert labels_for(db,M4,'task',[T1])[T1][0]['slug']=='safety-first' and len(labels_for(db,M4,'task',[T1])[T1])==1
    expect_code(db,MD,link_sql('attach','task',T2,label=created['id']),'23514')
    ok(db,MD,link_sql('detach','task',T1,label=created['id']))
    ok(db,MD,label_sql('restore',label=created['id']))
    assert not json.loads(ok(db,M4,'SELECT public.label_catalogue()'))['labels'][0]['archived']
    ok(db,M4,link_sql('detach','task',T1,label=safety['id']))
    assert T1 not in labels_for(db,M4,'task',[T1])
    print('PASS',db,'archived labels are hidden and cannot be attached; detach and restore work')

    # ---- activity (migration 116) -------------------------------------------------------------------------------------
    if LATEST>=116:
        today=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
        audits=lambda cmd:int(value(db,f"count(*) FROM taskpulse_private.audit_events WHERE command='{cmd}'"))
        def feed(uid,action):
            return int(ok(db,uid,f"SELECT count(*) FROM public.activity_feed('{today}','{today}') f WHERE f.action='{action}' AND f.task_id='{T1}'"))
        attached,detached=audits('label_link_attach'),audits('label_link_detach')
        key=str(uuid4())
        ok(db,MD,link_sql('attach','task',T1,label=crane['id'],operation=key))
        ok(db,MD,link_sql('attach','task',T1,label=crane['id'],operation=key))   # replay: the receipt answers
        ok(db,MD,link_sql('attach','task',T1,label=crane['id']))                 # already linked: nothing changes
        assert audits('label_link_attach')==attached+1,'one audit row per link actually added'
        row=json.loads(value(db,"protected_changes FROM taskpulse_private.audit_events WHERE command='label_link_attach' ORDER BY id DESC LIMIT 1"))
        assert row['task_id']['after']==T1 and row['subject_kind']=='task' and row['reason']=='#Crane',row
        assert feed(MD,'label_link_attach')>=1,'the director sees the line'
        assert feed(M4,'label_link_attach')>=1,"the mission's assignee sees the line"
        assert feed(DM,'label_link_attach')==0,'a member with no part in the mission does not'
        assert int(ok(db,MD,f"SELECT count(*) FROM public.activity_feed('{today}','{today}') f WHERE f.action='label_create' AND f.reason LIKE '#%'"))>=1
        ok(db,MD,link_sql('detach','task',T1,label=crane['id']))
        ok(db,MD,link_sql('detach','task',T1,label=crane['id']))                 # already gone: nothing changes
        assert audits('label_link_detach')==detached+1
        print('PASS',db,'label changes reach Team > Activity: one line per real change, named, shown to the mission\'s people only')

    # ---- company separation ----------------------------------------------------------------------------------------------
    sql(db,"INSERT INTO public.organizations(name,slug) VALUES('Beta Builders','beta')")
    B=value(db,"id FROM public.organizations WHERE slug='beta'")
    sql(db,f"""INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
      ('{B_DIR}','bdir@beta.test','{{"employee_id":"BETA-1"}}','{{"organization_id":"{B}"}}')""")
    sql(db,f"UPDATE public.users SET role='managing_director' WHERE id='{B_DIR}'")
    assert json.loads(ok(db,B_DIR,'SELECT public.label_catalogue()'))['labels']==[]
    expect_code(db,B_DIR,"SELECT public.labelled('crane')",'P0002')
    assert labels_for(db,B_DIR,'task',[T2])=={}
    before=links(db)
    expect_code(db,B_DIR,link_sql('attach','task',T2,label=crane['id']),'P0002')
    expect_code(db,B_DIR,label_sql('rename',label=crane['id'],name='Taken'),'P0002')
    beta_crane=create(db,B_DIR,'Crane')
    assert beta_crane['slug']=='crane' and beta_crane['id']!=crane['id'],'the same slug is free in another company'
    assert links(db)==before
    print('PASS',db,"company B sees none of company A's labels or links, cannot change them, and has its own 'crane'")

    if later:
        own=labels_for(db,MD,'task',[T1,T2])
        migrate(db,later)
        # 129: a mission's labels are its own again; notes, their links and the starter hashtags are gone.
        assert labels_for(db,MD,'task',[T1,T2])==own
        assert value(db,"count(*) FROM public.labels WHERE slug IN ('mistake','learning','client')")=='0'
        assert value(db,"count(*) FROM public.labels WHERE slug='crane'")=='2','both companies keep their own #crane'
        assert value(db,"count(*) FROM public.label_links WHERE subject_kind='mission_learning'")=='0'
        print('PASS',db,"129: labels made by the companies stay with their links; starter hashtags and note links are gone")
