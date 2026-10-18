"""Rebuild confirmed hosted synthetic table rows in a separate loopback PG18 DB.

This is a constrained application-table logical rehearsal, not pg_dump/PITR:
Supabase managed Auth configuration, roles, Storage and secrets are excluded.
Superseded diagnosis: the clone's timer CHECK tolerance was attributed to
PG17/PG18 division, but the cause is this procedure. The Supabase CLI prints
numbers nested in jsonb as float64, rounding numerics. See
test_m13_hosted_restore_exact.py for the exact-text, unmodified-schema restore.
No current hosted rows are changed. Private row JSON stays in the named temp
recovery directory and is never printed or copied into the repository.
"""

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

from test_m13_hosted_auth import EXPECTED_NAME, EXISTING_REF, cli
from test_m13_hosted_restore_verify import main as verify


REF = "ngpmwzksekkpvrgoqngk"
DATABASE = "taskpulse_m13_hosted_clone"
ROOT = Path(__file__).resolve().parents[1]
PORT = "15433"
BOOTSTRAP = """
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}',raw_app_meta_data jsonb DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon,authenticated,service_role;
"""


def quoted(value):
    return "'" + value.replace("'", "''") + "'"


def main(workdir, recovery, bin_dir):
    link = workdir / "supabase" / ".temp" / "project-ref"
    project = next((p for p in cli("projects", "list", "--output", "json") if p.get("id") == REF), None)
    if REF == EXISTING_REF or not project or project.get("name") != EXPECTED_NAME or \
       project.get("status") != "ACTIVE_HEALTHY" or not link.is_file() or \
       link.read_text(encoding="utf-8").strip() != REF:
        raise RuntimeError("Refusing unconfirmed hosted source")
    if recovery.name != "taskpulse-m13-recovery-7e6d914" or not recovery.is_dir() or \
       not (recovery / "data" / "PG_VERSION").is_file():
        raise RuntimeError("Refusing unverified isolated local recovery directory")
    def psql(db, statement):
        run = subprocess.run([str(bin_dir / "psql.exe"), "-X", "-h", "127.0.0.1",
            "-p", PORT, "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-At"],
            input=statement, capture_output=True, text=True)
        if run.returncode:
            raise RuntimeError(f"Isolated psql failed in {db}; inspect private recovery log")
        return run.stdout.strip()
    endpoint = psql("postgres", "SELECT inet_server_addr()||':'||inet_server_port()")
    if endpoint not in ("127.0.0.1:15433", "127.0.0.1/32:15433"):
        raise RuntimeError("Refusing unexpected local database endpoint")
    exists = psql("postgres", f"SELECT count(*) FROM pg_database WHERE datname='{DATABASE}'")
    if exists != "0":
        raise RuntimeError("Restore target already exists; preserve prior evidence")
    hosted = cli("db", "query", "--linked", "--project-ref", REF,
        "--workdir", str(workdir),
        "SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN "
        "('public','taskpulse_private') ORDER BY schemaname,tablename")["rows"]
    if len(hosted) != 68:
        raise RuntimeError("Unexpected hosted application table catalog")
    names = [f"{r['schemaname']}.{r['tablename']}" for r in hosted]
    snapshots = {}
    for offset in range(0, len(names), 12):
        group = names[offset:offset+12]
        parts = []
        for name in group:
            parts += [quoted(name), f"(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM {name} t)"]
        query = "SELECT jsonb_build_object(" + ",".join(parts) + ") AS snapshot"
        rows = cli("db", "query", "--linked", "--project-ref", REF,
                   "--workdir", str(workdir), query)["rows"]
        snapshots.update(rows[0]["snapshot"])
    auth = cli("db", "query", "--linked", "--project-ref", REF,
        "--workdir", str(workdir),
        "SELECT id,email,raw_user_meta_data,raw_app_meta_data FROM auth.users "
        "WHERE email LIKE 'm13-%@example.test' ORDER BY id")["rows"]
    if len(auth) != 7 or len(snapshots.get("public.users", [])) != 7:
        raise RuntimeError("Hosted source is not the bounded seven-user synthetic set")
    source = {"auth.users": auth, **snapshots}
    backup = recovery / "hosted-synthetic-application-tables.json"
    backup.write_text(json.dumps(source, sort_keys=True, separators=(",", ":")), encoding="utf-8")
    digest = hashlib.sha256(backup.read_bytes()).hexdigest()
    print(f"PASS hosted synthetic table capture: {len(names)} app tables, seven Auth IDs, SHA-256 {digest}", flush=True)
    psql("postgres", f"CREATE DATABASE {DATABASE} WITH ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0")
    psql(DATABASE, BOOTSTRAP)
    migrations = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
    if len(migrations) != 29:
        raise RuntimeError("Expected local migrations 01–29 only")
    for path in migrations:
        run = subprocess.run([str(bin_dir / "psql.exe"), "-X", "-h", "127.0.0.1",
            "-p", PORT, "-U", "postgres", "-d", DATABASE, "-v", "ON_ERROR_STOP=1",
            "-q", "-f", str(path)], capture_output=True, text=True)
        if run.returncode:
            raise RuntimeError(f"Local PG18 migration failed: {path.name}; database preserved")
    print("PASS isolated PG18 fresh schema 01–29 for hosted-source recovery", flush=True)
    psql(DATABASE, "ALTER TABLE public.daily_task_logs DROP CONSTRAINT timer_segment_consistent; "
        "ALTER TABLE public.daily_task_logs ADD CONSTRAINT timer_segment_consistent CHECK ("
        "CASE WHEN timer_segment_number IS NULL THEN timer_segment_start IS NULL AND timer_segment_end IS NULL "
        "AND timer_duration_seconds IS NULL ELSE source_timer_id IS NOT NULL AND timer_segment_number>=0 "
        "AND timer_segment_start IS NOT NULL AND timer_segment_end>timer_segment_start "
        "AND timer_duration_seconds>0 AND timer_duration_seconds=extract(epoch FROM timer_segment_end-timer_segment_start) "
        "AND abs(hours_worked*3600-timer_duration_seconds)<0.000000000000001 "
        "AND log_date=(timer_segment_start AT TIME ZONE 'Asia/Kolkata')::date "
        "AND timer_segment_end<=((log_date+1)::timestamp AT TIME ZONE 'Asia/Kolkata') END)")
    columns = psql(DATABASE, "SELECT n.nspname||'.'||c.relname||'|'||string_agg(quote_ident(a.attname),',' ORDER BY a.attnum) "
        "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
        "JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped "
        "AND a.attgenerated='' "
        "WHERE c.relkind='r' AND n.nspname IN ('public','taskpulse_private','auth') "
        "GROUP BY n.nspname,c.relname ORDER BY n.nspname,c.relname")
    colmap = dict(line.split("|", 1) for line in columns.splitlines())
    if set(names) - set(colmap):
        raise RuntimeError("Local schema is missing hosted tables")
    statements = ["BEGIN;", "SET LOCAL session_replication_role=replica;",
                  "TRUNCATE " + ",".join(["auth.users", *names]) + " RESTART IDENTITY CASCADE;"]
    for name in ["auth.users", *names]:
        rows = source[name]
        if not rows:
            continue
        cols = colmap[name]
        literal = quoted(json.dumps(rows, separators=(",", ":")))
        statements.append(f"INSERT INTO {name} ({cols}) OVERRIDING SYSTEM VALUE SELECT {cols} "
                          f"FROM jsonb_populate_recordset(NULL::{name},{literal}::jsonb);")
    for table,column in (("taskpulse_private.audit_events","id"),
                         ("taskpulse_private.performance_observations","revision"),
                         ("taskpulse_private.presentation_history","sequence")):
        statements.append(f"SELECT setval(pg_get_serial_sequence('{table}','{column}'),"
                          f"coalesce((SELECT max({column}) FROM {table}),1),true);")
    statements.append("COMMIT;")
    restore_script = recovery / "restore-synthetic-rows.sql"
    restore_script.write_text("\n".join(statements), encoding="utf-8")
    run = subprocess.run([str(bin_dir / "psql.exe"), "-X", "-h", "127.0.0.1",
        "-p", PORT, "-U", "postgres", "-d", DATABASE, "-v", "ON_ERROR_STOP=1",
        "-q", "-f", str(restore_script)], capture_output=True, text=True)
    if run.returncode:
        raise RuntimeError("Isolated hosted-table restore failed; files/database preserved for diagnosis")
    comparisons = []
    for name in names:
        original = len(source[name])
        restored = int(psql(DATABASE, f"SELECT count(*) FROM {name}"))
        if restored != original:
            raise AssertionError(f"Restored count mismatch: {name}")
        comparisons.append((name, original))
    revisions = psql(DATABASE, "SELECT count(*) FROM taskpulse_private.month_revisions")
    if int(revisions) < 2:
        raise AssertionError("Retained hosted revisions are missing")
    print(f"PASS isolated hosted application-table restore: {len(comparisons)} table counts, "
          f"{revisions} revisions; no hosted mutation", flush=True)
    verify(recovery,bin_dir)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workdir", required=True, type=Path)
    parser.add_argument("--recovery", required=True, type=Path)
    parser.add_argument("--bin-dir", required=True, type=Path)
    args = parser.parse_args()
    main(args.workdir, args.recovery, args.bin_dir)
