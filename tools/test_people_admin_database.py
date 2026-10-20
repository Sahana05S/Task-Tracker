"""People admin (migration 49): invite-only accounts and director commands; disposable PostgreSQL only.

JWT shim only; no hosted connection. Supply --psql and --port for an already-running
isolated loopback cluster. Never reads .env.local or contacts a configured Supabase project.
"""
from pathlib import Path
source=Path(__file__).with_name('test_m09_database.py').read_text(encoding='utf-8')
exec(compile(source.split('\nfor db in DBS:')[0],str(Path(__file__).with_name('test_m09_database.py')),'exec'))

DBS=('taskpulse_people_admin_fresh_test','taskpulse_people_admin_upgrade_test')
TARGET=49
NUMBERS=sorted(int(p.name.split('_')[0]) for p in (ROOT/'supabase/migrations').glob('*.sql'))
assert TARGET in NUMBERS,'migration 49 missing'
PREV=max(n for n in NUMBERS if n<TARGET)
U=lambda n:'00000000-0000-0000-0000-'+str(n).zfill(12)

def migrate(db,upto,start=1):
    for m in sorted((ROOT/'supabase/migrations').glob('*.sql'),key=lambda p:int(p.name.split('_')[0])):
        n=int(m.name.split('_')[0])
        if n<start:continue
        if n>upto:break
        sql(db,m.read_text(encoding='utf-8'))

def as_user(db,uid,statement):
    out=sql(db,f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{uid}',true);\n{statement.rstrip(';')};\nCOMMIT;")
    return '\n'.join(x for x in out.splitlines() if x not in ('BEGIN','SET','COMMIT',uid))

def expect(db,uid,statement,code,role='authenticated'):
    r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],
        input=f"BEGIN; SET LOCAL ROLE {role}; SELECT set_config('request.jwt.claim.sub','{uid}',true);\n{statement.rstrip(';')};\nCOMMIT;",
        text=True,capture_output=True,encoding='utf-8')
    assert r.returncode and code in r.stderr,(statement[:140],r.stderr[:300])

def expect_system(db,statement,code):
    r=subprocess.run([args.psql,'-X','-h','127.0.0.1','-p',str(args.port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'],
        input=statement,text=True,capture_output=True,encoding='utf-8')
    assert r.returncode and code in r.stderr,(statement[:140],r.stderr[:300])

def people(db,uid,command,payload):
    out=as_user(db,uid,f"SELECT public.people_command('{command}','{json.dumps(payload)}'::jsonb)")
    return json.loads(out.splitlines()[-1])

def signup(db,uid,email,meta='{}',app='{}'):
    sql(db,f"INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES('{uid}','{email}','{meta}','{app}')")

def member(db,uid):
    r=value(db,f"jsonb_build_object('org',organization_id,'active',is_active,'role',role,'name',full_name,'emp',employee_id) FROM public.users WHERE id='{uid}'")
    return json.loads(r) if r else None

for db in DBS:
    sql('postgres',f'DROP DATABASE IF EXISTS {db} WITH (FORCE);')
    sql('postgres',f'CREATE DATABASE {db}')
    sql(db,bootstrap)
    sql(db,'ALTER TABLE auth.users ADD COLUMN last_sign_in_at timestamptz')
    if db==DBS[1]:
        migrate(db,PREV);sql(db,seed)
        before=value(db,"jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.users u")
        migrate(db,TARGET,start=PREV+1)
        assert value(db,"jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.users u")==before,'49 changes no existing member'
        print('PASS',db,f'upgrade {PREV}->{TARGET} applies and leaves every existing member unchanged')
    else:
        migrate(db,TARGET);sql(db,seed)
        print('PASS',db,f'fresh install 01-{TARGET}')
    A=value(db,"id FROM public.organizations WHERE is_default")
    MD,PE,TM,TM2,OFF=U(1),U(2),U(4),U(5),U(7)

    # Ownership and grants.
    assert value(db,'taskpulse_private.m15_secure()')=='0 tables and 0 functions moved to taskpulse_definer'
    for f in ('public.people_command(text,jsonb)','taskpulse_private.keep_active_director()'):
        assert value(db,f"pg_get_userbyid(proowner) FROM pg_proc WHERE oid='{f}'::regprocedure")=='taskpulse_definer',f
    assert value(db,"pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.handle_new_user()'::regprocedure")=='postgres'
    assert value(db,"pg_get_userbyid(relowner)||':'||relforcerowsecurity FROM pg_class WHERE oid='public.member_invitations'::regclass")=='taskpulse_definer:true'
    assert value(db,"has_function_privilege('anon','public.people_command(text,jsonb)','EXECUTE')")=='f'
    assert value(db,"has_table_privilege('authenticated','public.member_invitations','INSERT')")=='f'
    assert value(db,"count(*) FROM pg_trigger WHERE tgname='on_auth_user_signed_in'")=='1'
    print('PASS',db,'command and guard owned by taskpulse_definer; invitations read-only to clients; sign-in trigger present')

    # 1. Uninvited sign-up: no company, inactive, sees only itself.
    X1=U(901);signup(db,X1,'stranger@else.test','{"employee_id":"HACK-1","full_name":"Stranger"}')
    m=member(db,X1);assert m['org'] is None and m['active'] is False and m['role']=='team_member',m
    assert as_user(db,X1,'SELECT count(*) FROM public.users').splitlines()[-1]=='1'
    assert as_user(db,X1,'SELECT count(*) FROM public.tasks').splitlines()[-1]=='0'
    expect(db,X1,"SELECT public.people_command('invite','{}'::jsonb)",'42501')
    print('PASS',db,'an uninvited sign-up gets an inactive profile with no company and sees nothing else')

    # 2. Only an active managing director may run commands.
    for uid in (PE,TM,OFF):
        expect(db,uid,"""SELECT public.people_command('invite','{"email":"a@b.test","fullName":"A","employeeId":"E-1"}'::jsonb)""",'42501')
    print('PASS',db,'project engineer, team member and an inactive account are refused')

    # 3. Invite validation.
    inv=people(db,MD,'invite',{'email':'  New.Person@Example.TEST ','fullName':'New Person','employeeId':'SAH-010','role':'project_engineer'})
    assert inv['email']=='new.person@example.test' and inv['role']=='project_engineer',inv
    for payload,code in (({'email':'new.person@example.test','fullName':'Dup','employeeId':'SAH-011'},'23505'),
                         ({'email':'user4@example.test','fullName':'Member','employeeId':'SAH-012'},'23505'),
                         ({'email':'other@example.test','fullName':'Clash','employeeId':'TEST-4'},'23505'),
                         ({'email':'other@example.test','fullName':'Clash','employeeId':'SAH-010'},'23505'),
                         ({'email':'not-an-email','fullName':'Bad','employeeId':'SAH-013'},'23514'),
                         ({'email':'ok@example.test','fullName':'Bad','employeeId':'has space'},'23514')):
        expect(db,MD,f"SELECT public.people_command('invite','{json.dumps(payload)}'::jsonb)",code)
    assert as_user(db,MD,'SELECT count(*) FROM public.member_invitations').splitlines()[-1]=='1'
    assert as_user(db,TM,'SELECT count(*) FROM public.member_invitations').splitlines()[-1]=='0'
    expect(db,MD,f"INSERT INTO public.member_invitations(organization_id,email,full_name,employee_id,invited_by) VALUES('{A}','z@z.test','Z','Z-1','{MD}')",'42501')
    print('PASS',db,'invite normalises the email; duplicates, members, taken employee IDs and bad input are refused; only directors read invitations; no direct inserts')

    # 4. The invited email signs up: company, role and details come from the invitation.
    N1=U(902);signup(db,N1,'New.Person@example.test','{"employee_id":"IGNORED","full_name":"Ignored"}')
    m=member(db,N1);assert m=={'org':A,'active':True,'role':'project_engineer','name':'New Person','emp':'SAH-010'},m
    assert value(db,f"accepted_user FROM public.member_invitations WHERE id='{inv['invitationId']}'")==N1
    assert value(db,f"count(*) FROM taskpulse_private.audit_events WHERE command='accept_invitation' AND row_id='{N1}' AND organization_id='{A}'")=='1'
    print('PASS',db,'the invited email signs up active, in the company, with the invited role, name and employee ID')

    # 5. Signed up first, invited later: attached on the next sign-in only.
    X2=U(903);signup(db,X2,'early@example.test')
    assert member(db,X2)['org'] is None
    people(db,MD,'invite',{'email':'early@example.test','fullName':'Early Bird','employeeId':'SAH-020','role':'team_member'})
    assert member(db,X2)['active'] is False
    sql(db,f"UPDATE auth.users SET last_sign_in_at=now() WHERE id='{X2}'")
    m=member(db,X2);assert m=={'org':A,'active':True,'role':'team_member','name':'Early Bird','emp':'SAH-020'},m
    before=member(db,MD);sql(db,f"UPDATE auth.users SET last_sign_in_at=now() WHERE id='{MD}'");assert member(db,MD)==before
    print('PASS',db,'an earlier sign-up is attached at the next sign-in after the invite; members are untouched by sign-in')

    # 6. Revoked invitations grant nothing.
    r=people(db,MD,'invite',{'email':'revoked@example.test','fullName':'Revoked','employeeId':'SAH-030'})
    assert people(db,MD,'revoke',{'invitationId':r['invitationId']})['revoked'] is True
    X3=U(904);signup(db,X3,'revoked@example.test')
    m=member(db,X3);assert m['org'] is None and m['active'] is False,m
    expect(db,MD,f"""SELECT public.people_command('revoke','{{"invitationId":"{inv['invitationId']}"}}'::jsonb)""",'23514')
    print('PASS',db,'a revoked invitation grants nothing; an accepted one cannot be revoked')

    # 7. Server-created accounts are trusted as before.
    S1=U(905);signup(db,S1,'seeded@example.test','{"employee_id":"SEED-1"}',f'{{"organization_id":"{A}"}}')
    assert member(db,S1)['active'] is True and member(db,S1)['org']==A
    print('PASS',db,'an admin-API account with a company in app metadata is active as before')

    # 8. Director updates members.
    r=people(db,MD,'update',{'userId':TM,'role':'data_manager','fullName':'Renamed','employeeId':'SAH-004'})
    assert sorted(r['changed'])==['employee_id','full_name','role'],r
    assert member(db,TM)['role']=='data_manager' and member(db,TM)['emp']=='SAH-004'
    people(db,MD,'update',{'userId':TM2,'isActive':False})
    assert member(db,TM2)['active'] is False
    day=value(db,"(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    record(db,'attendance',{'business_date':day,'attendance_status':'Present','attendance_hours':'8','off_hours':'0'},uid='5',success=False)
    people(db,MD,'update',{'userId':TM2,'isActive':True});assert member(db,TM2)['active'] is True
    assert people(db,MD,'update',{'userId':TM2})['changed']==[]
    expect(db,MD,f"""SELECT public.people_command('update','{{"userId":"{MD}","role":"team_member"}}'::jsonb)""",'42501')
    expect(db,MD,f"""SELECT public.people_command('update','{{"userId":"{MD}","isActive":false}}'::jsonb)""",'42501')
    people(db,MD,'update',{'userId':MD,'fullName':'Director Renamed'})
    expect(db,MD,f"""SELECT public.people_command('update','{{"userId":"{TM}","employeeId":"TEST-6"}}'::jsonb)""",'23505')
    assert value(db,f"count(*) FROM taskpulse_private.audit_events WHERE command='update_member' AND actor_id='{MD}'")=='4'
    print('PASS',db,'a director changes role, details and active state (audited); a deactivated member is refused writes; no self demotion or deactivation')

    # 9. A company keeps an active managing director, even through direct writes.
    expect_system(db,f"UPDATE public.users SET is_active=false WHERE id='{MD}'",'23514')
    expect_system(db,f"DELETE FROM public.users WHERE id='{MD}'",'23514')
    people(db,MD,'update',{'userId':PE,'role':'managing_director'})
    people(db,PE,'update',{'userId':MD,'role':'project_engineer'})
    assert member(db,MD)['role']=='project_engineer'
    expect_system(db,f"UPDATE public.users SET role='team_member' WHERE id='{PE}'",'23514')
    people(db,PE,'update',{'userId':MD,'role':'managing_director'})
    print('PASS',db,'the last active managing director cannot be demoted, deactivated or deleted')

    # 10. Company isolation.
    sql(db,"INSERT INTO public.organizations(name,slug) VALUES('Beta Builders','beta')")
    B=value(db,"id FROM public.organizations WHERE slug='beta'");BD=U(950)
    signup(db,BD,'bdir@beta.test','{"employee_id":"BETA-1"}',f'{{"organization_id":"{B}"}}')
    sql(db,f"UPDATE public.users SET role='managing_director' WHERE id='{BD}'")
    expect(db,BD,f"""SELECT public.people_command('update','{{"userId":"{TM}","isActive":false}}'::jsonb)""",'42501')
    open_a=people(db,MD,'invite',{'email':'shared@example.test','fullName':'Shared','employeeId':'SAH-040'})
    expect(db,BD,f"""SELECT public.people_command('revoke','{{"invitationId":"{open_a['invitationId']}"}}'::jsonb)""",'42501')
    expect(db,BD,"""SELECT public.people_command('invite','{"email":"shared@example.test","fullName":"S","employeeId":"BETA-2"}'::jsonb)""",'23505')
    people(db,BD,'invite',{'email':'beta.person@beta.test','fullName':'Beta Person','employeeId':'BETA-3','role':'data_manager'})
    assert as_user(db,BD,'SELECT count(*) FROM public.member_invitations').splitlines()[-1]=='1'
    assert as_user(db,MD,"SELECT count(*) FROM public.member_invitations WHERE email LIKE '%beta%'").splitlines()[-1]=='0'
    BP=U(951);signup(db,BP,'beta.person@beta.test')
    m=member(db,BP);assert m['org']==B and m['role']=='data_manager' and m['active'] is True,m
    assert as_user(db,MD,f"SELECT count(*) FROM public.users WHERE id='{BP}'").splitlines()[-1]=='0'
    assert open_a['email']=='shared@example.test'
    print('PASS',db,'directors act only in their own company; an invitation lands its person in the inviting company')
print('ALL PEOPLE ADMIN CHECKS PASSED')
