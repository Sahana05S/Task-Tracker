"""Migration 63: one kind of checklist row. Sub-missions fold in, any row can have rows under it,
sections count once they have a row. Disposable PostgreSQL checks; JWT shim only; no hosted connection."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
ROOT=Path(__file__).resolve().parents[1]
from uuid import uuid4

DBS=('taskpulse_m63_fresh_test','taskpulse_m63_upgrade_test')
T1='10000000-0000-0000-0000-000000000001'
T2='10000000-0000-0000-0000-000000000002'  # assignee user 5; seed checklist C2
C2='20000000-0000-0000-0000-000000000002'

def uid_of(short):return '00000000-0000-0000-0000-'+short.zfill(12)
def cl(db,cmd,payload,uid='5',success=True,op=None,task=T2):
    v=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{task}'"))
    q=f"SELECT public.checklist_command('{task}',{literal(cmd)},{literal(json.dumps(payload))}::jsonb,{v},'{op or uuid4()}')"
    lines=actor(db,uid_of(uid),q,success)
    if success:return json.loads(next(x for x in lines if x.startswith('{')))
def rollup(db,task=T2):return json.loads(value(db,f"taskpulse_private.checklist_rollup('{task}')"))
def node(db,nid):return json.loads(value(db,f"to_jsonb(n) FROM public.checklist_nodes n WHERE id='{nid}'"))
def progress(r,nid):return next(x for x in r['nodeProgress'] if x['id']==nid)
def migrate(db,upto,start=1):
    for m in sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0])):
        n=int(m.name.split('_')[0])
        if n<start:continue
        if n>upto:break
        sql(db,m.read_text(encoding='utf-8'))
def add(db,title,section='activity',parent=None,uid='5',**extra):
    payload={'title':title,'section':section,**extra}
    if parent:payload['parent_id']=parent
    return cl(db,'add',payload,uid=uid)['nodeId']

def legacy_scenario(db):
    """Built with the 62 commands: a sole 'Activity' section group holding items and
    Sub-missions (one nested, one empty), a Setup item, and an empty root Page in Closure."""
    sql(db,f"DELETE FROM public.checklist_nodes WHERE checklist_id='{C2}'")  # unsectioned seed row
    group=add(db,'Activity',node_type='Group')
    a1=add(db,'A1',parent=group,node_type='Item'); cl(db,'state',{'node_id':a1,'state':'Yes'})
    a2=add(db,'A2',parent=group,node_type='Item')
    s1=cl(db,'submission',{'title':'S1','section':'activity','parent_id':group})
    s1s=add(db,'S1 setup',section='setup',checklist_id=s1['ownedChecklistId'],node_type='Item')
    cl(db,'state',{'checklist_id':s1['ownedChecklistId'],'node_id':s1s,'state':'Yes'})
    s1a=add(db,'S1 done',checklist_id=s1['ownedChecklistId'],node_type='Item')
    cl(db,'state',{'checklist_id':s1['ownedChecklistId'],'node_id':s1a,'state':'Yes'})
    s1b=add(db,'S1 open',checklist_id=s1['ownedChecklistId'],node_type='Item')
    s2=cl(db,'submission',{'title':'S2','section':'activity','checklist_id':s1['ownedChecklistId']})
    s2a=add(db,'S2 done',checklist_id=s2['ownedChecklistId'],node_type='Item')
    cl(db,'state',{'checklist_id':s2['ownedChecklistId'],'node_id':s2a,'state':'Yes'})
    s3=cl(db,'submission',{'title':'S3 empty','section':'activity','parent_id':group})
    p2=add(db,'P2',parent=group,node_type='Page'); p2c=add(db,'P2 child',parent=p2,node_type='Item')
    sql(db,f"UPDATE public.checklist_nodes SET completion_state='N/A' WHERE id='{p2}'")  # legacy: a page marked N/A
    u1=add(db,'U1',section='setup',node_type='Item'); cl(db,'state',{'node_id':u1,'state':'Yes'})
    page=add(db,'Closure docs',section='closure',node_type='Page')
    return dict(group=group,a1=a1,a2=a2,s1=s1['nodeId'],s1_owned=s1['ownedChecklistId'],s1s=s1s,s1a=s1a,s1b=s1b,
                s2=s2['nodeId'],s2a=s2a,s3=s3['nodeId'],u1=u1,page=page,p2=p2,p2c=p2c)

for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    if db==DBS[1]:
        migrate(db,62); sql(db,seed)
        ids=legacy_scenario(db)
        before=rollup(db)
        assert before['errors']==[] and abs(before['taskProgress']-(100+0+200/3)/3)<1e-9,before
        # A current reviewer approval and a current projection before the upgrade.
        rev=int(value(db,f"work_revision FROM public.tasks WHERE id='{T2}'"))
        sql(db,f"INSERT INTO public.task_reviewers(task_id,user_id,review_approved,reviewed_at,reviewed_revision) VALUES('{T2}','{uid_of('6')}',true,now(),{rev})")
        credits=value(db,"count(*) FROM taskpulse_private.checklist_credit_events")
        migrate(db,63,start=63)
        print('PASS',db,'upgrade 62->63 applies')

        assert value(db,"count(*) FROM public.task_checklists WHERE owner_node_id IS NOT NULL")=='0'
        root=value(db,f"id FROM public.task_checklists WHERE task_id='{T2}'")
        for key in ('a1','a2','s1','s1s','s1a','s1b','s2','s2a','s3','u1','page'):
            assert node(db,ids[key])['checklist_id']==root,key
        assert value(db,f"count(*) FROM public.checklist_nodes WHERE id='{ids['group']}'")=='0'
        assert node(db,ids['a1'])['parent_node_id'] is None and node(db,ids['s1'])['parent_node_id'] is None
        assert node(db,ids['s1a'])['parent_node_id']==ids['s1'] and node(db,ids['s2'])['parent_node_id']==ids['s1']
        assert node(db,ids['s2a'])['parent_node_id']==ids['s2']
        wrap=node(db,node(db,ids['s1s'])['parent_node_id'])
        assert wrap['title']=='S1' and wrap['detail_section']=='setup' and wrap['parent_node_id'] is None,wrap
        assert node(db,ids['s3'])['completion_state']=='N/A' and node(db,ids['page'])['completion_state']=='N/A'
        print('PASS',db,'Sub-missions fold in: Activity under the row, Setup under a row named after it; section group dissolved; empty rows N/A')

        after=rollup(db)
        assert after['errors']==[] and after['taskProgress']==before['taskProgress'],(before['taskProgress'],after)
        assert value(db,"count(*) FROM taskpulse_private.checklist_credit_events")==credits
        sql(db,f"SELECT taskpulse_private.refresh_task_metrics('{T2}','{uuid4()}',current_date)")
        assert value(db,f"review_approved::text||':'||(reviewed_revision=(SELECT work_revision FROM public.tasks WHERE id='{T2}'))::text FROM public.task_reviewers WHERE task_id='{T2}'")=='true:true'
        assert int(value(db,f"work_revision FROM public.tasks WHERE id='{T2}'"))==rev
        print('PASS',db,'Activity progress unchanged, no credit, approvals survive the next refresh')
        sql(db,f"DELETE FROM public.task_reviewers WHERE task_id='{T2}'")

        assert node(db,ids['p2c'])['completion_state']=='N/A' and node(db,ids['p2'])['completion_state']=='No'
        print('PASS',db,'a legacy N/A page keeps its figure: its rows become N/A')

        # Failure path: when a patched function has drifted, 63 aborts and leaves 62 intact.
        abort_db='taskpulse_m63_abort_test'
        sql('postgres',f'DROP DATABASE IF EXISTS {abort_db} WITH (FORCE);'); sql('postgres',f'CREATE DATABASE {abort_db}'); sql(abort_db,bootstrap)
        migrate(abort_db,62); sql(abort_db,seed)
        sql(abort_db,"""DO $$ DECLARE d text; BEGIN d:=pg_get_functiondef('taskpulse_private.refresh_task_metrics(uuid,uuid,date)'::regprocedure);
         EXECUTE replace(d,'fingerprint:=rollup||','fingerprint:= rollup||'); END $$;""")
        nodes=value(abort_db,"coalesce(jsonb_agg(to_jsonb(n) ORDER BY id),'[]') FROM public.checklist_nodes n")
        result=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',abort_db,'-v','ON_ERROR_STOP=1','-At'],
            input=(ROOT/'supabase/migrations/63_checklist_one_row_kind.sql').read_text(encoding='utf-8'),text=True,capture_output=True,encoding='utf-8')
        assert result.returncode and 'fingerprint changed; update migration 63' in result.stderr,result.stderr[-500:]
        assert value(abort_db,"coalesce(jsonb_agg(to_jsonb(n) ORDER BY id),'[]') FROM public.checklist_nodes n")==nodes
        assert value(abort_db,"count(*) FROM pg_trigger WHERE tgname='ab_submission_node'")=='1'
        assert value(abort_db,"count(*) FROM pg_constraint WHERE conname='m63_no_owned_checklists'")=='0'
        print('PASS',abort_db,'a drifted function aborts 63 in one transaction; 62 stays intact')
        sql('postgres',f'DROP DATABASE IF EXISTS {abort_db} WITH (FORCE);')
    else:
        migrate(db,63); sql(db,seed)
        sql(db,f"DELETE FROM public.checklist_nodes WHERE checklist_id='{C2}'")
        print('PASS',db,'fresh install 01-63')
    assert value(db,"taskpulse_private.m15_secure()")=='0 tables and 0 functions moved to taskpulse_definer'

    # Retired commands.
    for cmd,payload in (('submission',{'title':'S','section':'activity'}),('section',{'section':'setup','intentional_empty':True,'reason':'x'})):
        cl(db,cmd,payload,uid='1',success=False)
    print('PASS',db,'submission and section review are refused')

    # Any row can have rows under it; adding clears the parent's own tick.
    x=add(db,'X'); cl(db,'state',{'node_id':x,'state':'Yes'})
    y=add(db,'Y',parent=x)
    assert node(db,x)['completion_state']=='No' and node(db,y)['node_type']=='Item'
    r=rollup(db); assert progress(r,x)['progressPercentage']==0 and progress(r,x)['applicable'] is True,progress(r,x)
    cl(db,'state',{'node_id':x,'state':'Yes'},success=False)
    cl(db,'state',{'node_id':y,'state':'Yes'}); assert progress(rollup(db),x)['progressPercentage']==100
    z=add(db,'Z',parent=y)  # nest an item under an item under an item
    assert progress(rollup(db),x)['progressPercentage']==0 and node(db,y)['completion_state']=='No'
    cl(db,'delete',{'node_id':z,'reason':'not needed'})
    cl(db,'state',{'node_id':y,'state':'Yes'})
    cl(db,'delete',{'node_id':y,'reason':'not needed'})
    cl(db,'state',{'node_id':x,'state':'Yes'})
    assert progress(rollup(db),x)['progressPercentage']==100
    print('PASS',db,'add under any row clears its tick; its progress follows its rows; removing them makes it tickable again')

    # An empty nested row is just an open leaf; no error.
    w=add(db,'W',parent=x); r=rollup(db)
    assert r['errors']==[] and progress(r,w)['progressPercentage']==0 and progress(r,x)['progressPercentage']==0
    # Move a root row under another row (edit); the new parent's tick clears.
    cl(db,'state',{'node_id':w,'state':'Yes'})
    m=add(db,'Movable'); cl(db,'state',{'node_id':m,'state':'Yes'})
    cl(db,'edit',{'node_id':m,'parent_id':w,'section':'activity','reason':'belongs under W'})
    assert node(db,m)['parent_node_id']==w and node(db,w)['completion_state']=='No'
    assert progress(rollup(db),w)['progressPercentage']==100
    cl(db,'edit',{'node_id':m,'parent_id':m,'section':'activity','reason':'loop'},success=False)
    print('PASS',db,'empty rows under a row are open leaves (no error); move under a row; no self parent')

    # Branch read opens any non-linked row.
    b=json.loads(next(l for l in actor(db,uid_of('5'),f"SELECT public.checklist_branch('{T2}',NULL,'{x}','activity',0,30)") if l.startswith('{')))
    assert [row['id'] for row in b['rows']]==[w] and b['rows'][0]['childCount']==1,b['rows']

    # Links: managers only; a linked row stays a leaf.
    leaf=add(db,'Linked later')
    cl(db,'edit',{'node_id':leaf,'parent_id':None,'section':'activity','linked_task_id':T1,'reason':'tracks T1'},uid='5',success=False)
    cl(db,'edit',{'node_id':leaf,'parent_id':None,'section':'activity','linked_task_id':T1,'node_type':'Item','reason':'tracks T1'},uid='1')
    assert node(db,leaf)['linked_task_id']==T1
    cl(db,'add',{'title':'under link','section':'activity','parent_id':leaf},success=False)
    cl(db,'edit',{'node_id':leaf,'parent_id':None,'section':'activity','linked_task_id':None,'node_type':'Item','reason':'unlink'},uid='1')
    print('PASS',db,'branch opens any row; only managers link; linked rows take no rows under them')

    # Permissions and replay.
    cl(db,'add',{'title':'intruder','section':'activity'},uid='4',success=False)
    cl(db,'add',{'title':'inactive','section':'activity'},uid='7',success=False)
    op=str(uuid4()); v=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{T2}'"))
    once=f"SELECT public.checklist_command('{T2}','add',{literal(json.dumps({'title':'Once','section':'activity'}))}::jsonb,{v},'{op}')"
    first,again=(json.loads(next(x for x in actor(db,uid_of('5'),once) if x.startswith('{'))) for _ in range(2))
    assert again==first and value(db,"count(*) FROM public.checklist_nodes WHERE title='Once'")=='1'
    print('PASS',db,'non-assignee and inactive callers denied; a replayed operation returns the same result')

    # Empty sections are N/A and do not block Done; Activity owns progress without section reviews.
    sql(db,f"UPDATE public.checklist_nodes SET completion_state='Yes',is_complete=true WHERE checklist_id=(SELECT id FROM public.task_checklists WHERE task_id='{T2}') AND NOT EXISTS(SELECT 1 FROM public.checklist_nodes c WHERE c.parent_node_id=checklist_nodes.id) AND detail_section='activity'")
    if db==DBS[1]:  # the folded Setup/Closure rows still gate Done
        sql(db,"UPDATE public.checklist_nodes SET completion_state='No' WHERE title='S1 setup'")
        r=rollup(db); assert r['isComplete'] is False and r['sections']['setup']['state']=='partial',r['sections']
        sql(db,"UPDATE public.checklist_nodes SET completion_state='Yes' WHERE title='S1 setup'")
    r=rollup(db)
    assert r['taskProgress']==100 and r['isComplete'] is True and r['sections']['closure']['state']=='not_applicable',r['sections']
    cl(db,'mode',{'enabled':True,'reason':'Activity drives progress','preview_progress':r['taskProgress']},uid='1')
    assert value(db,f"progress_owner||':'||(progress_percentage=100)::text FROM public.tasks WHERE id='{T2}'")=='checklist:true'
    sql(db,f"SELECT taskpulse_private.assert_checklist_done('{T2}')")
    print('PASS',db,'empty sections are N/A; Activity owns progress without section review; the Done gate passes')

    # A mission with no checklist still blocks Done.
    assert rollup(db,T1)['isComplete'] is False
    sql(db,f"DELETE FROM public.task_checklists WHERE task_id='{T1}'")
    r=rollup(db,T1); assert r['isComplete'] is False and r['sections']['activity']['state']=='missing',r
    print('PASS',db,'no checklist: sections missing, Done blocked')

print('ALL PASS m63 checklist rows')
