"""Migration 109: Objectives and sub-quests. A Quest holds Objectives, Quests (three levels at most) and
Sub-missions; delete with_children removes nested Quest lists; edit refuses a move under its own rows.
Disposable PostgreSQL checks; JWT shim only; no hosted connection."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
ROOT=Path(__file__).resolve().parents[1]
from uuid import uuid4

DBS=('taskpulse_m109_fresh_test','taskpulse_m109_upgrade_test')
T2='10000000-0000-0000-0000-000000000002'  # assignee user 5; seed checklist C2
C2='20000000-0000-0000-0000-000000000002'

def uid_of(short):return '00000000-0000-0000-0000-'+short.zfill(12)
def cl(db,cmd,payload,uid='5',success=True,task=T2):
    v=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{task}'"))
    q=f"SELECT public.checklist_command('{task}',{literal(cmd)},{literal(json.dumps(payload))}::jsonb,{v},'{uuid4()}')"
    lines=actor(db,uid_of(uid),q,success)
    if success:return json.loads(next(x for x in lines if x.startswith('{')))
def denied(db,cmd,payload,message,uid='5'):
    v=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{T2}'"))
    q=(f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{uid_of(uid)}',true);\n"
       f"SELECT public.checklist_command('{T2}',{literal(cmd)},{literal(json.dumps(payload))}::jsonb,{v},'{uuid4()}');\nCOMMIT;")
    result=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],
        input=q,text=True,capture_output=True,encoding='utf-8')
    assert result.returncode and message in result.stderr,(message,result.stderr[-400:])
def rollup(db,task=T2):return json.loads(value(db,f"taskpulse_private.checklist_rollup('{task}')"))
def progress(r,nid):return next(x for x in r['nodeProgress'] if x['id']==nid)
def migrate(db,upto,start=1):
    for m in sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0])):
        n=int(m.name.split('_')[0])
        if n<start:continue
        if n>upto:break
        sql(db,m.read_text(encoding='utf-8'))
def add(db,title,checklist=None,parent=None,section='activity',uid='5'):
    payload={'title':title,'section':section}
    if checklist:payload['checklist_id']=checklist
    if parent:payload['parent_id']=parent
    return cl(db,'add',payload,uid=uid)['nodeId']
def quest(db,title,checklist=None,uid='5'):
    payload={'title':title,'section':'activity'}
    if checklist:payload['checklist_id']=checklist
    r=cl(db,'submission',payload,uid=uid);return r['nodeId'],r['ownedChecklistId']
def tick(db,nid,checklist=None,state='Yes'):
    payload={'node_id':nid,'state':state}
    if checklist:payload['checklist_id']=checklist
    cl(db,'state',payload)

for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    if db==DBS[1]:
        migrate(db,108); sql(db,seed)
        sql(db,f"DELETE FROM public.checklist_nodes WHERE checklist_id='{C2}'")
        q,ql=quest(db,'Old quest'); i1=add(db,'Old 1',checklist=ql); add(db,'Old 2',checklist=ql); tick(db,i1,ql)
        before=rollup(db)
        # Before 109 a Quest holds items only.
        denied(db,'submission',{'title':'Nested','section':'activity','checklist_id':ql},'A Quest holds items only')
        migrate(db,109,start=109)
        after=rollup(db)
        assert after['taskProgress']==before['taskProgress']==50 and after['errors']==[],(before,after)
        assert value(db,"count(*) FROM pg_trigger WHERE tgname IN ('aa_m77_quest_items','aa_m77_quest_nesting')")=='0'
        print('PASS',db,'upgrade 108->109: m77 triggers replaced; existing Quest progress unchanged')
        cl(db,'delete',{'node_id':q,'reason':'reset','with_children':True})
    else:
        migrate(db,10**6); sql(db,seed)
        sql(db,f"DELETE FROM public.checklist_nodes WHERE checklist_id='{C2}'")
        print('PASS',db,'fresh install of every migration')
    assert value(db,"taskpulse_private.m15_secure()")=='0 tables and 0 functions moved to taskpulse_definer'

    # Three levels of Quest, each with Objectives; the fourth level is refused.
    q1,l1=quest(db,'Quest')
    a=add(db,'Objective A',checklist=l1)
    q2,l2=quest(db,'Sub-quest',checklist=l1)
    b=add(db,'Objective B',checklist=l2)
    q3,l3=quest(db,'Sub-sub-quest',checklist=l2)
    c1=add(db,'Objective C1',checklist=l3); c2=add(db,'Objective C2',checklist=l3)
    denied(db,'submission',{'title':'Too deep','section':'activity','checklist_id':l3},'Quests go three levels deep')
    # Rows in a Quest stay in its single list whatever section is sent.
    s=add(db,'Sent as setup',checklist=l2,section='setup')
    assert value(db,f"detail_section FROM public.checklist_nodes WHERE id='{s}'")=='activity'
    cl(db,'delete',{'checklist_id':l2,'node_id':s,'reason':'not needed'})
    print('PASS',db,'Quests nest three levels deep; a fourth is refused; rows in a Quest stay in its list')

    # Rollup: each Quest is the equal average of its rows; nothing is counted twice.
    tick(db,c1,l3); tick(db,a,l1)
    r=rollup(db)
    assert progress(r,q3)['progressPercentage']==50,progress(r,q3)
    assert abs(progress(r,q2)['progressPercentage']-25)<1e-9,progress(r,q2)       # (B 0 + Q3 50)/2
    assert abs(progress(r,q1)['progressPercentage']-62.5)<1e-9,progress(r,q1)     # (A 100 + Q2 25)/2
    assert abs(r['taskProgress']-62.5)<1e-9 and r['errors']==[] and r['isComplete'] is False,r
    for nid in (b,c2):tick(db,nid,l2 if nid==b else l3)
    r=rollup(db); assert r['taskProgress']==100 and progress(r,q1)['isComplete'] is True,r
    tick(db,b,l2,'No')
    print('PASS',db,'nested rollup: 50 -> 25 -> 62.5 at the mission (fixture nested-quests)')

    # A Sub-mission inside a Quest, through submission_create; reviewers copied, row feeds the Quest.
    sql(db,f"INSERT INTO public.task_reviewers(task_id,user_id) VALUES('{T2}','{uid_of('6')}')")
    v=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{T2}'"))
    lines=actor(db,uid_of('1'),f"SELECT public.submission_create('{T2}','{l2}','activity',NULL,{literal(json.dumps({'title':'Inner sub-mission'}))}::jsonb,{v},'{uuid4()}')")
    made=json.loads(next(x for x in lines if x.startswith('{')))
    child=made['subMissionId']; row=made['nodeId']
    assert value(db,f"checklist_id FROM public.checklist_nodes WHERE id='{row}'")==l2
    assert value(db,f"linked_task_id FROM public.checklist_nodes WHERE id='{row}'")==child
    assert value(db,f"count(*) FROM public.task_reviewers WHERE task_id='{child}' AND user_id='{uid_of('6')}'")=='1'
    assert value(db,f"count(*) FROM public.task_dependencies WHERE predecessor_task_id='{T2}' AND successor_task_id='{child}' AND relation_type='Subtask'")=='1'
    r=rollup(db); assert progress(r,row)['progressPercentage']==0 and abs(progress(r,q2)['progressPercentage']-100/3)<1e-9,progress(r,q2)
    sql(db,f"DELETE FROM public.task_reviewers WHERE task_id='{T2}'")
    print('PASS',db,'a Sub-mission is created inside a Quest; reviewers copied; its row feeds the Quest')

    # Duplicating a Quest copies its rows and sub-quests but not the Sub-mission link.
    d=cl(db,'duplicate',{'checklist_id':l1,'node_id':q2})
    dl=d['ownedChecklistId']
    assert value(db,f"count(*) FROM public.checklist_nodes WHERE checklist_id='{dl}'")=='2'  # Objective B + Sub-sub-quest
    assert value(db,f"count(*) FROM public.checklist_nodes WHERE checklist_id='{dl}' AND linked_task_id IS NOT NULL")=='0'
    print('PASS',db,'duplicate copies sub-quests and Objectives, not Sub-mission links')

    # Edit: no move under its own rows; a Quest's rows cannot be reached by parent.
    p=add(db,'Parent'); k=add(db,'Kid',parent=p)
    denied(db,'edit',{'node_id':p,'parent_id':k,'section':'activity','reason':'loop'},'A row cannot move under one of its own rows')
    denied(db,'edit',{'node_id':q1,'parent_id':b,'section':'activity','reason':'into itself'},'A row cannot move under one of its own rows')
    print('PASS',db,'edit refuses moving a row or Quest under one of its own rows')

    # Delete without with_children refuses a Quest with rows; with it removes every nested list.
    denied(db,'delete',{'node_id':q1,'reason':'gone'},'This row has rows under it')
    lists=value(db,f"count(*) FROM public.task_checklists WHERE task_id='{T2}' AND owner_node_id IS NOT NULL")
    assert lists=='5',lists  # Quest, Sub-quest, Sub-sub-quest, the copy and its inner Quest
    cl(db,'delete',{'node_id':q1,'reason':'gone','with_children':True})
    assert value(db,f"count(*) FROM public.task_checklists WHERE task_id='{T2}' AND owner_node_id IS NOT NULL")=='0'
    assert value(db,f"count(*) FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE c.task_id='{T2}' AND c.owner_node_id IS NULL")=='2'
    assert value(db,f"count(*) FROM public.tasks WHERE id='{child}'")=='1'  # the Sub-mission itself stays
    cl(db,'delete',{'node_id':p,'reason':'gone','with_children':True})
    assert rollup(db)['errors']==[]
    print('PASS',db,'delete with_children removes nested Quest lists deepest first; the Sub-mission stays a mission')

    # Permissions are unchanged: a non-assignee cannot build Quests.
    cl(db,'submission',{'title':'Intruder','section':'activity'},uid='4',success=False)
    print('PASS',db,'non-assignee denied')

print('ALL PASS checklist sub-quests (migration 109)')
