"""Migration 31/32 regression on a disposable copy of the local hosted-data clone.

Task Tools previews must refuse planned new-task dates in a non-live month with
the same rule as the commit-time month guard, and must not allocate/reserve TT-
tags for a plan that cannot commit. The loopback PG18 recovery cluster only.
"""

import argparse
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = "taskpulse_m13_upgrade30"
TARGET = "taskpulse_m13_m31_regression"


def main(bin_dir):
    def psql(db, sql=None, file=None):
        command = [str(bin_dir / "psql.exe"), "-X", "-q", "-h", "127.0.0.1", "-p", "15433", "-U", "postgres",
                   "-d", db, "-v", "ON_ERROR_STOP=1", "-At"]
        command += ["-f", str(file)] if file else ["-c", sql]
        run = subprocess.run(command, capture_output=True, text=True)
        if run.returncode:
            raise RuntimeError(run.stderr.strip()[-400:])
        return run.stdout.strip()
    if psql("postgres", "SELECT inet_server_addr()||':'||inet_server_port()") not in ("127.0.0.1:15433", "127.0.0.1/32:15433"):
        raise RuntimeError("Refusing unexpected local database endpoint")
    psql("postgres", f"DROP DATABASE IF EXISTS {TARGET}")
    psql("postgres", f"CREATE DATABASE {TARGET} TEMPLATE {TEMPLATE}")
    try:
        for name in ("31_task_tools_closed_period_preview.sql", "32_task_tools_frozen_period_preview.sql"):
            psql(TARGET, file=ROOT / "supabase" / "migrations" / name)
        if psql(TARGET, "SELECT state FROM taskpulse_private.month_periods WHERE period_start='2026-09-01'") != "closed":
            raise AssertionError("Fixture lacks closed September")
        source = "(SELECT id FROM public.tasks WHERE task_tag='M13-F87E37-TOOLS')"
        def preview(command, payload):
            return psql(TARGET, "SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM public.users "
                        "WHERE employee_id='M13-F87E37-DIR'),false); "
                        f"SELECT (p->>'ready')||'|'||(p->'reasons')::text||'|'||coalesce(p->'items'->0->>'taskTag','NULL') "
                        f"FROM (SELECT public.task_tools_preview('{command}',jsonb_build_object('sourceTaskId',{source},{payload})) p) x")
        state = lambda: psql(TARGET, "SELECT (SELECT last_value FROM taskpulse_private.tools_tag_sequence)||'/'||"
                             "(SELECT count(*) FROM taskpulse_private.tool_tag_reservations)")
        before = state()
        for command, payload in (("duplicate", "'startDate','2026-09-12'"),
                                 ("duplicate", "'startDate','2026-08-20','dueDate','2026-09-05'"),
                                 ("weekly", "'startDate','2026-08-20','count',3")):
            ready, reasons, tag = preview(command, payload).splitlines()[-1].split("|")
            if ready != "false" or "closed_period_requires_named_correction" not in reasons or tag != "NULL":
                raise AssertionError(f"{command} {payload} not refused before allocation: {ready} {reasons} {tag}")
        if state() != before:
            raise AssertionError("Refused previews consumed or reserved task numbers")
        print("PASS closed-month previews refused with no TT- allocation or reservation")
        ready, _, tag = preview("duplicate", "'startDate','2026-08-20'").splitlines()[-1].split("|")
        if ready != "true" or not tag.startswith("TT-"):
            raise AssertionError("Open earlier-month duplicate is not committable")
        print(f"PASS open earlier-month (August) duplicate is ready and allocated {tag}")
        # A Final report over August freezes it for commit; preview must agree.
        psql(TARGET, "SET session_replication_role=replica; INSERT INTO public.report_snapshots"
             "(report_type,title,status,period_start,period_end) VALUES('general','M13 frozen fixture','Final',"
             "'2026-08-01','2026-08-31')")
        before = state()
        ready, reasons, tag = preview("duplicate", "'startDate','2026-08-20'").splitlines()[-1].split("|")
        if ready != "false" or "frozen_report_period_requires_revision" not in reasons or tag != "NULL" or state() != before:
            raise AssertionError(f"Frozen-period preview not refused before allocation: {ready} {reasons} {tag}")
        print("PASS frozen report period preview refused with no TT- allocation")
    finally:
        psql("postgres", f"DROP DATABASE IF EXISTS {TARGET}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bin-dir", required=True, type=Path)
    main(parser.parse_args().bin_dir)
