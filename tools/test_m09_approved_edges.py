"""Focused approved M09 source/inheritance and archive propagation checks."""
from pathlib import Path
exec(compile((Path(__file__).parent/'test_m09_database.py').read_text(encoding='utf-8').split('for db in DBS:')[0], 'm09_helpers', 'exec'))
m09_new_task=new_task
def new_task(db,tag):return m09_new_task(db,tag+'-'+str(uuid4())[:6])
DBS=('taskpulse_m09_approved_fresh_test','taskpulse_m09_approved_upgrade_test')
def details(db,tid,cmd,payload,success=True):
    version=int(value(db,'lifecycle_version FROM public.tasks WHERE id='+literal(tid)))
    q='SELECT public.task_details_command('+literal(tid)+','+literal(cmd)+','+literal(json.dumps(payload))+'::jsonb,'+str(version)+','+literal(uuid4())+');'
    return actor(db,'00000000-0000-0000-0000-000000000001',q,success)
for db in DBS:
    assert db in ('taskpulse_m09_approved_fresh_test','taskpulse_m09_approved_upgrade_test')
    today=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    shaped=new_task(db,'edge-inheritance');linked=new_task(db,'edge-linked')
    make_done_ready(db,linked);commit(db,preview(db,'bulk_done',{'taskIds':[linked]}))
    for section,state in [('setup','Yes'),('closure','N/A')]:
      n=checklist(db,shaped,'add',{'title':section+' work','section':section,'node_type':'Item'})['nodeId']
      checklist(db,shaped,'state',{'node_id':n,'state':state},uid='4')
    checklist(db,shaped,'add',{'title':'Old linked work','section':'activity','node_type':'Task','linked_task_id':linked})
    details(db,shaped,'save',{'description':'Retained description','smart_specific':'Old SMART content'})
    details(db,shaped,'link',{'ipo_role':'reference','link_type':'Folder','label':'Manual source link','url':'https://example.test/source-folder'})
    p=preview(db,'duplicate',{'sourceTaskId':shaped,'startDate':today});child=commit(db,p)['items'][0]['taskId']
    assert value(db,'(SELECT bool_and(n.completion_state=\'No\' AND NOT n.is_complete AND n.linked_task_id IS NULL AND n.node_type<>\'Task\') FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE c.task_id='+literal(child)+')')=='t'
    assert value(db,'(SELECT count(*) FROM public.task_links WHERE task_id='+literal(child)+')')=='0'
    assert value(db,'(SELECT content FROM public.task_detail_sections WHERE task_id='+literal(child)+" AND key_name='description')")=='Retained description'
    assert value(db,'(SELECT content IS NULL FROM public.task_detail_sections WHERE task_id='+literal(child)+" AND key_name='smart_specific')")=='t'
    assert value(db,'(SELECT a.template_version_id=b.template_version_id AND a.task_id<>b.task_id FROM public.task_detail_instances a,public.task_detail_instances b WHERE a.task_id='+literal(shaped)+' AND b.task_id='+literal(child)+')')=='t'
    root=new_task(db,'edge-scale-root');derived=new_task(db,'edge-frozen-derived')
    lifecycle(db,derived,'scale',{'mode':'linked','inputs':{'source_task_id':root,'percentage':20},'reason':'Linked source','provenance':'approved edge fixture'})
    commit(db,preview(db,'archive',{'taskIds':[derived],'reason':'Retain archived derivation'}))
    frozen=value(db,'(SELECT to_jsonb(t) FROM public.tasks t WHERE id='+literal(derived)+')')
    lifecycle(db,root,'scale',{'mode':'manual','inputs':{'value':20},'reason':'New live source','provenance':'edge fixture'})
    assert frozen==value(db,'(SELECT to_jsonb(t) FROM public.tasks t WHERE id='+literal(derived)+')')
    details(db,derived,'save',{'description':'Cannot edit archive'},success=False)
    running=new_task(db,'edge-running');started=call(db,'start_task_timer',running,{})
    p=preview(db,'archive',{'taskIds':[running],'reason':'Must stop timer first'});assert not p['ready'] and 'stop_running_timer_before_archive' in p['reasons'];commit(db,p,success=False)
    timer_id=started['timerId'];timer_version=int(value(db,'execution_version FROM public.task_timers WHERE id='+literal(timer_id)))
    call(db,'discard_task_timer',timer_id,{'reason':'End synthetic timer'},version=timer_version)
    p=preview(db,'archive',{'taskIds':[running],'reason':'Timer stopped'});assert p['ready'];commit(db,p)
    refresh=new_task(db,'edge-refresh');before=value(db,'(SELECT jsonb_build_array(assigned_date,due_date,progress_percentage,freshness) FROM public.tasks WHERE id='+literal(refresh)+')')
    p=preview(db,'refresh',{'taskIds':[refresh]},uid='4');r=commit(db,p,uid='4');assert r['items'][0]['status']=='shared_recomputation_queued'
    assert before==value(db,'(SELECT jsonb_build_array(assigned_date,due_date,progress_percentage,freshness) FROM public.tasks WHERE id='+literal(refresh)+')')
    whole=new_task(db,'edge-whole-zero');lifecycle(db,whole,'transition',{'status':'In Progress'},uid='4')
    call(db,'create_task_log',whole,{'log_date':today,'hours_worked':1,'requested_delta':40})
    p=preview(db,'support',{'sourceTaskId':whole,'startDate':today,'supportKind':'effort','splitMode':'split-uneven','amount':'10','assigneeId':U4.strip("'"),'reason':'Transfer whole source'})
    assert p['ready'];commit(db,p)
    assert float(value(db,'(SELECT task_scale FROM public.tasks WHERE id='+literal(whole)+')'))==0
    assert float(value(db,'(SELECT sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='+literal(whole)+')'))==4
    month=value(db,"date_trunc('month',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date)::date")
    end=value(db,"(date_trunc('month',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date)+interval '1 month')::date")
    observed=next(t for t in source(db,month,end)['tasks'] if t['id']==whole)
    assert float(observed['periodCredits'][U4.strip("'")])==4
    print('PASS',db,'Yes/N/A/linked copy resets; exact template/description; no shared assets; archived derived-scale freeze; detail denial; running-timer guard; shared refresh',flush=True)
