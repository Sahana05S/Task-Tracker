"""Disposable end-to-end checks for tools/seed_demo_recognition.py; loopback PostgreSQL only.

Builds a fresh database from every migration in the repository with the JWT/auth shim of
tools/test_m09_database.py and a migration ledger, seeds a stand-in for the demo project (one
@demo.com director, two @demo.com members, four old @sahcon.org accounts, a mission with
September and October logs, one attendance record already in place), then runs the tool with
--worker none: refused plans, dry run, apply, idempotent rerun and undo. Never contacts a hosted
project; the worker phases need the app and run only in the hosted wave 5 step.
"""
import argparse
import ast
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools" / "seed_demo_recognition.py"
parser = argparse.ArgumentParser()
parser.add_argument("--psql", required=True)
parser.add_argument("--port", type=int, default=15432)
parser.add_argument("--manifest-dir", required=True, type=Path)
parser.add_argument("--db", default="taskpulse_demo_recognition_test")
args = parser.parse_args()
assert 1024 < args.port < 65536 and re.fullmatch(r"taskpulse_[a-z0-9_]+_test", args.db)


def sql(statement, db=None):
    result = subprocess.run([args.psql, "-X", "-q", "-h", "127.0.0.1", "-p", str(args.port), "-U", "postgres", "-d", db or args.db,
                             "-v", "ON_ERROR_STOP=1", "-At"], input=statement, text=True, capture_output=True, encoding="utf-8")
    if result.returncode:
        raise AssertionError(result.stderr + "\n" + statement[:300])
    return result.stdout.strip()


def value(query):
    return sql("SELECT " + query + ";")


def as_user(uid, body):
    sql(f"BEGIN; SELECT set_config('request.jwt.claim.sub','{uid}',true);\n{body}\nCOMMIT;")


def run_tool(*extra, expect=0, label=""):
    command = [sys.executable, "-I", str(TOOL), "--target", "local", "--psql", args.psql, "--port", str(args.port), "--db", args.db,
               "--worker", "none", "--allow-ledger", str(len(migrations)), "--manifest-dir", str(args.manifest_dir), *extra]
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
    print(f"\n===== {label} (exit {result.returncode})\n{result.stdout[-4000:]}{result.stderr[-4000:]}")
    assert result.returncode == expect, f"{label}: expected exit {expect}, got {result.returncode}"
    return result.stdout


def state():
    return json.loads(value("jsonb_build_object("
                            "'attendance',(SELECT count(*) FROM public.attendance_records),"
                            "'active_attendance',(SELECT count(*) FROM public.attendance_records WHERE record_state='active'),"
                            "'slots',(SELECT count(*) FROM taskpulse_private.award_slots),"
                            "'jobs',(SELECT count(*) FROM taskpulse_private.outbox_jobs WHERE kind='award_daily'),"
                            "'active_old',(SELECT count(*) FROM public.users WHERE email LIKE '%@sahcon.org' AND is_active),"
                            "'active_demo',(SELECT count(*) FROM public.users WHERE email LIKE '%@demo.com' AND is_active),"
                            "'receipts',(SELECT count(*) FROM taskpulse_private.command_receipts))"))


def uid(n):
    return f"00000000-0000-0000-0000-{n:012d}"


source = (ROOT / "tools" / "test_m09_database.py").read_text(encoding="utf-8")
bootstrap = next(ast.literal_eval(node.value) for node in ast.parse(source).body
                 if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "bootstrap")
migrations = sorted((ROOT / "supabase" / "migrations").glob("*.sql"), key=lambda p: int(p.name.split("_")[0]))
assert int(migrations[-1].name.split("_")[0]) >= 49, "the tool needs people_command (migration 49)"

sql(f"DROP DATABASE IF EXISTS {args.db} WITH (FORCE);", "postgres")
sql(f"CREATE DATABASE {args.db};", "postgres")
sql(bootstrap)
for migration in migrations:
    sql(migration.read_text(encoding="utf-8"))
sql("CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY, name text);\n"
    + "".join(f"INSERT INTO supabase_migrations.schema_migrations VALUES('{p.name.split('_')[0]}','{p.stem}');\n" for p in migrations))
print(f"PASS fresh install {migrations[0].name}..{migrations[-1].name} with ledger {len(migrations)}")

# Stand-in for the demo project. Directors 1 (demo) and 11 (old); members 2, 3 (demo), 12-14 (old).
people = {1: ("md@demo.com", "DEMO-MD", "managing_director"), 2: ("asha@demo.com", "DEMO-2", "team_member"),
          3: ("ravi@demo.com", "DEMO-3", "project_engineer"), 11: ("harish@sahcon.org", "SRB-1", "managing_director"),
          12: ("pe@sahcon.org", "SRB-2", "project_engineer"), 13: ("dm@sahcon.org", "SRB-3", "data_manager"),
          14: ("member@sahcon.org", "SRB-4", "team_member")}
sql("".join(f"INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES('{uid(n)}','{e}',"
            f"'{{\"employee_id\":\"{emp}\",\"full_name\":\"{e.split('@')[0].title()}\"}}','{{\"taskpulse_provisioned\":true}}');\n"
            for n, (e, emp, _) in people.items())
    + "".join(f"UPDATE public.users SET role='{role}' WHERE id='{uid(n)}';\n" for n, (_, _, role) in people.items()))
today = dt.date.fromisoformat(value("(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date"))
yesterday = today - dt.timedelta(days=1)
first = dt.date(2026, 9, 1)
assert yesterday >= first, "the harness needs at least one elapsed day since 1 September 2026"
days = (yesterday - first).days + 1
sunday = next(first + dt.timedelta(days=i) for i in range(7) if (first + dt.timedelta(days=i)).weekday() == 6)
weekday = first + dt.timedelta(days=1)  # Wednesday 2 September 2026
task = "10000000-0000-0000-0000-0000000000d1"
as_user(uid(1), f"INSERT INTO public.tasks(id,task_tag,title,assignee_id,task_scale) VALUES('{task}','DEMO-T1','Demo mission','{uid(2)}',10);")
as_user(uid(2), f"""INSERT INTO public.daily_task_logs(task_id,user_id,log_date,hours_worked) VALUES
 ('{task}','{uid(2)}','{weekday}',6),('{task}','{uid(2)}','{weekday}',3.5),('{task}','{uid(2)}','{sunday}',2.25),
 ('{task}','{uid(2)}','{yesterday}',1);""")
as_user(uid(1), f"SELECT public.dated_record_command('attendance',NULL,'save','{json.dumps({'business_date': str(weekday), 'author_id': uid(3), 'attendance_status': 'Present', 'attendance_hours': '8', 'off_hours': '0'})}'::jsonb,0,gen_random_uuid());")
before = state()
assert before["attendance"] == 1 and before["active_old"] == 4 and before["active_demo"] == 3 and before["slots"] == 0, before
print("PASS demo stand-in:", before)

# Refused: a second active demo director, and a ledger that does not match.
sql(f"UPDATE public.users SET role='managing_director' WHERE id='{uid(3)}';")
out = run_tool("--yes", expect=2, label="refused: two demo directors")
assert "[FAIL] exactly one active @demo.com managing director" in out and state() == before
sql(f"UPDATE public.users SET role='project_engineer' WHERE id='{uid(3)}';")
wrong = str(len(migrations) + 1)
out = run_tool("--yes", "--allow-ledger", wrong, expect=2, label="refused: ledger mismatch")
assert f"[FAIL] migration ledger has {wrong} entries" in out and state() == before
print("PASS refused plans wrote nothing")

plan_text = run_tool(label="dry run")
assert "Dry run: nothing was written" in plan_text and state() == before
assert f"Phase 4 attendance: {3 * days - 1} to create, 1 already present, for 3 member(s)" in plan_text, plan_text
assert f"Phase 2 requests: {days} award day(s) without a slot" in plan_text
assert "- harish@sahcon.org (managing_director)" in plan_text
print("PASS dry run: plan only")

applied = run_tool("--yes", label="apply --worker none")
assert "PASS Phase 6 verification (worker skipped" in applied
manifest = Path(re.search(r"^Manifest: (.+)$", applied, re.M).group(1).strip())
after = state()
assert after["active_old"] == 0 and after["active_demo"] == 3, after
assert after["attendance"] == 3 * days and after["active_attendance"] == 3 * days, after
assert after["slots"] == days and after["jobs"] >= days, after
row = lambda who, day: value(f"status||'/'||round(attendance_hours,2)||'/'||round(off_hours,2)||'/'||coalesce(holiday_name,'') FROM public.attendance_records "
                             f"WHERE user_id='{who}' AND attendance_date='{day}' AND record_state='active'")
assert row(uid(2), weekday) == "Present/9.50/0.00/", row(uid(2), weekday)
assert row(uid(2), sunday) == "Holiday/0.00/2.25/Sunday", row(uid(2), sunday)
assert row(uid(1), weekday) == "Present/8.00/0.00/"
assert value(f"recorded_by FROM public.attendance_records WHERE user_id='{uid(2)}' AND attendance_date='{weekday}'") == uid(1)
assert value(f"count(*) FROM taskpulse_private.award_slots WHERE business_date NOT BETWEEN '{first}' AND '{yesterday}'") == "0"
data = json.loads(manifest.read_text(encoding="utf-8"))
assert len(data["deactivated"]) == 4 and len(data["attendance"]) == 3 * days - 1 and len(data["requests"]) == days
print(f"PASS apply: 4 old accounts deactivated through people_command, {3 * days - 1} attendance rows as the demo director "
      f"(weekdays Present with hours >= logged, Sundays Holiday with off-hours = logged), {days} award days requested")

again = run_tool("--yes", label="idempotent rerun")
assert "Phase 4 attendance: 0 to create" in again and "Phase 2 requests: 0 award day(s)" in again and state() == after
print("PASS rerun changed nothing")

run_tool("--undo", str(manifest), label="undo dry run")
assert state() == after
undone = run_tool("--undo", str(manifest), "--yes", label="undo")
final = state()
assert f"PASS undo: {3 * days - 1} attendance row(s) withdrawn, 4 account(s) reactivated" in undone
assert final["active_old"] == 4 and final["active_attendance"] == 1 and final["slots"] == days, final
assert value(f"record_state FROM public.attendance_records WHERE user_id='{uid(3)}' AND attendance_date='{weekday}'") == "active", \
    "the record that existed before the run stays"
print("PASS undo: people reactivated, the tool's attendance withdrawn, award slots kept as history")
print("\nALL DEMO RECOGNITION SEED CHECKS PASSED")
