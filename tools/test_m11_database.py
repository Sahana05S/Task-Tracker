"""M11 isolated PostgreSQL checks. JWT shim, no provider or production calls."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
DBS=('taskpulse_m11_fresh_test','taskpulse_m11_upgrade_test')
for db in DBS:
    assert db in ('taskpulse_m11_fresh_test','taskpulse_m11_upgrade_test')
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);');sql('postgres',f'CREATE DATABASE {db}');sql(db,bootstrap)
    for migration in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        if int(migration.name.split('_')[0])>27:break
        sql(db,migration.read_text(encoding='utf-8'))
    if db==DBS[1]:sql(db,seed)
    before=sql(db,'SELECT coalesce(jsonb_agg(to_jsonb(t)),\'[]\') FROM public.report_snapshots t')
    sql(db,(ROOT/'supabase/migrations/28_live_presentation_and_report_context.sql').read_text(encoding='utf-8'))
    assert before==sql(db,'SELECT coalesce(jsonb_agg(to_jsonb(t)),\'[]\') FROM public.report_snapshots t')
    if db==DBS[0]:sql(db,seed)
    tid=new_task(db,'M11-SYNTHETIC')
    day=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    sql(db,f"UPDATE public.tasks SET assigned_date='{day}',due_date='{day}'::date+7 WHERE id='{tid}'")
    fields={'task_tag':'M11-SYNTHETIC','title':'Synthetic shared survey','category':'T','priority':'High','task_scale':10,'due_date':value(db,f"'{day}'::date+7"),'expected_lifecycle_version':int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{tid}'"))}
    shares_version=value(db,f"participant_version FROM public.tasks WHERE id='{tid}'")
    actor(db,'00000000-0000-0000-0000-000000000001','SELECT public.save_task_with_participants('+literal(tid)+','+literal(json.dumps(fields))+"::jsonb,ARRAY["+U4+','+U5+"],ARRAY["+U6+"],ARRAY[500000,500000],"+shares_version+",true,"+literal(uuid4())+');')
    call(db,'create_task_log',tid,{'log_date':day,'hours_worked':1,'requested_delta':20})
    for kind,payload in [('attendance',{'business_date':day,'attendance_status':'Present','attendance_hours':'8','off_hours':'0','content':'Synthetic attendance'}),('fact',{'business_date':day,'content':'Synthetic pending fact'}),('idea',{'business_date':day,'content':'Synthetic pending idea'})]:
        actor(db,user4,'SELECT public.dated_record_command('+literal(kind)+",NULL,'save',"+literal(json.dumps(payload))+'::jsonb,0,'+literal(uuid4())+');')
    def read(uid='4',employee='4',asof='clock_timestamp()',success=True):
        target='NULL' if employee is None else "'00000000-0000-0000-0000-"+employee.zfill(12)+"'"
        rows=actor(db,'00000000-0000-0000-0000-'+uid.zfill(12),f"SELECT public.live_presentation_context(date_trunc('month',clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date,(date_trunc('month',clock_timestamp() AT TIME ZONE 'Asia/Kolkata')+interval '1 month')::date,{asof},{target})",success)
        return json.loads(next(x for x in rows if x.startswith('{'))) if success else None
    model=read()
    assert model['presentationAvailable'] is True
    assert any(t['id']==tid for t in model['tasks'])
    assert model['series'] and all(p['date']<=model['sources']['asOfLocalDate'] for p in model['series'])
    assert model['scope']=='employee_detail'
    assert len(model['logs'])==1 and float(model['logs'][0]['hours_worked'])==1
    assert model['attendance'][0]['days'][-1]['attendanceHours']=='8'
    st=next(t for t in model['sources']['tasks'] if t['id']==tid)
    assert len(st['participants'])==2 and float(st['periodCredits'][user4])==1 and float(st['periodCredits'][user5])==1
    assert len(model['contributions'])==2
    sql(db,f"INSERT INTO public.daily_star_records(user_id,star_date,score,reason) VALUES('{user4}','{day}',1.25,'Synthetic legacy result, not certified')")
    ledger=json.loads(next(x for x in actor(db,user4,f"SELECT public.award_read_model('{day}','{day}'::date+1,'{user4}')") if x.startswith('{')))
    assert ledger['legacy'] and all(r['certified'] is False for r in ledger['legacy'])
    assert 'Synthetic attendance' not in json.dumps(model['sources'])
    assert read('5','5')['logs']==[]
    # M11 reuses M07 selection rather than changing its public query permission.
    actor(db,user4,f"SELECT public.performance_source_context('{day}','{day}'::date+1,clock_timestamp())",False)
    actor(db,user4,f"SELECT taskpulse_private.presentation_performance_sources('{day}','{day}'::date+1,clock_timestamp())",False)
    count=value(db,'count(*) FROM taskpulse_private.presentation_history')
    sql(db,"BEGIN; UPDATE public.tasks SET title='Rolled back synthetic title' WHERE id="+literal(tid)+"; ROLLBACK")
    assert count==value(db,'count(*) FROM taskpulse_private.presentation_history')
    read('5','4',success=False);read('3','4',success=False);read('7','7',success=False)
    assert read('1','4')['scope']=='employee_detail'
    assert read('4',None)['scope']=='team_summary_with_own_details'
    assert read('1',None)['scope']=='manager_team_detail'
    assert read(asof="clock_timestamp()-interval '1 year'")['presentationAvailable'] is False
    sql(db,"SET ROLE anon; SELECT public.live_presentation_context(current_date,current_date+1,clock_timestamp(),NULL)",False)
    actor(db,user4,'SELECT * FROM taskpulse_private.presentation_history',False)
    sql(db,"UPDATE taskpulse_private.presentation_history SET source='{}'",False)
    path=ROOT/'__tests__/fixtures'/('m11-'+('fresh' if db==DBS[0] else 'upgrade')+'-context.json')
    path.write_text(json.dumps(model,indent=2),encoding='utf-8')
    print('PASS',db,'fresh/upgrade, retained report equality, own/manager access, inactive/anonymous/DM/cross-employee denial, immutable history, dated series, unavailable history',flush=True)
