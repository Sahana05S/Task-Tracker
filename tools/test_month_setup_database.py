"""Month setup, migration 55: month_setup_context / _preview / _commit over the approved Task Tools copy and
handoff, sheet tags from the 53 allocator. Fresh install 01-latest, upgrade from main's set without 55 (with a
failed apply rolled back), role gates (director, engineer, data manager, member, inactive, anonymous, another
company), the plan (standing grid, clipped weekly phases, repeat title swap, carry-over only once the month has
started), atomic failure on one bad row, idempotent replay, set-up-once, tag uniqueness under concurrency.
Two-company disposable PostgreSQL checks; JWT shim only; no hosted connection."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
import calendar
from datetime import date
from uuid import uuid4

DBS=('taskpulse_month_setup_fresh_test','taskpulse_month_setup_upgrade_test')
U=lambda n:'00000000-0000-0000-0000-'+str(n).zfill(12)
MD,PE,DM,M4,M5,M6,INACTIVE,M8=U(1),U(2),U(3),U(4),U(5),U(6),U(7),U(8)
B_DIR='00000000-0000-0000-0000-0000000000b1'
MIGRATIONS=sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0]))
M55=next(p for p in MIGRATIONS if p.name.startswith('55_')).read_text(encoding='utf-8')
LATEST=int(MIGRATIONS[-1].name.split('_')[0])
TAG=re.compile(r'^[A-Z][a-z]{2}\d{2}_[A-Z][A-Z0-9]*\d+$')
ACTIVE=[MD,PE,DM,M4,M5,M6,M8]

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
    assert r.returncode==0,(statement[:200],r.stderr[:600])
    return json.loads(next(x for x in r.stdout.splitlines() if x[:1] in '{['))
def expect_code(db,uid,statement,code,text=None):
    r=run(db,uid,statement)
    assert r.returncode and code in r.stderr and (text is None or text in r.stderr),(statement[:200],r.stderr[:600])
    return r.stderr
def context(db,uid,month):return ok(db,uid,f"SELECT public.month_setup_context('{month}-01')")
def preview_sql(payload):return 'SELECT public.month_setup_preview('+literal(json.dumps(payload))+'::jsonb)'
def preview(db,uid,payload):return ok(db,uid,preview_sql(payload))
def commit_sql(pid,op):return f"SELECT public.month_setup_commit('{pid}','{op}')"
def commit(db,uid,pid,op=None):return ok(db,uid,commit_sql(pid,op or uuid4()))
def month_key(d):return d.strftime('%Y-%m')
def add_month(d,n):
    y,m=divmod(d.month-1+n,12)
    return date(d.year+y,m+1,1)
def counts(db):
    return {t:value(db,f"count(*) FROM {t}") for t in ('public.tasks','public.task_assignees','public.task_dependencies','taskpulse_private.tool_previews',
        'taskpulse_private.command_receipts','taskpulse_private.audit_events','taskpulse_private.task_tag_counters')}
def task(db,tid):
    return json.loads(value(db,f"to_jsonb(t) FROM public.tasks t WHERE id='{tid}'"))
def old_task(db,tag,title,assignee,assigned,progress,status='In Progress',scale=10):
    tid=str(uuid4())
    sql(db,f"""INSERT INTO public.tasks(id,task_tag,title,assignee_id,task_scale,scale_inputs,progress_percentage,status,assigned_date,due_date)
      VALUES('{tid}',{literal(tag)},{literal(title)},'{assignee}',{scale},'{{"value":{scale}}}',{progress},'{status}','{assigned}','{assigned}')""")
    return tid
def broken_apply(db):
    r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],
        input=M55.replace('\nCOMMIT;','\nSELECT 1/0;\nCOMMIT;',1),text=True,capture_output=True,encoding='utf-8')
    assert r.returncode and 'division by zero' in r.stderr,r.stderr[-300:]

assert LATEST>=58
for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    every=[int(m.name.split('_')[0]) for m in MIGRATIONS]
    if db==DBS[1]:
        # main and the hosted test project have 01-54 and 56-58; 55 arrives later (--include-all).
        migrate(db,[n for n in every if n!=55]); sql(db,seed)
        before=counts(db)
        broken_apply(db)
        assert value(db,"count(*) FROM pg_class WHERE relname='month_setup_items'")=='0'
        assert value(db,"count(*) FROM pg_proc WHERE proname LIKE 'month_setup%'")=='0'
        assert counts(db)==before
        print('PASS',db,'a failed migration 55 rolls back completely (table and functions absent, rows unchanged)')
        sql(db,M55)
        assert counts(db)==before,'55 changes no existing rows'
        print('PASS',db,'upgrade 01-54+56-58 -> +55 keeps every existing row')
    else:
        migrate(db,every); sql(db,seed)
        print('PASS',db,f'fresh install 01-{LATEST} including 55')

    # ---- ownership, row security, grants ------------------------------------------------------------------
    assert value(db,"taskpulse_private.m15_secure()")=='0 tables and 0 functions moved to taskpulse_definer'
    assert value(db,"pg_get_userbyid(relowner)||relrowsecurity||relforcerowsecurity FROM pg_class WHERE oid='taskpulse_private.month_setup_items'::regclass")=='taskpulse_definertruetrue'
    r=run(db,M4,'SELECT count(*) FROM taskpulse_private.month_setup_items'); assert r.returncode and '42501' in r.stderr
    for f in ('public.month_setup_context(date)','public.month_setup_preview(jsonb)','public.month_setup_commit(uuid,uuid)'):
        assert value(db,f"has_function_privilege('authenticated','{f}','EXECUTE') AND NOT has_function_privilege('anon','{f}','EXECUTE') AND NOT has_function_privilege('service_role','{f}','EXECUTE')")=='t',f
    for f in ('taskpulse_private.month_setup_swap_title(text,date,date)','taskpulse_private.month_setup_fingerprints(uuid)','taskpulse_private.month_setup_director(uuid)'):
        assert value(db,f"has_function_privilege('authenticated','{f}','EXECUTE')")=='f',f
    assert value(db,"count(*) FROM pg_proc WHERE proname LIKE 'month_setup%' AND prosrc LIKE '%40001%'")=='0'
    print('PASS',db,'month_setup_items is definer-owned with FORCE RLS; only the three public commands are callable, by signed-in users; no 40001')

    # ---- dates: the real Asia/Kolkata calendar ------------------------------------------------------------
    today=date.fromisoformat(value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date"))
    cur=today.replace(day=1); nxt=add_month(cur,1); prev=add_month(cur,-1)
    CUR,NXT,PREV=month_key(cur),month_key(nxt),month_key(prev)
    days=calendar.monthrange(cur.year,cur.month)[1]
    label=cur.strftime('%B %Y'); prev_label=prev.strftime('%B %Y'); mon=cur.strftime('%b%y')

    # ---- earlier missions ---------------------------------------------------------------------------------
    started=old_task(db,'OLD1','Site survey',M4,prev.isoformat(),40)
    monthly=old_task(db,'OLD2',f'GST filing - {prev_label}',M5,prev.isoformat(),0,'Not Started')
    covered=old_task(db,'OLD3',f'Off Hours - {prev_label} - TEST-4',M4,prev.isoformat(),20)
    done=old_task(db,'OLD4','Finished brochure',M6,prev.isoformat(),100,'Done')
    stale=old_task(db,'OLD5','Old open survey',M6,add_month(cur,-3).isoformat(),10)
    ancient_done=old_task(db,'OLD6','Ancient done',M6,add_month(cur,-3).isoformat(),100,'Done')
    timed=old_task(db,'OLD7','Timer still running',M8,prev.isoformat(),30)

    # ---- role gates ---------------------------------------------------------------------------------------
    sql(db,"INSERT INTO public.organizations(name,slug) VALUES('Beta Builders','beta')")
    B=value(db,"id FROM public.organizations WHERE slug='beta'")
    sql(db,f"""INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
      ('{B_DIR}','bdir@beta.test','{{"employee_id":"BETA-1"}}','{{"organization_id":"{B}"}}')""")
    sql(db,f"UPDATE public.users SET role='managing_director' WHERE id='{B_DIR}'")
    simple={'month':CUR,'phases':{'ownerId':MD}}
    for uid in (DM,M4,INACTIVE):
        expect_code(db,uid,f"SELECT public.month_setup_context('{CUR}-01')",'42501')
        expect_code(db,uid,preview_sql(simple),'42501')
        expect_code(db,uid,commit_sql(uuid4(),uuid4()),'42501')
    for statement in (f"SELECT public.month_setup_context('{CUR}-01')",preview_sql(simple),commit_sql(uuid4(),uuid4())):
        expect_code(db,None,statement,'42501')
    print('PASS',db,'data manager, member, inactive account and anonymous callers are refused (42501) on all three commands')

    # ---- context ------------------------------------------------------------------------------------------
    ctx=context(db,PE,CUR)
    assert ctx['month']==CUR and ctx['allowed'] and ctx['carryoverAvailable'] and ctx['directorId']==MD
    assert [m['id'] for m in ctx['members']]==ACTIVE,'active members by employee code; the inactive account is left out'
    assert [s['titlePattern'] for s in ctx['standing']][0]=='Off Hours - {month} - {member}' and len(ctx['standing'])==6
    shown={p['id'] for p in ctx['previous']}
    assert {started,monthly,covered,done,stale,timed}<=shown and ancient_done not in shown,shown
    assert next(p for p in ctx['previous'] if p['id']==timed)['runningTimer'] is False
    assert context(db,MD,NXT)['carryoverAvailable'] is False and context(db,MD,month_key(add_month(cur,2)))['allowed'] is False
    beta=context(db,B_DIR,CUR)
    assert [m['id'] for m in beta['members']]==[B_DIR] and beta['standing']==[] and beta['previous']==[]
    print('PASS',db,'context: active team, standing list, earlier missions (open or last month), carry-over only this month; company B sees none of A')

    # ---- payload contract ---------------------------------------------------------------------------------
    for bad in ({'month':'2026-13'},{'month':CUR,'extra':1},{'month':CUR},{'month':CUR,'standing':[{'missionId':'x','memberId':MD}]},
                {'month':CUR,'previous':[{'taskId':started,'action':'archive'}]},{'month':month_key(add_month(cur,2)),'phases':{'ownerId':MD}},
                {'month':PREV,'phases':{'ownerId':MD}},{'month':CUR,'phases':{'ownerId':INACTIVE}},
                {'month':CUR,'previous':[{'taskId':started,'action':'repeat'},{'taskId':started,'action':'carryover'}]}):
        expect_code(db,MD,preview_sql(bad),'23514')
    expect_code(db,MD,preview_sql({'month':NXT,'previous':[{'taskId':started,'action':'carryover'}]}),'23514','carry over is available from')
    expect_code(db,MD,preview_sql({'month':CUR,'previous':[{'taskId':str(uuid4()),'action':'repeat'}]}),'23503')
    expect_code(db,MD,preview_sql({'month':CUR,'previous':[{'taskId':done,'action':'carryover'}]}),'23514','OLD4: Carryover requires')
    print('PASS',db,'malformed, out-of-range and next-month carry-over payloads are refused; a bad earlier mission is named')

    # ---- cross-company ------------------------------------------------------------------------------------
    standing=ctx['standing']; off=standing[0]['id']; tracker=standing[3]['id']
    expect_code(db,B_DIR,preview_sql({'month':CUR,'standing':[{'missionId':off,'memberId':B_DIR}]}),'PT409','standing mission is missing')
    expect_code(db,B_DIR,preview_sql({'month':CUR,'phases':{'ownerId':M4}}),'23514','active member of the company')
    expect_code(db,B_DIR,preview_sql({'month':CUR,'previous':[{'taskId':started,'action':'repeat'}]}),'23503')
    print('PASS',db,"another company's director cannot use company A's standing missions, members or earlier missions")

    # ---- the plan -----------------------------------------------------------------------------------------
    sql(db,f"INSERT INTO public.task_timers(task_id,user_id,status,started_at) SELECT '{timed}','{M8}','Running',now()")
    grid=[{'missionId':s['id'],'memberId':m} for s in standing if s['ownerMode']=='per_member' for m in ACTIVE]
    grid+=[{'missionId':s['id'],'memberId':MD} for s in standing if s['ownerMode']=='single']
    payload={'month':CUR,'standing':grid,'phases':{'ownerId':MD},
             'previous':[{'taskId':started,'action':'carryover'},{'taskId':monthly,'action':'repeat'},{'taskId':stale,'action':'repeat'}]}
    blocked=preview(db,MD,{**payload,'previous':payload['previous']+[{'taskId':timed,'action':'carryover'}]})
    assert not blocked['ready'] and 'stop_running_timer_before_archive' in blocked['reasons'],blocked['reasons']
    assert next(p for p in context(db,MD,CUR)['previous'] if p['id']==timed)['runningTimer'] is True
    plan=preview(db,MD,payload)
    assert plan['ready'] and plan['command']=='month_setup' and plan['reasons']==[],plan['reasons']
    kinds=[i['kind'] for i in plan['items']]
    weeks=-(-days//7)
    assert kinds==['standing']*24+['phase']*weeks+['repeat','carryover','repeat'] or kinds==['standing']*24+['phase']*weeks+['repeat','repeat','carryover'],kinds
    st=[i for i in plan['items'] if i['kind']=='standing']
    md_name=value(db,f"full_name FROM public.users WHERE id='{MD}'")
    assert st[0]['title']==f'Off Hours - {label} - {md_name}'
    assert all(i['taskTag'] is None and i['assignedDate']==cur.isoformat() and i['dueDate']==cur.replace(day=days).isoformat() for i in st)
    assert st[-1]['title']=='Database Re-Organisation' and st[-1]['category']=='WK'
    ph=[i for i in plan['items'] if i['kind']=='phase']
    assert [(i['assignedDate'],i['dueDate']) for i in ph]==[(cur.replace(day=1+7*k).isoformat(),cur.replace(day=min(7+7*k,days)).isoformat()) for k in range(weeks)]
    assert ph[0]['title']==f'Tasks Review - {label} - Week 1' and all(i['category']=='WK' and i['assignees']==[MD] for i in ph)
    rep=next(i for i in plan['items'] if i.get('sourceTaskId')==monthly)
    assert rep['title']==f'GST filing - {label}' and TAG.match(rep['taskTag']) and rep['taskTag'].startswith(mon+'_')
    assert next(i for i in plan['items'] if i.get('sourceTaskId')==stale)['title']=='Old open survey'
    car=next(i for i in plan['items'] if i['kind']=='carryover')
    assert float(car['scale'])==6.0,car['scale']
    print('PASS',db,f'plan: 24 standing cells, {weeks} weekly phases clipped to day {days}, repeat swaps "{prev_label}", carry-over keeps 60% of scale 10')

    # ---- atomic failure on one bad row --------------------------------------------------------------------
    before=counts(db)
    sql(db,f"UPDATE public.tasks SET title='Site survey (renamed)' WHERE id='{started}'")
    err=expect_code(db,MD,commit_sql(plan['id'],uuid4()),'PT409','(from OLD1): Source changed')
    after=counts(db)
    assert after['public.tasks']==before['public.tasks'] and after['public.task_dependencies']==before['public.task_dependencies'],(before,after)
    assert value(db,"count(*) FROM taskpulse_private.month_setup_items")=='0'
    assert value(db,f"archived_effective_date IS NULL FROM public.tasks WHERE id='{started}'")=='t'
    print('PASS',db,'one changed source fails the whole batch: no standing, phase or copied mission is left and the source stays open')

    # ---- commit, as a setup made before the 1st: no carry-overs (user decision, option 1) ------------------
    early={**payload,'previous':[x for x in payload['previous'] if x['action']!='carryover']}
    plan=preview(db,MD,early); assert plan['ready'] and 'carryover' not in [i['kind'] for i in plan['items']]
    op=str(uuid4())
    done_state=commit(db,MD,plan['id'],op)
    made=done_state['items']
    assert done_state['status']=='committed' and len(made)==len(plan['items'])
    tags=[i['taskTag'] for i in made]
    assert len(set(tags))==len(tags) and all(TAG.match(t) and t.startswith(mon+'_') for t in tags),tags
    rows={i['taskId']:task(db,i['taskId']) for i in made}
    for item,res in zip(plan['items'],made):
        row=rows[res['taskId']]
        assert row['task_tag']==res['taskTag'] and row['status']=='Not Started' and float(row['progress_percentage'])==0
        if item['kind'] in ('standing','phase'):
            assert (row['title'],row['assigned_date'],row['due_date'],row['assignee_id'],row['scale_mode'],row['category'])==(
                item['title'],item['assignedDate'],item['dueDate'],item['assignees'][0],item['scaleMode'],item['category']),(row,item)
            assert row['task_tag'].startswith(f"{mon}_{item['category']}")
    assert rows[made[0]['taskId']]['scale_mode']=='manual' and rows[made[0]['taskId']]['category']=='OT'
    rep_row=next(rows[r['taskId']] for i,r in zip(plan['items'],made) if i.get('sourceTaskId')==monthly)
    assert rep_row['title']==f'GST filing - {label}' and rep_row['assigned_date']==cur.isoformat()
    assert task(db,monthly)['archived_effective_date'] is None,'repeat leaves its source untouched'
    assert task(db,started)['archived_effective_date'] is None,'a carry-over row is not part of an early setup'
    assert value(db,f"count(*) FROM taskpulse_private.month_setup_items WHERE period_start='{cur}'")==str(len(made))
    assert value(db,f"count(*) FROM taskpulse_private.audit_events WHERE command='month_setup' AND operation_id='{op}'")=='1'
    assert commit(db,MD,plan['id'],op)==done_state,'replay returns the receipt'
    expect_code(db,MD,commit_sql(preview(db,MD,{'month':CUR,'phases':{'ownerId':MD}})['id'],op),'PT409','Operation reused')
    print('PASS',db,f'early setup: {len(made)} missions with unique {mon}_ tags in plan order, no carry-over committed; replay is idempotent')

    # ---- reopen on or after the 1st: step 4 only, through the unchanged D12 handoff ------------------------
    ctx=context(db,MD,CUR)
    assert ctx['carryoverAvailable'] and len(ctx['phasesSetUp'])==weeks
    assert all(set(s['setUp'])==set(ACTIVE) for s in ctx['standing'] if s['ownerMode']=='per_member')
    assert all(s['setUp']==[MD] for s in ctx['standing'] if s['ownerMode']=='single'),'steps 2-3 show as set up'
    shown={x['id'] for x in ctx['previous']}
    assert started in shown and monthly not in shown and stale not in shown,'step 4 keeps the open carry-over, drops the repeated sources'
    later=preview(db,MD,{'month':CUR,'previous':[{'taskId':started,'action':'carryover'}]})
    assert later['ready'] and [i['kind'] for i in later['items']]==['carryover']
    car_res=commit(db,MD,later['id'])['items'][0]
    car_row=task(db,car_res['taskId'])
    assert car_res['kind']=='carryover' and float(car_row['task_scale'])==6 and car_row['title']=='Site survey (renamed) - Carryover'
    assert car_row['assigned_date']==cur.isoformat() and float(car_row['progress_percentage'])==0
    src=task(db,started)
    assert src['archived_effective_date']==today.isoformat() and src['handoff_successor_id']==car_row['id'] and float(src['task_scale'])==10
    assert value(db,f"relation_type FROM public.task_dependencies WHERE predecessor_task_id='{started}' AND successor_task_id='{car_row['id']}'")=='Carryover'
    made.append(car_res)
    print('PASS',db,'reopened: steps 2-3 are set up, step 4 carries 60% of scale 10 over through the D12 handoff (source archived, Carryover lineage)')

    # ---- set up once --------------------------------------------------------------------------------------
    again=preview(db,MD,{'month':CUR,'standing':grid[:2],'phases':{'ownerId':MD}})
    assert not again['ready'] and again['reasons']==['already_set_up'] and all(i['reasons']==['already_set_up'] for i in again['items'])
    expect_code(db,MD,commit_sql(again['id'],uuid4()),'23514')
    ctx=context(db,MD,CUR)
    assert ctx['setUpCount']==len(made)
    assert not ({monthly,stale,started}&{p['id'] for p in ctx['previous']}),'used and archived sources leave step 4'
    print('PASS',db,'a month is set up once: a second preview marks every item already set up and cannot commit')

    # ---- stale preview ------------------------------------------------------------------------------------
    nplan=preview(db,MD,{'month':NXT,'standing':[{'missionId':off,'memberId':M4}]})
    sql(db,f"UPDATE public.users SET full_name='Renamed Four' WHERE id='{M4}'")
    expect_code(db,MD,commit_sql(nplan['id'],uuid4()),'PT409','team or the standing missions changed')
    print('PASS',db,'a renamed member (or changed standing list) after the preview makes the commit refuse with PT409')

    # ---- tag uniqueness under concurrency -----------------------------------------------------------------
    per_member=[s['id'] for s in standing if s['ownerMode']=='per_member']
    plans=[preview(db,uid,{'month':NXT,'standing':[{'missionId':sid,'memberId':member} for sid in per_member]})
           for uid,member in ((MD,M4),(PE,M5),(MD,M6),(PE,M8))]
    plans.append(preview(db,MD,{'month':NXT,'phases':{'ownerId':PE}}))
    owners=[MD,PE,MD,PE,MD]
    with ThreadPoolExecutor(max_workers=5) as pool:
        results=list(pool.map(lambda pair:commit(db,pair[0],pair[1]['id']),zip(owners,plans)))
    ntags=[i['taskTag'] for r in results for i in r['items']]
    nmon=nxt.strftime('%b%y')
    numbers=sorted(int(re.search(r'(\d+)$',t).group(1)) for t in ntags)
    assert len(set(ntags))==len(ntags)==12+-(-calendar.monthrange(nxt.year,nxt.month)[1]//7),ntags
    assert all(t.startswith(nmon+'_') for t in ntags) and numbers==list(range(1,len(ntags)+1)),numbers
    assert value(db,'(SELECT count(*)=count(DISTINCT (organization_id,task_tag)) FROM public.tasks)')=='t'
    assert value(db,f"min(assigned_date)='{nxt}' FROM public.tasks WHERE task_tag LIKE '{nmon}\\_%'")=='t'
    print('PASS',db,f'5 concurrent next-month commits get {len(ntags)} distinct, gapless {nmon}_ tags dated from {nxt}')

    # ---- engineer path and repeat ahead of the month ------------------------------------------------------
    other=old_task(db,'OLD8',f'Rent - {prev_label}',M5,prev.isoformat(),0,'Not Started')
    eplan=preview(db,PE,{'month':NXT,'previous':[{'taskId':other,'action':'repeat'}]})
    assert eplan['ready'] and eplan['items'][0]['title']==f"Rent - {nxt.strftime('%B %Y')}",eplan['items'][0]['title']
    erow=task(db,commit(db,PE,eplan['id'])['items'][0]['taskId'])
    assert erow['assigned_date']==nxt.isoformat() and erow['title']==f"Rent - {nxt.strftime('%B %Y')}"
    expect_code(db,MD,commit_sql(eplan['id'],uuid4()),'42501','Own month setup preview')
    print('PASS',db,"the project engineer repeats a mission into next month ahead of its 1st; a director cannot commit the engineer's preview")

    # ---- Task Tools Duplicate keeps its copy titles unless given a title ----------------------------------
    dup=lambda extra:ok(db,MD,"SELECT public.task_tools_preview('duplicate',"+literal(json.dumps({'sourceTaskId':other,'startDate':nxt.isoformat(),**extra}))+'::jsonb)')['items'][0]['title']
    assert dup({})==f'Rent - {prev_label} (Copy 1)' and dup({'title':'  Rent  '})=='Rent' and dup({'title':' '})==f'Rent - {prev_label} (Copy 1)'
    expect_code(db,MD,"SELECT public.task_tools_preview('duplicate',"+literal(json.dumps({'sourceTaskId':other,'startDate':nxt.isoformat(),'bogus':1}))+'::jsonb)','23514')
    print('PASS',db,'Task Tools Duplicate still titles copies "(Copy 1)"; an explicit title replaces it; unknown keys are still refused')

print('ALL PASS month setup database')
