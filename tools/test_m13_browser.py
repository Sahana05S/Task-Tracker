"""Run a synthetic browser smoke against local Next.js + the named hosted test.

No repository environment file is changed. Synthetic credentials and test API
keys exist only in the launcher and child-process environment during this run.
"""

import argparse
import os
import secrets
import socket
import subprocess
import sys
import time
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

from test_m13_hosted_auth import EXPECTED_NAME, EXISTING_REF, cli, request


ROOT = Path(__file__).resolve().parents[1]
TEST_REF = "ngpmwzksekkpvrgoqngk"
PORT = 3107


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workdir", required=True, type=Path)
    parser.add_argument("--reports", action="store_true", help="also smoke dashboard and reports")
    args = parser.parse_args()
    project = next((p for p in cli("projects", "list", "--output", "json") if p.get("id") == TEST_REF), None)
    link = args.workdir / "supabase" / ".temp" / "project-ref"
    if TEST_REF == EXISTING_REF or not project or project.get("name") != EXPECTED_NAME or \
       project.get("status") != "ACTIVE_HEALTHY" or not link.is_file() or \
       link.read_text(encoding="utf-8").strip() != TEST_REF:
        parser.error("Expected the isolated, healthy M13 test project and CLI link")
    rows = cli("db", "query", "--linked", "--project-ref", TEST_REF, "--workdir", str(args.workdir),
        "SELECT id,email FROM public.users WHERE employee_id='M13-F87E37-A'")["rows"]
    if len(rows) != 1 or not rows[0]["email"].endswith("@example.test"):
        parser.error("The known synthetic browser account is missing")
    keys = cli("projects", "api-keys", "--project-ref", TEST_REF, "--reveal", "--output", "json")
    by_name = {item["name"]: item["api_key"] for item in keys if item.get("name") in ("anon", "service_role")}
    if not by_name.get("anon") or not by_name.get("service_role"):
        raise RuntimeError("Test-only API keys are unavailable")
    browser_library = args.workdir / "browser-tools" / "node_modules" / "playwright-core"
    if not (browser_library / "package.json").is_file():
        parser.error("Temporary playwright-core installation is missing")
    with socket.socket() as probe:
        if probe.connect_ex(("127.0.0.1", PORT)) == 0:
            parser.error("Dedicated local browser-smoke port is already in use")

    password = secrets.token_urlsafe(30)
    status, _ = request(TEST_REF, by_name["service_role"], "PUT",
        f"/auth/v1/admin/users/{rows[0]['id']}", {"password": password}, by_name["service_role"])
    if status != 200:
        raise RuntimeError(f"Synthetic password refresh failed: HTTP {status}")
    app_env = os.environ.copy()
    app_env.update({
        "NEXT_PUBLIC_SUPABASE_URL": f"https://{TEST_REF}.supabase.co",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": by_name["anon"],
    })
    browser_env = app_env.copy()
    browser_env.update({
        "M13_TEST_REF": TEST_REF,
        "M13_TEST_EMAIL": rows[0]["email"],
        "M13_TEST_PASSWORD": password,
        "M13_PLAYWRIGHT_PATH": str(browser_library),
    })
    server_log = tempfile.TemporaryFile(mode="w+t", encoding="utf-8")
    server = subprocess.Popen(
        ["node", str(ROOT / "node_modules" / "next" / "dist" / "bin" / "next"),
         "dev", "--webpack", "-p", str(PORT)], cwd=ROOT, env=app_env,
        stdout=server_log, stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
    )
    try:
        ready = False
        for _ in range(90):
            if server.poll() is not None:
                raise RuntimeError("Isolated local Next.js server stopped before becoming ready")
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/login", timeout=3) as response:
                    ready = response.status == 200
            except (urllib.error.URLError, TimeoutError):
                pass
            if ready:
                break
            time.sleep(1)
        if not ready:
            raise RuntimeError("Isolated local Next.js server did not become ready")
        command = ["node", str(ROOT / "tools" / "test_m13_browser.mjs")]
        if args.reports:
            command.append("--reports")
        run = subprocess.run(command,
                             cwd=ROOT, env=browser_env, capture_output=True, text=True, timeout=420,
                             check=False)
        safe_output = (run.stdout + run.stderr).replace(password, "[redacted]")
        for value in by_name.values():
            safe_output = safe_output.replace(value, "[redacted]")
        if run.returncode:
            server_log.seek(0)
            server_output = server_log.read()[-2000:].replace(password, "[redacted]")
            for value in by_name.values():
                server_output = server_output.replace(value, "[redacted]")
            safe_output += f"\nLocal server tail: {server_output}"
            raise RuntimeError(f"Synthetic browser smoke failed (exit {run.returncode}): {safe_output[-1600:]}")
        print(safe_output.strip())
        print("PASS local app browser used only the hosted M13 test backend; no credentials printed")
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=10)
        server_log.close()


if __name__ == "__main__":
    main()
