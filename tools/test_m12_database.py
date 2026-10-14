"""M12 disposable PostgreSQL checks. JWT shim only; no production connection."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_m12_fresh_test','taskpulse_m12_upgrade_test')
MONTH='2026-08-01'
END='2026-09-01'
DIRECTOR='00000000-0000-0000-0000-000000000001'
MEMBER='00000000-0000-0000-0000-000000000004'
FACT='71000000-0000-0000-0000-000000000012'
FACTORS=['productivity','criticality','loading','completion','progress','sales','facts','ideas','suggestions','freshness']

def read_json(db,uid,statement,success=True):
    rows=actor(db,uid,statement,success)
    if not success:return None
    return json.loads(next(x for x in rows if x.startswith('{')))

def payload_for(db,reason,month=MONTH,end=END):
    src=read_json(db,DIRECTOR,f"SELECT public.performance_source_context('{month}','{end}',clock_timestamp())")
    members=[{'userId':m['id'],'status':'incomplete','factors':{f:{'available':False,'rawExact':None,'medianExact':None,'deltaExact':None,'contributionExact':None,'reasons':['independent_fixture_unavailable']} for f in FACTORS},'compositeExact':None,'reasons':['independent_fixture_unavailable']} for m in src['members'] if m['active']]
    calc={'context':{'ruleVersion':'m07-ten-factor-v1','sourceWatermark':src['sourceWatermark'],'asOf':src['asOf'],'periodStart':month,'periodEndExclusive':end},'status':'incomplete','members':members,'reasons':['independent_fixture_unavailable']}
    monthly={'status':'incomplete','winnerId':None,'counts':{},'reasons':['award_evidence_missing']}
    return {'reason':reason,'sourceInputs':src,'calculation':calc,'monthlySelection':monthly}

def command(db,name,payload,version,key=None,uid=DIRECTOR,success=True):
    key=key or str(uuid4())
    q=f"SELECT public.month_archive_command({literal(name)},{literal(MONTH)},{literal(json.dumps(payload))}::jsonb,{literal(key)},{version})"
    return read_json(db,uid,q,success),key

def revise_fact(db,content,success=True):
    version=value(db,f"record_version FROM public.daily_facts WHERE id='{FACT}'")
    payload={'business_date':'2026-08-12','content':content,'reason':'Director-authorized retained correction'}
    q=f"SELECT public.dated_record_command('fact','{FACT}','save',{literal(json.dumps(payload))}::jsonb,{version},'{uuid4()}')"
    return read_json(db,DIRECTOR,q,success)

for db in DBS:
    assert db in ('taskpulse_m12_fresh_test','taskpulse_m12_upgrade_test')
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    for migration in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        if int(migration.name.split('_')[0])>28:break
        sql(db,migration.read_text(encoding='utf-8'))
    if db==DBS[1]:sql(db,seed)
    legacy_before=value(db,"coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.report_snapshots r")
    month_legacy_before=value(db,"coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.monthly_performance_snapshots r")
    sql(db,(ROOT/'supabase/migrations/29_month_archive_and_revisions.sql').read_text(encoding='utf-8'))
    assert value(db,"coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.report_snapshots r")==legacy_before
    assert value(db,"coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.monthly_performance_snapshots r")==month_legacy_before
    if db==DBS[0]:sql(db,seed)
    sql(db,f"INSERT INTO public.daily_facts(id,fact_date,posted_by,fact) VALUES('{FACT}','2026-08-12','{MEMBER}','M12 synthetic original fact')")
    initial=payload_for(db,'Initial evidence capture')
    read_json(db,MEMBER,f"SELECT public.month_archive_command('draft','{MONTH}','{{}}'::jsonb,'{uuid4()}',0)",False)
    actor(db,DIRECTOR,f"SELECT public.month_archive_command('draft','{MONTH}','{{}}'::jsonb,'{uuid4()}',0)",False,role='service_role')
    forged=json.loads(json.dumps(initial))
    forged['calculation']['status']='complete'
    for member in forged['calculation']['members']:
        member['status']='complete';member['compositeExact']={'numerator':'0','denominator':'1'}
    command(db,'draft',forged,0,success=False)
    draft,_=command(db,'draft',initial,0)
    assert draft['state']=='live' and draft['certification']=='incomplete_uncertified'
    sql(db,"CREATE FUNCTION taskpulse_private.m12_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected archive failure' USING ERRCODE='23514';END $$;")
    sql(db,"CREATE TRIGGER m12_test_failure BEFORE INSERT ON taskpulse_private.month_revision_members FOR EACH ROW EXECUTE FUNCTION taskpulse_private.m12_test_failure();")
    command(db,'close',initial,0,success=False)
    assert value(db,"count(*) FROM taskpulse_private.month_revisions")==str(draft['revisionNumber'])
    assert value(db,"count(*) FROM taskpulse_private.month_receipts")=='1'
    assert read_json(db,DIRECTOR,f"SELECT public.month_archive_history('{MONTH}')")['state']=='live'
    sql(db,"DROP TRIGGER m12_test_failure ON taskpulse_private.month_revision_members; DROP FUNCTION taskpulse_private.m12_test_failure();")
    race_keys=[str(uuid4()),str(uuid4())]
    def race(key):
        try:return command(db,'close',initial,0,key)[0]
        except AssertionError:return None
    with ThreadPoolExecutor(max_workers=2) as executor:results=list(executor.map(race,race_keys))
    assert sum(r is not None for r in results)==1
    winner_index=next(i for i,r in enumerate(results) if r is not None)
    close,key=results[winner_index],race_keys[winner_index]
    assert close['state']=='closed' and close['revisionNumber']==2 and close['certification']=='incomplete_uncertified'
    retry,_=command(db,'close',initial,0,key)
    assert retry==close
    command(db,'close',{**initial,'reason':'Different reason for same operation'},0,key,success=False)
    command(db,'close',initial,1,success=False)
    before=value(db,"count(*) FROM taskpulse_private.month_revisions")
    sql(db,f"UPDATE public.daily_facts SET fact='Rejected closed edit' WHERE id='{FACT}'",False)
    revise_fact(db,'Rejected command edit',False)
    assert value(db,"count(*) FROM taskpulse_private.month_revisions")==before
    read_json(db,MEMBER,f"SELECT public.month_archive_read('{MONTH}',2,NULL)")
    own=read_json(db,MEMBER,f"SELECT public.month_archive_read('{MONTH}',2,'{MEMBER}')")
    assert own['sourceInputs'] is None and len(own['members'])==1
    assert own['presentationInputs']['contract']=='m12-scoped-presentation-v1' and 'sources' not in own['presentationInputs']
    assert all(r['user_id']==MEMBER for r in own['presentationInputs']['logs'])
    assert read_json(db,DIRECTOR,f"SELECT public.month_archive_read('{MONTH}',2,NULL)")['presentationInputs']['contract']=='m11-live-presentation-v1'
    assert value(db,"taskpulse_private.award_date_frozen('2026-08-12')")=='t'
    read_json(db,DIRECTOR,f"SELECT public.award_command('request','{{\"date\":\"2026-08-12\"}}'::jsonb,'{uuid4()}')",False)
    sql(db,"WITH job AS (INSERT INTO taskpulse_private.outbox_jobs(kind,entity_id,entity_version,operation_id,payload) VALUES('performance_source_invalidated',gen_random_uuid(),1,gen_random_uuid(),'{}') RETURNING id) INSERT INTO taskpulse_private.performance_runs(job_id,rule_version,source_watermark,context,result) SELECT id,'m07-ten-factor-v1','x','{\"periodStart\":\"2026-08-01\",\"periodEndExclusive\":\"2026-09-01\"}'::jsonb,'{}'::jsonb FROM job",False)
    read_json(db,MEMBER,f"SELECT public.month_archive_read('{MONTH}',2,'{DIRECTOR}')",False)
    read_json(db,'00000000-0000-0000-0000-000000000003',f"SELECT public.month_archive_command('begin_correction','{MONTH}','{{}}'::jsonb,'{uuid4()}',1)",False)
    scope={'reason':'Correct recorded fact with retained review','scope':{'records':[{'kind':'fact','id':FACT,'from':'2026-08-12','through':'2026-08-12'}]}}
    opened,_=command(db,'begin_correction',scope,1)
    assert opened['state']=='correction'
    revise_fact(db,'M12 synthetic corrected fact')
    sql(db,f"UPDATE public.daily_facts SET fact='Rejected unrelated fact' WHERE id='00000000-0000-0000-0000-000000000001'",False) if value(db,"count(*) FROM public.daily_facts WHERE id='00000000-0000-0000-0000-000000000001'")=='1' else None
    revision_payload=payload_for(db,'Publish corrected fact evidence')
    revised,_=command(db,'revise',revision_payload,2)
    assert revised['revisionNumber']==3 and revised['state']=='closed'
    original=read_json(db,DIRECTOR,f"SELECT public.month_archive_read('{MONTH}',2,NULL)")
    latest=read_json(db,DIRECTOR,f"SELECT public.month_archive_read('{MONTH}',3,NULL)")
    assert original['sourceInputs']!=latest['sourceInputs'] and original['superseded'] is True
    assert original['certification']=='incomplete_uncertified' and latest['certification']=='incomplete_uncertified'
    assert int(value(db,"count(*) FROM taskpulse_private.month_revision_members"))>0
    sql(db,f"UPDATE public.daily_facts SET fact='Second rejected closed edit' WHERE id='{FACT}'",False)
    sql(db,"UPDATE public.tasks SET assigned_date='2026-08-12' WHERE id='10000000-0000-0000-0000-000000000001'",False)
    sql(db,f"UPDATE public.tasks SET title='Continuing current work' WHERE id='10000000-0000-0000-0000-000000000001'")
    sql(db,"UPDATE taskpulse_private.month_revisions SET reason='tampered'",False)
    sql(db,"UPDATE taskpulse_private.month_revision_members SET result='{}'",False)
    sql(db,"UPDATE public.monthly_performance_snapshots SET total_logged_hours=999",False)
    current_start=value(db,"date_trunc('month',clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    current_end=value(db,f"('{current_start}'::date+interval '1 month')::date")
    live_payload=payload_for(db,'Current month draft only',current_start,current_end)
    live_request=literal(json.dumps(live_payload))+'::jsonb'
    live=read_json(db,DIRECTOR,f"SELECT public.month_archive_command('draft','{current_start}',{live_request},'{uuid4()}',0)")
    assert live['state']=='live'
    read_json(db,DIRECTOR,f"SELECT public.month_archive_command('close','{current_start}',{live_request},'{uuid4()}',0)",False)
    print('PASS',db,'fresh/upgrade; immutable drafts/close/revision; replay/conflict; role/employee read; named correction; legacy preserved; source guard; current work',flush=True)
