"""M04 real SQL tests: disposable loopback DBs, never .env or production."""
from pathlib import Path
# Reuse only the existing disposable harness setup/helpers, not its tests.
helpers=(Path(__file__).with_name('test_m03_database.py')).read_text(encoding='utf-8').split('for db in DBS:')[0]
exec(helpers.replace('taskpulse_m03_','taskpulse_m04_'))

def details(db,tid,cmd,payload,uid='2',success=True,version=None,key=None):
    if version is None: version=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{tid}'"))
    query='SELECT public.task_details_command('+','.join([literal(tid),literal(cmd),literal(json.dumps(payload))+'::jsonb',str(version),literal(key or uuid4())])+');'
    lines=actor(db,'00000000-0000-0000-0000-'+uid.zfill(12),query,success)
    if success:return json.loads(next(x for x in lines if x.startswith('{')))

def create(db,tag,auto=True,template=None,success=True,key=None):
    fields={'task_tag':tag,'title':'Native '+tag,'category':'T','priority':'Medium','task_scale':None,'due_date':None,'initialize_details':auto,'template_version_id':template,'description':'User description'}
    query='SELECT public.save_task_with_participants(NULL,'+literal(json.dumps(fields))+"::jsonb,ARRAY["+U4+"]::uuid[],ARRAY["+U6+"]::uuid[],NULL,NULL,false,"+literal(key or uuid4())+");"
    lines=actor(db,'00000000-0000-0000-0000-000000000002',query,success)
    if success:return next(x for x in reversed(lines) if re.fullmatch(r'[0-9a-f-]{36}',x))

def publish(db,tid=None,version=0,instruction='Describe the target',uid='2',success=True,key=None):
    payload={'instructions':{'smart_specific':instruction},'checklist_nodes':[{'key':'prep','section':'setup','node_type':'Item','title':'Prepare inputs'},{'key':'work','section':'activity','node_type':'Group','title':'Work'},{'key':'check','parent_key':'work','section':'activity','node_type':'Item','title':'Check work'},{'key':'close','section':'closure','node_type':'Item','title':'Deliver'}]}
    query='SELECT public.publish_task_detail_template('+','.join(['NULL' if tid is None else literal(tid),literal('Independent fixture template'),literal(json.dumps(payload))+'::jsonb',str(version),literal(key or uuid4())])+');'
    lines=actor(db,'00000000-0000-0000-0000-'+uid.zfill(12),query,success)
    if success:return json.loads(next(x for x in lines if x.startswith('{')))

for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);');sql('postgres',f'CREATE DATABASE {db};');sql(db,bootstrap)
    for migration in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        if int(migration.name.split('_')[0])>17:break
        if db==DBS[1] and migration.name.startswith('17_'):
            sql(db,seed)
            sql(db,f"INSERT INTO public.task_detail_sections(task_id,key_name,title,content) VALUES ('{task}','smart_goals','Goals','Free text goals without headings'),('{task}','inputs','Inputs','Existing input text'),('{task}','output_content','Output','Canonical output'),('{task}','outputs','Outputs','Conflicting old output'),('{task}','smart_specific','Specific','Existing specific'); INSERT INTO public.checklist_templates(name,description) VALUES('Existing native template','Original user guidance');")
            sql(db,r"INSERT INTO public.task_detail_sections(task_id,key_name,title,content) VALUES ('10000000-0000-0000-0000-000000000002','smart_goals','Goals',E'Specific\nMeasurable\nAchievable\nRelevant\nTime-Bound'),('10000000-0000-0000-0000-000000000002','inputs','Inputs',E'Document\nAccount\nFlowchart\nEngineering\nDrawing\nDependency Tasks');")
            preserved=json.loads(value(db,"jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.task_detail_sections s"))
            snapshot=value(db,'jsonb_agg(to_jsonb(s)) FROM public.monthly_performance_snapshots s')
        sql(db,migration.read_text(encoding='utf-8'))
    if db==DBS[0]:sql(db,seed)
    else:
        ids=','.join(literal(x['id']) for x in preserved)
        assert preserved==json.loads(value(db,f'jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.task_detail_sections s WHERE id IN ({ids})'))
        assert value(db,f"content FROM public.task_detail_sections WHERE task_id='{task}' AND key_name='input_content'")=='Existing input text'
        assert value(db,f"content FROM public.task_detail_sections WHERE task_id='{task}' AND key_name='output_content'")=='Canonical output'
        assert value(db,'count(*) FROM public.task_detail_review_flags WHERE reason IN (\'canonical_conflict\',\'ambiguous_legacy_text\')')=='2'
        assert snapshot==value(db,'jsonb_agg(to_jsonb(s)) FROM public.monthly_performance_snapshots s')
        assert value(db,"count(*) FROM public.task_detail_template_versions WHERE requires_review")=='1'
        assert value(db,"count(*) FROM public.task_detail_review_flags WHERE reason='legacy_instruction'")=='2'
        assert value(db,"count(*) FROM public.task_detail_sections WHERE task_id='10000000-0000-0000-0000-000000000002' AND key_name IN ('smart_specific','input_content')")=='0'
        existing_nodes=value(db,f"count(*) FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE c.task_id='{task}'")
        details(db,task,'initialize',{})
        assert value(db,f"content FROM public.task_detail_sections WHERE task_id='{task}' AND key_name='smart_specific'")=='Existing specific'
        assert existing_nodes==value(db,f"count(*) FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE c.task_id='{task}'")

    print('PASS',db,'fresh/upgrade and retained legacy originals, canonical conflicts, snapshots and template review')
    version=publish(db);v1=version['templateVersionId'];template=version['templateId']
    automatic=create(db,'AUTO',template=v1);manual=create(db,'MANUAL',False,template=v1)
    assert value(db,f"count(*) FROM public.task_detail_instances WHERE task_id='{manual}'")=='0'
    details(db,manual,'initialize',{})
    def normalized(tid):return json.loads(value(db,f"jsonb_build_object('fields',(SELECT jsonb_object_agg(key_name,content) FROM public.task_detail_sections WHERE task_id='{tid}'),'nodes',(SELECT jsonb_agg(jsonb_build_array(n.title,n.node_type,n.detail_section,n.is_complete) ORDER BY n.title) FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE c.task_id='{tid}'),'instructions',(SELECT instructions FROM public.task_detail_instances WHERE task_id='{tid}'))"))
    assert normalized(automatic)==normalized(manual)
    assert value(db,f"status='Not Started' AND NOT valid_for_metrics FROM public.tasks WHERE id='{automatic}'")=='t'
    assert value(db,f"initialization_state FROM public.task_checklists WHERE task_id='{automatic}'")=='incomplete'
    assert value(db,f"count(*) FROM public.task_detail_sections WHERE task_id='{automatic}' AND key_name='smart_specific' AND content IS NULL")=='1'
    values={'description':'D user text','smart_specific':'S user text','smart_measurable':'M user text','smart_achievable':'A user text','smart_relevant':'R user text','smart_time_bound':'T user text','input_content':'Input text','process_content':'Process text','output_content':'Output text','reviewer_notes':'Reviewer text'}
    details(db,automatic,'save',values)
    assert json.loads(value(db,f"jsonb_object_agg(key_name,content) FROM public.task_detail_sections WHERE task_id='{automatic}'"))==values
    original=normalized(automatic)
    details(db,automatic,'initialize',{})
    newer=publish(db,template,1,'New version instructions');assert newer['version']==2
    assert normalized(automatic)==original
    details(db,automatic,'initialize',{'template_version_id':newer['templateVersionId']},success=False)
    # A manual draft with no valid title is not initialized and requests no work.
    draft=create(db,'DRAFT',False);sql(db,f"UPDATE public.tasks SET title=' ' WHERE id='{draft}';")
    result=details(db,draft,'initialize',{});assert result['nativeState']=='draft'
    assert value(db,f"count(*) FROM public.task_detail_instances WHERE task_id='{draft}'")=='0'
    assert value(db,f"count(*) FROM taskpulse_private.outbox_jobs WHERE entity_id='{draft}' AND kind='native_details_initialized'")=='0'
    print('PASS',db,'all SMART/IPO fields; automatic/manual equivalence; Not Started/draft behavior; immutable independent instances')
    # Three link roles, actual relations and report visibility.
    for role in ('input','process','output'):
        details(db,automatic,'link',{'ipo_role':role,'link_type':'Document','label':role+' asset','url':'https://example.test/'+role})
    details(db,automatic,'link',{'ipo_role':'reference','link_type':'Other','label':'Employee','employee_id':user4})
    report=value(db,'id FROM public.report_snapshots LIMIT 1')
    details(db,automatic,'link',{'ipo_role':'reference','link_type':'Document','label':'Private report','report_id':report})
    visible=actor(db,user4,f"SELECT count(*) FROM public.task_links WHERE task_id='{automatic}' AND related_report_id IS NOT NULL;")
    assert '0' in visible
    assert '1' in actor(db,user5,f"SELECT count(*) FROM public.task_links WHERE task_id='{automatic}' AND related_report_id IS NOT NULL;")
    details(db,automatic,'relation',{'other_task_id':manual,'relation_type':'Carryover','notes':'Explicit relation'})
    assert value(db,f"count(*) FROM public.task_dependencies WHERE predecessor_task_id='{manual}' AND successor_task_id='{automatic}' AND relation_type='Carryover'")=='1'
    for uid in ('3','4','6','7','8'):
        details(db,automatic,'save',{'smart_specific':'Forbidden'},uid=uid,success=False)
        publish(db,template,2,uid=uid,success=False)
    check(db,'anonymous command denied',f"SELECT public.task_details_command('{automatic}','initialize','{{}}',0,'{uuid4()}');",uid='',role='anon',success=False)
    for table,statement in [('sections',f"UPDATE public.task_detail_sections SET content='Forged' WHERE task_id='{automatic}'"),('templates',"UPDATE public.task_detail_template_versions SET payload='{}'"),('links',f"UPDATE public.task_links SET ipo_role='output' WHERE task_id='{automatic}'")]:check(db,'direct '+table+' denied',statement,uid='2',success=False)
    domain(db,'transition',{'status':'Done'},tid=automatic,success=False)
    print('PASS',db,'asset roles/relationships/private report visibility; active structural permissions and Done guard')
    # Different keys and the same observed version converge to one manual instance.
    concurrent=create(db,'CONCURRENT',False,template=v1);observed=int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{concurrent}'"))
    with ThreadPoolExecutor(2) as pool:
        results=list(pool.map(lambda _:details(db,concurrent,'initialize',{},version=observed),range(2)))
    assert results[0]['templateVersionId']==results[1]['templateVersionId']==v1
    assert value(db,f"count(*) FROM public.task_detail_instances WHERE task_id='{concurrent}'")=='1'
    assert value(db,f"count(*) FROM public.task_checklists WHERE task_id='{concurrent}'")=='1'
    key=str(uuid4());result=details(db,concurrent,'initialize',{},version=observed,key=key)
    assert details(db,concurrent,'initialize',{},version=observed,key=key)==result
    # Mid-initialization failure must also undo an automatically created task.
    counts="jsonb_build_array((SELECT count(*) FROM public.tasks),(SELECT count(*) FROM public.task_detail_instances),(SELECT count(*) FROM public.task_detail_sections),(SELECT count(*) FROM public.task_checklists),(SELECT count(*) FROM public.checklist_nodes),(SELECT count(*) FROM taskpulse_private.audit_events),(SELECT count(*) FROM taskpulse_private.command_receipts),(SELECT count(*) FROM taskpulse_private.outbox_jobs))"
    before=value(db,counts)
    sql(db,"CREATE FUNCTION public.m04_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.title='Activity' THEN RAISE EXCEPTION 'Injected midway failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$; CREATE TRIGGER m04_fail BEFORE INSERT ON public.checklist_nodes FOR EACH ROW EXECUTE FUNCTION public.m04_fail();")
    create(db,'ROLLBACK',success=False)
    assert before==value(db,counts)
    sql(db,'DROP TRIGGER m04_fail ON public.checklist_nodes;DROP FUNCTION public.m04_fail();')
    assert value(db,"count(*) FROM taskpulse_private.outbox_jobs WHERE kind LIKE '%provider%' OR kind LIKE '%drive%'")=='0'
    # A normal structural save preserves edits and never reruns template population.
    pv=value(db,f"participant_version FROM public.tasks WHERE id='{automatic}'")
    fields={'task_tag':'AUTO','title':'Renamed entry','category':'T','priority':'Medium','due_date':None,'expected_lifecycle_version':int(value(db,f"lifecycle_version FROM public.tasks WHERE id='{automatic}'"))}
    actor(db,'00000000-0000-0000-0000-000000000002','SELECT public.save_task_with_participants('+literal(automatic)+','+literal(json.dumps(fields))+"::jsonb,ARRAY["+U4+"]::uuid[],ARRAY["+U6+"]::uuid[],NULL,"+pv+",false,"+literal(uuid4())+");")
    assert original==normalized(automatic)
    assert value(db,f"count(*) FROM taskpulse_private.outbox_jobs WHERE entity_id='{automatic}' AND kind='native_details_initialized'")=='1'
    # M03 approved scale-credit scope is unchanged after automatic initialization.
    order=create(db,'ORDER')
    domain(db,'transition',{'status':'In Progress'},uid='4',tid=order)
    domain(db,'scale',{'mode':'hours','inputs':{'multiplier':1},'reason':'Approved first log test','provenance':'Explicit user ordering decision'},uid='2',tid=order)
    day=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    call(db,'create_task_log',order,{'log_date':day,'hours_worked':1,'requested_delta':20})
    assert float(value(db,f"sum(scaled_credit) FROM taskpulse_private.task_credit_balances WHERE task_id='{order}'"))==2.5
    print('PASS',db,'concurrent/repeated initialization; complete midway rollback; zero provider requests; repeated save and M03 credit regression')
print('PASS M04 disposable PostgreSQL integration checks')
