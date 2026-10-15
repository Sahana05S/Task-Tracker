"""Deliver one synthetic award job through a temporary sandbox-only app worker.

The repository environment and permanent worker flags are untouched. No Drive
configuration is passed. A replay must not invent a certified winner.
"""

import argparse
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
from pathlib import Path

from test_m13_hosted_auth import EXPECTED_NAME, EXISTING_REF, cli, request


ROOT = Path(__file__).resolve().parents[1]
REF = "ngpmwzksekkpvrgoqngk"
PORT = 3109


def main(workdir, recover_only=False):
    link = workdir / "supabase" / ".temp" / "project-ref"
    project = next((p for p in cli("projects", "list", "--output", "json") if p.get("id") == REF), None)
    if REF == EXISTING_REF or not project or project.get("name") != EXPECTED_NAME or \
       project.get("status") != "ACTIVE_HEALTHY" or not link.is_file() or \
       link.read_text(encoding="utf-8").strip() != REF:
        raise RuntimeError("Refusing unconfirmed M13 worker destination")
    keys = cli("projects", "api-keys", "--project-ref", REF, "--reveal", "--output", "json")
    found = {k["name"]: k["api_key"] for k in keys if k.get("name") in ("anon", "service_role")}
    service, anon = found["service_role"], found["anon"]
    with socket.socket() as probe:
        if probe.connect_ex(("127.0.0.1", PORT)) == 0:
            raise RuntimeError("Dedicated local worker port is occupied")
    def sql(query):
        return cli("db", "query", "--linked", "--project-ref", REF,
                   "--workdir", str(workdir), query)["rows"]
    yesterday = sql("SELECT ((clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date-1) AS day")[0]["day"]
    if not yesterday.startswith("2026-10-"):
        raise RuntimeError("Expected the approved October synthetic test period")
    if not recover_only:
        status, _ = request(REF, service, "POST", "/rest/v1/rpc/award_command", {
            "p_command": "request", "p_payload": {"date": yesterday},
            "p_operation": str(uuid.uuid4())}, service)
        if status != 200:
            raise AssertionError(f"Synthetic award request failed: HTTP {status}")
    worker_token = secrets.token_urlsafe(32)
    environment = os.environ.copy()
    environment.update({
        "NEXT_PUBLIC_SUPABASE_URL": f"https://{REF}.supabase.co",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": anon,
        "SUPABASE_SERVICE_ROLE_KEY": service,
        "TASKPULSE_AWARD_WORKER_ENABLED": "sandbox",
        "TASKPULSE_AWARD_WORKER_TOKEN": worker_token,
        "TASKPULSE_DRIVE_WORKER_ENABLED": "",
    })
    server_log = tempfile.TemporaryFile(mode="w+t", encoding="utf-8")
    server = subprocess.Popen(["node", str(ROOT / "node_modules" / "next" / "dist" / "bin" / "next"),
        "dev", "--webpack", "-p", str(PORT)], cwd=ROOT, env=environment,
        stdout=server_log, stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
    def deliver(token):
        req = urllib.request.Request(f"http://127.0.0.1:{PORT}/api/internal/awards",
            data=b"{}", headers={"Content-Type": "application/json",
                                  "Authorization": f"Bearer {token}"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=90) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())
    try:
        for _ in range(90):
            if server.poll() is not None:
                raise RuntimeError("Temporary worker process stopped early")
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/login", timeout=2) as response:
                    if response.status == 200:
                        break
            except (urllib.error.URLError, TimeoutError):
                pass
            time.sleep(1)
        else:
            raise RuntimeError("Temporary worker did not become ready")
        forbidden, _ = deliver("forged-test-worker-token")
        if forbidden != 403:
            raise AssertionError(f"Forged worker token accepted: HTTP {forbidden}")
        if recover_only:
            failed = sql("SELECT j.id,j.status FROM taskpulse_private.award_slots s "
                "JOIN taskpulse_private.outbox_jobs j ON j.entity_id=s.id AND j.kind='award_daily' "
                f"WHERE s.business_date='{yesterday}'::date ORDER BY j.created_at DESC LIMIT 1")
            if len(failed) != 1 or failed[0]["status"] != "failed":
                raise AssertionError("Expected retained synthetic award failure for retry")
            sql(f"UPDATE taskpulse_private.outbox_jobs SET available_at=clock_timestamp() "
                f"WHERE id='{failed[0]['id']}'::uuid AND status='failed' RETURNING id")
            retry_status, retry = deliver(worker_token)
            if retry_status != 200 or len(retry.get("outcomes", [])) != 1 or \
               retry["outcomes"][0]["status"] != "blocked":
                raise AssertionError(f"Failed award did not recover to blocked: HTTP {retry_status}")
            replay_status, replay = deliver(worker_token)
            if replay_status != 200 or replay.get("outcomes"):
                raise AssertionError("Recovered award replay was not empty")
            latest = sql("SELECT j.status,j.attempts,r.certified,r.result->>'status' AS result_status,"
                "r.result->>'winnerId' AS winner FROM taskpulse_private.award_slots s "
                "JOIN taskpulse_private.outbox_jobs j ON j.entity_id=s.id AND j.kind='award_daily' "
                "LEFT JOIN taskpulse_private.award_runs r ON r.id=s.latest_run "
                f"WHERE s.business_date='{yesterday}'::date ORDER BY j.created_at DESC LIMIT 1")
            if latest[0]["status"] != "blocked" or latest[0]["result_status"] != "blocked" or \
               latest[0]["certified"] or latest[0]["winner"] or latest[0]["attempts"] < 3:
                raise AssertionError("Recovered award did not retain safe incomplete outcome")
            print("PASS failed hosted award lease recovered to blocked, no winner/certification; replay empty", flush=True)
            return
        first_status, first = deliver(worker_token)
        if first_status != 200 or not isinstance(first.get("outcomes"), list):
            raise AssertionError(f"Award delivery failed: HTTP {first_status}")
        retry_day = sql("SELECT ((clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date-2) AS day")[0]["day"]
        status, _ = request(REF, service, "POST", "/rest/v1/rpc/award_command", {
            "p_command": "request", "p_payload": {"date": retry_day},
            "p_operation": str(uuid.uuid4())}, service)
        if status != 200:
            raise AssertionError(f"Retry fixture request failed: HTTP {status}")
        status, leases = request(REF, service, "POST", "/rest/v1/rpc/claim_award_jobs",
                                 {"p_limit": 1}, service)
        if status != 200 or len(leases) != 1 or leases[0]["date"] != retry_day:
            raise AssertionError("Retry fixture was not leased")
        lease = leases[0]
        status, _ = request(REF, service, "POST", "/rest/v1/rpc/award_command", {
            "p_command": "fail", "p_payload": {"jobId": lease["id"],
                "leaseToken": lease["leaseToken"], "expectedVersion": lease["version"],
                "errorCode": "source_query_failed"}, "p_operation": lease["leaseToken"]}, service)
        if status != 200:
            raise AssertionError(f"Controlled transient failure was not retained: HTTP {status}")
        failed = sql(f"SELECT status,attempts,last_error_code FROM taskpulse_private.outbox_jobs WHERE id='{lease['id']}'::uuid")
        if failed != [{"status": "failed", "attempts": 1, "last_error_code": "source_query_failed"}]:
            raise AssertionError("Controlled failure has no durable retry state")
        # Advance only this synthetic job's retry clock in the confirmed test DB.
        sql(f"UPDATE taskpulse_private.outbox_jobs SET available_at=clock_timestamp() "
            f"WHERE id='{lease['id']}'::uuid AND status='failed' RETURNING id")
        retry_status, retry = deliver(worker_token)
        if retry_status != 200 or len(retry.get("outcomes", [])) != 1:
            raise AssertionError(f"Failed job was not retried by worker: HTTP {retry_status}")
        recovered = sql(f"SELECT status,attempts,last_error_code FROM taskpulse_private.outbox_jobs WHERE id='{lease['id']}'::uuid")
        if recovered[0]["attempts"] != 2 or recovered[0]["status"] not in ("blocked", "complete"):
            raise AssertionError("Retry did not retain second attempt and bounded outcome")
        second_status, second = deliver(worker_token)
        if second_status != 200 or second.get("outcomes"):
            raise AssertionError(f"Award replay produced another effective delivery: HTTP {second_status}")
        jobs = sql("SELECT j.id,j.status,j.attempts,j.last_error_code,s.business_date,"
                   "r.certified,r.result->>'status' AS result_status,r.result->>'winnerId' AS winner "
                   "FROM taskpulse_private.award_slots s JOIN taskpulse_private.outbox_jobs j "
                   "ON j.entity_id=s.id AND j.kind='award_daily' "
                   "LEFT JOIN taskpulse_private.award_runs r ON r.id=s.latest_run "
                   f"WHERE s.business_date='{yesterday}'::date ORDER BY j.created_at DESC LIMIT 1")
        if len(jobs) != 1 or jobs[0]["certified"] or jobs[0]["winner"] or \
           jobs[0]["result_status"] not in ("blocked", "failed"):
            raise AssertionError(f"Missing-sales award was not blocked: {jobs}")
        print(f"PASS sandbox award delivery: {len(first['outcomes'])} outcome(s), "
              f"{jobs[0]['result_status']}, no winner/certification", flush=True)
        print("PASS controlled failed lease, later delivered retry, forged token denial and zero-outcome replay", flush=True)
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=10)
        server_log.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workdir", type=Path, required=True)
    parser.add_argument("--recover-only", action="store_true")
    args = parser.parse_args()
    main(args.workdir, args.recover_only)
