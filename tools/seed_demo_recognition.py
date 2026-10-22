"""Seed the demo project so the daily star, streaks and the award ceremony show real data (slice 8).

First award runs read their inputs "as of" the award date, so data seeded later is invisible to them
and every past day blocks; a member with no attendance on a day blocks that day. This tool replays
the missing inputs through the app's own commands, then lets a temporary local award worker
certify each day. Phases (all listed in the dry run; nothing is written without --yes):

  0 state       gates: migration ledger, one active company, approved award policy, no frozen
                September/October snapshot or final report, exactly one active demo (@demo.com)
                managing director, no member-day with more than 24 logged hours
  1 people      deactivate the old @sahcon.org accounts through people_command (before-state kept)
  2 requests    award_command('request') as the demo director for 1 September through yesterday
  3 worker      pass 1 through a temporary sandbox worker: past days block; each slot is then
                stamped with a source watermark
  4 attendance  dated_record_command('attendance') as the demo director for every remaining active
                member and every elapsed day: Monday to Saturday Present with hours >= logged (at
                least 8), Sundays Holiday with off-hours = logged. Only days without active
                attendance are written: recorded attendance (the billed-sheet import) is kept
                as it is, and a withdrawn record is saved over by id
  5 worker      pass 2: every past day certifies (completed_winner or completed_none)
  6 verify      award_read_model: day/winner table, September win counts, yesterday's winner and
                schedule_enabled

--undo MANIFEST reactivates the people and withdraws the attendance rows; award runs stay as
history. --worker none skips phases 3 and 5 (the disposable harness has no app worker).

Hosted mode reuses the Supabase CLI query channel of tools/seed_sheet_to_project.py; the worker
gets the project's keys in its own process environment only (never printed or written). The
demo project is the ref that tool calls production, so --yes there needs --confirm-production-ref.
"""

import argparse
import contextlib
import datetime as dt
import json
import os
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_sheet_to_project import (  # noqa: E402  (shared backends and the transaction wrapper)
    PRODUCTION_REF, ROOT, HostedBackend, LocalBackend, Refusal, as_actor, fmt_num, jlit, lit, save_manifest, target_identity,
    transaction, uuid_array,
)

START = dt.date(2026, 9, 1)
OLD_DOMAIN = "@sahcon.org"
DEMO_DOMAIN = "@demo.com"
DEFAULT_LEDGER = 48  # 01-49 on the demo project (there is no 47)
WORKER_PORT = 3109
MIN_HOURS = Decimal("8")
NS = uuid.UUID("0b6d2f3c-7e1a-4c59-8f20-6a4d93e1c5b8")  # this tool's operation ids
UNDO_REASON = "Removed by demo-recognition seed undo"
HOLIDAY_NAME = "Sunday"


def op_id(*parts):
    """Deterministic operation keys: a rerun replays the same receipts instead of writing twice."""
    return str(uuid.uuid5(NS, "|".join(str(p) for p in parts)))


def port_free(port):
    with socket.socket() as probe:
        return probe.connect_ex(("127.0.0.1", port)) != 0


def days_between(first, last):
    return [first + dt.timedelta(days=i) for i in range((last - first).days + 1)]


# --------------------------------------------------------------------------- state and plan

def state_sql():
    """Everything the plan reads, for 1 September through yesterday (Asia/Kolkata), in one query."""
    first, last = lit(START), "((clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date-1)"
    return transaction("", f"""jsonb_build_object(
 'current_user', current_user,
 'definer_member', (SELECT pg_has_role(current_user,'taskpulse_definer','MEMBER') FROM pg_roles WHERE rolname='taskpulse_definer'),
 'ledger', CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN NULL
   ELSE (SELECT count(*) FROM supabase_migrations.schema_migrations) END,
 'organizations', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status)),'[]') FROM public.organizations),
 'users', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'email',lower(email),'name',full_name,'role',role,
   'is_active',is_active,'organization_id',organization_id) ORDER BY email),'[]') FROM public.users),
 'policy_approved', (SELECT config IS NOT NULL FROM taskpulse_private.award_policy WHERE id),
 'frozen', EXISTS(SELECT 1 FROM public.monthly_performance_snapshots WHERE make_date(snapshot_year,snapshot_month,1)
   BETWEEN date_trunc('month',{first}::date)::date AND {last})
   OR EXISTS(SELECT 1 FROM public.report_snapshots WHERE status='Final' AND (period_start IS NULL OR period_start<={last})
   AND (period_end IS NULL OR period_end>={first}::date)),
 'logged', (SELECT coalesce(jsonb_object_agg(k,h),'{{}}') FROM (SELECT user_id||'|'||log_date AS k,sum(hours_worked) AS h
   FROM public.daily_task_logs WHERE reversed_at IS NULL AND log_date BETWEEN {first} AND {last} GROUP BY 1) x),
 'attendance', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'user_id',user_id,'day',attendance_date,'status',status,
   'hours',attendance_hours,'off_hours',off_hours,'state',record_state,'version',record_version)),'[]')
   FROM public.attendance_records WHERE attendance_date BETWEEN {first} AND {last}),
 'slots', (SELECT coalesce(jsonb_object_agg(business_date,version),'{{}}') FROM taskpulse_private.award_slots
   WHERE business_date BETWEEN {first} AND {last}),
 'today', (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date
)""")


def attendance_for(day, logged):
    """The planned record for one member-day: weekdays Present, Sundays Holiday."""
    if day.weekday() == 6:
        return {"attendance_status": "Holiday", "attendance_hours": "0", "off_hours": fmt_num(logged), "holiday_name": HOLIDAY_NAME}
    return {"attendance_status": "Present", "attendance_hours": fmt_num(max(MIN_HOURS, logged)), "off_hours": "0"}


def plan(args, backend):
    gates, notes = [], []

    def gate(ok, label, detail=""):
        gates.append((bool(ok), label, detail))
        return ok

    if isinstance(backend, HostedBackend):
        ref = args.project_ref
        gate(len(ref) == 20 and ref.isalpha() and ref.islower(), "project ref is a 20-letter lowercase ref", ref)
        link = args.workdir / "supabase" / ".temp" / "project-ref"
        gate(link.is_file() and link.read_text(encoding="utf-8").strip() == ref, "workdir is linked to that ref", str(link))
        project = next((p for p in backend.projects() if p.get("id") == ref), None)
        gate(project and project.get("status") == "ACTIVE_HEALTHY", "project is ACTIVE_HEALTHY",
             f"{project.get('name') if project else 'not listed'} {project.get('status') if project else ''}")
        if args.worker == "local":
            gate(port_free(args.worker_port), f"worker port {args.worker_port} is free")
    else:
        gate(args.worker == "none", "a local database has no app worker (--worker none)")

    state = backend.query("state", state_sql())
    today = dt.date.fromisoformat(state["today"])
    last = today - dt.timedelta(days=1)
    gate(last >= START, "yesterday is on or after 1 September 2026", str(last))
    gate(state["ledger"] == args.allow_ledger, f"migration ledger has {args.allow_ledger} entries", f"found {state['ledger']}")
    gate(state["definer_member"], "current user is a member of taskpulse_definer", state["current_user"])
    active_orgs = [o for o in state["organizations"] if o["status"] == "active"]
    gate(len(active_orgs) == 1, "exactly one active company", ", ".join(o["name"] for o in active_orgs))
    org = active_orgs[0]["id"] if len(active_orgs) == 1 else None
    gate(state["policy_approved"], "award policy is approved")
    gate(not state["frozen"], "no frozen month snapshot or final report covers the days")

    users = [u for u in state["users"] if u["organization_id"] == org]
    directors = [u for u in users if u["is_active"] and u["role"] == "managing_director" and u["email"].endswith(DEMO_DOMAIN)]
    gate(len(directors) == 1, f"exactly one active {DEMO_DOMAIN} managing director", ", ".join(u["email"] for u in directors))
    director = directors[0] if len(directors) == 1 else None
    retire = [u for u in users if u["is_active"] and u["email"].endswith(OLD_DOMAIN)]
    members = [u for u in users if u["is_active"] and not u["email"].endswith(OLD_DOMAIN)]
    gate(members, "active members remain after the old accounts are deactivated")

    days = days_between(START, last) if last >= START else []
    logged = {k: Decimal(str(v)) for k, v in state["logged"].items()}
    existing = {(a["user_id"], a["day"]): a for a in state["attendance"]}
    attendance, conflicts = [], []
    for member in members:
        for day in days:
            hours = logged.get(f"{member['id']}|{day}", Decimal("0"))
            want = attendance_for(day, hours)
            entry = {"user_id": member["id"], "day": str(day), **want}
            have = existing.get((member["id"], str(day)))
            if hours > 24:
                conflicts.append(f"{member['email']} {day}: {fmt_num(hours)} h logged")
                continue
            if have is None:
                entry["action"] = "create"
            elif have["state"] == "active":
                # Recorded attendance (the sheet import or a manual save) is real data: keep it as it is
                # (user decision, 22 October 2026), even where it differs from this synthetic plan.
                entry.update(action="exists-keep", id=have["id"], have=have,
                             differs=have["status"] != want["attendance_status"] or
                             Decimal(str(have["hours"])) + Decimal(str(have["off_hours"])) < hours)
            else:
                # A withdrawn record leaves the day without attendance; the command saves over it by id.
                entry.update(action="restore", id=have["id"], version=have["version"])
            attendance.append(entry)
    gate(not conflicts, "no member-day has more than 24 logged hours", "; ".join(conflicts[:6]) + (" ..." if len(conflicts) > 6 else ""))

    idle = sorted({m["email"] for m in members for month in {d.replace(day=1) for d in days}
                   if not any(k.startswith(m["id"] + "|" + str(month)[:7]) for k in logged)})
    if idle:
        notes.append("members with no logged hours in a covered month (those days block on the zero-hours rule): " + ", ".join(idle))
    requests = [str(d) for d in days if str(d) not in state["slots"]]
    return {"gates": gates, "notes": notes, "org": org, "director": director, "retire": retire, "members": members,
            "days": [str(d) for d in days], "attendance": attendance, "requests": requests, "today": str(today)}


def print_plan(args, backend, result):
    print(f"Target: {backend.label}")
    print(f"Days: {result['days'][0] if result['days'] else '-'} .. {result['days'][-1] if result['days'] else '-'} "
          f"({len(result['days'])}), today {result['today']} (Asia/Kolkata)")
    print("\nGates:")
    for ok, label, detail in result["gates"]:
        print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f" ({detail})" if detail else ""))
    director = result["director"]
    print(f"\nPhase 1 people: deactivate {len(result['retire'])} old account(s) as {director['email'] if director else '-'}")
    for u in result["retire"]:
        print(f"  - {u['email']} ({u['role']})")
    print(f"Phase 2 requests: {len(result['requests'])} award day(s) without a slot "
          f"({len(result['days']) - len(result['requests'])} already have one)")
    print(f"Phase 3 worker pass 1: {'local sandbox worker on port ' + str(args.worker_port) if args.worker == 'local' else 'skipped (--worker none)'}")
    create = [a for a in result["attendance"] if a["action"] in ("create", "restore")]
    kept = [a for a in result["attendance"] if a["action"] == "exists-keep"]
    print(f"Phase 4 attendance: {len(create)} to create ({sum(a['action'] == 'restore' for a in create)} over withdrawn records), "
          f"{len(kept)} kept as recorded ({sum(a['differs'] for a in kept)} differ from the synthetic plan), "
          f"for {len(result['members'])} member(s)")
    for member in result["members"]:
        rows = [a for a in create if a["user_id"] == member["id"]]
        present = sum(1 for a in rows if a["attendance_status"] == "Present")
        print(f"  - {member['email']}: {present} Present, {len(rows) - present} Holiday, "
              f"{sum(1 for a in kept if a['user_id'] == member['id'])} kept")
    print(f"Phase 5 worker pass 2: {'yes' if args.worker == 'local' else 'skipped (--worker none)'}")
    print("Phase 6 verify: award_read_model day table and September win counts")
    for note in result["notes"]:
        print(f"Note: {note}")


# --------------------------------------------------------------------------- phases

def director_calls(backend, director, name, calls):
    """Runs {key: SQL call} in order as the demo director in one atomic script; returns {key: result}.
    The results cross the role reset in the session setting seed.out."""
    rows = ",\n ".join(f"({n},{lit(key)},{call})" for n, (key, call) in enumerate(calls.items()))
    body = (as_actor(director["id"]) + "SELECT set_config('seed.out',(SELECT coalesce(jsonb_object_agg(k,r ORDER BY n),'{}') "
            f"FROM (VALUES\n {rows}) v(n,k,r))::text,true);\n")
    return backend.query(name, transaction(body, "current_setting('seed.out')::jsonb"))


def phase_people(backend, result, manifest):
    if not result["retire"]:
        print("  no old accounts are active")
        return
    out = director_calls(backend, result["director"], "deactivate", {
        u["id"]: f"public.people_command('update',{jlit({'userId': u['id'], 'isActive': False})})" for u in result["retire"]})
    for user in result["retire"]:
        if out[user["id"]].get("isActive") is not False:
            raise RuntimeError(f"deactivation of {user['email']} did not take")
        manifest["deactivated"].append({"id": user["id"], "email": user["email"], "before": {"is_active": True}})
        print(f"  deactivated {user['email']}")
    save_manifest(manifest)


def phase_requests(backend, result, manifest):
    if not result["requests"]:
        print("  every day already has an award slot")
        return
    director = result["director"]
    out = director_calls(backend, director, "requests", {
        d: f"public.award_command('request',{jlit({'date': d})},{lit(op_id('request', result['org'], d))}::uuid)" for d in result["requests"]})
    manifest["requests"] = sorted(out)
    save_manifest(manifest)
    print(f"  requested {len(out)} award day(s)")


def phase_attendance(backend, result, manifest):
    rows = [a for a in result["attendance"] if a["action"] in ("create", "restore")]
    if not rows:
        print("  every member-day already has attendance")
        return
    calls = {}
    for a in rows:
        payload = {k: a[k] for k in ("attendance_status", "attendance_hours", "off_hours", "holiday_name") if k in a}
        payload.update(business_date=a["day"], author_id=a["user_id"])
        if a["action"] == "restore":
            payload["reason"] = "Demo recognition seed: day had no active attendance"
            calls[f"{a['user_id']}|{a['day']}"] = (f"public.dated_record_command('attendance',{lit(a['id'])}::uuid,'save',{jlit(payload)},"
                                                   f"{a['version']},{lit(op_id('attendance', a['user_id'], a['day'], a['version']))}::uuid)")
            continue
        calls[f"{a['user_id']}|{a['day']}"] = (f"public.dated_record_command('attendance',NULL,'save',{jlit(payload)},0,"
                                               f"{lit(op_id('attendance', a['user_id'], a['day']))}::uuid)")
    out = director_calls(backend, result["director"], "attendance", calls)
    for key, response in out.items():
        user_id, day = key.split("|")
        manifest["attendance"].append({"id": response["id"], "user_id": user_id, "day": day})
    save_manifest(manifest)
    for member in result["members"]:
        print(f"  {member['email']}: {sum(1 for a in rows if a['user_id'] == member['id'])} attendance record(s)")


# --------------------------------------------------------------------------- worker

class Worker:
    """A temporary `next dev` with the award worker in sandbox mode, on a dedicated port."""

    def __init__(self, backend, port):
        self.backend, self.port = backend, port
        self.token = secrets.token_urlsafe(32)
        self.process = None
        self.log = tempfile.TemporaryFile(mode="w+t", encoding="utf-8")

    def __enter__(self):
        if not port_free(self.port):
            raise Refusal(f"worker port {self.port} is in use")
        keys = self.backend.cli("projects", "api-keys", "--project-ref", self.backend.ref, "--reveal", "--output", "json")
        found = {k["name"]: k["api_key"] for k in keys if k.get("name") in ("anon", "service_role")}
        environment = os.environ.copy()
        environment.update({
            "NEXT_PUBLIC_SUPABASE_URL": f"https://{self.backend.ref}.supabase.co",
            "NEXT_PUBLIC_SUPABASE_ANON_KEY": found["anon"],
            "SUPABASE_SERVICE_ROLE_KEY": found["service_role"],
            "TASKPULSE_AWARD_WORKER_ENABLED": "sandbox",
            "TASKPULSE_AWARD_WORKER_TOKEN": self.token,
            "TASKPULSE_DRIVE_WORKER_ENABLED": "",
        })
        self.process = subprocess.Popen(
            ["node", str(ROOT / "node_modules" / "next" / "dist" / "bin" / "next"), "dev", "--webpack", "-H", "127.0.0.1", "-p", str(self.port)],
            cwd=ROOT, env=environment, stdout=self.log, stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
        for _ in range(120):
            if self.process.poll() is not None:
                raise RuntimeError("temporary worker stopped early")
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/login", timeout=2) as response:
                    if response.status == 200:
                        return self
            except (urllib.error.URLError, TimeoutError):
                pass
            time.sleep(1)
        raise RuntimeError("temporary worker did not become ready")

    def __exit__(self, *exc):
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                self.process.kill()
        self.log.close()

    def drain(self, label, limit=60):
        """Runs batches until one comes back empty; returns the outcome statuses."""
        statuses = []
        for _ in range(limit):
            req = urllib.request.Request(f"http://127.0.0.1:{self.port}/api/internal/awards", data=b"{}", method="POST",
                                         headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.token}"})
            try:
                with urllib.request.urlopen(req, timeout=300) as response:
                    body = json.loads(response.read())
            except urllib.error.HTTPError as error:
                raise RuntimeError(f"{label}: worker returned HTTP {error.code}") from None
            outcomes = body.get("outcomes") or []
            if not outcomes:
                return statuses
            statuses += [o.get("status") for o in outcomes]
        raise RuntimeError(f"{label}: the worker queue did not drain in {limit} batches")


def worker_pass(worker, label, after=None):
    if worker is None:
        print(f"{label}: skipped (--worker none)")
        return
    print(label)
    statuses = worker.drain(label)
    print(f"  {len(statuses)} run(s): " + ", ".join(f"{s} {statuses.count(s)}" for s in sorted(set(statuses))))
    if after:
        after()


# --------------------------------------------------------------------------- verify

def check_watermarks(backend, result):
    """After pass 1 every covered day has a run stamped with the source watermark it read."""
    bare = backend.query("watermarks", transaction("", f"""(SELECT coalesce(jsonb_agg(s.business_date ORDER BY s.business_date),'[]')
 FROM taskpulse_private.award_slots s LEFT JOIN taskpulse_private.award_runs r ON r.id=s.latest_run
 WHERE s.organization_id={lit(result['org'])}::uuid AND s.business_date BETWEEN {lit(result['days'][0])} AND {lit(result['days'][-1])}
  AND r.source_watermark IS NULL)"""))
    if bare:
        raise RuntimeError(f"pass 1: {len(bare)} day(s) have no watermarked run: {', '.join(bare[:5])}")
    print(f"  every day's latest run carries a source watermark")


def read_awards(backend, director, days):
    """award_read_model in windows of at most 366 days, read while impersonating the director."""
    windows = [days[i:i + 366] for i in range(0, len(days), 366)]
    out = director_calls(backend, director, "awards", {
        str(n): f"public.award_read_model({lit(w[0])}::date,({lit(w[-1])}::date+1))" for n, w in enumerate(windows)})
    first = out["0"]
    return {**first, "days": [d for n in range(len(windows)) for d in out[str(n)]["days"]]}


def phase_verify(backend, result, expect_certified):
    director = result["director"]
    if not result["days"]:
        return
    model = read_awards(backend, director, result["days"])
    days = {d["date"]: d for d in model["days"]}
    missing = [d for d in result["days"] if d not in days]
    if missing:
        raise RuntimeError(f"verify: {len(missing)} day(s) have no award slot: {', '.join(missing[:5])}")
    names = {m["id"]: m["email"] for m in result["members"]} | {result["director"]["id"]: result["director"]["email"]}
    counts = {}
    print("\n  date        status            winner")
    for day in result["days"]:
        d = days[day]
        winner = names.get(d.get("winnerId"), d.get("winnerId") or "-")
        print(f"  {day}  {d['status']:<16}  {winner if d.get('certified') else '-'}")
        if d.get("certified") and d.get("winnerId") and day.startswith("2026-09"):
            counts[winner] = counts.get(winner, 0) + 1
    uncertified = [day for day in result["days"] if not days[day].get("certified")]
    if expect_certified and uncertified:
        raise RuntimeError(f"verify: {len(uncertified)} day(s) did not certify: {', '.join(uncertified[:5])}")
    print("\n  September wins: " + (", ".join(f"{k} {v}" for k, v in sorted(counts.items(), key=lambda kv: -kv[1])) or "none"))
    y = days[result["days"][-1]]
    print(f"  Yesterday ({result['days'][-1]}): {names.get(y.get('winnerId'), '-') if y.get('certified') else 'not certified'} "
          f"(sign in as the winner to see the spotlight on Today)")
    print(f"  schedule_enabled: {model.get('scheduleEnabled')}")
    counted = backend.query("attendance-check", transaction("", f"""(SELECT coalesce(jsonb_object_agg(user_id,n),'{{}}') FROM (
 SELECT user_id,count(*) AS n FROM public.attendance_records WHERE user_id = ANY({uuid_array([m['id'] for m in result['members']])})
  AND record_state='active' AND attendance_date BETWEEN {lit(result['days'][0])} AND {lit(result['days'][-1])} GROUP BY user_id) x)"""))
    for member in result["members"]:
        if counted.get(member["id"], 0) != len(result["days"]):
            raise RuntimeError(f"verify: {member['email']} has {counted.get(member['id'], 0)} active attendance day(s), "
                               f"expected {len(result['days'])}")
    print("PASS Phase 6 verification" + ("" if expect_certified else " (worker skipped: slots and attendance only)"))


# --------------------------------------------------------------------------- undo and main

def undo(args, backend, path):
    manifest = json.loads(Path(path).read_text(encoding="utf-8"))
    if manifest.get("tool") != "tools/seed_demo_recognition.py":
        raise Refusal("not a demo-recognition manifest")
    if manifest.get("target") != target_identity(args, backend):
        raise Refusal(f"manifest target {manifest.get('target')} does not match {target_identity(args, backend)}")
    director = manifest["director"]
    print(f"Undo {path}: {len(manifest['deactivated'])} people, {len(manifest['attendance'])} attendance rows "
          f"(award runs stay as history)")
    if not args.yes:
        print("Dry run: nothing was written. Pass --yes to apply.")
        return
    ids = [a["id"] for a in manifest["attendance"]]
    rows = backend.query("undo-state", transaction("", "(SELECT coalesce(jsonb_object_agg(id, jsonb_build_object('version',record_version,"
                                                       f"'state',record_state)),'{{}}') FROM public.attendance_records WHERE id = ANY({uuid_array(ids)}))"))
    live = [i for i in ids if i in rows and rows[i]["state"] == "active"]
    calls = {i: f"public.dated_record_command('attendance',{lit(i)}::uuid,'withdraw',{jlit({'reason': UNDO_REASON})},"
                f"{rows[i]['version']},{lit(op_id('undo', i, rows[i]['version']))}::uuid)" for i in live}
    calls |= {u["id"]: f"public.people_command('update',{jlit({'userId': u['id'], 'isActive': True})})" for u in manifest["deactivated"]}
    if calls:
        director_calls(backend, director, "undo", calls)
    for user in manifest["deactivated"]:
        print(f"  reactivated {user['email']}")
    manifest["undone_at"] = stamp()
    save_manifest(manifest)
    print(f"PASS undo: {len(live)} attendance row(s) withdrawn, {len(manifest['deactivated'])} account(s) reactivated")


def stamp():
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--target", choices=("hosted", "local"), required=True)
    parser.add_argument("--project-ref")
    parser.add_argument("--workdir", type=Path)
    parser.add_argument("--confirm-production-ref")
    parser.add_argument("--psql")
    parser.add_argument("--port", type=int, default=15432)
    parser.add_argument("--db")
    parser.add_argument("--dry-run", action="store_true", help="print the plan only (default without --yes)")
    parser.add_argument("--yes", action="store_true", help="apply the plan")
    parser.add_argument("--worker", choices=("local", "none"), default="local")
    parser.add_argument("--worker-port", type=int, default=WORKER_PORT)
    parser.add_argument("--allow-ledger", type=int, default=DEFAULT_LEDGER)
    parser.add_argument("--manifest-dir", type=Path, default=Path(tempfile.gettempdir()) / "taskpulse-demo-recognition")
    parser.add_argument("--undo", type=Path, metavar="MANIFEST")
    args = parser.parse_args(argv)
    if args.target == "hosted" and not (args.project_ref and args.workdir):
        parser.error("--target hosted needs --project-ref and --workdir")
    if args.target == "local" and not (args.psql and args.db):
        parser.error("--target local needs --psql and --db")
    manifest_dir = args.manifest_dir.resolve()
    if manifest_dir == ROOT or ROOT in manifest_dir.parents:
        parser.error("--manifest-dir must be outside the repository")
    args.manifest_dir = manifest_dir
    return args


def main(argv=None):
    args = parse_args(argv)
    args.manifest_dir.mkdir(parents=True, exist_ok=True)
    sql_dir = args.manifest_dir / f"sql-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:4]}"
    sql_dir.mkdir()
    backend = HostedBackend(sql_dir, args.project_ref, args.workdir) if args.target == "hosted" else \
        LocalBackend(sql_dir, args.psql, args.port, args.db)
    try:
        if backend.is_production and args.yes and args.confirm_production_ref != PRODUCTION_REF:
            raise Refusal("the demo project needs --confirm-production-ref")
        if args.undo:
            undo(args, backend, args.undo)
            return 0
        result = plan(args, backend)
        print_plan(args, backend, result)
        if not all(ok for ok, _, _ in result["gates"]):
            print("\nREFUSED: one or more gates failed; nothing was written.")
            return 2
        if not args.yes or args.dry_run:
            print("\nDry run: nothing was written. Pass --yes to apply.")
            return 0
        manifest = {"path": str(args.manifest_dir / f"demo-recognition-{stamp()}-{uuid.uuid4().hex[:6]}.json"),
                    "tool": "tools/seed_demo_recognition.py", "started_at": stamp(), "target": target_identity(args, backend),
                    "organization_id": result["org"], "director": {"id": result["director"]["id"], "email": result["director"]["email"]},
                    "days": result["days"], "deactivated": [], "requests": [], "attendance": []}
        save_manifest(manifest)
        print(f"\nManifest: {manifest['path']}")
        print("Phase 1 people"); phase_people(backend, result, manifest)
        print("Phase 2 requests"); phase_requests(backend, result, manifest)
        with Worker(backend, args.worker_port) if args.worker == "local" else contextlib.nullcontext() as worker:
            worker_pass(worker, "Phase 3 worker pass 1", lambda: check_watermarks(backend, result))
            print("Phase 4 attendance"); phase_attendance(backend, result, manifest)
            worker_pass(worker, "Phase 5 worker pass 2")
        print("Phase 6 verify"); phase_verify(backend, result, expect_certified=args.worker == "local")
        manifest["finished_at"] = stamp()
        save_manifest(manifest)
        return 0
    except Refusal as refusal:
        print(f"\nREFUSED: {refusal}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
