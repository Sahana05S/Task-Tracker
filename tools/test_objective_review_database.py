"""Migration 114: objective review and Work needed (plan section 6, 3 November 2026).
Who may decide (managers, Primary / Secondary reviewers; never Observers, never one's own tick),
the double-decision guards (decided objectives and the mission version), Work needed needs a note
and puts the tick back to No, ticks reset the review, Done is refused while an objective is pending
or has work needed, notifications, the read, and D-D3 (logs no longer clear approvals).
Fresh install and upgrade. Disposable PostgreSQL; JWT shim only; no hosted connection."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
ROOT=Path(__file__).resolve().parents[1]
from uuid import uuid4

DBS=('taskpulse_m114_fresh_test','taskpulse_m114_upgrade_test')
T1='10000000-0000-0000-0000-000000000001'  # assignee user 4; its seed reviewer is removed below
T2='10000000-0000-0000-0000-000000000002'  # assignee user 5; seed checklist C2
C2='20000000-0000-0000-0000-000000000002'
MIGRATIONS=sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0]))

def u(short):return '00000000-0000-0000-0000-'+short.zfill(12)
def run_as(db,uid,statement):
    return subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],
        input=f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{uid}',true);\n{statement.rstrip(';')};\nCOMMIT;",
        text=True,capture_output=True,encoding='utf-8')
def version(db,task=T2):return int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{task}'"))
def cl_sql(cmd,payload,v,task=T2,op=None):
    return f"SELECT public.checklist_command('{task}',{literal(cmd)},{literal(json.dumps(payload))}::jsonb,{v},'{op or uuid4()}')"
def cl(db,cmd,payload,uid='5',task=T2,v=None):
    r=run_as(db,u(uid),cl_sql(cmd,payload,version(db,task) if v is None else v,task))
    assert r.returncode==0,(cmd,payload,uid,r.stderr[-600:])
    return json.loads(next(x for x in r.stdout.splitlines() if x.startswith('{')))
def refused(db,cmd,payload,uid,code,text=None,task=T2,v=None):
    before=(version(db,task),value(db,"count(*) FROM taskpulse_private.audit_events"))
    r=run_as(db,u(uid),cl_sql(cmd,payload,version(db,task) if v is None else v,task))
    assert r.returncode and code in r.stderr and (text is None or text in r.stderr),(cmd,uid,r.stderr[-600:])
    assert (version(db,task),value(db,"count(*) FROM taskpulse_private.audit_events"))==before,'a refusal writes nothing'
def node(db,nid):return json.loads(value(db,f"to_jsonb(n) FROM public.checklist_nodes n WHERE id='{nid}'"))
def add(db,title,uid='5',task=T2):return cl(db,'add',{'title':title,'section':'activity'},uid=uid,task=task)['nodeId']
def tick(db,nid,state,uid='5',task=T2):return cl(db,'state',{'node_id':nid,'state':state},uid=uid,task=task)
def review(db,nid,decision,uid,note=None):
    payload={'node_id':nid,'decision':decision}
    if note is not None:payload['note']=note
    return cl(db,'review',payload,uid=uid)
def notes(db,kind,recipient=None):
    extra=f" AND recipient_id='{u(recipient)}'" if recipient else ''
    return int(value(db,f"count(*) FROM taskpulse_private.notifications WHERE kind='{kind}'{extra}"))
def reviews(db,uid,task=T2):
    r=run_as(db,u(uid),f"SELECT public.checklist_reviews('{task}')")
    assert r.returncode==0,r.stderr[-400:]
    return json.loads(next(x for x in r.stdout.splitlines() if x.startswith('{')))
def done_gate(db,task=T2):
    r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-At'],
        input=f"SELECT taskpulse_private.assert_checklist_done('{task}')",text=True,capture_output=True,encoding='utf-8')
    return r.stderr

for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    every=[int(m.name.split('_')[0]) for m in MIGRATIONS]
    if db==DBS[1]:
        for m in MIGRATIONS:
            if int(m.name.split('_')[0])<114:sql(db,m.read_text(encoding='utf-8'))
        sql(db,seed)
        sql(db,f"DELETE FROM public.checklist_nodes WHERE checklist_id='{C2}'")
        sql(db,f"INSERT INTO public.task_reviewers(task_id,user_id,reviewer_role) VALUES('{T2}','{u('4')}','Primary')")
        old=add(db,'Ticked before 114'); tick(db,old,'Yes')
        for m in MIGRATIONS:
            if int(m.name.split('_')[0])>=114:sql(db,m.read_text(encoding='utf-8'))
        n=node(db,old)
        assert (n['completion_state'],n['review_state'],n['reviewed_by'])==('Yes','none',None),n
        assert value(db,"count(*) FROM pg_trigger WHERE tgname='m03_invalidate_log_review'")=='0'
        print('PASS',db,'upgrade to 114 keeps every tick; existing Yes rows start unreviewed (none), so no open mission is held up')
        sql(db,f"DELETE FROM public.task_reviewers WHERE task_id='{T2}'")
        sql(db,f"DELETE FROM public.checklist_nodes WHERE id='{old}'")
    else:
        for m in MIGRATIONS:sql(db,m.read_text(encoding='utf-8'))
        sql(db,seed)
        sql(db,f"DELETE FROM public.checklist_nodes WHERE checklist_id='{C2}'")
        print('PASS',db,f'fresh install 01-{every[-1]} including 114')

    assert value(db,"taskpulse_private.m15_secure()")=='0 tables and 0 functions moved to taskpulse_definer'
    assert value(db,"has_function_privilege('authenticated','public.checklist_reviews(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.checklist_reviews(uuid)','EXECUTE')")=='t'
    assert value(db,"has_column_privilege('authenticated','public.checklist_nodes','review_state','UPDATE')")=='f'
    print('PASS',db,'definer-owned, the read is for signed-in users only, the review columns are not directly writable')

    # A mission with no Primary / Secondary reviewer: Yes needs no review.
    sql(db,f"BEGIN; SET CONSTRAINTS ALL DEFERRED; DELETE FROM public.task_reviewers WHERE task_id='{T1}'; UPDATE public.tasks SET reviewer_id=NULL WHERE id='{T1}'; COMMIT;")
    t1=add(db,'No reviewer here',uid='4',task=T1)
    tick(db,t1,'Yes',uid='4',task=T1)
    assert node(db,t1)['review_state']=='none'
    # An Observer alone does not make ticks wait.
    sql(db,f"INSERT INTO public.task_reviewers(task_id,user_id,reviewer_role) VALUES('{T2}','{u('6')}','Observer')")
    a=add(db,'Survey'); tick(db,a,'Yes')
    assert node(db,a)['review_state']=='none'
    tick(db,a,'No')
    print('PASS',db,'Yes on a mission without a Primary or Secondary reviewer (or only an Observer) needs no review')

    sql(db,f"INSERT INTO public.task_reviewers(task_id,user_id,reviewer_role) VALUES('{T2}','{u('4')}','Primary'),('{T2}','{u('8')}','Secondary')")
    b=add(db,'Drawings'); c=add(db,'Site photos'); d=add(db,'Estimate')
    tick(db,a,'Yes')
    assert node(db,a)['review_state']=='pending' and node(db,a)['completed_by']==u('5')
    assert (notes(db,'objective_review','4'),notes(db,'objective_review','8'),notes(db,'objective_review','6'),notes(db,'objective_review','5'))==(1,1,0,0)
    tick(db,b,'Yes')
    assert node(db,b)['review_state']=='pending' and notes(db,'objective_review')==2,'reviewers hear once per mission per day'
    print('PASS',db,'Yes waits for review; Primary and Secondary reviewers are told once per mission per day, never the Observer')

    # Who may decide.
    refused(db,'review',{'node_id':a,'decision':'acknowledged'},'6','42501','Primary or Secondary')
    refused(db,'review',{'node_id':a,'decision':'acknowledged'},'3','42501')
    refused(db,'review',{'node_id':a,'decision':'acknowledged'},'5','42501')
    refused(db,'review',{'node_id':a,'decision':'acknowledged'},'7','42501')
    tick(db,c,'Yes',uid='1')
    refused(db,'review',{'node_id':c,'decision':'acknowledged'},'1','42501','you ticked')
    cl(db,'review',{'node_id':c,'decision':'acknowledged'},uid='2')
    n=node(db,c)
    assert (n['review_state'],n['reviewed_by'],n['completion_state'])==('acknowledged',u('2'),'Yes')
    print('PASS',db,'Observers, data managers, assignees and inactive accounts are refused (42501); nobody decides their own tick; a project engineer acknowledges')

    # Input checks.
    refused(db,'review',{'node_id':a,'decision':'work_needed'},'4','23514','what work')
    refused(db,'review',{'node_id':a,'decision':'work_needed','note':'   '},'4','23514','what work')
    refused(db,'review',{'node_id':a,'decision':'approve'},'4','23514')
    refused(db,'review',{'node_id':a,'decision':'acknowledged','note':'x'*1001},'4','23514')
    refused(db,'review',{'node_id':a,'decision':'acknowledged','extra':1},'4','23514','Unexpected')
    refused(db,'review',{'node_id':d,'decision':'acknowledged'},'4','23514','not waiting')
    print('PASS',db,'Work needed needs a note; unknown decisions, long notes, extra fields and unticked objectives are refused')

    # Work needed resets the tick through the state path.
    progress_before=value(db,f"progress_percentage FROM public.tasks WHERE id='{T2}'")
    review(db,a,'work_needed','4','Add the north elevation')
    n=node(db,a)
    assert (n['completion_state'],n['is_complete'],n['review_state'],n['review_note'],n['reviewed_by'])==('No',False,'work_needed','Add the north elevation',u('4')),n
    assert value(db,f"progress_percentage FROM public.tasks WHERE id='{T2}'")!=progress_before,'progress follows the tick back to No'
    assert notes(db,'objective_work_needed','5')==1
    audit=json.loads(value(db,"to_jsonb(a) FROM taskpulse_private.audit_events a WHERE command='checklist_review' ORDER BY occurred_at DESC LIMIT 1"))
    assert audit['protected_changes']['reason']=='Work needed: Add the north elevation' and audit['actor_id']==u('4'),audit
    print('PASS',db,'Work needed sets the tick back to No (progress follows), keeps the note, tells the assignee and is audited as checklist_review')

    # No double decision.
    refused(db,'review',{'node_id':a,'decision':'acknowledged'},'8','23514','not waiting')
    v=version(db)
    review(db,b,'acknowledged','4')
    refused(db,'review',{'node_id':b,'decision':'work_needed','note':'No'},'8','PT409',v=v)
    refused(db,'review',{'node_id':b,'decision':'work_needed','note':'No'},'8','23514','not waiting')
    print('PASS',db,'a decided objective is not decided again, and a stale mission version is refused (PT409)')

    # Done is refused while anything is pending or has work needed.
    for x in (d,):tick(db,x,'N/A')
    assert 'every objective reviewed: 0 waiting for review, 1 with work needed' in done_gate(db),done_gate(db)
    tick(db,a,'Yes')
    n=node(db,a)
    assert (n['review_state'],n['review_note'],n['reviewed_by'])==('pending',None,None)
    assert 'every objective reviewed: 1 waiting for review, 0 with work needed' in done_gate(db),done_gate(db)
    data=reviews(db,'8')
    assert data['canDecide'] and [r['nodeId'] for r in data['reviews'] if r['state']=='pending']==[a]
    assert not reviews(db,'6')['canDecide'] and not reviews(db,'5')['canDecide'] and reviews(db,'1')['canDecide']
    review(db,a,'acknowledged','8','Looks right')
    assert node(db,a)['review_note']=='Looks right'
    gate=done_gate(db)
    assert 'every objective reviewed' not in gate and 'reviewer approval' in gate,gate
    print('PASS',db,'Done is refused while an objective is pending or has work needed; once acknowledged the mission approval is the last step')

    # Any later tick change resets the review.
    tick(db,b,'No')
    assert node(db,b)['review_state']=='none' and node(db,b)['reviewed_by'] is None
    tick(db,b,'N/A')
    assert node(db,b)['review_state']=='none'
    print('PASS',db,'changing a decided tick clears its review')

    # D-D3: a time log no longer clears mission approvals.
    assert value(db,"count(*) FROM pg_trigger WHERE tgname='m03_invalidate_log_review'")=='0'
    assert value(db,"count(*) FROM pg_trigger WHERE tgname='m03_invalidate_checklist_review'")=='1'
    print('PASS',db,'D-D3: logs no longer clear the mission approval; checklist changes still do')
print('ALL PASS objective review')
