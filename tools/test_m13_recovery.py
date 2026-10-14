"""Rehearse logical backup/restore of the M12 disposable PostgreSQL fixture.

Run test_m12_database.py first. This script refuses non-loopback servers and
database names outside the fixed disposable pair. It never connects to the
configured Supabase project or reads application secrets.
"""

import argparse
import hashlib
import subprocess
import tempfile
from pathlib import Path


SOURCE = "taskpulse_m12_upgrade_test"
RESTORED = "taskpulse_m13_restored_test"
TABLES = (
    "public.users",
    "public.tasks",
    "public.daily_facts",
    "public.report_snapshots",
    "public.monthly_performance_snapshots",
    "taskpulse_private.month_periods",
    "taskpulse_private.month_revisions",
    "taskpulse_private.month_revision_members",
    "taskpulse_private.month_receipts",
)


def run(command, *, input_text=None):
    result = subprocess.run(command, input=input_text, text=True, capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError(f"{Path(command[0]).name} failed: {result.stderr.strip()}")
    return result.stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bin-dir", required=True, type=Path)
    parser.add_argument("--port", type=int, default=15432)
    args = parser.parse_args()
    if args.port != 15432:
        parser.error("M13 recovery rehearsal is restricted to loopback port 15432")

    def psql(database, statement):
        return run([
            str(args.bin_dir / "psql"), "-X", "-h", "127.0.0.1", "-p", str(args.port),
            "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-At", "-c", statement,
        ])

    identity = psql(SOURCE, "SELECT current_database() || '|' || inet_server_addr() || '|' || inet_server_port()")
    if identity not in (f"{SOURCE}|127.0.0.1|15432", f"{SOURCE}|127.0.0.1/32|15432"):
        raise RuntimeError(f"Refusing unexpected database endpoint: {identity}")

    def digest(database, table):
        # Each row is included, without depending on physical or insertion order.
        return psql(database, f"SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) FROM {table} AS t")

    before = {table: digest(SOURCE, table) for table in TABLES}
    count_before = psql(SOURCE, "SELECT count(*) FROM taskpulse_private.month_revisions")
    if int(count_before) < 3:
        raise RuntimeError("M12 source fixture lacks the retained revision chain")

    with tempfile.TemporaryDirectory(prefix="taskpulse-m13-backup-") as temp:
        archive = Path(temp) / "disposable.dump"
        run([
            str(args.bin_dir / "pg_dump"), "-h", "127.0.0.1", "-p", str(args.port),
            "-U", "postgres", "-d", SOURCE, "-Fc", "-f", str(archive),
        ])
        if archive.stat().st_size == 0:
            raise RuntimeError("Backup is empty")
        backup_digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        psql("postgres", f"DROP DATABASE IF EXISTS {RESTORED} WITH (FORCE)")
        psql("postgres", f"CREATE DATABASE {RESTORED}")
        run([
            str(args.bin_dir / "pg_restore"), "-h", "127.0.0.1", "-p", str(args.port),
            "-U", "postgres", "-d", RESTORED, "--no-owner", "--no-acl", "--exit-on-error", str(archive),
        ])
        after = {table: digest(RESTORED, table) for table in TABLES}
        if before != after:
            raise RuntimeError(f"Restored row mismatch: {[t for t in TABLES if before[t] != after[t]]}")
        if psql(RESTORED, "SELECT count(*) FROM taskpulse_private.month_revisions") != count_before:
            raise RuntimeError("Restored revision count mismatch")
        if psql(RESTORED, "SELECT count(*) FROM taskpulse_private.month_periods WHERE state='closed'") != "1":
            raise RuntimeError("Restored closed archive is missing")
        print(f"PASS disposable backup/restore: {len(TABLES)} table digests, {count_before} retained revisions, SHA-256 {backup_digest}")


if __name__ == "__main__":
    main()
