"""Experience hierarchy/read contracts: disposable loopback PostgreSQL only. No native auth claim."""
from pathlib import Path
import json,subprocess
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
base=Path(__file__).with_name('test_m09_database.py')
exec(compile(base.read_text(encoding='utf-8').split('\nfor db in DBS:')[0],str(base),'exec'))
DBS=('taskpulse_experience_fresh_test','taskpulse_experience_upgrade_test')
DIR='00000000-0000-0000-0000-000000000001';MEM='00000000-0000-0000-0000-000000000004';INACTIVE='00000000-0000-0000-0000-000000000007'
def scalar(db,q):return sql(db,'SELECT '+q).splitlines()[0]
def result(rows):return json.loads(next(row for row in rows if row.startswith('{')))
def migrate(db,low,high):
 for p in sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0])):
  if low<=int(p.name.split('_')[0])<=high:sql(db,p.read_text(encoding='utf-8'))
def raw_actor(db,uid,statement):
 return subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],input=f"BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','{uid}',true);{statement};COMMIT;",text=True,capture_output=True,encoding='utf-8')
def denied(db,uid,statement,codes=('42501','23514','40001','23503','P0002')):
 r=raw_actor(db,uid,statement);assert r.returncode and any(code in r.stderr for code in codes),r.stderr
for db in DBS:
 assert db.startswith('taskpulse_experience_') and db.endswith('_test')
 sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE)');sql('postgres',f'CREATE DATABASE {db}');sql(db,bootstrap)
 if 'upgrade' in db:
  migrate(db,1,40);sql(db,seed)
  before=scalar(db,'count(*) FROM public.checklist_nodes')
  sql(db,"UPDATE public.task_reviewers SET review_approved=true")
  migrate(db,41,42)
  assert scalar(db,'count(*) FROM public.checklist_nodes')==before
  assert scalar(db,'bool_and(review_approved) FROM public.task_reviewers')=='t'
  print('PASS',db,'40->42 preserves existing nodes and review approvals',flush=True)
 else:migrate(db,1,42);sql(db,seed);print('PASS',db,'fresh01-42 plus legacy seed',flush=True)
 task=str(uuid4());ordinary=str(uuid4())
 sql(db,f"INSERT INTO public.tasks(id,task_tag,title,assignee_id,task_scale) VALUES('{task}','X-{str(uuid4())[:8]}','Experience fixture','{MEM}',8)")
 checklist=scalar(db,f"id FROM public.task_checklists WHERE task_id='{task}'") if scalar(db,f"count(*) FROM public.task_checklists WHERE task_id='{task}'")!='0' else sql(db,f"INSERT INTO public.task_checklists(task_id,title) VALUES('{task}','Master') RETURNING id").splitlines()[0]
 sql(db,f"INSERT INTO public.checklist_nodes(id,checklist_id,node_type,title) VALUES('{ordinary}','{checklist}','Item','Ordinary')")
 def statement(kind,payload,version=None,operation=None):
  if version is None:version=scalar(db,f"lifecycle_version FROM public.tasks WHERE id='{task}'")
  return f"SELECT public.checklist_command('{task}','{kind}','{json.dumps(payload)}'::jsonb,{version},'{operation or uuid4()}')"
 def command(kind,payload,uid=MEM):return result(actor(db,uid,statement(kind,payload)))
 version=scalar(db,f"lifecycle_version FROM public.tasks WHERE id='{task}'");op=str(uuid4())
 request=statement('submission',{'title':'Outer','section':'activity','priority':3},version,op)
 outer=result(actor(db,MEM,request));replay=result(actor(db,MEM,request));assert replay==outer
 inner=command('submission',{'title':'Inner','section':'activity','checklist_id':outer['ownedChecklistId']})
 leaf=command('add',{'title':'Leaf','section':'activity','node_type':'Item','checklist_id':inner['ownedChecklistId']})
 command('state',{'node_id':leaf['nodeId'],'state':'Yes','checklist_id':inner['ownedChecklistId']})
 branch=result(actor(db,MEM,f"SELECT public.checklist_branch('{task}','{inner['ownedChecklistId']}',NULL,'activity',0,1)"))
 assert len(branch['rows'])==1 and len(branch['ancestors'])==2
 assert branch['rows'][0]['progressPercentage']==100 and not branch['rollup']['isComplete']
 command('map',{'node_id':ordinary,'section':'activity','reason':'Fixture section'},DIR)
 for cid in [outer['ownedChecklistId'],inner['ownedChecklistId']]:
  for section in ['setup','closure']:command('section',{'checklist_id':cid,'section':section,'intentional_empty':True,'reason':'No fixture work'},DIR)
 branch=result(actor(db,MEM,f"SELECT public.checklist_branch('{task}',NULL,NULL,'activity',0,30)"))
 assert branch['rollup']['taskProgress']==50 and branch['rows'][0]['id']==outer['nodeId']
 assert scalar(db,f"count(*) FROM public.tasks WHERE id='{task}'")=='1'
 assert '0' in actor(db,MEM,f"SELECT public.checklist_item_seconds('{task}','{leaf['nodeId']}')")
 print('PASS',db,'recursive own checklists; replay; exact50 rollup; prominence only; gates; ancestry; no extra task',flush=True)
 denied(db,INACTIVE,statement('add',{'title':'Inactive','section':'activity','node_type':'Item'}))
 denied(db,'00000000-0000-0000-0000-000000000005',statement('add',{'title':'Unassigned','section':'activity','node_type':'Item'}))
 denied(db,MEM,f"SELECT public.checklist_item_seconds('10000000-0000-0000-0000-000000000002','{leaf['nodeId']}')")
 denied(db,INACTIVE,f"SELECT public.checklist_item_seconds('{task}','{leaf['nodeId']}')")
 # Another company's actor must not read either branch or selected item aggregate.
 org=str(uuid4());other=str(uuid4())
 sql(db,f"INSERT INTO public.organizations(id,name,slug) VALUES('{org}','Fixture company','fixture-{org[:8]}')")
 sql(db,f"INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES('{other}','{other}@example.test','{{\"organization_id\":\"{org}\"}}')")
 denied(db,other,f"SELECT public.checklist_branch('{task}',NULL,NULL,'activity',0,30)")
 denied(db,other,f"SELECT public.checklist_item_seconds('{task}','{leaf['nodeId']}')")
 print('PASS',db,'inactive/unassigned write denial, node-task mismatch and cross-company read denial',flush=True)
 version=scalar(db,f"lifecycle_version FROM public.tasks WHERE id='{task}'")
 requests=[statement('add',{'title':f'Concurrent{i}','section':'activity','node_type':'Item'},version) for i in range(2)]
 with ThreadPoolExecutor(max_workers=2) as pool:out=list(pool.map(lambda q:raw_actor(db,MEM,q),requests))
 assert sum(r.returncode==0 for r in out)==1 and any('40001' in r.stderr for r in out)
 print('PASS',db,'same-version concurrent commands commit once and conflict once',flush=True)
 before_hours=float(scalar(db,f"coalesce(sum(hours_worked),0) FROM public.daily_task_logs WHERE task_id='{task}' AND reversed_at IS NULL"))
 timer_key=str(uuid4());timer_query=f"SELECT public.start_checklist_item_timer('{leaf['nodeId']}','{{}}'::jsonb,'{timer_key}')"
 started=result(actor(db,MEM,timer_query));assert result(actor(db,MEM,timer_query))['timerId']==started['timerId']
 sql(db,f"UPDATE public.task_timers SET started_at=clock_timestamp()-interval '30 minutes' WHERE id='{started['timerId']}'")
 stop_key=str(uuid4());stopped=call(db,'stop_task_timer',started['timerId'],{'notes':'Recursive leaf work'},key=stop_key,version=0)
 assert call(db,'stop_task_timer',started['timerId'],{'notes':'Recursive leaf work'},key=stop_key,version=0)==stopped
 hours=float(scalar(db,f"sum(hours_worked) FROM public.daily_task_logs WHERE source_timer_id='{started['timerId']}'"))
 assert abs(hours-.5)<.02
 after_hours=float(scalar(db,f"sum(hours_worked) FROM public.daily_task_logs WHERE task_id='{task}' AND reversed_at IS NULL"))
 assert abs(after_hours-before_hours-hours)<1e-9
 assert scalar(db,f"bool_and(task_id='{task}' AND checklist_node_id='{leaf['nodeId']}') FROM public.daily_task_logs WHERE source_timer_id='{started['timerId']}'")=='t'
 aggregate=result(actor(db,MEM,f"SELECT jsonb_build_object('seconds',public.checklist_item_seconds('{task}','{leaf['nodeId']}'))"))
 assert abs(aggregate['seconds']-hours*3600)<1
 print('PASS',db,'nested leaf timer start/stop replay, ordinary root-task logs and exactly-once hours/item aggregate',flush=True)

 before=[scalar(db,f'count(*) FROM {t}') for t in ['public.checklist_nodes','public.task_checklists','taskpulse_private.command_receipts','taskpulse_private.audit_events']]
 sql(db,"CREATE FUNCTION public.experience_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.owner_node_id IS NOT NULL THEN RAISE EXCEPTION 'injected fixture failure';END IF;RETURN NEW;END $$;CREATE TRIGGER experience_fail AFTER INSERT ON public.task_checklists FOR EACH ROW EXECUTE FUNCTION public.experience_fail()")
 try:denied(db,MEM,statement('submission',{'title':'Rollback','section':'activity'}),('P0001',))
 finally:sql(db,'DROP TRIGGER experience_fail ON public.task_checklists;DROP FUNCTION public.experience_fail()')
 after=[scalar(db,f'count(*) FROM {t}') for t in ['public.checklist_nodes','public.task_checklists','taskpulse_private.command_receipts','taskpulse_private.audit_events']]
 assert before==after,(before,after)
 assert scalar(db,"bool_and(tgenabled='O') FROM pg_trigger WHERE tgname IN ('m03_invalidate_checklist_review','m03_invalidate_structure_review')")=='t'
 print('PASS',db,'injected failure rolls back nodes/checklists/receipts/audit and leaves triggers enabled',flush=True)
print('PASS experience database contracts; JWT shim only, no hosted/browser/capacity certification')
