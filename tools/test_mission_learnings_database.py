"""Notes on the mission page: migration 111 (public.mission_learnings) and migration 126 (Notes with hashtags).
Fresh install 01-latest and upgrade (Mistakes and learning notes written at 125, then 126 moves them into Notes),
no direct table access, starter hashtags once per company, type hashtags set by managers, mission_note_command
(add / edit / delete with several hashtags, a type hashtag required, notes on a Quest), mission_notes(task)
privacy (can_read_mission_work), the Missions filter read, labelled(), the activity lines, the old command as a
wrapper, archived missions and company separation. Disposable PostgreSQL; JWT shim only; no hosted connection."""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))
from uuid import uuid4

DBS=('taskpulse_notes_fresh_test','taskpulse_notes_upgrade_test')
U=lambda n:'00000000-0000-0000-0000-'+str(n).zfill(12)
MD,PE,DM,M4,M5,M6,INACTIVE=U(1),U(2),U(3),U(4),U(5),U(6),U(7)
B_DIR='00000000-0000-0000-0000-0000000000b1'
T1,T2='10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002'
QUEST,QUEST_LIST,OBJECTIVE,OTHER_NODE=('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000009',
 '30000000-0000-0000-0000-000000000009','30000000-0000-0000-0000-000000000002')
MIGRATIONS=sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0]))
LATEST=int(MIGRATIONS[-1].name.split('_')[0])
CMD='public.mission_note_command(text,uuid,uuid,uuid,text,uuid[],text[],uuid)'
STARTERS=['mistake','learning','idea','decision','risk','blocker','followup','client','vendor','approval','government',
 'site','design','drawing','estimate','payment','documentation','communication','delay','rework','missinginfo','quality',
 'budget','critical','minor','repeat']
TYPES=['blocker','decision','followup','idea','learning','mistake','risk']

def migrate(db,numbers):
    out=[]
    for m in MIGRATIONS:
        if int(m.name.split('_')[0]) in numbers:out.append(sql(db,m.read_text(encoding='utf-8')))
    return out
def run(db,uid,statement):
    role='anon' if uid is None else 'authenticated'
    return subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],
        input=f"BEGIN; SET LOCAL ROLE {role}; SELECT set_config('request.jwt.claim.sub','{uid or ''}',true);\n{statement.rstrip(';')};\nCOMMIT;",
        text=True,capture_output=True,encoding='utf-8')
def ok(db,uid,statement):
    r=run(db,uid,statement)
    assert r.returncode==0,(statement[:300],r.stderr[:800])
    return [x for x in r.stdout.splitlines() if x and x not in ('BEGIN','COMMIT','SET')][-1]
def expect_code(db,uid,statement,code):
    r=run(db,uid,statement)
    assert r.returncode and code in r.stderr,(statement[:300],r.stderr[:800])
def arr(values,kind):
    return 'NULL' if values is None else ('ARRAY['+','.join(literal(v) for v in values)+f']::{kind}[]' if values else f"'{{}}'::{kind}[]")
def note_sql(op,task=T1,note=None,node=None,body='Check the soil report first',labels=None,names=('learning',),operation=None):
    q=lambda v:'NULL' if v is None else literal(v)
    return (f"SELECT public.mission_note_command({literal(op)},'{task}',{q(note)}::uuid,{q(node)}::uuid,{q(body)},"
            f"{arr(labels,'uuid')},{arr(None if names is None else list(names),'text')},'{operation or uuid4()}')")
def old_sql(op,task=T1,learning=None,kind='learning',body='Old style note'):
    q=lambda v:'NULL' if v is None else literal(v)
    return f"SELECT public.mission_learning_command('{op}','{task}',{q(learning)}::uuid,{q(kind)},{q(body)},'{uuid4()}')"
def add(db,uid,**kw):return json.loads(ok(db,uid,note_sql('add',**kw)))['id']
def notes(db,uid,task=T1):return json.loads(ok(db,uid,f"SELECT public.mission_notes('{task}')"))
def by_id(db,uid,task=T1):return {i['id']:i for i in notes(db,uid,task)['items']}
def slugs(item):return [l['slug'] for l in item['labels']]
def rows(db):return value(db,"count(*) FROM public.mission_learnings WHERE record_state='active'")
def label_id(db,slug):return value(db,f"id FROM public.labels WHERE slug='{slug}' AND organization_id=(SELECT organization_id FROM public.tasks WHERE id='{T1}')")

assert LATEST>=126
for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    # Notes are exercised up to 128; 129 removes them (checked at the end).
    every=[int(m.name.split('_')[0]) for m in MIGRATIONS if int(m.name.split('_')[0])<=128]
    later=[int(m.name.split('_')[0]) for m in MIGRATIONS if int(m.name.split('_')[0])>128]
    old={}
    if db==DBS[1]:
        migrate(db,[n for n in every if n<111]); sql(db,seed)
        migrate(db,[n for n in every if 111<=n<126])
        # Mistakes and learning as they were before 126, one with a label and one withdrawn.
        old['mistake']=json.loads(ok(db,M4,old_sql('add',kind='mistake',body='Ordered the wrong cable')))['id']
        old['learning']=json.loads(ok(db,MD,old_sql('add',kind='learning',body='Book the crane a week ahead')))['id']
        old['gone']=json.loads(ok(db,M4,old_sql('add',kind='learning',body='Withdrawn later')))['id']
        ok(db,M4,old_sql('withdraw',learning=old['gone'],kind=None,body=None))
        crane=json.loads(ok(db,MD,f"SELECT public.label_command('create',NULL,'Crane',NULL,NULL,'{uuid4()}')"))['id']
        ok(db,MD,f"SELECT public.label_link_command('attach','mission_learning','{old['learning']}','{crane}',NULL,'{uuid4()}')")
        before=value(db,"jsonb_agg(jsonb_build_array(id,author_id,body,created_at,record_state) ORDER BY id) FROM public.mission_learnings")
        migrate(db,[n for n in every if n>=126])
        assert value(db,"jsonb_agg(jsonb_build_array(id,author_id,body,created_at,record_state) ORDER BY id) FROM public.mission_learnings")==before
        items=by_id(db,M4)
        assert set(items)=={old['mistake'],old['learning']},items
        assert slugs(items[old['mistake']])==['mistake'] and slugs(items[old['learning']])==['learning','crane'],items
        assert items[old['mistake']]['authorName'] and items[old['mistake']]['body']=='Ordered the wrong cable'
        assert value(db,f"count(*) FROM public.label_links k JOIN public.labels l ON l.id=k.label_id WHERE k.subject_id='{old['gone']}' AND l.slug='learning'")=='1'
        print('PASS',db,'upgrade to 126 moves every old note into Notes with #mistake or #learning, keeping author, date, text and labels; nothing is deleted')
    else:
        migrate(db,every); sql(db,seed)
        print('PASS',db,f'fresh install 01-{LATEST} including 111 and 126')

    # ---- ownership and grants -------------------------------------------------------------------------------
    assert value(db,"taskpulse_private.m15_secure()")=='0 tables and 0 functions moved to taskpulse_definer'
    assert value(db,"pg_get_userbyid(relowner)||relforcerowsecurity FROM pg_class WHERE oid='public.mission_learnings'::regclass")=='taskpulse_definertrue'
    for fn in (CMD,'public.mission_notes(uuid)','public.mission_note_hashtags(uuid[])'):
        assert value(db,f"has_function_privilege('authenticated','{fn}','EXECUTE') AND NOT has_function_privilege('anon','{fn}','EXECUTE')")=='t',fn
    for uid in (MD,M4):
        expect_code(db,uid,'SELECT count(*) FROM public.mission_learnings','42501')
    print('PASS',db,'the table is definer-owned with FORCE RLS and no direct access; the commands are for signed-in users only')

    # ---- starter hashtags: once per company -------------------------------------------------------------------
    if db==DBS[0]:
        # Fresh install: the company had no members when 126 ran; its first note brings the starters.
        assert value(db,"count(*) FROM public.labels")=='0'
    first=add(db,M4,names=['#mistake','client','#Delay'],body='  Sent the old drawing to the client  ')
    org=f"(SELECT organization_id FROM public.tasks WHERE id='{T1}')"
    assert value(db,f"string_agg(slug,',' ORDER BY slug) FROM public.labels WHERE organization_id={org} AND slug=ANY(ARRAY{STARTERS})")==','.join(sorted(STARTERS))
    assert value(db,f"string_agg(slug,',' ORDER BY slug) FROM public.labels WHERE organization_id={org} AND note_type")==','.join(TYPES)
    assert value(db,f"taskpulse_private.note_starter_hashtags({org},'{MD}')")=='0'
    assert value(db,f"count(*) FROM public.labels WHERE organization_id={org} AND slug=ANY(ARRAY{STARTERS})")==str(len(STARTERS))
    print('PASS',db,'the 26 starter hashtags exist once per company, seven of them note types; seeding again adds nothing')

    # ---- adding notes with several hashtags ----------------------------------------------------------------------
    item=by_id(db,M6)[first]
    assert item['body']=='Sent the old drawing to the client' and slugs(item)==['mistake','client','delay'],item
    assert item['labels'][0]['noteType'] is True and item['labels'][1]['noteType'] is False
    assert item['nodeId'] is None and item['canEdit'] is False and item['canDelete'] is False
    mine=by_id(db,M4)[first]; assert mine['canEdit'] and mine['canDelete']
    assert by_id(db,MD)[first]['canDelete'] and not by_id(db,MD)[first]['canEdit']
    two=add(db,MD,labels=[label_id(db,'decision'),label_id(db,'decision')],names=['#site','new crane hire'],body='Use the north gate')
    assert slugs(by_id(db,M4)[two])==['decision','new-crane-hire','site']
    print('PASS',db,'a note takes several hashtags by id or by #name, without duplicates, type hashtags first; a manager may create one on the way')

    # ---- a type hashtag is required ------------------------------------------------------------------------------
    before=rows(db)
    expect_code(db,M4,note_sql('add',names=['client']),'23514')
    expect_code(db,M4,note_sql('add',names=[]),'23514')
    expect_code(db,M4,note_sql('add',names=None),'23514')
    expect_code(db,M4,note_sql('add',names=['learning'],body='   '),'23514')
    expect_code(db,M4,note_sql('add',names=['learning'],body='x'*2001),'23514')
    expect_code(db,M4,note_sql('add',names=['learning','brand new tag']),'42501')
    expect_code(db,M4,note_sql('add',labels=[str(uuid4())]),'P0002')
    expect_code(db,M4,note_sql('remove'),'23514')
    assert rows(db)==before
    # ... and stays: removing a note's last type hashtag is refused.
    expect_code(db,M4,f"SELECT public.label_link_command('detach','mission_learning','{first}','{label_id(db,'mistake')}',NULL,'{uuid4()}')",'23514')
    assert slugs(by_id(db,M4)[first])==['mistake','client','delay']
    print('PASS',db,'a note without a type hashtag, a blank or long text, an unknown hashtag or operation are refused; the last type hashtag cannot be removed')

    # ---- managers set the type list --------------------------------------------------------------------------------
    for uid in (M4,DM):expect_code(db,uid,f"SELECT public.label_command('note_type_on','{label_id(db,'client')}',NULL,NULL,NULL,'{uuid4()}')",'42501')
    ok(db,PE,f"SELECT public.label_command('note_type_on','{label_id(db,'client')}',NULL,NULL,NULL,'{uuid4()}')")
    client_only=add(db,M4,names=['client'],body='Client prefers calls')
    ok(db,MD,f"SELECT public.label_command('note_type_off','{label_id(db,'client')}',NULL,NULL,NULL,'{uuid4()}')")
    expect_code(db,M4,note_sql('add',names=['client']),'23514')
    assert json.loads(ok(db,M4,"SELECT public.label_catalogue()"))['labels'][0].get('noteType') is not None
    print('PASS',db,'only managers change which hashtags are note types; the rule follows the current list')

    # ---- who may read ----------------------------------------------------------------------------------------------
    sql(db,f"INSERT INTO public.task_reviewers(task_id,user_id,reviewer_role,is_primary) VALUES('{T1}','{PE}','Observer',false)")
    for uid in (MD,PE,M4,M6):assert first in by_id(db,uid)
    for uid in (DM,M5,INACTIVE,None):expect_code(db,uid,f"SELECT public.mission_notes('{T1}')",'42501')
    expect_code(db,M5,note_sql('add'),'42501')
    expect_code(db,M5,note_sql('delete',note=first,names=None),'42501')
    assert notes(db,M5,T2)=={'canAdd':True,'items':[]}
    assert notes(db,M4)['canAdd'] and not notes(db,M6)['canAdd']
    hashtags=f"SELECT public.mission_note_hashtags(ARRAY['{T1}','{T2}']::uuid[])"
    expected={'mistake','client','delay','decision','new-crane-hire','site'}|({'learning','crane'} if old else set())
    assert set(json.loads(ok(db,M4,hashtags))[T1])==expected
    assert json.loads(ok(db,M5,hashtags))=={}
    got=json.loads(ok(db,M6,"SELECT public.labelled('delay')"))['items']
    assert [(i['kind'],i['taskId'],i['nodeId']) for i in got]==[('mission_learning',T1,None)],got
    assert json.loads(ok(db,M5,"SELECT public.labelled('delay')"))['items']==[]
    print('PASS',db,"only the mission's people read its notes, their hashtags (Missions filter) and their label-page entries; strangers are refused")

    # ---- notes on a Quest and an objective ---------------------------------------------------------------------------
    sql(db,f"""SET session_replication_role=replica;
      UPDATE public.checklist_nodes SET node_type='Page',title='Foundation' WHERE id='{QUEST}';
      INSERT INTO public.task_checklists(id,organization_id,task_id,title,owner_node_id)
       SELECT '{QUEST_LIST}',organization_id,id,'Foundation','{QUEST}' FROM public.tasks WHERE id='{T1}';
      INSERT INTO public.checklist_nodes(id,organization_id,checklist_id,node_type,title)
       SELECT '{OBJECTIVE}',organization_id,'{QUEST_LIST}','Item','Pour the slab' FROM public.task_checklists WHERE id='{QUEST_LIST}';""")
    on_quest=add(db,M4,node=QUEST,names=['risk','site'],body='Rain forecast for the pour')
    on_objective=add(db,M4,node=OBJECTIVE,names=['followup'],body='Order curing compound')
    expect_code(db,M4,note_sql('add',node=OTHER_NODE),'23514')
    items=by_id(db,MD)
    assert (items[on_quest]['nodeId'],items[on_quest]['nodeKind'],items[on_quest]['nodeTitle'])==(QUEST,'quest','Foundation'),items[on_quest]
    assert (items[on_objective]['nodeKind'],items[on_objective]['nodeTitle'])==('objective','Pour the slab')
    assert [i['id'] for i in notes(db,MD)['items']][:2]==[on_objective,on_quest],'newest first'
    assert [i['nodeId'] for i in json.loads(ok(db,M4,"SELECT public.labelled('risk')"))['items']]==[QUEST]
    print('PASS',db,"notes on a Quest and an objective show on the mission page with where they came from; another mission's row is refused")

    # ---- edit and delete ------------------------------------------------------------------------------------------------
    op=uuid4()
    edit=note_sql('edit',note=first,names=['learning','client'],body='Send drawings from the register only',operation=op)
    assert json.loads(ok(db,M4,edit))=={'id':first,'state':'active'}
    assert json.loads(ok(db,M4,edit))=={'id':first,'state':'active'},'replay returns the receipt'
    expect_code(db,M4,note_sql('edit',note=first,names=['learning'],body='Other',operation=op),'PT409')
    item=by_id(db,M6)[first]
    assert (item['body'],slugs(item),item['edited'])==('Send drawings from the register only',['learning','client'],True)
    expect_code(db,MD,note_sql('edit',note=first,names=['learning']),'P0002')  # managers delete, they do not rewrite
    expect_code(db,M6,note_sql('delete',note=first,names=None),'P0002')
    expect_code(db,M4,note_sql('delete',note=two,names=None),'P0002')
    ok(db,MD,note_sql('delete',note=on_objective,names=None))
    ok(db,M4,note_sql('delete',note=client_only,names=None))
    assert on_objective not in by_id(db,M4) and value(db,f"record_state FROM public.mission_learnings WHERE id='{on_objective}'")=='withdrawn'
    assert on_objective not in json.loads(ok(db,MD,f"SELECT public.labels_for('mission_learning',ARRAY['{on_objective}']::uuid[])"))
    expect_code(db,M4,note_sql('edit',note=on_objective,names=['learning']),'P0002')
    print('PASS',db,'the author edits; the author or a manager deletes; replay, reuse, other notes and deleted notes behave')

    # ---- activity lines --------------------------------------------------------------------------------------------------
    reasons=value(db,"string_agg(command||'|'||coalesce(protected_changes->>'reason','')||'|'||coalesce(protected_changes->>'node_title',''),';' ORDER BY id) FROM taskpulse_private.audit_events WHERE table_name='mission_learnings' AND command LIKE 'mission_note_%'")
    assert 'mission_note_add|#mistake #client #delay|' in reasons and 'mission_note_add|#risk #site|Foundation' in reasons,reasons
    assert 'mission_note_edit|#learning #client|' in reasons and 'mission_note_delete|#followup|Pour the slab' in reasons,reasons
    assert value(db,"count(*) FROM taskpulse_private.audit_events WHERE table_name='mission_learnings' AND protected_changes::text LIKE '%drawing%'")=='0'
    today=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    feed=f"SELECT string_agg(action||':'||coalesce(task_tag,'-')||':'||coalesce(reason,''),',') FROM public.activity_feed('{today}','{today}','missions',NULL,NULL,200) WHERE record_kind='mission_learnings'"
    assert 'mission_note_add:T1:#mistake #client #delay' in ok(db,MD,feed)
    r=run(db,M5,feed); assert r.returncode==0 and 'mission_note_' not in r.stdout
    history=ok(db,M4,f"SELECT string_agg(action||':'||coalesce(detail,'')||':'||coalesce(reason,''),',') FROM public.mission_activity('{T1}',NULL,200) WHERE record_kind='mission_learnings'")
    assert 'mission_note_add:Foundation:#risk #site' in history and 'mission_note_edit::#learning #client' in history,history
    print('PASS',db,'each change is one audit line with its hashtags (never the text), in Team > Activity and the mission History')

    # ---- the old command still works -----------------------------------------------------------------------------------
    legacy=json.loads(ok(db,M4,old_sql('add',kind='mistake',body='Old screen note')))['id']
    assert slugs(by_id(db,M4)[legacy])==['mistake']
    ok(db,M4,old_sql('edit',learning=legacy,kind='learning',body='Old screen note, edited'))
    assert slugs(by_id(db,M4)[legacy])==['learning','mistake']
    expect_code(db,M4,old_sql('add',kind='idea'),'23514')
    ok(db,M4,old_sql('withdraw',learning=legacy,kind=None,body=None))
    assert legacy not in by_id(db,M4)
    print('PASS',db,'mission_learning_command keeps working during the deploy and writes a typed note')

    # ---- archived mission is read-only ---------------------------------------------------------------------------------
    sql(db,f"SET session_replication_role=replica; UPDATE public.tasks SET archived_effective_date=current_date WHERE id='{T1}';")
    r=notes(db,M4); assert r['canAdd'] is False and not any(i['canEdit'] or i['canDelete'] for i in r['items'])
    expect_code(db,MD,note_sql('add'),'23514')
    expect_code(db,M4,note_sql('delete',note=first,names=None),'23514')
    sql(db,f"SET session_replication_role=replica; UPDATE public.tasks SET archived_effective_date=NULL WHERE id='{T1}';")
    print('PASS',db,'an archived mission keeps its notes read-only')

    # ---- company separation -------------------------------------------------------------------------------------------
    sql(db,"INSERT INTO public.organizations(name,slug) VALUES('Beta Builders','beta')")
    B=value(db,"id FROM public.organizations WHERE slug='beta'")
    sql(db,f"""INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
      ('{B_DIR}','bdir@beta.test','{{"employee_id":"BETA-1"}}','{{"organization_id":"{B}"}}')""")
    sql(db,f"UPDATE public.users SET role='managing_director' WHERE id='{B_DIR}'")
    before=rows(db)
    expect_code(db,B_DIR,f"SELECT public.mission_notes('{T1}')",'P0002')
    expect_code(db,B_DIR,note_sql('add'),'P0002')
    expect_code(db,B_DIR,note_sql('delete',note=two,names=None),'P0002')
    assert json.loads(ok(db,B_DIR,hashtags))=={} and rows(db)==before
    print('PASS',db,"company B's director can neither read nor change company A's notes")

    if later:
        # 129 (user decision, 6 November 2026): no notes at all; notes and the starter hashtags are deleted.
        custom=value(db,"count(*) FROM public.labels WHERE NOT slug=ANY(ARRAY["+','.join(literal(x) for x in STARTERS)+"])")
        migrate(db,[n for n in later if n<132])
        assert value(db,'count(*) FROM public.mission_learnings')=='0'
        assert value(db,"count(*) FROM public.label_links WHERE subject_kind='mission_learning'")=='0'
        assert value(db,"count(*) FROM public.labels WHERE slug=ANY(ARRAY["+','.join(literal(x) for x in STARTERS)+"])")=='0'
        assert value(db,"count(*) FROM public.labels WHERE NOT slug=ANY(ARRAY["+','.join(literal(x) for x in STARTERS)+"])")==custom,'labels the company made stay'
        expect_code(db,M4,note_sql('add',names=None),'42501')
        expect_code(db,MD,old_sql('add'),'42501')
        assert notes(db,M4)['items']==[]
        print('PASS',db,'129: every note and starter hashtag is gone, the company\'s own labels stay, and no one can write a note')

    if [n for n in later if n>=132]:
        # 132 (user request, 6 November 2026): Quest notes with ordinary labels.
        migrate(db,[n for n in later if n>=132])
        made=lambda name:json.loads(ok(db,MD,f"SELECT public.label_command('create',NULL,{literal(name)},NULL,NULL,'{uuid4()}')"))['id']
        made('mistake'); made('client')
        quest_notes=lambda uid:json.loads(ok(db,uid,f"SELECT public.quest_notes('{QUEST}')"))
        first=add(db,M4,node=QUEST,names=['mistake'],body='Ordered the wrong steel grade')
        second=add(db,M4,node=QUEST,names=['mistake','client'],body='Client changed the slab size late')
        third=add(db,MD,node=QUEST,names=['client'],body='No type label needed')
        seen=quest_notes(M4)
        assert [i['id'] for i in seen['items']]==[third,second,first] and seen['canAdd'] is True and seen['questTitle']=='Foundation'
        assert [l['slug'] for l in seen['items'][1]['labels']]==['client','mistake']
        assert json.loads(ok(db,M4,f"SELECT public.quest_note_counts('{T1}')"))=={QUEST:3}
        print('PASS',db,'132: several notes per Quest, newest first, with one or more ordinary labels and no type label')
        expect_code(db,M4,note_sql('add',node=QUEST,names=None),'23514')                     # no label
        expect_code(db,M4,note_sql('add',node=QUEST,names=['brandnew']),'42501')              # a member cannot create a label
        expect_code(db,M4,note_sql('add',node=OBJECTIVE,names=['mistake']),'23514')           # notes go on a Quest
        expect_code(db,M4,note_sql('add',node=None,names=['mistake']),'23514')
        expect_code(db,M5,note_sql('add',node=QUEST,names=['mistake']),'42501')               # not on the mission
        expect_code(db,M6,note_sql('add',node=QUEST,names=['mistake']),'42501')               # reviewer reads, does not write
        expect_code(db,M5,f"SELECT public.quest_notes('{QUEST}')",'42501')
        expect_code(db,M5,f"SELECT public.quest_note_counts('{T1}')",'42501')
        assert [i['id'] for i in quest_notes(M6)['items']]==[third,second,first] and quest_notes(M6)['canAdd'] is False
        print('PASS',db,'132: at least one label; only Quests; Crew, Managers and the MD write; the mission\'s people read; others are refused')
        expect_code(db,MD,note_sql('edit',note=first,names=['mistake'],body='Not mine'),'P0002')   # only the author edits
        ok(db,M4,note_sql('edit',note=first,names=['mistake','client'],body='Ordered the wrong steel grade; check the drawing'))
        expect_code(db,M6,note_sql('delete',note=second,names=None),'P0002')                    # a reviewer does not delete
        ok(db,MD,note_sql('delete',note=third,names=None))                                    # a manager deletes
        ok(db,M4,note_sql('delete',note=second,names=None))                                   # the author deletes
        assert [i['id'] for i in quest_notes(M4)['items']]==[first]
        print('PASS',db,'132: only the author edits; the author, Managers and the MD delete')
        texts=('Ordered the wrong steel','Client changed the slab','No type label needed','check the drawing')
        assert all(value(db,f"count(*) FROM taskpulse_private.audit_events WHERE protected_changes::text LIKE {literal('%'+t+'%')}")=='0' for t in texts)
        line=value(db,f"protected_changes->>'reason'||'|'||(protected_changes->>'node_title') FROM taskpulse_private.audit_events WHERE command='mission_note_edit' AND row_id='{first}'")
        assert line=='#client #mistake|Foundation',line
        print('PASS',db,'132: activity lines keep the labels and the Quest\'s name; the note\'s text never reaches the audit')
        page=json.loads(ok(db,M4,"SELECT public.labelled('mistake')"))['items']
        noted=[i for i in page if i['kind']=='mission_learning']
        assert [(i['id'],i['nodeId'],i['nodeTitle'],i['taskTag'],i['rootList']) for i in noted]==[(first,QUEST,'Foundation','T1',True)],noted
        assert not [i for i in json.loads(ok(db,M5,"SELECT public.labelled('mistake')"))['items'] if i['kind']=='mission_learning']
        print('PASS',db,'132: the label page lists the note with its mission and Quest, only for those who may read it')
