"""Run bounded M13 command journeys only against the named hosted test project.

Uses synthetic Auth users and the existing isolated CLI workdir. Credentials are
retrieved into process memory and never printed. This is intentionally rerunnable:
each case has its own synthetic task tag and inspects persisted state before edits.
"""

import argparse
import secrets
import uuid
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from test_m13_hosted_auth import EXPECTED_NAME, EXISTING_REF, cli, request


REF = "ngpmwzksekkpvrgoqngk"
RUN = "F87E37"


def operation():
    return str(uuid.uuid4())


class Hosted:
    def __init__(self, workdir):
        link = workdir / "supabase" / ".temp" / "project-ref"
        projects = cli("projects", "list", "--output", "json")
        project = next((p for p in projects if p.get("id") == REF), None)
        if REF == EXISTING_REF or not project or project.get("name") != EXPECTED_NAME or \
           project.get("status") != "ACTIVE_HEALTHY" or not link.is_file() or \
           link.read_text(encoding="utf-8").strip() != REF:
            raise RuntimeError("Refusing non-M13 hosted destination")
        self.workdir = workdir
        rows = self.sql("SELECT employee_id,id,email FROM public.users ORDER BY employee_id")
        if len(rows) != 7 or {r["employee_id"] for r in rows} != \
           {f"M13-{RUN}-{code}" for code in ("DIR", "ENG", "DM", "REV", "A", "B", "INACTIVE")}:
            raise RuntimeError("Unexpected hosted profile set")
        self.actors = {r["employee_id"].split("-")[-1]: r for r in rows}
        keys = cli("projects", "api-keys", "--project-ref", REF, "--reveal", "--output", "json")
        found = {k["name"]: k["api_key"] for k in keys if k.get("name") in ("anon", "service_role")}
        self.public, self.admin = found["anon"], found["service_role"]
        self.tokens = {}
        self.passwords = {}
        for code, actor in self.actors.items():
            password = secrets.token_urlsafe(30)
            status, _ = request(REF, self.admin, "PUT", f"/auth/v1/admin/users/{actor['id']}",
                                {"password": password}, self.admin)
            if status != 200:
                raise AssertionError(f"Synthetic password reset failed: {code} HTTP {status}")
            status, session = request(REF, self.public, "POST", "/auth/v1/token?grant_type=password",
                                      {"email": actor["email"], "password": password})
            if status != 200:
                raise AssertionError(f"Synthetic sign-in failed: {code} HTTP {status}")
            self.tokens[code] = session["access_token"]
            self.passwords[code] = password

    def sql(self, query):
        return cli("db", "query", "--linked", "--project-ref", REF,
                   "--workdir", str(self.workdir), query)["rows"]

    def api(self, code, name, payload, allowed=True):
        status, result = request(REF, self.public, "POST", f"/rest/v1/rpc/{name}",
                                 payload, self.tokens.get(code))
        if allowed and status != 200:
            raise AssertionError(f"{code} {name} failed: HTTP {status}, code {result.get('code') if isinstance(result, dict) else None}")
        if not allowed and status not in (400, 401, 403, 409):
            raise AssertionError(f"{code} {name} unexpectedly accepted: HTTP {status}")
        return result

    def table(self, code, name, query):
        status, rows = request(REF, self.public, "GET", f"/rest/v1/{name}?{query}",
                               bearer=self.tokens[code])
        if status != 200:
            raise AssertionError(f"{code} table read {name}: HTTP {status}")
        return rows

    def task(self, suffix, assignee="A", initialize=True):
        tag = f"M13-{RUN}-{suffix}"
        rows = self.table("DIR", "tasks", f"select=id,task_tag&task_tag=eq.{tag}")
        if rows:
            return rows[0]["id"]
        task = self.api("DIR", "save_task_with_participants", {
            "p_task_id": None, "p_fields": {"task_tag": tag, "title": f"M13 {suffix} acceptance",
                "category": "T", "priority": "High", "due_date": "2026-10-25",
                "task_scale": 10, "initialize_details": initialize},
            "p_assignees": [self.actors[assignee]["id"]],
            "p_reviewers": [self.actors["REV"]["id"]],
            "p_share_units": [1000000], "p_expected_version": None,
            "p_accept_legacy": False, "p_operation_id": operation()})
        return task

    def version(self, task):
        return self.table("DIR", "tasks", f"select=lifecycle_version&id=eq.{task}")[0]["lifecycle_version"]

    def checklist(self, code, task, command, payload, allowed=True):
        return self.api(code, "checklist_command", {"p_task": task, "p_command": command,
            "p_payload": payload, "p_expected_version": self.version(task),
            "p_operation": operation()}, allowed)

    def lifecycle(self, code, task, command, payload, allowed=True):
        return self.api(code, "task_lifecycle_command", {"p_task_id": task,
            "p_command": command, "p_payload": payload,
            "p_expected_version": self.version(task), "p_operation_id": operation()}, allowed)

    def detail(self, code, task, command, payload, allowed=True):
        return self.api(code, "task_details_command", {"p_task": task,
            "p_command": command, "p_payload": payload,
            "p_expected_version": self.version(task), "p_operation": operation()}, allowed)

    def tools(self, code, command, payload, commit=True):
        preview = self.api(code, "task_tools_preview", {"p_command": command, "p_payload": payload})
        if not preview.get("ready"):
            raise AssertionError(f"{command} preview blocked: {preview.get('reasons')}")
        if not commit:
            return preview
        result = self.api(code, "task_tools_command", {"p_preview": preview["id"], "p_operation": operation()})
        if result.get("status") != "committed":
            raise AssertionError(f"{command} did not commit")
        return preview, result


def run(workdir):
    h = Hosted(workdir)
    today = h.sql("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date AS day")[0]["day"]
    task = h.task("JOURNEY")
    current_details = h.table("DIR", "task_detail_sections", f"select=key_name,content&task_id=eq.{task}")
    if not any(f["key_name"] == "smart_specific" and f["content"] == "Inspect synthetic site"
               for f in current_details):
        h.detail("DIR", task, "save", {"smart_specific": "Inspect synthetic site",
            "smart_measurable": "One signed acceptance record", "input_content": "Synthetic brief",
            "process_content": "Measure and review", "output_content": "Synthetic report"})
        h.detail("DIR", task, "link", {"ipo_role": "input", "link_type": "Raw Link",
            "label": "Synthetic reference", "url": "https://example.test/m13-fixture"})
    fields = h.table("DIR", "task_detail_sections", f"select=key_name,content&task_id=eq.{task}")
    if not any(f["key_name"] == "smart_specific" and f["content"] == "Inspect synthetic site" for f in fields):
        raise AssertionError("SMART detail did not persist")
    h.detail("A", task, "save", {"smart_specific": "Forbidden"}, allowed=False)
    print("PASS hosted automatic initialization, SMART/IPO edits, assignee structural denial", flush=True)

    checklist = h.table("DIR", "task_checklists", f"select=id&task_id=eq.{task}")
    if not checklist:
        h.checklist("DIR", task, "create", {"title": "M13 journey"})
        checklist = h.table("DIR", "task_checklists", f"select=id&task_id=eq.{task}")
    nodes = h.table("DIR", "checklist_nodes", f"select=id,title,completion_state&checklist_id=eq.{checklist[0]['id']}")
    if not any(n["title"] == "Journey Yes" for n in nodes):
        h.checklist("DIR", task, "section", {"section": "setup", "intentional_empty": True,
            "reason": "Synthetic setup intentionally empty"})
        parent = h.checklist("DIR", task, "add", {"section": "activity",
            "title": "Acceptance steps", "node_type": "Group"})["nodeId"]
        for label in ("Yes", "No", "NA"):
            h.checklist("DIR", task, "add", {"section": "activity", "parent_id": parent,
                "title": f"Journey {label}", "node_type": "Item"})
        h.checklist("DIR", task, "add", {"section": "closure", "title": "Close evidence", "node_type": "Item"})
    nodes = h.table("DIR", "checklist_nodes", f"select=id,title,completion_state&checklist_id=eq.{checklist[0]['id']}")
    by_title = {n["title"]: n for n in nodes}
    h.lifecycle("A", task, "transition", {"status": "Done"}, allowed=False)
    for label, state in (("Journey Yes", "Yes"), ("Journey NA", "N/A")):
        if by_title[label]["completion_state"] != state:
            h.checklist("A", task, "state", {"node_id": by_title[label]["id"], "state": state})
    h.checklist("A", task, "state", {"node_id": by_title["Journey No"]["id"], "state": "No"})
    roll = h.sql(f"SELECT taskpulse_private.checklist_rollup('{task}'::uuid) AS value")[0]["value"]
    if Decimal(str(roll["sections"]["activity"]["progressPercentage"])) != 50:
        raise AssertionError("Parent Activity propagation differs from 50%")
    h.checklist("B", task, "state", {"node_id": by_title["Journey Yes"]["id"], "state": "No"}, allowed=False)
    print("PASS hosted Yes/No/N/A parent rollup, guarded Done, cross-task checklist denial", flush=True)

    # Timer and retained correction/reversal use an open task. The timer's
    # generated log is distinct from the manually corrected and reversed row.
    timer_task = h.task("TIMER")
    timers = h.table("DIR", "task_timers", f"select=id,status&task_id=eq.{timer_task}")
    if not timers:
        started = h.api("A", "start_task_timer", {"p_task_id": timer_task,
            "p_payload": {}, "p_operation_id": operation()})
        import time
        time.sleep(2)
        stopped = h.api("A", "stop_task_timer", {"p_timer_id": started["timerId"],
            "p_payload": {}, "p_operation_id": operation(), "p_expected_version": 0})
        if not stopped.get("logIds"):
            raise AssertionError("Timer did not create a retained log")
    timer_rows = h.table("DIR", "task_timers", f"select=id,status,generated_log_id&task_id=eq.{timer_task}")
    if not any(t["status"] == "Stopped" and t["generated_log_id"] for t in timer_rows):
        raise AssertionError("Stopped timer lacks linked log")
    logs = h.table("DIR", "daily_task_logs", f"select=id,execution_version,reversed_at,update_notes&task_id=eq.{timer_task}")
    manual = next((l for l in logs if l["update_notes"] == "M13 reversible"), None)
    if not manual:
        created = h.api("A", "create_task_log", {"p_task_id": timer_task,
            "p_payload": {"log_date": today, "hours_worked": 0.25,
                "requested_delta": 10, "notes": "M13 reversible"}, "p_operation_id": operation()})
        manual = {"id": created["logId"], "execution_version": 1, "reversed_at": None}
    if manual["reversed_at"] is None:
        corrected = h.api("A", "correct_task_log", {"p_log_id": manual["id"],
            "p_payload": {"log_date": today, "hours_worked": 0.5,
                "requested_delta": 10, "reason": "M13 measured duration correction"},
            "p_operation_id": operation(), "p_expected_version": manual["execution_version"]})
        h.api("A", "reverse_task_log", {"p_log_id": manual["id"],
            "p_payload": {"reason": "M13 retained reversal"},
            "p_operation_id": operation(), "p_expected_version": corrected["version"]})
    final = h.table("DIR", "daily_task_logs", f"select=id,reversed_at&task_id=eq.{timer_task}&id=eq.{manual['id']}")[0]
    if not final["reversed_at"]:
        raise AssertionError("Log reversal was not retained")
    print("PASS hosted timer stop/link, log correction and retained reversal", flush=True)

    # Complete only after all applicable leaves, 100% manual progress and a
    # current assigned-reviewer approval. A later mutation invalidates approval.
    for label in ("Journey No", "Close evidence"):
        h.checklist("A", task, "state", {"node_id": by_title[label]["id"], "state": "Yes"})
    h.lifecycle("A", task, "progress", {"progress": 100})
    h.lifecycle("A", task, "transition", {"status": "Done"}, allowed=False)
    h.lifecycle("REV", task, "review", {"approved": True})
    h.lifecycle("B", task, "review", {"approved": True}, allowed=False)
    h.lifecycle("A", task, "transition", {"status": "Done"})
    status = h.table("DIR", "tasks", f"select=status,completed_date&id=eq.{task}")[0]
    if status["status"] != "Done" or not status["completed_date"]:
        raise AssertionError("Guarded completion did not persist")
    print("PASS hosted reviewer-only approval and guarded Done", flush=True)

    tools_source = h.task("TOOLS", assignee="B")
    h.tools("DIR", "support", {"sourceTaskId": tools_source, "startDate": today,
        "dueDate": "2026-10-25", "supportKind": "effort", "splitMode": "split-uneven",
        "amount": 3, "assigneeId": h.actors["A"]["id"], "reason": "M13 synthetic split"})
    source_scale = h.table("DIR", "tasks", f"select=task_scale&id=eq.{tools_source}")[0]["task_scale"]
    if Decimal(str(source_scale)) != 7:
        raise AssertionError("Support split failed to preserve 7-unit source")
    _, duplicate = h.tools("ENG", "duplicate", {"sourceTaskId": tools_source,
        "startDate": today, "dueDate": "2026-10-25"})
    copy_id = duplicate["items"][0]["taskId"]
    copied = h.table("DIR", "tasks", f"select=status,progress_percentage,task_scale&id=eq.{copy_id}")[0]
    if copied["status"] != "Not Started" or Decimal(str(copied["progress_percentage"])) != 0:
        raise AssertionError("Duplicate inherited execution state")
    previous_month = (date.fromisoformat(today).replace(day=1) - timedelta(days=1)).replace(day=1).isoformat()
    carry = h.task("CARRY", assignee="B")
    current_assigned = h.table("DIR", "tasks", f"select=assigned_date&id=eq.{carry}")[0]["assigned_date"]
    if current_assigned != previous_month:
        # Synthetic fixture setup in the *confirmed test project only*.
        h.sql(f"UPDATE public.tasks SET assigned_date='{previous_month}'::date WHERE id='{carry}'::uuid RETURNING id")
    h.lifecycle("B", carry, "progress", {"progress": 40})
    _, handoff = h.tools("DIR", "carryover", {"sourceTaskId": carry,
        "startDate": today, "dueDate": "2026-10-25", "targetMonth": today[:7],
        "reason": "M13 synthetic remaining-work handoff"})
    successor = h.table("DIR", "tasks", f"select=task_scale,progress_percentage&id=eq.{handoff['items'][0]['taskId']}")[0]
    if Decimal(str(successor["task_scale"])) != 6 or Decimal(str(successor["progress_percentage"])) != 0:
        raise AssertionError("Carryover did not transfer remaining scale 6")
    print("PASS hosted support split, duplicate reset and remaining-work carryover", flush=True)

    print("PASS M13 hosted core journey; no secrets printed", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workdir", required=True, type=Path)
    run(parser.parse_args().workdir)
