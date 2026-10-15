"""Exact-text restore of hosted synthetic tables into an unmodified local schema.

Corrects the earlier JSON rehearsal. The Supabase CLI prints numbers nested in
jsonb as float64, so that capture rounded numerics, e.g. timer hours_worked,
and the clone needed a CHECK tolerance. Here each hosted table is returned as
jsonb *text* with a digest taken in the same hosted statement. The tables are
imported into a fresh 01–29 local schema with no constraint change and compared
by digest. Then the clone takes a same-version PG18 pg_dump/pg_restore round
trip that is compared the same way. Hosted access is read-only; row contents are
never printed. This is still not a Supabase Auth/Storage/config backup or PITR.
"""

import argparse
import json
import subprocess
from pathlib import Path

from test_m13_hosted_auth import EXPECTED_NAME, EXISTING_REF, cli
from test_m13_hosted_restore import BOOTSTRAP, quoted


REF = "ngpmwzksekkpvrgoqngk"
CLONE = "taskpulse_m13_exact_clone"
ROUNDTRIP = "taskpulse_m13_exact_dumprestore"
ROOT = Path(__file__).resolve().parents[1]
PORT = "15433"
SESSION = "SET TIME ZONE 'UTC'; SET extra_float_digits=1; SET IntervalStyle='postgres'; "
AUTH = "(SELECT id,email,raw_user_meta_data,raw_app_meta_data FROM auth.users{where})"


def rows_text(source):
    return f"(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb)::text FROM {source} t)"


def digest(source):
    # Same canonical jsonb text and byte ordering on both servers.
    return (f"(SELECT count(*)||':'||md5(coalesce(string_agg(x,E'\\n' ORDER BY x COLLATE \"C\"),'')) "
            f"FROM (SELECT to_jsonb(t)::text x FROM {source} t) s)")


CONSTRAINTS = ("SELECT md5(string_agg(n.nspname||'.'||c.relname||'.'||k.conname||'='||pg_get_constraintdef(k.oid),"
               "E'\\n' ORDER BY n.nspname||'.'||c.relname||'.'||k.conname COLLATE \"C\")) FROM pg_constraint k "
               "JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace "
               "WHERE n.nspname IN ('public','taskpulse_private') AND k.contype<>'n'")
TIMER_CHECK = ("SELECT pg_get_constraintdef(oid) FROM pg_constraint "
               "WHERE conname='timer_segment_consistent'")


def main(workdir, recovery, bin_dir):
    link = workdir / "supabase" / ".temp" / "project-ref"
    project = next((p for p in cli("projects", "list", "--output", "json") if p.get("id") == REF), None)
    if REF == EXISTING_REF or not project or project.get("name") != EXPECTED_NAME or \
       project.get("status") != "ACTIVE_HEALTHY" or not link.is_file() or \
       link.read_text(encoding="utf-8").strip() != REF:
        raise RuntimeError("Refusing unconfirmed hosted source")
    if recovery.name != "taskpulse-m13-recovery-7e6d914" or not (recovery / "data" / "PG_VERSION").is_file():
        raise RuntimeError("Refusing unverified isolated local recovery directory")
    capture, script, dump = (recovery / "exact-capture.json", recovery / "exact-restore.sql",
                             recovery / "exact-clone.dump")
    if any(path.exists() for path in (capture, script, dump)):
        raise RuntimeError("Exact rehearsal files exist; preserve prior evidence")

    def hosted(query):
        return cli("db", "query", "--linked", "--project-ref", REF, "--workdir", str(workdir),
                   SESSION + query)["rows"]

    def psql(db, statement=None, file=None, session=True):
        command = [str(bin_dir / "psql.exe"), "-X", "-q", "-h", "127.0.0.1", "-p", PORT, "-U", "postgres",
                   "-d", db, "-v", "ON_ERROR_STOP=1", "-At"]
        command += ["-f", str(file)] if file else ["-c", (SESSION if session else "") + statement]
        run = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if run.returncode:
            raise RuntimeError(f"Isolated psql failed in {db}: {run.stderr.strip()[-400:]}")
        return run.stdout.strip()

    if psql("postgres", "SELECT inet_server_addr()||':'||inet_server_port()") not in \
       ("127.0.0.1:15433", "127.0.0.1/32:15433"):
        raise RuntimeError("Refusing unexpected local database endpoint")
    for db in (CLONE, ROUNDTRIP):
        if psql("postgres", f"SELECT count(*) FROM pg_database WHERE datname='{db}'") != "0":
            raise RuntimeError(f"{db} exists; preserve prior evidence")

    names = [f"{r['schemaname']}.{r['tablename']}" for r in hosted(
        "SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','taskpulse_private') "
        "ORDER BY schemaname,tablename")]
    if len(names) != 68:
        raise RuntimeError("Unexpected hosted application table catalog")
    auth = AUTH.format(where=" WHERE email LIKE 'm13-%@example.test'")
    sources = {"auth.users": auth, **{name: name for name in names}}
    texts, digests = {}, {}
    keys = list(sources)
    for offset in range(0, len(keys), 8):
        group = keys[offset:offset + 8]
        columns = []
        for i, name in enumerate(group):
            columns += [f"{rows_text(sources[name])} AS r{i}", f"{digest(sources[name])} AS d{i}"]
        row = hosted("SELECT " + ",".join(columns))[0]
        for i, name in enumerate(group):
            texts[name], digests[name] = row[f"r{i}"], row[f"d{i}"]
    if not digests["auth.users"].startswith("7:") or not digests["public.users"].startswith("7:"):
        raise RuntimeError("Hosted source is not the bounded seven-user synthetic set")
    hosted_constraints = hosted(CONSTRAINTS)[0]["md5"]
    hosted_timer = hosted(TIMER_CHECK)[0]["pg_get_constraintdef"]
    capture.write_text(json.dumps({"tables": texts, "digests": digests}, sort_keys=True), encoding="utf-8")
    print(f"PASS read-only exact-text capture: {len(names)} app tables + 7 Auth rows with hosted digests",
          flush=True)

    psql("postgres", f"CREATE DATABASE {CLONE} WITH ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0", session=False)
    psql(CLONE, BOOTSTRAP)
    migrations = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
    if len(migrations) != 29:
        raise RuntimeError("Expected local migrations 01–29 only")
    for path in migrations:
        psql(CLONE, file=path)
    if psql(CLONE, TIMER_CHECK) != hosted_timer:
        raise AssertionError("Local timer CHECK differs from hosted definition")
    print("PASS fresh PG18 01–29 schema; timer_segment_consistent identical to hosted (unmodified)",
          flush=True)

    colmap = dict(line.split("|", 1) for line in psql(CLONE,
        "SELECT n.nspname||'.'||c.relname||'|'||string_agg(quote_ident(a.attname),',' ORDER BY a.attnum) "
        "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid "
        "AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='' WHERE c.relkind='r' "
        "AND n.nspname IN ('public','taskpulse_private','auth') GROUP BY n.nspname,c.relname").splitlines())
    statements = ["BEGIN;", "SET LOCAL session_replication_role=replica;",
                  "TRUNCATE " + ",".join(keys) + " RESTART IDENTITY CASCADE;"]
    for name in keys:
        if texts[name] == "[]":
            continue
        cols = colmap[name]
        statements.append(f"INSERT INTO {name} ({cols}) OVERRIDING SYSTEM VALUE SELECT {cols} "
                          f"FROM jsonb_populate_recordset(NULL::{name},{quoted(texts[name])}::jsonb);")
    for table, column in (("taskpulse_private.audit_events", "id"),
                          ("taskpulse_private.performance_observations", "revision"),
                          ("taskpulse_private.presentation_history", "sequence")):
        statements.append(f"SELECT setval(pg_get_serial_sequence('{table}','{column}'),"
                          f"coalesce((SELECT max({column}) FROM {table}),1),true);")
    statements.append("COMMIT;")
    script.write_text("\n".join(statements), encoding="utf-8")
    psql(CLONE, file=script)
    # CHECK constraints are enforced even with session_replication_role=replica
    # (only triggers, including FK triggers, are skipped); pg_restore below
    # re-creates foreign keys after loading data, which validates them too.
    if psql(CLONE, TIMER_CHECK) != hosted_timer:
        raise AssertionError("Timer CHECK changed during import")
    print("PASS all hosted rows satisfy every unmodified CHECK constraint on PG18", flush=True)

    def compare(db, label):
        local = {name: psql(db, "SELECT " + digest(AUTH.format(where="") if name == "auth.users" else name))
                 for name in keys}
        differing = sorted(name for name in keys if local[name] != digests[name])
        if differing:
            raise AssertionError(f"{label}: exact digests differ for {differing}")
        constraints = psql(db, CONSTRAINTS)
        print(f"PASS {label}: {len(names)} app tables + Auth rows byte-identical canonical jsonb to hosted; "
              f"constraint definitions {'match' if constraints == hosted_constraints else 'DIFFER'} hosted",
              flush=True)
        return constraints == hosted_constraints

    clone_parity = compare(CLONE, "exact clone")
    run = subprocess.run([str(bin_dir / "pg_dump.exe"), "-h", "127.0.0.1", "-p", PORT, "-U", "postgres",
                          "-Fc", "-f", str(dump), CLONE], capture_output=True, text=True)
    if run.returncode:
        raise RuntimeError(f"pg_dump failed: {run.stderr.strip()[-400:]}")
    psql("postgres", f"CREATE DATABASE {ROUNDTRIP} WITH ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0",
         session=False)
    run = subprocess.run([str(bin_dir / "pg_restore.exe"), "-h", "127.0.0.1", "-p", PORT, "-U", "postgres",
                          "--exit-on-error", "-d", ROUNDTRIP, str(dump)], capture_output=True, text=True)
    if run.returncode:
        raise RuntimeError(f"pg_restore failed: {run.stderr.strip()[-400:]}")
    roundtrip_parity = compare(ROUNDTRIP, "same-version PG18 pg_dump/pg_restore")
    if not (clone_parity and roundtrip_parity):
        raise AssertionError("Constraint definitions differ from hosted; inspect before claiming schema parity")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workdir", required=True, type=Path)
    parser.add_argument("--recovery", required=True, type=Path)
    parser.add_argument("--bin-dir", required=True, type=Path)
    args = parser.parse_args()
    main(args.workdir, args.recovery, args.bin_dir)
