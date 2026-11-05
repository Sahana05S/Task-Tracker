"""Task Tools copies keep mission people in their roles (migration 115); disposable PostgreSQL only.

Since migration 108 a mission can have zero-share Collaborators (task_assignees,
share_units = 0) and Observers (task_reviewers, reviewer_role = 'Observer'). A Task
Tools copy (duplicate, weekly, day-count, number-suffix, carryover) used to pass every
assignee and every reviewer to save_task_with_participants, so an Observer came back
as an ordinary reviewer who blocks Done. Copies now carry the credited assignees and
non-observer reviewers through the save, then add the same Collaborators (still zero
share) and Observers. Support splits and one-per-member copies name their own people
and carry neither. JWT shim only; no hosted connection.

Since migration 121 (Mission Crew) everyone on a mission is Crew with an equal share:
the fresh database (every migration) checks that copies carry the whole Crew with equal
shares and keep the Observers; the upgrade database stops at 115 and checks the 115 rules.
"""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4
import datetime

DBS=('taskpulse_tools_people_fresh_test','taskpulse_tools_people_upgrade_test')
TARGET=115
NUMBERS=sorted(int(p.name.split('_')[0]) for p in (ROOT/'supabase/migrations').glob('*.sql'))
assert TARGET in NUMBERS,'migration 115 missing'
PREV=max(n for n in NUMBERS if n<TARGET)
U=lambda n:'00000000-0000-0000-0000-'+str(n).zfill(12)
MD,OWNER,MATE,REVIEWER,COLLAB,WATCHER=U(1),U(4),U(5),U(6),U(8),U(3)

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
def j(v):return literal(json.dumps(v))+'::jsonb'
def version(db,tid):return int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{tid}'"))
def people(db,tid,command,user):
    return ok(db,MD,f"SELECT public.task_people_command('{tid}','{command}',{j({'user_id':user})},{version(db,tid)},'{uuid4()}')")
def snapshot(db,tid):
    return json.loads(value(db,f"taskpulse_private.task_people_snapshot('{tid}')"))
def roles(db,tid):
    a={x['user']:(x['role'],x['shares']) for x in snapshot(db,tid)['assignees']}
    r={x['user']:x['role'] for x in snapshot(db,tid)['reviewers']}
    return a,r
def copy(db,command,payload):
    plan=ok(db,MD,f"SELECT public.task_tools_preview('{command}',{j(payload)})")
    assert plan['ready'],(command,plan['reasons'])
    state=ok(db,MD,f"SELECT public.task_tools_command('{plan['id']}','{uuid4()}')")
    return [i['taskId'] for i in state['items']],plan
def done_gate(db,tid):
    # Every reviewer who is not an Observer approves; the Observer never does.
    return value(db,f"count(*) FROM public.task_reviewers WHERE task_id='{tid}' AND reviewer_role<>'Observer'")

today=datetime.date.today()
for DB in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {DB} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {DB}')
    sql(DB,bootstrap)
    if DB==DBS[1]:
        migrate(DB,PREV); sql(DB,seed); migrate(DB,TARGET,start=PREV+1)
    else:
        migrate(DB,max(NUMBERS)); sql(DB,seed)
    sql(DB,f"UPDATE public.users SET is_active=true WHERE id='{U(7)}'")
    crew=value(DB,"to_regprocedure('taskpulse_private.crew_equal_split(uuid)') IS NOT NULL")=='t'
    # Owner 4 (70%) and assignee 5 (30%), reviewer 6; then collaborator 8 and observer 3.
    src=ok(DB,MD,f"SELECT public.save_task_with_participants(NULL,{j({'title':'Copy people','category':'T','priority':'Medium','task_scale':5,'initialize_details':False})},"
        f"ARRAY['{OWNER}','{MATE}']::uuid[],ARRAY['{REVIEWER}']::uuid[],ARRAY[700000,300000]::integer[],NULL,false,'{uuid4()}')")
    people(DB,src,'add_collaborator',COLLAB)
    people(DB,src,'add_observer',WATCHER)
    a,r=roles(DB,src)
    if crew:
        # 121: the passed 70/30 is ignored; the former collaborator joins the Crew equally.
        assert {u:s for u,(_,s) in a.items()}=={OWNER:333334,MATE:333333,COLLAB:333333} and r[WATCHER]=='Observer',(a,r)
        new,plan=copy(DB,'duplicate',{'sourceTaskId':src,'startDate':today.isoformat()})
        item=plan['items'][0]
        assert set(item['assignees'])=={OWNER,MATE,COLLAB} and WATCHER not in item['reviewers'],item
        assert item['collaborators']==[] and item['observers']==[WATCHER],item
        assert sorted(item['shares'])==[333333,333333,333334],item
        a,r=roles(DB,new[0])
        assert {u:s for u,(_,s) in a.items()}=={OWNER:333334,MATE:333333,COLLAB:333333},a
        assert r=={REVIEWER:'Primary',WATCHER:'Observer'},r
        assert done_gate(DB,new[0])=='1','only the real reviewer gates Done on the copy'
        news,_=copy(DB,'weekly',{'sourceTaskId':src,'startDate':today.isoformat(),'count':2})
        for tid in news:
            a,r=roles(DB,tid)
            assert set(a)=={OWNER,MATE,COLLAB} and len({s for _,s in a.values()}-{333333,333334})==0 and r.get(WATCHER)=='Observer',(tid,a,r)
        team,_=copy(DB,'all_team',{'sourceTaskId':src,'startDate':today.isoformat()})
        for tid in team:
            a,r=roles(DB,tid)
            assert [s for _,s in a.values()]==[1000000] and 'Observer' not in r.values(),(tid,a,r)
        print('PASS',DB,'121: copies carry the whole Crew with equal shares and keep observers')
        continue
    assert a[COLLAB]==('Collaborator',0) and r[WATCHER]=='Observer',(a,r)

    # Preview: the save carries only credited assignees and non-observer reviewers.
    new,plan=copy(DB,'duplicate',{'sourceTaskId':src,'startDate':today.isoformat()})
    item=plan['items'][0]
    assert COLLAB not in item['assignees'] and WATCHER not in item['reviewers'],item
    assert item['collaborators']==[COLLAB] and item['observers']==[WATCHER],item
    a,r=roles(DB,new[0])
    assert a=={OWNER:('Owner',700000),MATE:('Collaborator',300000),COLLAB:('Collaborator',0)},a
    assert r=={REVIEWER:'Primary',WATCHER:'Observer'},r
    assert done_gate(DB,new[0])=='1','only the real reviewer gates Done on the copy'
    print('PASS',DB,'duplicate keeps shares, the zero-share collaborator and the observer in their roles')

    # Phases: every copy gets the same people.
    news,_=copy(DB,'weekly',{'sourceTaskId':src,'startDate':today.isoformat(),'count':2})
    for tid in news:
        a,r=roles(DB,tid)
        assert a.get(COLLAB)==('Collaborator',0) and r.get(WATCHER)=='Observer',(tid,a,r)
    print('PASS',DB,'weekly phases keep collaborators and observers on every copy')

    # One per member and support splits name their own people: no collaborators or observers.
    team,_=copy(DB,'all_team',{'sourceTaskId':src,'startDate':today.isoformat()})
    for tid in team:
        a,r=roles(DB,tid)
        assert all(s!=0 for _,s in a.values()) and 'Observer' not in r.values(),(tid,a,r)
    print('PASS',DB,'one-per-member copies carry no collaborators or observers')

    # A copy of a mission with neither is unchanged.
    plain=ok(DB,MD,f"SELECT public.save_task_with_participants(NULL,{j({'title':'Plain','category':'T','priority':'Medium','task_scale':5,'initialize_details':False})},"
        f"ARRAY['{OWNER}']::uuid[],ARRAY['{REVIEWER}']::uuid[],NULL,NULL,false,'{uuid4()}')")
    new,plan=copy(DB,'duplicate',{'sourceTaskId':plain,'startDate':today.isoformat()})
    a,r=roles(DB,new[0])
    assert a=={OWNER:('Owner',1000000)} and r=={REVIEWER:'Primary'} and plan['items'][0]['collaborators']==[] and plan['items'][0]['observers']==[],(a,r)
    print('PASS',DB,'a mission with no collaborators or observers copies as before')

for DB in DBS: sql('postgres',f'DROP DATABASE IF EXISTS {DB} WITH (FORCE);')
print('PASS task tools copies keep mission people in their roles')
