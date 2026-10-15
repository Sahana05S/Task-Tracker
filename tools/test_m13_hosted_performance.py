"""Launch one opt-in real M07 job using only the confirmed test project's key."""

import argparse
import os
import subprocess
from pathlib import Path

from test_m13_hosted_auth import EXPECTED_NAME, EXISTING_REF, cli

REF = "ngpmwzksekkpvrgoqngk"
ROOT = Path(__file__).resolve().parents[1]


def main(workdir):
    link = workdir / "supabase" / ".temp" / "project-ref"
    project = next((p for p in cli("projects", "list", "--output", "json") if p.get("id") == REF), None)
    if REF == EXISTING_REF or not project or project.get("name") != EXPECTED_NAME or \
       project.get("status") != "ACTIVE_HEALTHY" or not link.is_file() or \
       link.read_text(encoding="utf-8").strip() != REF:
        raise RuntimeError("Refusing unconfirmed worker project")
    keys = cli("projects", "api-keys", "--project-ref", REF, "--reveal", "--output", "json")
    service = next((k["api_key"] for k in keys if k.get("name") == "service_role"), None)
    if not service:
        raise RuntimeError("Test worker key missing")
    environment = os.environ.copy()
    environment.update({"M13_TEST_REF": REF, "M13_TEST_SERVICE_KEY": service})
    command = ["node", str(ROOT / "node_modules" / "vitest" / "vitest.mjs"), "run",
               "__tests__/lib/performance/hosted-worker.integration.test.ts"]
    run = subprocess.run(command, cwd=ROOT, env=environment, capture_output=True,
                         text=True, encoding="utf-8", errors="replace", timeout=180)
    safe = (run.stdout + run.stderr).replace(service, "[redacted]")
    print(safe.strip().encode("ascii", "backslashreplace").decode("ascii"))
    if run.returncode:
        raise RuntimeError("Hosted M07 worker integration failed")
    jobs = cli("db", "query", "--linked", "--project-ref", REF,
        "--workdir", str(workdir),
        "SELECT j.status,j.attempts,j.last_error_code,r.result->>'status' AS result_status "
        "FROM taskpulse_private.outbox_jobs j JOIN taskpulse_private.performance_runs r ON r.job_id=j.id "
        "WHERE j.kind IN ('performance_source_invalidated','performance_dated_invalidated') "
        "ORDER BY r.recorded_at DESC LIMIT 1")["rows"]
    if not jobs or jobs[0]["status"] != "blocked" or \
       jobs[0]["last_error_code"] != "required_inputs_unavailable" or \
       jobs[0]["result_status"] != "incomplete":
        raise AssertionError("M07 job did not retain incomplete missing-source evidence")
    print("PASS hosted recomputation job retained incomplete result and unavailable input code")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workdir", required=True, type=Path)
    main(parser.parse_args().workdir)
