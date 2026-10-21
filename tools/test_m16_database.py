"""M16 recognition: migration 45 (streak day classification and visibility) and migration 50 (the monthly
award ceremony: publication, reads and derived recognition points). Two-company disposable PostgreSQL
checks. JWT shim only; no hosted connection."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_m16_fresh_test','taskpulse_m16_upgrade_test')
T1='10000000-0000-0000-0000-000000000001'
A_DIR,A2,A4,A5='00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000005'
B_DIR,B4='00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4'
BT='20000000-0000-0000-0000-0000000000b1'

def first_json(rows):return json.loads(next(x for x in rows if x.startswith('{')))
def as_user(db,uid,statement,success=True):return actor(db,uid,statement,success)
def expect_code(db,uid,statement,code):
    r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],
        input=f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{uid}',true);\n{statement.rstrip(';')};\nCOMMIT;",
        text=True,capture_output=True,encoding='utf-8')
    assert r.returncode and code in r.stderr,(statement[:120],r.stderr[:300])
def migrate(db,upto,after=0):
    for m in sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0])):
        n=int(m.name.split('_')[0])
        if n>upto:break
        if n>after:sql(db,m.read_text(encoding='utf-8'))
def days(db,uid,as_of=None,employee=None):
    q="SELECT public.recognition_activity_days("+('NULL' if as_of is None else f"'{as_of}'")+","+('NULL' if employee is None else f"'{employee}'")+")"
    return first_json(as_user(db,uid,q))
def codes(model,uid):return next(m['days'] for m in model['members'] if m['userId']==uid)

LATEST=max(int(p.name.split('_')[0]) for p in (ROOT/'supabase/migrations').glob('*.sql'))
assert LATEST>=50
M50=next((ROOT/'supabase/migrations').glob('50_*.sql')).read_text(encoding='utf-8')

for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    if db==DBS[1]:
        migrate(db,44); sql(db,seed)
        before={t:value(db,f"count(*) FROM public.{t}") for t in ('attendance_records','daily_task_logs','daily_facts','users')}
        assert value(db,"count(*) FROM pg_proc WHERE proname='recognition_activity_days'")=='0'
        migrate(db,49,after=44)
        for t,n in before.items():assert value(db,f"count(*) FROM public.{t}")==n,t
        print('PASS',db,'upgrade 44->45 adds the policy and the read without touching existing rows')
        # A failure inside migration 50 leaves nothing behind (one transaction).
        r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],
            input=M50.replace('SELECT taskpulse_private.m15_secure();','SELECT 1/0;'),text=True,capture_output=True,encoding='utf-8')
        assert r.returncode and 'division by zero' in r.stderr,r.stderr[-300:]
        assert value(db,"count(*) FROM pg_class WHERE relname LIKE 'recognition_ceremon%'")=='0'
        assert value(db,"count(*) FROM pg_proc WHERE proname LIKE 'recognition_ceremony%' OR proname='recognition_points'")=='0'
        print('PASS',db,'a failed migration 50 rolls back completely')
        before={t:value(db,f"count(*) FROM {t}") for t in ('public.users','public.tasks','taskpulse_private.award_slots','taskpulse_private.month_revisions','taskpulse_private.recognition_policy')}
        migrate(db,LATEST,after=49)
        for t,n in before.items():assert value(db,f"count(*) FROM {t}")==n,t
        print('PASS',db,'upgrade 49->50 adds the ceremony objects without touching existing rows')
    else:
        migrate(db,LATEST); sql(db,seed)
        print('PASS',db,f'fresh install 01-{LATEST}')
    assert value(db,"taskpulse_private.m15_secure()")=='0 tables and 0 functions moved to taskpulse_definer','everything new is already owned by taskpulse_definer'
    assert value(db,"pg_get_userbyid(relowner) FROM pg_class WHERE relname='recognition_policy'")=='taskpulse_definer'
    assert value(db,"config->'points'->>'monthlyStar' FROM taskpulse_private.recognition_policy")=='100'
    assert value(db,"config->>'milestones' FROM taskpulse_private.recognition_policy")=='[3, 7, 14, 30, 60, 100]'
    as_user(db,A4,"SELECT count(*) FROM taskpulse_private.recognition_policy",False)
    print('PASS',db,'policy singleton seeded (10/25/100, milestones 3..100) and closed to signed-in roles')

    default=value(db,"id FROM public.organizations WHERE is_default")
    sql(db,"INSERT INTO public.organizations(name,slug) VALUES('Beta Builders','beta')")
    B=value(db,"id FROM public.organizations WHERE slug='beta'")
    sql(db,f"""INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
      ('{B_DIR}','bdir@beta.test','{{"employee_id":"TEST-1"}}','{{"organization_id":"{B}"}}'),
      ('{B4}','b4@beta.test','{{"employee_id":"TEST-4"}}','{{"organization_id":"{B}"}}')""")
    sql(db,f"UPDATE public.users SET role='managing_director' WHERE id='{B_DIR}'")
    sql(db,f"INSERT INTO public.tasks(id,task_tag,title,assignee_id,task_scale) VALUES('{BT}','T1','Beta task','{B4}',5)")

    today=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    def d(n):return value(db,f"('{today}'::date-({n}))::date")
    # Member A4's last ten days, oldest first (d9..d0):
    #  d9 Present+log      -> c
    #  d8 Present+fact     -> c
    #  d7 Holiday          -> s
    #  d6 no record        -> s
    #  d5 Present, nothing -> b
    #  d4 Present+reversed log only          -> b  (reversed logs do not count)
    #  d3 Present+rejected fact only         -> b  (rejected contributions do not count)
    #  d2 Half Day+idea    -> c
    #  d1 Present+withdrawn attendance+log   -> s  (withdrawn record = no record)
    #  d0 Absent+log       -> b  (absent breaks even with a log; today's break is pending in TS)
    def seed_as(uid,body):
        sql(db,"BEGIN; SELECT set_config('request.jwt.claim.sub','"+uid+"',true);"+chr(10)+body+chr(10)+"COMMIT;")
    seed_as(A4,f"""
      INSERT INTO public.attendance_records(user_id,attendance_date,status) VALUES
       ('{A4}','{d(9)}','Present'),('{A4}','{d(8)}','Present'),('{A4}','{d(7)}','Holiday'),('{A4}','{d(5)}','Present'),
       ('{A4}','{d(4)}','Present'),('{A4}','{d(3)}','Present'),('{A4}','{d(2)}','Half Day'),('{A4}','{d(0)}','Absent');
      INSERT INTO public.attendance_records(user_id,attendance_date,status,record_state) VALUES ('{A4}','{d(1)}','Present','withdrawn');
      INSERT INTO public.daily_task_logs(task_id,user_id,log_date,hours_worked) VALUES ('{T1}','{A4}','{d(9)}',2),('{T1}','{A4}','{d(1)}',1),('{T1}','{A4}','{d(0)}',1);
      INSERT INTO public.daily_task_logs(task_id,user_id,log_date,hours_worked,reversed_at) VALUES ('{T1}','{A4}','{d(4)}',1,clock_timestamp());
      INSERT INTO public.daily_facts(posted_by,fact_date,fact,validation_state) VALUES ('{A4}','{d(8)}','counted fact','pending'),('{A4}','{d(3)}','rejected fact','rejected');
      INSERT INTO public.ideas(posted_by,idea_date,idea,validation_state) VALUES ('{A4}','{d(2)}','an idea','validated');""")
    # Member A5: a clean run, and a Present day with a suggestion only.
    seed_as(A5,f"""
      INSERT INTO public.attendance_records(user_id,attendance_date,status) VALUES ('{A5}','{d(2)}','Present'),('{A5}','{d(1)}','Present'),('{A5}','{d(0)}','Present');
      INSERT INTO public.suggestions(posted_by,suggestion_date,suggestion,validation_state) VALUES ('{A5}','{d(2)}','a suggestion','pending');
      INSERT INTO public.daily_task_logs(task_id,user_id,log_date,hours_worked) VALUES ('{T1}','{A5}','{d(1)}',3);""")
    # Company B member: present and logging today.
    seed_as(B4,f"""
      INSERT INTO public.attendance_records(user_id,attendance_date,status) VALUES ('{B4}','{d(0)}','Present');
      INSERT INTO public.daily_task_logs(task_id,user_id,log_date,hours_worked) VALUES ('{BT}','{B4}','{d(0)}',2);""")

    model=days(db,A4)
    assert model['asOf']==today and model['timezone']=='Asia/Kolkata' and model['policy']['lookbackDays']==400
    assert [m['userId'] for m in model['members']]==[A4],'a member receives only their own days'
    s=codes(model,A4)
    assert len(s)==400 and value(db,f"('{model['from']}'::date+399)::date")==today
    assert s[-10:]=='ccssbbbcsb',s[-10:]
    assert set(s[:-10])=={'s'},'days without any record are skipped'
    print('PASS',db,'day codes: logs/facts/ideas count on Present/Half Day; holiday, missing and withdrawn records skip; nothing-logged, reversed-only, rejected-only and Absent days break')

    s5=codes(days(db,A5),A5)
    assert s5[-3:]=='ccb',s5[-3:]
    print('PASS',db,'a suggestion counts; a present day with nothing logged breaks')

    # As-of in the past re-classifies up to that day only.
    past=days(db,A4,as_of=d(5))
    assert past['asOf']==d(5) and codes(past,A4)[-5:]=='ccssb'
    expect_code(db,A4,f"SELECT public.recognition_activity_days('{d(-1)}',NULL)",'23514')
    print('PASS',db,'as-of is bounded to today or earlier')

    # Visibility: members see themselves only; managers see any member or everyone in their company.
    expect_code(db,A4,f"SELECT public.recognition_activity_days(NULL,'{A5}')",'42501')
    assert codes(days(db,A4,employee=A4),A4)==s,'naming yourself is allowed'
    assert codes(days(db,A_DIR,employee=A4),A4)==s and codes(days(db,A2,employee=A5),A5)==s5
    everyone=days(db,A_DIR)
    ids={m['userId'] for m in everyone['members']}
    assert A4 in ids and A5 in ids and B4 not in ids and '00000000-0000-0000-0000-000000000007' not in ids,'director sees active members of company A only'
    b=days(db,B_DIR)
    assert {m['userId'] for m in b['members']}=={B_DIR,B4} and codes(b,B4)[-1]=='c'
    expect_code(db,B_DIR,f"SELECT public.recognition_activity_days(NULL,'{A4}')",'42501')
    expect_code(db,B4,f"SELECT public.recognition_activity_days(NULL,'{A4}')",'42501')
    actor(db,'',"SELECT public.recognition_activity_days(NULL,NULL)",False,role='anon')
    sql(db,"UPDATE public.users SET is_active=false WHERE id='"+A5+"'")
    actor(db,A5,"SELECT public.recognition_activity_days(NULL,NULL)",False)
    sql(db,"UPDATE public.users SET is_active=true WHERE id='"+A5+"'")
    print('PASS',db,'members read only themselves; managers read their company; other companies, anonymous and inactive accounts are refused')

    # A correction is reflected on the next read: withdrawing the Absent record makes today a skip.
    sql(db,f"UPDATE public.attendance_records SET record_state='withdrawn' WHERE user_id='{A4}' AND attendance_date='{d(0)}'")
    assert codes(days(db,A4),A4)[-1]=='s'
    seed_as(A4,f"UPDATE public.daily_task_logs SET reversed_at=NULL WHERE user_id='{A4}' AND log_date='{d(4)}';")
    assert codes(days(db,A4),A4)[-5]=='c','un-reversing the log counts the day again'
    print('PASS',db,'nothing is stored: attendance and log corrections change the next read')

    # ------------------------------------------------------------------
    # Migration 50: the monthly award ceremony
    # ------------------------------------------------------------------
    for t in ('recognition_ceremonies','recognition_ceremony_awards','recognition_ceremony_receipts'):
        assert value(db,f"pg_get_userbyid(relowner) FROM pg_class WHERE relname='{t}'")=='taskpulse_definer',t
        assert value(db,f"relforcerowsecurity FROM pg_class WHERE relname='{t}'")=='t',t
    A6,A8='00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000008'
    ORG=default
    ACTIVE=sorted(value(db,f"string_agg(id::text,',') FROM public.users WHERE organization_id='{ORG}' AND is_active").split(','))
    P=value(db,"(date_trunc('month',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date)-interval '2 months')::date")
    P1=value(db,"(date_trunc('month',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date)-interval '1 month')::date")
    CUR=value(db,"date_trunc('month',(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date)::date")
    NOW_SQL="to_char(clock_timestamp()-interval '{}','YYYY-MM-DD\"T\"HH24:MI:SS.MSOF')"
    def next_month(m):return value(db,f"('{m}'::date+interval '1 month')::date")
    def seed_awards(month,winner_of_day,skip_last=False):
        last=value(db,f"('{month}'::date+interval '1 month'-interval '1 day')::date")
        sql(db,f"""DO $$ DECLARE d date; sid uuid; rid uuid; oid uuid; i int:=0; w uuid; BEGIN
         FOR d IN SELECT g::date FROM generate_series('{month}'::date,'{last}'::date,interval '1 day') g LOOP
          i:=i+1;
          IF {str(skip_last).lower()} AND d='{last}'::date THEN CONTINUE; END IF;
          w:=CASE {winner_of_day} END;
          INSERT INTO taskpulse_private.award_slots(organization_id,business_date,stale) VALUES('{ORG}',d,true) RETURNING id INTO sid;
          INSERT INTO taskpulse_private.award_runs(organization_id,slot_id,slot_version,status,context,result,winner_id,certified)
           VALUES('{ORG}',sid,1,CASE WHEN w IS NULL THEN 'completed_none' ELSE 'completed_winner' END,'{{}}','{{}}',w,true) RETURNING id INTO rid;
          oid:=NULL;
          IF i=19 AND '{month}'='{P}' THEN
           INSERT INTO taskpulse_private.award_overrides(organization_id,run_id,user_id,actor_id,reason)
           VALUES('{ORG}',rid,'{A4}','{A_DIR}','Director override in the test') RETURNING id INTO oid;
          END IF;
          UPDATE taskpulse_private.award_slots SET latest_run=rid,effective_run=rid,override_id=oid,stale=false WHERE id=sid;
         END LOOP; END $$;""")
    FACTORS=['productivity','criticality','loading','completion','progress','sales','facts','ideas','suggestions','freshness']
    def scoped_watermark(uid):
        rows=sql(db,"BEGIN; SET LOCAL ROLE taskpulse_definer; SELECT set_config('request.jwt.claim.sub','"+uid+"',true);\n"
                 "SELECT taskpulse_private.performance_watermark(clock_timestamp());\nCOMMIT;").splitlines()
        return [x for x in rows if x.count(':')==2][-1]
    def calculation(month,values,member_reasons,watermark,asof=None,members=None):
        out=[]
        for uid in (members or ACTIVE):
            f={}
            for k in FACTORS:
                if k=='sales':f[k]={'available':False,'rawExact':None,'reasons':['sales_field_mapping_missing']}
                else:f[k]={'available':True,'rawExact':{'numerator':str(values.get(uid,{}).get(k,0)),'denominator':'1'},'reasons':[]}
            out.append({'userId':uid,'status':'incomplete','factors':f,'compositeExact':None,'reasons':member_reasons.get(uid,[]),'eligibleForRanking':False})
        return {'context':{'ruleVersion':'m07-ten-factor-v1','periodStart':month,'periodEndExclusive':next_month(month),
                           'asOf':asof or value(db,NOW_SQL.format('1 second')),'sourceWatermark':watermark},
                'status':'incomplete','members':out,'reasons':[]}
    # Same numbers as modules/recognition/__tests__/ceremony.test.ts: productivity A4; ideas A4=A8 tie;
    # loading A5 highest but attendance-invalid, so A6; every other factor zero; sales unmapped.
    VALUES={A4:{'productivity':3,'ideas':2},A5:{'productivity':2,'loading':9},A6:{'loading':5},A8:{'ideas':2}}
    REASONS={A5:['attendance_invalid']}
    def payload(month,winner,reason='',watermark=None,**kw):
        calc=calculation(month,VALUES,REASONS,watermark or scoped_watermark(A_DIR),**kw)
        return {'reason':reason,'calculation':calc,'monthlySelection':{'status':'complete','winnerId':winner}}
    def publish_sql(month,body,op,expected):
        return f"SELECT public.recognition_ceremony_command('{month}',$j${json.dumps(body)}$j$::jsonb,'{op}',{expected})"
    def publish(uid,month,body,op,expected):return first_json(as_user(db,uid,publish_sql(month,body,op,expected)))
    def read(uid,month):return first_json(as_user(db,uid,f"SELECT public.recognition_ceremony_read('{month}')"))

    assert read(A4,P)=={'period':P,'published':False,'revisionNumber':0,'canPublish':False}
    assert read(A_DIR,P)['canPublish'] is True
    good=payload(P,A4)
    for uid in (A4,A2,B4):expect_code(db,uid,publish_sql(P,good,uuid4(),0),'42501')
    actor(db,'',publish_sql(P,good,uuid4(),0),False,role='anon')
    # Migration 49 keeps one active director per company, so a second one stands in while A_DIR is inactive.
    sql(db,f"UPDATE public.users SET role='managing_director' WHERE id='{A8}'; UPDATE public.users SET is_active=false WHERE id='{A_DIR}'")
    expect_code(db,A_DIR,publish_sql(P,good,uuid4(),0),'42501')
    sql(db,f"UPDATE public.users SET is_active=true WHERE id='{A_DIR}'; UPDATE public.users SET role='team_member' WHERE id='{A8}'")
    # Company B cannot publish company A's calculation: A's watermark is not B's, and A's members are not B's.
    expect_code(db,B_DIR,publish_sql(P,good,uuid4(),0),'40001')
    expect_code(db,B_DIR,publish_sql(P,payload(P,A4,watermark=scoped_watermark(B_DIR)),uuid4(),0),'23514')
    print('PASS',db,'only an active managing director of the company may publish; members, engineers, other companies, anonymous and inactive accounts are refused')

    # Award evidence is seeded only now: the user updates above invalidate award slots (migration 48)
    # and move the source watermark, so the payload is built afresh too.
    # Month P: A4 wins days 1-10, A5 days 11-19 but day 19 is overridden to A4, nobody after: A4 11, A5 8.
    seed_awards(P,f"WHEN i<=10 THEN '{A4}'::uuid WHEN i<=19 THEN '{A5}'::uuid ELSE NULL")
    # Month P1: A5 every day except the last, which has no decided slot.
    seed_awards(P1,f"WHEN true THEN '{A5}'::uuid",skip_last=True)
    good=payload(P,A4)
    expect_code(db,A_DIR,publish_sql(CUR,payload(CUR,None),uuid4(),0),'23514')
    expect_code(db,A_DIR,publish_sql(P,{**good,'extra':1},uuid4(),0),'23514')
    expect_code(db,A_DIR,publish_sql(P,payload(P,A4,asof=value(db,NOW_SQL.format('20 minutes'))),uuid4(),0),'40001')
    expect_code(db,A_DIR,publish_sql(P,payload(P,A4,watermark='0:0:0'),uuid4(),0),'40001')
    expect_code(db,A_DIR,publish_sql(P,payload(P,A4,members=[m for m in ACTIVE if m!=A8]),uuid4(),0),'23514')
    expect_code(db,A_DIR,publish_sql(P,payload(P,A5),uuid4(),0),'40001')
    expect_code(db,A_DIR,publish_sql(P,good,uuid4(),1),'40001')
    assert value(db,"count(*) FROM taskpulse_private.recognition_ceremonies")=='0'
    print('PASS',db,'an unfinished month, unknown fields, an old or stale calculation, a missing member, a wrong monthly star and a stale revision are refused')

    # Failure part-way through the awards rolls the whole publication back.
    sql(db,"""CREATE FUNCTION public.m50_fail() RETURNS trigger LANGUAGE plpgsql AS $f$BEGIN
      IF NEW.category='freshness' THEN RAISE EXCEPTION 'injected failure' USING ERRCODE='23514'; END IF; RETURN NEW; END$f$;
      CREATE TRIGGER zz_m50_fail BEFORE INSERT ON taskpulse_private.recognition_ceremony_awards FOR EACH ROW EXECUTE FUNCTION public.m50_fail();""")
    expect_code(db,A_DIR,publish_sql(P,good,uuid4(),0),'23514')
    sql(db,"DROP TRIGGER zz_m50_fail ON taskpulse_private.recognition_ceremony_awards; DROP FUNCTION public.m50_fail();")
    for t in ('recognition_ceremonies','recognition_ceremony_awards','recognition_ceremony_receipts'):
        assert value(db,f"count(*) FROM taskpulse_private.{t}")=='0',t
    print('PASS',db,'a failure while writing the awards rolls the publication back (no ceremony, awards or receipt)')

    op=uuid4()
    first=publish(A_DIR,P,good,op,0)
    assert first['revisionNumber']==1 and first['monthlyStar']['winnerId']==A4 and first['monthlyStar']['counts']=={A4:11,A5:8},first['monthlyStar']
    assert first['awarded']==2,first
    assert publish(A_DIR,P,good,op,0)==first,'a replay returns the original response'
    expect_code(db,A_DIR,publish_sql(P,payload(P,A4,reason='different input here'),op,0),'40001')
    assert value(db,"count(*) FROM taskpulse_private.recognition_ceremonies")=='1' and value(db,"count(*) FROM taskpulse_private.recognition_ceremony_awards")=='10'
    print('PASS',db,'publishing writes one ceremony and ten awards; the monthly star counts overrides; a replay adds nothing; a reused operation with new input is refused')

    seen=read(A4,P); byc={a['category']:a for a in seen['awards']}
    assert seen['published'] and seen['revisionNumber']==1 and seen['reason'] is None and [a['category'] for a in seen['awards']]==FACTORS
    assert seen['names'][A6] and B4 not in seen['names'],'names of the company only'
    assert byc['productivity']['status']=='awarded' and byc['productivity']['winnerId']==A4 and byc['productivity']['winningRaw']=={'numerator':'3','denominator':'1'}
    assert byc['loading']['status']=='awarded' and byc['loading']['winnerId']==A6 and byc['loading']['winningRaw'] is None,"attendance-invalid A5 is skipped; another winner's value is hidden"
    assert byc['ideas']['status']=='tie' and byc['ideas']['tiedIds']==sorted([A4,A8]) and byc['ideas']['winningRaw'] is None
    assert byc['facts']['status']=='no_eligible' and byc['sales']['status']=='unavailable' and 'sales_field_mapping_missing' in byc['sales']['reasons']
    mgr=read(A2,P)
    assert {a['category']:a for a in mgr['awards']}['loading']['winningRaw']=={'numerator':'5','denominator':'1'} and mgr['reason']=='First publication'
    assert read(B_DIR,P)['published'] is False,"company B does not see company A's ceremony"
    as_user(db,A_DIR,"SELECT count(*) FROM taskpulse_private.recognition_ceremonies",False)
    print('PASS',db,'reads: winners for everyone, winning values for the winner and managers only, company-scoped; private tables closed')

    expect_code(db,A_DIR,publish_sql(P,payload(P,A4),uuid4(),1),'23514')
    second=publish(A_DIR,P,payload(P,A4,reason='Attendance corrected for one day'),uuid4(),1)
    assert second['revisionNumber']==2 and read(A4,P)['revisionNumber']==2
    sql(db,"UPDATE taskpulse_private.recognition_ceremonies SET reason='rewritten history'",False)
    sql(db,"DELETE FROM taskpulse_private.recognition_ceremony_awards",False)
    assert value(db,f"count(*) FROM taskpulse_private.recognition_ceremonies WHERE period_start='{P}'")=='2'
    print('PASS',db,'republishing needs a reason and keeps every revision; published rows cannot be changed or deleted')

    p1=publish(A_DIR,P1,payload(P1,None),uuid4(),0)
    assert p1['monthlyStar']['status']=='incomplete' and p1['monthlyStar']['winnerId'] is None and p1['monthlyStar']['reasons']==['daily_coverage_incomplete']
    print('PASS',db,'a month with an undecided day publishes its category awards with the monthly star still pending')

    points=first_json(as_user(db,A4,"SELECT public.recognition_points(NULL)"))
    assert points['policy']=={'dailyStar':10,'categoryAward':25,'monthlyStar':100} and points['entries'] is None
    pm={m['userId']:m for m in points['members']}
    n1=int(value(db,f"('{P1}'::date+interval '1 month')::date-'{P1}'::date"))
    assert pm[A4]['dailyStars']==11 and pm[A4]['monthlyStars']==1 and pm[A4]['categoryAwards']==2 and pm[A4]['categories']=={'productivity':2},pm[A4]
    assert pm[A5]['dailyStars']==8+n1-1 and pm[A5]['monthlyStars']==0 and pm[A6]['categories']=={'loading':2},(pm[A5],pm[A6])
    assert B4 not in pm and '00000000-0000-0000-0000-000000000007' not in pm
    assert pm[A4]['name']
    mine=first_json(as_user(db,A4,f"SELECT public.recognition_points('{A4}')"))['entries']
    assert sum(e['kind']=='dailyStar' for e in mine)==11 and sum(e['kind']=='monthlyStar' for e in mine)==1 and sum(e['kind']=='categoryAward' for e in mine)==2
    expect_code(db,A4,f"SELECT public.recognition_points('{A5}')",'42501')
    assert first_json(as_user(db,A2,f"SELECT public.recognition_points('{A5}')"))['entries'] is not None
    expect_code(db,A_DIR,f"SELECT public.recognition_points('{B4}')",'42501')
    assert {m['userId'] for m in first_json(as_user(db,B4,"SELECT public.recognition_points(NULL)"))['members']}=={B_DIR,B4}
    print('PASS',db,'points are derived: certified effective daily stars (overrides included), latest-revision category awards and monthly stars; own or manager entries only; company-scoped')
    assert value(db,"taskpulse_private.m15_secure()")=='0 tables and 0 functions moved to taskpulse_definer'

print('ALL PASS')
