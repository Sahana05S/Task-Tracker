"""Company branding, migration 64: organization_settings logo/mark addresses (light and dark), the
taskpulse_private.is_brand_url check, company_settings() branding and the company_settings_command 'branding'
section, and company #1 renamed to Arkensys Realtors with its logo files. Fresh install 01-latest, upgrade from
01-63 (with a failed apply rolled back), role gates, address validation, versioned idempotent saves, company
separation. Disposable PostgreSQL; JWT shim only; no hosted connection."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_branding_fresh_test','taskpulse_branding_upgrade_test')
U=lambda n:'00000000-0000-0000-0000-'+str(n).zfill(12)
MD,PE,DM,M4,INACTIVE=U(1),U(2),U(3),U(4),U(7)
B_DIR='00000000-0000-0000-0000-0000000000b1'
MIGRATIONS=sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0]))
M64=next(p for p in MIGRATIONS if p.name.startswith('64_')).read_text(encoding='utf-8')
LATEST=int(MIGRATIONS[-1].name.split('_')[0])
ARKENSYS={'companyName':'Arkensys Realtors','logoUrl':'/brands/arkensys/logo.svg','logoDarkUrl':'/brands/arkensys/logo-dark.svg',
          'markUrl':'/brands/arkensys/mark.svg','markDarkUrl':'/brands/arkensys/mark-dark.svg'}

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
def settings(db,uid):return json.loads(ok(db,uid,'SELECT public.company_settings()'))
def branding_sql(payload,version,op=None):
    return f"SELECT public.company_settings_command('branding',{j(payload)},{version},'{op or uuid4()}')"
def counts(db):
    return {t:value(db,f"count(*) FROM {t}") for t in ('public.organizations','taskpulse_private.command_receipts',
        'taskpulse_private.audit_events','taskpulse_private.organization_settings')}
def broken_apply(db):
    r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],
        input=M64.replace('\nCOMMIT;','\nSELECT 1/0;\nCOMMIT;',1),text=True,capture_output=True,encoding='utf-8')
    assert r.returncode and 'division by zero' in r.stderr,r.stderr[-300:]
def payload(**over):
    return {'logoUrl':None,'logoDarkUrl':None,'markUrl':None,'markDarkUrl':None,**over}

assert LATEST>=64
for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    every=[int(m.name.split('_')[0]) for m in MIGRATIONS]
    if db==DBS[1]:
        migrate(db,[n for n in every if n<64]); sql(db,seed)
        ok(db,MD,"SELECT public.company_settings_command('agenda','{\"agenda\":\"1. Review\"}'::jsonb,0,'"+str(uuid4())+"')")
        before=counts(db)
        broken_apply(db)
        assert value(db,"count(*) FROM pg_proc WHERE proname='is_brand_url'")=='0'
        assert value(db,"count(*) FROM pg_attribute WHERE attrelid='taskpulse_private.organization_settings'::regclass AND attname LIKE '%\\_url'")=='0'
        assert value(db,"name FROM public.organizations WHERE is_default")=='Saahithyaa Realtors and Builders'
        assert counts(db)==before
        print('PASS',db,'a failed migration 64 rolls back completely (no function, no columns, name unchanged)')
        sql(db,M64)
        assert counts(db)==before,'64 adds no rows when company #1 already has a settings row'
        # Later migrations may audit their own backfills (65 records each default manager).
        for n in [n for n in every if n>64]:migrate(db,[n])
        s=settings(db,M4)
        assert s['meetingAgenda']=='1. Review' and s['version']==1,'existing settings are kept'
        print('PASS',db,'upgrade 01-63 -> 64 keeps the saved agenda and version; company #1 gets its branding in place')
    else:
        migrate(db,every); sql(db,seed)
        print('PASS',db,f'fresh install 01-{LATEST} including 64')

    # ---- company #1 renamed, branding readable by everyone ----------------------------------------------------
    assert value(db,"name||'|'||slug FROM public.organizations WHERE is_default")=='Arkensys Realtors|saahithyaa'
    for uid in (MD,PE,DM,M4):assert settings(db,uid)['branding']==ARKENSYS,settings(db,uid)['branding']
    expect_code(db,None,'SELECT public.company_settings()','42501')
    assert value(db,"taskpulse_private.m15_secure()")=='0 tables and 0 functions moved to taskpulse_definer'
    print('PASS',db,'company #1 is Arkensys Realtors (slug kept) and every member reads its four logo addresses')

    # ---- the address check ----------------------------------------------------------------------------------
    good=('/brands/x/logo.svg','https://cdn.example.com/a/logo-1.png?v=2',None)
    bad=('javascript:alert(1)','data:image/svg+xml,<svg>','//evil.example/logo.svg','http://example.com/logo.png',
         '/brands/a b.svg','https://x.example/"onload','/'+'a'*500,'brands/logo.svg')
    for url in good:assert value(db,f"taskpulse_private.is_brand_url({literal(url) if url else 'NULL'})")=='t',url
    for url in bad:assert value(db,f"taskpulse_private.is_brand_url({literal(url)})")=='f',url
    r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],
        input="UPDATE taskpulse_private.organization_settings SET mark_url='javascript:alert(1)'",text=True,capture_output=True,encoding='utf-8')
    assert r.returncode and 'check constraint' in r.stderr,r.stderr[-300:]
    print('PASS',db,'only app-relative or https addresses pass; javascript:, data:, //, http: and spaces are refused, also by the column check')

    # ---- the branding command -------------------------------------------------------------------------------
    v=settings(db,MD)['version']
    before=counts(db)
    for uid in (PE,DM,M4,INACTIVE):expect_code(db,uid,branding_sql(payload(),v),'42501')
    expect_code(db,None,branding_sql(payload(),v),'42501')
    for bad_payload in (payload(markUrl='javascript:alert(1)'),payload(logoUrl=5),payload(logoUrl={'u':1}),
                        payload(extra='/x.svg'),payload(logoDarkUrl='//evil.example/x.svg')):
        expect_code(db,MD,branding_sql(bad_payload,v),'23514')
    expect_code(db,MD,branding_sql(payload(),v+3),'PT409')
    assert counts(db)==before,'refused saves write nothing'
    op=uuid4()
    new=payload(logoUrl=' https://cdn.example.com/arkensys/logo.svg ',markUrl='/brands/arkensys/mark.svg',markDarkUrl='')
    saved=json.loads(ok(db,MD,branding_sql(new,v,op)))
    assert saved=={'section':'branding','version':v+1},saved
    assert json.loads(ok(db,MD,branding_sql(new,v,op)))==saved,'replay returns the receipt'
    expect_code(db,MD,branding_sql(payload(),v,op),'PT409')
    want={'companyName':'Arkensys Realtors','logoUrl':'https://cdn.example.com/arkensys/logo.svg','logoDarkUrl':None,
          'markUrl':'/brands/arkensys/mark.svg','markDarkUrl':None}
    for uid in (MD,M4):assert settings(db,uid)['branding']==want,settings(db,uid)['branding']
    assert value(db,"count(*) FROM taskpulse_private.audit_events WHERE command='company_settings_branding'")=='1'
    ok(db,MD,"SELECT public.company_settings_command('agenda','{\"agenda\":\"2. Plan\"}'::jsonb,"+str(v+1)+",'"+str(uuid4())+"')")
    assert settings(db,M4)['branding']==want,'other sections keep the branding'
    print('PASS',db,'branding: director only, addresses trimmed (blank = none), versioned, idempotent, audited')

    # ---- company separation ---------------------------------------------------------------------------------
    sql(db,"INSERT INTO public.organizations(name,slug) VALUES('Beta Builders','beta')")
    B=value(db,"id FROM public.organizations WHERE slug='beta'")
    sql(db,f"""INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
      ('{B_DIR}','bdir@beta.test','{{"employee_id":"BETA-1"}}','{{"organization_id":"{B}"}}')""")
    sql(db,f"UPDATE public.users SET role='managing_director' WHERE id='{B_DIR}'")
    assert settings(db,B_DIR)['branding']=={'companyName':'Beta Builders','logoUrl':None,'logoDarkUrl':None,'markUrl':None,'markDarkUrl':None}
    ok(db,B_DIR,branding_sql(payload(markUrl='/brands/beta/mark.svg'),settings(db,B_DIR)['version']))
    assert settings(db,B_DIR)['branding']['markUrl']=='/brands/beta/mark.svg'
    assert settings(db,M4)['branding']==want,"company B's save leaves company A untouched"
    print('PASS',db,"company B reads its own name and empty branding, and its save changes only company B")

print('ALL PASS')
