"""Permanent missions (migration 135, 7 November 2026); disposable PostgreSQL only.

The fresh database (every migration): the managing director and Managers make a mission
permanent when creating it or later and turn it off again; nobody else can; a permanent
mission has no due date, cannot be marked Done (through the lifecycle command or a direct
write), moves to In Progress when its first timer starts, is timed by its Crew only, and
cannot hold a Quest; a mission with Quests cannot become permanent. Turned off, it behaves
like any mission. The upgrade database (134 -> 135) leaves every existing mission normal and
otherwise unchanged. JWT shim only; no hosted connection.
"""
from pathlib import Path
source=Path(__file__).with_name('test_task_people_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor DB in DBS:')[0],str(Path(__file__).with_name('test_task_people_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_permanent_fresh_test','taskpulse_permanent_upgrade_test')
PERMANENT=135
assert PERMANENT in NUMBERS,'migration 135 missing'
BEFORE_PERMANENT=max(n for n in NUMBERS if n<PERMANENT)

def create(db,uid,title,assignees,permanent,due='2026-12-31'):
    arr='ARRAY['+','.join(literal(x) for x in assignees)+']::uuid[]'
    fields={'title':title,'category':'T','priority':'Medium','task_scale':5,'initialize_details':False,'due_date':due,'is_permanent':permanent}
    return f"SELECT public.save_task_with_participants(NULL,{j(fields)},{arr},'{{}}'::uuid[],NULL,NULL,false,'{uuid4()}')"
def edit(db,tid,assignees,**extra):
    tag=value(db,f"task_tag FROM public.tasks WHERE id='{tid}'")
    fields={'task_tag':tag,'title':'Permanent','category':'T','priority':'Medium','expected_lifecycle_version':version(db,tid),**extra}
    arr='ARRAY['+','.join(literal(x) for x in assignees)+']::uuid[]'
    return f"SELECT public.save_task_with_participants('{tid}',{j(fields)},{arr},'{{}}'::uuid[],NULL,{pversion(db,tid)},false,'{uuid4()}')"
def field(db,tid,name):return value(db,f"{name} FROM public.tasks WHERE id='{tid}'")

def fresh_flow(db):
    # Creating: the managing director and Managers choose the mission type; the due date is dropped.
    tid=ok(db,MD,create(db,MD,'Permanent',[OWNER,MATE],True))
    assert field(db,tid,'is_permanent')=='t' and field(db,tid,'due_date')=='',(field(db,tid,'is_permanent'),field(db,tid,'due_date'))
    pe=ok(db,PE,create(db,PE,'Manager permanent',[MATE],True))
    assert field(db,pe,'is_permanent')=='t'
    normal=ok(db,MD,create(db,MD,'Normal',[OWNER],False))
    assert field(db,normal,'is_permanent')=='f' and field(db,normal,'due_date')=='2026-12-31'
    refused(db,MD,create(db,MD,'Bad type',[OWNER],'yes'),'23514')
    refused(db,OWNER,create(db,OWNER,'Not a manager',[OWNER],True))
    # Nobody else sets or clears it, not even with a direct write.
    refused(db,OWNER,f"UPDATE public.tasks SET is_permanent=false WHERE id='{tid}'")
    refused(db,OWNER,f"UPDATE public.tasks SET is_permanent=true WHERE id='{normal}'")
    assert field(db,tid,'is_permanent')=='t' and field(db,normal,'is_permanent')=='f'
    # An edit that leaves the type out keeps it; a due date sent for a permanent mission is dropped.
    ok(db,MD,edit(db,tid,[OWNER,MATE],due_date='2026-12-01'))
    assert field(db,tid,'is_permanent')=='t' and field(db,tid,'due_date')==''
    print('PASS',db,'only the managing director and Managers make a mission permanent; it has no due date')

    # Timers: the Crew only; the first timer moves the mission to In Progress.
    assert field(db,tid,'status')=='Not Started'
    refused(db,MD,timer(tid)); refused(db,PE,timer(tid)); refused(db,STRANGER,timer(tid))
    v=version(db,tid)
    started=ok(db,OWNER,timer(tid))
    assert field(db,tid,'status')=='In Progress' and field(db,tid,'started_date')!='' and version(db,tid)>v
    v=version(db,tid)
    refused(db,OWNER,timer(tid),'23505')  # one running timer per person per mission, as for any mission
    mate=ok(db,MATE,timer(tid))
    assert field(db,tid,'status')=='In Progress' and version(db,tid)==v,'a later timer changes nothing'
    for t,who in ((started,OWNER),(mate,MATE)):
        ok(db,who,f"SELECT public.discard_task_timer('{t['timerId']}',{j({'reason':'test'})},'{uuid4()}',0)")
    ok(db,OWNER,log(tid))
    # A manager still times a normal mission (unchanged rule).
    ok(db,MD,f"SELECT public.discard_task_timer('{ok(db,MD,timer(normal))['timerId']}',{j({'reason':'test'})},'{uuid4()}',0)")
    print('PASS',db,'only the Crew times a permanent mission; its first timer moves it to In Progress')

    # Never Done: through the lifecycle command or any other write.
    refused(db,OWNER,lifecycle(db,tid,'transition',{'status':'Done'}),'23514')
    refused(db,MD,lifecycle(db,tid,'transition',{'status':'Done'}),'23514')
    r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],
        input=f"UPDATE public.tasks SET status='Done' WHERE id='{tid}';",text=True,capture_output=True,encoding='utf-8')
    assert r.returncode and 'never Done' in r.stderr,r.stderr  # even an owner-run write
    assert field(db,tid,'status')=='In Progress'
    print('PASS',db,'a permanent mission cannot be marked Done')

    # No Quests on a permanent mission; a mission with Quests cannot become permanent.
    if value(db,f"count(*) FROM public.task_checklists WHERE task_id='{tid}' AND owner_node_id IS NULL")=='0':
        ok(db,OWNER,checklist(db,tid,'create',{'title':'Work'}))
    cid=value(db,f"id FROM public.task_checklists WHERE task_id='{tid}' AND owner_node_id IS NULL")
    ok(db,OWNER,checklist(db,tid,'add',{'checklist_id':cid,'title':'Daily round','section':'activity'}))
    err=refused(db,OWNER,checklist(db,tid,'submission',{'checklist_id':cid,'title':'A Quest','section':'activity'}),'23514')
    assert 'permanent mission has no Quests' in err,err
    err=refused(db,MD,checklist(db,tid,'submission',{'checklist_id':cid,'title':'A Quest','section':'activity'}),'23514')
    if value(db,f"count(*) FROM public.task_checklists WHERE task_id='{normal}' AND owner_node_id IS NULL")=='0':
        ok(db,OWNER,checklist(db,normal,'create',{'title':'Work'}))
    ncid=value(db,f"id FROM public.task_checklists WHERE task_id='{normal}' AND owner_node_id IS NULL")
    ok(db,OWNER,checklist(db,normal,'submission',{'checklist_id':ncid,'title':'A Quest','section':'activity'}))
    err=refused(db,MD,edit(db,normal,[OWNER],is_permanent=True),'23514')
    assert 'has Quests' in err,err
    assert field(db,normal,'is_permanent')=='f'
    print('PASS',db,'a permanent mission has no Quests; a mission with Quests cannot become permanent')

    # Turned off by a Manager, it behaves like any mission: a manager times it, it can be Done.
    refused(db,OWNER,edit(db,tid,[OWNER,MATE],is_permanent=False))
    ok(db,PE,edit(db,tid,[OWNER,MATE],is_permanent=False))
    assert field(db,tid,'is_permanent')=='f'
    ok(db,MD,f"SELECT public.discard_task_timer('{ok(db,MD,timer(tid))['timerId']}',{j({'reason':'test'})},'{uuid4()}',0)")
    nid=value(db,f"id FROM public.checklist_nodes WHERE checklist_id='{cid}' AND title='Daily round'")
    ok(db,OWNER,checklist(db,tid,'state',{'node_id':nid,'state':'Yes'}))
    if field(db,tid,'progress_owner')!='checklist':
        ok(db,OWNER,lifecycle(db,tid,'progress',{'progress':100}))
    ok(db,OWNER,lifecycle(db,tid,'transition',{'status':'Done'}))
    assert field(db,tid,'status')=='Done'
    refused(db,MD,edit(db,tid,[OWNER,MATE],is_permanent=True),'23514')  # a Done mission is reopened first
    print('PASS',db,'turned off, it behaves like any mission and can be marked Done')

for DB in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {DB} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {DB}')
    sql(DB,bootstrap)
    if DB==DBS[1]:
        migrate(DB,BEFORE_PERMANENT); sql(DB,seed)
        before=value(DB,"md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM public.tasks t")
        migrate(DB,PERMANENT,start=BEFORE_PERMANENT+1)
        assert value(DB,"count(*) FROM public.tasks WHERE is_permanent")=='0'
        assert value(DB,"md5(string_agg((to_jsonb(t)-'is_permanent')::text,'' ORDER BY id)) FROM public.tasks t")==before,'135 changes no mission'
        print('PASS',DB,f'upgrade {BEFORE_PERMANENT}->{PERMANENT} leaves every mission normal and unchanged')
        migrate(DB,max(NUMBERS),start=PERMANENT+1)
        continue
    migrate(DB,max(NUMBERS)); sql(DB,seed)
    sql(DB,f"UPDATE public.users SET is_active=true WHERE id='{U(7)}'")  # the seed's inactive member, active here as a stranger
    fresh_flow(DB)
