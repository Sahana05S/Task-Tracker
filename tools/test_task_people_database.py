"""Mission people (migration 108): Owner, Collaborators and Observers; disposable PostgreSQL only.

Where migration 117 is applied (the fresh database): only the managing director and the
mission's people read its checklist and work (a project engineer only when on it); the
managing director, owner and assignees choose observers; collaborators cannot mark it Done;
observers see but do not add or remove files.

A collaborator edits their own mission's checklist and details but not another's and
cannot log time; an observer cannot tick, review or log, and does not block Done;
managing director and project engineer parity is unchanged; the owner manages people;
a removed collaborator's next command fails; a dialog save keeps collaborators,
observers and custom shares. JWT shim only; no hosted connection.

Migration 121 (Mission Crew, 5 November 2026): the upgrade database runs the 108-120 flow
above at 120, then upgrades to 121: open missions with zero-share or unequal shares are
re-split equally under a new participant version (earlier versions kept), Done and
Discarded missions are untouched. The fresh database (every migration) runs the Crew flow:
a former collaborator logs time and marks Done; only the managing director and Managers
change the Crew; the Crew chooses observers; shares passed to a save are ignored.
"""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_people_fresh_test','taskpulse_people_upgrade_test')
TARGET=108
CREW=121
NUMBERS=sorted(int(p.name.split('_')[0]) for p in (ROOT/'supabase/migrations').glob('*.sql'))
assert TARGET in NUMBERS and CREW in NUMBERS,'migration 108 or 121 missing'
PREV=max(n for n in NUMBERS if n<TARGET)
BEFORE_CREW=max(n for n in NUMBERS if n<CREW)
U=lambda n:'00000000-0000-0000-0000-'+str(n).zfill(12)
MD,PE,OWNER,MATE,REVIEWER,OUTSIDER,COLLAB=U(1),U(2),U(4),U(5),U(6),U(3),U(8)
STRANGER=U(7)  # an active member with no tie to the mission (117 reads)

def migrate(db,upto,start=1):
    for m in sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0])):
        n=int(m.name.split('_')[0])
        if start<=n<=upto: sql(db,m.read_text(encoding='utf-8'))

def run(db,uid,statement):
    return subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],
        input=f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{uid}',true);\n{statement.rstrip(';')};\nCOMMIT;",
        text=True,capture_output=True,encoding='utf-8')
def ok(db,uid,statement):
    r=run(db,uid,statement)
    assert r.returncode==0,(statement[:200],r.stderr[:600])
    lines=[x for x in r.stdout.splitlines() if x and x not in ('BEGIN','SET','COMMIT',uid)]
    last=lines[-1] if lines else ''
    return json.loads(last) if last[:1] in '{[' else last
def refused(db,uid,statement,code='42501'):
    r=run(db,uid,statement)
    assert r.returncode and code in r.stderr,(statement[:200],code,r.stderr[:500])
    return r.stderr
def j(v):return literal(json.dumps(v))+'::jsonb'
def version(db,tid):return int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{tid}'"))
def people(db,uid,tid,command,user,key=None,ver=None):
    return f"SELECT public.task_people_command('{tid}','{command}',{j({'user_id':user})},{version(db,tid) if ver is None else ver},'{key or uuid4()}')"
def checklist(db,tid,command,payload):
    return f"SELECT public.checklist_command('{tid}','{command}',{j(payload)},{version(db,tid)},'{uuid4()}')"
def lifecycle(db,tid,command,payload):
    return f"SELECT public.task_lifecycle_command('{tid}','{command}',{j(payload)},{version(db,tid)},'{uuid4()}')"
def details(db,tid,payload):
    return f"SELECT public.task_details_command('{tid}','save',{j(payload)},{version(db,tid)},'{uuid4()}')"
def timer(tid):return f"SELECT public.start_task_timer('{tid}','{{}}'::jsonb,'{uuid4()}')"
def log(tid):
    return f"SELECT public.create_task_log('{tid}',{j({'log_date':value(DB,'(clock_timestamp() AT TIME ZONE '+literal('Asia/Kolkata')+')::date'),'hours_worked':1,'requested_delta':0})},'{uuid4()}')"
def save(db,tid,assignees,reviewers,shares=None):
    tag=value(db,f"task_tag FROM public.tasks WHERE id='{tid}'")
    pv=value(db,f"participant_version FROM public.tasks WHERE id='{tid}'")
    fields={'task_tag':tag,'title':'People','category':'T','priority':'Medium','expected_lifecycle_version':version(db,tid)}
    arr=lambda ids:'ARRAY['+','.join(literal(x) for x in ids)+']::uuid[]' if ids else "'{}'::uuid[]"
    units='NULL' if shares is None else 'ARRAY['+','.join(map(str,shares))+']::integer[]'
    return f"SELECT public.save_task_with_participants('{tid}',{j(fields)},{arr(assignees)},{arr(reviewers)},{units},{pv},false,'{uuid4()}')"
def rows(db,tid):
    return json.loads(value(db,f"taskpulse_private.task_people_snapshot('{tid}')"))
def new_mission(db,title,assignees,reviewers=(),shares=None):
    arr=lambda ids:'ARRAY['+','.join(literal(x) for x in ids)+']::uuid[]' if ids else "'{}'::uuid[]"
    units='NULL' if shares is None else 'ARRAY['+','.join(map(str,shares))+']::integer[]'
    return ok(db,MD,f"SELECT public.save_task_with_participants(NULL,{j({'title':title,'category':'T','priority':'Medium','task_scale':5,'initialize_details':False})},"
        f"{arr(assignees)},{arr(reviewers)},{units},NULL,false,'{uuid4()}')")
def shares_of(db,tid):return {a['user']:a['shares'] for a in rows(db,tid)['assignees']}
def pversion(db,tid):return int(value(db,f"participant_version FROM public.tasks WHERE id='{tid}'"))
def version_shares(db,tid,v):
    return json.loads(value(db,f"shares FROM taskpulse_private.participant_versions WHERE task_id='{tid}' AND version={v}"))

def crew_upgrade(db,tid):
    """120 -> 121: open missions re-split equally under a new participant version; closed ones untouched."""
    assert shares_of(db,tid)=={MATE:300000,OWNER:700000},shares_of(db,tid)
    zero=new_mission(db,'Zero share',[OWNER])
    ok(db,MD,people(db,MD,zero,'add_collaborator',COLLAB))
    assert shares_of(db,zero)=={OWNER:1000000,COLLAB:0}
    closed=new_mission(db,'Closed',[OWNER,MATE],shares=[700000,300000])
    sql(db,f"UPDATE public.tasks SET status='Done' WHERE id='{closed}'")
    equal=new_mission(db,'Equal',[OWNER,MATE])
    before={t:pversion(db,t) for t in (tid,zero,closed,equal)}
    closed_rows=value(db,f"md5(string_agg(to_jsonb(a)::text,'' ORDER BY user_id)) FROM public.task_assignees a WHERE task_id='{closed}'")
    history=json.loads(value(db,"coalesce(jsonb_agg(to_jsonb(v) ORDER BY task_id,version),'[]') FROM taskpulse_private.participant_versions v"))
    migrate(db,max(NUMBERS),start=CREW)
    assert shares_of(db,tid)=={MATE:500000,OWNER:500000},shares_of(db,tid)
    assert shares_of(db,zero)=={OWNER:500000,COLLAB:500000},shares_of(db,zero)
    assert shares_of(db,closed)=={OWNER:700000,MATE:300000},'a Done mission keeps its shares'
    assert value(db,f"md5(string_agg(to_jsonb(a)::text,'' ORDER BY user_id)) FROM public.task_assignees a WHERE task_id='{closed}'")==closed_rows
    assert shares_of(db,equal)=={OWNER:500000,MATE:500000}
    after={t:pversion(db,t) for t in (tid,zero,closed,equal)}
    assert after=={tid:before[tid]+1,zero:before[zero]+1,closed:before[closed],equal:before[equal]},(before,after)
    # Earlier versions (the credit history) are kept as recorded; the new split is a new version.
    now=json.loads(value(db,"coalesce(jsonb_agg(to_jsonb(v) ORDER BY task_id,version),'[]') FROM taskpulse_private.participant_versions v"))
    assert all(row in now for row in history),'every earlier participant version is kept unchanged'
    assert version_shares(db,tid,before[tid])=={MATE:300000,OWNER:700000}
    assert version_shares(db,tid,after[tid])=={MATE:500000,OWNER:500000}
    assert version_shares(db,zero,before[zero])=={OWNER:1000000,COLLAB:0}
    assert version_shares(db,zero,after[zero])=={OWNER:500000,COLLAB:500000}
    ok(db,COLLAB,log(zero))  # the former collaborator now logs time
    print('PASS',db,'121 re-splits open missions equally under a new participant version; Done missions and earlier versions unchanged')

def crew_flow(db):
    """Every migration applied: Mission Crew (121)."""
    tid=new_mission(db,'Crew',[OWNER,MATE],[REVIEWER],shares=[700000,300000])
    other=new_mission(db,'Other',[MATE])
    assert shares_of(db,tid)=={OWNER:500000,MATE:500000},'passed shares are ignored'
    # Only the managing director and Managers change the Crew; no owner power.
    refused(db,MATE,people(db,MATE,tid,'add_crew',COLLAB))
    refused(db,OWNER,people(db,OWNER,tid,'add_crew',COLLAB))
    refused(db,OWNER,people(db,OWNER,tid,'add_collaborator',COLLAB))
    refused(db,REVIEWER,people(db,REVIEWER,tid,'add_observer',COLLAB))
    refused(db,MD,people(db,MD,tid,'transfer_owner',MATE),'23514')
    pv=pversion(db,tid)
    ok(db,MD,people(db,MD,tid,'add_collaborator',COLLAB))  # the 108 name is an alias of add_crew
    assert shares_of(db,tid)=={OWNER:333334,MATE:333333,COLLAB:333333},shares_of(db,tid)
    assert pversion(db,tid)==pv+1 and version_shares(db,tid,pv)=={OWNER:500000,MATE:500000}
    ok(db,PE,people(db,PE,tid,'add_crew',STRANGER))
    assert set(shares_of(db,tid).values())=={250000}
    ok(db,PE,people(db,PE,tid,'remove_crew',STRANGER))
    assert shares_of(db,tid)=={OWNER:333334,MATE:333333,COLLAB:333333}
    assert value(db,f"count(*) FROM taskpulse_private.audit_events WHERE command IN ('task_people_add_crew','task_people_remove_crew') AND row_id='{tid}'")=='3'
    refused(db,MD,people(db,MD,other,'remove_crew',MATE),'23514')  # a mission keeps one crew member
    refused(db,MD,people(db,MD,tid,'add_crew',REVIEWER),'23514')
    print('PASS',db,'only the managing director and Managers change the Crew; shares stay equal')

    # The Crew, the managing director and Managers choose observers.
    ok(db,COLLAB,people(db,COLLAB,tid,'add_observer',U(3)))
    refused(db,U(3),people(db,U(3),tid,'add_observer',STRANGER))
    refused(db,REVIEWER,people(db,REVIEWER,tid,'remove_observer',U(3)))
    ok(db,MATE,people(db,MATE,tid,'remove_observer',U(3)))
    ok(db,PE,people(db,PE,tid,'add_observer',U(3)))
    assert {'user':U(3),'role':'Observer'} in rows(db,tid)['reviewers']
    refused(db,U(3),timer(tid)); refused(db,U(3),log(tid))
    print('PASS',db,'the Crew, the managing director and Managers choose observers; observers log nothing')

    # A former collaborator is ordinary Crew: logs time and marks Done.
    started=ok(db,COLLAB,timer(tid)); ok(db,COLLAB,f"SELECT public.discard_task_timer('{started['timerId']}',{j({'reason':'test'})},'{uuid4()}',0)")
    ok(db,COLLAB,log(tid))
    # A save that passes shares keeps the equal split and, with the same Crew, the version.
    pv=pversion(db,tid)
    current=[a['user'] for a in rows(db,tid)['assignees']]
    ok(db,MD,save(db,tid,current,[REVIEWER],shares=[800000,100000,100000]))
    assert shares_of(db,tid)=={OWNER:333334,MATE:333333,COLLAB:333333} and pversion(db,tid)==pv
    # Removing the internal primary passes the row on; it carries no power.
    ok(db,MD,people(db,MD,tid,'remove_crew',OWNER))
    assert value(db,f"assignee_id FROM public.tasks WHERE id='{tid}'")==MATE
    assert shares_of(db,tid)=={MATE:500000,COLLAB:500000}
    refused(db,OWNER,log(tid))
    ok(db,MD,people(db,MD,tid,'add_crew',OWNER))
    # The former collaborator builds and ticks the checklist; the reviewer acknowledges it.
    if value(db,f"count(*) FROM public.task_checklists WHERE task_id='{tid}' AND owner_node_id IS NULL")=='0':
        ok(db,COLLAB,checklist(db,tid,'create',{'title':'Work'}))
    cid=value(db,f"id FROM public.task_checklists WHERE task_id='{tid}' AND owner_node_id IS NULL")
    ok(db,COLLAB,checklist(db,tid,'add',{'checklist_id':cid,'title':'Build','section':'activity'}))
    nid=value(db,f"id FROM public.checklist_nodes WHERE checklist_id='{cid}' AND title='Build'")
    ok(db,COLLAB,checklist(db,tid,'state',{'node_id':nid,'state':'Yes'}))
    if value(db,"count(*) FROM pg_attribute WHERE attrelid='public.checklist_nodes'::regclass AND attname='review_state'")=='1':
        ok(db,REVIEWER,checklist(db,tid,'review',{'node_id':nid,'decision':'acknowledged'}))
    if value(db,f"progress_owner FROM public.tasks WHERE id='{tid}'")!='checklist':
        ok(db,COLLAB,lifecycle(db,tid,'progress',{'progress':100}))
    ok(db,REVIEWER,lifecycle(db,tid,'review',{'approved':True}))
    refused(db,U(3),lifecycle(db,tid,'transition',{'status':'Done'}))
    ok(db,COLLAB,lifecycle(db,tid,'transition',{'status':'Done'}))
    assert value(db,f"status FROM public.tasks WHERE id='{tid}'")=='Done'
    refused(db,MD,people(db,MD,tid,'add_crew',STRANGER),'23514')
    print('PASS',db,'a former collaborator logs time and marks Done; a save ignores passed shares')

for DB in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {DB} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {DB}')
    sql(DB,bootstrap)
    if DB==DBS[1]:
        migrate(DB,PREV); sql(DB,seed)
        before=value(DB,"md5(string_agg(to_jsonb(a)::text,'' ORDER BY id)) FROM public.task_assignees a")
        migrate(DB,TARGET,start=PREV+1)
        assert value(DB,"md5(string_agg(to_jsonb(a)::text,'' ORDER BY id)) FROM public.task_assignees a")==before,'108 rewrites no participant'
        print('PASS',DB,f'upgrade {PREV}->{TARGET} leaves every participant row unchanged')
        migrate(DB,BEFORE_CREW,start=TARGET+1)
    else:
        migrate(DB,max(NUMBERS)); sql(DB,seed)
    sql(DB,f"UPDATE public.users SET is_active=true WHERE id='{U(7)}'")  # the seed's inactive member, active here as a stranger
    v117=value(DB,"to_regprocedure('public.can_read_mission_work(uuid)') IS NOT NULL")=='t'
    if value(DB,"to_regprocedure('taskpulse_private.crew_equal_split(uuid)') IS NOT NULL")=='t':
        crew_flow(DB); continue
    # A configured mission: owner 4 and assignee 5 with shares 70/30, reviewer 6.
    tid=ok(DB,MD,f"SELECT public.save_task_with_participants(NULL,{j({'title':'People','category':'T','priority':'Medium','task_scale':5,'initialize_details':False})},"
        f"ARRAY['{OWNER}','{MATE}']::uuid[],ARRAY['{REVIEWER}']::uuid[],ARRAY[700000,300000]::integer[],NULL,false,'{uuid4()}')")
    other=ok(DB,MD,f"SELECT public.save_task_with_participants(NULL,{j({'title':'Other','category':'T','priority':'Medium','task_scale':5,'initialize_details':False})},"
        f"ARRAY['{MATE}']::uuid[],'{{}}'::uuid[],NULL,NULL,false,'{uuid4()}')")
    pv=value(DB,f"participant_version FROM public.tasks WHERE id='{tid}'")

    # Who may manage people (D-A4).
    refused(DB,MATE,people(DB,MATE,tid,'add_collaborator',COLLAB))
    refused(DB,REVIEWER,people(DB,REVIEWER,tid,'add_observer',COLLAB))
    key=uuid4()
    first=ok(DB,OWNER,people(DB,OWNER,tid,'add_collaborator',COLLAB,key))
    assert first['command']=='add_collaborator'
    assert ok(DB,OWNER,people(DB,OWNER,tid,'add_collaborator',COLLAB,key,first['version']-1))==first,'receipt replays'
    refused(DB,OWNER,people(DB,OWNER,tid,'add_observer',COLLAB,key),'PT409')
    refused(DB,OWNER,people(DB,OWNER,tid,'add_observer',U(3),ver=0),'PT409')
    if v117:
        # 117: observers are chosen by the managing director, the owner and credited assignees.
        refused(DB,PE,people(DB,PE,tid,'add_observer',U(3)))
        refused(DB,COLLAB,people(DB,COLLAB,tid,'add_observer',U(3)))
        ok(DB,MATE,people(DB,MATE,tid,'add_observer',U(3)))
    else:
        ok(DB,PE,people(DB,PE,tid,'add_observer',U(3)))
    refused(DB,MD,people(DB,MD,tid,'add_observer',MATE),'23514')
    refused(DB,MD,people(DB,MD,tid,'add_collaborator',REVIEWER),'23514')
    snap=rows(DB,tid)
    assert {'user':COLLAB,'role':'Collaborator','primary':False,'shares':0} in snap['assignees'],snap
    assert {'user':U(3),'role':'Observer'} in snap['reviewers'],snap
    assert value(DB,f"participant_version FROM public.tasks WHERE id='{tid}'")==pv,'no share change, no participant version'
    assert value(DB,f"count(*) FROM taskpulse_private.audit_events WHERE command LIKE 'task_people_%' AND row_id='{tid}'")=='2'
    assert value(DB,f"count(*) FROM taskpulse_private.notifications WHERE recipient_id='{U(3)}' AND title LIKE 'Observing%'")=='1'
    print('PASS',DB,'owner and managers manage people; receipts, versions, audit and notifications')

    # Collaborators edit their own mission, never another, and log no time (D-A3).
    root=ok(DB,COLLAB,checklist(DB,tid,'create',{'title':'Work'}))
    cid=value(DB,f"id FROM public.task_checklists WHERE task_id='{tid}' AND owner_node_id IS NULL")
    node=ok(DB,COLLAB,checklist(DB,tid,'add',{'checklist_id':cid,'title':'Draw','section':'activity'}))
    nid=value(DB,f"id FROM public.checklist_nodes WHERE checklist_id='{cid}' AND title='Draw'")
    ok(DB,COLLAB,details(DB,tid,{'description':'Collaborator notes'}))
    refused(DB,COLLAB,details(DB,other,{'description':'Not mine'}))
    refused(DB,COLLAB,checklist(DB,other,'create',{'title':'Not mine'}))
    refused(DB,COLLAB,timer(tid)); refused(DB,COLLAB,log(tid))
    refused(DB,COLLAB,f"INSERT INTO public.task_timers(task_id,user_id) VALUES('{tid}','{COLLAB}')",'42501')
    ok(DB,OWNER,details(DB,tid,{'description':'Owner notes'}))
    refused(DB,OUTSIDER,details(DB,tid,{'description':'Outsider'}))
    print('PASS',DB,'collaborator edits checklist and details of their mission only and cannot log time')

    # Observers neither tick, review nor log.
    refused(DB,U(3),checklist(DB,tid,'state',{'node_id':nid,'state':'Yes'}))
    refused(DB,U(3),lifecycle(DB,tid,'review',{'approved':True}))
    refused(DB,U(3),timer(tid))
    ok(DB,MATE,checklist(DB,tid,'state',{'node_id':nid,'state':'Yes'}))
    print('PASS',DB,'observer cannot tick, review or log; assignee ticks')

    if v117:
        # Who reads the mission's checklist and work (117).
        def work_reads(uid):
            return [f"SELECT public.checklist_branch('{tid}')",f"SELECT public.checklist_reviews('{tid}')",
                f"SELECT public.mission_learnings('{tid}')",f"SELECT public.task_effort_breakdown('{tid}')",
                f"SELECT public.checklist_item_seconds('{tid}','{nid}')",f"SELECT public.task_proofs('{tid}')",
                f"SELECT count(*) FROM public.timer_session_activity('{tid}')"]
        def rows_seen(uid):
            return ok(DB,uid,f"SELECT (SELECT count(*) FROM public.checklist_nodes WHERE checklist_id='{cid}')||','||"
                f"(SELECT count(*) FROM public.task_checklists WHERE task_id='{tid}')||','||"
                f"(SELECT count(*) FROM public.checklist_sections WHERE checklist_id='{cid}')||','||"
                f"(SELECT count(*) FROM public.tasks WHERE id='{tid}')")
        everything=value(DB,f"(SELECT count(*) FROM public.checklist_nodes WHERE checklist_id='{cid}')||','||"
            f"(SELECT count(*) FROM public.task_checklists WHERE task_id='{tid}')||','||"
            f"(SELECT count(*) FROM public.checklist_sections WHERE checklist_id='{cid}')||',1'")
        assert everything.split(',')[0]!='0',everything
        for uid in (MD,OWNER,MATE,COLLAB,REVIEWER,U(3)):
            for statement in work_reads(uid): ok(DB,uid,statement)
            assert rows_seen(uid)==everything,(uid,rows_seen(uid),everything)
        for uid in (STRANGER,PE):
            for statement in work_reads(uid): refused(DB,uid,statement)
            assert rows_seen(uid)=='0,0,0,1',(uid,rows_seen(uid))  # the mission itself stays listed
            assert ok(DB,uid,f"SELECT count(*) FROM public.task_assignees WHERE task_id='{tid}'")!='0'
        # A project engineer on the mission (here an observer the assignee adds) reads it.
        ok(DB,MATE,people(DB,MATE,tid,'add_observer',PE))
        for statement in work_reads(PE): ok(DB,PE,statement)
        assert rows_seen(PE)==everything
        ok(DB,MATE,people(DB,MATE,tid,'remove_observer',PE))
        refused(DB,PE,f"SELECT public.checklist_branch('{tid}')")
        print('PASS',DB,'only the managing director and the mission\'s people read its checklist; a project engineer only when on it')

        v120=value(DB,"position('private to the mission' in pg_get_functiondef('public.task_details_command_m05(uuid,text,jsonb,bigint,uuid)'::regprocedure))>0")=='t'
        if v120:
            # 120: off the mission, a project engineer neither changes its checklist or details
            # nor sees its lines in Team > Activity; on it, they do.
            private="This checklist is private to the mission's people"
            assert private in refused(DB,PE,checklist(DB,tid,'add',{'checklist_id':cid,'title':'Off mission','section':'activity'}))
            assert private in refused(DB,PE,checklist(DB,tid,'state',{'node_id':nid,'state':'N/A'}))
            assert private in refused(DB,PE,details(DB,tid,{'description':'Off mission'}))
            feed=lambda uid:ok(DB,uid,f"SELECT count(*) FROM public.activity_feed(current_date-1,current_date+1,'missions',NULL,NULL,200) f "
                f"WHERE f.task_id='{tid}' AND f.actor_id IS DISTINCT FROM '{uid}' AND f.subject_user_id IS DISTINCT FROM '{uid}'")
            assert int(feed(MD))>0 and int(feed(PE))==0,(feed(MD),feed(PE))
            ok(DB,MATE,people(DB,MATE,tid,'add_observer',PE))
            assert int(feed(PE))>0,feed(PE)
            pe_node=ok(DB,PE,checklist(DB,tid,'add',{'checklist_id':cid,'title':'On mission','section':'activity'}))
            ok(DB,PE,f"SELECT public.checklist_command('{tid}','delete',{j({'node_id':pe_node['nodeId'],'reason':'test'})},{version(DB,tid)},'{uuid4()}')")
            ok(DB,MATE,people(DB,MATE,tid,'remove_observer',PE))
            print('PASS',DB,'off the mission a project engineer cannot change its checklist or details and sees none of its activity lines')

        # Observers see the mission's files but neither add nor remove them.
        org=value(DB,f"organization_id FROM public.tasks WHERE id='{tid}'")
        def proof(op,path='NULL',proof_id='NULL'):
            return f"SELECT public.task_proof_command('{op}','{tid}',{path},'Site.pdf','application/pdf',1000,{proof_id},'{uuid4()}')"
        path=literal(f"{org}/{tid}/{uuid4()}.pdf")
        refused(DB,U(3),proof('add',path))
        added=ok(DB,REVIEWER,proof('add',path))
        listed=ok(DB,U(3),f"SELECT public.task_proofs('{tid}')")
        assert [x['id'] for x in listed]==[added['id']] and listed[0]['canRemove'] is False,listed
        refused(DB,U(3),proof('withdraw',proof_id=literal(added['id'])))
        ok(DB,COLLAB,f"SELECT public.task_proofs('{tid}')")
        ok(DB,REVIEWER,proof('withdraw',proof_id=literal(added['id'])))
        print('PASS',DB,'observers view files only; reviewers add and remove theirs')

    # Assignees and managers log time as before.
    started=ok(DB,MATE,timer(tid)); ok(DB,MATE,f"SELECT public.discard_task_timer('{started['timerId']}',{j({'reason':'test'})},'{uuid4()}',0)")
    ok(DB,OWNER,log(tid)); ok(DB,PE,log(tid)); ok(DB,MD,log(tid))
    print('PASS',DB,'owner, assignee, project engineer and managing director keep logging time')

    # Done: the reviewer's approval counts; the observer's row does not block.
    if value(DB,f"progress_owner FROM public.tasks WHERE id='{tid}'")!='checklist':
        ok(DB,OWNER,lifecycle(DB,tid,'progress',{'progress':100}))
    refused(DB,OWNER,lifecycle(DB,tid,'transition',{'status':'Done'}),'23514')
    # 114 (D-D2), where applied (the upgrade database stops at 108): the ticked objective waits
    # for the Primary reviewer; an Observer cannot decide it.
    if value(DB,"count(*) FROM pg_attribute WHERE attrelid='public.checklist_nodes'::regclass AND attname='review_state'")=='1':
        refused(DB,U(3),checklist(DB,tid,'review',{'node_id':nid,'decision':'acknowledged'}),'42501')
        ok(DB,REVIEWER,checklist(DB,tid,'review',{'node_id':nid,'decision':'acknowledged'}))
    ok(DB,REVIEWER,lifecycle(DB,tid,'review',{'approved':True}))
    if v117: refused(DB,COLLAB,lifecycle(DB,tid,'transition',{'status':'Done'}))  # 117: collaborators do not finish it
    ok(DB,OWNER,lifecycle(DB,tid,'transition',{'status':'Done'}))
    assert value(DB,f"status FROM public.tasks WHERE id='{tid}'")=='Done'
    refused(DB,MD,people(DB,MD,tid,'remove_observer',U(3)),'23514')
    ok(DB,MD,lifecycle(DB,tid,'transition',{'status':'In Progress','reason':'More people work'}))
    print('PASS',DB,'an Observer row does not block Done; closed missions keep their people')

    # A dialog save keeps collaborators, observers and custom shares.
    ok(DB,MD,save(DB,tid,[OWNER,MATE],[REVIEWER]))
    snap=rows(DB,tid)
    assert {'user':COLLAB,'role':'Collaborator','primary':False,'shares':0} in snap['assignees'],snap
    assert {'user':U(3),'role':'Observer'} in snap['reviewers'],snap
    assert {(a['user'],a['shares']) for a in snap['assignees']}=={(OWNER,700000),(MATE,300000),(COLLAB,0)},snap
    assert value(DB,f"participant_version FROM public.tasks WHERE id='{tid}'")==pv,'an unchanged save keeps the share version'
    print('PASS',DB,'a plain edit keeps collaborators, observers and custom shares')

    # Ownership moves among credited assignees only; then the new owner manages people.
    refused(DB,MATE,people(DB,MATE,tid,'transfer_owner',MATE))
    refused(DB,OWNER,people(DB,OWNER,tid,'transfer_owner',COLLAB),'23514')
    ok(DB,OWNER,people(DB,OWNER,tid,'transfer_owner',MATE))
    assert value(DB,f"assignee_id FROM public.tasks WHERE id='{tid}'")==MATE
    snap=rows(DB,tid)
    assert {(a['user'],a['role'],a['primary'],a['shares']) for a in snap['assignees']}=={(MATE,'Owner',True,300000),(OWNER,'Collaborator',False,700000),(COLLAB,'Collaborator',False,0)},snap
    refused(DB,OWNER,people(DB,OWNER,tid,'remove_collaborator',COLLAB))
    ok(DB,OWNER,log(tid))  # still a credited assignee, so still logs
    # A removed collaborator's next command fails.
    ok(DB,MATE,people(DB,MATE,tid,'remove_collaborator',COLLAB))
    refused(DB,COLLAB,checklist(DB,tid,'add',{'checklist_id':cid,'title':'Late','section':'activity'}))
    refused(DB,COLLAB,details(DB,tid,{'description':'Late'}))
    refused(DB,MATE,people(DB,MATE,tid,'remove_collaborator',OWNER),'23514')
    ok(DB,MATE,people(DB,MATE,tid,'remove_observer',U(3)))
    assert value(DB,f"count(*) FROM public.task_reviewers WHERE task_id='{tid}' AND reviewer_role='Observer'")=='0'
    print('PASS',DB,'ownership transfers to a credited assignee; removed collaborators lose access')

    # Legacy missions: no ownership transfer; the legacy assignee still logs.
    legacy='10000000-0000-0000-0000-000000000001'
    refused(DB,MD,people(DB,MD,legacy,'transfer_owner',MATE),'23514')
    ok(DB,MD,people(DB,MD,legacy,'add_collaborator',COLLAB))
    refused(DB,COLLAB,timer(legacy))
    ok(DB,OWNER,log(legacy))
    print('PASS',DB,'legacy missions keep their owner; their collaborators log no time')
    crew_upgrade(DB,tid)

print('PASS task people')
