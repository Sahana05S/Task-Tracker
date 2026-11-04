"""Migration 110: timer_session_activity, the commands a person ran on a mission while their timer ran.
Read only, owner-or-manager visibility, company scoped. Disposable PostgreSQL checks; JWT shim only."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
ROOT=Path(__file__).resolve().parents[1]
from uuid import uuid4

DB='taskpulse_m110_test'
T2='10000000-0000-0000-0000-000000000002'  # assignee user 5; seed checklist C2

def uid_of(short):return '00000000-0000-0000-0000-'+short.zfill(12)
def first_json(lines):return json.loads(next(x for x in lines if x.startswith('{')))
def cl(cmd,payload,uid='5'):
    v=int(value(DB,f"lifecycle_version FROM public.tasks WHERE id='{T2}'"))
    return first_json(actor(DB,uid_of(uid),f"SELECT public.checklist_command('{T2}',{literal(cmd)},{literal(json.dumps(payload))}::jsonb,{v},'{uuid4()}')"))
def sessions(uid,task=T2,success=True):
    lines=actor(DB,uid_of(uid),f"SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') FROM public.timer_session_activity('{task}') s",success)
    if success:return json.loads(next(x for x in lines if x.startswith('[')))

sql('postgres',f'DROP DATABASE IF EXISTS {DB} WITH (FORCE);')
sql('postgres',f'CREATE DATABASE {DB}')
sql(DB,bootstrap)
for m in sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0])):
    sql(DB,m.read_text(encoding='utf-8'))
sql(DB,seed)
assert value(DB,"taskpulse_private.m15_secure()")=='0 tables and 0 functions moved to taskpulse_definer'
print('PASS',DB,'fresh install of every migration')

before=cl('add',{'title':'Before the timer','section':'activity'})['nodeId']
started=first_json(actor(DB,uid_of('5'),f"SELECT public.start_task_timer('{T2}','{{\"notes\":\"Drawings\"}}'::jsonb,'{uuid4()}')"))
row=cl('add',{'title':'Draw elevation','section':'activity'})['nodeId']
cl('state',{'node_id':row,'state':'Yes'})
cl('add',{'title':'By the director','section':'activity'},uid='1')  # someone else, same time
call(DB,'stop_task_timer',started['timerId'],{'notes':'Elevation drawn'},version=0,uid='5')
cl('add',{'title':'After the timer','section':'activity'})

mine=sessions('5')
assert len(mine)==1,mine
s=mine[0]
assert s['timer_id']==started['timerId'] and s['user_id']==uid_of('5') and s['notes']=='Elevation drawn',s
actions=[(e['action'],e['nodeTitle'],e['state']) for e in s['events']]
assert actions==[('checklist_add','Draw elevation',None),('checklist_state','Draw elevation','Yes')],actions
print('PASS',DB,'a session lists its owner\'s commands on the mission between start and stop, oldest first')

assert sessions('1')==mine
assert sessions('2')==mine
assert sessions('4')==[] and sessions('6')==[]
sessions('7',success=False)  # inactive
actor(DB,'',f"SELECT * FROM public.timer_session_activity('{T2}')",success=False)
print('PASS',DB,'managers read every session; other members only their own; inactive and anonymous callers refused')

# Discarded and running timers are not sessions; a removed row keeps its line without a title.
d=first_json(actor(DB,uid_of('5'),f"SELECT public.start_task_timer('{T2}','{{}}'::jsonb,'{uuid4()}')"))
call(DB,'discard_task_timer',d['timerId'],{'reason':'started by mistake'},version=0,uid='5')
first_json(actor(DB,uid_of('5'),f"SELECT public.start_task_timer('{T2}','{{}}'::jsonb,'{uuid4()}')"))
assert len(sessions('5'))==1
cl('delete',{'node_id':row,'reason':'redo'})
assert [e['nodeTitle'] for e in sessions('5')[0]['events']]==[None,None]
print('PASS',DB,'discarded and running timers are left out; removed rows keep their lines')

# Read only: nothing written by the read.
counts=value(DB,"(SELECT count(*) FROM taskpulse_private.audit_events)||':'||(SELECT count(*) FROM taskpulse_private.command_receipts)")
sessions('1'); assert value(DB,"(SELECT count(*) FROM taskpulse_private.audit_events)||':'||(SELECT count(*) FROM taskpulse_private.command_receipts)")==counts
assert value(DB,"provolatile FROM pg_proc WHERE proname='timer_session_activity'")=='s'
print('PASS',DB,'the read writes nothing (STABLE)')

# Migration 118: several mission timers at once; the day's hours merge overlaps.
T3='10000000-0000-0000-0000-000000000003'
sql(DB,f"INSERT INTO public.tasks(id,task_tag,title,assignee_id,task_scale) VALUES ('{T3}','T3','C','{uid_of('5')}',4)")
assert value(DB,"count(*) FROM pg_indexes WHERE indexname='idx_task_timers_one_running_per_user'")=='0'
# Member 5 still has the T2 timer started above running; a second mission starts beside it.
other=first_json(actor(DB,uid_of('5'),f"SELECT public.start_task_timer('{T3}','{{}}'::jsonb,'{uuid4()}')"))
assert value(DB,f"count(*) FROM public.task_timers WHERE user_id='{uid_of('5')}' AND status='Running'")=='2'
raw=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',DB,'-v','ON_ERROR_STOP=1','-At'],text=True,capture_output=True,
    input=f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{uid_of('5')}',true); SELECT public.start_task_timer('{T3}','{{}}'::jsonb,'{uuid4()}'); COMMIT;")
assert raw.returncode!=0 and 'idx_task_timers_one_running_per_mission' in raw.stderr,raw.stderr
print('PASS',DB,'two missions\' timers run at once; the same mission twice is refused')

# Offline spans on both missions yesterday, 09:00-13:00 and 11:00-14:00 India time.
day=value(DB,"((clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date-1)"); after=value(DB,f"'{day}'::date+1")
grant=sql(DB,f"INSERT INTO taskpulse_private.offline_grants(organization_id,user_id,issued_at) SELECT organization_id,id,clock_timestamp()-interval '60 hours' FROM public.users WHERE id='{uid_of('5')}' RETURNING id").splitlines()[0]
def offline(task,start,end):
    return first_json(actor(DB,uid_of('5'),f"SELECT public.record_offline_timer('{task}',NULL,({start})::timestamptz,({end})::timestamptz,'{grant}','{uuid4()}',NULL)"))
at=lambda hhmm:literal(f'{day}T{hhmm}:00+05:30')
offline(T2,at('09:00'),at('13:00')); offline(T3,at('11:00'),at('14:00'))
per_task=lambda t:float(value(DB,f"coalesce(sum(hours_worked),0) FROM public.daily_task_logs WHERE task_id='{t}' AND user_id='{uid_of('5')}' AND log_date='{day}' AND reversed_at IS NULL"))
assert per_task(T2)==4 and per_task(T3)==3,(per_task(T2),per_task(T3))
assert float(value(DB,f"taskpulse_private.member_day_hours('{uid_of('5')}','{day}')"))==5
print('PASS',DB,'each mission keeps its full time (4 h and 3 h); the day\'s hours merge to 5 h')

# Attendance validity uses the merged hours: 5 h fits a six-hour day, 7 h would not.
record(DB,'attendance',{'business_date':day,'author_id':uid_of('5'),'attendance_status':'Present','attendance_hours':'6','off_hours':'0',
    'check_in_at':day+'T09:00:00+05:30','check_out_at':day+'T15:00:00+05:30','reason':'Concurrent timers fixture'},uid='1')
ctx=context(DB,day,after,uid='5')
assert float(ctx['days'][0]['effortHours'])==5 and ctx['days'][0]['valid'] is True,ctx['days'][0]
facts=json.loads(next(x for x in actor(DB,uid_of('5'),f"SELECT public.policy_period_facts('{day}','{day}',NULL)") if x.startswith('{')))
assert any(float(d['loggedHours'])==5 for m in facts['members'] for d in m['days']),facts
print('PASS',DB,'attendance validity and policy facts count the merged 5 h')

# An offline span no longer has to wait for a server timer still running.
sql(DB,f"UPDATE public.task_timers SET started_at=clock_timestamp()-interval '20 minutes' WHERE id='{other['timerId']}'")
offline(T2,"clock_timestamp()-interval '15 minutes'","clock_timestamp()-interval '5 minutes'")
assert value(DB,f"status FROM public.task_timers WHERE id='{other['timerId']}'")=='Running'
print('PASS',DB,'offline spans are recorded beside running timers')

sql('postgres',f'DROP DATABASE IF EXISTS {DB} WITH (FORCE);')
print('ALL PASS timer session activity (migration 110) and concurrent timers (migration 118)')
