"""M15 award invalidation company scope (migration 48): two-company disposable PostgreSQL checks.

JWT shim only; no hosted connection. Supply --psql and --port for an already-running
isolated loopback cluster. Never reads .env.local or contacts a configured Supabase project.
"""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_m15_award_scope_fresh_test','taskpulse_m15_award_scope_upgrade_test')
TARGET=48
NUMBERS=sorted(int(p.name.split('_')[0]) for p in (ROOT/'supabase/migrations').glob('*.sql'))
assert TARGET in NUMBERS,'migration 48 missing'
PREV=max(n for n in NUMBERS if n<TARGET)
B_DIR,B4='00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4'

def migrate(db,upto,start=1):
    for m in sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0])):
        n=int(m.name.split('_')[0])
        if n<start:continue
        if n>upto:break
        sql(db,m.read_text(encoding='utf-8'))

def raw(db,statement):
    return subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],
                          input=statement,text=True,capture_output=True,encoding='utf-8')

def signup(n,org):
    """An unscoped system insert, as GoTrue's sign-up does: no signed-in user, no company setting."""
    uid='00000000-0000-0000-0000-0000000000'+n
    return uid,f"""INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
      VALUES('{uid}','{n}@beta.test','{{"employee_id":"TEST-{n}"}}','{{"organization_id":"{org}"}}');"""

def slot(db,org,day):
    r=value(db,f"to_jsonb(s) FROM taskpulse_private.award_slots s WHERE organization_id='{org}' AND business_date='{day}'")
    return json.loads(r) if r else None

def attend(db,uid,day):
    record(db,'attendance',{'business_date':day,'attendance_status':'Present','attendance_hours':'8','off_hours':'0'},uid=uid)

for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    migrate(db,TARGET if db==DBS[0] else PREV);sql(db,seed)
    A=value(db,"id FROM public.organizations WHERE is_default")
    sql(db,"INSERT INTO public.organizations(name,slug) VALUES('Beta Builders','beta')")
    B=value(db,"id FROM public.organizations WHERE slug='beta'")
    sql(db,f"""INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
      ('{B_DIR}','bdir@beta.test','{{"employee_id":"TEST-1"}}','{{"organization_id":"{B}"}}'),
      ('{B4}','b4@beta.test','{{"employee_id":"TEST-4"}}','{{"organization_id":"{B}"}}')""")
    sql(db,f"UPDATE public.users SET role='managing_director' WHERE id='{B_DIR}'")
    today=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    day,day_b=value(db,f"'{today}'::date-1"),value(db,f"'{today}'::date-2")

    # Company A asks for an award day; company B for a different day.
    award(db,'request',{'date':day},uid='1')
    award(db,'request',{'date':day_b},uid='b1')
    a0,b0=slot(db,A,day),slot(db,B,day_b)
    assert a0 and b0 and slot(db,B,day) is None and slot(db,A,day_b) is None

    if db==DBS[1]:
        uid,stmt=signup('c1',B)
        r=raw(db,stmt)
        assert r.returncode and "company could not be determined" in r.stderr,('the defect reproduces before 48',r.stderr[:300])
        assert value(db,f"count(*) FROM public.users WHERE id='{uid}'")=='0'
        print('PASS',db,f'before 48 an unscoped sign-up into company B fails once company A has an award day')
        migrate(db,TARGET,start=PREV+1)
        assert slot(db,A,day)==a0 and slot(db,B,day_b)==b0,'48 changes no award data'
        print('PASS',db,f'upgrade {PREV}->{TARGET} applies and leaves award slots untouched')
    else:
        print('PASS',db,f'fresh install 01-{TARGET}')

    assert value(db,"pg_get_userbyid(proowner) FROM pg_proc WHERE oid='taskpulse_private.invalidate_awards()'::regprocedure")=='taskpulse_definer'
    assert value(db,"prosecdef FROM pg_proc WHERE oid='taskpulse_private.invalidate_awards()'::regprocedure")=='t'
    for f in ('taskpulse_private.invalidate_awards()','taskpulse_private.queue_award(date,boolean)'):
        assert value(db,f"has_function_privilege('authenticated','{f}','EXECUTE')")=='f',f
    secured=value(db,'taskpulse_private.m15_secure()')
    assert secured=='0 tables and 0 functions moved to taskpulse_definer',secured

    # 1. Unscoped sign-up into company B: succeeds; every open day is re-queued in its own company.
    audits=int(value(db,"count(*) FROM taskpulse_private.audit_events WHERE command='invalidate_award'"))
    uid,stmt=signup('c2',B)
    sql(db,stmt)
    assert value(db,f"organization_id::text||':'||is_active FROM public.users WHERE id='{uid}'")==f'{B}:true'
    a1,b1=slot(db,A,day),slot(db,B,day_b)
    assert a1['version']>a0['version'] and a1['stale'] is True and a1['organization_id']==A,a1
    assert b1['version']>b0['version'] and b1['organization_id']==B,b1
    assert slot(db,B,day) is None and slot(db,A,day_b) is None,'no company gains a slot for the other company\'s day'
    assert value(db,"count(*) FROM taskpulse_private.award_slots")=='2'
    for s,org in ((a1,A),(b1,B)):
        assert value(db,f"count(*) FROM taskpulse_private.outbox_jobs WHERE kind='award_daily' AND entity_id='{s['id']}' AND status='pending' AND organization_id='{org}' AND entity_version={s['version']}")=='1'
    assert int(value(db,"count(*) FROM taskpulse_private.audit_events WHERE command='invalidate_award'"))>audits
    assert value(db,"count(*) FROM taskpulse_private.audit_events a JOIN taskpulse_private.award_slots s ON s.id=a.row_id WHERE a.command='invalidate_award' AND a.organization_id IS DISTINCT FROM s.organization_id")=='0'
    assert value(db,"count(*) FROM taskpulse_private.audit_events WHERE command='invalidate_award' AND organization_id IS NULL")=='0'
    print('PASS',db,'unscoped sign-up into B succeeds; A\'s day is re-queued with A\'s company (slot, job, audit) and B gains no row for it')

    # 2. A scoped system context stays scoped: only its company's days, and the setting is restored.
    a1,b1=slot(db,A,day),slot(db,B,day_b)
    uid,stmt=signup('c3',B)
    out=sql(db,f"BEGIN; SELECT set_config('taskpulse.organization','{B}',true);\n{stmt}\nSELECT 'scope:'||current_setting('taskpulse.organization');\nCOMMIT;")
    assert f'scope:{B}' in out,out
    assert slot(db,A,day)==a1,'a company-B-scoped write leaves company A alone'
    assert slot(db,B,day_b)['version']>b1['version']
    out=sql(db,f"BEGIN; {signup('c4',B)[1]}\nSELECT 'scope:['||coalesce(current_setting('taskpulse.organization',true),'')||']';\nCOMMIT;")
    assert 'scope:[]' in out,out
    print('PASS',db,'a scoped system write invalidates only its company and the caller\'s company setting is restored')

    # 3. Signed-in writes invalidate only the caller's company.
    a2,b2=slot(db,A,day),slot(db,B,day_b)
    attend(db,'b4',day)
    a3,b3=slot(db,A,day),slot(db,B,day_b)
    assert a3==a2 and b3['version']>b2['version'],(a3,b3)
    attend(db,'4',day)
    a4,b4=slot(db,A,day),slot(db,B,day_b)
    assert a4['version']>a3['version'] and b4==b3,(a4,b4)
    assert value(db,"count(*) FROM taskpulse_private.award_slots")=='2'
    print('PASS',db,'a signed-in write in B invalidates only B; in A only A')

    # 4. queue_award reads its slot inside the current scope, even for an RLS-bypassing caller.
    out=sql(db,f"""BEGIN;
      SELECT set_config('taskpulse.organization','{B}',true); SELECT taskpulse_private.queue_award('{day}',false) IS NOT NULL;
      SELECT set_config('taskpulse.organization','{A}',true); SELECT taskpulse_private.queue_award('{day}',true) IS NOT NULL;
      SELECT 'versions:'||string_agg(organization_id::text||'='||version,',' ORDER BY organization_id) FROM taskpulse_private.award_slots WHERE business_date='{day}';
      ROLLBACK;""")
    expected=','.join(sorted([f"{A}={a4['version']+1}",f"{B}=1"]))
    assert f'versions:{expected}' in out,(out,expected)
    print('PASS',db,'queue_award under company A\'s scope bumps A\'s slot, not B\'s slot for the same date')
print('ALL M15 AWARD INVALIDATION SCOPE CHECKS PASSED')
