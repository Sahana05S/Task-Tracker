"""Migration 60: award invalidation once per award day per transaction. Two-company disposable PostgreSQL checks.

Fresh install 01-60 and upgrade 01-59 -> 60. Covers: one bump, one pending job and one audit row per open day
for a mission create and for several writes in one transaction; separate transactions still bump each time; a day
made current again in the same transaction is invalidated again; a rolled-back savepoint reverts the marker with its
invalidations; switching company scope mid-transaction still invalidates the newly visible company; company
separation and ownership/grants are unchanged.

JWT shim only; no hosted connection. Supply --psql and --port for an already-running isolated loopback cluster.
Never reads .env.local or contacts a configured Supabase project.
"""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_m60_award_once_fresh_test','taskpulse_m60_award_once_upgrade_test')
TARGET=60
NUMBERS=sorted(int(p.name.split('_')[0]) for p in (ROOT/'supabase/migrations').glob('*.sql'))
assert TARGET in NUMBERS,'migration 60 missing'
PREV=max(n for n in NUMBERS if n<TARGET)
B_DIR,B4='00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4'
U=lambda n:'00000000-0000-0000-0000-'+str(n).zfill(12)
MD,M4=U(1),U(4)

def migrate(db,upto,start=1):
    for m in sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0])):
        n=int(m.name.split('_')[0])
        if n<start:continue
        if n>upto:break
        sql(db,m.read_text(encoding='utf-8'))

def as_user(uid,statement):
    """Statements run as a signed-in user inside the caller's transaction."""
    return (f"SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{uid}',true);\n"
            f"{statement.rstrip(';')};\nRESET ROLE; SELECT set_config('request.jwt.claim.sub','',true);\n")

def attendance_sql(day):
    payload={'business_date':day,'attendance_status':'Present','attendance_hours':'8','off_hours':'0'}
    return ("SELECT public.dated_record_command('attendance',NULL,'save',"+literal(json.dumps(payload))+"::jsonb,0,"+literal(uuid4())+")")

def create_sql():
    fields={'task_tag':'','title':'Award probe','category':'T','priority':'Medium','due_date':None,'task_scale':1,
            'description':'probe','template_version_id':None,'initialize_details':True}
    return ("SELECT public.save_task_with_participants(NULL,"+literal(json.dumps(fields))+"::jsonb,ARRAY["+literal(M4)+"]::uuid[],"
            "ARRAY[]::uuid[],NULL,NULL,false,"+literal(uuid4())+")")

def signup(n,org):
    """An unscoped system insert, as GoTrue's sign-up does: no signed-in user."""
    uid='00000000-0000-0000-0000-0000000000'+n
    return uid,f"""INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
      VALUES('{uid}','{n}@m60.test','{{"employee_id":"TEST-{n}"}}','{{"organization_id":"{org}"}}');"""

def versions(db,org):
    return {r.split('|')[0]:int(r.split('|')[1]) for r in sql(db,
        f"SELECT business_date||'|'||version FROM taskpulse_private.award_slots WHERE organization_id='{org}' ORDER BY 1").splitlines()}

def audits(db,org):
    return int(value(db,f"count(*) FROM taskpulse_private.audit_events WHERE command='invalidate_award' AND organization_id='{org}'"))

def bumped(before,after):
    assert before.keys()==after.keys(),(before,after)
    return {d:after[d]-before[d] for d in after}

def jobs_match(db,org):
    """Every open day has exactly one pending job, at the slot's current version."""
    return value(db,f"""count(*) FROM taskpulse_private.award_slots s WHERE s.organization_id='{org}' AND s.stale AND
      (SELECT count(*) FROM taskpulse_private.outbox_jobs j WHERE j.kind='award_daily' AND j.entity_id=s.id
        AND j.status IN ('pending','running','failed','blocked') AND j.entity_version=s.version)<>1""")=='0'

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
    days=[value(db,f"'{today}'::date-{k}") for k in (1,2,3)]
    day_b=value(db,f"'{today}'::date-4")
    for d in days:award(db,'request',{'date':d},uid='1')
    award(db,'request',{'date':day_b},uid='b1')
    assert len(versions(db,A))==3 and len(versions(db,B))==1
    # Attendance is one record per member and day: draw fresh (member, day) pairs in company A.
    pool=[(u,d) for d in (today,days[0]) for u in (U(4),U(5),U(6),U(8),U(1),U(2),U(3))]
    def attend(n=1):
        picks=[pool.pop(0) for _ in range(n)]
        return ''.join(as_user(u,attendance_sql(d)) for u,d in picks)

    if db==DBS[1]:
        # Before 60: two writes in one transaction bump every open day twice.
        v0=versions(db,A)
        sql(db,'BEGIN;\n'+attend(2)+'COMMIT;')
        assert set(bumped(v0,versions(db,A)).values())=={2},'the defect reproduces before 60'
        print('PASS',db,f'before 60 two writes in one transaction bump each open day twice')
        slots_before=sql(db,"SELECT md5(string_agg(to_jsonb(s)::text,',' ORDER BY id)) FROM taskpulse_private.award_slots s")
        definition="md5(pg_get_functiondef('taskpulse_private.invalidate_awards()'::regprocedure))"
        def_before=value(db,definition)
        m60=next((ROOT/'supabase/migrations').glob(f'{TARGET}_*.sql')).read_text(encoding='utf-8')
        assert m60.count('\nCOMMIT;')==1
        broken=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],
            input=m60.replace('\nCOMMIT;','\nSELECT 1/0;\nCOMMIT;'),text=True,capture_output=True,encoding='utf-8')
        assert broken.returncode and 'division by zero' in broken.stderr,broken.stderr[-300:]
        assert value(db,definition)==def_before,'a failed 60 leaves the 48 definition in place'
        print('PASS',db,'a failed migration 60 rolls back and keeps the previous invalidate_awards')
        migrate(db,TARGET,start=PREV+1)
        assert value(db,definition)!=def_before
        assert sql(db,"SELECT md5(string_agg(to_jsonb(s)::text,',' ORDER BY id)) FROM taskpulse_private.award_slots s")==slots_before,'60 changes no data'
        print('PASS',db,f'upgrade {PREV}->{TARGET} applies and leaves award slots untouched')
    else:
        print('PASS',db,f'fresh install 01-{TARGET}')

    fn="'taskpulse_private.invalidate_awards()'::regprocedure"
    assert value(db,f"pg_get_userbyid(proowner)||prosecdef FROM pg_proc WHERE oid={fn}")=='taskpulse_definertrue'
    assert value(db,"has_function_privilege('authenticated','taskpulse_private.invalidate_awards()','EXECUTE')")=='f'
    assert value(db,'taskpulse_private.m15_secure()')=='0 tables and 0 functions moved to taskpulse_definer'
    assert value(db,"count(*) FROM pg_trigger WHERE tgfoid="+fn)=='2','both M08 triggers still call it'
    print('PASS',db,'invalidate_awards stays definer-owned, SECURITY DEFINER, closed to signed-in roles, on both triggers')

    # 1. A mission create (~25 observations) invalidates each open day of the caller's company exactly once.
    v0,a0,vb,ab=versions(db,A),audits(db,A),versions(db,B),audits(db,B)
    actor(db,MD,create_sql())
    assert set(bumped(v0,versions(db,A)).values())=={1},bumped(v0,versions(db,A))
    assert audits(db,A)-a0==len(v0),(audits(db,A)-a0,len(v0))
    assert versions(db,B)==vb and audits(db,B)==ab,'company B is untouched'
    assert jobs_match(db,A)
    print('PASS',db,'a mission create bumps each open day once, with one audit row and one pending job at that version')

    # 2. Several writes in one transaction: still once.
    v0,a0=versions(db,A),audits(db,A)
    sql(db,'BEGIN;\n'+attend(3)+'COMMIT;')
    assert set(bumped(v0,versions(db,A)).values())=={1} and audits(db,A)-a0==len(v0)
    assert jobs_match(db,A)
    print('PASS',db,'three writes in one transaction bump each open day once')

    # 3. Separate transactions each invalidate (a worker may have read between them).
    v0=versions(db,A)
    sql(db,'BEGIN;\n'+attend()+'COMMIT;')
    sql(db,'BEGIN;\n'+attend()+'COMMIT;')
    assert set(bumped(v0,versions(db,A)).values())=={2}
    print('PASS',db,'two separate transactions bump each open day twice')

    # 4. A day made current again later in the same transaction is invalidated again.
    v0=versions(db,A)
    target=days[0]
    out=sql(db,'BEGIN;\n'+as_user(MD,create_sql())
            # As a completed award run would leave it.
            +f"UPDATE taskpulse_private.award_slots SET stale=false WHERE organization_id='{A}' AND business_date='{target}';\n"
            +f"SELECT 'mid:'||stale FROM taskpulse_private.award_slots WHERE organization_id='{A}' AND business_date='{target}';\n"
            +as_user(MD,create_sql())
            +f"SELECT 'end:'||stale FROM taskpulse_private.award_slots WHERE organization_id='{A}' AND business_date='{target}';\nCOMMIT;")
    assert 'mid:false' in out and 'end:true' in out,out
    delta=bumped(v0,versions(db,A))
    assert delta[target]==2 and all(delta[d]==1 for d in delta if d!=target),delta
    assert jobs_match(db,A)
    print('PASS',db,'a day made current again inside the transaction is invalidated again; the others once')

    # 5. A rolled-back savepoint reverts the marker together with its invalidations.
    v0,a0=versions(db,A),audits(db,A)
    write=attend()  # the same save twice: the first one is rolled back
    sql(db,'BEGIN;\nSAVEPOINT probe;\n'+write+'ROLLBACK TO SAVEPOINT probe;\n'+write+'COMMIT;')
    assert set(bumped(v0,versions(db,A)).values())=={1} and audits(db,A)-a0==len(v0)
    assert jobs_match(db,A)
    print('PASS',db,'after a rolled-back savepoint the next write still invalidates every open day')

    # 6. A system context that switches company mid-transaction invalidates each company it sees.
    v0,vb=versions(db,A),versions(db,B)
    _,stmt_b=signup('c1',B);_,stmt_a=signup('c2',A)
    sql(db,f"BEGIN;\nSELECT set_config('taskpulse.organization','{B}',true);\n{stmt_b}\n"
           f"SELECT set_config('taskpulse.organization','{A}',true);\n{stmt_a}\nCOMMIT;")
    assert set(bumped(vb,versions(db,B)).values())=={1},'B once'
    assert set(bumped(v0,versions(db,A)).values())=={1},'A is not skipped because B ran first'
    print('PASS',db,'switching company scope mid-transaction invalidates the newly visible company once')

    # 7. Unscoped system writes still cover every company, once each.
    v0,vb=versions(db,A),versions(db,B)
    sql(db,'BEGIN;\n'+signup('c3',B)[1]+'\n'+signup('c4',A)[1]+'\nCOMMIT;')
    assert set(bumped(v0,versions(db,A)).values())=={1} and set(bumped(vb,versions(db,B)).values())=={1}
    assert value(db,"count(*) FROM taskpulse_private.audit_events a JOIN taskpulse_private.award_slots s ON s.id=a.row_id WHERE a.command='invalidate_award' AND a.organization_id IS DISTINCT FROM s.organization_id")=='0'
    assert jobs_match(db,A) and jobs_match(db,B)
    print('PASS',db,'unscoped system writes still invalidate every company\'s open days, once each, audited in the slot\'s company')

    # 8. Signed-in company B writes leave company A alone.
    v0,vb=versions(db,A),versions(db,B)
    sql(db,'BEGIN;\n'+as_user(B4,attendance_sql(today))+as_user(B_DIR,attendance_sql(today))+'COMMIT;')
    assert versions(db,A)==v0 and set(bumped(vb,versions(db,B)).values())=={1}
    print('PASS',db,'a signed-in write in B invalidates only B, once')
print('ALL M60 AWARD INVALIDATION ONCE-PER-TRANSACTION CHECKS PASSED')
