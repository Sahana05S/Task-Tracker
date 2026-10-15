"""Signed-in core-workflow browser acceptance on the M13 test project only.

Sessions come from one-time admin magic-link tokens (no email, no password
reset). A temporary local Next.js process points at the confirmed test ref.
Each phase in tools/test_m13_core_browser.mjs inspects persisted state first,
so reruns reuse the bounded synthetic records instead of duplicating them.
"""

import argparse
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from test_m13_hosted_journey import Hosted, REF


ROOT = Path(__file__).resolve().parents[1]
PORT = 3111


def main(workdir, phases):
    h = Hosted(workdir, reset_passwords=False)
    browser_library = workdir / "browser-tools" / "node_modules" / "playwright-core"
    if not (browser_library / "package.json").is_file():
        raise RuntimeError("Temporary browser library is unavailable")
    existing = os.environ.get("M13_EXISTING_SERVER")
    if not existing:
        with socket.socket() as probe:
            if probe.connect_ex(("127.0.0.1", PORT)) == 0:
                raise RuntimeError("Dedicated browser port is in use")
    secrets = [h.public, h.admin, *h.tokens.values(),
               *(s["refresh_token"] for s in h.sessions.values())]
    def redact(text):
        for secret in secrets:
            text = text.replace(secret, "[redacted]")
        return text
    env = os.environ.copy()
    env.update({"NEXT_PUBLIC_SUPABASE_URL": f"https://{REF}.supabase.co",
                "NEXT_PUBLIC_SUPABASE_ANON_KEY": h.public})
    browser_env = env.copy()
    browser_env.update({"M13_TEST_REF": REF, "M13_PLAYWRIGHT_PATH": str(browser_library),
        "M13_BASE": existing or f"http://localhost:{PORT}",
        "M13_SESSIONS": json.dumps(h.sessions),
        "M13_ACTORS": json.dumps({c: {"id": a["id"], "employeeId": a["employee_id"]}
                                  for c, a in h.actors.items()})})
    server_log = tempfile.TemporaryFile(mode="w+t", encoding="utf-8")
    # An existing server must already point at the confirmed test project.
    server = None if existing else subprocess.Popen(["node", str(ROOT / "node_modules" / "next" / "dist" / "bin" / "next"),
        "dev", "--webpack", "-p", str(PORT)], cwd=ROOT, env=env, stdout=server_log,
        stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
    failed = []
    try:
        for _ in range(120):
            if server is not None and server.poll() is not None:
                raise RuntimeError("Temporary app stopped early")
            try:
                with urllib.request.urlopen(f"{existing or f'http://127.0.0.1:{PORT}'}/login", timeout=2) as response:
                    if response.status == 200:
                        break
            except (urllib.error.URLError, TimeoutError):
                pass
            time.sleep(1)
        else:
            raise RuntimeError("Temporary app did not become ready")
        for phase in phases:
            run = subprocess.run(["node", str(ROOT / "tools" / "test_m13_core_browser.mjs"), phase],
                cwd=ROOT, env=browser_env, capture_output=True, text=True, encoding="utf-8",
                errors="replace", timeout=900)
            print(redact((run.stdout + run.stderr).strip()), flush=True)
            if run.returncode:
                failed.append(phase)
                server_log.seek(0)
                print("SERVER TAIL:\n" + redact(server_log.read()[-2500:]), flush=True)
    finally:
        if server is not None:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=10)
        server_log.close()
    if failed:
        raise SystemExit(f"FAILED phases: {failed}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workdir", type=Path, required=True)
    parser.add_argument("phases", nargs="+")
    args = parser.parse_args()
    main(args.workdir, args.phases)
