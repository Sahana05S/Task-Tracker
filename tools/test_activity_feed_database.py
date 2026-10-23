"""Activity log, migrations 54, 57 and 59: public.activity_feed visibility, command de-duplication, filters, bounds and paging. Two-company disposable PostgreSQL checks. JWT shim only; no hosted connection."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))

DBS=('taskpulse_activity_fresh_test','taskpulse_activity_upgrade_test')
U=lambda n:'00000000-0000-0000-0000-'+str(n).zfill(12)
MD,PE,M4,M5,INACTIVE=U(1),U(2),U(4),U(5),U(7)
T2='10000000-0000-0000-0000-000000000002'
B_DIR,B4='00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4'
SOURCES=('taskpulse_private.audit_events','taskpulse_private.input_history','taskpulse_private.log_revisions','taskpulse_private.month_receipts')
MIGRATION=(ROOT/'supabase/migrations/54_activity_feed.sql').read_text(encoding='utf-8')
MIGRATION57=(ROOT/'supabase/migrations/57_activity_feed_command_dedupe.sql').read_text(encoding='utf-8')
MIGRATION59=(ROOT/'supabase/migrations/59_activity_feed_company_settings.sql').read_text(encoding='utf-8')

def broken_apply(db,text):
    r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],
        input=text.replace('\nCOMMIT;','\nSELECT 1/0;\nCOMMIT;',1),text=True,capture_output=True,encoding='utf-8')
    assert r.returncode and 'division by zero' in r.stderr,r.stderr[:300]
def definition(db):
    return value(db,"md5(pg_get_functiondef('public.activity_feed(date,date,text,uuid,jsonb,integer)'::regprocedure))")

def run(db,uid,statement):
    return subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],
        input=f"BEGIN; SET LOCAL ROLE {'anon' if uid is None else 'authenticated'}; SELECT set_config('request.jwt.claim.sub','{uid or ''}',true);\n{statement.rstrip(';')};\nCOMMIT;",
        text=True,capture_output=True,encoding='utf-8')
def expect_code(db,uid,statement,code):
    r=run(db,uid,statement)
    assert r.returncode and code in r.stderr,(statement[:160],r.stderr[:300])
def feed(db,uid,frm,to,kind=None,member=None,before=None,limit=None):
    arg=lambda v:'NULL' if v is None else literal(v)
    q=(f"SELECT coalesce(jsonb_agg(f),'[]') FROM public.activity_feed('{frm}','{to}',{arg(kind)},{arg(member)}::uuid,"
       f"{'NULL' if before is None else literal(json.dumps(before))+'::jsonb'},{'NULL' if limit is None else limit}) f")
    r=run(db,uid,q)
    assert r.returncode==0,r.stderr[:400]
    return json.loads(next(x for x in r.stdout.splitlines() if x.startswith('[')))
def migrate(db,upto,after=0):
    for m in sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0])):
        n=int(m.name.split('_')[0])
        if n>upto:break
        if n>after:sql(db,m.read_text(encoding='utf-8'))
def counts(db):return {t:value(db,f'count(*) FROM {t}') for t in SOURCES}

LATEST=max(int(p.name.split('_')[0]) for p in (ROOT/'supabase/migrations').glob('*.sql'))
assert LATEST>=59

for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    if db==DBS[1]:
        migrate(db,49); sql(db,seed)
        # A failing 54 leaves nothing behind.
        broken_apply(db,MIGRATION)
        assert value(db,"count(*) FROM pg_proc WHERE proname='activity_feed'")=='0'
        assert value(db,"count(*) FROM pg_class WHERE relname LIKE '%\\_feed\\_idx'")=='0'
        print('PASS',db,'a failing 54 rolls back: no function, no index')
        call(db,'create_task_log',task,{'log_date':value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date"),'hours_worked':1.5,'requested_delta':0},uid='4')  # before 54
        before=counts(db)
        migrate(db,54,after=49)
        assert counts(db)==before,'54 writes no rows'
        print('PASS',db,'upgrade 49->54 adds the read and indexes without touching retained rows')
        read54=definition(db)
        broken_apply(db,MIGRATION57)
        assert definition(db)==read54
        print('PASS',db,'a failing 57 rolls back to the 54 read')
        migrate(db,58,after=54)
        read58=definition(db)
        assert counts(db)==before and read58!=read54,'57 replaces the read and writes no rows'
        print('PASS',db,'upgrade 54->58 replaces the read without touching retained rows')
        broken_apply(db,MIGRATION59)
        assert definition(db)==read58
        print('PASS',db,'a failing 59 rolls back to the 57 read')
        migrate(db,59,after=58)
        assert counts(db)==before and definition(db)!=read58,'59 replaces the read and writes no rows'
        print('PASS',db,'upgrade 58->59 replaces the read without touching retained rows')
        # Later migrations may audit their own backfills (65 records each default manager).
        migrate(db,LATEST,after=59)
    else:
        migrate(db,LATEST); sql(db,seed)
        print('PASS',db,f'fresh install 01-{LATEST}')
    assert value(db,"taskpulse_private.m15_secure()")=='0 tables and 0 functions moved to taskpulse_definer'
    assert value(db,"pg_get_userbyid(proowner)||'/'||prosecdef||'/'||provolatile::text FROM pg_proc WHERE proname='activity_feed'")=='taskpulse_definer/true/s'
    assert value(db,"has_function_privilege('anon','public.activity_feed(date,date,text,uuid,jsonb,integer)','EXECUTE')")=='f'
    assert value(db,"has_function_privilege('authenticated','public.activity_feed(date,date,text,uuid,jsonb,integer)','EXECUTE')")=='t'
    print('PASS',db,'owned by taskpulse_definer, SECURITY DEFINER and STABLE, authenticated only')

    # Company B with its own director and member.
    sql(db,"INSERT INTO public.organizations(name,slug) VALUES('Beta Builders','beta')")
    B=value(db,"id FROM public.organizations WHERE slug='beta'")
    sql(db,f"""INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
      ('{B_DIR}','bdir@beta.test','{{"employee_id":"TEST-1"}}','{{"organization_id":"{B}"}}'),
      ('{B4}','b4@beta.test','{{"employee_id":"TEST-4"}}','{{"organization_id":"{B}"}}')""")
    sql(db,f"UPDATE public.users SET role='managing_director' WHERE id='{B_DIR}'")

    # Activity, then moved to 20 October 2026 10:00 UTC (15:30 in Kolkata).
    today=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    if db==DBS[0]:call(db,'create_task_log',task,{'log_date':today,'hours_worked':1.5,'requested_delta':0},uid='4')
    call(db,'create_task_log',T2,{'log_date':today,'hours_worked':2,'requested_delta':0},uid='5')
    fact=record(db,'fact',{'business_date':today,'content':'Site visit notes'},uid='4')['id']
    record(db,'fact',{'state':'validated','reason':'Checked against the site log'},cmd='validate',id=fact,uid='1')
    record(db,'fact',{'business_date':today,'content':'Member five fact'},uid='5')
    # A meeting point the director wrote and Asha owns.
    record(db,'meeting',{'business_date':today,'content':'Site safety review','meeting_type':'Project meeting','owner_id':M4,'point_type':'Blocking Issue','resolution_status':'In Progress'},uid='1')
    # A manager's mission edits (row-level audit with the manager as actor); signed-in roles cannot UPDATE tasks directly.
    sql(db,f"""BEGIN; SELECT set_config('request.jwt.claim.sub','{MD}',true);
      UPDATE public.tasks SET priority='High' WHERE id='{T2}'; UPDATE public.tasks SET due_date='2026-11-30' WHERE id='{task}'; COMMIT;""")
    # A command and its own row change in one transaction (migration 57): only the command is listed.
    sql(db,f"""BEGIN; SELECT set_config('request.jwt.claim.sub','{MD}',true);
      INSERT INTO taskpulse_private.audit_events(actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes)
        VALUES('{MD}','managing_director','transition','tasks','{T2}',ARRAY['transition'],'{{"reason":"Renamed in a command"}}');
      UPDATE public.tasks SET title='B renamed' WHERE id='{T2}'; COMMIT;""")
    sql(db,f"""INSERT INTO taskpulse_private.month_receipts(actor_id,operation,request,response,recorded_at) VALUES
      ('{MD}',gen_random_uuid(),'{{"command":"draft","period":"2026-09-01","payload":{{"reason":"September draft"}}}}','{{}}','2026-10-20T19:00:00Z')""")
    actor(db,B4,"SELECT public.dated_record_command('fact',NULL,'save',"+literal(json.dumps({'business_date':today,'content':'Beta fact'}))+"::jsonb,0,gen_random_uuid())")
    # A Settings > Company save by the director (migration 53's command, listed from 59).
    sql(db,"INSERT INTO taskpulse_private.organization_settings(organization_id) SELECT id FROM public.organizations WHERE is_default ON CONFLICT DO NOTHING")
    version=value(db,"version FROM taskpulse_private.organization_settings WHERE organization_id=(SELECT id FROM public.organizations WHERE is_default)")
    actor(db,MD,"SELECT public.company_settings_command('agenda','{\"agenda\":\"Safety first, then progress\"}'::jsonb,"+version+",gen_random_uuid())")
    # One shift for everything recent, so rows of one transaction keep one time and separate transactions stay apart.
    sql(db,"BEGIN; CREATE TEMP TABLE shift ON COMMIT DROP AS SELECT now()-timestamptz '2026-10-20T10:00:00Z' AS d;"
           "UPDATE taskpulse_private.audit_events SET occurred_at=occurred_at-(SELECT d FROM shift) WHERE occurred_at>now()-interval '1 hour';"
           "UPDATE taskpulse_private.log_revisions SET occurred_at=occurred_at-(SELECT d FROM shift) WHERE occurred_at>now()-interval '1 hour';"
           "ALTER TABLE taskpulse_private.input_history DISABLE TRIGGER USER;"
           "UPDATE taskpulse_private.input_history SET recorded_at=recorded_at-(SELECT d FROM shift) WHERE recorded_at>now()-interval '1 hour';"
           "ALTER TABLE taskpulse_private.input_history ENABLE TRIGGER USER; COMMIT;")

    # An audit row with a malformed task id.
    sql(db,f"""
      INSERT INTO taskpulse_private.audit_events(organization_id,actor_id,actor_role,command,table_name,row_id,changed_fields,protected_changes,occurred_at) VALUES
      ((SELECT id FROM public.organizations WHERE is_default),'{MD}','managing_director','INSERT','task_links',gen_random_uuid(),ARRAY['url'],'{{"task_id":{{"after":"not-a-uuid"}}}}','2026-10-20T08:00:00Z')""")
    before=counts(db)
    rows=feed(db,MD,'2026-10-20','2026-10-21')
    odd=[r for r in rows if r['record_kind']=='task_links']
    assert len(odd)==1 and odd[0]['task_id'] is None,odd
    print('PASS',db,'a malformed id inside retained audit data reads as no mission instead of failing the read')
    kinds={r['kind'] for r in rows}
    assert kinds=={'missions','records','time','month','company'},kinds
    company=[r for r in rows if r['kind']=='company']
    assert [(r['action'],r['record_kind'],r['actor_id'],r['subject_user_id'],r['task_id']) for r in company]==[('company_settings_agenda','organization_settings',MD,None,None)],company
    assert value(db,"count(*) FROM taskpulse_private.audit_events WHERE table_name='organization_settings' AND command='company_settings_agenda'")=='1'
    assert [r['action'] for r in feed(db,MD,'2026-10-20','2026-10-21',kind='company')]==['company_settings_agenda']
    print('PASS',db,'a Settings > Company save reads as one company line by the director (migration 59), also under the company filter')
    logs=[r for r in rows if r['kind']=='time']
    assert {r['subject_user_id'] for r in logs}=={M4,M5} and all(r['task_tag'] for r in logs),logs
    recs=[r for r in rows if r['kind']=='records']
    assert len(recs)==4 and {(r['record_kind'],r['action'],r['actor_id'],r['subject_user_id']) for r in recs}=={('fact','save',M4,M4),('fact','validate',MD,M4),('fact','save',M5,M5),('meeting','save',MD,M4)},recs
    assert next(r for r in recs if r['action']=='validate')['reason']=='Checked against the site log'
    missions=[r for r in rows if r['kind']=='missions']
    missions=[r for r in missions if r['record_kind']!='task_links']
    assert sorted((r['action'],r['task_tag']) for r in missions)==[('UPDATE','T1'),('UPDATE','T2'),('transition','T2')],missions
    updates=[r for r in missions if r['action']=='UPDATE']
    assert next(r for r in updates if r['task_tag']=='T1')['fields']==['due_date'] and next(r for r in updates if r['task_tag']=='T2')['fields']==['priority']
    assert all(r['actor_id']==MD for r in missions) and next(r for r in missions if r['action']=='transition')['reason']=='Renamed in a command'
    assert value(db,"count(*) FROM taskpulse_private.audit_events WHERE table_name='tasks' AND command='UPDATE' AND 'title'=ANY(changed_fields)")=='1'
    print('PASS',db,'a command and its own row change read as one line; standalone row changes stay listed')
    assert value(db,"count(*) FROM taskpulse_private.audit_events WHERE table_name='tasks' AND command='UPDATE' AND actor_id IS NOT NULL AND NOT changed_fields && ARRAY['priority','due_date']")!='0'
    assert value(db,"count(*) FROM taskpulse_private.audit_events WHERE command='checklist_metric_refresh' AND actor_id IS NOT NULL")!='0'
    print('PASS',db,'derived task metric refreshes and checklist refresh events exist in the audit but are not listed')
    assert not any(r['action'].startswith('dated_') or r['kind']=='people' and r['actor_id'] is None for r in rows)
    month=next(r for r in rows if r['kind']=='month')
    assert (month['action'],month['period'],month['reason'])==('month_draft','2026-09-01','September draft'),month
    assert [r['id'] for r in rows]==[r['id'] for r in sorted(rows,key=lambda r:(r['occurred_at'],r['id']),reverse=True)]
    assert all(r['actor_id']!=B4 for r in rows)
    assert counts(db)==before,'the read writes nothing'
    print('PASS',db,'manager sees missions, records, time and month rows of their company only, newest first; the read writes nothing')
    assert feed(db,PE,'2026-10-20','2026-10-21')==rows
    print('PASS',db,'project engineer sees the same rows as the director')

    mine=feed(db,M4,'2026-10-20','2026-10-21')
    ids={r['id'] for r in mine}
    assert all(r['actor_id']==M4 or r['subject_user_id']==M4 or (r['kind']=='missions' and r['task_tag']=='T1') for r in mine),mine
    assert any(r['action']=='validate' and r['actor_id']==MD for r in mine),'a manager review of my record is mine to see'
    assert any(r['record_kind']=='meeting' and r['actor_id']==MD for r in mine),'a meeting point I own is mine to see'
    assert any(r['kind']=='missions' and r['task_tag']=='T1' and r['actor_id']==MD for r in mine),'a change to my mission is mine to see'
    assert not any(r['subject_user_id']==M5 or r['task_tag']=='T2' or r['kind'] in ('month','company') for r in mine),'nothing of member five, T2, the month or company settings'
    assert ids<={r['id'] for r in rows}
    assert feed(db,M4,'2026-10-20','2026-10-21',member=M4)==mine
    expect_code(db,M4,"SELECT * FROM public.activity_feed('2026-10-20','2026-10-21',NULL,'"+M5+"')",'42501')
    print('PASS',db,"member sees their own actions and changes to their records and missions, nothing else; another member's id is refused")

    five=feed(db,MD,'2026-10-20','2026-10-21',member=M5)
    assert five and all(M5 in (r['actor_id'],r['subject_user_id']) or r['task_tag']=='T2' for r in five) and any(r['task_tag']=='T2' and r['actor_id']==MD for r in five)
    assert all(r['kind']=='records' for r in feed(db,MD,'2026-10-20','2026-10-21',kind='records'))
    assert feed(db,MD,'2026-10-19','2026-10-19')==[]
    print('PASS',db,'member and kind filters narrow the rows; an empty range is empty')

    # Asia/Kolkata dates: 2026-10-20T19:00Z is 21 October 00:30 in Kolkata.
    assert any(r['kind']=='month' for r in feed(db,MD,'2026-10-21','2026-10-21'))
    assert not any(r['kind']=='month' for r in feed(db,MD,'2026-10-20','2026-10-20'))
    print('PASS',db,'date bounds are Asia/Kolkata calendar days')

    brows=feed(db,B_DIR,'2026-10-20','2026-10-21')
    assert brows and all(r['actor_id']==B4 for r in brows),brows
    assert not ({r['id'] for r in brows}&{r['id'] for r in rows})
    print('PASS',db,"company B's director sees only company B; company A never sees B")

    for uid,code in ((INACTIVE,'42501'),(None,'42501')):
        expect_code(db,uid,"SELECT * FROM public.activity_feed('2026-10-20','2026-10-21')",code)
    for statement in ("SELECT * FROM public.activity_feed('2026-10-21','2026-10-20')",
                      "SELECT * FROM public.activity_feed('2026-07-01','2026-10-21')",
                      "SELECT * FROM public.activity_feed(NULL,'2026-10-21')",
                      "SELECT * FROM public.activity_feed('2026-10-20','2026-10-21','secrets')",
                      "SELECT * FROM public.activity_feed('2026-10-20','2026-10-21',NULL,NULL,'{\"at\":\"not a time\",\"id\":\"x\"}')",
                      "SELECT * FROM public.activity_feed('2026-10-20','2026-10-21',NULL,NULL,'{\"at\":\"2026-10-21T00:00:00Z\"}')"):
        expect_code(db,MD,statement,'22023')
    assert len(feed(db,MD,'2026-07-21','2026-10-21'))==len(rows),'93 days is the longest range'
    print('PASS',db,'inactive and anonymous callers refused; reversed, over-long, missing, unknown-kind and bad-cursor calls refused')

    # Keyset paging, including rows that share a timestamp.
    sql(db,f"""INSERT INTO taskpulse_private.month_receipts(actor_id,operation,request,response,recorded_at)
      SELECT '{MD}',gen_random_uuid(),'{{"command":"draft","period":"2026-09-01","payload":{{}}}}','{{}}','2026-10-21T05:00:00Z' FROM generate_series(1,205)""")
    everything=[]
    cursor=None
    while True:
        page=feed(db,MD,'2026-10-20','2026-10-21',before=cursor,limit=7)
        everything+=page
        if len(page)<7:break
        cursor={'at':page[-1]['occurred_at'],'id':page[-1]['id']}
    assert len(everything)==len(rows)+205 and len({r['id'] for r in everything})==len(everything)
    assert [r['id'] for r in everything]==[r['id'] for r in feed(db,MD,'2026-10-20','2026-10-21',limit=200)]+[r['id'] for r in everything[200:]]
    assert len(feed(db,MD,'2026-10-20','2026-10-21',limit=1000))==200 and len(feed(db,MD,'2026-10-20','2026-10-21',limit=0))==1
    print('PASS',db,f'keyset pages of 7 return all {len(everything)} rows once, in order, across 205 tied timestamps; limit is clamped to 1..200')

print('ALL PASS')
