"""Disposable end-to-end checks for the --attendance mode of tools/seed_sheet_to_project.py; loopback only.

Builds a fresh database from every migration in the repository with the JWT/auth shim of
tools/test_m09_database.py and a migration ledger, seeds one company (a director and three
members whose full names match tools/fixtures/attendance-september-2026.xlsx, plus task logs
in September), then runs the tool: refusals (unknown person, unknown code, blank working day
before the holiday calendar exists), dry run, apply, verification and the performance read
before/after, idempotent rerun, undo, re-import after undo, a manual correction that blocks a
rerun until --overwrite-attendance, and undo of the overwrite. Never contacts a hosted project.
"""
import argparse
import ast
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools" / "seed_sheet_to_project.py"
FIXTURE = ROOT / "tools" / "fixtures" / "attendance-september-2026.xlsx"
parser = argparse.ArgumentParser()
parser.add_argument("--psql", required=True)
parser.add_argument("--port", type=int, default=15432)
parser.add_argument("--manifest-dir", required=True, type=Path)
parser.add_argument("--db", default="taskpulse_attendance_import_test")
args = parser.parse_args()
assert 1024 < args.port < 65536 and re.fullmatch(r"taskpulse_[a-z0-9_]+_test", args.db)
args.manifest_dir.mkdir(parents=True, exist_ok=True)


def sql(statement, db=None):
    result = subprocess.run([args.psql, "-X", "-q", "-h", "127.0.0.1", "-p", str(args.port), "-U", "postgres", "-d", db or args.db,
                             "-v", "ON_ERROR_STOP=1", "-At"], input=statement, text=True, capture_output=True, encoding="utf-8")
    if result.returncode:
        raise AssertionError(result.stderr + "\n" + statement[:300])
    return result.stdout.strip()


def value(query):
    return sql("SELECT " + query + ";")


def as_user(uid, statement):
    """Runs one statement as an authenticated user; returns its last output line."""
    out = sql(f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{uid}',true);\n"
              + statement.rstrip(";") + ";\nCOMMIT;")
    return out.splitlines()[-1]


def run_tool(*extra, xlsx=FIXTURE, expect=0, label=""):
    command = [sys.executable, "-I", str(TOOL), "--target", "local", "--psql", args.psql, "--port", str(args.port), "--db", args.db,
               "--allow-ledger", str(len(migrations)), "--manifest-dir", str(args.manifest_dir), *extra]
    if "--undo" not in extra:
        command += ["--attendance", str(xlsx), "--attendance-month", "2026-09"]
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
    print(f"\n===== {label} (exit {result.returncode})\n{result.stdout[-6000:]}{result.stderr[-4000:]}")
    assert result.returncode == expect, f"{label}: expected exit {expect}, got {result.returncode}"
    return result.stdout


def manifest_from(output):
    return Path(re.search(r"^Manifest: (.+)$", output, re.M).group(1).strip())


def state():
    return json.loads(value("jsonb_build_object("
                            "'rows',(SELECT count(*) FROM public.attendance_records),"
                            "'active',(SELECT count(*) FROM public.attendance_records WHERE record_state='active'),"
                            "'history',(SELECT count(*) FROM taskpulse_private.input_history WHERE kind='attendance'),"
                            "'receipts',(SELECT count(*) FROM taskpulse_private.command_receipts WHERE command LIKE 'dated_attendance%'))"))


def row(who, day):
    return value(f"status||'/'||round(attendance_hours,2)||'/'||round(off_hours,2)||'/'||coalesce(holiday_name,'')||'/'||"
                 f"coalesce(to_char(check_in_at AT TIME ZONE 'Asia/Kolkata','HH24:MI'),'')||'/'||record_state "
                 f"FROM public.attendance_records WHERE user_id='{who}' AND attendance_date='{day}'")


def performance():
    """The director's performance read for September: attendance per member."""
    out = as_user(uid(1), "SELECT public.performance_source_context('2026-09-01','2026-10-01',clock_timestamp())->'attendance'")
    return {a["userId"]: a for a in json.loads(out)}


def uid(n):
    return f"00000000-0000-0000-0000-{n:012d}"


source = (ROOT / "tools" / "test_m09_database.py").read_text(encoding="utf-8")
bootstrap = next(ast.literal_eval(node.value) for node in ast.parse(source).body
                 if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "bootstrap")
migrations = sorted((ROOT / "supabase" / "migrations").glob("*.sql"), key=lambda p: int(p.name.split("_")[0]))
assert int(migrations[-1].name.split("_")[0]) >= 53, "the import needs the holiday calendar (migration 53)"

sql(f"DROP DATABASE IF EXISTS {args.db} WITH (FORCE);", "postgres")
sql(f"CREATE DATABASE {args.db};", "postgres")
sql(bootstrap)
for migration in migrations:
    sql(migration.read_text(encoding="utf-8"))
sql("CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY, name text);\n"
    + "".join(f"INSERT INTO supabase_migrations.schema_migrations VALUES('{p.name.split('_')[0]}','{p.stem}');\n" for p in migrations))
print(f"PASS fresh install {migrations[0].name}..{migrations[-1].name} with ledger {len(migrations)}")

# One company: the director and three members named as in the fixture, plus a member outside the sheet.
people = {1: ("meera@synthetic.test", "SYN MD", "Meera Vasan", "managing_director"),
          2: ("arun@synthetic.test", "SYN ARN", "Arun Kumar S", "project_engineer"),
          3: ("divya@synthetic.test", "SYN DVY", "Divya Lakshmi R", "team_member"),
          4: ("priya@synthetic.test", "SYN PRY", "Priya Nair K", "data_manager"),
          5: ("other@synthetic.test", "SYN OTH", "Other Member", "team_member")}
sql("".join(f"INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES('{uid(n)}','{e}',"
            f"'{json.dumps({'employee_id': emp, 'full_name': name})}','{{\"taskpulse_provisioned\":true}}');\n"
            for n, (e, emp, name, _) in people.items())
    + "".join(f"UPDATE public.users SET role='{role}' WHERE id='{uid(n)}';\n" for n, (_, _, _, role) in people.items()))
assert value("count(*) FROM public.users WHERE is_active AND organization_id IS NOT NULL") == "5"

# September effort: Arun logs 11 h on a 8.83 h day (off-hours 2.17), 2 h on Sunday 6th and 3 h on the 8th (AB in the sheet).
logs = {2: [("2026-09-01", 11), ("2026-09-06", 2), ("2026-09-08", 3)], 3: [("2026-09-02", 4)], 4: [("2026-09-03", 5)]}
for member, entries in logs.items():
    fields = {"task_tag": f"SYN{member}", "title": f"Synthetic mission {member}", "category": "T", "priority": "High",
              "due_date": "2026-10-31", "task_scale": 10, "initialize_details": True}
    out = as_user(uid(1), f"SELECT public.save_task_with_participants(NULL,'{json.dumps(fields)}'::jsonb,ARRAY['{uid(member)}']::uuid[],"
                          f"ARRAY['{uid(1)}']::uuid[],ARRAY[1000000],NULL,false,'{uuid4()}')")
    task = re.search(r"[0-9a-f-]{36}", out).group(0)
    for day, hours in entries:
        as_user(uid(member), f"SELECT public.create_task_log('{task}','{json.dumps({'log_date': day, 'hours_worked': hours, 'requested_delta': 0, 'notes': 'synthetic'})}'::jsonb,'{uuid4()}')")
assert float(value("sum(hours_worked) FROM public.daily_task_logs WHERE reversed_at IS NULL")) == 25

before_perf = performance()
for member in (2, 3, 4):
    assert before_perf[uid(member)]["available"] is False and "attendance_missing" in before_perf[uid(member)]["reasons"], before_perf[uid(member)]
empty = state()
assert empty["rows"] == 0
print("PASS stand-in: 5 profiles, 3 tasks, 25 h logged; September attendance reads attendance_missing for every member")

# ---- refusals: nothing is written --------------------------------------------------------------
out = run_tool(expect=2, label="refused: blank working day before the holiday calendar has 17 September")
assert "blank status on a working day" in out and "2026-09-17" in out and state() == empty

settings_version = json.loads(as_user(uid(1), "SELECT public.company_settings()"))["version"]
as_user(uid(1), "SELECT public.company_settings_command('holidays','" + json.dumps({"holidays": [
    {"date": "2026-09-17", "name": "Synthetic Festival"}, {"date": "2026-09-10", "name": "Calendar Day Worked"}]})
        + f"'::jsonb,{settings_version},'{uuid4()}')")

sql(f"UPDATE public.users SET full_name='Priya N' WHERE id='{uid(4)}';")
out = run_tool(expect=2, label="refused: unknown person")
assert "FAIL  every staff row matches one active profile" in out and "Priya Nair K: no profile in the company with this full name" in out
assert state() == empty
out = run_tool("--attendance-person", "Priya Nair K=SYN PRY", label="dry run: --attendance-person maps by employee id")
assert "PASS  every staff row matches one active profile" in out
sql(f"UPDATE public.users SET full_name='Priya Nair K' WHERE id='{uid(4)}';")

broken = args.manifest_dir / "broken" / "attendance.xlsx"
broken.parent.mkdir(exist_ok=True)
shutil.copyfile(FIXTURE, broken)
fix = subprocess.run([sys.executable, "-I", "-c", "import openpyxl,sys; wb=openpyxl.load_workbook(sys.argv[1]); "
                      "wb['September 2026'].cell(8, 9 + 4*3 + 3).value='WFH'; wb.save(sys.argv[1])", str(broken)], check=True)
out = run_tool(xlsx=broken, expect=2, label="refused: unknown status code")
assert "Divya Lakshmi R 2026-09-04: unknown status code 'WFH'" in out and state() == empty
print("PASS refusals: blank working day, unknown person, unknown code; nothing written")

# ---- dry run, apply, verify -------------------------------------------------------------------
plan_text = run_tool(label="dry run")
assert "Dry run: nothing was written" in plan_text and state() == empty
assert "skip-director  meera@synthetic.test" in plan_text
assert "total: 90 person-day(s)" in plan_text
assert "arun@synthetic.test: Absent 1, Half Day 1, Holiday (Sunday) 4, Holiday (Synthetic Festival) 1, Present 23; late 8;" in plan_text, plan_text
assert "divya@synthetic.test: Holiday (Festival holiday) 1, Holiday (Sunday) 4, Holiday (Synthetic Festival) 1, Present 24;" in plan_text
assert "arun@synthetic.test 2026-09-08 is Absent in the sheet with 3 h logged; the day will read invalid" in plan_text
assert "arun@synthetic.test 2026-09-01 Present: 11 h logged, 8.83 h worked -> off-hours 2.17" in plan_text
assert "Divya Lakshmi R 2026-09-10: sheet says P L on calendar holiday 'Calendar Day Worked'; the sheet wins" in plan_text
print("PASS dry run: counts per person and status, hours, off-hours and calendar notes; nothing written")

applied = run_tool("--yes", label="apply")
first = manifest_from(applied)
assert "Saved 90 attendance record(s): create 90, restore 0, overwrite 0" in applied and "PASS attendance verification" in applied
after = state()
assert after == {"rows": 90, "active": 90, "history": 90, "receipts": 90}, after
assert value(f"count(*) FROM public.attendance_records WHERE user_id='{uid(1)}'") == "0", "the director's row is skipped"
assert value(f"count(DISTINCT recorded_by)||'/'||min(recorded_by::text) FROM public.attendance_records") == f"1/{uid(1)}"
assert row(uid(2), "2026-09-01") == "Present/8.83/2.17//09:40/active", row(uid(2), "2026-09-01")
assert row(uid(2), "2026-09-06") == "Holiday/0.00/2.00/Sunday//active"
assert row(uid(2), "2026-09-08") == "Absent/0.00/0.00///active"
assert row(uid(2), "2026-09-22").startswith("Half Day/4.25/0.00//")
assert row(uid(3), "2026-09-17") == "Holiday/0.00/0.00/Synthetic Festival//active"
assert row(uid(3), "2026-09-25") == "Holiday/0.00/0.00/Festival holiday//active"
assert row(uid(3), "2026-09-10").startswith("Present/"), "an explicit sheet status wins over the calendar"
assert row(uid(3), "2026-09-15").startswith("Present/7.33/"), "UD is Present with its worked hours"
assert value("count(*) FROM taskpulse_private.audit_events WHERE command='dated_attendance_save'") == "90"
perf = performance()
for member in (3, 4):
    assert perf[uid(member)]["available"] is True and perf[uid(member)]["valid"] is True and float(perf[uid(member)]["hours"]) > 0, perf[uid(member)]
assert perf[uid(2)]["available"] is True and perf[uid(2)]["valid"] is False and perf[uid(2)]["reasons"] == ["effort_exceeds_attendance_capacity"], perf[uid(2)]
assert perf[uid(1)]["available"] is False and "attendance_missing" in perf[uid(1)]["reasons"]
data = json.loads(first.read_text(encoding="utf-8"))
assert data["kind"] == "attendance-import" and len(data["attendance"]) == 90 and data["actor"]["id"] == uid(1)
print("PASS apply: 90 person-days through dated_record_command as the director (audited, input history); "
      "September attendance now available for the three members (productivity has a denominator), Arun invalid on his AB day")

again = run_tool("--yes", label="idempotent rerun")
assert "Nothing to write" in again and "PASS attendance verification" in again and state() == after
print("PASS rerun changed nothing")

# ---- undo, re-import ---------------------------------------------------------------------------
run_tool("--undo", str(first), label="undo dry run")
assert state() == after
undone = run_tool("--undo", str(first), "--yes", label="undo")
assert "PASS undo: 90 attendance record(s)" in undone
assert state()["active"] == 0 and state()["rows"] == 90
assert performance()[uid(3)]["available"] is False
again = run_tool("--undo", str(first), "--yes", label="undo again")
assert "to withdraw/restore: 0; already undone: 90" in again and state()["active"] == 0
print("PASS undo withdrew exactly the 90 imported rows (history kept); a second undo does nothing")

second_run = run_tool("--yes", label="re-import after undo")
second = manifest_from(second_run)
assert "Saved 90 attendance record(s): create 0, restore 90, overwrite 0" in second_run and state()["active"] == 90

# ---- a manual correction blocks a rerun until --overwrite-attendance ---------------------------
rid, version = value(f"id||','||record_version FROM public.attendance_records WHERE user_id='{uid(4)}' AND attendance_date='2026-09-03'").split(",")
as_user(uid(1), "SELECT public.dated_record_command('attendance','" + rid + "','save','" + json.dumps({
    "business_date": "2026-09-03", "attendance_status": "Half Day", "attendance_hours": "5", "off_hours": "0",
    "reason": "manual correction"}) + f"'::jsonb,{version},'{uuid4()}')")
out = run_tool("--yes", expect=2, label="refused: existing attendance differs")
assert "FAIL  no existing attendance differs from the sheet" in out and "priya@synthetic.test 2026-09-03 Half Day" in out
overwrite = run_tool("--yes", "--overwrite-attendance", label="overwrite")
third = manifest_from(overwrite)
assert "Saved 1 attendance record(s): create 0, restore 0, overwrite 1" in overwrite and row(uid(4), "2026-09-03").startswith("Present/")
run_tool("--undo", str(third), "--yes", label="undo the overwrite")
assert row(uid(4), "2026-09-03") == "Half Day/5.00/0.00///active", "undo puts the manual value back"
out = run_tool("--undo", str(second), "--yes", expect=2, label="refused: undo of a run whose row changed since")
assert "priya@synthetic.test 2026-09-03: changed since the import" in out and state()["active"] == 90
print("PASS manual correction: rerun refused, --overwrite-attendance corrected it, undo restored the manual value, "
      "and an older manifest refuses to undo a row changed since")
print("\nALL ATTENDANCE IMPORT DATABASE CHECKS PASSED")
