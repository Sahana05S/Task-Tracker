"""Focused final M05 initialization regression; run after test_m05_database.py.
Only literal disposable loopback DBs are touched; no project credentials.
"""
from pathlib import Path
exec(Path(__file__).with_name('test_m05_database.py').read_text(encoding='utf-8').split('for db in DBS:')[0])
migration=(ROOT/'supabase/migrations/18_checklist_rollups_and_propagation.sql').read_text(encoding='utf-8')
a=migration.index('CREATE OR REPLACE FUNCTION public.task_details_command(')
b=migration.index('-- Retain M02/M03 log ordering',a)
for db in DBS:
    assert db.startswith('taskpulse_m05_')
    sql(db,migration[a:b])
    start=migration.index('CREATE FUNCTION taskpulse_private.checklist_rollup(')
    end=migration.index('CREATE FUNCTION public.checklist_rollups',start)
    sql(db,migration[start:end].replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1))
    entry=create(db,'INIT_FINAL_'+str(uuid4())[:8],assignee='8',auto=False)
    version=value(db,f"lifecycle_version FROM public.tasks WHERE id='{entry}'")
    actor(db,'00000000-0000-0000-0000-000000000002',f"SELECT public.task_details_command('{entry}','initialize','{{}}',{version},'{uuid4()}');")
    assert value(db,f"count(*) FROM public.task_detail_instances WHERE task_id='{entry}'")=='1'
    assert all(s['state']=='uninitialized' for s in rollup(db,entry)['sections'].values())
    sql(db,"INSERT INTO public.monthly_performance_snapshots(user_id,snapshot_year,snapshot_month) SELECT '00000000-0000-0000-0000-000000000008',extract(year FROM clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::integer,extract(month FROM clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::integer;")
    before=value(db,f"to_jsonb(t) FROM public.tasks t WHERE id='{entry}'")
    version=value(db,f"lifecycle_version FROM public.tasks WHERE id='{entry}'")
    actor(db,'00000000-0000-0000-0000-000000000002',f"SELECT public.task_details_command('{entry}','initialize','{{}}',{version},'{uuid4()}');")
    assert before==value(db,f"to_jsonb(t) FROM public.tasks t WHERE id='{entry}'")
    sql(db,"DELETE FROM public.monthly_performance_snapshots WHERE user_id='00000000-0000-0000-0000-000000000008';")
    thirds=create(db,'THIRDS_'+str(uuid4())[:8])
    empty(db,thirds,('setup','closure'))
    add(db,thirds,'Yes','Yes');add(db,thirds,'No');add(db,thirds,'Another no')
    preview=rollup(db,thirds)
    assert preview['taskProgressDecimal']!='33.33'
    enable(db,thirds)
    assert abs(float(value(db,f"progress_percentage FROM public.tasks WHERE id='{thirds}'"))-100/3)<1e-12
    assert abs(float(value(db,f"scaled_progress FROM public.tasks WHERE id='{thirds}'"))-10/3)<1e-12
    print('PASS',db,'final first/repeated/frozen initialization; exact fractional preview and stored progress/scaled units')
