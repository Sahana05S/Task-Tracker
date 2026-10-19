"""Migration 44: an empty Sub-mission is left out of its parent's progress but still gates completion.
Disposable PostgreSQL checks; JWT shim only; no hosted connection."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_f3r_fresh_test','taskpulse_f3r_upgrade_test')
T2='10000000-0000-0000-0000-000000000002'  # assignee user 5; seed checklist C2

def uid_of(short):return '00000000-0000-0000-0000-'+short.zfill(12)
def cl(db,cmd,payload,uid='5'):
    v=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{T2}'"))
    q=f"SELECT public.checklist_command('{T2}',{literal(cmd)},{literal(json.dumps(payload))}::jsonb,{v},'{uuid4()}')"
    return json.loads(next(x for x in actor(db,uid_of(uid),q) if x.startswith('{')))
def rollup(db):return json.loads(value(db,f"taskpulse_private.checklist_rollup('{T2}')"))
def node_progress(r,node):return next(x for x in r['nodeProgress'] if x['id']==node)
def migrate(db,upto,start=1):
    for m in sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0])):
        n=int(m.name.split('_')[0])
        if n<start:continue
        if n>upto:break
        sql(db,m.read_text(encoding='utf-8'))
def scenario(db):
    """A done Activity item next to an empty Sub-mission on T2's root checklist."""
    sql(db,f"DELETE FROM public.checklist_nodes WHERE checklist_id='20000000-0000-0000-0000-000000000002'")  # unsectioned seed row
    item=cl(db,'add',{'title':'Done item','section':'activity','node_type':'Item'})['nodeId']
    cl(db,'state',{'node_id':item,'state':'Yes'})
    sub=cl(db,'submission',{'title':'Empty sub','section':'activity'})
    return item,sub['nodeId'],sub['ownedChecklistId']

for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    if db==DBS[1]:
        migrate(db,43); sql(db,seed)
        item,sub,owned=scenario(db)
        r=rollup(db)
        assert r['sections']['activity']['progressPercentage'] is None and node_progress(r,sub)['applicable'] is True,r['sections']
        print('PASS',db,'before 44, an empty Sub-mission makes the parent Activity Unavailable (progress null)')
        nodes=value(db,"coalesce(jsonb_agg(to_jsonb(n) ORDER BY id),'[]') FROM public.checklist_nodes n")
        migrate(db,44,start=44)
        assert value(db,"coalesce(jsonb_agg(to_jsonb(n) ORDER BY id),'[]') FROM public.checklist_nodes n")==nodes
        print('PASS',db,'upgrade 43->44 applies without changing stored rows')
    else:
        migrate(db,44); sql(db,seed)
        print('PASS',db,'fresh install 01-44')
        item,sub,owned=scenario(db)
    assert value(db,"taskpulse_private.m15_secure()")=='0 tables and 0 functions moved to taskpulse_definer'

    # Empty Sub-mission next to a 100% item: parent Activity 100%, Sub-mission not applicable.
    r=rollup(db); act=r['sections']['activity']; s=node_progress(r,sub)
    assert act['progressPercentage']==100 and r['taskProgress']==100,act
    assert s['applicable'] is False and s['isComplete'] is False,s
    # Its own gates still block completion: the parent Activity section and the mission stay incomplete.
    assert act['isComplete'] is False and r['isComplete'] is False and act['state']=='partial',act
    assert r['errors']==[],r['errors']
    print('PASS',db,'empty Sub-mission next to a 100% item: parent Activity 100%, Sub-mission left out, parent stays incomplete')

    # One open item inside makes it count again (0%), so the parent averages 50%.
    inner=cl(db,'add',{'checklist_id':owned,'title':'Inner','section':'activity','node_type':'Item'})['nodeId']
    r=rollup(db); s=node_progress(r,sub)
    assert s['applicable'] is True and s['progressPercentage']==0 and r['sections']['activity']['progressPercentage']==50,(s,r['sections']['activity'])
    cl(db,'state',{'checklist_id':owned,'node_id':inner,'state':'Yes'})
    r=rollup(db); s=node_progress(r,sub)
    assert s['progressPercentage']==100 and r['sections']['activity']['progressPercentage']==100
    # Activity done, but the Sub-mission's Setup/Closure gates are pending: still blocked.
    assert s['isComplete'] is False and r['sections']['activity']['isComplete'] is False
    print('PASS',db,'adding an item makes the Sub-mission count again (50%, then 100%); its pending gates keep the parent Activity incomplete')

    # Once its own gates pass (manager confirms empty Setup/Closure), it completes the parent Activity.
    for role in ('setup','closure'):
        cl(db,'section',{'checklist_id':owned,'section':role,'intentional_empty':True,'reason':'none needed'},uid='1')
    r=rollup(db)
    assert node_progress(r,sub)['isComplete'] is True and r['sections']['activity']['isComplete'] is True,r['sections']['activity']
    print('PASS',db,'after the Sub-mission\'s own gates pass, the parent Activity completes')

    # An N/A-only Sub-mission also stays out of the average.
    cl(db,'state',{'checklist_id':owned,'node_id':inner,'state':'N/A'})
    r=rollup(db)
    assert node_progress(r,sub)['applicable'] is False and r['sections']['activity']['progressPercentage']==100
    print('PASS',db,'a Sub-mission whose only Activity item is N/A is left out of the average')

    # Nested: an empty Sub-mission inside a Sub-mission is left out at each level.
    outer=cl(db,'submission',{'title':'Outer','section':'activity'})
    cl(db,'submission',{'checklist_id':outer['ownedChecklistId'],'title':'Inner empty','section':'activity'})
    r=rollup(db)
    assert node_progress(r,outer['nodeId'])['applicable'] is False and node_progress(r,outer['nodeId'])['isComplete'] is False
    assert r['errors']==[] and r['sections']['activity']['progressPercentage']==100 and r['sections']['activity']['state']=='partial',(r['errors'],r['sections']['activity'])
    own=json.loads(value(db,f"taskpulse_private.checklist_result('{outer['ownedChecklistId']}')"))
    assert 'empty_unconfirmed:activity' in own['errors'],own['errors']
    print('PASS',db,'an outer Sub-mission holding only an empty Sub-mission is left out, keeps its own empty-Activity error on its page, and still blocks completion')

    # A Sub-mission emptied after use (its Activity already initialized) is left out the same way.
    cl(db,'delete',{'checklist_id':owned,'node_id':inner,'reason':'emptied'})
    r=rollup(db)
    assert r['errors']==[] and r['sections']['activity']['progressPercentage']==100 and node_progress(r,sub)['isComplete'] is False,(r['errors'],node_progress(r,sub))
    print('PASS',db,'a Sub-mission emptied after use is left out without turning the parent invalid, and is not complete')

    # Other errors inside a left-out Sub-mission still reach the parent (only its own empty-Activity notice is held back).
    sql(db,f"INSERT INTO public.checklist_nodes(checklist_id,node_type,title,detail_section) VALUES('{owned}','Item','Unsectioned',NULL)")
    r=rollup(db)
    assert any(e.startswith('unsectioned:') for e in r['errors']) and r['sections']['activity']['state']=='invalid',r['errors']
    print('PASS',db,'other errors inside a Sub-mission still mark the parent invalid')
print('ALL F3 EMPTY SUB-MISSION ROLLUP DATABASE CHECKS PASSED')
