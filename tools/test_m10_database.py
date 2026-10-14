"""Loopback disposable PostgreSQL tests; no .env reads or provider requests.
Reuses M09's JWT-role shim, which does not certify native GoTrue/PostgREST.
"""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
DBS=('taskpulse_m10_fresh_test','taskpulse_m10_upgrade_test')
policy={'id':'synthetic-m10-only','sandbox':True,'accountScope':'synthetic-account','auth':'organization_oauth','scope':'drive.file','organizationEmail':'synthetic@example.test','rootId':'synthetic_root','sharedDriveId':None,'employeeName':'[Employee ID]','taskName':'[Task Tag] - [Task Title]','roleFolders':{'input':['Input'],'process':['Process'],'output':['Output']},'templates':{},'initializeTemplates':[],'blankKinds':['document','sheet','slides'],'autoInitialize':False,'checklistAuthority':'native','reviewerSharing':'none','reviewerEmails':{}}
def drive(db,tid,command='initialize',payload=None,uid='1',success=True,key=None,version=None):
    if version is None:version=int(value(db,'lifecycle_version FROM public.tasks WHERE id='+literal(tid)))
    q='SELECT public.drive_command('+','.join((literal(tid),literal(command),literal(json.dumps(payload or {}))+'::jsonb',str(version),literal(key or uuid4())))+');'
    lines=actor(db,'00000000-0000-0000-0000-'+uid.zfill(12),q,success)
    if success:return json.loads(next(x for x in lines if x.startswith('{')))
def service(db,q,success=True):return actor(db,'',q,success,role='service_role')
def claim(db):return json.loads(next(x for x in service(db,'SELECT public.claim_drive_jobs(1)') if x.startswith('[')))
def worker(db,fn,j,args='',success=True):
    return service(db,'SELECT public.'+fn+'('+literal(j['id'])+','+literal(j['leaseToken'])+args+')',success)
for db in DBS:
    assert db in ('taskpulse_m10_fresh_test','taskpulse_m10_upgrade_test')
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);');sql('postgres',f'CREATE DATABASE {db}');sql(db,bootstrap)
    for m in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        if int(m.name.split('_')[0])>25:break
        sql(db,m.read_text(encoding='utf-8'))
    if db==DBS[1]:sql(db,seed)
    sql(db,(ROOT/'supabase/migrations/26_drive_outbox_and_verified_assets.sql').read_text(encoding='utf-8'))
    if db==DBS[0]:sql(db,seed)
    frozen=value(db,"(SELECT jsonb_agg(to_jsonb(s)) FROM public.monthly_performance_snapshots s)")
    policy['autoInitialize']=False
    tid=new_task(db,'M10-NATIVE')
    assert value(db,"count(*) FROM taskpulse_private.drive_requests")=='0'
    drive(db,tid,payload={'token':'synthetic-forbidden'},success=False)
    for uid in ('3','4','6','7'):drive(db,tid,uid=uid,success=False)
    check(db,'anonymous provider commands denied',"SELECT public.drive_command('"+tid+"','initialize','{}',0,gen_random_uuid())",uid='',role='anon',success=False)
    key=str(uuid4());r=drive(db,tid,key=key);assert drive(db,tid,key=key)==r
    drive(db,tid,command='blank',payload={'name':'x','fileKind':'document','ipoRole':'input'},key=key,success=False)
    assert value(db,"status FROM taskpulse_private.outbox_jobs WHERE id="+literal(r['jobId']))=='blocked'
    assert value(db,"provider_state FROM public.task_detail_instances WHERE task_id="+literal(tid))=='pending'
    assert value(db,"count(*) FROM public.task_detail_sections WHERE task_id="+literal(tid))!='0'
    sql(db,"UPDATE taskpulse_private.drive_configuration SET policy="+literal(json.dumps(policy))+'::jsonb')
    # A failing outbox request must roll back native initialization too.
    fields={'task_tag':'M10-ATOMIC','title':'Atomic fixture','category':'T','priority':'High','initialize_details':False}
    q='SELECT public.save_task_with_participants(NULL,'+literal(json.dumps(fields))+"::jsonb,ARRAY["+U4+"],ARRAY["+U6+"],ARRAY[1000000],NULL,false,"+literal(uuid4())+');'
    virgin=[x for x in actor(db,'00000000-0000-0000-0000-000000000001',q) if re.fullmatch(r'[a-f0-9-]{36}',x)][-1]
    assert value(db,"count(*) FROM public.task_detail_instances WHERE task_id="+literal(virgin))=='0'
    sql(db,"CREATE FUNCTION taskpulse_private.m10_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic failure' USING ERRCODE='23514';END $$; CREATE TRIGGER fixture_failure BEFORE INSERT ON taskpulse_private.drive_requests FOR EACH ROW EXECUTE FUNCTION taskpulse_private.m10_fixture_fail();")
    drive(db,virgin,success=False)
    assert value(db,"count(*) FROM public.task_detail_instances WHERE task_id="+literal(virgin))=='0'
    assert value(db,"count(*) FROM taskpulse_private.outbox_jobs WHERE kind='drive_operation' AND entity_id="+literal(virgin))=='0'
    sql(db,'DROP TRIGGER fixture_failure ON taskpulse_private.drive_requests;DROP FUNCTION taskpulse_private.m10_fixture_fail();')
    drive(db,virgin)
    assert value(db,"count(*) FROM public.task_detail_instances WHERE task_id="+literal(virgin))=='1'
    # Keep this independent queued fixture out of subsequent worker selection.
    sql(db,"UPDATE taskpulse_private.outbox_jobs SET status='blocked' WHERE entity_id="+literal(virgin)+" AND kind='drive_operation'")
    r=drive(db,tid);assert drive(db,tid)['jobId']==r['jobId']
    drive(db,tid,version=0,success=False)
    j=claim(db)[0];assert j['id']==r['jobId'];assert claim(db)==[]
    check(db,'ordinary actor cannot claim worker jobs','SELECT public.claim_drive_jobs(1)',uid='1',success=False)
    worker(db,'drive_job_context',{**j,'leaseToken':str(uuid4())},success=False)
    ctx=json.loads(next(x for x in worker(db,'drive_job_context',j) if x.startswith('{')));assert ctx['policy']==policy
    steps=[{'key':'task:'+tid,'owner':tid,'kind':'folder','name':'M10 folder','mimeType':'application/vnd.google-apps.folder','parent':'synthetic_root','ipoRole':'reference'}]
    worker(db,'drive_job_plan',j,','+literal(json.dumps(steps))+'::jsonb')
    worker(db,'drive_job_plan',j,",'[]'::jsonb",False)
    worker(db,'drive_asset_checkpoint',j,",'forged-other-task'",False)
    worker(db,'finish_drive_job',j,',NULL',False)
    state={'externalId':None,'reservedId':'synthetic_reserved','dispatched':True,'verified':None}
    worker(db,'drive_asset_checkpoint',j,','+literal(steps[0]['key'])+','+literal(json.dumps(state))+'::jsonb')
    file={'id':'synthetic_reserved','name':'M10 folder','mimeType':'application/vnd.google-apps.folder','parents':['synthetic_root'],'webViewLink':'https://drive.google.com/drive/folders/synthetic_reserved'}
    from hashlib import sha256
    file['appProperties']={'taskpulse':sha256((policy['accountScope']+'|'+steps[0]['key']).encode()).hexdigest()}
    state.update(externalId=file['id'],verified=file)
    worker(db,'drive_asset_checkpoint',j,','+literal(steps[0]['key'])+','+literal(json.dumps(state))+'::jsonb')
    forged={**state,'verified':{**file,'parents':['other_root']}}
    worker(db,'drive_asset_checkpoint',j,','+literal(steps[0]['key'])+','+literal(json.dumps(forged))+'::jsonb',False)
    worker(db,'finish_drive_job',j,',NULL')
    worker(db,'finish_drive_job',j,',NULL')
    worker(db,'finish_drive_job',j,",'quota_limited'",False)
    assert value(db,"label FROM public.task_links WHERE task_id="+literal(tid))=='M10 folder'
    link=value(db,"id FROM public.task_links WHERE task_id="+literal(tid))
    check(db,'legacy label-only rename cannot change provider asset',"SELECT public.task_details_command('"+tid+"','rename_link','{\"id\":\""+link+"\",\"label\":\"fake\"}',"+value(db,"lifecycle_version FROM public.tasks WHERE id="+literal(tid))+",gen_random_uuid())",uid='1',success=False)
    for role in ('authenticated','service_role'):check(db,'direct private asset write denied',"UPDATE taskpulse_private.drive_assets SET state='{}'",uid='1',role=role,success=False)
    # Concurrent claims acquire different jobs. Shared resource ownership is fenced.
    a=drive(db,tid,'blank',{'name':'first','fileKind':'document','ipoRole':'input'})
    b=drive(db,tid,'blank',{'name':'second','fileKind':'document','ipoRole':'input'})
    with ThreadPoolExecutor(2) as pool:claims=list(pool.map(lambda _:claim(db),range(2)))
    leases=[item[0] for item in claims];assert len({x['id'] for x in leases})==2
    for lease in leases:worker(db,'drive_job_plan',lease,','+literal(json.dumps(steps))+'::jsonb')
    worker(db,'drive_asset_checkpoint',leases[0],','+literal(steps[0]['key']))
    worker(db,'drive_asset_checkpoint',leases[1],','+literal(steps[0]['key']),False)
    worker(db,'finish_drive_job',leases[0],",'quota_limited'")
    worker(db,'drive_asset_checkpoint',leases[1],','+literal(steps[0]['key']))
    worker(db,'finish_drive_job',leases[1],",'credentials_revoked'")
    # Auto and manual share one stable initialization request; native paths stay ready.
    policy['autoInitialize']=True;sql(db,"UPDATE taskpulse_private.drive_configuration SET policy="+literal(json.dumps(policy))+'::jsonb')
    auto=new_task(db,'M10-AUTO');count=value(db,"count(*) FROM taskpulse_private.drive_requests WHERE task_id="+literal(auto));assert count=='1'
    drive(db,auto);assert value(db,"count(*) FROM taskpulse_private.drive_requests WHERE task_id="+literal(auto))==count
    # Archived task cannot queue/rename or complete provider mutations.
    pending=claim(db)[0]
    sql(db,"UPDATE public.tasks SET archived_effective_date=CURRENT_DATE,archive_reason='synthetic retained archive' WHERE id="+literal(auto))
    drive(db,auto,success=False);worker(db,'drive_job_context',pending,success=False)
    worker(db,'finish_drive_job',pending,",'task_archived'")
    assert frozen==value(db,"(SELECT jsonb_agg(to_jsonb(s)) FROM public.monthly_performance_snapshots s)")
    print('PASS',db,'fresh/upgrade, roles, replay, atomic native/outbox, fencing, verified labels, partial failures, auto/manual, archive and frozen reports')
print('M10 disposable PostgreSQL checks passed; no real Google calls were made.')
