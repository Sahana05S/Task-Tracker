"""M17 sales factor mapping (migration 46): disposable PostgreSQL checks. JWT shim only; no hosted connection.

Supply --psql and --port for an already-running isolated loopback cluster.
Never reads .env.local or contacts a configured Supabase project.
"""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_m17_fresh_test','taskpulse_m17_upgrade_test')
TARGET=46
NUMBERS=sorted(int(p.name.split('_')[0]) for p in (ROOT/'supabase/migrations').glob('*.sql'))
assert TARGET in NUMBERS,'migration 46 missing'
PREV=max(n for n in NUMBERS if n<TARGET)
U=lambda n:'00000000-0000-0000-0000-'+str(n).zfill(12)
user3,user6,user8=U(3),U(6),U(8)

def migrate(db,upto,start=1):
    for m in sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0])):
        n=int(m.name.split('_')[0])
        if n<start:continue
        if n>upto:break
        sql(db,m.read_text(encoding='utf-8'))

def contributions(db,start,end,asof=None,uid='2'):
    q=f"SELECT public.contribution_input_context('{start}','{end}',"+('clock_timestamp()' if asof is None else literal(asof)+'::timestamptz')+');'
    return json.loads(next(x for x in actor(db,U(uid),q) if x.startswith('{')))

def sale_for(ctx,user):
    return next(e['factors']['sale'] for e in ctx['employeeFactors'] if e['userId']==user)

def sale(db,day,author,new,basement,uid='3',success=True):
    return record(db,'sale',{'business_date':day,'author_id':author,'content':'Fixture sale','project_built_up_area':'1,200 sq ft',
        'project_location':'Fixture site','client_name':'Fixture client','is_new_project':new,'basement_payment_received':basement},uid=uid,success=success)

def counts(db):
    return value(db,"jsonb_build_array((SELECT count(*) FROM public.sales_logs),(SELECT count(*) FROM taskpulse_private.input_history),(SELECT count(*) FROM taskpulse_private.outbox_jobs),(SELECT count(*) FROM taskpulse_private.audit_events),(SELECT count(*) FROM taskpulse_private.command_receipts))")

for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    today=None
    if db==DBS[1]:
        migrate(db,PREV);sql(db,seed)
        today=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date");day=value(db,f"'{today}'::date-1")
        month_start=today[:8]+'01'
        assert day>=month_start,'run the harness after the first day of a month'
        pre=sale(db,day,user4,True,True)
        old=contributions(db,month_start,today)
        assert old['ruleVersion']=='m06-support-inputs-v2' and 'sales_field_mapping_missing' in old['reasons']
        assert sale_for(old,user4)['available'] is False and sale_for(old,user4)['rawValue'] is None
        award(db,'request',{'date':day})
        slot=json.loads(value(db,f"to_jsonb(s) FROM taskpulse_private.award_slots s WHERE business_date='{day}'"))
        snapshot=value(db,"jsonb_build_array((SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.sales_logs s),(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.monthly_performance_snapshots m),(SELECT count(*) FROM taskpulse_private.input_history))")
        migrate(db,TARGET,start=TARGET)
        assert snapshot==value(db,"jsonb_build_array((SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.sales_logs s),(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.monthly_performance_snapshots m),(SELECT count(*) FROM taskpulse_private.input_history))"),'46 must not change source rows'
        after=json.loads(value(db,f"to_jsonb(s) FROM taskpulse_private.award_slots s WHERE business_date='{day}'"))
        assert after['version']==slot['version']+1 and after['stale'] is True,'open award days are re-queued'
        assert value(db,f"count(*) FROM taskpulse_private.audit_events WHERE table_name='award_slots' AND row_id='{slot['id']}' AND protected_changes->>'sourceTable'='46_sales_factor_mapping' AND organization_id IS NOT NULL")=='1'
        assert value(db,f"count(*) FROM taskpulse_private.outbox_jobs WHERE kind='award_daily' AND entity_id='{slot['id']}' AND status='pending'")=='1'
        print('PASS',db,f'upgrade {PREV}->{TARGET} keeps every source row, re-queues the open award day with its company and audit row')
    else:
        migrate(db,TARGET);sql(db,seed)
        print('PASS',db,f'fresh install 01-{TARGET}')
    today=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date");day=value(db,f"'{today}'::date-1");month_start=today[:8]+'01'
    tomorrow=value(db,f"'{today}'::date+1")
    assert value(db,"pg_get_userbyid(proowner) FROM pg_proc WHERE proname='contribution_inputs'")=='taskpulse_definer'
    assert value(db,"pg_get_userbyid(proowner) FROM pg_proc WHERE proname='contribution_raw_inputs'")=='taskpulse_definer'
    assert value(db,"has_function_privilege('authenticated','taskpulse_private.contribution_inputs(date,date,timestamptz)','EXECUTE')")=='f'
    assert value(db,"has_function_privilege('authenticated','taskpulse_private.contribution_raw_inputs(jsonb,boolean,uuid)','EXECUTE')")=='f'
    secured=value(db,'taskpulse_private.m15_secure()')
    assert secured.startswith('0 tables') and '0 functions' in secured,secured
    print('PASS',db,'functions stay owned by taskpulse_definer, private, and m15_secure has nothing left to move')

    # Authorization through the real dated-record command.
    before=counts(db)
    sale(db,day,user5,False,False,uid='4',success=False)          # a member cannot post another member's sale
    sale(db,day,U(7),False,False,uid='7',success=False)          # inactive account
    check(db,'anonymous sale save denied',f"SELECT public.dated_record_command('sale',NULL,'save','{{}}',0,'{uuid4()}')",uid='',role='anon',success=False)
    record(db,'sale',{'business_date':day,'author_id':user4,'content':'x','is_new_project':'yes','basement_payment_received':False},uid='3',success=False)
    assert before==counts(db),'denied saves leave no trace'
    own=sale(db,day,user4,False,False,uid='4')                     # own sale allowed
    record(db,'sale',{'state':'validated','reason':'self check'},cmd='validate',id=own['id'],uid='4',success=False)
    print('PASS',db,'sales saves: member own only, inactive/anon denied, flags must be booleans, self-validation denied')

    # Arithmetic: user4 three eligible entries (new+basement, basement, none), user5 one plain entry, user6 none.
    first=sale(db,day,user4,True,True)
    first_asof=value(db,'clock_timestamp()')
    second=sale(db,day,user4,False,True,uid='2')
    record(db,'sale',{'state':'validated','reason':'Independent check'},cmd='validate',id=first['id'],uid='3')
    rejected=sale(db,day,user4,True,True);record(db,'sale',{'state':'rejected','reason':'Duplicate entry'},cmd='validate',id=rejected['id'],uid='1')
    withdrawn=sale(db,day,user4,True,True);record(db,'sale',{'reason':'Entered by mistake'},cmd='withdraw',id=withdrawn['id'],uid='3')
    sale(db,day,user5,False,False)
    ctx=contributions(db,day,today)
    assert ctx['ruleVersion']=='m06-support-inputs-v3' and ctx['salesMapping']['decision']=='D05'
    s4,s5,s6=sale_for(ctx,user4),sale_for(ctx,user5),sale_for(ctx,user6)
    if db==DBS[1]:
        # The pre-upgrade entry (new+basement, pending) is part of user4's history too.
        assert s4['salesCounts']=={'BN':4,'BO':2,'BP':3},s4
        assert s4['rawValue']==0.185,s4                      # (1.5*2+4+0.75*3)/50 = 9.25/50
    else:
        assert s4['salesCounts']=={'BN':3,'BO':1,'BP':2},s4
        assert s4['rawValue']==0.12,s4                       # (1.5*1+3+0.75*2)/50
    assert s4['available'] and s4['reasons']==[] and s4['validatedCount']==1
    assert s5['salesCounts']=={'BN':1,'BO':0,'BP':0} and s5['rawValue']==0.02 and s5['available']
    assert s6['salesCounts']=={'BN':0,'BO':0,'BP':0} and s6['rawValue']==0 and s6['available'],'no sales is a measured zero'
    assert 'sales_field_mapping_missing' not in ctx['reasons'] and ctx['raw']['sale'] is not None
    assert ctx['factors']['sale']['available'] is True
    # As-of: only the first of today's saves had happened.
    early=contributions(db,day,today,asof=first_asof)
    base={'BN':2,'BO':1,'BP':1} if db==DBS[0] else {'BN':3,'BO':2,'BP':2}
    assert sale_for(early,user4)['salesCounts']==base,sale_for(early,user4)
    # Period window: the same entries are outside a window that ends before the business date.
    empty=contributions(db,value(db,f"'{day}'::date-3"),day)
    assert sale_for(empty,user4)['salesCounts']=={'BN':0,'BO':0,'BP':0}
    # Facts/ideas/suggestions arithmetic is unchanged by 46.
    assert ctx['factors']['fact']['available'] in (True,False) and ctx['coefficients']['fact']==[0.75,0.38]
    print('PASS',db,'BN/BO/BP flag counts, exact (1.5*BO+BN+0.75*BP)/50, rejected/withdrawn excluded, zero is measured, as-of and window respected')

    # Certification path: real sales availability, no sales adapter. The award policy is an
    # owner-only fixture (same as the M08 harness), restored afterwards; not a business approval.
    active_policy=value(db,'config FROM taskpulse_private.award_policy')
    policy={'id':'database-fixture-only','window':'one_day','cutoffHour':0,'cutoffMinute':0,'cutoffDayOffset':0,'requirePositiveDayAttendance':True,'exactTie':'no_winner','override':'eligible_complete_replace'}
    sql(db,'UPDATE taskpulse_private.award_policy SET config='+literal(json.dumps(policy))+'::jsonb;')
    for uid in ('1','2','3','4','5','6','8'):
        record(db,'attendance',{'business_date':day,'attendance_status':'Present','attendance_hours':'8','off_hours':'0'},uid=uid)
    sql(db,f"SELECT taskpulse_private.queue_award('{day}',true);")
    job=next(j for j in claim(db) if j['date']==day)
    current=source(db,day,today,role='service_role',uid='');asof=value(db,'clock_timestamp()')
    assert all(f['factors']['sale']['available'] for f in current['contributions']['employeeFactors'])
    context={'businessDate':day,'awardRuleVersion':'m08-shared-performance-v1','policyId':policy['id'],'periodStart':day,'periodEndExclusive':today,
             'cutoff':value(db,f"'{day} 00:00:00 Asia/Kolkata'::timestamptz"),'asOf':asof,'sourceWatermark':current['sourceWatermark']}
    zero={'numerator':'0','denominator':'1'}
    candidates=[]
    for m in current['members']:
        if not m['active']:continue
        factors={f:{'available':True,'rawExact':zero,'medianExact':zero,'deltaExact':zero,'contributionExact':zero} for f in ('productivity','criticality','loading','completion','progress','sales','facts','ideas','suggestions','freshness')}
        composite=zero
        if m['id']==user4:
            factors['sales']={'available':True,'rawExact':{'numerator':'3','denominator':'25'},'medianExact':{'numerator':'1','denominator':'50'},'deltaExact':{'numerator':'1','denominator':'10'},'contributionExact':{'numerator':'1','denominator':'10'}}
            composite={'numerator':'1','denominator':'10'}
        candidates.append({'userId':m['id'],'gate':{'userId':m['id'],'state':'eligible','reasons':[]},'calculation':{'userId':m['id'],'status':'complete','eligibleForRanking':True,'compositeExact':composite,'factors':factors}})
    completed={'status':'completed_winner','winnerId':user4,'context':context,'candidates':candidates,'reasons':[],
               'calculation':{'status':'complete','context':{'ruleVersion':'m07-ten-factor-v1','periodStart':day,'periodEndExclusive':today,'asOf':asof,'sourceWatermark':current['sourceWatermark']}}}
    award(db,'commit',{'jobId':job['id'],'leaseToken':job['leaseToken'],'expectedVersion':job['version'],'result':completed},job['leaseToken'],worker=True)
    view=read_awards(db,day,today)['days'][0]
    assert view['winnerId']==user4 and view['certified'],view
    sql(db,'UPDATE taskpulse_private.award_policy SET config='+(literal(active_policy)+'::jsonb' if active_policy else 'NULL')+',schedule_enabled=false;')
    # Exported for the independent TypeScript source test.
    (ROOT/'__tests__/fixtures'/('m17-sales-source-'+('fresh' if db==DBS[0] else 'upgrade')+'.json')).write_text(json.dumps(current,indent=2)+'\n')
    print('PASS',db,'a complete ten-factor run certifies with real mapped sales (no adapter); fixture policy restored')

    # Atomic failure: a sale save that fails later rolls back every related write.
    before=counts(db)
    sql(db,"CREATE FUNCTION public.m17_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected input history failure' USING ERRCODE='23514';END $$; CREATE TRIGGER m17_fail BEFORE INSERT ON taskpulse_private.input_history FOR EACH ROW EXECUTE FUNCTION public.m17_fail();")
    sale(db,day,user5,True,True,success=False)
    sql(db,'DROP TRIGGER m17_fail ON taskpulse_private.input_history;DROP FUNCTION public.m17_fail();')
    assert before==counts(db),'failed save must leave no partial rows'
    print('PASS',db,'injected failure rolls back sales, history, outbox, audit and receipts together')

    # Provenance: a legacy row (as migration 19 backfilled) leaves only its author unavailable.
    legacy_day=value(db,f"'{day}'::date-2") if value(db,f"'{day}'::date-2>='{month_start}'::date")=='t' else day
    sql(db,f"""INSERT INTO public.sales_logs(sale_date,sales_by,project_built_up_area,is_new_project,basement_payment_received,validation_state)
      VALUES('{legacy_day}','{user8}','legacy',true,false,'legacy_unvalidated');""")
    sql(db,f"""INSERT INTO taskpulse_private.input_history(kind,record_id,record_version,command,source)
      SELECT 'sale',id,record_version,'legacy_current_baseline',to_jsonb(s) FROM public.sales_logs s WHERE sales_by='{user8}';""")
    ctx=contributions(db,legacy_day,today)
    assert sale_for(ctx,user8)['available'] is False and 'legacy_population_or_validation_provenance_missing' in sale_for(ctx,user8)['reasons']
    assert sale_for(ctx,user4)['available'] and sale_for(ctx,user5)['available']
    assert ctx['available'] is False and ctx['factors']['sale']['available'] is False,'the team-wide total is unavailable while any legacy row is unresolved'
    legacy_id=value(db,f"id FROM public.sales_logs WHERE sales_by='{user8}'")
    record(db,'sale',{'business_date':legacy_day,'author_id':user8,'content':'Reconciled legacy entry','is_new_project':True,'basement_payment_received':False,'reason':'Director reconciliation of legacy entry'},id=legacy_id,uid='1')
    ctx=contributions(db,legacy_day,today)
    assert sale_for(ctx,user8)['available'] and sale_for(ctx,user8)['salesCounts']=={'BN':1,'BO':1,'BP':0}
    print('PASS',db,'legacy unvalidated sales flag only their author until a manager reconciles them')

    # Company isolation: company B's sales never appear in company A's inputs.
    sql(db,"INSERT INTO public.organizations(name,slug) VALUES('Beta Builders','beta')")
    B=value(db,"id FROM public.organizations WHERE slug='beta'")
    b_dir,b4='00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4'
    # Provisioned in company B's scope (as a scoped worker would). Unscoped system writes with
    # award days present in two companies hit a pre-existing invalidate_awards gap (see M17 evidence).
    sql(db,f"""BEGIN; SELECT set_config('taskpulse.organization','{B}',true);
      INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
      ('{b_dir}','bdir@beta.test','{{"employee_id":"TEST-1"}}','{{"organization_id":"{B}"}}'),
      ('{b4}','b4@beta.test','{{"employee_id":"TEST-4"}}','{{"organization_id":"{B}"}}');
      UPDATE public.users SET role='managing_director' WHERE id='{b_dir}'; COMMIT;""")
    lines=actor(db,b_dir,'SELECT public.dated_record_command('+','.join([literal('sale'),'NULL',literal('save'),literal(json.dumps({'business_date':day,'author_id':b4,'content':'B sale','is_new_project':True,'basement_payment_received':True}))+'::jsonb','0',literal(uuid4())])+');')
    a_ctx=contributions(db,day,today)
    assert all(s['attributedTo']!=b4 for s in a_ctx['sources']) and all(e['userId']!=b4 for e in a_ctx['employeeFactors'])
    b_ctx=json.loads(next(x for x in actor(db,b_dir,f"SELECT public.contribution_input_context('{day}','{today}',clock_timestamp());") if x.startswith('{')))
    assert sale_for(b_ctx,b4)['salesCounts']=={'BN':1,'BO':1,'BP':1} and all(e['userId'] in (b_dir,b4) for e in b_ctx['employeeFactors'])
    print('PASS',db,'sales inputs are company-scoped')
print(f'PASS M17 sales mapping PostgreSQL {PREV}->{TARGET} and fresh 01-{TARGET}; native JWT/API/worker delivery unverified')
