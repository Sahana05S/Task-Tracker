"""Migration 62: award_read_model returns each day's last decided result. Two-company disposable PostgreSQL checks.

Fresh install 01-62 and upgrade 01-61 -> 62 (a failed apply rolls back). Covers: lastDecided for a certified winner,
a certified no-winner day and a director override; null for a day whose latest run is blocked; the decision survives
an ordinary write that marks every day stale while winnerId, certified and status keep today's meaning; a later
blocked run clears it; each company reads only its own days; ownership and grants are unchanged.

JWT shim only; no hosted connection. Supply --psql and --port for an already-running isolated loopback cluster.
Never reads .env.local or contacts a configured Supabase project.
"""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_m62_last_decided_fresh_test','taskpulse_m62_last_decided_upgrade_test')
TARGET=62
NUMBERS=sorted(int(p.name.split('_')[0]) for p in (ROOT/'supabase/migrations').glob('*.sql'))
assert TARGET in NUMBERS,'migration 62 missing'
PREV=max(n for n in NUMBERS if n<TARGET)
B_DIR='00000000-0000-0000-0000-0000000000b1'
U=lambda n:'00000000-0000-0000-0000-'+str(n).zfill(12)
MD=U(1)


def migrate(db,upto,start=1):
    for m in sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0])):
        n=int(m.name.split('_')[0])
        if n<start:continue
        if n>upto:break
        sql(db,m.read_text(encoding='utf-8'))


def run(db,slot_id,status,winner=None,certified=True):
    """A committed worker run, written as the owner (the worker path needs the app)."""
    rid=str(uuid4())
    sql(db,f"""INSERT INTO taskpulse_private.award_runs(id,slot_id,slot_version,status,context,result,winner_id,certified)
      SELECT '{rid}',id,version,'{status}','{{}}'::jsonb,'{{"reasons":[]}}'::jsonb,{literal(winner) if winner else 'NULL'},{str(certified).lower()}
      FROM taskpulse_private.award_slots WHERE id='{slot_id}';
      UPDATE taskpulse_private.award_slots SET latest_run='{rid}',
        effective_run=CASE WHEN {str(certified).lower()} THEN '{rid}'::uuid END,stale=false WHERE id='{slot_id}';""")
    return rid


def by_date(model):
    return {d['date']:d for d in model['days']}


for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    migrate(db,TARGET if db==DBS[0] else PREV);sql(db,seed)
    A=value(db,"id FROM public.organizations WHERE is_default")
    sql(db,"INSERT INTO public.organizations(name,slug) VALUES('Beta Builders','beta')")
    B=value(db,"id FROM public.organizations WHERE slug='beta'")
    sql(db,f"""INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
      ('{B_DIR}','bdir@beta.test','{{"employee_id":"TEST-1"}}','{{"organization_id":"{B}"}}')""")
    sql(db,f"UPDATE public.users SET role='managing_director' WHERE id='{B_DIR}'")
    today=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    win_day,none_day,blocked_day,override_day=[value(db,f"'{today}'::date-{k}") for k in (4,3,2,1)]
    for d in (win_day,none_day,blocked_day,override_day):award(db,'request',{'date':d},uid='1')
    award(db,'request',{'date':win_day},uid='b1')
    s_win,s_none,s_blocked,s_override=(value(db,f"id FROM taskpulse_private.award_slots WHERE business_date='{d}' AND organization_id='{A}'")
                                       for d in (win_day,none_day,blocked_day,override_day))
    s_b=value(db,f"id FROM taskpulse_private.award_slots WHERE business_date='{win_day}' AND organization_id='{B}'")
    win_run=run(db,s_win,'completed_winner',U(2))
    none_run=run(db,s_none,'completed_none')
    run(db,s_blocked,'blocked',certified=False)
    base=run(db,s_override,'completed_winner',U(3))
    override=str(uuid4())
    sql(db,f"""INSERT INTO taskpulse_private.award_overrides(id,run_id,user_id,actor_id,reason) VALUES('{override}','{base}','{U(4)}','{MD}','Director picked the site lead');
      UPDATE taskpulse_private.award_slots SET override_id='{override}',effective_run='{base}',stale=false WHERE id='{s_override}';""")
    b_run=run(db,s_b,'completed_winner',B_DIR)
    end=value(db,f"'{today}'::date+1")
    start=win_day

    if db==DBS[1]:
        before=read_awards(db,start,end)
        assert all('lastDecided' not in d for d in before['days']),'61 has no lastDecided'
        state="md5(string_agg(to_jsonb(s)::text,',' ORDER BY id)) FROM taskpulse_private.award_slots s"
        slots_before=value(db,state)
        definition="md5(pg_get_functiondef('public.award_read_model(date,date,uuid)'::regprocedure))"
        def_before=value(db,definition)
        m62=next((ROOT/'supabase/migrations').glob(f'{TARGET}_*.sql')).read_text(encoding='utf-8')
        assert m62.count('\nCOMMIT;')==1
        broken=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],
            input=m62.replace('\nCOMMIT;','\nSELECT 1/0;\nCOMMIT;'),text=True,capture_output=True,encoding='utf-8')
        assert broken.returncode and 'division by zero' in broken.stderr,broken.stderr[-300:]
        assert value(db,definition)==def_before,'a failed 62 keeps the previous award_read_model'
        print('PASS',db,'a failed migration 62 rolls back and keeps the previous award_read_model')
        migrate(db,TARGET,start=PREV+1)
        assert value(db,definition)!=def_before and value(db,state)==slots_before,'62 changes no data'
        after=read_awards(db,start,end)
        strip=lambda m:[{k:v for k,v in d.items() if k!='lastDecided'} for d in m['days']]
        assert strip(after)==strip(before),'every existing key keeps its value'
        print('PASS',db,f'upgrade {PREV}->{TARGET} adds lastDecided only; slots and existing keys unchanged')
    else:
        print('PASS',db,f'fresh install 01-{TARGET}')

    fn="'public.award_read_model(date,date,uuid)'::regprocedure"
    assert value(db,f"pg_get_userbyid(proowner)||prosecdef FROM pg_proc WHERE oid={fn}")=='taskpulse_definertrue'
    assert value(db,"has_function_privilege('authenticated','public.award_read_model(date,date,uuid)','EXECUTE')")=='t'
    assert value(db,"has_function_privilege('anon','public.award_read_model(date,date,uuid)','EXECUTE')")=='f'
    assert value(db,'taskpulse_private.m15_secure()')=='0 tables and 0 functions moved to taskpulse_definer'
    print('PASS',db,'award_read_model stays definer-owned, SECURITY DEFINER, open to signed-in users only')

    # 1. Decided days carry their decision; a blocked latest run has none.
    days=by_date(read_awards(db,start,end))
    assert days[win_day]['lastDecided']=={'status':'completed_winner','winnerId':U(2),'runId':win_run,'override':False,
                                          'decidedAt':days[win_day]['lastDecided']['decidedAt']},days[win_day]
    assert days[win_day]['winnerId']==U(2) and days[win_day]['certified'] is True
    assert days[none_day]['lastDecided']['status']=='completed_none' and days[none_day]['lastDecided']['winnerId'] is None
    assert days[none_day]['lastDecided']['runId']==none_run
    assert days[blocked_day]['lastDecided'] is None and days[blocked_day]['status']=='blocked'
    assert days[override_day]['lastDecided']['winnerId']==U(4) and days[override_day]['lastDecided']['override'] is True
    assert days[override_day]['lastDecided']['runId']==base and days[override_day]['winnerId']==U(4)
    print('PASS',db,'lastDecided: certified winner, certified no-winner and override; null for a blocked latest run')

    # 2. An ordinary write marks every open day stale; the decision stays while the strict keys hide it.
    payload={'business_date':today,'author_id':U(5),'attendance_status':'Present','attendance_hours':'8','off_hours':'0'}
    actor(db,MD,"SELECT public.dated_record_command('attendance',NULL,'save',"+literal(json.dumps(payload))+"::jsonb,0,"+literal(uuid4())+")")
    stale=by_date(read_awards(db,start,end))
    assert all(stale[d]['status']=='stale' for d in (win_day,none_day,blocked_day,override_day)),{d:v['status'] for d,v in stale.items()}
    assert all(stale[d]['winnerId'] is None and stale[d]['certified'] is False for d in (win_day,none_day,override_day))
    assert stale[win_day]['lastDecided']['winnerId']==U(2) and stale[win_day]['lastDecided']['runId']==win_run
    assert stale[none_day]['lastDecided']['status']=='completed_none'
    assert stale[override_day]['lastDecided']['winnerId']==U(4) and stale[override_day]['override'] is True
    assert stale[blocked_day]['lastDecided'] is None
    print('PASS',db,'after a write every day is stale with winnerId null and certified false, and lastDecided keeps the decision')

    # 3. A later run that does not certify replaces it: nothing decided to show.
    run(db,s_win,'blocked',certified=False)
    assert by_date(read_awards(db,start,end))[win_day]['lastDecided'] is None
    print('PASS',db,'a later blocked run clears lastDecided')

    # 4. Each company reads only its own days.
    a_days=read_awards(db,start,end)['days']
    assert len(a_days)==4 and all(d['lastDecided'] is None or d['lastDecided']['runId']!=b_run for d in a_days)
    b_days=read_awards(db,start,end,uid='b1')['days']
    assert len(b_days)==1 and b_days[0]['lastDecided']['winnerId']==B_DIR,b_days
    print('PASS',db,'company separation: each director reads only their company days and decisions')

print('\nALL MIGRATION 62 CHECKS PASSED')
