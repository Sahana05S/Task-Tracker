"""M14 nested checklist pages: disposable PostgreSQL checks. JWT shim only; no hosted connection."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_m14_fresh_test','taskpulse_m14_upgrade_test')
T1='10000000-0000-0000-0000-000000000001'
T2='10000000-0000-0000-0000-000000000002'
LEGACY='30000000-0000-0000-0000-000000000001'

def cl(db,cmd,payload,uid='4',success=True,tid=T1):
    """checklist_command as a JWT subject; returns the result payload on success."""
    version=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{tid}'"))
    q=f"SELECT public.checklist_command('{tid}',{literal(cmd)},{literal(json.dumps(payload))}::jsonb,{version},'{uuid4()}')"
    lines=actor(db,'00000000-0000-0000-0000-'+uid.zfill(12),q,success)
    if success:return json.loads(next(x for x in lines if x.startswith('{')))

def node(db,node_id,cols='title,node_type,parent_node_id,detail_section,links,estimated_minutes,completion_state'):
    return value(db,f"row_to_json(n) FROM (SELECT {cols} FROM public.checklist_nodes WHERE id='{node_id}') n")

def first_json(rows):
    return json.loads(next(x for x in rows if x.startswith('{')))

def start_plain(db,uid='4'):
    """Ordinary task timer on T1; returns its id."""
    return first_json(actor(db,'00000000-0000-0000-0000-'+uid.zfill(12),f"SELECT public.start_task_timer('{T1}','{{}}'::jsonb,'{uuid4()}')"))['timerId']

def item_timer(db,node_id,uid='4',key=None,success=True):
    """start_checklist_item_timer as a JWT subject."""
    rows=actor(db,'00000000-0000-0000-0000-'+uid.zfill(12),
               f"SELECT public.start_checklist_item_timer('{node_id}','{{\"notes\":\"item work\"}}'::jsonb,'{key or uuid4()}')",success)
    if success:return first_json(rows)

def migrate(db,upto):
    for migration in sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0])):
        if int(migration.name.split('_')[0])>upto:break
        sql(db,migration.read_text(encoding='utf-8'))

for db in DBS:
    assert db in DBS
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    if db==DBS[1]:
        migrate(db,32)
        sql(db,seed)
        # Pre-33 data written through the old contract survives the upgrade unchanged.
        legacy_page=cl(db,'add',{'title':'Legacy page','section':'activity','node_type':'Page','parent_id':None,'linked_task_id':None,'description':None},uid='1')['nodeId']
        cl(db,'add',{'title':'Old assignee add','section':'activity','node_type':'Item','parent_id':None,'linked_task_id':None,'description':None},uid='4',success=False)
        before=value(db,"coalesce(jsonb_agg(to_jsonb(n) ORDER BY id),'[]') FROM public.checklist_nodes n")
        sql(db,(ROOT/'supabase/migrations/33_nested_checklist_pages.sql').read_text(encoding='utf-8'))
        after=value(db,"coalesce(jsonb_agg(to_jsonb(n)-'links' ORDER BY id),'[]') FROM public.checklist_nodes n")
        assert json.loads(after)==json.loads(before),'upgrade changed existing checklist nodes'
        assert value(db,"bool_and(links='{}') FROM public.checklist_nodes")=='t'
        print('PASS',db,'upgrade 32->33 preserves existing nodes; links default empty')
        # A plain task timer and its log, written before 34, keep their data and get no item tag.
        plain=start_plain(db)
        sql(db,f"UPDATE public.task_timers SET started_at=clock_timestamp()-interval '6 minutes' WHERE id='{plain}'")
        call(db,'stop_task_timer',plain,{'notes':'pre-34 plain timer'},version=0)
        logs_before=value(db,"coalesce(jsonb_agg(to_jsonb(l) ORDER BY id),'[]') FROM public.daily_task_logs l")
        timers_before=value(db,"coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.task_timers t")
        sql(db,(ROOT/'supabase/migrations/34_checklist_item_timers.sql').read_text(encoding='utf-8'))
        assert json.loads(value(db,"coalesce(jsonb_agg(to_jsonb(l)-'checklist_node_id' ORDER BY id),'[]') FROM public.daily_task_logs l"))==json.loads(logs_before)
        assert json.loads(value(db,"coalesce(jsonb_agg(to_jsonb(t)-'checklist_node_id' ORDER BY id),'[]') FROM public.task_timers t"))==json.loads(timers_before)
        assert value(db,"count(*) FROM public.daily_task_logs WHERE checklist_node_id IS NOT NULL")=='0'
        print('PASS',db,'upgrade 33->34 preserves existing timers and logs untagged')
        sql(db,(ROOT/'supabase/migrations/35_duplicate_checklist_rows.sql').read_text(encoding='utf-8'))
        print('PASS',db,'upgrade 34->35 applies')
        sql(db,(ROOT/'supabase/migrations/36_task_effort_breakdown.sql').read_text(encoding='utf-8'))
        print('PASS',db,'upgrade 35->36 applies')
        sql(db,(ROOT/'supabase/migrations/37_team_holiday_dates.sql').read_text(encoding='utf-8'))
        print('PASS',db,'upgrade 36->37 applies')
        sql(db,(ROOT/'supabase/migrations/38_assignee_work_file_links.sql').read_text(encoding='utf-8'))
        print('PASS',db,'upgrade 37->38 applies')
    else:
        migrate(db,38)
        sql(db,seed)
        print('PASS',db,'fresh install 01-38')
    assert value(db,"has_function_privilege('authenticated','taskpulse_private.checklist_links(jsonb)','EXECUTE')")=='f'

    # Assignee (user 4 on T1) builds nested pages with links and estimates.
    page=cl(db,'add',{'title':'Protonite Products','section':'activity','node_type':'Page','parent_id':None,'linked_task_id':None,'description':None,
                      'links':['https://example.test/sheet'],'estimated_minutes':120})['nodeId']
    sub=cl(db,'add',{'title':'Fridge Magnet','section':'activity','node_type':'Page','parent_id':page,'linked_task_id':None,'description':None})['nodeId']
    a=cl(db,'add',{'title':'Magnet 10 mm','section':'activity','node_type':'Item','parent_id':sub,'linked_task_id':None,'description':None,'estimated_minutes':30})['nodeId']
    b=cl(db,'add',{'title':'Magnet 12 mm','section':'activity','node_type':'Item','parent_id':sub,'linked_task_id':None,'description':None})['nodeId']
    c=cl(db,'add',{'title':'Mini vase','section':'activity','node_type':'Item','parent_id':page,'linked_task_id':None,'description':None})['nodeId']
    got=json.loads(node(db,page))
    assert got['links']==['https://example.test/sheet'] and got['estimated_minutes']==120 and got['node_type']=='Page',got
    assert int(value(db,f"sort_order FROM public.checklist_nodes WHERE id='{b}'"))==int(value(db,f"sort_order FROM public.checklist_nodes WHERE id='{a}'"))+1
    print('PASS',db,'assignee adds nested pages and items with links, estimate and sibling order')

    for leaf,state in ((a,'Yes'),(b,'No'),(c,'Yes')):cl(db,'state',{'node_id':leaf,'state':state})
    rollup=cl(db,'state',{'node_id':b,'state':'No'})['rollup']
    progress={p['id']:p['progressPercentage'] for p in rollup['nodeProgress']}
    assert float(progress[sub])==50 and float(progress[page])==75,(progress[sub],progress[page])
    print('PASS',db,'nested pages roll up equally: sub-page 50%, page 75%')

    edited=cl(db,'edit',{'node_id':a,'title':'Magnet 10 mm round','parent_id':sub,'linked_task_id':None,'node_type':'Item','section':'activity',
                         'reason':'Clarify size','links':['http://example.test/a','https://example.test/b'],'estimated_minutes':45})
    got=json.loads(node(db,a))
    assert got['title']=='Magnet 10 mm round' and got['links']==['http://example.test/a','https://example.test/b'] and got['estimated_minutes']==45 and got['parent_node_id']==sub,got
    cl(db,'edit',{'node_id':a,'title':'Magnet 10 mm round','parent_id':sub,'linked_task_id':None,'node_type':'Item','section':'activity','reason':'Keep links'})
    assert json.loads(node(db,a))['links']==['http://example.test/a','https://example.test/b'],'edit without links key must keep links'
    cl(db,'edit',{'node_id':a,'title':'Magnet 10 mm round','parent_id':sub,'linked_task_id':None,'node_type':'Item','section':'activity','reason':'Clear','links':[],'estimated_minutes':None})
    got=json.loads(node(db,a))
    assert got['links']==[] and got['estimated_minutes'] is None,got
    print('PASS',db,'assignee edits title, links and estimate; omitted keys are kept, empty values clear')

    extra=cl(db,'add',{'title':'Temporary','section':'activity','node_type':'Item','parent_id':page,'linked_task_id':None,'description':None})['nodeId']
    cl(db,'delete',{'node_id':extra,'reason':''},success=False)
    cl(db,'delete',{'node_id':sub,'reason':'Has children'},success=False)
    cl(db,'delete',{'node_id':extra,'reason':'Added by mistake'})
    assert value(db,f"count(*) FROM public.checklist_nodes WHERE id='{extra}'")=='0'
    print('PASS',db,'assignee deletes a leaf with a reason; parents and reasonless deletes refused')

    # Validation.
    for bad in (['ftp://x'],['javascript:alert(1)'],['https://a b'],[1],'https://x',['https://x/'+str(i) for i in range(11)],['https://x/'+'a'*2050]):
        cl(db,'add',{'title':'Bad','section':'activity','node_type':'Item','parent_id':page,'linked_task_id':None,'description':None,'links':bad},success=False)
    for bad in (-1,1.5,100001,'10'):
        cl(db,'add',{'title':'Bad','section':'activity','node_type':'Item','parent_id':page,'linked_task_id':None,'description':None,'estimated_minutes':bad},success=False)
    cl(db,'add',{'title':'Bad','section':'activity','node_type':'Item','parent_id':page,'linked_task_id':None,'description':None,'colour':'red'},success=False)
    print('PASS',db,'invalid links, estimates and unexpected fields refused')

    # Manager-only controls stay manager-only.
    cl(db,'add',{'title':'Linked','section':'activity','node_type':'Task','parent_id':page,'linked_task_id':T2,'description':None},success=False)
    cl(db,'edit',{'node_id':c,'title':'Mini vase','parent_id':page,'linked_task_id':T2,'node_type':'Item','section':'activity','reason':'Link'},success=False)
    cl(db,'map',{'node_id':LEGACY,'section':'setup','reason':'Map legacy'},success=False)
    cl(db,'section',{'section':'setup','intentional_empty':True,'reason':'Empty'},success=False)
    rollup=cl(db,'state',{'node_id':c,'state':'Yes'})['rollup']
    cl(db,'mode',{'enabled':False,'reason':'Switch','preview_progress':rollup.get('taskProgress')},success=False)
    print('PASS',db,'assignee cannot link real tasks, map roots, confirm sections or switch progress owner')

    # Other actors.
    cl(db,'add',{'title':'Intruder','section':'activity','node_type':'Item','parent_id':page,'linked_task_id':None,'description':None},uid='5',success=False)
    cl(db,'edit',{'node_id':c,'title':'Hijack','parent_id':page,'linked_task_id':None,'node_type':'Item','section':'activity','reason':'x'},uid='5',success=False)
    cl(db,'delete',{'node_id':c,'reason':'x'},uid='5',success=False)
    cl(db,'add',{'title':'Data manager','section':'activity','node_type':'Item','parent_id':page,'linked_task_id':None,'description':None},uid='3',success=False)
    cl(db,'add',{'title':'Inactive','section':'activity','node_type':'Item','parent_id':page,'linked_task_id':None,'description':None},uid='7',success=False)
    cl(db,'add',{'title':'Wrong checklist','section':'activity','node_type':'Item','parent_id':page,'linked_task_id':None,'description':None},uid='5',tid=T2,success=False)
    print('PASS',db,'non-assignee, data manager, inactive and cross-checklist parents refused')

    # Manager keeps full control, including links to real tasks.
    linked=cl(db,'add',{'title':'Linked','section':'activity','node_type':'Task','parent_id':page,'linked_task_id':T2,'description':None},uid='1')['nodeId']
    assert value(db,f"linked_task_id FROM public.checklist_nodes WHERE id='{linked}'")==T2
    cl(db,'edit',{'node_id':linked,'title':'Linked renamed','parent_id':page,'linked_task_id':T2,'node_type':'Task','section':'activity','reason':'Rename'},uid='4')
    cl(db,'edit',{'node_id':linked,'title':'Linked renamed','parent_id':page,'linked_task_id':None,'node_type':'Task','section':'activity','reason':'Unlink'},uid='4',success=False)
    print('PASS',db,'manager links real tasks; assignee may rename but not unlink it')

    # Duplicate a page with everything inside it (migration 35).
    sibling=cl(db,'add',{'title':'After the page','section':'activity','node_type':'Item','parent_id':None,'linked_task_id':None,'description':None})['nodeId']
    order=lambda i:int(value(db,f"sort_order FROM public.checklist_nodes WHERE id='{i}'"))
    page_order,sibling_order=order(page),order(sibling)
    before=int(value(db,"count(*) FROM public.checklist_nodes"))
    version=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{T1}'"))
    key=str(uuid4())
    q=f"SELECT public.checklist_command('{T1}','duplicate','{{\"node_id\":\"{page}\"}}'::jsonb,{version},'{key}')"
    copy=first_json(actor(db,'00000000-0000-0000-0000-000000000004',q))['nodeId']
    assert first_json(actor(db,'00000000-0000-0000-0000-000000000004',q))['nodeId']==copy,'replayed duplicate must return the same copy'
    got=json.loads(node(db,copy))
    assert got['title']=='Protonite Products (copy)' and got['node_type']=='Page' and got['parent_node_id'] is None and got['links']==['https://example.test/sheet'] and got['estimated_minutes']==120,got
    assert order(copy)==page_order+1 and order(sibling)==sibling_order+1,'copy must sit right after the original'
    assert int(value(db,"count(*) FROM public.checklist_nodes"))==before+5,'page, sub-page, two items and one item copied; linked row skipped'
    tree=json.loads(value(db,f"""json_agg(json_build_object('t',x.title,'s',x.completion_state,'c',x.is_complete,'by',x.completed_by,'l',x.linked_task_id) ORDER BY x.title) FROM public.checklist_nodes x
      WHERE x.id IN (WITH RECURSIVE s(id) AS (SELECT '{copy}'::uuid UNION ALL SELECT y.id FROM public.checklist_nodes y JOIN s ON y.parent_node_id=s.id) SELECT id FROM s)"""))
    assert [r['t'] for r in tree]==['Fridge Magnet','Magnet 10 mm round','Magnet 12 mm','Mini vase','Protonite Products (copy)'],tree
    assert all(r['s']=='No' and r['c'] is False and r['by'] is None and r['l'] is None for r in tree),tree
    assert json.loads(node(db,page))['title']=='Protonite Products','original unchanged'
    rollup=cl(db,'state',{'node_id':c,'state':'Yes'})['rollup']
    assert float({p['id']:p['progressPercentage'] for p in rollup['nodeProgress']}[copy])==0,'copied work starts at 0%'
    print('PASS',db,'assignee duplicates a page with its subtree right after it; copies reset to No; linked rows skipped; replay idempotent')
    for uid,target in (('4',linked),('5',page),('3',page)):
        version=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{T1}'"))
        actor(db,'00000000-0000-0000-0000-'+uid.zfill(12),f"SELECT public.checklist_command('{T1}','duplicate','{{\"node_id\":\"{target}\"}}'::jsonb,{version},'{uuid4()}')",False)
    version=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{T1}'"))
    actor(db,'00000000-0000-0000-0000-000000000001',f"SELECT public.checklist_command('{T1}','duplicate','{{\"node_id\":\"{LEGACY}\"}}'::jsonb,{version},'{uuid4()}')",False)
    actor(db,'00000000-0000-0000-0000-000000000004',f"SELECT public.checklist_command('{T1}','duplicate','{{\"node_id\":\"{page}\",\"title\":\"x\"}}'::jsonb,{version},'{uuid4()}')",False)
    print('PASS',db,'linked rows, unmapped legacy rows, non-assignees, data managers and extra fields refused')

    # Direct table writes remain closed to members; a failed command leaves no partial rows.
    actor(db,'00000000-0000-0000-0000-000000000004',f"INSERT INTO public.checklist_nodes(checklist_id,node_type,title) SELECT checklist_id,'Item','Direct' FROM public.checklist_nodes WHERE id='{page}'",False)
    actor(db,'00000000-0000-0000-0000-000000000004',f"UPDATE public.checklist_nodes SET links='{{https://x.test}}' WHERE id='{page}'",False)
    count=value(db,"count(*) FROM public.checklist_nodes")
    cl(db,'add',{'title':'Rolled back','section':'activity','node_type':'Item','parent_id':page,'linked_task_id':None,'description':None,'links':['bad']},success=False)
    assert value(db,"count(*) FROM public.checklist_nodes")==count
    print('PASS',db,'direct writes refused; refused command commits nothing')

    # Item timers: an ordinary task log tagged with the item.
    live=f"FROM public.daily_task_logs WHERE task_id='{T1}' AND reversed_at IS NULL"
    hours_before=float(value(db,f"coalesce(sum(hours_worked),0) {live}"))
    key=str(uuid4())
    started=item_timer(db,c,key=key)
    assert started['nodeId']==c and value(db,f"checklist_node_id FROM public.task_timers WHERE id='{started['timerId']}'")==c
    assert item_timer(db,c,key=key)['timerId']==started['timerId'],'replay must return the same timer'
    item_timer(db,b,key=key,success=False)
    print('PASS',db,'item timer starts tagged; replay is idempotent; key reuse for another item refused')
    item_timer(db,c,uid='5',success=False)
    item_timer(db,str(uuid4()),success=False)
    sql(db,f"INSERT INTO public.task_timers(task_id,user_id,checklist_node_id) VALUES('{T1}','00000000-0000-0000-0000-000000000005','{c}')",success=False)
    sql(db,f"UPDATE public.task_timers SET checklist_node_id='{b}' WHERE id='{started['timerId']}'",success=False)
    print('PASS',db,'non-assignee, unknown items, forged timer tags and retagging refused')
    sql(db,f"UPDATE public.task_timers SET started_at=clock_timestamp()-interval '30 minutes' WHERE id='{started['timerId']}'")
    stopped=call(db,'stop_task_timer',started['timerId'],{'notes':'Done with vase'},version=0)
    tagged=json.loads(value(db,f"json_build_object('n',count(*),'h',sum(hours_worked),'nodes',array_agg(DISTINCT checklist_node_id)) FROM public.daily_task_logs WHERE source_timer_id='{started['timerId']}'"))
    assert tagged['n']>=1 and tagged['nodes']==[c] and abs(float(tagged['h'])-0.5)<0.02,tagged
    hours_after=float(value(db,f"coalesce(sum(hours_worked),0) {live}"))
    assert abs(hours_after-hours_before-float(tagged['h']))<1e-9,'item time must count once in task hours'
    print('PASS',db,'stopping the item timer writes ordinary task logs tagged with the item; task hours include them once')
    log_id=stopped['logId']
    sql(db,f"UPDATE public.daily_task_logs SET checklist_node_id='{b}' WHERE id='{log_id}'",success=False)
    # Execution history cannot be deleted, so the forged insert is rolled back.
    forged=sql(db,f"BEGIN; INSERT INTO public.daily_task_logs(task_id,user_id,log_date,hours_worked,checklist_node_id) VALUES('{T1}','00000000-0000-0000-0000-000000000004',current_date,1,'{c}') RETURNING coalesce(checklist_node_id::text,'untagged'); ROLLBACK;")
    assert 'untagged' in forged,'manual logs must not carry item tags'
    plain=start_plain(db)
    assert value(db,f"checklist_node_id FROM public.task_timers WHERE id='{plain}'")==''
    call(db,'discard_task_timer',plain,{'reason':'Not item work'},version=0)
    discarded=item_timer(db,c)
    call(db,'discard_task_timer',discarded['timerId'],{'reason':'Started by mistake'},version=0)
    assert value(db,f"count(*) FROM public.daily_task_logs WHERE source_timer_id='{discarded['timerId']}'")=='0'
    print('PASS',db,'log tags cannot be changed or forged; plain timers stay untagged; discarded item timers log nothing')
    version=int(value(db,f"execution_version FROM public.daily_task_logs WHERE id='{log_id}'"))
    call(db,'reverse_task_log',log_id,{'reason':'Wrong day'},version=version)
    assert value(db,f"reversed_at IS NOT NULL AND checklist_node_id='{c}' FROM public.daily_task_logs WHERE id='{log_id}'")=='t'
    short=cl(db,'add',{'title':'Short-lived','section':'activity','node_type':'Item','parent_id':page,'linked_task_id':None,'description':None})['nodeId']
    gone=item_timer(db,short)
    sql(db,f"UPDATE public.task_timers SET started_at=clock_timestamp()-interval '12 minutes' WHERE id='{gone['timerId']}'")
    call(db,'stop_task_timer',gone['timerId'],{},version=0)
    total=value(db,f"sum(hours_worked) {live}")
    cl(db,'delete',{'node_id':short,'reason':'Merged into another item'})
    assert value(db,f"sum(hours_worked) {live}")==total
    assert value(db,f"bool_and(checklist_node_id IS NULL) FROM public.daily_task_logs WHERE source_timer_id='{gone['timerId']}'")=='t'
    print('PASS',db,'reversed item logs keep their tag; deleting an item keeps its logged hours and clears the tag')

    # Team-wide effort breakdown (migration 36): totals only, readable by any active member.
    timed=item_timer(db,b)
    sql(db,f"UPDATE public.task_timers SET started_at=clock_timestamp()-interval '15 minutes' WHERE id='{timed['timerId']}'")
    call(db,'stop_task_timer',timed['timerId'],{},version=0)
    today=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    expect_today=float(value(db,f"coalesce(sum(hours_worked),0) {live} AND log_date='{today}'"))
    expect_c=int(value(db,f"coalesce(round(sum(hours_worked)*3600),0) {live} AND checklist_node_id='{c}'"))
    visible=int(next(x for x in actor(db,'00000000-0000-0000-0000-000000000005',f"SELECT count(*) FROM public.daily_task_logs WHERE task_id='{T1}'") if x.isdigit()))
    assert visible==0,'member 5 must not read member 4 logs directly'
    breakdown=first_json(actor(db,'00000000-0000-0000-0000-000000000005',f"SELECT public.task_effort_breakdown('{T1}')"))
    assert breakdown['today']==today and abs(float(breakdown['today_hours'])-expect_today)<1e-9,breakdown
    assert int(breakdown['by_node'].get(c,0))==expect_c and expect_c==0,'reversed item log excluded'
    expect_b=int(value(db,f"round(sum(hours_worked)*3600) {live} AND checklist_node_id='{b}'"))
    assert int(breakdown['by_node'][b])==expect_b and abs(expect_b-900)<=5,(breakdown,expect_b)
    assert set(breakdown)=={'today','today_hours','by_node'},'totals only'
    actor(db,'00000000-0000-0000-0000-000000000007',f"SELECT public.task_effort_breakdown('{T1}')",False)
    actor(db,'',f"SELECT public.task_effort_breakdown('{T1}')",False,role='anon')
    print('PASS',db,'effort breakdown gives any active member team totals for today and per item; reversed logs excluded; inactive and anon refused')

    # Team holiday dates (migration 37): a date counts only when every active member
    # has an active Holiday record. Checked inside a rolled-back transaction.
    active=f"SELECT id FROM public.users WHERE is_active"
    holidays=sql(db,f"""BEGIN;
      INSERT INTO public.attendance_records(user_id,attendance_date,status) SELECT id,'2026-10-04','Holiday' FROM public.users WHERE is_active;
      INSERT INTO public.attendance_records(user_id,attendance_date,status) SELECT id,'2026-10-05','Holiday' FROM public.users WHERE is_active AND id<>'00000000-0000-0000-0000-000000000005';
      INSERT INTO public.attendance_records(user_id,attendance_date,status,record_state) SELECT id,'2026-10-06','Holiday',CASE WHEN id='00000000-0000-0000-0000-000000000004' THEN 'withdrawn' ELSE 'active' END FROM public.users WHERE is_active;
      INSERT INTO public.attendance_records(user_id,attendance_date,status) SELECT id,'2026-10-07','Holiday' FROM public.users WHERE NOT is_active;
      SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
      SELECT 'own-visible:'||count(*) FROM public.attendance_records WHERE attendance_date='2026-10-04';
      SELECT 'dates:'||public.team_holiday_dates('2026-10-01','2026-10-31')::text;
      ROLLBACK;""")
    assert 'dates:{2026-10-04}' in holidays and 'own-visible:1' in holidays,holidays
    assert value(db,"count(*) FROM public.attendance_records WHERE attendance_date BETWEEN '2026-10-04' AND '2026-10-07'")=='0','rolled back'
    actor(db,'00000000-0000-0000-0000-000000000005',"SELECT public.team_holiday_dates('2026-01-01','2026-06-30')",False)
    actor(db,'00000000-0000-0000-0000-000000000007',"SELECT public.team_holiday_dates('2026-10-01','2026-10-31')",False)
    actor(db,'',"SELECT public.team_holiday_dates('2026-10-01','2026-10-31')",False,role='anon')
    print('PASS',db,'team holiday dates need every active member on an active Holiday record; members see the date without reading others; long ranges, inactive and anon refused')

    # Work-file links (migration 38): assignees add ordinary links; managers keep related records.
    def detail_link(payload,uid='4',success=True,key=None):
        version=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{T1}'"))
        base={'ipo_role':'output','link_type':'Document','label':'Work file','url':None,'notes':None,'employee_id':None,'report_id':None}
        q=f"SELECT public.task_details_command('{T1}','link',{literal(json.dumps({**base,**payload}))}::jsonb,{version},'{key or uuid4()}')"
        rows=actor(db,'00000000-0000-0000-0000-'+uid.zfill(12),q,success)
        if success:return first_json(rows)
    sql(db,f"UPDATE public.task_reviewers SET review_approved=true,reviewed_at=now() WHERE task_id='{T1}'")
    key=str(uuid4())
    v0=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{T1}'"))
    made=detail_link({'label':'Vase render','url':'https://docs.google.com/document/d/abc/edit'},key=key)
    row=json.loads(value(db,f"row_to_json(l) FROM (SELECT ipo_role,link_type,label,url,created_by,related_employee_id FROM public.task_links WHERE id='{made['id']}') l"))
    assert row=={'ipo_role':'output','link_type':'Document','label':'Vase render','url':'https://docs.google.com/document/d/abc/edit','created_by':'00000000-0000-0000-0000-000000000004','related_employee_id':None},row
    assert value(db,f"bool_or(review_approved) FROM public.task_reviewers WHERE task_id='{T1}'") in ('f',''),'link must invalidate reviews'
    replay=first_json(actor(db,'00000000-0000-0000-0000-000000000004',f"SELECT public.task_details_command('{T1}','link',{literal(json.dumps({'ipo_role':'output','link_type':'Document','label':'Vase render','url':'https://docs.google.com/document/d/abc/edit','notes':None,'employee_id':None,'report_id':None}))}::jsonb,{v0},'{key}')"))
    assert replay['id']==made['id'],'replay returns the same link'
    print('PASS',db,'assignee adds a work-file link; reviews reset; replay idempotent')
    detail_link({'employee_id':'00000000-0000-0000-0000-000000000005','url':None},success=False)
    for bad in ({'url':'javascript:alert(1)'},{'url':None},{'label':'','url':'https://x.test'},{'ipo_role':'misc','url':'https://x.test'},{'url':'https://x.test','extra':1}):
        detail_link(bad,success=False)
    detail_link({'url':'https://x.test'},uid='5',success=False)
    detail_link({'url':'https://x.test'},uid='3',success=False)
    detail_link({'url':'https://x.test'},uid='7',success=False)
    version=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{T1}'"))
    actor(db,'00000000-0000-0000-0000-000000000004',f"SELECT public.task_details_command('{T1}','save','{{\"description\":\"x\"}}'::jsonb,{version},'{uuid4()}')",False)
    related=detail_link({'ipo_role':'reference','link_type':'Account','label':'Profile','employee_id':'00000000-0000-0000-0000-000000000005'},uid='1')
    assert value(db,f"related_employee_id FROM public.task_links WHERE id='{related['id']}'")=='00000000-0000-0000-0000-000000000005'
    print('PASS',db,'related records, bad links, non-assignees, data managers, inactive accounts and other detail commands stay refused; managers unchanged')

    # Closed tasks refuse structure edits and item timers from anyone.
    sql(db,f"UPDATE public.tasks SET status='Discarded' WHERE id='{T1}'")
    cl(db,'add',{'title':'After close','section':'activity','node_type':'Item','parent_id':page,'linked_task_id':None,'description':None},success=False)
    cl(db,'add',{'title':'After close','section':'activity','node_type':'Item','parent_id':page,'linked_task_id':None,'description':None},uid='1',success=False)
    item_timer(db,c,success=False)
    detail_link({'url':'https://x.test'},success=False)
    print('PASS',db,'closed task refuses checklist edits, item timers and work-file links')
print('ALL M14 DATABASE CHECKS PASSED')
