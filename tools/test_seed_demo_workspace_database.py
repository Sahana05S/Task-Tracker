"""Disposable end-to-end checks for tools/seed_demo_workspace.py; loopback PostgreSQL only.

Builds a fresh database from every migration with the JWT/auth shim of tools/test_m09_database.py
and a migration ledger, then a stand-in for the demo project: the four @demo.com accounts with
their roles, four old accounts already deactivated, a September mission still open (the carryover
source) with September and October logs, and the flat "Present 8 h" October attendance the
recognition seed left. Then: refused plans write nothing, dry run, apply up to three days ago,
idempotent rerun, top-up to today, backdated history checks, undo dry run and undo. Never contacts
a hosted project.
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
TOOL = ROOT / "tools" / "seed_demo_workspace.py"
parser = argparse.ArgumentParser()
parser.add_argument("--psql", required=True)
parser.add_argument("--port", type=int, default=15432)
parser.add_argument("--manifest-dir", required=True, type=Path)
parser.add_argument("--db", default="taskpulse_demo_workspace_test")
parser.add_argument("--keep", action="store_true", help="stop after the stand-in is built (development)")
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
    sql(f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{uid}',true);\n{body}\nCOMMIT;")


def run_tool(*extra, expect=0, label=""):
    command = [sys.executable, "-I", str(TOOL), "--target", "local", "--psql", args.psql, "--port", str(args.port), "--db", args.db,
               "--allow-ledger", str(len(migrations)), "--manifest-dir", str(args.manifest_dir), *extra]
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
    print(f"\n===== {label} (exit {result.returncode})\n{result.stdout[-5000:]}{result.stderr[-5000:]}")
    assert result.returncode == expect, f"{label}: expected exit {expect}, got {result.returncode}"
    return result.stdout


def state():
    return json.loads(value(f"""jsonb_build_object(
 'tasks',(SELECT count(*) FROM public.tasks),
 'live_logs',(SELECT count(*) FROM public.daily_task_logs WHERE reversed_at IS NULL),
 'active_attendance',(SELECT count(*) FROM public.attendance_records WHERE record_state='active'),
 'attendance_digest',(SELECT md5(string_agg(concat_ws('/',user_id,attendance_date,status,attendance_hours,off_hours,check_in_at),',' ORDER BY user_id,attendance_date)) FROM public.attendance_records WHERE record_state='active'),
 'records',(SELECT (SELECT count(*) FROM public.daily_facts WHERE validation_state<>'withdrawn')+(SELECT count(*) FROM public.ideas WHERE validation_state<>'withdrawn')
   +(SELECT count(*) FROM public.suggestions WHERE validation_state<>'withdrawn')+(SELECT count(*) FROM public.sales_logs WHERE validation_state<>'withdrawn')
   +(SELECT count(*) FROM public.meeting_points WHERE validation_state<>'withdrawn')),
 'policies',(SELECT count(*) FROM taskpulse_private.policies WHERE archived_at IS NULL),
 'invitations',(SELECT count(*) FROM public.member_invitations WHERE accepted_at IS NULL AND revoked_at IS NULL),
 'reports',(SELECT count(*) FROM public.report_snapshots),
 'milestones',(SELECT count(*) FROM public.company_milestones),
 'receipts',(SELECT count(*) FROM taskpulse_private.command_receipts))"""))


def uid(n):
    return f"00000000-0000-0000-0000-{n:012d}"


source = (ROOT / "tools" / "test_m09_database.py").read_text(encoding="utf-8")
bootstrap = next(ast.literal_eval(node.value) for node in ast.parse(source).body
                 if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "bootstrap")
migrations = sorted((ROOT / "supabase" / "migrations").glob("*.sql"), key=lambda p: int(p.name.split("_")[0]))
assert int(migrations[-1].name.split("_")[0]) >= 60, "the tool needs migration 60 (award invalidation once per transaction)"

sql(f"DROP DATABASE IF EXISTS {args.db} WITH (FORCE);", "postgres")
sql(f"CREATE DATABASE {args.db};", "postgres")
sql(bootstrap)
for migration in migrations:
    sql(migration.read_text(encoding="utf-8"))
sql("CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY, name text);\n"
    + "".join(f"INSERT INTO supabase_migrations.schema_migrations VALUES('{p.name.split('_')[0]}','{p.stem}');\n" for p in migrations))
print(f"PASS fresh install {migrations[0].name}..{migrations[-1].name} with ledger {len(migrations)}")

# Stand-in for the demo: the four demo accounts (1 MD, 2 PE, 3-4 DM) and four old accounts (11-14, deactivated later).
people = {1: ("harishchakravarthy@demo.com", "HRC", "Harish Chakravarthy", "managing_director"),
          2: ("vijaynath@demo.com", "VJN", "Vijaynath", "project_engineer"),
          3: ("kaviya@demo.com", "KVY", "Kaviya", "data_manager"), 4: ("padmapriya@demo.com", "PDP", "Padmapriya", "data_manager"),
          11: ("sahana.s@sahcon.org", "SRB-1", "Sahana", "managing_director"), 12: ("emp@emp.com", "EMP", "Emp", "team_member"),
          13: ("hoopakappa@gmail.com", "HPK", "Hoopa", "team_member"), 14: ("sahanasakthivel2018@gmail.com", "SSK", "Sakthi", "team_member")}
sql("".join(f"INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES('{uid(n)}','{e}',"
            f"'{{\"employee_id\":\"{emp}\",\"full_name\":\"{name}\"}}','{{\"taskpulse_provisioned\":true}}');\n"
            for n, (e, emp, name, _) in people.items())
    + "".join(f"UPDATE public.users SET role='{role}' WHERE id='{uid(n)}';\n" for n, (_, _, _, role) in people.items()))
for n in (12, 13, 14, 11):
    as_user(uid(1), f"SELECT public.people_command('update',jsonb_build_object('userId','{uid(n)}','isActive',false));")
today = dt.date.fromisoformat(value("(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date"))
first = today.replace(day=1)
previous = (first - dt.timedelta(days=1)).replace(day=1)
yesterday = today - dt.timedelta(days=1)
# A previous-month mission still open (the carryover source), with logs in both months, created as the sheet seed did.
prev_tag = previous.strftime("%b%y") + "_T5"
as_user(uid(1), f"SELECT set_config('h.t', public.save_task_with_participants(NULL,jsonb_build_object('task_tag','{prev_tag}','title','Sheet mission',"
                f"'category','T','priority','Medium','task_scale',4,'initialize_details',false),ARRAY['{uid(3)}']::uuid[],ARRAY[]::uuid[],ARRAY[1000000],"
                f"NULL,false,gen_random_uuid())::text, false);")
task = value(f"id FROM public.tasks WHERE task_tag='{prev_tag}'")
sql(f"UPDATE public.tasks SET assigned_date='{previous + dt.timedelta(days=2)}' WHERE id='{task}';"
    f"UPDATE taskpulse_private.participant_versions SET effective_at='{previous + dt.timedelta(days=2)} 09:00+05:30' WHERE task_id='{task}';")
log_days = [previous + dt.timedelta(days=5), previous + dt.timedelta(days=6)] + ([first + dt.timedelta(days=1)] if first < yesterday else [])
for day in log_days:
    as_user(uid(3), f"SELECT public.create_task_log('{task}',jsonb_build_object('log_date','{day}','hours_worked',3,'requested_delta',0,'notes','sheet',"
                    f"'raw_links','[]'::jsonb),gen_random_uuid());")
# The recognition seed's flat attendance: Present 8 h, no check-in, every member and elapsed day of the month.
days = [first + dt.timedelta(days=i) for i in range((yesterday - first).days + 1)] if yesterday >= first else []


def flat(day, person):
    sunday = day.weekday() == 6
    record = {"business_date": str(day), "author_id": uid(person), "attendance_status": "Holiday" if sunday else "Present",
              "attendance_hours": "0" if sunday else "8", "off_hours": "0"}
    if sunday:
        record["holiday_name"] = "Sunday"
    return f"SELECT public.dated_record_command('attendance',NULL,'save','{json.dumps(record)}'::jsonb,0,gen_random_uuid());\n"


calls = "".join(flat(d, p) for d in days for p in (1, 2, 3, 4))
if calls:
    as_user(uid(1), calls)
before = state()
print("PASS demo stand-in:", before)
if args.keep:
    print(f"Stand-in kept in {args.db}")
    sys.exit(0)

# Refused: another active member, and a ledger that does not match. Nothing is written.
sql(f"UPDATE public.users SET is_active=true WHERE id='{uid(12)}';")
out = run_tool("--yes", expect=2, label="refused: another active member")
assert "[FAIL] no other active member" in out and state() == before
sql(f"UPDATE public.users SET is_active=false WHERE id='{uid(12)}';")
out = run_tool("--yes", "--allow-ledger", str(len(migrations) + 1), expect=2, label="refused: ledger mismatch")
assert "[FAIL] migration ledger has" in out and state() == before
print("PASS refused plans wrote nothing")

plan_text = run_tool(label="dry run")
assert "Dry run: nothing was written" in plan_text and state() == before
print("PASS dry run: plan only")

early = max(first, today - dt.timedelta(days=3))
applied = run_tool("--yes", "--through", str(early), label=f"apply through {early}")
assert "PASS verification" in applied
manifest = Path(re.search(r"^Manifest: (.+)$", applied, re.M).group(1).strip())
after = state()
assert after["tasks"] > before["tasks"] and after["live_logs"] > before["live_logs"] and after["records"] > 0, after
assert after["policies"] == 4 and after["invitations"] == 1 and after["reports"] >= 1, after
covered = (early - first).days + 1
assert after["active_attendance"] == 4 * max(covered, len(days)), after
print(f"PASS apply through {early}: {after}")

again = run_tool("--yes", "--through", str(early), label="idempotent rerun")
assert "Steps to run: 0 of" in again and state() == after, state()
print("PASS rerun changed nothing")

topped = run_tool("--yes", label="top-up to today")
final = state()
assert final["active_attendance"] == 4 * ((today - first).days + 1), final
again = run_tool("--yes", label="rerun after top-up")
assert "Steps to run: 0 of" in again and state() == final, state()
print(f"PASS top-up to today, then rerun changed nothing: {final}")

# Backdated history: each seeded attendance row's latest history row sits on its business day;
# nothing is recorded in the future; the immutability triggers are back on.
wrong_day = value(f"""count(*) FROM public.attendance_records a JOIN LATERAL (SELECT recorded_at FROM taskpulse_private.input_history h
  WHERE h.kind='attendance' AND h.record_id=a.id ORDER BY recorded_at DESC, sequence DESC LIMIT 1) h ON true
  WHERE a.attendance_date BETWEEN '{first}' AND '{yesterday}' AND (h.recorded_at AT TIME ZONE 'Asia/Kolkata')::date<>a.attendance_date""")
assert wrong_day == "0", f"{wrong_day} attendance rows keep a history time off their business day"
future = value("(SELECT count(*) FROM taskpulse_private.input_history WHERE recorded_at>clock_timestamp())"
               "+(SELECT count(*) FROM taskpulse_private.performance_observations WHERE observed_at>clock_timestamp())"
               "+(SELECT count(*) FROM taskpulse_private.presentation_history WHERE recorded_at>clock_timestamp())")
assert future == "0", f"{future} history rows are in the future"
enabled = value("string_agg(DISTINCT tgenabled::text,',') FROM pg_trigger WHERE tgname IN "
                "('m06_history_immutable','m07_observation_immutable','m11_presentation_immutable','m07_manual_credit_immutable')")
assert enabled == "O", enabled
ordered = value("""count(*) FROM (SELECT kind, record_id, recorded_at, sequence, lag(sequence) OVER (PARTITION BY kind, record_id ORDER BY recorded_at, sequence) prev,
  lag(recorded_at) OVER (PARTITION BY kind, record_id ORDER BY sequence) prev_at FROM taskpulse_private.input_history) x WHERE prev_at > recorded_at""")
assert ordered == "0", f"{ordered} history rows are older than an earlier revision of the same record"
log_days_ok = value(f"""count(*) FROM public.daily_task_logs l JOIN taskpulse_private.performance_observations o ON o.kind='log' AND o.entity_id=l.id
  WHERE l.log_date BETWEEN '{first}' AND '{yesterday}' AND (o.observed_at AT TIME ZONE 'Asia/Kolkata')::date<>l.log_date
  AND l.task_id IN (SELECT id FROM public.tasks WHERE task_tag LIKE '{first:%b%y}_%')""")
assert log_days_ok == "0", f"{log_days_ok} seeded log observations sit off their log day"
done = value(f"count(*) FROM public.tasks WHERE status='Done' AND completed_date BETWEEN '{first}' AND '{today}'")
print(f"PASS backdated history: business-day stamps, none in the future, revisions in order, triggers enabled; {done} mission(s) Done")

run_tool("--undo", str(manifest), label="undo dry run")
assert state() == final
# Each run has its own manifest; undo the latest first (the top-up corrected rows the first run wrote).
manifests = sorted(args.manifest_dir.glob("demo-workspace-*.json"), reverse=True)
for path in manifests:
    undone = run_tool("--undo", str(path), "--yes", label=f"undo {path.name}")
    assert "PASS undo" in undone
gone = state()
carried = value(f"count(*) FROM public.tasks WHERE handoff_successor_id IS NOT NULL")
assert gone["tasks"] == before["tasks"] + int(carried), (gone, before, carried)
assert gone["policies"] == 0 and gone["invitations"] == 0 and gone["records"] == 0, gone
assert gone["reports"] == before["reports"] and gone["milestones"] == before["milestones"], gone
assert gone["active_attendance"] == before["active_attendance"] and gone["attendance_digest"] == before["attendance_digest"], gone
print(f"PASS undo: missions deleted, records withdrawn, attendance restored, policies archived, invitation revoked: {gone}")
print("\nALL DEMO WORKSPACE SEED CHECKS PASSED")
