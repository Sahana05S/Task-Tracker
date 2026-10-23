"""Migration 52: conflict errors move from SQLSTATE 40001 (retried without limit by PostgREST 14) to PT409.
Disposable PostgreSQL only; no hosted connection. Checks fresh install, upgrade from 51 with data,
a real stale-version conflict returning PT409, unchanged function attributes, and a full rollback
when the migration fails."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_conflict_fresh_test','taskpulse_conflict_upgrade_test')
MIGRATIONS=sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0]))
M52=next(p for p in MIGRATIONS if p.name.startswith('52_')).read_text(encoding='utf-8')
LATEST=int(MIGRATIONS[-1].name.split('_')[0])
SCOPE="n.nspname IN ('public','taskpulse_private')"
FUNCS=f"pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE {SCOPE}"
ATTRS=("(SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(p.prosecdef,p.proconfig,"
       "p.proowner::regrole::text,p.proacl::text,p.provolatile,p.prorettype::regtype::text)) FROM "+FUNCS+" AND p.prosrc LIKE '%{code}%')")

def migrate(db,upto,after=0):
    for m in MIGRATIONS:
        n=int(m.name.split('_')[0])
        if n>upto:break
        if n>after:sql(db,m.read_text(encoding='utf-8'))
def count(db,code):return int(value(db,f"count(*) FROM {FUNCS} AND p.prosrc LIKE '%ERRCODE=''{code}''%'"))
def stale_checklist_conflict(db):
    tid=new_task(db,'CONFLICT-'+uuid4().hex[:6])
    v=int(value(db,'lifecycle_version FROM public.tasks WHERE id='+literal(tid)))
    q=('SELECT public.checklist_command('+literal(tid)+",'add',"+literal(json.dumps(
        {'title':'Stale version on purpose','section':'setup'}))+'::jsonb,'+str(v+5)+','+literal(uuid4())+');')
    r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],
        input="BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);\n"+q+"\nCOMMIT;",
        text=True,capture_output=True,encoding='utf-8')
    assert r.returncode,'stale version was accepted'
    return r.stderr

assert LATEST>=52
for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    if db==DBS[0]:
        migrate(db,LATEST); sql(db,seed)
        assert count(db,'40001')==0 and count(db,'PT409')>=10,(count(db,'40001'),count(db,'PT409'))
        assert value(db,f"count(*) FROM {FUNCS} AND (p.prosrc LIKE '%40001%' OR p.prosrc ILIKE '%serialization_failure%')")=='0'
        err=stale_checklist_conflict(db)
        assert 'PT409' in err and '40001' not in err and 'reload checklist' in err,err[-300:]
        print('PASS',db,f'fresh install 01-{LATEST}: no function raises 40001; a stale checklist save fails with PT409')
    else:
        migrate(db,51 if LATEST>=51 else 50); sql(db,seed)
        before_40001=count(db,'40001'); assert before_40001>=10,before_40001
        err=stale_checklist_conflict(db); assert '40001' in err,err[-300:]
        attrs_before=json.loads(value(db,ATTRS.format(code="ERRCODE=''40001''")))
        rows_before={t:value(db,f"count(*) FROM {t}") for t in ('public.users','public.tasks','public.checklist_nodes','taskpulse_private.command_receipts')}
        # A failure inside 52 leaves every function as it was (one transaction).
        r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],
            input=M52.replace('COMMIT;','SELECT 1/0;\nCOMMIT;',1),text=True,capture_output=True,encoding='utf-8')
        assert r.returncode and 'division by zero' in r.stderr,r.stderr[-300:]
        assert count(db,'40001')==before_40001 and count(db,'PT409')==0
        print('PASS',db,f'a failed migration 52 rolls back: {before_40001} functions still raise 40001, none changed')
        migrate(db,52,after=51 if LATEST>=51 else 50)
        assert count(db,'40001')==0 and count(db,'PT409')==before_40001,(count(db,'40001'),count(db,'PT409'))
        attrs_after=json.loads(value(db,ATTRS.format(code="ERRCODE=''PT409''")))
        assert attrs_after==attrs_before,{k:(attrs_before.get(k),attrs_after.get(k)) for k in set(attrs_before)|set(attrs_after) if attrs_before.get(k)!=attrs_after.get(k)}
        for t,n in rows_before.items():assert value(db,f"count(*) FROM {t}")==n,t
        err=stale_checklist_conflict(db); assert 'PT409' in err and 'reload checklist' in err,err[-300:]
        print('PASS',db,f'upgrade to 52 converts all {before_40001} functions to PT409; security, settings, owner, grants and rows unchanged')
        sql(db,M52)
        assert count(db,'40001')==0 and count(db,'PT409')==before_40001
        print('PASS',db,'running 52 a second time is a no-op')
print('ALL PASS')
