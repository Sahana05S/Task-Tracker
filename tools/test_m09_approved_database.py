"""Approved M09 checks: disposable loopback PG only, never production credentials."""
from pathlib import Path

# Reuse the baseline shim, synthetic seed and command helpers, without its main run.
exec(compile((Path(__file__).parent/'test_m09_database.py').read_text(encoding='utf-8').split('for db in DBS:')[0], 'm09_helpers', 'exec'))
DBS=('taskpulse_m09_approved_fresh_test','taskpulse_m09_approved_upgrade_test')
for db in DBS:
    assert db in ('taskpulse_m09_approved_fresh_test','taskpulse_m09_approved_upgrade_test')
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);');sql('postgres',f'CREATE DATABASE {db};');sql(db,bootstrap)
    for migration in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        number=int(migration.name.split('_')[0])
        if number>25:break
        if number==25 and db==DBS[1]:break
        sql(db,migration.read_text(encoding='utf-8'))
    sql(db,seed)
    frozen=value(db,"(SELECT jsonb_agg(to_jsonb(s)) FROM public.monthly_performance_snapshots s)")
    if db==DBS[1]:
        guarded=new_task(db,'pre-activation');p=preview(db,'duplicate',{'sourceTaskId':guarded,'startDate':'2026-11-01'});assert not p['ready']
        sql(db,(ROOT/'supabase/migrations/25_approved_task_tools_and_dated_handoffs.sql').read_text(encoding='utf-8'))
        commit(db,p,success=False)
    assert json.loads(value(db,'config FROM taskpulse_private.tool_policy'))['id']=='m09-approved-2026-10-13'
    today=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    month=value(db,"date_trunc('month',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date)::date")
    previous=value(db,"(date_trunc('month',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date)-interval '1 month')::date")
    next_month=value(db,"(date_trunc('month',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date)+interval '1 month')::date")
    base={'supportKind':'effort','splitMode':'split-even','assigneeId':U4.strip("'"),'reason':'Approved support','startDate':today}
    for uid in ('3','4','7'):preview(db,'duplicate',{'sourceTaskId':task,'startDate':today},uid,False)
    for kind in ('effort','skill'):
      for mode,amount,percentage,expected,after in [('split-even',None,None,5,5),('split-uneven','7',None,7,3),('proportional',None,'20.5',2.05,10),('absolute','15',None,15,10)]:
        src=new_task(db,kind+'-'+mode)
        lifecycle(db,src,'progress',{'progress':40},uid='4')
        old_credit=value(db,'(SELECT sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='+literal(src)+')')
        p=preview(db,'support',{**base,'sourceTaskId':src,'supportKind':kind,'splitMode':mode,'amount':amount,'percentage':percentage});assert p['ready'],p
        op=str(uuid4());r=commit(db,p,op);assert r==commit(db,p,op);child=r['items'][0]['taskId']
        assert float(value(db,'(SELECT task_scale FROM public.tasks WHERE id='+literal(src)+')'))==after
        assert float(value(db,'(SELECT task_scale FROM public.tasks WHERE id='+literal(child)+')'))==expected
        assert value(db,'(SELECT category FROM public.tasks WHERE id='+literal(child)+')')==('SD' if kind=='skill' else 'T')
        assert old_credit==value(db,'(SELECT sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='+literal(src)+')')
        assert value(db,"(SELECT status='Not Started' AND progress_percentage=0 FROM public.tasks WHERE id="+literal(child)+')')=='t'
        if mode=='proportional':
          lifecycle(db,child,'progress',{'progress':50},uid='4');earned=value(db,'(SELECT sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='+literal(child)+')')
          lifecycle(db,src,'scale',{'mode':'manual','inputs':{'value':20},'reason':'New scale','provenance':'approved fixture'})
          assert float(value(db,'(SELECT task_scale FROM public.tasks WHERE id='+literal(child)+')'))==4.1
          assert earned==value(db,'(SELECT sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='+literal(child)+')')
          lifecycle(db,src,'scale',{'mode':'linked','inputs':{'source_task_id':child,'percentage':100},'reason':'cycle','provenance':'fixture'},success=False)
    src=new_task(db,'atomic-failure');p=preview(db,'support',{**base,'sourceTaskId':src})
    before=value(db,"jsonb_build_array((SELECT count(*) FROM public.tasks),(SELECT count(*) FROM taskpulse_private.audit_events),(SELECT count(*) FROM taskpulse_private.command_receipts),(SELECT count(*) FROM taskpulse_private.outbox_jobs))")
    sql(db,"CREATE FUNCTION public.m09_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'forced insertion' USING ERRCODE='23514';END $$;CREATE TRIGGER m09_fail BEFORE INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.m09_fail();")
    commit(db,p,success=False)
    assert float(value(db,'(SELECT task_scale FROM public.tasks WHERE id='+literal(src)+')'))==10
    assert before==value(db,"jsonb_build_array((SELECT count(*) FROM public.tasks),(SELECT count(*) FROM taskpulse_private.audit_events),(SELECT count(*) FROM taskpulse_private.command_receipts),(SELECT count(*) FROM taskpulse_private.outbox_jobs))")
    sql(db,'DROP TRIGGER m09_fail ON public.tasks;DROP FUNCTION public.m09_fail();')
    def attempt(p):
      try:commit(db,p);return True
      except AssertionError as e:assert '40001' in str(e);return False
    src=new_task(db,'split-race');plans=[preview(db,'support',{**base,'sourceTaskId':src}) for _ in range(2)]
    with ThreadPoolExecutor(max_workers=2) as pool:assert sorted(pool.map(attempt,plans))==[False,True]
    src=new_task(db,'batch-source')
    for command,params in [('duplicate',{}),('weekly',{'count':2}),('day_count',{'count':2,'phaseDays':3}),('all_team',{}),('number_suffix',{'count':3,'suffix':'Phase'})]:
      p=preview(db,command,{'sourceTaskId':src,'startDate':today,**params});assert p['ready'],p;r=commit(db,p);assert len(r['items'])==len(p['items'])
    with ThreadPoolExecutor(max_workers=2) as pool:plans=list(pool.map(lambda _:preview(db,'number_suffix',{'sourceTaskId':src,'startDate':today,'count':3,'suffix':'Race'}),[1,2]))
    assert len({i['taskTag'] for p in plans for i in p['items']})==6
    with ThreadPoolExecutor(max_workers=2) as pool:assert any(pool.map(attempt,plans))
    assert value(db,'(SELECT count(*)=count(DISTINCT task_tag) FROM public.tasks)')=='t'
    good=new_task(db,'batch-good');bad=new_task(db,'batch-bad');first,second=sorted([good,bad]);make_done_ready(db,first)
    commit(db,preview(db,'bulk_done',{'taskIds':[first,second]}),success=False)
    assert value(db,'(SELECT status FROM public.tasks WHERE id='+literal(first)+')')=='Not Started'
    commit(db,preview(db,'bulk_done',{'taskIds':[first]}))
    commit(db,preview(db,'bulk_reopen',{'taskIds':[first]}),success=False)
    commit(db,preview(db,'bulk_reopen',{'taskIds':[first],'reason':'More work'}))
    carry=new_task(db,'carry-source');lifecycle(db,carry,'transition',{'status':'In Progress'},uid='4')
    sql(db,'UPDATE public.tasks SET assigned_date='+literal(previous)+',due_date='+literal(month)+'::date-1 WHERE id='+literal(carry)+';')
    call(db,'create_task_log',carry,{'log_date':previous,'hours_worked':1,'requested_delta':40},success=False)
    # Owner-only synthetic historical share fixture; this is not an import/backfill permission.
    sql(db,'UPDATE taskpulse_private.participant_versions SET effective_at='+literal(previous)+'::timestamptz WHERE task_id='+literal(carry)+';')
    call(db,'create_task_log',carry,{'log_date':previous,'hours_worked':1,'requested_delta':40})
    before_period=source(db,previous,month);before_current=source(db,month,next_month)
    original=value(db,'(SELECT to_jsonb(t)-ARRAY[\'archived_effective_date\',\'archive_reason\',\'handoff_successor_id\',\'lifecycle_version\',\'updated_at\'] FROM public.tasks t WHERE id='+literal(carry)+')')
    payload={'sourceTaskId':carry,'startDate':today,'targetMonth':today[:7],'reason':'Carry remaining work'}
    p=preview(db,'carryover',payload);assert p['ready'] and float(p['items'][0]['scale'])==6,p
    key=str(uuid4());r=commit(db,p,key);assert r==commit(db,p,key);successor=r['items'][0]['taskId']
    assert original==value(db,'(SELECT to_jsonb(t)-ARRAY[\'archived_effective_date\',\'archive_reason\',\'handoff_successor_id\',\'lifecycle_version\',\'updated_at\'] FROM public.tasks t WHERE id='+literal(carry)+')')
    assert value(db,'(SELECT handoff_successor_id FROM public.tasks WHERE id='+literal(carry)+')')==successor
    assert float(value(db,'(SELECT sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='+literal(carry)+')'))==4
    assert value(db,"(SELECT progress_percentage=0 AND status='Not Started' AND task_scale=6 FROM public.tasks WHERE id="+literal(successor)+')')=='t'
    lifecycle(db,carry,'progress',{'progress':50},uid='4',success=False)
    lifecycle(db,carry,'review',{'approved':True},uid='6',success=False)
    call(db,'create_task_log',carry,{'log_date':today,'hours_worked':1,'requested_delta':0},success=False)
    checklist(db,carry,'add',{'title':'new work','section':'activity','node_type':'Item'},success=False)
    lifecycle(db,successor,'transition',{'status':'In Progress'},uid='4');lifecycle(db,successor,'progress',{'progress':20},uid='4')
    after_period=source(db,previous,month);after_current=source(db,month,next_month)
    assert any(t['id']==carry and t['archivedEffectiveDate']==today for t in after_current['tasks'])
    archive=new_task(db,'retained-archive');make_done_ready(db,archive);commit(db,preview(db,'bulk_done',{'taskIds':[archive]}))
    commit(db,preview(db,'archive',{'taskIds':[archive]}),success=False)
    p=preview(db,'archive',{'taskIds':[archive],'reason':'Retain redundant task'});op=str(uuid4());r=commit(db,p,op);assert r==commit(db,p,op)
    lifecycle(db,archive,'transition',{'status':'In Progress','reason':'Cannot unarchive'},success=False)
    check(db,'direct archive reset denied','UPDATE public.tasks SET archived_effective_date=NULL WHERE id='+literal(archive),uid='1',success=False)
    check(db,'physical source deletion denied','DELETE FROM public.tasks WHERE id='+literal(carry),uid='1',success=False)
    actor(db,'','SELECT public.decay_task_freshness();',role='service_role')
    assert frozen==value(db,"(SELECT jsonb_agg(to_jsonb(s)) FROM public.monthly_performance_snapshots s)")
    evidence={'contract':'m09-approved-verification','policyId':'m09-approved-2026-10-13','carryTaskId':carry,'successorTaskId':successor,'beforePeriod':before_period,'afterPeriod':after_period,'beforeCurrent':before_current,'afterCurrent':after_current}
    (ROOT/'docs/plans/fixtures'/('m09-approved-'+('fresh' if db==DBS[0] else 'upgrade')+'.json')).write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf-8')
    print('PASS',db,'approved all8; fractional proportional; retained credit; rollback; retries; races; copies/batches; carryover6/0 with old4; archived read-only; histories/frozen snapshots; freshness worker',flush=True)
