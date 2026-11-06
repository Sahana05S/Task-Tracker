"""Migrations 109, 122, 130 and 131: Objectives and sub-quests. A Quest holds Objectives, Quests (no level limit
since 122) and Sub-missions; delete with_children removes nested Quest lists; edit refuses a move under
its own rows. 122: each Quest has an owner (Crew); inside a Quest only its owner, owners of the Quests
above it, the managing director and Managers change rows; a Quest list cannot sit inside itself.
Disposable PostgreSQL checks; JWT shim only; no hosted connection."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
ROOT=Path(__file__).resolve().parents[1]
from uuid import uuid4

DBS=('taskpulse_m109_fresh_test','taskpulse_m109_upgrade_test')
LATEST=max(int(m.name.split('_')[0]) for m in (ROOT/'supabase/migrations').glob('*.sql'))
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
        migrate(db,129,start=110)
        if LATEST>=130:
            # 130: rows with rows under them become Quests, deepest first; progress is unchanged.
            p=add(db,'Parent'); k1=add(db,'Kid 1',parent=p); k2=add(db,'Kid 2',parent=p)
            g1=add(db,'Grandkid 1',parent=k2); add(db,'Grandkid 2',parent=k2); tick(db,k1); tick(db,g1)
            s0=add(db,'Setup parent',section='setup'); s1=add(db,'Setup 1',parent=s0,section='setup'); add(db,'Setup 2',parent=s0,section='setup'); tick(db,s1)
            nested=rollup(db)
            assert progress(nested,p)['progressPercentage']==75 and progress(nested,s0)['progressPercentage']==50,nested
            migrate(db,130,start=130)
            moved=rollup(db)
            assert moved['taskProgress']==nested['taskProgress'] and moved['errors']==[],(nested,moved)
            assert progress(moved,p)['progressPercentage']==75 and progress(moved,s0)['progressPercentage']==50,moved
            assert value(db,"count(*) FROM public.checklist_nodes WHERE parent_node_id IS NOT NULL")=='0'
            owned=lambda nid:value(db,f"id FROM public.task_checklists WHERE owner_node_id='{nid}'")
            pl,kl,sl=owned(p),owned(k2),owned(s0)
            assert all((pl,kl,sl)) and owned(k1)==''
            assert value(db,f"string_agg(title,',' ORDER BY title) FROM public.checklist_nodes WHERE checklist_id='{pl}'")=='Kid 1,Kid 2'
            assert value(db,f"string_agg(title||':'||detail_section,',' ORDER BY title) FROM public.checklist_nodes WHERE checklist_id='{sl}'")=='Setup 1:activity,Setup 2:activity'
            assert value(db,f"string_agg(DISTINCT node_type::text,',') FROM public.checklist_nodes WHERE id IN ('{p}','{k2}','{s0}')")=='Page'
            assert value(db,f"assignee_id FROM public.checklist_nodes WHERE id='{p}'")==uid_of('5'),'a converted Quest takes the default owner'
            assert value(db,f"completion_state FROM public.checklist_nodes WHERE id='{k1}'")=='Yes'
            print('PASS',db,'130: rows with rows under them became Quests (two levels and a Setup row); every figure unchanged')
            for nid in (p,s0):cl(db,'delete',{'node_id':nid,'reason':'reset','with_children':True})
        migrate(db,10**6,start=131 if LATEST>=130 else 130)
        # 122 backfill: the Quest's creator (the mission's assignee) owns it.
        assert value(db,f"assignee_id FROM public.checklist_nodes WHERE id='{q}'")==uid_of('5')
        print('PASS',db,'upgrade to latest: existing Quests take their creator as owner (122)')
        cl(db,'delete',{'node_id':q,'reason':'reset','with_children':True})
    else:
        migrate(db,10**6); sql(db,seed)
        sql(db,f"DELETE FROM public.checklist_nodes WHERE checklist_id='{C2}'")
        print('PASS',db,'fresh install of every migration')
    assert value(db,"taskpulse_private.m15_secure()")=='0 tables and 0 functions moved to taskpulse_definer'

    # Three levels of Quest, each with Objectives (122: deeper levels are allowed, below).
    q1,l1=quest(db,'Quest')
    a=add(db,'Objective A',checklist=l1)
    q2,l2=quest(db,'Sub-quest',checklist=l1)
    b=add(db,'Objective B',checklist=l2)
    q3,l3=quest(db,'Sub-sub-quest',checklist=l2)
    c1=add(db,'Objective C1',checklist=l3); c2=add(db,'Objective C2',checklist=l3)
    # Rows in a Quest stay in its single list whatever section is sent.
    s=add(db,'Sent as setup',checklist=l2,section='setup')
    assert value(db,f"detail_section FROM public.checklist_nodes WHERE id='{s}'")=='activity'
    cl(db,'delete',{'checklist_id':l2,'node_id':s,'reason':'not needed'})
    print('PASS',db,'Quests nest three levels deep; rows in a Quest stay in its list')

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
    p=add(db,'Parent')
    if LATEST>=130:
        # 130 (user decision, 6 November 2026): no rows under an objective; rows go into a list.
        other=add(db,'Other')
        denied(db,'add',{'title':'Kid','section':'activity','parent_id':p},'Rows cannot go under an objective')
        denied(db,'submission',{'title':'Quest under a row','section':'activity','parent_id':p},'Rows cannot go under an objective')
        denied(db,'edit',{'node_id':other,'parent_id':p,'section':'activity'},'Rows cannot go under an objective')
        denied(db,'edit',{'node_id':q1,'parent_id':b,'section':'activity'},'Rows cannot go under an objective')
        cl(db,'delete',{'node_id':other,'reason':'gone'})
        print('PASS',db,'130: no row, Quest or move goes under an objective')
    else:
        k=add(db,'Kid',parent=p)
        denied(db,'edit',{'node_id':p,'parent_id':k,'section':'activity','reason':'loop'},'A row cannot move under one of its own rows')
        denied(db,'edit',{'node_id':q1,'parent_id':b,'section':'activity','reason':'into itself'},'A row cannot move under one of its own rows')
        print('PASS',db,'edit refuses moving a row or Quest under one of its own rows')

    # Delete without with_children refuses a Quest with rows; with it removes every nested list.
    denied(db,'delete',{'node_id':q1,'reason':'gone'},'This row has rows under it')
    lists=value(db,f"count(*) FROM public.task_checklists WHERE task_id='{T2}' AND owner_node_id IS NOT NULL")
    assert lists=='5',lists  # Quest, Sub-quest, Sub-sub-quest, the copy and its inner Quest
    cl(db,'delete',{'node_id':q1,'reason':'gone','with_children':True})
    assert value(db,f"count(*) FROM public.task_checklists WHERE task_id='{T2}' AND owner_node_id IS NOT NULL")=='0'
    assert value(db,f"count(*) FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE c.task_id='{T2}' AND c.owner_node_id IS NULL")==('1' if LATEST>=130 else '2')  # 'Parent' (and its 'Kid' before 130)
    assert value(db,f"count(*) FROM public.tasks WHERE id='{child}'")=='1'  # the Sub-mission itself stays
    cl(db,'delete',{'node_id':p,'reason':'gone','with_children':True})
    assert rollup(db)['errors']==[]
    print('PASS',db,'delete with_children removes nested Quest lists deepest first; the Sub-mission stays a mission')

    # Permissions are unchanged: a non-assignee cannot build Quests.
    cl(db,'submission',{'title':'Intruder','section':'activity'},uid='4',success=False)
    print('PASS',db,'non-assignee denied')

    # 122: no level limit. Five Quest levels, an objective at the bottom.
    parent=None;levels=[]
    for depth in range(1,6):
        qn,ql=quest(db,f'Level {depth}',checklist=parent);levels.append((qn,ql));parent=ql
    deep=add(db,'Deep objective',checklist=parent);tick(db,deep,parent)
    r=rollup(db)
    assert all(progress(r,qn)['progressPercentage']==100 for qn,_ in levels) and r['errors']==[],r
    assert value(db,f"count(*) FROM public.checklist_nodes WHERE id IN ({','.join(literal(x) for x,_ in levels)}) AND assignee_id='{uid_of('5')}'")=='5'
    # A Quest list cannot sit inside itself: point Level 1's list at the deep objective.
    bad=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],
        input=f"UPDATE public.task_checklists SET owner_node_id='{deep}' WHERE id='{levels[0][1]}';",text=True,capture_output=True,encoding='utf-8')
    assert bad.returncode and 'A Quest cannot sit inside itself' in bad.stderr,bad.stderr[-400:]
    cl(db,'delete',{'node_id':levels[0][0],'reason':'done','with_children':True})
    print('PASS',db,'Quests nest five levels deep; the creator owns each; a cycle is refused')

    # 122: owners. Users 4 and 8 join as Crew; the project engineer (2) observes; 6 stays outside.
    four,eight,five=uid_of('4'),uid_of('8'),uid_of('5')
    sql(db,f"INSERT INTO public.task_assignees(task_id,user_id,assignment_role,is_primary,share_units) VALUES('{T2}','{four}','Collaborator',false,0),('{T2}','{eight}','Collaborator',false,0)")
    sql(db,f"INSERT INTO public.task_reviewers(task_id,user_id,reviewer_role) VALUES('{T2}','{uid_of('2')}','Observer')")
    add(db,'Root row by a Crew member',uid='4')  # the mission's own list stays open to all Crew
    made=cl(db,'submission',{'title':'For eight','section':'activity','assignee_id':eight},uid='4')
    oq,ol=made['nodeId'],made['ownedChecklistId']
    assert value(db,f"assignee_id FROM public.checklist_nodes WHERE id='{oq}'")==eight
    denied(db,'add',{'title':'Not mine','section':'activity','checklist_id':ol},'Only this Quest',uid='4')
    own=add(db,'By the owner',checklist=ol,uid='8')
    sub=cl(db,'submission',{'title':'Child for four','section':'activity','checklist_id':ol,'assignee_id':four},uid='8')
    sq,sl=sub['nodeId'],sub['ownedChecklistId']
    add(db,'Child row by its owner',checklist=sl,uid='4')
    add(db,'Child row by the parent owner',checklist=sl,uid='8')
    denied(db,'add',{'title':'Not on this Quest','section':'activity','checklist_id':sl},'Only this Quest',uid='5')
    denied(db,'state',{'node_id':own,'state':'Yes','checklist_id':ol},'Only this Quest',uid='5')
    denied(db,'edit',{'node_id':sq,'title':'Renamed','section':'activity','reason':'x','checklist_id':ol},'Only this Quest',uid='5')
    cl(db,'edit',{'node_id':sq,'title':'Renamed by its owner','section':'activity','reason':'clearer','checklist_id':ol},uid='4')
    print('PASS',db,'the owner and owners above edit inside a Quest; other Crew are refused; root rows stay open to Crew')

    # Assignment: Crew only, by whoever may edit inside the Quest.
    denied(db,'assign',{'node_id':oq,'assignee_id':five},'Only this Quest',uid='5')
    denied(db,'assign',{'node_id':oq,'assignee_id':uid_of('6')},'must be one of the mission',uid='8')
    denied(db,'submission',{'title':'For an outsider','section':'activity','assignee_id':uid_of('6')},'must be one of the mission',uid='5')
    denied(db,'assign',{'node_id':own,'assignee_id':five,'checklist_id':ol},'Only a Quest has an owner',uid='8')
    cl(db,'assign',{'node_id':oq,'assignee_id':five},uid='8')
    assert value(db,f"assignee_id FROM public.checklist_nodes WHERE id='{oq}'")==five
    denied(db,'add',{'title':'No longer mine','section':'activity','checklist_id':ol},'Only this Quest',uid='8')
    add(db,'Still the child owner',checklist=sl,uid='4')
    assert 'Owner:' in value(db,f"protected_changes->>'reason' FROM taskpulse_private.audit_events WHERE command='checklist_assign' ORDER BY id DESC LIMIT 1")
    print('PASS',db,'assignment is Crew only, by the owner or owners above, and audited as checklist_assign')

    # Managers and the managing director always pass.
    add(db,'By the managing director',checklist=sl,uid='1')
    add(db,'By a Manager on the mission',checklist=sl,uid='2')
    cl(db,'assign',{'node_id':sq,'checklist_id':ol,'assignee_id':eight},uid='1')
    print('PASS',db,'managing director and Managers edit and assign inside any Quest')

    # The branch read: owner, canEditQuest on Quest rows and canEdit for the list.
    def branch(uid,checklist):
        lines=actor(db,uid_of(uid),f"SELECT public.checklist_branch('{T2}','{checklist}',NULL,'activity',0,30)")
        return json.loads(next(x for x in lines if x.startswith('{')))
    seen=branch('4',ol)
    row=next(x for x in seen['rows'] if x['id']==sq)
    assert seen['canEdit'] is False and row['assigneeId']==eight and row['canEditQuest'] is False,(seen['canEdit'],row)
    seen=branch('5',ol)
    assert seen['canEdit'] is True and next(x for x in seen['rows'] if x['id']==sq)['canEditQuest'] is True
    assert next(x for x in seen['rows'] if x['id']==own).get('assigneeId') is None
    print('PASS',db,'checklist_branch returns assigneeId, canEditQuest and canEdit')
    cl(db,'delete',{'node_id':oq,'reason':'done','with_children':True})
    sql(db,f"DELETE FROM public.task_reviewers WHERE task_id='{T2}'; DELETE FROM public.task_assignees WHERE task_id='{T2}' AND user_id IN ('{four}','{eight}')")

    if LATEST>=131:
        # 131: asking someone outside the Crew to own a Quest. New mission: Crew user 4 (owns its Quests), reviewer 6.
        mission=new_task(db,f'QOR{db[-4:]}')
        def qor(uid,op,node=None,invitee=None,req=None,error=None):
            q=lambda v:'NULL' if v is None else literal(v)
            r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],
                input=(f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{uid_of(uid)}',true);\n"
                       f"SELECT public.quest_owner_request_command({literal(op)},{q(node)}::uuid,{q(invitee)}::uuid,{q(req)}::uuid,'{uuid4()}');\nCOMMIT;"),
                text=True,capture_output=True,encoding='utf-8')
            if error:
                assert r.returncode and error in r.stderr,(op,error,r.stderr[-400:]);return None
            assert r.returncode==0,(op,r.stderr[-400:])
            return json.loads(next(x for x in r.stdout.splitlines() if x.startswith('{')))
        def read(uid,statement):
            return json.loads(next(x for x in actor(db,uid_of(uid),statement) if x.startswith(('[','{'))))
        outreach=checklist(db,mission,'submission',{'title':'Outreach','section':'activity'},uid='4')['nodeId']
        design=checklist(db,mission,'submission',{'title':'Design','section':'activity'},uid='4')['nodeId']
        survey=checklist(db,mission,'submission',{'title':'Survey','section':'activity'},uid='4')['nodeId']
        assert value(db,f"assignee_id FROM public.checklist_nodes WHERE id='{outreach}'")==uid_of('4')
        qor('5','request',outreach,uid_of('8'),error='Only this Quest')                    # not the owner
        qor('4','request',outreach,uid_of('6'),error='reviews the mission')
        qor('4','request',outreach,uid_of('4'),error='Choose someone else')
        qor('4','request',outreach,uid_of('7'),error='Choose an active member')             # inactive
        first=qor('4','request',outreach,uid_of('5'))
        assert first['status']=='pending'
        qor('1','request',outreach,uid_of('8'),error='already waiting for an answer')       # one at a time per Quest
        mine=read('5',"SELECT public.quest_owner_requests_mine()")
        assert [(m['questTitle'],m['taskId']) for m in mine]==[('Outreach',mission)],mine
        assert value(db,f"count(*) FROM taskpulse_private.notifications WHERE recipient_id='{uid_of('5')}' AND kind='quest_owner_request'")=='1'
        qor('8','accept',req=first['id'],error='Only the person asked')
        qor('5','decline',req=first['id'])
        qor('5','accept',req=first['id'],error='already answered')
        qor('4','request',outreach,uid_of('5'),error='declined this Quest in the last 7 days')
        print('PASS',db,'131: only the Quest\'s owner side asks, an active non-reviewer; one waiting request per Quest; a decline blocks re-asking for 7 days')
        second=qor('4','request',design,uid_of('5'))
        qor('5','accept',req=second['id'])
        assert value(db,f"count(*) FROM public.task_assignees WHERE task_id='{mission}' AND user_id='{uid_of('5')}'")=='1'
        assert value(db,f"count(DISTINCT share_units) FROM public.task_assignees WHERE task_id='{mission}'")=='1','shares stay equal'
        assert value(db,f"assignee_id FROM public.checklist_nodes WHERE id='{design}'")==uid_of('5')
        assert value(db,f"count(*) FROM taskpulse_private.audit_events WHERE command='task_people_add_crew' AND protected_changes->>'user_id'='{uid_of('5')}'")=='1'
        assert value(db,f"count(*) FROM taskpulse_private.notifications WHERE recipient_id='{uid_of('4')}' AND kind='quest_owner_answer'")=='2'
        assert read('5',"SELECT public.quest_owner_requests_mine()")==[]
        add(db,'Row by the new owner',checklist=value(db,f"id FROM public.task_checklists WHERE owner_node_id='{design}'"),uid='5')
        qor('4','request',survey,uid_of('5'),error='already on the Crew')
        print('PASS',db,'131: accepting adds the member to the Crew with equal shares and makes them the Quest\'s owner, audited and notified')
        third=qor('4','request',survey,uid_of('8'))
        seen=read('4',f"SELECT public.quest_owner_requests_for('{mission}')")
        assert [x['nodeId'] for x in seen['pending']]==[survey]
        assert uid_of('8') in [c['id'] for c in seen['candidates']] and not {uid_of('4'),uid_of('5'),uid_of('6')}&{c['id'] for c in seen['candidates']}
        expect=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-At'],
            input=f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{uid_of('3')}',true);\nSELECT public.quest_owner_requests_for('{mission}');\nCOMMIT;",
            text=True,capture_output=True,encoding='utf-8')
        assert expect.returncode and 'private to its people' in expect.stderr,expect.stderr[-300:]
        qor('8','cancel',req=third['id'],error='Only the person who asked')
        qor('4','cancel',req=third['id'])
        assert value(db,f"status FROM public.quest_owner_requests WHERE id='{third['id']}'")=='cancelled'
        assert value(db,"has_function_privilege('anon','public.quest_owner_request_command(text,uuid,uuid,uuid,uuid)','EXECUTE')")=='f'
        expect=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-At'],
            input="BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','"+uid_of('4')+"',true);\nSELECT count(*) FROM public.quest_owner_requests;\nCOMMIT;",
            text=True,capture_output=True,encoding='utf-8')
        assert expect.returncode and 'permission denied' in expect.stderr,expect.stderr[-300:]
        print('PASS',db,'131: the mission\'s people see waiting requests and who may be asked; the sender cancels; no direct table access')

print('ALL PASS checklist sub-quests (migrations 109, 122, 130 and 131)')
