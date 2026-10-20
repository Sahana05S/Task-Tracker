"""Disposable end-to-end checks for tools/seed_sheet_to_project.py; loopback PostgreSQL only.

Builds a fresh database from a folder of migrations (01-44 from main), applies the
JWT/auth shim of tools/test_m09_database.py and a migration ledger, seeds a synthetic
stand-in for production (5 users, 3 tasks with logs, a timer, checklists and a
September snapshot), then runs the seed tool: refused plan, dry run, apply, idempotent
rerun, --repair of a removed log, --undo, re-seed after undo and a final undo.
Never contacts a hosted project.
"""
import argparse
import ast
import json
import re
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools" / "seed_sheet_to_project.py"
parser = argparse.ArgumentParser()
parser.add_argument("--psql", required=True)
parser.add_argument("--port", type=int, default=15432)
parser.add_argument("--migrations", required=True, type=Path, help="folder holding exactly the migrations to apply")
parser.add_argument("--xlsx", required=True, type=Path)
parser.add_argument("--manifest-dir", required=True, type=Path)
parser.add_argument("--db", default="taskpulse_sheet_seed_test")
args = parser.parse_args()
assert 1024 < args.port < 65536 and re.fullmatch(r"taskpulse_[a-z0-9_]+_test", args.db)


def sql(db, statement):
    result = subprocess.run([args.psql, "-X", "-q", "-h", "127.0.0.1", "-p", str(args.port), "-U", "postgres", "-d", db,
                             "-v", "ON_ERROR_STOP=1", "-At"], input=statement, text=True, capture_output=True, encoding="utf-8")
    if result.returncode:
        raise AssertionError(result.stderr + "\n" + statement[:300])
    return result.stdout.strip()


def value(query):
    return sql(args.db, "SELECT " + query + ";")


def actor(uid, statement):
    return sql(args.db, f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{uid}',true);\n"
               + statement.rstrip(";") + ";\nCOMMIT;").splitlines()


def run_tool(*extra, expect=0, label=""):
    command = [sys.executable, "-I", str(TOOL), "--xlsx", str(args.xlsx), "--target", "local", "--psql", args.psql,
               "--port", str(args.port), "--db", args.db, "--allow-ledger", "44", "--manifest-dir", str(args.manifest_dir), *extra]
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
    print(f"\n===== {label} (exit {result.returncode})\n{result.stdout}{result.stderr}")
    assert result.returncode == expect, f"{label}: expected exit {expect}, got {result.returncode}"
    return result.stdout


def counts():
    return json.loads(value("jsonb_build_object('tasks',(SELECT count(*) FROM public.tasks),'logs',(SELECT count(*) FROM public.daily_task_logs),"
                            "'live_logs',(SELECT count(*) FROM public.daily_task_logs WHERE reversed_at IS NULL),'users',(SELECT count(*) FROM public.users),"
                            "'auth',(SELECT count(*) FROM auth.users),'receipts',(SELECT count(*) FROM taskpulse_private.command_receipts),"
                            "'checklists',(SELECT count(*) FROM public.task_checklists),'assignees',(SELECT count(*) FROM public.task_assignees),"
                            "'snapshots',(SELECT count(*) FROM public.monthly_performance_snapshots))"))


def manifest_from(output):
    return Path(re.search(r"^Manifest: (.+)$", output, re.M).group(1).strip())


def uid(n):
    return f"00000000-0000-0000-0000-{n:012d}"


source = (ROOT / "tools" / "test_m09_database.py").read_text(encoding="utf-8")
bootstrap = next(ast.literal_eval(node.value) for node in ast.parse(source).body
                 if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "bootstrap")
migrations = sorted(args.migrations.glob("*.sql"), key=lambda p: int(p.name.split("_")[0]))
assert [int(p.name.split("_")[0]) for p in migrations] == list(range(1, 45)), "expected exactly migrations 01-44"

sql("postgres", f"DROP DATABASE IF EXISTS {args.db} WITH (FORCE);")
sql("postgres", f"CREATE DATABASE {args.db};")
sql(args.db, bootstrap)
for migration in migrations:
    sql(args.db, migration.read_text(encoding="utf-8"))
sql(args.db, "CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY, name text);\n"
    + "".join(f"INSERT INTO supabase_migrations.schema_migrations VALUES('{p.name.split('_')[0]}','{p.stem}');\n" for p in migrations))
print(f"PASS fresh install {migrations[0].name}..{migrations[-1].name} with ledger 44")

# Synthetic stand-in for production: the director shares the sheet's email (exists-skip path).
sql(args.db, f"""
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('{uid(1)}','harishchakravarthy@sahcon.org','{{"employee_id":"SRB HRC","full_name":"Harish Chakravarthy I"}}'),
 ('{uid(2)}','engineer@prod-mimic.test','{{"employee_id":"PM-ENG","full_name":"Mimic Engineer"}}'),
 ('{uid(3)}','dm@prod-mimic.test','{{"employee_id":"PM-DM","full_name":"Mimic Data Manager"}}'),
 ('{uid(4)}','member@prod-mimic.test','{{"employee_id":"PM-MEM","full_name":"Mimic Member"}}'),
 ('{uid(5)}','former@prod-mimic.test','{{"employee_id":"PM-OLD","full_name":"Mimic Former"}}');
UPDATE public.users SET role='managing_director' WHERE id='{uid(1)}';
UPDATE public.users SET role='project_engineer' WHERE id='{uid(2)}';
UPDATE public.users SET role='data_manager' WHERE id='{uid(3)}';
UPDATE public.users SET is_active=false WHERE id='{uid(5)}';
""")
created = {}
for tag, assignee, reviewer in (("T1", 4, 1), ("PJT2", 2, 1), ("AD3", 3, 2)):
    fields = {"task_tag": tag, "title": f"Mimic {tag}", "category": re.match(r"[A-Z]+", tag).group(0), "priority": "High",
              "due_date": "2026-10-31", "task_scale": 50, "initialize_details": True}
    out = actor(uid(1), f"SELECT public.save_task_with_participants(NULL,'{json.dumps(fields)}'::jsonb,ARRAY['{uid(assignee)}']::uuid[],"
                        f"ARRAY['{uid(reviewer)}']::uuid[],ARRAY[1000000],NULL,false,'{uuid4()}')")
    created[tag] = [line for line in out if re.fullmatch(r"[0-9a-f-]{36}", line)][-1]  # after the set_config echo
    today = value("(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date")
    for day, hours, delta in (("2026-10-14", 1.5, 0), (today, 2, 20)):  # credit cannot predate the share version
        actor(uid(assignee), f"SELECT public.create_task_log('{created[tag]}','{json.dumps({'log_date': day, 'hours_worked': hours, 'requested_delta': delta, 'notes': 'mimic'})}'::jsonb,'{uuid4()}')")
timer = json.loads(next(l for l in actor(uid(3), f"SELECT public.start_task_timer('{created['AD3']}','{{}}'::jsonb,'{uuid4()}')") if l.startswith("{")))
sql(args.db, "SELECT pg_sleep(1.1);")
actor(uid(3), f"SELECT public.stop_task_timer('{timer['timerId']}','{{}}'::jsonb,'{uuid4()}',0)")
sql(args.db, f"""INSERT INTO public.monthly_performance_snapshots(user_id,snapshot_year,snapshot_month,total_logged_hours,productivity_score)
 VALUES('{uid(1)}',2026,9,10,0.5),('{uid(4)}',2026,9,8,0.25);
INSERT INTO public.report_snapshots(employee_id,report_type,title,payload,status,period_start,period_end)
 VALUES('{uid(4)}','Employee','mimic','{{}}','Final','2026-09-01','2026-09-30');
INSERT INTO public.performance_score_components(user_id,score_date,metric_key,metric_value) VALUES('{uid(1)}','2026-09-30','mimic',1);""")
before = counts()
assert before["tasks"] == 3 and before["users"] == 5 and before["live_logs"] == 7, before
print("PASS synthetic production stand-in:", before)

base = ["--replace-tasks", "--expect-existing-tags", "T1,PJT2,AD3"]
run_tool(*base, expect=2, label="refused: September snapshot for a matched person blocks logs")
plan_text = run_tool(*base, "--delete-september-snapshots", label="dry run")
assert "Dry run: nothing was written" in plan_text and counts() == before
print("PASS dry run wrote nothing")

applied = run_tool(*base, "--delete-september-snapshots", "--yes", label="apply")
assert "PASS Phase D verification" in applied
after = counts()
assert after["tasks"] == 27 and after["live_logs"] == 382 and after["users"] == 8 and after["snapshots"] == 1, after
assert value("count(*) FROM public.tasks WHERE task_tag IN ('T1','PJT2','AD3')") == "0"
assert value("count(*) FROM public.monthly_performance_snapshots WHERE user_id='" + uid(4) + "'") == "1", "unmatched person's snapshot kept"
assert value("count(*) FROM pg_trigger WHERE tgname IN ('m02_retain_logs','m02_task_guard','m07_retain_month','m07_retain_report') AND tgenabled='O'") == "4"
assert value("count(*) FROM taskpulse_private.performance_observations WHERE kind='log' AND data->>'reversedAt' IS NOT NULL") == "7", "old logs soft-reversed in history"
assert value("string_agg(role::text, ',' ORDER BY email) FROM public.users WHERE email LIKE '%@sahcon.org'") == \
    "managing_director,data_manager,data_manager,project_engineer"
first_manifest = manifest_from(applied)
print("PASS apply: 27 tasks, 382 live logs, 3 people created, old tasks/snapshot removed, triggers enabled")

again = run_tool(*base, "--delete-september-snapshots", "--yes", label="idempotent rerun")
assert counts() == after and "PASS Phase D verification" in again and again.count("exists-skip") == 31
print("PASS rerun changed nothing")

# Lose one imported log the way production can: its author reverses it (log and receipt stay).
t9_log, t9_version, t9_author = value("id||','||execution_version||','||user_id FROM public.daily_task_logs "
                                      "WHERE task_id=(SELECT id FROM public.tasks WHERE task_tag='Sep26_T9')").split(",")
actor(t9_author, f"SELECT public.reverse_task_log('{t9_log}','{{\"reason\":\"harness: lost log\"}}'::jsonb,'{uuid4()}',{t9_version})")
run_tool("--yes", expect=1, label="verification catches the missing log")
repaired = run_tool("--yes", "--repair", label="repair")
assert "repair Sep26_T9: 1 logs" in repaired and "PASS Phase D verification" in repaired and counts()["live_logs"] == 382
print("PASS repair re-added the missing log with a fresh operation id")

undone = run_tool("--undo", str(first_manifest), "--yes", label="undo")
final = counts()
assert final["tasks"] == 0 and final["users"] == 5 and final["auth"] == 5, final
assert value("count(*) FROM pg_trigger WHERE tgname IN ('m02_retain_logs','m02_task_guard') AND tgenabled='O'") == "2"
print("PASS undo removed the 27 tasks and the 3 created people; replaced originals stay deleted (kept in the manifest)")

reseeded = run_tool("--yes", label="re-seed after undo (stale receipts must not replay)")
assert "PASS Phase D verification" in reseeded and counts()["live_logs"] == 382
run_tool("--undo", str(manifest_from(reseeded)), "--yes", label="final undo")
assert counts()["tasks"] == 0
print("\nALL SHEET SEED DATABASE CHECKS PASSED")
