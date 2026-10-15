"""Signed-in September archive/correction/export journey on the M13 test only."""

import argparse
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from test_m13_hosted_journey import Hosted, REF, operation


ROOT = Path(__file__).resolve().parents[1]
PORT = 3111
PERIOD = "2026-09-01"
FACT_DATE = "2026-09-12"


def main(workdir):
    h = Hosted(workdir)
    fact_rows = [row for row in h.table("DIR", "daily_facts",
        f"select=id,record_version,validation_state,fact&posted_by=eq.{h.actors['A']['id']}&fact_date=eq.{FACT_DATE}")
        if row["fact"].startswith("M13 September")]
    if len(fact_rows) > 1:
        raise AssertionError("Synthetic archive fact duplicated")
    if not fact_rows:
        created = h.api("A", "dated_record_command", {"p_kind": "fact", "p_id": None,
            "p_command": "save", "p_payload": {"business_date": FACT_DATE,
                "content": "M13 September archive fact"}, "p_expected_version": 0,
            "p_operation": operation()})
        fact_id = created["id"]
        h.api("DM", "dated_record_command", {"p_kind": "fact", "p_id": fact_id,
            "p_command": "validate", "p_payload": {"state": "validated",
                "reason": "Independent archive fixture review"},
            "p_expected_version": created["version"], "p_operation": operation()})
    else:
        fact_id = fact_rows[0]["id"]
    print("PASS independently reviewed dated archive fixture", flush=True)
    browser_library = workdir / "browser-tools" / "node_modules" / "playwright-core"
    if not (browser_library / "package.json").is_file():
        raise RuntimeError("Temporary browser library is unavailable")
    with socket.socket() as probe:
        if probe.connect_ex(("127.0.0.1", PORT)) == 0:
            raise RuntimeError("Dedicated archive browser port is in use")
    env = os.environ.copy()
    env.update({"NEXT_PUBLIC_SUPABASE_URL": f"https://{REF}.supabase.co",
                "NEXT_PUBLIC_SUPABASE_ANON_KEY": h.public})
    browser_env = env.copy()
    browser_env.update({"M13_TEST_REF": REF,
        "M13_PLAYWRIGHT_PATH": str(browser_library),
        "M13_DIR_EMAIL": h.actors["DIR"]["email"],
        "M13_DIR_PASSWORD": h.passwords["DIR"],
        "M13_A_EMAIL": h.actors["A"]["email"],
        "M13_A_PASSWORD": h.passwords["A"],
        "M13_B_EMAIL": h.actors["B"]["email"],
        "M13_B_PASSWORD": h.passwords["B"],
        "M13_DM_EMAIL": h.actors["DM"]["email"],
        "M13_DM_PASSWORD": h.passwords["DM"],
        "M13_A_ID": h.actors["A"]["id"],
        "M13_FACT_ID": fact_id})
    server_log = tempfile.TemporaryFile(mode="w+t", encoding="utf-8")
    server = subprocess.Popen(["node", str(ROOT / "node_modules" / "next" / "dist" / "bin" / "next"),
        "dev", "--webpack", "-p", str(PORT)], cwd=ROOT, env=env,
        stdout=server_log, stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
    def phase(name):
        run = subprocess.run(["node", str(ROOT / "tools" / "test_m13_archive_browser.mjs"), name],
            cwd=ROOT, env=browser_env, capture_output=True, text=True, timeout=600)
        output = run.stdout + run.stderr
        for secret in (h.public, h.admin, *h.passwords.values(), *h.tokens.values()):
            output = output.replace(secret, "[redacted]")
        if run.returncode:
            server_log.seek(0)
            server_output = server_log.read()[-1600:]
            for secret in (h.public, h.admin, *h.passwords.values(), *h.tokens.values()):
                server_output = server_output.replace(secret, "[redacted]")
            raise RuntimeError(f"Archive browser {name} failed: {output[-1200:]}\nServer: {server_output}")
        print(output.strip(), flush=True)
    try:
        for _ in range(90):
            if server.poll() is not None:
                raise RuntimeError("Temporary archive app stopped early")
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/login", timeout=2) as response:
                    if response.status == 200:
                        break
            except (urllib.error.URLError, TimeoutError):
                pass
            time.sleep(1)
        else:
            raise RuntimeError("Temporary archive app did not become ready")
        history = h.api("DIR", "month_archive_history", {"p_period": PERIOD})
        if history["state"] == "live":
            phase("close")
            history = h.api("DIR", "month_archive_history", {"p_period": PERIOD})
        if history["state"] == "closed" and len(history["revisions"]) == 1:
            phase("authorize")
            history = h.api("DIR", "month_archive_history", {"p_period": PERIOD})
        if history["state"] == "correction":
            current = h.table("DIR", "daily_facts", f"select=record_version,fact&id=eq.{fact_id}")
            if current[0]["fact"] != "M13 September corrected archive fact":
                h.api("DIR", "dated_record_command", {"p_kind": "fact", "p_id": fact_id,
                    "p_command": "save", "p_payload": {"business_date": FACT_DATE,
                        "content": "M13 September corrected archive fact",
                        "reason": "Director-scoped September correction"},
                    "p_expected_version": current[0]["record_version"], "p_operation": operation()})
            phase("revise")
        elif history["state"] == "closed" and len(history["revisions"]) >= 2:
            phase("verify")
        else:
            raise AssertionError("Browser close/correction has no retained archive revision")
        history = h.api("DIR", "month_archive_history", {"p_period": PERIOD})
        if history["state"] != "closed" or len(history["revisions"]) < 2:
            raise AssertionError("Browser revision was not retained")
        first = h.api("DIR", "month_archive_read", {"p_period": PERIOD,
            "p_revision": 1, "p_employee": None})
        last = h.api("DIR", "month_archive_read", {"p_period": PERIOD,
            "p_revision": len(history["revisions"]), "p_employee": None})
        if first["certification"] != "incomplete_uncertified" or \
           last["certification"] != "incomplete_uncertified" or \
           first["sourceInputs"] == last["sourceInputs"] or \
           last["monthlySelection"]["winnerId"] is not None:
            raise AssertionError("Archive revision/certification did not preserve evidence")
        print("PASS retained non-certified month revision, changed named fact, no winner", flush=True)
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
    main(parser.parse_args().workdir)
