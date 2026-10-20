"""M16 recognition, migration 45: streak day classification and visibility. Two-company disposable PostgreSQL checks. JWT shim only; no hosted connection."""
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
assert LATEST>=45

for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    if db==DBS[1]:
        migrate(db,44); sql(db,seed)
        before={t:value(db,f"count(*) FROM public.{t}") for t in ('attendance_records','daily_task_logs','daily_facts','users')}
        assert value(db,"count(*) FROM pg_proc WHERE proname='recognition_activity_days'")=='0'
        migrate(db,LATEST,after=44)
        for t,n in before.items():assert value(db,f"count(*) FROM public.{t}")==n,t
        print('PASS',db,'upgrade 44->45 adds the policy and the read without touching existing rows')
    else:
        migrate(db,LATEST); sql(db,seed)
        print('PASS',db,'fresh install 01-45')
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

print('ALL PASS')
