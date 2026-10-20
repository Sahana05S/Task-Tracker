"""Restore a decrypted nightly backup into a disposable local PostgreSQL and report it.

Free-plan backup drill (see docs/OPERATIONS.md "Database backups"). Decrypt the
artifact first (gpg --decrypt), then run, for example:

    python tools/restore_backup_drill.py --dump taskpulse-<stamp>.dump --bin-dir <pg17+ bin> --port 15432

The script refuses non-loopback servers and restores only into the fixed
database taskpulse_backup_drill, which it drops and recreates. It never reads
.env.local or connects to a hosted project. Supabase-only roles are created as
NOLOGIN placeholders so grants and policies restore; extensions that a plain
PostgreSQL lacks (pg_graphql, pg_net, supabase_vault, ...) are reported as
expected restore errors, not hidden. The drill fails if the migration ledger or
the application tables are missing after the restore.
"""

import argparse
import os
import re
import subprocess
from pathlib import Path


DRILL = "taskpulse_backup_drill"
SUPABASE_ROLES = (
    "anon", "authenticated", "service_role", "authenticator", "dashboard_user",
    "supabase_admin", "supabase_auth_admin", "supabase_storage_admin",
    "supabase_functions_admin", "supabase_realtime_admin", "supabase_replication_admin",
    "supabase_read_only_user", "pgbouncer", "pgsodium_keyholder", "pgsodium_keyiduser",
    "pgsodium_keymaker", "taskpulse_definer",
)
# Errors a plain PostgreSQL is expected to raise for Supabase-managed pieces.
EXPECTED = re.compile(
    r"extension \"[^\"]+\" is not available|could not open extension control file|"
    r"schema \"(?:extensions|graphql|graphql_public|net|pgsodium|vault|realtime|supabase_functions|pgbouncer)\"|"
    r"event trigger|publication|subscription|must be owner of|role \"[^\"]+\" does not exist",
    re.IGNORECASE,
)

# libpq settings that could silently redirect the hard-coded loopback endpoint.
LIBPQ_REDIRECTS = ("PGHOST", "PGHOSTADDR", "PGPORT", "PGDATABASE", "PGSERVICE", "PGSERVICEFILE", "PGUSER")
CLIENT_ENV = {key: value for key, value in os.environ.items() if key not in LIBPQ_REDIRECTS}


def run(command, *, check=True):
    result = subprocess.run(command, text=True, capture_output=True, check=False, env=CLIENT_ENV, encoding="utf-8")
    if check and result.returncode:
        raise RuntimeError(f"{Path(command[0]).name} failed: {result.stderr.strip()}")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dump", required=True, type=Path, help="decrypted pg_dump -Fc archive")
    parser.add_argument("--bin-dir", required=True, type=Path, help="PostgreSQL 17+ bin directory (psql, pg_restore)")
    parser.add_argument("--port", type=int, default=15432)
    args = parser.parse_args()
    if args.port != 15432:
        parser.error("The backup drill is restricted to loopback port 15432")
    if args.dump.suffix == ".gpg":
        parser.error("Decrypt the artifact first: gpg --decrypt --output <name>.dump <name>.dump.gpg")
    if not args.dump.is_file() or args.dump.stat().st_size == 0:
        parser.error(f"Dump file missing or empty: {args.dump}")

    def psql(database, statement):
        return run([
            str(args.bin_dir / "psql"), "-X", "-h", "127.0.0.1", "-p", str(args.port),
            "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-At", "-c", statement,
        ]).stdout.strip()

    identity = psql("postgres", r"\echo :HOST|:PORT") + "|" + psql("postgres", "SELECT current_database()")
    if identity != "127.0.0.1|15432|postgres":
        raise RuntimeError(f"Refusing unexpected database endpoint: {identity}")

    listing = run([str(args.bin_dir / "pg_restore"), "-l", str(args.dump)]).stdout
    archived_tables = sum(" TABLE DATA " in line for line in listing.splitlines())
    print(f"Archive: {args.dump.name}, {args.dump.stat().st_size} bytes, {archived_tables} tables with data")

    for role in SUPABASE_ROLES:
        psql("postgres", f"DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='{role}') THEN CREATE ROLE {role} NOLOGIN; END IF; END $$")
    psql("postgres", f"DROP DATABASE IF EXISTS {DRILL} WITH (FORCE)")
    psql("postgres", f"CREATE DATABASE {DRILL}")

    restore = run([
        str(args.bin_dir / "pg_restore"), "-h", "127.0.0.1", "-p", str(args.port), "-U", "postgres",
        "-d", DRILL, "--no-owner", str(args.dump),
    ], check=False)
    errors = [line for line in restore.stderr.splitlines() if "error:" in line.lower()]
    unexpected = [line for line in errors if not EXPECTED.search(line)]
    print(f"pg_restore: exit {restore.returncode}, {len(errors)} errors ({len(errors) - len(unexpected)} expected Supabase-only)")
    for line in unexpected[:30]:
        print("  UNEXPECTED", line)

    ledger_exists = psql(DRILL, "SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL")
    if ledger_exists != "t":
        raise RuntimeError("Migration ledger supabase_migrations.schema_migrations is missing after restore")
    ledger = psql(DRILL, "SELECT count(*)||'|'||coalesce((SELECT version FROM supabase_migrations.schema_migrations ORDER BY length(version) DESC, version DESC LIMIT 1),'none') FROM supabase_migrations.schema_migrations")
    count, latest = ledger.split("|")
    print(f"Migration ledger: {count} entries, max version {latest}")

    tables = psql(DRILL, "SELECT n.nspname||'.'||c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','taskpulse_private','auth') ORDER BY 1").splitlines()
    if not any(t.startswith("public.") for t in tables):
        raise RuntimeError("No public application tables were restored")
    print(f"Row counts ({len(tables)} tables):")
    for table in tables:
        schema, name = table.split(".", 1)
        rows = psql(DRILL, f'SELECT count(*) FROM "{schema}"."{name}"')
        print(f"  {table:<60} {rows:>10}")

    if unexpected:
        raise SystemExit(f"DRILL INCOMPLETE: {len(unexpected)} unexpected restore errors (listed above)")
    print(f"PASS backup drill: restored into {DRILL}; ledger max {latest}")


if __name__ == "__main__":
    main()
