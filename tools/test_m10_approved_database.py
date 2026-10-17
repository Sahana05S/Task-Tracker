"""Exact M10 follow-up approval in disposable loopback DBs; no Google calls.
Fresh01-27 and upgrade01-26->27, using the existing JWT-role test shim.
"""
from pathlib import Path
source=Path(__file__).with_name('test_m10_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m10_database.py')),'exec'))
DBS=('taskpulse_m10_approved_fresh_test','taskpulse_m10_approved_upgrade_test')
approved=json.loads((ROOT/'modules/drive/internal/approved-sandbox.json').read_text(encoding='utf-8'))
policy={**approved,'accountScope':'synthetic-only','organizationEmail':'synthetic@example.test','sharedDriveId':'synthetic_shared_drive','reviewerEmails':{'00000000-0000-0000-0000-000000000006':'reviewer@example.test'}}
for db in DBS:
    assert db in ('taskpulse_m10_approved_fresh_test','taskpulse_m10_approved_upgrade_test')
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);');sql('postgres',f'CREATE DATABASE {db}');sql(db,bootstrap)
    for m in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        if int(m.name.split('_')[0])>26:break
        sql(db,m.read_text(encoding='utf-8'))
    if db==DBS[1]:sql(db,seed)
    migration=(ROOT/'supabase/migrations/27_approved_drive_sandbox_boundary.sql').read_text(encoding='utf-8')
    if db==DBS[1]:
        # Reject rather than silently replace an incompatible old policy.
        sql(db,"UPDATE taskpulse_private.drive_configuration SET policy='{}'")
        sql(db,migration,False)
        assert value(db,'policy FROM taskpulse_private.drive_configuration')=='{}'
        sql(db,'UPDATE taskpulse_private.drive_configuration SET policy=NULL')
    sql(db,migration)
    if db==DBS[0]:sql(db,seed)
    assert value(db,'policy IS NULL FROM taskpulse_private.drive_configuration')=='t'
    frozen=value(db,'(SELECT jsonb_agg(to_jsonb(s)) FROM public.monthly_performance_snapshots s)')
    for changes in ({'rootId':'business_outside_root'},{'autoInitialize':True},{'templates':{'unauthorized':{}}},{'initializeTemplates':['unauthorized']},{'blankKinds':['document','sheet','slides','form']},{'roleFolders':{'input':['Input'],'process':['Business'],'output':['Output']}},{'reviewerSharing':'none'},{'checklistAuthority':'external'},{'auth':'organization_oauth'},{'scope':'drive.file'}):
        sql(db,'UPDATE taskpulse_private.drive_configuration SET policy='+literal(json.dumps({**policy,**changes}))+'::jsonb',False)
    sql(db,'UPDATE taskpulse_private.drive_configuration SET policy='+literal(json.dumps(policy))+'::jsonb')
    tid=new_task(db,'M10-APPROVED')
    assert value(db,'count(*) FROM taskpulse_private.drive_requests')=='0'
    request=drive(db,tid)
    assert drive(db,tid)['jobId']==request['jobId']
    for uid in ('3','4','6','7'):drive(db,tid,uid=uid,success=False)
    j=claim(db)[0]
    context=json.loads(next(x for x in worker(db,'drive_job_context',j) if x.startswith('{')))
    assert context['policy']==policy
    assert context['policy']['rootId']==approved['rootId']
    assert context['policy']['autoInitialize'] is False
    worker(db,'finish_drive_job',j,",'credentials_missing'")
    model=json.loads(next(x for x in actor(db,user4,'SELECT public.drive_read_model()') if x.startswith('{')))
    assert 'reviewer@example.test' not in json.dumps(model)
    assert model['jobs'][0]['errorCode']=='credentials_missing'
    assert frozen==value(db,'(SELECT jsonb_agg(to_jsonb(s)) FROM public.monthly_performance_snapshots s)')
    print('PASS',db,'root-only policy, no auto/templates/deferred kinds, exact scope/authority/sharing, manual replay, roles, safe read model and retained reports',flush=True)
print('M10 follow-up fresh/upgrade PostgreSQL checks passed. No provider operations or credential provisioning.',flush=True)
