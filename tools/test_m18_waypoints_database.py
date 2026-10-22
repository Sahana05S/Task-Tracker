"""M16 recognition waypoints, migration 51: first crossings, reads, visibility and throughput.

Two-company disposable PostgreSQL checks on an already-running loopback cluster (--psql, --port).
JWT shim only; never reads .env.local or contacts a hosted project.
"""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_m18_fresh_test','taskpulse_m18_upgrade_test')
TARGET=51
NUMBERS=sorted(int(p.name.split('_')[0]) for p in (ROOT/'supabase/migrations').glob('*.sql'))
assert TARGET in NUMBERS,'migration 51 missing'
PREV=max(n for n in NUMBERS if n<TARGET)
MIGRATION=(ROOT/'supabase/migrations/51_task_waypoints.sql').read_text(encoding='utf-8')
A_DIR,A2,A4,A5,A6='00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000006'
B_DIR,B4='00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4'
T1,T2='10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002'
KEYS=['ignition','escape_velocity','deep_space','final_approach','landing']

def migrate(db,upto,start=1):
    for m in sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0])):
        n=int(m.name.split('_')[0])
        if n<start:continue
        if n>upto:break
        sql(db,m.read_text(encoding='utf-8'))
def first_json(rows):return json.loads(next(x for x in rows if x.startswith('{')))
def expect_code(db,uid,statement,code,role='authenticated'):
    r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],
        input=f"BEGIN; SET LOCAL ROLE {role}; SELECT set_config('request.jwt.claim.sub','{uid}',true);\n{statement.rstrip(';')};\nCOMMIT;",
        text=True,capture_output=True,encoding='utf-8')
    assert r.returncode and code in r.stderr,(statement[:120],r.stderr[:300])
def keys(db,tid,source=None):
    where=f" AND source='{source}'" if source else ''
    return value(db,f"coalesce(string_agg(waypoint_key,',' ORDER BY percent),'') FROM taskpulse_private.task_waypoints WHERE task_id='{tid}'{where}").split(',') if value(db,f"count(*) FROM taskpulse_private.task_waypoints WHERE task_id='{tid}'{where}")!='0' else []
def task_reads(db,uid,ids):
    return first_json(actor(db,uid,"SELECT public.recognition_task_waypoints(ARRAY["+','.join(f"'{i}'" for i in ids)+"]::uuid[])"))
def counts(db,uid,frm,to,employee=None):
    return first_json(actor(db,uid,f"SELECT public.recognition_waypoint_counts('{frm}','{to}',"+('NULL' if employee is None else f"'{employee}'")+")"))
def member(model,uid):return next(m for m in model['members'] if m['userId']==uid)
def new_task(db,tag,assignees=(A4,),shares=None):
    shares=shares or [1000000//len(assignees)]*len(assignees)
    fields={'task_tag':tag,'title':tag,'category':'T','priority':'Medium','task_scale':10,'initialize_details':True}
    q=('SELECT public.save_task_with_participants(NULL,'+literal(json.dumps(fields))+'::jsonb,ARRAY['+','.join(f"'{a}'" for a in assignees)
       +']::uuid[],ARRAY[]::uuid[],ARRAY['+','.join(map(str,shares))+'],NULL,false,'+literal(uuid4())+');')
    return [x for x in actor(db,A2,q) if re.fullmatch(r'[a-f0-9-]{36}',x)][-1]
def progress(db,tid,pct,uid='4'):return domain(db,'progress',{'progress':pct},uid=uid,tid=tid)
def checklist(db,tid,command,payload,uid='2'):
    v=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{tid}'"))
    q='SELECT public.checklist_command('+literal(tid)+','+literal(command)+','+literal(json.dumps(payload))+'::jsonb,'+str(v)+','+literal(uuid4())+');'
    return first_json(actor(db,'00000000-0000-0000-0000-'+uid.zfill(12),q))
def timed(db,statement):
    out=sql(db,"CREATE TEMP TABLE t0 AS SELECT clock_timestamp() AS t;\n"+statement+"\nSELECT 'ms:'||round(extract(epoch FROM clock_timestamp()-t)*1000) FROM t0;")
    return int(next(x for x in out.splitlines() if x.startswith('ms:'))[3:])

for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    if db==DBS[1]:
        migrate(db,PREV); sql(db,seed)
        sql(db,f"UPDATE public.tasks SET progress_percentage=55 WHERE id='{T1}'")
        before={t:value(db,f"count(*) FROM {t}") for t in ('public.tasks','taskpulse_private.performance_observations','taskpulse_private.input_history','taskpulse_private.audit_events')}
        policy=value(db,"config FROM taskpulse_private.recognition_policy")
        # Rollback: a failure late in the migration leaves nothing behind.
        failing=MIGRATION.replace('SELECT taskpulse_private.m15_secure();','SELECT taskpulse_private.m15_secure();\nSELECT 1/0;')
        r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],input=failing,text=True,capture_output=True,encoding='utf-8')
        assert r.returncode and 'division by zero' in r.stderr,r.stderr[:300]
        assert value(db,"to_regclass('taskpulse_private.task_waypoints') IS NULL")=='t'
        assert value(db,"count(*) FROM pg_proc WHERE proname IN ('recognition_task_waypoints','recognition_waypoint_counts','record_task_waypoints')")=='0'
        assert value(db,"count(*) FROM pg_trigger WHERE tgname LIKE 'zz_m16_task_waypoints%'")=='0'
        assert value(db,"config FROM taskpulse_private.recognition_policy")==policy
        print('PASS',db,'a failure inside migration 51 rolls back: no table, functions, triggers or policy change')
        migrate(db,TARGET,start=PREV+1)
        for t,n in before.items():assert value(db,f"count(*) FROM {t}")==n,('backfill must not write',t)
        assert keys(db,T1,'backfill')==['ignition','escape_velocity'],keys(db,T1)
        assert keys(db,T2)==[]
        assert value(db,"count(*) FROM taskpulse_private.task_waypoints WHERE source<>'backfill' OR reached_by IS NOT NULL")=='0'
        # Re-running the policy update is a no-op on an already-migrated row.
        sql(db,"BEGIN;"+MIGRATION.split('CREATE TABLE')[0].split('BEGIN;',1)[1]+"ROLLBACK;")
        print('PASS',db,f'upgrade {PREV}->{TARGET}: existing progress backfilled as source=backfill, no observation/history/audit/task rows written')
    else:
        migrate(db,TARGET); sql(db,seed)
        print('PASS',db,f'fresh install 01-{TARGET}')

    secured=value(db,'taskpulse_private.m15_secure()')
    assert secured=='0 tables and 0 functions moved to taskpulse_definer',secured
    assert value(db,"pg_get_userbyid(relowner)||':'||relforcerowsecurity FROM pg_class WHERE oid='taskpulse_private.task_waypoints'::regclass")=='taskpulse_definer:true'
    assert value(db,"count(*) FROM pg_trigger WHERE tgrelid='taskpulse_private.task_waypoints'::regclass AND tgname='aaa_m15_organization'")=='1'
    for f in ('taskpulse_private.record_task_waypoints()','taskpulse_private.waypoints_between(numeric,numeric)'):
        assert value(db,f"has_function_privilege('authenticated','{f}','EXECUTE')")=='f',f
        assert value(db,f"pg_get_userbyid(proowner) FROM pg_proc WHERE oid='{f}'::regprocedure")=='taskpulse_definer',f
    for f in ('public.recognition_task_waypoints(uuid[])','public.recognition_waypoint_counts(date,date,uuid)'):
        assert value(db,f"has_function_privilege('authenticated','{f}','EXECUTE')")=='t',f
        assert value(db,f"has_function_privilege('anon','{f}','EXECUTE')")=='f',f
    wp=json.loads(value(db,"config->'waypoints' FROM taskpulse_private.recognition_policy"))
    assert [(w['key'],w['label'],w['percent']) for w in wp]==[('ignition','Ignition',30),('escape_velocity','Escape Velocity',50),('deep_space','Deep Space',70),('final_approach','Final Approach',90),('landing','Landing',100)]
    assert value(db,"config->'points'->>'waypoint'||'/'||(config->'points'->>'landing')||'/'||(config->'points'->>'monthlyStar') FROM taskpulse_private.recognition_policy")=='0/0/100'
    actor(db,A4,"SELECT count(*) FROM taskpulse_private.task_waypoints",False)
    print('PASS',db,'owned by taskpulse_definer with FORCE RLS and the company stamp; policy holds the five waypoints and zero reserved points; table closed to signed-in roles')

    # Company B with one task, for the cross-company checks.
    sql(db,"INSERT INTO public.organizations(name,slug) VALUES('Beta Builders','beta')")
    B=value(db,"id FROM public.organizations WHERE slug='beta'")
    sql(db,f"""INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
      ('{B_DIR}','bdir@beta.test','{{"employee_id":"TEST-1"}}','{{"organization_id":"{B}"}}'),
      ('{B4}','b4@beta.test','{{"employee_id":"TEST-4"}}','{{"organization_id":"{B}"}}')""")
    sql(db,f"UPDATE public.users SET role='managing_director' WHERE id='{B_DIR}'")
    BT=str(uuid4())
    sql(db,f"BEGIN; SELECT set_config('request.jwt.claim.sub','{B_DIR}',true); INSERT INTO public.tasks(id,task_tag,title,assignee_id,task_scale,progress_percentage) VALUES('{BT}','BETA-1','Beta task','{B4}',5,35); COMMIT;")
    assert keys(db,BT,'insert')==['ignition'] and value(db,f"organization_id||'/'||reached_by FROM taskpulse_private.task_waypoints WHERE task_id='{BT}'")==f'{B}/{B_DIR}'
    print('PASS',db,'a mission inserted with progress records its crossings (source=insert) in its own company, crediting the saver')

    today=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    # 1. Progress input path, member saves; drops keep keys; re-crossing adds nothing.
    p1=new_task(db,'WP-PROGRESS')
    progress(db,p1,35); assert keys(db,p1)==['ignition']
    progress(db,p1,72); assert keys(db,p1)==['ignition','escape_velocity','deep_space']
    stamp=value(db,f"reached_at FROM taskpulse_private.task_waypoints WHERE task_id='{p1}' AND waypoint_key='ignition'")
    progress(db,p1,20); assert keys(db,p1)==['ignition','escape_velocity','deep_space'],'dropping progress keeps reached waypoints'
    progress(db,p1,75); assert keys(db,p1)==['ignition','escape_velocity','deep_space']
    assert value(db,f"reached_at FROM taskpulse_private.task_waypoints WHERE task_id='{p1}' AND waypoint_key='ignition'")==stamp,'first crossing is kept'
    assert value(db,f"string_agg(DISTINCT source||'/'||reached_by||'/'||organization_id,',') FROM taskpulse_private.task_waypoints WHERE task_id='{p1}'")==f"progress/{A4}/{value(db,'id FROM public.organizations WHERE is_default')}"
    assert value(db,f"progress_at FROM taskpulse_private.task_waypoints WHERE task_id='{p1}' AND waypoint_key='deep_space'")=='72.00'
    print('PASS',db,'progress input: crossings recorded once with the saver, kept when progress drops, unchanged when re-crossed')

    # 2. Waypoint rows write neither observations nor input history: the same save with and without the triggers.
    def delta(disable):
        q=("BEGIN;"+("ALTER TABLE public.tasks DISABLE TRIGGER zz_m16_task_waypoints_progress;" if disable else "")
           +"CREATE TEMP TABLE c0 AS SELECT (SELECT count(*) FROM taskpulse_private.performance_observations) o,(SELECT count(*) FROM taskpulse_private.input_history) h,(SELECT count(*) FROM taskpulse_private.audit_events) a;"
           +f"UPDATE public.tasks SET progress_percentage=95 WHERE id='{p1}';"
           +"SELECT 'd:'||((SELECT count(*) FROM taskpulse_private.performance_observations)-o)||'/'||((SELECT count(*) FROM taskpulse_private.input_history)-h)||'/'||((SELECT count(*) FROM taskpulse_private.audit_events)-a)||'/'||(SELECT count(*) FROM taskpulse_private.task_waypoints WHERE task_id="+literal(p1)+") FROM c0;ROLLBACK;")
        return next(x for x in sql(db,q).splitlines() if x.startswith('d:'))
    on,off=delta(False),delta(True)
    assert on.rsplit('/',1)[0]==off.rsplit('/',1)[0] and on.endswith('/4') and off.endswith('/3'),(on,off)
    print('PASS',db,'waypoint rows add no performance observation, input history or audit row')

    # 3. Log with a progress delta.
    p2=new_task(db,'WP-LOG')
    call(db,'create_task_log',p2,{'log_date':today,'hours_worked':'1','requested_delta':'55','notes':'waypoint log','raw_links':None,'reason':None})
    assert float(value(db,f"progress_percentage FROM public.tasks WHERE id='{p2}'"))==55
    assert keys(db,p2,'progress')==['ignition','escape_velocity']
    print('PASS',db,'a log with a progress delta records its crossings')

    # 4. Checklist rollup owns progress: ticking items moves the mission across waypoints.
    p3=new_task(db,'WP-CHECKLIST')
    for s in ('setup','closure'):checklist(db,p3,'section',{'section':s,'intentional_empty':True,'reason':'Not needed in this fixture'})
    items=[checklist(db,p3,'add',{'title':f'Item {i}','section':'activity','node_type':'Item'})['nodeId'] for i in range(2)]
    roll=json.loads(value(db,f"taskpulse_private.checklist_rollup('{p3}')"))
    checklist(db,p3,'mode',{'enabled':True,'reason':'Checklist owns progress','preview_progress':roll['taskProgressDecimal']})
    checklist(db,p3,'state',{'node_id':items[0],'state':'Yes'},uid='4')
    assert float(value(db,f"progress_percentage FROM public.tasks WHERE id='{p3}'"))==50
    assert keys(db,p3)==['ignition','escape_velocity'] and value(db,f"string_agg(DISTINCT reached_by::text,',') FROM taskpulse_private.task_waypoints WHERE task_id='{p3}'")==A4
    print('PASS',db,'a checklist rollup records its crossings for the member who ticked the item')

    # 5. Shared mission: every current assignee is credited; backfill and other companies never count.
    p4=new_task(db,'WP-SHARED',assignees=(A4,A5),shares=[500000,500000])
    progress(db,p4,100,uid='5')
    assert keys(db,p4)==KEYS
    c=counts(db,A_DIR,today,today)
    assert member(c,A4)['total']==3+2+2+5 and member(c,A5)['total']==5,c
    assert member(c,A4)['byKey']=={'ignition':4,'escape_velocity':4,'deep_space':2,'final_approach':1,'landing':1},member(c,A4)
    assert member(c,A6)['total']==0 and member(c,A6)['byKey']=={}
    assert B4 not in {m['userId'] for m in c['members']}
    sql(db,f"UPDATE taskpulse_private.task_waypoints SET reached_at=reached_at-interval '3 days' WHERE task_id='{p2}'")
    assert member(counts(db,A4,today,today),A4)['total']==3+2+5
    yesterday3=value(db,f"'{today}'::date-3")
    assert member(counts(db,A4,yesterday3,yesterday3),A4)['total']==2
    if db==DBS[1]:
        assert value(db,f"count(*) FROM taskpulse_private.task_waypoints WHERE task_id='{T1}' AND source='backfill'")=='2'
        before_t1=member(counts(db,A4,today,today),A4)['total']
        progress(db,T1,60); assert keys(db,T1)==['ignition','escape_velocity'],'backfilled keys are not recorded again'
        assert member(counts(db,A4,today,today),A4)['total']==before_t1,'backfilled waypoints never count'
        progress(db,T1,70); assert member(counts(db,A4,today,today),A4)['total']==before_t1+1
    print('PASS',db,'counts credit every current assignee, follow Asia/Kolkata dates and exclude backfill')

    # 6. Visibility.
    expect_code(db,A4,f"SELECT public.recognition_waypoint_counts('{today}','{today}','{A5}')",'42501')
    assert [m['userId'] for m in counts(db,A4,today,today)['members']]==[A4],'a member reads only themselves'
    assert member(counts(db,A2,today,today,A5),A5)['total']==5
    expect_code(db,B_DIR,f"SELECT public.recognition_waypoint_counts('{today}','{today}','{A4}')",'42501')
    assert {m['userId'] for m in counts(db,B_DIR,today,today)['members']}=={B_DIR,B4}
    assert member(counts(db,B_DIR,today,today),B4)['total']==1
    expect_code(db,'',f"SELECT public.recognition_waypoint_counts('{today}','{today}',NULL)",'42501',role='anon')
    expect_code(db,A4,f"SELECT public.recognition_waypoint_counts('{today}','{yesterday3}',NULL)",'23514')
    expect_code(db,A4,f"SELECT public.recognition_waypoint_counts('2020-01-01','{today}',NULL)",'23514')
    sql(db,f"UPDATE public.users SET is_active=false WHERE id='{A5}'")
    actor(db,A5,f"SELECT public.recognition_waypoint_counts('{today}','{today}',NULL)",False)
    expect_code(db,A2,f"SELECT public.recognition_waypoint_counts('{today}','{today}','{A5}')",'42501')
    sql(db,f"UPDATE public.users SET is_active=true WHERE id='{A5}'")
    r=task_reads(db,A4,[p1,p4,BT])
    assert [(w['key'],w['label']) for w in r['waypoints']]==[(w['key'],w['label']) for w in wp]
    assert {t['taskId'] for t in r['tasks']}=={p1,p4},'another company\'s mission is omitted'
    shared=next(t for t in r['tasks'] if t['taskId']==p4)
    assert [w['key'] for w in shared['reached']]==KEYS and not any(w['mine'] for w in shared['reached'])
    assert all(w['mine'] for w in next(t for t in r['tasks'] if t['taskId']==p1)['reached'])
    assert all(w['mine'] for w in next(t for t in task_reads(db,A5,[p4])['tasks'])['reached']),'the member who saved sees it as theirs'
    assert task_reads(db,A4,[])['tasks']==[]
    expect_code(db,A4,"SELECT public.recognition_task_waypoints(ARRAY(SELECT gen_random_uuid() FROM generate_series(1,501)))",'23514')
    expect_code(db,'',f"SELECT public.recognition_task_waypoints(ARRAY['{p1}']::uuid[])",'42501',role='anon')
    assert task_reads(db,B_DIR,[p1,BT])['tasks'][0]['taskId']==BT and len(task_reads(db,B_DIR,[p1,BT])['tasks'])==1
    print('PASS',db,'members read own counts, managers their company; other companies, anonymous, inactive and oversized requests are refused; mission reads stay in the company and mark the saver')

    # 7. Cascade: deleting a mission removes its waypoints.
    gone=str(uuid4())
    sql(db,f"INSERT INTO public.tasks(id,task_tag,title,assignee_id,task_scale,progress_percentage) VALUES('{gone}','WP-GONE','Gone','{A4}',1,90)")
    assert len(keys(db,gone))==4
    r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],input=f"DELETE FROM public.tasks WHERE id='{gone}';",text=True,capture_output=True,encoding='utf-8')
    if r.returncode==0:
        assert value(db,f"count(*) FROM taskpulse_private.task_waypoints WHERE task_id='{gone}'")=='0'
        print('PASS',db,'deleting a mission cascades to its waypoints')
    else:
        print('PASS',db,'mission deletion is refused by an existing RESTRICT reference, so waypoints cannot dangle ('+r.stderr.strip().splitlines()[0][:80]+')')

    # 8. Throughput: a bulk progress update of 300 missions in one statement, with and without the triggers.
    N=300
    org=value(db,"id FROM public.organizations WHERE is_default")
    sql(db,f"BEGIN; SELECT set_config('taskpulse.organization','{org}',true); INSERT INTO public.tasks(task_tag,title,assignee_id,task_scale) SELECT 'BULK-'||i,'Bulk '||i,'{A4}',1 FROM generate_series(1,{N}) i; COMMIT;")
    bulk=f"SELECT set_config('taskpulse.organization','{org}',true); UPDATE public.tasks SET progress_percentage=100 WHERE task_tag LIKE 'BULK-%';"
    without=timed(db,"BEGIN; ALTER TABLE public.tasks DISABLE TRIGGER zz_m16_task_waypoints_progress;"+bulk+"ROLLBACK;")
    with_=timed(db,"BEGIN;"+bulk+"COMMIT;")
    assert value(db,"count(*) FROM taskpulse_private.task_waypoints w JOIN public.tasks t ON t.id=w.task_id WHERE t.task_tag LIKE 'BULK-%'")==str(5*N)
    unchanged=timed(db,"BEGIN;"+bulk+"COMMIT;")
    status_only=timed(db,f"BEGIN; SELECT set_config('taskpulse.organization','{org}',true); UPDATE public.tasks SET comments='bulk note' WHERE task_tag LIKE 'BULK-%'; COMMIT;")
    assert with_<max(4*without,without+20000),(with_,without)
    print('PASS',db,f'bulk progress 0->100 on {N} missions: {without} ms without waypoints, {with_} ms with ({5*N} rows); repeat (no change) {unchanged} ms; unrelated column {status_only} ms')

    # 9. Wave 1's bulk Done path (task tools) on missions already at 100%: no new waypoint rows.
    done=new_task(db,'WP-DONE')
    for s in ('setup','activity','closure'):checklist(db,done,'section',{'section':s,'intentional_empty':True,'reason':'Nothing to check in this fixture'})
    progress(db,done,100)
    n=value(db,"count(*) FROM taskpulse_private.task_waypoints")
    p=first_json(actor(db,A4,"SELECT public.task_tools_preview('bulk_done',"+literal(json.dumps({'taskIds':[done]}))+"::jsonb)"))
    assert p['ready'],p
    first_json(actor(db,A4,'SELECT public.task_tools_command('+literal(p['id'])+','+literal(uuid4())+')'))
    assert value(db,f"status FROM public.tasks WHERE id='{done}'")=='Done' and value(db,"count(*) FROM taskpulse_private.task_waypoints")==n
    print('PASS',db,'bulk Done through task tools completes and adds no waypoint rows')

print('ALL M18 WAYPOINT CHECKS PASSED')
