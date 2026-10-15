"""Resume only the isolated PG18 clone from its already captured private snapshot."""

import argparse
import json
import subprocess
from pathlib import Path

from test_m13_hosted_restore import quoted
from test_m13_hosted_restore_verify import main as verify


def main(recovery, bin_dir):
    if recovery.name != "taskpulse-m13-recovery-7e6d914" or \
       not (recovery / "data" / "PG_VERSION").is_file():
        raise RuntimeError("Refusing unexpected recovery workspace")
    backup = recovery / "hosted-synthetic-application-tables.json"
    source = json.loads(backup.read_text(encoding="utf-8"))
    names = sorted(n for n in source if n.startswith(("public.", "taskpulse_private.")))
    if len(names) != 68 or len(source.get("auth.users", [])) != 7:
        raise RuntimeError("Recovery source is not the verified synthetic snapshot")
    def psql(statement, file=None):
        command = [str(bin_dir / "psql.exe"), "-X", "-h", "127.0.0.1",
                   "-p", "15433", "-U", "postgres", "-d", "taskpulse_m13_hosted_clone",
                   "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate", "-At"]
        if file:
            command += ["-f", str(file)]
        else:
            command += ["-c", statement]
        run = subprocess.run(command, capture_output=True, text=True,
                             encoding="utf-8", errors="replace")
        if run.returncode:
            raise RuntimeError("Isolated clone restore failed; private snapshot preserved")
        return run.stdout.strip()
    endpoint = psql("SELECT inet_server_addr()||':'||inet_server_port()")
    if endpoint not in ("127.0.0.1:15433", "127.0.0.1/32:15433"):
        raise RuntimeError("Refusing non-loopback restore target")
    count = psql("SELECT count(*) FROM public.users")
    if count not in ("0", "7"):
        raise RuntimeError("Restore target has unexpected rows")
    lines = psql("SELECT n.nspname||'.'||c.relname||'|'||string_agg(quote_ident(a.attname),',' ORDER BY a.attnum) "
        "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
        "JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 "
        "AND NOT a.attisdropped AND a.attgenerated='' "
        "WHERE c.relkind='r' AND n.nspname IN ('public','taskpulse_private','auth') "
        "GROUP BY n.nspname,c.relname ORDER BY n.nspname,c.relname")
    colmap = dict(line.split("|",1) for line in lines.splitlines())
    statements = ["BEGIN;", "SET LOCAL session_replication_role=replica;",
                  "TRUNCATE " + ",".join(["auth.users",*names]) + " RESTART IDENTITY CASCADE;"]
    for name in ["auth.users",*names]:
        if not source[name]:
            continue
        cols=colmap[name]
        literal=quoted(json.dumps(source[name],separators=(",", ":")))
        statements.append(f"INSERT INTO {name} ({cols}) OVERRIDING SYSTEM VALUE "
                          f"SELECT {cols} FROM jsonb_populate_recordset(NULL::{name},{literal}::jsonb);")
    for table,column in (("taskpulse_private.audit_events","id"),
                         ("taskpulse_private.performance_observations","revision"),
                         ("taskpulse_private.presentation_history","sequence")):
        statements.append(f"SELECT setval(pg_get_serial_sequence('{table}','{column}'),"
                          f"coalesce((SELECT max({column}) FROM {table}),1),true);")
    statements.append("COMMIT;")
    script = recovery / "restore-synthetic-rows-v2.sql"
    if script.exists():
        raise RuntimeError("Resume script already exists; preserve prior evidence")
    script.write_text("\n".join(statements),encoding="utf-8")
    psql("",script)
    verify(recovery,bin_dir)


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recovery",required=True,type=Path)
    parser.add_argument("--bin-dir",required=True,type=Path)
    args=parser.parse_args()
    main(args.recovery,args.bin_dir)
