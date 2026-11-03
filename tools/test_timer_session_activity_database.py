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

sql('postgres',f'DROP DATABASE IF EXISTS {DB} WITH (FORCE);')
print('ALL PASS timer session activity (migration 110)')
