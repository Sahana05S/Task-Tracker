"""Migration 43: removing a Sub-mission row. Disposable PostgreSQL checks; JWT shim only; no hosted connection."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_f3_fresh_test','taskpulse_f3_upgrade_test')
T1='10000000-0000-0000-0000-000000000001'

def uid_of(short):return '00000000-0000-0000-0000-'+short.zfill(12)
def version(db):return int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{T1}'"))
def cl(db,cmd,payload,uid='4',success=True,key=None,ver=None):
    q=f"SELECT public.checklist_command('{T1}',{literal(cmd)},{literal(json.dumps(payload))}::jsonb,{version(db) if ver is None else ver},'{key or uuid4()}')"
    lines=actor(db,uid_of(uid),q,success)
    if success:return json.loads(next(x for x in lines if x.startswith('{')))
def refused(db,uid,cmd,payload,codes,text=None):
    """The command fails as this user with one of the given SQLSTATEs (and message, if given)."""
    q=f"SELECT public.checklist_command('{T1}',{literal(cmd)},{literal(json.dumps(payload))}::jsonb,{version(db)},'{uuid4()}')"
    r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],
        input=f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{uid_of(uid)}',true);\n{q};\nCOMMIT;",
        text=True,capture_output=True,encoding='utf-8')
    assert r.returncode and any(c in r.stderr for c in codes),(cmd,r.stderr[:400])
    if text:assert text in r.stderr,r.stderr[:400]
    return r.stderr
def migrate(db,upto,start=1):
    for m in sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0])):
        n=int(m.name.split('_')[0])
        if n<start:continue
        if n>upto:break
        sql(db,m.read_text(encoding='utf-8'))
def submission(db,title,uid='4'):
    r=cl(db,'submission',{'title':title,'section':'activity'},uid=uid)
    return r['nodeId'],r['ownedChecklistId']
def counts(db,owned):
    return value(db,f"(SELECT count(*) FROM public.task_checklists WHERE id='{owned}')||'/'||(SELECT count(*) FROM public.checklist_sections WHERE checklist_id='{owned}')")
def state(db):
    return value(db,"(SELECT count(*) FROM public.task_checklists)||'/'||(SELECT count(*) FROM public.checklist_sections)||'/'||(SELECT count(*) FROM public.checklist_nodes)"
                    f"||'/'||(SELECT lifecycle_version FROM public.tasks WHERE id='{T1}')||'/'||(SELECT count(*) FROM taskpulse_private.command_receipts)||'/'||(SELECT count(*) FROM taskpulse_private.audit_events)")

for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    if db==DBS[1]:
        migrate(db,42); sql(db,seed)
        # Before 43 the delete fails at the foreign key and leaves everything in place.
        pre_node,pre_owned=submission(db,'Pre-43 empty')
        before=state(db)
        r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],
            input=f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{uid_of('4')}',true);\n"
                  f"SELECT public.checklist_command('{T1}','delete',{literal(json.dumps({'node_id':pre_node,'reason':'x'}))}::jsonb,{version(db)},'{uuid4()}');\nCOMMIT;",
            text=True,capture_output=True,encoding='utf-8')
        assert r.returncode and 'task_checklists_owner_node_id_fkey' in r.stderr,r.stderr[:300]
        assert state(db)==before
        print('PASS',db,'before 43, deleting a Sub-mission fails at task_checklists_owner_node_id_fkey and changes nothing')
        rows_before=value(db,"coalesce(jsonb_agg(to_jsonb(n) ORDER BY id),'[]') FROM public.checklist_nodes n")
        migrate(db,43,start=43)
        assert value(db,"coalesce(jsonb_agg(to_jsonb(n) ORDER BY id),'[]') FROM public.checklist_nodes n")==rows_before
        assert state(db)==before
        print('PASS',db,'upgrade 42->43 applies and leaves existing checklists, nodes, receipts and audit rows unchanged')
        # The Sub-mission created before the upgrade can now be removed.
        cl(db,'delete',{'node_id':pre_node,'reason':'made before 43'})
        assert counts(db,pre_owned)=='0/0' and value(db,f"count(*) FROM public.checklist_nodes WHERE id='{pre_node}'")=='0'
        print('PASS',db,'a Sub-mission created before 43 is removed after the upgrade')
    else:
        migrate(db,43); sql(db,seed)
        print('PASS',db,'fresh install 01-43')
    assert value(db,"taskpulse_private.m15_secure()")=='0 tables and 0 functions moved to taskpulse_definer'
    assert value(db,"pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.checklist_command(uuid,text,jsonb,bigint,uuid)'::regprocedure")=='taskpulse_definer'
    print('PASS',db,'checklist_command stays owned by taskpulse_definer; m15_secure has nothing left to move')

    # Authorized: the assignee removes an empty Sub-mission with a reason; owned checklist and sections go too.
    node,owned=submission(db,'Empty sub')
    assert counts(db,owned)=='1/3'
    v=version(db); key=str(uuid4())
    result=cl(db,'delete',{'node_id':node,'reason':'not needed'},key=key)
    assert counts(db,owned)=='0/0' and value(db,f"count(*) FROM public.checklist_nodes WHERE id='{node}'")=='0'
    assert result['version']>v and result['ownedChecklistId']==owned and result['nodeId']==node,result
    audit=json.loads(value(db,f"protected_changes FROM taskpulse_private.audit_events WHERE operation_id='{key}' AND command='checklist_delete'"))
    assert audit['reason']=='not needed' and audit['node_before']['id']==node and audit['node_before']['type']=='Page',audit
    # Idempotent replay returns the stored result; a reused key with other input is refused.
    replay=cl(db,'delete',{'node_id':node,'reason':'not needed'},key=key,ver=v)
    assert replay==result and version(db)==result['version']
    refused(db,'4','delete',{'node_id':node,'reason':'different'},('40001','PT409','23514'))
    print('PASS',db,'assignee removes an empty Sub-mission: owned checklist and its 3 sections deleted, version bumped, audited like a delete, replay idempotent')

    # A manager can remove one too.
    node,owned=submission(db,'Manager empty sub',uid='1')
    cl(db,'delete',{'node_id':node,'reason':'cleanup'},uid='2')
    assert counts(db,owned)=='0/0'
    print('PASS',db,'project engineer removes an empty Sub-mission')

    # Non-empty: an item in any section (including Setup/Closure) blocks removal with a clear message.
    for section in ('activity','setup','closure'):
        node,owned=submission(db,f'Busy sub {section}')
        cl(db,'add',{'checklist_id':owned,'title':'Inside','section':section,'node_type':'Item'})
        before=state(db)
        refused(db,'4','delete',{'node_id':node,'reason':'try'},('23514',),'Remove the items inside this Sub-mission first.')
        assert state(db)==before and counts(db,owned)=='1/3'
    print('PASS',db,'a Sub-mission with rows in Setup, Activity or Closure is refused ("Remove the items inside this Sub-mission first.") and nothing changes')

    # Emptying it first then allows removal.
    inner=value(db,f"id FROM public.checklist_nodes WHERE checklist_id='{owned}'")
    cl(db,'delete',{'checklist_id':owned,'node_id':inner,'reason':'empty it'})
    cl(db,'delete',{'node_id':node,'reason':'now empty'})
    assert counts(db,owned)=='0/0'
    print('PASS',db,'after its items are removed, the Sub-mission can be removed')

    # Nested: a Sub-mission inside a Sub-mission is removed from its own parent checklist.
    outer,outer_owned=submission(db,'Outer')
    r=cl(db,'submission',{'checklist_id':outer_owned,'title':'Inner','section':'activity'})
    refused(db,'4','delete',{'node_id':outer,'reason':'outer first'},('23514',),'Remove the items inside this Sub-mission first.')
    cl(db,'delete',{'checklist_id':outer_owned,'node_id':r['nodeId'],'reason':'inner'})
    assert counts(db,r['ownedChecklistId'])=='0/0'
    cl(db,'delete',{'node_id':outer,'reason':'outer'})
    assert counts(db,outer_owned)=='0/0'
    print('PASS',db,'nested Sub-missions: the outer is refused while the inner exists; inner then outer removed')

    # Reason is still required.
    node,owned=submission(db,'Reasonless')
    refused(db,'4','delete',{'node_id':node},('23514',),'with a reason')
    print('PASS',db,'a removal without a reason is refused')

    # Unauthorized (non-assignee member, reviewer, data manager) and inactive users are refused; nothing changes.
    before=state(db)
    for uid in ('5','6','3'):
        refused(db,uid,'delete',{'node_id':node,'reason':'not mine'},('42501',))
    refused(db,'7','delete',{'node_id':node,'reason':'inactive'},('42501',),'Active authenticated account required')
    assert state(db)==before and counts(db,owned)=='1/3'
    # Deactivate the actual assignee: refused at the write boundary. (The account
    # change itself may bump task versions/audit, so compare after it.)
    sql(db,f"UPDATE public.users SET is_active=false WHERE id='{uid_of('4')}'")
    before=state(db)
    refused(db,'4','delete',{'node_id':node,'reason':'deactivated'},('42501',),'Active authenticated account required')
    assert state(db)==before and counts(db,owned)=='1/3'
    sql(db,f"UPDATE public.users SET is_active=true WHERE id='{uid_of('4')}'")
    # Direct table deletes stay closed to signed-in users.
    actor(db,uid_of('4'),f"DELETE FROM public.task_checklists WHERE id='{owned}'",False)
    print('PASS',db,'non-assignee member, reviewer, data manager, inactive and deactivated users are refused; direct deletes stay closed')

    # Stale version and closed task keep their existing refusals.
    q=f"SELECT public.checklist_command('{T1}','delete',{literal(json.dumps({'node_id':node,'reason':'stale'}))}::jsonb,{version(db)-1},'{uuid4()}')"
    actor(db,uid_of('4'),q,False)
    assert counts(db,owned)=='1/3'
    print('PASS',db,'a stale version is refused')

    # Rollback: a failure after the owned checklist is deleted undoes the whole command.
    sql(db,f"""CREATE FUNCTION public.zz_f3_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF OLD.id='{node}' THEN RAISE EXCEPTION 'injected failure' USING ERRCODE='23514'; END IF; RETURN OLD; END $$;
      CREATE TRIGGER zz_f3_fail BEFORE DELETE ON public.checklist_nodes FOR EACH ROW EXECUTE FUNCTION public.zz_f3_fail();""")
    before=state(db)
    refused(db,'4','delete',{'node_id':node,'reason':'will fail'},('23514',),'injected failure')
    assert state(db)==before and counts(db,owned)=='1/3' and value(db,f"count(*) FROM public.checklist_nodes WHERE id='{node}'")=='1'
    sql(db,"DROP TRIGGER zz_f3_fail ON public.checklist_nodes; DROP FUNCTION public.zz_f3_fail();")
    cl(db,'delete',{'node_id':node,'reason':'after rollback'})
    assert counts(db,owned)=='0/0'
    print('PASS',db,'an injected failure after the owned checklist is deleted rolls back checklist, sections, node, version, receipt and audit')

    # Ordinary leaf deletes are unchanged.
    leaf=cl(db,'add',{'title':'Leaf','section':'activity','node_type':'Item'})['nodeId']
    cl(db,'delete',{'node_id':leaf,'reason':'leaf'})
    assert value(db,f"count(*) FROM public.checklist_nodes WHERE id='{leaf}'")=='0'
    print('PASS',db,'ordinary leaf delete unchanged')

    # Closed task: removal is refused until a manager reopens.
    node,owned=submission(db,'Closed sub')
    sql(db,f"UPDATE public.tasks SET status='Done' WHERE id='{T1}'")
    refused(db,'4','delete',{'node_id':node,'reason':'closed'},('23514',),'reopen')
    assert counts(db,owned)=='1/3'
    print('PASS',db,'removal on a closed mission is refused')
print('ALL F3 SUB-MISSION DELETE DATABASE CHECKS PASSED')
