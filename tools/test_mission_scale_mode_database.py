"""New mission scale mode, migration 61: create_task_with_scale (save_task_with_participants + the versioned
scale command in one transaction), organization_settings.default_scale_mode, company_settings() defaultScaleMode
and the company_settings_command 'mission_defaults' section. Fresh install 01-latest, upgrade from 01-60 (with a
failed apply rolled back), role gates, input validation, atomic failure, idempotent replay, an hours scale that
follows the first log, company separation. Disposable PostgreSQL; JWT shim only; no hosted connection."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_scale_mode_fresh_test','taskpulse_scale_mode_upgrade_test')
U=lambda n:'00000000-0000-0000-0000-'+str(n).zfill(12)
MD,PE,DM,M4,M5,INACTIVE=U(1),U(2),U(3),U(4),U(5),U(7)
B_DIR='00000000-0000-0000-0000-0000000000b1'
MIGRATIONS=sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0]))
M61=next(p for p in MIGRATIONS if p.name.startswith('61_')).read_text(encoding='utf-8')
LATEST=int(MIGRATIONS[-1].name.split('_')[0])
SIG='public.create_task_with_scale(jsonb,uuid[],uuid[],integer[],boolean,jsonb,uuid)'

def migrate(db,numbers):
    for m in MIGRATIONS:
        if int(m.name.split('_')[0]) in numbers:sql(db,m.read_text(encoding='utf-8'))
def run(db,uid,statement):
    role='anon' if uid is None else 'authenticated'
    return subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],
        input=f"BEGIN; SET LOCAL ROLE {role}; SELECT set_config('request.jwt.claim.sub','{uid or ''}',true);\n{statement.rstrip(';')};\nCOMMIT;",
        text=True,capture_output=True,encoding='utf-8')
def ok(db,uid,statement):
    r=run(db,uid,statement)
    assert r.returncode==0,(statement[:300],r.stderr[:800])
    return [x for x in r.stdout.splitlines() if x and x not in ('BEGIN','COMMIT','SET')][-1]
def expect_code(db,uid,statement,code,text=None):
    r=run(db,uid,statement)
    assert r.returncode and code in r.stderr and (text is None or text in r.stderr),(statement[:300],r.stderr[:800])
def j(value_):return literal(json.dumps(value_))+'::jsonb'
def ids(values):return 'ARRAY['+','.join(f"'{v}'" for v in values)+']::uuid[]' if values else 'ARRAY[]::uuid[]'
def create_sql(fields,scale,op,assignees=(M4,),reviewers=()):
    return f"SELECT public.create_task_with_scale({j(fields)},{ids(assignees)},{ids(reviewers)},NULL,false,{j(scale)},'{op}')"
def fields(title,**extra):return {'title':title,'category':'T','priority':'Medium','due_date':None,'initialize_details':False,**extra}
def task(db,tid):return json.loads(value(db,f"to_jsonb(t) FROM public.tasks t WHERE id='{tid}'"))
def settings(db,uid):return json.loads(ok(db,uid,'SELECT public.company_settings()'))
def settings_sql(payload,version,op=None,section='mission_defaults'):
    return f"SELECT public.company_settings_command('{section}',{j(payload)},{version},'{op or uuid4()}')"
def counts(db):
    return {t:value(db,f"count(*) FROM {t}") for t in ('public.tasks','public.task_assignees','taskpulse_private.scale_versions',
        'taskpulse_private.command_receipts','taskpulse_private.audit_events','taskpulse_private.organization_settings')}
def broken_apply(db):
    r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],
        input=M61.replace('\nCOMMIT;','\nSELECT 1/0;\nCOMMIT;',1),text=True,capture_output=True,encoding='utf-8')
    assert r.returncode and 'division by zero' in r.stderr,r.stderr[-300:]

assert LATEST>=61
for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    every=[int(m.name.split('_')[0]) for m in MIGRATIONS]
    if db==DBS[1]:
        migrate(db,[n for n in every if n<61]); sql(db,seed)
        manual=ok(db,PE,f"SELECT public.save_task_with_participants(NULL,{j(fields('Before 61',task_scale=8))},{ids([M4])},{ids([])},NULL,NULL,false,'{uuid4()}')")
        before=counts(db)
        broken_apply(db)
        assert value(db,"count(*) FROM pg_proc WHERE proname='create_task_with_scale'")=='0'
        assert value(db,"count(*) FROM pg_attribute WHERE attrelid='taskpulse_private.organization_settings'::regclass AND attname='default_scale_mode'")=='0'
        assert counts(db)==before
        print('PASS',db,'a failed migration 61 rolls back completely (no column, no function, rows unchanged)')
        sql(db,M61)
        for n in [n for n in every if n>61]:migrate(db,[n])
        assert counts(db)==before,'61 changes no existing rows'
        t=task(db,manual)
        assert (t['scale_mode'],float(t['task_scale']),t['scale_inputs'])==('manual',8.0,{'value':8})
        print('PASS',db,'upgrade 01-60 -> 61 keeps every row; an existing manual mission is untouched')
    else:
        migrate(db,every); sql(db,seed)
        print('PASS',db,f'fresh install 01-{LATEST} including 61')

    # ---- ownership and grants -------------------------------------------------------------------------------
    assert value(db,"taskpulse_private.m15_secure()")=='0 tables and 0 functions moved to taskpulse_definer'
    assert value(db,f"pg_get_userbyid(proowner)||prosecdef FROM pg_proc WHERE oid='{SIG}'::regprocedure")=='taskpulse_definertrue'
    assert value(db,f"has_function_privilege('authenticated','{SIG}','EXECUTE') AND NOT has_function_privilege('anon','{SIG}','EXECUTE') AND NOT has_function_privilege('service_role','{SIG}','EXECUTE')")=='t'
    assert value(db,"count(*) FROM pg_proc WHERE proname='create_task_with_scale' AND prosrc LIKE '%40001%'")=='0'
    print('PASS',db,'create_task_with_scale is definer-owned SECURITY DEFINER, callable by signed-in users only; no 40001')

    # ---- company default -------------------------------------------------------------------------------------
    for uid in (MD,PE,M4):assert settings(db,uid)['defaultScaleMode']=='manual'
    v=settings(db,MD)['version']
    for uid in (PE,DM,M4,INACTIVE):expect_code(db,uid,settings_sql({'scaleMode':'hours'},v),'42501')
    expect_code(db,None,settings_sql({'scaleMode':'hours'},v),'42501')
    for bad in ({'scaleMode':'linked'},{'scaleMode':'Hours'},{'scaleMode':1},{},{'scaleMode':'hours','x':1}):
        expect_code(db,MD,settings_sql(bad,v),'23514')
    expect_code(db,MD,settings_sql({'scaleMode':'hours'},v+5),'PT409')
    op=uuid4()
    saved=json.loads(ok(db,MD,settings_sql({'scaleMode':'hours'},v,op)))
    assert saved=={'section':'mission_defaults','version':v+1}
    assert json.loads(ok(db,MD,settings_sql({'scaleMode':'hours'},v,op)))==saved,'replay returns the receipt'
    expect_code(db,MD,settings_sql({'scaleMode':'manual'},v,op),'PT409')
    for uid in (MD,PE,M4):assert settings(db,uid)['defaultScaleMode']=='hours'
    assert value(db,"count(*) FROM taskpulse_private.audit_events WHERE command='company_settings_mission_defaults' AND changed_fields=ARRAY['mission_defaults']")=='1'
    # The other sections still save and keep the default.
    ok(db,MD,settings_sql({'agenda':'1. Review'},v+1,section='agenda'))
    assert settings(db,M4)['defaultScaleMode']=='hours' and settings(db,M4)['meetingAgenda']=='1. Review'
    print('PASS',db,'mission_defaults: director only, three modes, versioned, idempotent, audited; everyone reads defaultScaleMode')

    # ---- role gates on create -------------------------------------------------------------------------------
    hours={'mode':'hours','inputs':{'multiplier':1}}
    before=counts(db)
    for uid in (DM,M4,INACTIVE):expect_code(db,uid,create_sql(fields('Refused'),hours,uuid4()),'42501')
    expect_code(db,None,create_sql(fields('Refused'),hours,uuid4()),'42501')
    assert counts(db)==before
    print('PASS',db,'data manager, member, inactive account and anonymous callers are refused (42501); nothing written')

    # ---- validation and atomic failure ----------------------------------------------------------------------
    for bad_scale in ({'mode':'manual','inputs':{'value':5}},{'mode':'linked','inputs':{'source_task_id':str(uuid4()),'percentage':50}},
                      {'mode':'hours'} | {'inputs':{'multiplier':1},'override':3},{'inputs':{'multiplier':1}}):
        expect_code(db,PE,create_sql(fields('Bad'),bad_scale,uuid4()),'23514')
    expect_code(db,PE,create_sql(fields('Fixed weight too',task_scale=4),hours,uuid4()),'23514')
    # These reach the scale command after the save; the whole call rolls back.
    for bad_scale in ({'mode':'hours','inputs':{'multiplier':-1}},{'mode':'hours','inputs':{}},
                      {'mode':'activity_count','inputs':{'activity_count':2.5,'unit_scale':1}},
                      {'mode':'activity_count','inputs':{'activity_count':'3','unit_scale':1}}):
        expect_code(db,PE,create_sql(fields('Rolled back'),bad_scale,uuid4()),'23514')
    expect_code(db,PE,create_sql(fields(''),hours,uuid4()),'23514')
    assert counts(db)==before,'no mission, scale version, receipt or audit row survives a refused create'
    print('PASS',db,'manual/linked modes, an override, a fixed weight, bad inputs and a blank title are refused (23514) atomically')

    # ---- hours mission: scale follows the first log ---------------------------------------------------------
    op=uuid4()
    tid=ok(db,PE,create_sql(fields('Survey drawings'),hours,op,reviewers=(MD,)))
    t=task(db,tid)
    assert (t['scale_mode'],t['scale_inputs'],float(t['task_scale']),t['scale_override'])==('hours',{'multiplier':1},0.0,None)
    assert t['scale_version']==1 and t['scale_provenance']=='New mission (hours logged)' and t['status']=='Not Started'
    assert re.match(r'^[A-Z][a-z]{2}\d{2}_T\d+$',t['task_tag']),t['task_tag']
    assert value(db,f"count(*) FROM public.task_reviewers WHERE task_id='{tid}' AND user_id='{MD}'")=='1'
    # Version 0 is the save's zero manual row (as month setup leaves it); version 1 is the chosen formula.
    assert value(db,f"string_agg(version||':'||mode||':'||(value=0),',' ORDER BY version) FROM taskpulse_private.scale_versions WHERE task_id='{tid}'")=='0:manual:true,1:hours:true'
    assert value(db,f"protected_changes->>'reason' FROM taskpulse_private.audit_events WHERE row_id='{tid}' AND command='scale'")=='Chosen when the mission was created'
    assert value(db,f"count(*) FROM taskpulse_private.audit_events WHERE row_id='{tid}' AND command IN ('save_task_with_participants','scale')")=='2'
    # Replay returns the same mission; the same key with other input is refused.
    after=counts(db)
    assert ok(db,PE,create_sql(fields('Survey drawings'),hours,op,reviewers=(MD,)))==tid
    expect_code(db,PE,create_sql(fields('Survey drawings v2'),hours,op,reviewers=(MD,)),'23514','reused')
    assert counts(db)==after
    print('PASS',db,'hours mission: one call saves the mission, reviewer and scale version 1 at 0; replay returns it; reuse refused')
    today=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    ok(db,M4,f"SELECT public.create_task_log('{tid}',{j({'log_date':today,'hours_worked':2,'requested_delta':20})},'{uuid4()}')")
    t=task(db,tid)
    assert float(t['task_scale'])==25.0 and t['scale_version']==2 and float(t['progress_percentage'])==20.0,t
    assert 'scale_nonpositive' not in t['eligibility_reasons'] and 'scale_missing' not in t['eligibility_reasons'],t['eligibility_reasons']
    print('PASS',db,'2 hours logged at multiplier 1 make the scale 25 (version 2) and lift the scale from the eligibility reasons')

    # ---- activity-count mission ------------------------------------------------------------------------------
    tid2=ok(db,MD,create_sql(fields('Plan approvals',priority='High'),{'mode':'activity_count','inputs':{'activity_count':4,'unit_scale':2.5}},uuid4(),assignees=(M4,M5)))
    t=task(db,tid2)
    assert (t['scale_mode'],t['scale_inputs'],float(t['task_scale']))==('activity_count',{'activity_count':4,'unit_scale':2.5},10.0)
    assert t['scale_provenance']=='New mission (activity count)' and t['priority']=='High'
    assert value(db,f"count(*) FROM public.task_assignees WHERE task_id='{tid2}'")=='2'
    print('PASS',db,'activity-count mission: 4 x 2.5 = 10 from the start, two assignees with equal shares')

    # ---- company separation ---------------------------------------------------------------------------------
    sql(db,"INSERT INTO public.organizations(name,slug) VALUES('Beta Builders','beta')")
    B=value(db,"id FROM public.organizations WHERE slug='beta'")
    sql(db,f"""INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
      ('{B_DIR}','bdir@beta.test','{{"employee_id":"BETA-1"}}','{{"organization_id":"{B}"}}')""")
    sql(db,f"UPDATE public.users SET role='managing_director' WHERE id='{B_DIR}'")
    assert settings(db,B_DIR)['defaultScaleMode']=='manual','company B keeps its own default'
    before=counts(db)
    r=run(db,B_DIR,create_sql(fields('Cross company'),hours,uuid4(),assignees=(M4,)))
    assert r.returncode and any(c in r.stderr for c in ('42501','23503','23514')),r.stderr[:600]
    assert counts(db)==before
    tid3=ok(db,B_DIR,create_sql(fields('Beta survey'),hours,uuid4(),assignees=(B_DIR,)))
    assert value(db,f"organization_id FROM public.tasks WHERE id='{tid3}'")==B
    assert value(db,f"count(*) FROM taskpulse_private.command_receipts WHERE command='create_task_with_scale' AND result='{tid3}' AND organization_id='{B}'")=='1'
    print('PASS',db,"company B reads its own default, cannot assign company A's member, and its mission and receipt are B's")
