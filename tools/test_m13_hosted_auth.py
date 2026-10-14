"""Synthetic native Auth/PostgREST checks against an explicitly named M13 project.

The CLI's existing login retrieves test-project API keys in memory. No key,
password or access token is printed or written to the repository. This is a
hosted-test-only script; it refuses the application's existing project ref.
"""

import argparse
import json
import secrets
import subprocess
import sys
import urllib.error
import urllib.request
import uuid
from decimal import Decimal
from datetime import date, timedelta
from pathlib import Path


EXISTING_REF = "sbtxtsisjhuciobxykcm"
EXPECTED_NAME = "TaskPulse M13 Test"
ACTORS = (
    ("DIR", "managing_director", True),
    ("ENG", "project_engineer", True),
    ("DM", "data_manager", True),
    ("REV", "team_member", True),
    ("A", "team_member", True),
    ("B", "team_member", True),
    ("INACTIVE", "team_member", False),
)


def cli(*arguments):
    executable = "supabase.cmd" if sys.platform == "win32" else "supabase"
    result = subprocess.run([executable, *arguments], capture_output=True, text=True, check=False)
    if result.returncode:
        # CLI errors can contain connection details; the operator can rerun
        # the read-only command directly if diagnosis is needed.
        raise RuntimeError(f"Supabase CLI command failed (exit {result.returncode}): {arguments[0]}")
    output = result.stdout
    first = min((position for position in (output.find("{"), output.find("[")) if position >= 0), default=-1)
    if first < 0:
        raise RuntimeError(f"Supabase CLI returned no JSON for {arguments[0]}")
    return json.loads(output[first:])


def request(ref, key, method, path, payload=None, bearer=None):
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {"apikey": key, "Accept": "application/json"}
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"https://{ref}.supabase.co{path}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            content = response.read()
            return response.status, json.loads(content) if content else None
    except urllib.error.HTTPError as error:
        # Retain only a machine-readable code. Bodies can echo inputs.
        try:
            code = json.loads(error.read()).get("code")
        except (ValueError, AttributeError):
            code = None
        return error.code, {"code": code}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--workdir", required=True, type=Path)
    args = parser.parse_args()
    ref = args.project_ref
    if not (len(ref) == 20 and ref.islower() and ref.isalpha()) or ref == EXISTING_REF:
        parser.error("Ref must be the separate 20-letter hosted M13 project")
    link = args.workdir / "supabase" / ".temp" / "project-ref"
    if not link.is_file() or link.read_text(encoding="utf-8").strip() != ref:
        parser.error("Isolated CLI work directory is not linked to the intended test project")
    projects = cli("projects", "list", "--output", "json")
    project = next((p for p in projects if p.get("id") == ref), None)
    if not project or project.get("name") != EXPECTED_NAME or project.get("status") != "ACTIVE_HEALTHY":
        parser.error("Hosted project identity/name/health does not match the approved disposable M13 test")
    ledger = cli("db", "query", "--linked", "--project-ref", ref, "--workdir", str(args.workdir),
                 "SELECT (SELECT count(*) FROM supabase_migrations.schema_migrations) AS migrations, "
                 "(SELECT count(*) FROM public.users) AS profiles")
    row = ledger["rows"][0]
    if row["migrations"] != 29 or row["profiles"] not in (0, 7):
        parser.error("Expected fully migrated test project with zero or seven synthetic profiles")
    keys = cli("projects", "api-keys", "--project-ref", ref, "--reveal", "--output", "json")
    by_name = {key["name"]: key["api_key"] for key in keys if key.get("name") in ("anon", "service_role")}
    if not by_name.get("anon") or not by_name.get("service_role"):
        raise RuntimeError("Test project legacy anon/service keys are unavailable")
    public, admin = by_name["anon"], by_name["service_role"]

    actors = {}
    if row["profiles"] == 0:
        run_id = secrets.token_hex(3).upper()
        for code, role, active in ACTORS:
            email = f"m13-{run_id.lower()}-{code.lower()}@example.test"
            password = secrets.token_urlsafe(30)
            employee = f"M13-{run_id}-{code}"
            status, data = request(ref, admin, "POST", "/auth/v1/admin/users", {
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"employee_id": employee, "full_name": f"M13 Synthetic {code}"},
            }, admin)
            if status not in (200, 201) or not isinstance(data, dict) or not data.get("id"):
                raise RuntimeError(f"Auth creation stopped at synthetic {code}: HTTP {status}")
            actors[code] = {"id": data["id"], "email": email, "password": password, "role": role, "active": active}
    else:
        existing = cli("db", "query", "--linked", "--project-ref", ref, "--workdir", str(args.workdir),
                       "SELECT id, employee_id, email FROM public.users ORDER BY employee_id")["rows"]
        if len(existing) != len(ACTORS) or any(not person["employee_id"].startswith("M13-") for person in existing):
            parser.error("Existing profiles are not exclusively the M13 synthetic set")
        run_ids = {person["employee_id"].split("-")[1] for person in existing}
        if len(run_ids) != 1:
            parser.error("Synthetic profiles have multiple run identifiers")
        run_id = run_ids.pop()
        for code, role, active in ACTORS:
            person = next((p for p in existing if p["employee_id"] == f"M13-{run_id}-{code}"), None)
            if person is None:
                parser.error(f"Synthetic profile {code} is missing")
            password = secrets.token_urlsafe(30)
            status, _ = request(ref, admin, "PUT", f"/auth/v1/admin/users/{person['id']}",
                                {"password": password}, admin)
            if status != 200:
                raise RuntimeError(f"Could not refresh synthetic {code} password: HTTP {status}")
            actors[code] = {"id": person["id"], "email": person["email"], "password": password,
                            "role": role, "active": active}

    # Only the trusted SQL owner can bootstrap the first director. Never run
    # this query against the existing application project.
    statements = [
        f"UPDATE public.users SET role='{actor['role']}'::public.user_role, "
        f"is_active={'true' if actor['active'] else 'false'} WHERE id='{actor['id']}'::uuid"
        for actor in actors.values()
    ]
    statements.append("SELECT count(*) AS synthetic_profiles FROM public.users WHERE employee_id LIKE 'M13-%'")
    result = cli("db", "query", "--linked", "--project-ref", ref, "--workdir", str(args.workdir), "; ".join(statements))
    if not result.get("rows"):
        raise RuntimeError("Synthetic role bootstrap returned no confirmation")

    sessions = {}
    for code, actor in actors.items():
        status, data = request(ref, public, "POST", "/auth/v1/token?grant_type=password",
                               {"email": actor["email"], "password": actor["password"]})
        if status != 200 or not isinstance(data, dict) or not data.get("access_token"):
            raise RuntimeError(f"Native sign-in failed for synthetic {code}: HTTP {status}")
        sessions[code] = data["access_token"]
        status, observed = request(ref, public, "POST", "/rest/v1/rpc/get_user_role", {}, sessions[code])
        expected = actor["role"] if actor["active"] else None
        if status != 200 or observed != expected:
            raise AssertionError(f"Native role mismatch for {code}: HTTP {status}, observed {observed!r}")
        print(f"PASS native sign-in/role: {code} ({'active' if actor['active'] else 'inactive'})")

    # Read and write boundaries use real GoTrue tokens through PostgREST.
    member = actors["A"]
    status, _ = request(ref, public, "PATCH", f"/rest/v1/users?id=eq.{member['id']}",
                        {"role": "managing_director"}, sessions["A"])
    if status not in (401, 403, 406):
        raise AssertionError(f"Self-escalation did not receive a denial: HTTP {status}")
    status, observed = request(ref, public, "POST", "/rest/v1/rpc/get_user_role", {}, sessions["A"])
    if status != 200 or observed != "team_member":
        raise AssertionError("Member role changed after attempted self-escalation")
    print("PASS native member role self-escalation denial")

    inactive = actors["INACTIVE"]
    status, _ = request(ref, public, "PATCH", f"/rest/v1/users?id=eq.{inactive['id']}",
                        {"full_name": "Forbidden Inactive Edit"}, sessions["INACTIVE"])
    observed = cli("db", "query", "--linked", "--project-ref", ref, "--workdir", str(args.workdir),
                   f"SELECT full_name FROM public.users WHERE id='{inactive['id']}'::uuid")["rows"]
    if status not in (204, 401, 403, 406) or observed != [{"full_name": "M13 Synthetic INACTIVE"}]:
        raise AssertionError(f"Inactive profile changed or returned an unexpected status: HTTP {status}")
    print("PASS native inactive write denial/no-op")

    status, _ = request(ref, public, "POST", "/rest/v1/rpc/month_archive_command", {
        "p_command": "draft", "p_period": "2026-08-01", "p_payload": {},
        "p_operation": str(uuid.uuid4()), "p_expected_version": 0,
    }, sessions["A"])
    if status != 403:
        raise AssertionError(f"Member month command unexpectedly succeeded: HTTP {status}")
    print("PASS native member month-command denial")

    # Create bounded synthetic work through the same manager RPC used by the
    # app. A retry with the identical operation proves its receipt is usable.
    for suffix, manager, assigned in (("SHARED", "DIR", ("A", "B")),
                                      ("OUTSIDE", "ENG", ("B",))):
        tag = f"M13-{run_id}-{suffix}"
        status, existing_tasks = request(ref, public, "GET",
            f"/rest/v1/tasks?select=id,task_tag,priority&task_tag=eq.{tag}", bearer=sessions[manager])
        if status != 200 or not isinstance(existing_tasks, list) or len(existing_tasks) > 1:
            raise AssertionError(f"Could not establish synthetic {suffix} task state: HTTP {status}")
        fields = {"task_tag": tag, "title": f"M13 Synthetic {suffix}", "category": "T",
                  "priority": "High", "due_date": "2026-10-20", "task_scale": 10,
                  "initialize_details": False}
        payload = {"p_task_id": None, "p_fields": fields,
                   "p_assignees": [actors[code]["id"] for code in assigned],
                   "p_reviewers": [actors["REV"]["id"]],
                   "p_share_units": [500000, 500000] if len(assigned) == 2 else [1000000],
                   "p_expected_version": None, "p_accept_legacy": False,
                   "p_operation_id": str(uuid.uuid4())}
        if existing_tasks:
            task_id = existing_tasks[0]["id"]
        else:
            status, task_id = request(ref, public, "POST", "/rest/v1/rpc/save_task_with_participants",
                                      payload, sessions[manager])
            if status != 200 or not isinstance(task_id, str):
                raise AssertionError(f"Native {suffix} task creation failed: HTTP {status}")
            retry_status, retried_id = request(ref, public, "POST",
                "/rest/v1/rpc/save_task_with_participants", payload, sessions[manager])
            if retry_status != 200 or retried_id != task_id:
                raise AssertionError(f"Native {suffix} task idempotency failed: HTTP {retry_status}")
        if suffix == "SHARED":
            shared_id = task_id
        else:
            outside_id = task_id
        print(f"PASS native {manager} task command: {suffix}")

    state = cli("db", "query", "--linked", "--project-ref", ref, "--workdir", str(args.workdir),
        f"SELECT task_id, user_id, share_units FROM public.task_assignees "
        f"WHERE task_id IN ('{shared_id}'::uuid,'{outside_id}'::uuid) ORDER BY task_id,user_id")["rows"]
    expected_shares = {(shared_id, actors["A"]["id"]): 500000,
                       (shared_id, actors["B"]["id"]): 500000,
                       (outside_id, actors["B"]["id"]): 1000000}
    if {(item["task_id"], item["user_id"]): item["share_units"] for item in state} != expected_shares:
        raise AssertionError("Native task share attribution differs from the synthetic contract")
    print("PASS native shared-task 50/50 and outside-task ownership")

    for task_id, label in ((shared_id, "assigned"), (outside_id, "cross-task")):
        status, _ = request(ref, public, "PATCH", f"/rest/v1/tasks?id=eq.{task_id}",
                            {"priority": "Low"}, sessions["A"])
        observed = cli("db", "query", "--linked", "--project-ref", ref,
            "--workdir", str(args.workdir),
            f"SELECT priority FROM public.tasks WHERE id='{task_id}'::uuid")["rows"]
        if status not in (204, 401, 403, 406) or observed != [{"priority": "High"}]:
            raise AssertionError(f"Native {label} protected task priority changed: HTTP {status}")
        print(f"PASS native member protected priority denial/no-op: {label}")

    status, _ = request(ref, public, "POST", "/rest/v1/rpc/create_task_log", {
        "p_task_id": outside_id, "p_payload": {"log_date": "2026-10-13", "hours_worked": 1,
        "requested_delta": 10}, "p_operation_id": str(uuid.uuid4())}, sessions["A"])
    if status != 403:
        raise AssertionError(f"Native cross-task log command unexpectedly succeeded: HTTP {status}")
    print("PASS native cross-task log denial")

    status, _ = request(ref, public, "POST", "/rest/v1/rpc/create_task_log", {
        "p_task_id": shared_id, "p_payload": {"log_date": "2026-10-13",
        "hours_worked": 1, "requested_delta": 0}, "p_operation_id": str(uuid.uuid4())})
    if status not in (401, 403):
        raise AssertionError(f"Native anonymous log command unexpectedly succeeded: HTTP {status}")
    print("PASS native anonymous log denial")

    work_day = cli("db", "query", "--linked", "--project-ref", ref,
        "--workdir", str(args.workdir),
        "SELECT (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date AS local_day")["rows"][0]["local_day"]
    previous = cli("db", "query", "--linked", "--project-ref", ref,
        "--workdir", str(args.workdir),
        f"SELECT id, hours_worked, effective_progress_delta, credit_scale, credit_shares "
        f"FROM public.daily_task_logs WHERE task_id='{shared_id}'::uuid AND "
        f"user_id='{actors['A']['id']}'::uuid AND update_notes='M13 hosted native credit' AND reversed_at IS NULL")["rows"]
    if len(previous) > 1:
        raise AssertionError("Synthetic shared-task log was duplicated")
    if not previous:
        log_payload = {"p_task_id": shared_id, "p_payload": {"log_date": work_day,
            "hours_worked": 1, "requested_delta": 20, "notes": "M13 hosted native credit"},
            "p_operation_id": str(uuid.uuid4())}
        status, logged = request(ref, public, "POST", "/rest/v1/rpc/create_task_log",
                                 log_payload, sessions["A"])
        if status != 200 or not isinstance(logged, dict) or not logged.get("logId"):
            raise AssertionError(f"Native assigned-member log failed: HTTP {status}")
        retry_status, retry_result = request(ref, public, "POST", "/rest/v1/rpc/create_task_log",
            log_payload, sessions["A"])
        if retry_status != 200 or retry_result != logged:
            raise AssertionError(f"Native assigned-member log retry failed: HTTP {retry_status}")
    observed_logs = cli("db", "query", "--linked", "--project-ref", ref,
        "--workdir", str(args.workdir),
        f"SELECT id, hours_worked, effective_progress_delta, credit_scale, credit_shares "
        f"FROM public.daily_task_logs WHERE task_id='{shared_id}'::uuid AND "
        f"user_id='{actors['A']['id']}'::uuid AND update_notes='M13 hosted native credit' AND reversed_at IS NULL")["rows"]
    if len(observed_logs) != 1 or Decimal(str(observed_logs[0]["hours_worked"])) != 1 or \
       Decimal(str(observed_logs[0]["effective_progress_delta"])) != 20 or \
       Decimal(str(observed_logs[0]["credit_scale"])) != 10 or \
       observed_logs[0]["credit_shares"] != {actors["A"]["id"]: 500000, actors["B"]["id"]: 500000}:
        raise AssertionError("Native assigned-member log did not retain expected 1h/+20/scale10/50:50 facts")
    print("PASS native assigned-member 1h/+20 log, captured scale/shares and retry")

    checklist = cli("db", "query", "--linked", "--project-ref", ref,
        "--workdir", str(args.workdir),
        f"SELECT id FROM public.task_checklists WHERE task_id='{shared_id}'::uuid")["rows"]
    if len(checklist) > 1:
        raise AssertionError("Synthetic shared task has duplicate checklists")
    if not checklist:
        version = cli("db", "query", "--linked", "--project-ref", ref,
            "--workdir", str(args.workdir),
            f"SELECT lifecycle_version FROM public.tasks WHERE id='{shared_id}'::uuid")["rows"][0]["lifecycle_version"]

        def checklist_action(code, command, payload):
            nonlocal version
            result_status, result = request(ref, public, "POST", "/rest/v1/rpc/checklist_command", {
                "p_task": shared_id, "p_command": command, "p_payload": payload,
                "p_expected_version": version, "p_operation": str(uuid.uuid4())}, sessions[code])
            if result_status != 200 or not isinstance(result, dict) or "version" not in result:
                raise AssertionError(f"Native checklist {command} failed: HTTP {result_status}")
            version = result["version"]
            return result

        checklist_action("DIR", "create", {"title": "M13 native checklist"})
        checklist_action("DIR", "section", {"section": "setup", "intentional_empty": True,
            "reason": "Synthetic test has no setup work"})
        parent = checklist_action("DIR", "add", {"title": "Inspection", "section": "activity",
            "node_type": "Group"})["nodeId"]
        leaves = []
        for label in ("Yes", "No", "N/A"):
            leaves.append(checklist_action("DIR", "add", {"title": f"M13 {label}",
                "section": "activity", "parent_id": parent, "node_type": "Item"})["nodeId"])
        checklist_action("DIR", "add", {"title": "Final review", "section": "closure",
            "node_type": "Item"})
        checklist_action("A", "state", {"node_id": leaves[0], "state": "Yes"})
        checklist_action("A", "state", {"node_id": leaves[2], "state": "N/A"})
    rollup = cli("db", "query", "--linked", "--project-ref", ref,
        "--workdir", str(args.workdir),
        f"SELECT taskpulse_private.checklist_rollup('{shared_id}'::uuid) AS value")["rows"][0]["value"]
    if Decimal(str(rollup["sections"]["activity"]["progressPercentage"])) != 50 or \
       rollup["sections"]["setup"]["state"] != "not_applicable":
        raise AssertionError("Native nested Yes/No/N/A and confirmed-empty checklist rollup differs")
    print("PASS native manager checklist structure, assignee states and 50% applicable Activity")

    existing_attendance = cli("db", "query", "--linked", "--project-ref", ref,
        "--workdir", str(args.workdir),
        f"SELECT id, attendance_hours, off_hours FROM public.attendance_records WHERE "
        f"user_id='{actors['A']['id']}'::uuid AND attendance_date='{work_day}'::date")["rows"]
    if len(existing_attendance) > 1:
        raise AssertionError("Synthetic attendance duplicated")
    if not existing_attendance:
        status, attendance = request(ref, public, "POST", "/rest/v1/rpc/dated_record_command", {
            "p_kind": "attendance", "p_id": None, "p_command": "save",
            "p_payload": {"business_date": work_day, "attendance_status": "Present",
                "attendance_hours": "8", "off_hours": "0", "content": "M13 measured synthetic day"},
            "p_expected_version": 0, "p_operation": str(uuid.uuid4())}, sessions["A"])
        if status != 200 or not isinstance(attendance, dict) or not attendance.get("id"):
            raise AssertionError(f"Native own attendance command failed: HTTP {status}")
    next_day = (date.fromisoformat(work_day) + timedelta(days=1)).isoformat()
    as_of = cli("db", "query", "--linked", "--project-ref", ref,
        "--workdir", str(args.workdir),
        "SELECT clock_timestamp() AS instant")["rows"][0]["instant"]
    context_request = {"p_user": actors["A"]["id"], "p_from": work_day,
        "p_to_exclusive": next_day, "p_as_of": as_of}
    status, attendance_context = request(ref, public, "POST",
        "/rest/v1/rpc/attendance_input_context", context_request, sessions["A"])
    if status != 200:
        raise AssertionError(f"Native own measured attendance context failed: HTTP {status}, code {attendance_context}")
    if attendance_context["days"][0]["attendanceHours"] != "8":
        raise AssertionError("Native own measured attendance differs from eight hours")
    for code in ("B", "DM"):
        denied_status, _ = request(ref, public, "POST",
            "/rest/v1/rpc/attendance_input_context", context_request, sessions[code])
        if denied_status != 403:
            raise AssertionError(f"Native {code} inspected another member's attendance: HTTP {denied_status}")
    manager_status, _ = request(ref, public, "POST",
        "/rest/v1/rpc/attendance_input_context", context_request, sessions["DIR"])
    if manager_status != 200:
        raise AssertionError(f"Native director attendance read failed: HTTP {manager_status}")
    print("PASS native own measured attendance and employee/manager-only detail visibility")

    facts = cli("db", "query", "--linked", "--project-ref", ref,
        "--workdir", str(args.workdir),
        f"SELECT id, record_version, validation_state FROM public.daily_facts WHERE "
        f"posted_by='{actors['A']['id']}'::uuid AND fact_date='{work_day}'::date "
        "AND fact='M13 hosted synthetic fact'")["rows"]
    if len(facts) > 1:
        raise AssertionError("Synthetic fact duplicated")
    if not facts:
        status, created_fact = request(ref, public, "POST", "/rest/v1/rpc/dated_record_command", {
            "p_kind": "fact", "p_id": None, "p_command": "save",
            "p_payload": {"business_date": work_day, "content": "M13 hosted synthetic fact"},
            "p_expected_version": 0, "p_operation": str(uuid.uuid4())}, sessions["A"])
        if status != 200 or not isinstance(created_fact, dict) or not created_fact.get("id"):
            raise AssertionError(f"Native own fact creation failed: HTTP {status}")
        fact_id, fact_version, fact_state = created_fact["id"], created_fact["version"], created_fact["state"]
    else:
        fact_id, fact_version, fact_state = facts[0]["id"], facts[0]["record_version"], facts[0]["validation_state"]
    review_request = {"p_kind": "fact", "p_id": fact_id, "p_command": "validate",
        "p_payload": {"state": "validated", "reason": "Independent M13 synthetic review"},
        "p_expected_version": fact_version, "p_operation": str(uuid.uuid4())}
    status, _ = request(ref, public, "POST", "/rest/v1/rpc/dated_record_command",
                        review_request, sessions["A"])
    if status != 403:
        raise AssertionError(f"Native fact self-validation unexpectedly succeeded: HTTP {status}")
    if fact_state == "pending":
        status, result = request(ref, public, "POST", "/rest/v1/rpc/dated_record_command",
                                 review_request, sessions["DM"])
        if status != 200 or result.get("state") != "validated":
            raise AssertionError(f"Native data-manager fact review failed: HTTP {status}")
    elif fact_state != "validated":
        raise AssertionError(f"Unexpected synthetic fact state: {fact_state}")
    final_fact = cli("db", "query", "--linked", "--project-ref", ref,
        "--workdir", str(args.workdir),
        f"SELECT validation_state, validated_by FROM public.daily_facts WHERE id='{fact_id}'::uuid")["rows"]
    if final_fact != [{"validation_state": "validated", "validated_by": actors["DM"]["id"]}]:
        raise AssertionError("Native fact validation provenance differs")
    print("PASS native own fact, self-validation denial and independent data-manager review")

    current_as_of = cli("db", "query", "--linked", "--project-ref", ref,
        "--workdir", str(args.workdir),
        "SELECT clock_timestamp() AS instant")["rows"][0]["instant"]
    month_start = date.fromisoformat(work_day[:8] + "01")
    month_end = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
    status, live = request(ref, public, "POST", "/rest/v1/rpc/live_presentation_context", {
        "p_from": month_start.isoformat(), "p_to_exclusive": month_end.isoformat(),
        "p_as_of": current_as_of, "p_employee": None}, sessions["A"])
    if status != 200 or not isinstance(live, dict):
        raise AssertionError(f"Native current-month live presentation RPC failed: HTTP {status}, code {live}")
    print("PASS native current-month live presentation RPC")

    print(f"PASS hosted test project {ref}: {len(actors)} synthetic Auth users, run {run_id}; no credentials printed")


if __name__ == "__main__":
    main()
