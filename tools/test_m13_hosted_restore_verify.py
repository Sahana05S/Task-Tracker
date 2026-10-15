"""Compare captured synthetic application rows with the isolated PG18 clone.

This checks JSON-normalized row values, not PostgreSQL binary/role/Auth restore.
The private snapshot contents are never printed.
"""

import argparse
import json
import os
import subprocess
from pathlib import Path


def main(recovery, bin_dir):
    if recovery.name != "taskpulse-m13-recovery-7e6d914":
        raise RuntimeError("Unexpected recovery workspace")
    snapshot = json.loads((recovery / "hosted-synthetic-application-tables.json").read_text(encoding="utf-8"))
    names = sorted(n for n in snapshot if n.startswith(("public.", "taskpulse_private.")))
    if len(names) != 68:
        raise RuntimeError("Expected 68 hosted application tables")
    def query(statement):
        run = subprocess.run([str(bin_dir / "psql.exe"), "-X", "-h", "127.0.0.1",
            "-p", "15433", "-U", "postgres", "-d", "taskpulse_m13_hosted_clone",
            "-v", "ON_ERROR_STOP=1", "-At", "-c", statement],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            env={**os.environ,"PGTZ":"UTC"})
        if run.returncode:
            raise RuntimeError("Isolated clone query failed")
        return json.loads(run.stdout)
    mismatched = []
    mismatch_fields = {}
    for offset in range(0, len(names), 12):
        group = names[offset:offset+12]
        pairs = []
        for name in group:
            pairs += ["'"+name+"'", f"(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM {name} t)"]
        current = query("SELECT jsonb_build_object(" + ",".join(pairs) + ")")
        for name in group:
            key = next((candidate for candidate in ('id','revision','sequence')
                        if all(candidate in row for row in snapshot[name]) and
                        len({str(row[candidate]) for row in snapshot[name]}) == len(snapshot[name])), None)
            if key:
                original = {str(row[key]):row for row in snapshot[name]}
                restored = {str(row[key]):row for row in current[name]}
            else:
                original = sorted(json.dumps(row, sort_keys=True) for row in snapshot[name])
                restored = sorted(json.dumps(row, sort_keys=True) for row in current[name])
            if original != restored:
                mismatched.append(name)
                before_rows = {str(r.get('id',r.get('task_id',i))):r for i,r in enumerate(snapshot[name])}
                after_rows = {str(r.get('id',r.get('task_id',i))):r for i,r in enumerate(current[name])}
                fields = set()
                for identity in before_rows.keys() | after_rows.keys():
                    a,b=before_rows.get(identity,{}),after_rows.get(identity,{})
                    fields.update(k for k in a.keys() | b.keys() if a.get(k)!=b.get(k))
                mismatch_fields[name]=sorted(fields)
    if mismatched:
        raise AssertionError("JSON-normalized restored rows differ by field: " + str(mismatch_fields))
    auth = query("SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'raw_user_meta_data',raw_user_meta_data,'raw_app_meta_data',raw_app_meta_data)),'[]'::jsonb) FROM auth.users")
    if len(auth) != 7:
        raise AssertionError("Restored synthetic Auth IDs missing")
    revisions = query("SELECT jsonb_build_object('revisions',(SELECT count(*) FROM taskpulse_private.month_revisions),'closed',(SELECT count(*) FROM taskpulse_private.month_periods WHERE state='closed'))")
    if revisions["revisions"] < 2 or revisions["closed"] < 1:
        raise AssertionError("Retained archive chain missing from clone")
    print(f"PASS PG18 synthetic application-table restore: {len(names)} JSON-normalized tables, "
          f"7 Auth IDs, {revisions['revisions']} retained revisions, {revisions['closed']} closed month")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recovery", required=True, type=Path)
    parser.add_argument("--bin-dir", required=True, type=Path)
    args = parser.parse_args()
    main(args.recovery, args.bin_dir)
