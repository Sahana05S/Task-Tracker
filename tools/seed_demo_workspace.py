"""Fill the demo project with a realistic month of work so every feature shows data.

The September sheet seed gave the demo tasks and logs but nothing else: no checklists, sales,
meeting points, facts, ideas, suggestions, policies, task-tool history, month setup or saved
reports, so most pages show empty or "unavailable" states. This tool replays a synthetic month
(tools/fixtures/demo-workspace.json, days as offsets from the 1st) for the four demo accounts
through the app's own commands, each as the person who would do it in the app:

  0 state       gates: migration ledger, taskpulse_definer membership, one active company, the
                month is the current month and open (no closed period, snapshot or final report),
                the four demo accounts active with their fixture roles and no other active member,
                approved award policy, guarded triggers enabled, fixture tags free or ours
  1 people      one open invitation (people_command), no new accounts
  2 month       month setup: standing missions per member and weekly review phases
  3 missions    save_task_with_participants, details, links, relations, checklists (create, rows,
                activity progress), In Progress, Done (reviewer approval first), On-Hold, Discarded
  4 logs        create_task_log as each assignee with progress deltas; a few corrections/reversals
  5 attendance  dated_record_command('attendance') as the director for every member and day:
                check-in/out times, hours covering every logged hour, Sundays and company holidays
                as Holiday, a Half Day, Leave and Absent; existing rows corrected with a reason
  6 records     facts, ideas, suggestions, sales, meeting points; validations by someone else
  7 more        Task Tools (duplicate, weekly, support, carryover, archive), policies, a
                milestone, draft saved reports, award requests for days without a slot
  8 backdate    each command's history rows (input_history, performance_observations,
                presentation_history, audit, credit, share/scale versions, waypoints) move to the
                business instant of its day, so "as of" views, trend charts and the activity log
                read the month as it happened; contract baselines move to the 1st if later.
                Today's steps keep their real time. --no-backdate skips this.
  9 verify      counts, attendance validity and the shared performance context as the director

Every step has a deterministic operation id, so a rerun skips what is done and a later run
adds only the new days (top-up). --undo MANIFEST deletes the missions the tool created (as the
sheet seed's undo does), withdraws its records and attendance, restores attendance it corrected,
archives its policies, revokes the invitation and removes its milestone and draft reports;
award runs and the carried-over mission stay as history.

Hosted mode reuses tools/seed_sheet_to_project.py's Supabase CLI query channel. The demo project
is the ref that tool calls production, so --yes there needs --confirm-production-ref; any other
hosted ref is refused (the backdating is demo-only).
"""

import argparse
import datetime as dt
import hashlib
import json
import random
import re
import sys
import tempfile
import uuid
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_sheet_to_project import (  # noqa: E402  (shared backends, transaction wrapper and task deletion)
    AS_OWNER, GUARDED_TRIGGERS, PRODUCTION_REF, ROOT, TRIGGERS_EXPR, HostedBackend, LocalBackend, Refusal, as_actor, delete_sql,
    fmt_num, jlit, lit, save_manifest, snapshot, target_gates, target_identity, transaction, uuid_array,
)

FIXTURE = ROOT / "tools" / "fixtures" / "demo-workspace.json"
DEFAULT_LEDGER = 59  # 01-46, 48-60 on the demo project (there is no 47)
NS = uuid.UUID("7c1e4b52-9d3a-4f0e-b6a8-2e5d0c9f1a34")  # this tool's operation ids
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
Q = Decimal("0.25")
TAG_BASE = 40  # fixture mission tags are <Mon><YY>_<CAT><TAG_BASE + index>
UNDO_REASON = "Removed by the demo workspace seed undo"
ATTENDANCE_REASON = "Demo workspace seed: attendance with check-in times covering logged hours"
HISTORY_TABLES = (  # immutable history read "as of": (table, time column, entity key, order column, trigger)
    ("taskpulse_private.input_history", "recorded_at", "kind, record_id", "sequence", "m06_history_immutable"),
    ("taskpulse_private.performance_observations", "observed_at", "kind, source_key", "revision", "m07_observation_immutable"),
    ("taskpulse_private.presentation_history", "recorded_at", "kind, row_id", "sequence", "m11_presentation_immutable"),
    ("taskpulse_private.manual_credit_inputs", "effective_at", "task_id", "audit_id", "m07_manual_credit_immutable"),
)
PLAIN_TABLES = (  # no immutability trigger: moved right after each step
    ("taskpulse_private.participant_versions", "effective_at"), ("taskpulse_private.scale_versions", "effective_at"),
    ("taskpulse_private.checklist_credit_events", "effective_at"), ("taskpulse_private.earned_credit_events", "occurred_at"),
    ("taskpulse_private.log_revisions", "occurred_at"), ("taskpulse_private.audit_events", "occurred_at"),
    ("taskpulse_private.task_waypoints", "reached_at"),
)
ARCHIVE_GUARDED = ("tasks", "task_assignees", "task_reviewers", "task_detail_instances", "task_detail_sections", "task_links",
                   "task_checklists", "checklist_nodes", "checklist_sections", "task_dependencies", "daily_task_logs", "task_timers")
CONTRACTS = ("taskpulse_private.input_contract", "taskpulse_private.performance_contract", "taskpulse_private.presentation_contract")
# Order of step kinds inside one day; the business instant of a step follows this order.
RANK = {"invite": 0, "month": 1, "create": 2, "details": 3, "link": 3, "relation": 3, "checklist": 4, "start": 5, "tool": 6,
        "log": 7, "log_fix": 8, "state": 9, "record": 10, "record_fix": 11, "validate": 12, "review": 13, "finish": 14,
        "attendance": 15, "policy": 16, "milestone": 16, "report": 16, "award": 17}


def op_id(*parts):
    """Deterministic operation keys: a rerun finds the receipt instead of writing twice."""
    return str(uuid.uuid5(NS, "|".join(str(p) for p in parts)))


def q(value):
    """Nearest quarter hour."""
    return (Decimal(str(value)) / Q).to_integral_value(rounding=ROUND_HALF_UP) * Q


def up(value):
    return (Decimal(str(value)) / Q).to_integral_value(rounding=ROUND_CEILING) * Q


def rng(*parts):
    return random.Random("|".join(str(p) for p in parts))


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()[:16]


def parse_ts(value):
    """ISO timestamps from PostgreSQL (any fraction length, Z or offset) for Python 3.10."""
    text = str(value).replace(" ", "T").replace("Z", "+00:00")
    match = re.fullmatch(r"(.+T\d\d:\d\d:\d\d)(?:\.(\d+))?([+-]\d\d(?::?\d\d)?)?", text)
    if not match:
        raise ValueError(f"unexpected timestamp {value!r}")
    base, fraction, zone = match.groups()
    zone = zone or "+00:00"
    if re.fullmatch(r"[+-]\d\d", zone):
        zone += ":00"
    return dt.datetime.fromisoformat(f"{base}.{(fraction or '0')[:6].ljust(6, '0')}{zone}")


def ist(day, hour=10, minute=0, second=0):
    return dt.datetime(day.year, day.month, day.day, hour, minute, second, tzinfo=IST)


# --------------------------------------------------------------------------- the planned month

class Step:
    """One command (or owner write) the month needs, on a business day."""

    def __init__(self, day, kind, actor, op, label, call, prep=None, post="", check="cmd", sub=0, record=None):
        self.day, self.kind, self.actor, self.op, self.label = day, kind, actor, op, label
        self.call, self.prep, self.post, self.check, self.sub = call, prep or {}, post, check, sub
        self.record = record or {}

    def key(self):
        return (self.day, RANK[self.kind], self.sub, self.op)


def receipt(op):
    return f"(SELECT result FROM taskpulse_private.command_receipts WHERE operation_id={lit(op)}::uuid)"


def receipt_field(op, field):
    return f"(SELECT result_payload->>{lit(field)} FROM taskpulse_private.command_receipts WHERE operation_id={lit(op)}::uuid)"


def version_of(task_expr):
    return f"(SELECT lifecycle_version FROM public.tasks WHERE id={task_expr})"


def S(name, cast="uuid"):
    return f"current_setting('seed.{name}')::{cast}"


class Month:
    def __init__(self, first):
        self.first = first
        nxt = dt.date(first.year + first.month // 12, first.month % 12 + 1, 1)
        self.last = nxt - dt.timedelta(days=1)
        self.days = (self.last - first).days + 1
        self.tag_prefix = first.strftime("%b") + first.strftime("%y")

    def day(self, offset):
        return self.first + dt.timedelta(days=offset)

    def clamp(self, offset):
        return max(0, min(self.days - 1, offset))


def mission_tag(month, index, mission):
    return f"{month.tag_prefix}_{mission['category']}{TAG_BASE + index}"


def last_work_day(mission, month):
    for key in ("doneDay", "holdDay", "discardDay"):
        if mission.get(key) is not None:
            return mission[key]
    return month.days - 1


def build_logs(fixture, month, off_days, exceptions):
    """Every planned log of the month: (person, mission key, offset, hours, note). Deterministic."""
    missions = fixture["missions"]
    logs = []
    for person, info in fixture["people"].items():
        low, high = info["dayHours"]
        for offset in range(month.days):
            if offset in off_days or exceptions.get((person, offset)) in ("Leave", "Absent"):
                continue
            r = rng(month.first, person, offset, "logs")
            if r.random() > info["workShare"]:
                continue
            active = [m for m in missions if person in m["assignees"] and m["start"] <= offset <= last_work_day(m, month)]
            if not active:
                continue
            total = q(r.uniform(low, high))
            if exceptions.get((person, offset)) == "Half Day":
                total = q(total / 2)
            # Missions that start or finish today always get a log from their primary assignee.
            must = [m for m in active if m["assignees"][0] == person and offset in (m["start"], last_work_day(m, month))]
            rest = [m for m in active if m not in must]
            r.shuffle(rest)
            rest.sort(key=lambda m: -m.get("weight", 1) * r.random())
            chosen = (must + rest)[:3]
            weights = [m.get("weight", 1) * (0.6 + r.random()) for m in chosen]
            parts = [max(Decimal("0.5"), q(total * Decimal(str(w / sum(weights))))) for w in weights]
            parts[-1] = max(Decimal("0.5"), total - sum(parts[:-1]))
            for mission, hours in zip(chosen, parts):
                notes = mission["notes"]
                note = notes[sum(1 for x in logs if x["mission"] == mission["key"]) % len(notes)]
                logs.append({"person": person, "mission": mission["key"], "day": offset, "hours": hours, "notes": note})
    # Progress: the primary assignee's logs carry the deltas that reach the planned progress.
    for mission in missions:
        target = Decimal(100 if mission["outcome"] == "done" else mission.get("progress", 0))
        if mission["outcome"] == "discarded":
            target = Decimal(10)
        own = [x for x in logs if x["mission"] == mission["key"] and x["person"] == mission["assignees"][0]]
        for x in logs:
            if x["mission"] == mission["key"]:
                x["delta"] = Decimal(0)
        if mission.get("checklist") or not own or target == 0:
            continue
        n = len(own)
        for i, x in enumerate(own):
            x["delta"] = (target * (i + 1) / n).quantize(Decimal("0.01"), ROUND_HALF_UP) - \
                (target * i / n).quantize(Decimal("0.01"), ROUND_HALF_UP)
    for index, x in enumerate(logs):
        x["op"] = op_id(month.first, "log", x["person"], x["mission"], x["day"], index)
    # A few corrections (hours trimmed by a quarter hour) and reversals, on logs without progress.
    plain = [x for x in logs if x["delta"] == 0 and x["hours"] >= 1]
    fixes = {"correct": plain[4::37][:3], "reverse": plain[23::41][:2]}
    return logs, fixes


def logged_by_day(logs, fixes):
    """Hours each planned log leaves on its person-day once corrections and reversals are applied."""
    reversed_ops = {x["op"] for x in fixes["reverse"]}
    corrected = {x["op"] for x in fixes["correct"]}
    out = {}
    for x in logs:
        if x["op"] in reversed_ops:
            continue
        hours = x["hours"] - (Q if x["op"] in corrected else 0)
        out[(x["person"], x["day"])] = out.get((x["person"], x["day"]), Decimal(0)) + hours
    return out


# --------------------------------------------------------------------------- state

def candidate_ops(steps):
    return [s.op for s in steps]


def state_sql(month, fixture, steps, ids_by_email):
    first, last = lit(month.first), lit(month.last)
    emails = [p["email"] for p in fixture["people"].values()]
    tags = [mission_tag(month, i, m) for i, m in enumerate(fixture["missions"])]
    ops = candidate_ops(steps)
    fixed_ids = [s.record["row_id"] for s in steps if s.record.get("row_id")]
    return transaction("", f"""jsonb_build_object(
 'current_user', current_user,
 'definer_member', (SELECT pg_has_role(current_user,'taskpulse_definer','MEMBER') FROM pg_roles WHERE rolname='taskpulse_definer'),
 'ledger', CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN NULL
   ELSE (SELECT count(*) FROM supabase_migrations.schema_migrations) END,
 'organizations', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status)),'[]') FROM public.organizations),
 'users', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'email',lower(email),'name',full_name,'role',role,'employee_id',employee_id,
   'is_active',is_active,'organization_id',organization_id) ORDER BY email),'[]') FROM public.users),
 'today', (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date,
 'now', clock_timestamp(),
 'frozen', EXISTS(SELECT 1 FROM public.monthly_performance_snapshots WHERE make_date(snapshot_year,snapshot_month,1)={first}::date)
   OR EXISTS(SELECT 1 FROM public.report_snapshots WHERE status='Final' AND (period_start IS NULL OR period_start<={last}::date)
   AND (period_end IS NULL OR period_end>={first}::date))
   OR EXISTS(SELECT 1 FROM taskpulse_private.month_periods WHERE period_start={first}::date AND state<>'live'),
 'policy_approved', (SELECT config IS NOT NULL FROM taskpulse_private.award_policy WHERE id),
 'tool_policy', (SELECT config IS NOT NULL FROM taskpulse_private.tool_policy WHERE id),
 'triggers', {TRIGGERS_EXPR},
 'history_triggers', (SELECT coalesce(jsonb_object_agg(c.relname||'.'||g.tgname, g.tgenabled),'{{}}') FROM pg_trigger g JOIN pg_class c ON c.oid=g.tgrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='taskpulse_private' AND g.tgname IN ({','.join(lit(t[4]) for t in HISTORY_TABLES)})),
 'done_ops', (SELECT coalesce(jsonb_agg(o),'[]') FROM unnest({uuid_array(ops)}) o WHERE
   EXISTS(SELECT 1 FROM taskpulse_private.command_receipts r WHERE r.operation_id=o)
   OR EXISTS(SELECT 1 FROM taskpulse_private.policy_receipts r WHERE r.operation=o)
   OR EXISTS(SELECT 1 FROM taskpulse_private.award_receipts r WHERE r.operation=o)),
 'fixed_rows', (SELECT coalesce(jsonb_agg(id),'[]') FROM (SELECT id FROM public.report_snapshots UNION ALL SELECT id FROM public.company_milestones) x
   WHERE id = ANY({uuid_array(fixed_ids)})),
 'tags', (SELECT coalesce(jsonb_agg(jsonb_build_object('tag',task_tag,'id',id)),'[]') FROM public.tasks WHERE task_tag = ANY(ARRAY[{','.join(lit(t) for t in tags)}]::text[])),
 'seed_tasks', (SELECT coalesce(jsonb_agg(result),'[]') FROM taskpulse_private.command_receipts WHERE operation_id = ANY({uuid_array(ops)})
   AND command='save_task_with_participants'),
 'attendance', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'user_id',user_id,'day',attendance_date,'status',status,
   'hours',attendance_hours,'off_hours',off_hours,'check_in',check_in_at,'check_out',check_out_at,'holiday',holiday_name,
   'state',record_state,'version',record_version,'notes',notes,
   'history_day',(SELECT (h.recorded_at AT TIME ZONE 'Asia/Kolkata')::date FROM taskpulse_private.input_history h WHERE h.kind='attendance'
     AND h.record_id=a.id ORDER BY h.recorded_at DESC, h.sequence DESC LIMIT 1))),'[]') FROM public.attendance_records a WHERE attendance_date BETWEEN {first} AND {last}),
 'logged', (SELECT coalesce(jsonb_object_agg(k,h),'{{}}') FROM (SELECT user_id||'|'||log_date AS k,sum(hours_worked) AS h
   FROM public.daily_task_logs WHERE reversed_at IS NULL AND log_date BETWEEN {first} AND {last} GROUP BY 1) x),
 'holidays', (SELECT coalesce(jsonb_object_agg(holiday_date,name),'{{}}') FROM taskpulse_private.company_holidays
   WHERE holiday_date BETWEEN {first} AND {last}),
 'month_setup_items', (SELECT count(*) FROM taskpulse_private.month_setup_items WHERE period_start={first}::date),
 'standing', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'category',category,'owner_mode',owner_mode) ORDER BY sort,id),'[]')
   FROM taskpulse_private.standing_missions WHERE active),
 'meeting_types', (SELECT coalesce(jsonb_object_agg(prefix,name),'{{}}') FROM taskpulse_private.meeting_types WHERE active),
 'previous', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'tag',t.task_tag,'title',t.title) ORDER BY t.task_tag),'[]') FROM public.tasks t
   WHERE t.assigned_date < {first}::date AND t.assigned_date >= ({first}::date - interval '1 month') AND t.status IN ('Not Started','In Progress')
   AND t.archived_effective_date IS NULL AND t.handoff_successor_id IS NULL AND t.task_scale IS NOT NULL AND t.progress_percentage IS NOT NULL
   AND (SELECT count(*) FROM public.task_assignees a WHERE a.task_id=t.id)<=1
   AND NOT EXISTS(SELECT 1 FROM public.task_timers x WHERE x.task_id=t.id AND x.status='Running')
   AND NOT EXISTS(SELECT 1 FROM public.task_checklists c JOIN public.checklist_nodes n ON n.checklist_id=c.id WHERE c.task_id=t.id AND n.detail_section IS NULL)),
 'invitation', (SELECT to_jsonb(i) FROM public.member_invitations i WHERE email={lit(fixture['invitation']['email'])} AND accepted_at IS NULL AND revoked_at IS NULL),
 'slots', (SELECT coalesce(jsonb_agg(business_date),'[]') FROM taskpulse_private.award_slots WHERE business_date BETWEEN {first} AND {last}),
 'contracts', jsonb_build_object({','.join(f"{lit(c)},(SELECT available_from FROM {c} LIMIT 1)" for c in CONTRACTS)})
)""")


# --------------------------------------------------------------------------- steps

def build_steps(fixture, month, ctx):
    """Every step of the month (all days); the plan later keeps the ones not done and due."""
    P = ctx["uid"]  # role key -> user id
    org = ctx["org"]
    steps = []
    missions = {m["key"]: m for m in fixture["missions"]}
    save_op = {}

    def task_of(key):
        return receipt(save_op[key])

    def add(*args, **kwargs):
        steps.append(Step(*args, **kwargs))

    # 1 people: one open invitation (people_command has no operation key; the state shows an open one).
    inv = fixture["invitation"]
    add(0, "invite", "md", op_id(org, "invite", inv["email"]), f"invite {inv['email']}",
        f"public.people_command('invite',{jlit(inv)})", check="invite")

    # 2 month setup: per-member standing missions for everyone, single ones to the fixture owner, weekly phases.
    ms = fixture["monthSetup"]
    standing = []
    for item in ctx["standing"]:
        members = list(P.values()) if item["owner_mode"] == "per_member" else [P[ms["single"].get(item["category"], "md")]]
        standing += [{"missionId": item["id"], "memberId": uid} for uid in members]
    payload = {"month": month.first.strftime("%Y-%m"), "standing": standing, "phases": {"ownerId": P[ms["phasesOwner"]]},
               "previous": [], "reason": "Demo workspace month setup"}
    op = op_id(org, "month-setup", month.first)
    add(ms["day"], "month", ms["actor"], op, f"month setup ({len(standing)} standing cells + weekly phases)",
        f"public.month_setup_commit((public.month_setup_preview({jlit(payload)})->>'id')::uuid,{lit(op)}::uuid)",
        check="month" if ctx["month_setup_items"] == 0 else "skip")

    # 3 missions.
    for index, m in enumerate(fixture["missions"]):
        key, tag = m["key"], mission_tag(month, index, m)
        due = None if m.get("due") is None else month.first + dt.timedelta(days=m["due"])
        fields = {"task_tag": tag, "title": m["title"], "category": m["category"], "priority": m["priority"],
                  "due_date": None if due is None else due.isoformat(), "task_scale": m["scale"], "description": m["description"],
                  "initialize_details": True}
        assignees = [P[p] for p in m["assignees"]]
        reviewers = [P[p] for p in m.get("reviewers", [])]
        shares = m.get("shares", [1000000] if len(assignees) == 1 else None)
        save_op[key] = op = op_id(org, "mission", key, month.first)
        start = month.day(m["start"])
        add(m["start"], "create", m["creator"], op, f"create {tag} {m['title']}",
            f"public.save_task_with_participants(NULL,{jlit(fields)},{uuid_array(assignees)},{uuid_array(reviewers)},"
            f"ARRAY[{','.join(str(s) for s in shares)}]::integer[],NULL,false,{lit(op)}::uuid)",
            post=f"""UPDATE public.tasks SET assigned_date={lit(start)}::date WHERE id={S('r')};
UPDATE taskpulse_private.participant_versions SET effective_at=least({lit(ist(start, 9))}::timestamptz,clock_timestamp()) WHERE task_id={S('r')};""",
            record={"mission": key, "tag": tag})
        t = task_of(key)
        prep = {"t": t, "v": version_of(t)}
        if m.get("details"):
            dop = op_id(org, "details", key)
            add(m["start"], "details", m["creator"], dop, f"{tag} details",
                f"public.task_details_command({S('t')},'save',{jlit(m['details'])},{S('v', 'bigint')},{lit(dop)}::uuid)", prep=dict(prep))
        for li, link in enumerate(m.get("links", [])):
            lop = op_id(org, "link", key, li)
            body = {"ipo_role": link["ipo"], "link_type": link["type"], "label": link["label"], "url": link["url"]}
            add(m["start"], "link", m["creator"], lop, f"{tag} link {link['label']}",
                f"public.task_details_command({S('t')},'link',{jlit(body)},{S('v', 'bigint')},{lit(lop)}::uuid)", prep=dict(prep), sub=li)
        if m.get("checklist"):
            # Initialization made the root checklist with one Group per section; rows go under those.
            primary = m["assignees"][0]
            node_op = {}
            for ni, node in enumerate(m["checklist"]):
                node_op[node["key"]] = nop = op_id(org, "checklist", key, "add", node["key"])
                body = {"title": node["title"], "description": None, "section": node["section"], "node_type": node["type"],
                        "linked_task_id": None, "priority": 1, "links": [], "estimated_minutes": node.get("minutes") or None}
                node_prep = dict(prep)
                if node.get("parent"):
                    node_prep["p"] = f"({receipt_field(node_op[node['parent']], 'nodeId')})::uuid"
                else:
                    node_prep["p"] = (f"(SELECT n.id FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id WHERE c.task_id={t} "
                                      f"AND c.owner_node_id IS NULL AND n.parent_node_id IS NULL AND n.node_type='Group' AND n.detail_section={lit(node['section'])} "
                                      f"ORDER BY n.sort_order, n.id LIMIT 1)")
                call_body = f"{jlit(body)}||jsonb_build_object('parent_id',{S('p', 'text')})"
                add(m["start"], "checklist", m["creator"], nop, f"{tag} checklist row {node['title']}",
                    f"public.checklist_command({S('t')},'add',{call_body},{S('v', 'bigint')},{lit(nop)}::uuid)", prep=node_prep, sub=1 + ni)
                if node.get("done") is not None and node["type"] == "Item":
                    sop = op_id(org, "checklist", key, "state", node["key"])
                    add(node["done"], "state", primary, sop, f"{tag} {node['title']}: {node.get('state', 'Yes')}",
                        f"public.checklist_command({S('t')},'state',jsonb_build_object('node_id',{S('n', 'text')},'state',{lit(node.get('state', 'Yes'))}),"
                        f"{S('v', 'bigint')},{lit(sop)}::uuid)",
                        prep={**prep, "n": f"({receipt_field(nop, 'nodeId')})::uuid"}, sub=ni)
            mop = op_id(org, "checklist", key, "mode")
            add(m["start"], "checklist", m["creator"], mop, f"{tag} checklist owns progress",
                f"public.checklist_command({S('t')},'mode',jsonb_build_object('enabled',true,'reason','Progress follows the activity rows',"
                f"'preview_progress',{S('pp', 'jsonb')}),{S('v', 'bigint')},{lit(mop)}::uuid)",
                prep={**prep, "pp": f"coalesce(taskpulse_private.checklist_rollup({t})->'taskProgress','null'::jsonb)"}, sub=900)
        sop = op_id(org, "start", key)
        add(m["start"], "start", m["assignees"][0], sop, f"{tag} In Progress",
            f"public.task_lifecycle_command({S('t')},'transition',{jlit({'status': 'In Progress'})},{S('v', 'bigint')},{lit(sop)}::uuid)",
            prep=dict(prep), post=f"UPDATE public.tasks SET started_date={lit(start)}::date WHERE id={S('t')};")
        if m["outcome"] == "done":
            day = month.day(m["doneDay"])
            if not m.get("checklist"):
                # Done needs every section reviewed: a mission without rows has its sections confirmed empty.
                for si, section in enumerate(("setup", "activity", "closure")):
                    eop = op_id(org, "section", key, section)
                    body = {"section": section, "intentional_empty": True, "reason": "No checklist rows for this mission"}
                    add(m["doneDay"], "state", m["creator"], eop, f"{tag} {section} confirmed empty",
                        f"public.checklist_command({S('t')},'section',{jlit(body)},{S('v', 'bigint')},{lit(eop)}::uuid)", prep=dict(prep), sub=500 + si)
            for ri, reviewer in enumerate(m.get("reviewers", [])):
                rop = op_id(org, "review", key, reviewer)
                add(m["doneDay"], "review", reviewer, rop, f"{tag} approved by {reviewer}",
                    f"public.task_lifecycle_command({S('t')},'review',{jlit({'approved': True})},{S('v', 'bigint')},{lit(rop)}::uuid)",
                    prep=dict(prep), sub=ri)
            fop = op_id(org, "done", key)
            add(m["doneDay"], "finish", m["assignees"][0], fop, f"{tag} Done",
                f"public.task_lifecycle_command({S('t')},'transition',{jlit({'status': 'Done'})},{S('v', 'bigint')},{lit(fop)}::uuid)",
                prep=dict(prep), post=f"UPDATE public.tasks SET completed_date={lit(day)}::date, met_deadline=CASE WHEN due_date IS NULL THEN NULL "
                                      f"ELSE {lit(day)}::date<=due_date END WHERE id={S('t')};")
        elif m["outcome"] == "on_hold":
            hop = op_id(org, "hold", key)
            add(m["holdDay"], "finish", m["assignees"][0], hop, f"{tag} On-Hold",
                f"public.task_lifecycle_command({S('t')},'transition',{jlit({'status': 'On-Hold', 'reason': 'Waiting for the land registration.'})},"
                f"{S('v', 'bigint')},{lit(hop)}::uuid)", prep=dict(prep))
        elif m["outcome"] == "discarded":
            xop = op_id(org, "discard", key)
            add(m["discardDay"], "finish", "md", xop, f"{tag} Discarded",
                f"public.task_lifecycle_command({S('t')},'transition',{jlit({'status': 'Discarded', 'reason': 'Replaced by the Diwali launch brochure.'})},"
                f"{S('v', 'bigint')},{lit(xop)}::uuid)", prep=dict(prep))
    for ri, rel in enumerate(fixture["relations"]):
        rop = op_id(org, "relation", rel["mission"], rel["other"])
        t = task_of(rel["mission"])
        add(rel["day"], "relation", "md", rop, f"relation {rel['mission']} {rel['type']} {rel['other']}",
            f"public.task_details_command({S('t')},'relation',jsonb_build_object('other_task_id',{S('o', 'text')},'relation_type',{lit(rel['type'])},"
            f"'notes',{lit(rel['notes'])}),{S('v', 'bigint')},{lit(rop)}::uuid)",
            prep={"t": t, "v": version_of(t), "o": task_of(rel["other"])}, sub=ri)

    # 4 logs, then corrections and reversals (own logs only).
    for x in ctx["logs"]:
        payload = {"log_date": month.day(x["day"]).isoformat(), "hours_worked": float(x["hours"]), "requested_delta": float(x["delta"]),
                   "notes": x["notes"], "raw_links": []}
        add(x["day"], "log", x["person"], x["op"], f"log {x['person']} {x['mission']} {fmt_num(x['hours'])} h",
            f"public.create_task_log({S('t')},{jlit(payload)},{lit(x['op'])}::uuid)", prep={"t": task_of(x["mission"])},
            record={"log": True, "person": x["person"], "day": x["day"], "hours": str(x["hours"])})
    for fix_kind, items in ctx["fixes"].items():
        for x in items:
            fop = op_id(org, fix_kind, x["op"])
            log_expr = f"({receipt_field(x['op'], 'logId')})::uuid"
            prep = {"l": log_expr, "lv": f"(SELECT execution_version FROM public.daily_task_logs WHERE id={log_expr})"}
            if fix_kind == "correct":
                payload = {"log_date": month.day(x["day"]).isoformat(), "hours_worked": float(x["hours"] - Q), "requested_delta": 0,
                           "notes": x["notes"] + " (time corrected)", "raw_links": [], "reason": "Logged a quarter hour too much."}
                call = f"public.correct_task_log({S('l')},{jlit(payload)},{lit(fop)}::uuid,{S('lv', 'bigint')})"
            else:
                call = f"public.reverse_task_log({S('l')},{jlit({'reason': 'Logged on the wrong mission.'})},{lit(fop)}::uuid,{S('lv', 'bigint')})"
            add(x["day"], "log_fix", x["person"], fop, f"{fix_kind} log {x['person']} {x['mission']}", call, prep=prep)

    # 5 attendance (decided against the rows that exist; see attendance_steps).
    steps += attendance_steps(fixture, month, ctx)

    # 6 records.
    for kind, entries in fixture["records"].items():
        for ri, rec in enumerate(entries):
            author = P[rec["author"]]
            day = month.day(rec["day"])
            payload = {"business_date": day.isoformat(), "author_id": author, "content": rec["text"]}
            if kind == "sale":
                payload.update({"client_name": rec["client"], "project_location": rec["location"], "project_built_up_area": rec["area"],
                                "is_new_project": rec["newProject"], "basement_payment_received": rec["basement"]})
            if kind == "meeting":
                due = month.first + dt.timedelta(days=rec["dueDay"])
                payload.update({"meeting_type": ctx["meeting_types"].get(rec["meetingType"], rec["meetingType"]), "point_type": rec["pointType"],
                                "owner_id": P[rec["owner"]], "resolution_status": "Not Started" if rec.get("resolvedDay") else rec["status"],
                                "resolution_due": due.isoformat()})
            save = op_id(org, kind, rec["key"], "save")
            add(rec["day"], "record", rec["author"], save, f"{kind} {rec['key']} by {rec['author']}",
                f"public.dated_record_command({lit(kind)},NULL,'save',{jlit(payload)},0,{lit(save)}::uuid)", sub=ri,
                record={"kind": kind, "key": rec["key"]})
            rid = receipt(save)
            prep = {"i": rid, "rv": f"(SELECT record_version FROM public.{record_table(kind)} WHERE id={rid})"}
            if rec.get("correction"):
                c = rec["correction"]
                fixed = dict(payload, content=c["text"], reason=c["reason"])
                cop = op_id(org, kind, rec["key"], "correct")
                add(c["day"], "record_fix", rec["author"], cop, f"{kind} {rec['key']} corrected",
                    f"public.dated_record_command({lit(kind)},{S('i')},'save',{jlit(fixed)},{S('rv', 'bigint')},{lit(cop)}::uuid)", prep=dict(prep), sub=ri)
            if kind == "meeting" and rec.get("resolvedDay") is not None:
                done = dict(payload, resolution_status=rec["status"], resolution=rec.get("resolution"),
                            resolved_on=month.day(rec["resolvedDay"]).isoformat(), reason="Resolved")
                mop = op_id(org, kind, rec["key"], "resolve")
                add(rec["resolvedDay"], "record_fix", rec["author"], mop, f"meeting {rec['key']} resolved",
                    f"public.dated_record_command('meeting',{S('i')},'save',{jlit(done)},{S('rv', 'bigint')},{lit(mop)}::uuid)", prep=dict(prep), sub=ri)
            state = rec.get("state")
            if state in ("validated", "rejected") and rec.get("validator"):
                vday = month.clamp(max(rec["day"] + 1, (rec.get("correction") or {}).get("day", 0) + 1))
                vop = op_id(org, kind, rec["key"], "validate")
                body = {"state": state, "reason": rec.get("reason") or ("Checked" if state == "validated" else "Not accepted")}
                add(vday, "validate", rec["validator"], vop, f"{kind} {rec['key']} {state} by {rec['validator']}",
                    f"public.dated_record_command({lit(kind)},{S('i')},'validate',{jlit(body)},{S('rv', 'bigint')},{lit(vop)}::uuid)",
                    prep=dict(prep), sub=ri)
            elif state == "withdrawn":
                wop = op_id(org, kind, rec["key"], "withdraw")
                add(month.clamp(rec["day"] + 1), "validate", rec["author"], wop, f"{kind} {rec['key']} withdrawn",
                    f"public.dated_record_command({lit(kind)},{S('i')},'withdraw',{jlit({'reason': rec.get('reason', 'Withdrawn')})},"
                    f"{S('rv', 'bigint')},{lit(wop)}::uuid)", prep=dict(prep), sub=ri)

    # 7 Task Tools.
    for ti, tool in enumerate(fixture["tools"]):
        top = op_id(org, "tool", tool["key"], month.first)
        payload = {"reason": tool.get("reason")} if tool.get("reason") else {}
        prep = {}
        if tool["command"] == "archive":
            prep["ids"] = "ARRAY[" + ",".join(task_of(k) for k in tool["sources"]) + "]::uuid[]"
            payload_sql = f"{jlit(payload)}||jsonb_build_object('taskIds',to_jsonb({S('ids', 'uuid[]')}))"
        else:
            if tool["source"] == "@previous-month":
                if not ctx["previous"]:
                    # Kept (never run) so the plan can tell an earlier carryover from a missing source.
                    add(tool["day"], "tool", tool["actor"], top, "Task Tools carryover (no source)", "NULL", check="skip", sub=ti,
                        record={"tool": "carryover"})
                    continue
                source_expr = f"{lit(ctx['previous'][0]['id'])}::uuid"
                payload["targetMonth"] = month.first.strftime("%Y-%m")
            else:
                source_expr = task_of(tool["source"])
            prep["s"] = source_expr
            payload["startDate"] = month.day(tool["startDay"]).isoformat()
            if tool.get("dueDay") is not None:
                payload["dueDate"] = month.day(month.clamp(tool["dueDay"])).isoformat()
            for k in ("count", "supportKind", "splitMode", "percentage", "amount"):
                if k in tool:
                    payload[k] = tool[k]
            if tool.get("assignee"):
                payload["assigneeId"] = P[tool["assignee"]]
            payload_sql = f"{jlit(payload)}||jsonb_build_object('sourceTaskId',{S('s', 'text')})"
        prep["p"] = None  # the preview is made as the actor, inside the call
        call = (f"(SELECT CASE WHEN (x->>'ready')::boolean THEN public.task_tools_command((x->>'id')::uuid,{lit(top)}::uuid) "
                f"ELSE jsonb_build_object('refused',x->'reasons') END FROM (SELECT public.task_tools_preview({lit(tool['command'])},{payload_sql}) x) p)")
        add(tool["day"], "tool", tool["actor"], top, f"Task Tools {tool['command']} {tool.get('source', tool.get('sources'))}", call,
            prep={k: v for k, v in prep.items() if v}, sub=ti, record={"tool": tool["command"]})

    # 7 policies, a milestone, draft reports, award requests.
    first_instant = ist(month.first, 0)
    for pi, pol in enumerate(fixture["policies"]):
        pop = op_id(org, "policy", pol["key"])
        body = {"name": pol["name"], "description": pol["description"], "templateKey": pol["templateKey"], "parameters": pol["parameters"],
                "periodKind": pol["periodKind"], "audience": {"kind": "everyone"},
                "reward": {"kind": "commendation", "badge": pol["badge"], "points": pol["points"]}, "ruleVersion": "policies-v1", "active": True}
        add(0, "policy", "md", pop, f"policy {pol['name']}", f"public.policy_command('create',{jlit(body)},{lit(pop)}::uuid)", check="policy",
            post=f"UPDATE taskpulse_private.policies SET created_at=least(created_at,{lit(first_instant)}::timestamptz) "
                 f"WHERE id=(current_setting('seed.r')::jsonb->>'policyId')::uuid;", sub=pi)
    for mi, mil in enumerate(fixture["milestones"]):
        row = op_id(org, "milestone", mil["key"])
        due = month.first + dt.timedelta(days=mil["dueDay"])
        add(0, "milestone", "md", row, f"milestone {mil['title']}",
            f"INSERT INTO public.company_milestones(id,title,description,status,owner_id,delivered_count,target_count,due_date) VALUES("
            f"{lit(row)}::uuid,{lit(mil['title'])},{lit(mil['description'])},{lit(mil['status'])}::public.milestone_status,{lit(P[mil['owner']])}::uuid,"
            f"{mil['delivered']},{mil['target']},{lit(due)}::date)", check="row", sub=mi, record={"row_id": row})
    for ri, rep in enumerate(fixture["reports"]):
        row = op_id(org, "report", rep["key"])
        payload = {"summary": rep["summary"], "folderUrl": None}
        add(rep["endDay"], "report", rep["author"], row, f"draft report {rep['title']}",
            f"INSERT INTO public.report_snapshots(id,report_type,title,status,period_start,period_end,employee_id,payload,created_by) VALUES("
            f"{lit(row)}::uuid,{lit(rep['type'])},{lit(rep['title'])},'Draft',{lit(month.day(rep['startDay']))}::date,{lit(month.day(rep['endDay']))}::date,"
            f"{lit(P[rep['employee']]) + '::uuid' if rep.get('employee') else 'NULL'},{jlit(payload)},{lit(P[rep['author']])}::uuid)",
            check="row", sub=ri, record={"row_id": row})
    slots = set(ctx["slots"])
    for offset in range(month.days):
        day = month.day(offset)
        if day.isoformat() in slots:
            continue
        aop = op_id(org, "award", day)
        add(offset, "award", "md", aop, f"award request {day}", f"public.award_command('request',{jlit({'date': day.isoformat()})},{lit(aop)}::uuid)",
            check="award", record={"award_day": day.isoformat(), "before_today": True})
    return steps


def record_table(kind):
    return {"fact": "daily_facts", "idea": "ideas", "suggestion": "suggestions", "sale": "sales_logs", "meeting": "meeting_points",
            "attendance": "attendance_records"}[kind]


def attendance_plan(fixture, month, ctx):
    """The record each person-day should have: hours cover every logged hour, check-in/out pair."""
    exceptions = ctx["exceptions"]
    planned = ctx["planned_hours"]
    existing_logged = ctx["existing_logged"]
    ci = fixture["checkIn"]
    lo = [int(x) for x in ci["earliest"].split(":")]
    hi = [int(x) for x in ci["latest"].split(":")]
    out = {}
    for person, info in fixture["people"].items():
        uid = ctx["uid"][person]
        for offset in range(ctx["through_offset"] + 1):
            day = month.day(offset)
            logged = existing_logged.get(f"{uid}|{day}", Decimal(0)) + planned.get((person, offset), Decimal(0))
            r = rng(month.first, person, offset, "attendance")
            status = exceptions.get((person, offset))
            if day.weekday() == 6 or day.isoformat() in ctx["holidays"]:
                rec = {"attendance_status": "Holiday", "attendance_hours": "0", "off_hours": fmt_num(up(logged)),
                       "holiday_name": ctx["holidays"].get(day.isoformat(), "Sunday")}
            elif status in ("Leave", "Absent") and logged == 0:
                rec = {"attendance_status": status, "attendance_hours": "0", "off_hours": "0"}
            else:
                half = status == "Half Day"
                base = Decimal("4") if half else q(r.uniform(8.0, 9.0))
                hours = min(Decimal("12"), max(base, up(logged)))
                off = max(Decimal(0), up(logged) - hours)
                minute = r.randint(lo[0] * 60 + lo[1], hi[0] * 60 + hi[1])
                check_in = ist(day, minute // 60, minute % 60)
                check_out = check_in + dt.timedelta(hours=float(hours), minutes=0 if half else ci["lunchMinutes"])
                rec = {"attendance_status": "Half Day" if half else "Present", "attendance_hours": fmt_num(hours), "off_hours": fmt_num(off),
                       "check_in_at": check_in.isoformat(), "check_out_at": check_out.isoformat()}
            out[(person, offset)] = rec
    return out


def same_attendance(row, rec):
    def num(v):
        return Decimal(str(v or 0)).normalize()

    def instant(v):
        return None if v is None else parse_ts(v).astimezone(dt.timezone.utc)

    return (row["state"] == "active" and row["status"] == rec["attendance_status"] and num(row["hours"]) == num(rec["attendance_hours"])
            and num(row["off_hours"]) == num(rec["off_hours"]) and instant(row["check_in"]) == instant(rec.get("check_in_at"))
            and instant(row["check_out"]) == instant(rec.get("check_out_at")) and (row["holiday"] or None) == rec.get("holiday_name"))


def attendance_steps(fixture, month, ctx):
    org, steps = ctx["org"], []
    rows = {(r["user_id"], r["day"]): r for r in ctx["attendance"]}
    by_uid = {v: k for k, v in ctx["uid"].items()}
    for (person, offset), rec in sorted(attendance_plan(fixture, month, ctx).items(), key=lambda kv: (kv[0][1], kv[0][0])):
        uid, day = ctx["uid"][person], month.day(offset)
        row = rows.get((uid, day.isoformat()))
        payload = dict(rec, business_date=day.isoformat(), author_id=uid)
        # With backdating, a matching row whose history sits on a later day is saved again so the
        # month reads the same "as of" any of its days; otherwise a matching row is left alone.
        if row and same_attendance(row, rec) and (not ctx["backdate"] or row["history_day"] == day.isoformat()):
            continue
        if row:
            payload["reason"] = ATTENDANCE_REASON
            aop = op_id(org, "attendance", uid, day, row["version"], digest(rec))
            call = f"public.dated_record_command('attendance',{lit(row['id'])}::uuid,'save',{jlit(payload)},{row['version']},{lit(aop)}::uuid)"
            label = f"attendance {person} {day} corrected to {rec['attendance_status']} {rec['attendance_hours']} h"
            before = {k: row[k] for k in ("id", "status", "hours", "off_hours", "check_in", "check_out", "holiday", "state", "notes")}
        else:
            aop = op_id(org, "attendance", uid, day, 0, digest(rec))
            call = f"public.dated_record_command('attendance',NULL,'save',{jlit(payload)},0,{lit(aop)}::uuid)"
            label = f"attendance {person} {day} {rec['attendance_status']} {rec['attendance_hours']} h"
            before = None
        steps.append(Step(offset, "attendance", "md", aop, label, call, sub=list(ctx["uid"]).index(by_uid[uid]),
                          record={"attendance": True, "person": person, "day": day.isoformat(), "before": before}))
    return steps


# --------------------------------------------------------------------------- running steps

MARKS = "CREATE TEMP TABLE IF NOT EXISTS seed_marks(t0 timestamptz, t1 timestamptz, target timestamptz) ON COMMIT DROP;\n"


def step_sql(step, uid, target):
    lines = [AS_OWNER, "SELECT set_config('seed.t0', clock_timestamp()::text, true);"]
    settings = [f"set_config('seed.{name}', ({expr})::text, true)" for name, expr in step.prep.items()]
    if settings:
        lines.append("SELECT " + ", ".join(settings) + ";")
    lines.append(as_actor(uid))
    if step.check == "row":  # a plain insert as the signed-in director, as the app does
        lines.append(f"{step.call};")
        lines.append("SELECT set_config('seed.r', '{}', true);")
    else:
        lines.append(f"SELECT set_config('seed.r', ({step.call})::text, true);")
    lines.append(AS_OWNER)
    if step.kind == "tool":
        lines.append("DO $tool$ BEGIN IF current_setting('seed.r')::jsonb ? 'refused' THEN RAISE EXCEPTION 'Task Tools preview refused: %', "
                     "current_setting('seed.r'); END IF; END $tool$;")
    if step.post:
        lines.append(step.post)
    if target is not None:
        t = f"{lit(target.isoformat())}::timestamptz"
        for table, column in PLAIN_TABLES:
            lines.append(f"UPDATE {table} SET {column}={t}+({column}-least({column},current_setting('seed.t0')::timestamptz))/1000 "
                         f"WHERE {column}>=now() AND {column}>{t};")
    lines.append(f"INSERT INTO seed_marks VALUES(current_setting('seed.t0')::timestamptz, clock_timestamp(), "
                 f"{'NULL' if target is None else lit(target.isoformat()) + '::timestamptz'});")
    return "\n".join(lines)


def backdate_sql(month, move_contracts):
    """Deferred moves for the immutable history tables, once per transaction (short trigger window)."""
    lines = ["SET CONSTRAINTS ALL IMMEDIATE;"]
    for table, column, key, order, trigger in HISTORY_TABLES:
        lines.append(f"ALTER TABLE {table} DISABLE TRIGGER {trigger};")
        # Rows from before this transaction of an entity a step touched stay older than the step.
        lines.append(f"""WITH touched AS (SELECT {key}, min(m.target) tmin FROM {table} h JOIN seed_marks m ON h.{column}>=m.t0 AND h.{column}<m.t1
   AND m.target IS NOT NULL GROUP BY {key}),
 older AS (SELECT h.{order} o, t.tmin, row_number() OVER (PARTITION BY {', '.join('h.' + k.strip() for k in key.split(','))} ORDER BY h.{column} DESC, h.{order} DESC) rn
   FROM {table} h JOIN touched t USING ({key}) WHERE h.{column}<(SELECT min(t0) FROM seed_marks) AND h.{column}>=t.tmin)
UPDATE {table} h SET {column}=o.tmin-o.rn*interval '1 millisecond' FROM older o WHERE h.{order}=o.o;""")
        lines.append(f"UPDATE {table} h SET {column}=m.target+(h.{column}-m.t0)/1000 FROM seed_marks m "
                     f"WHERE m.target IS NOT NULL AND h.{column}>=m.t0 AND h.{column}<m.t1;")
        lines.append(f"ALTER TABLE {table} ENABLE TRIGGER {trigger};")
    if move_contracts:
        first = f"{lit(ist(month.first, 0).isoformat())}::timestamptz"
        for c in CONTRACTS:
            lines.append(f"UPDATE {c} SET available_from={first} WHERE available_from>{first};")
    return "\n".join(lines)


def batch_sql(batch, uid, targets, month, backdate):
    parts = [MARKS]
    for step in batch:
        parts.append(f"-- {step.label}")
        parts.append(step_sql(step, uid[step.actor], targets.get(step.op)))
    if backdate:
        parts.append(backdate_sql(month, move_contracts=True))
    results = ("(SELECT jsonb_build_object('history_triggers',(SELECT jsonb_object_agg(g.tgname,g.tgenabled) FROM pg_trigger g WHERE g.tgname IN ("
               + ",".join(lit(t[4]) for t in HISTORY_TABLES) + "))))")
    return transaction("\n".join(parts), results)


def plan_targets(due, today):
    """Business instant of each step: its day from 10:00 IST in order; today's steps keep real time."""
    targets, per_day = {}, {}
    for step in due:
        if step.day_date >= today:
            continue
        n = per_day.get(step.day_date, 0)
        per_day[step.day_date] = n + 1
        hour = 9 if step.kind == "attendance" else 10
        targets[step.op] = ist(step.day_date, hour) + dt.timedelta(seconds=20 * n)
    return targets


# --------------------------------------------------------------------------- plan / apply

def load_fixture():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def plan(args, backend, fixture, month):
    gates, notes = [], []

    def gate(ok, label, detail=""):
        gates.append((bool(ok), label, detail))

    target_gates(args, backend, gate)
    if isinstance(backend, HostedBackend):
        gate(args.project_ref == PRODUCTION_REF, "hosted runs target the demo project only", args.project_ref)
    # The plan needs the people to build the steps, and the steps' operation ids to read receipts: two reads.
    pre = backend.query("state-people", state_sql(month, fixture, [], {}))
    users = {u["email"]: u for u in pre["users"]}
    org_ids = [o["id"] for o in pre["organizations"] if o["status"] == "active"]
    gate(pre["ledger"] == args.allow_ledger, f"migration ledger has {args.allow_ledger} entries", f"found {pre['ledger']}")
    gate(pre["definer_member"], "the connection can act as taskpulse_definer", pre["current_user"])
    gate(len(org_ids) == 1, "exactly one active company", ", ".join(o["name"] for o in pre["organizations"]))
    today = dt.date.fromisoformat(pre["today"])
    gate(month.first == today.replace(day=1), "the month is the current month (Asia/Kolkata)", f"{month.first:%Y-%m}, today {today}")
    gate(not pre["frozen"], "the month is open: no closed period, monthly snapshot or final report")
    gate(pre["policy_approved"], "award policy approved")
    gate(pre["tool_policy"], "Task Tools policy approved")
    gate(all(v == "O" for v in pre["triggers"].values()) and len(pre["triggers"]) == len(GUARDED_TRIGGERS), "guarded triggers enabled",
         json.dumps(pre["triggers"]))
    gate(len(pre["history_triggers"]) == len(HISTORY_TABLES) and all(v == "O" for v in pre["history_triggers"].values()),
         "history immutability triggers present and enabled", json.dumps(pre["history_triggers"]))
    uid = {}
    for key, person in fixture["people"].items():
        u = users.get(person["email"])
        ok = bool(u and u["is_active"] and u["role"] == person["role"] and u["organization_id"] in org_ids)
        gate(ok, f"{person['email']} is an active {person['role']}", "" if u is None else f"{u['role']}, active={u['is_active']}")
        if u:
            uid[key] = u["id"]
    others = [u["email"] for u in pre["users"] if u["is_active"] and u["email"] not in {p["email"] for p in fixture["people"].values()}]
    gate(not others, "no other active member (award days need everyone's attendance)", ", ".join(others))
    if not all(ok for ok, _, _ in gates):
        return {"gates": gates, "notes": notes, "steps": [], "due": []}
    through = min(today, month.last) if args.through is None else dt.date.fromisoformat(args.through)
    gate(month.first <= through <= today, "--through is in the month and not after today", str(through))

    holidays = pre["holidays"]
    off_days = {o for o in range(month.days) if month.day(o).weekday() == 6 or month.day(o).isoformat() in holidays}
    exceptions = {(e["person"], e["day"]): e["status"] for e in fixture["attendanceExceptions"]}
    logs, fixes = build_logs(fixture, month, off_days, exceptions)
    through_offset = (through - month.first).days
    # Prefer an ordinary mission for the carryover: standing missions carry the month in their title and month setup
    # recreates them, so carrying one over would duplicate it.
    label = (month.first - dt.timedelta(days=1)).strftime("%B %Y")
    pre["previous"].sort(key=lambda t: (label in t["title"], t["tag"]))
    ctx = {"uid": uid, "org": org_ids[0], "logs": logs, "fixes": fixes, "exceptions": exceptions, "holidays": holidays,
           "standing": pre["standing"], "month_setup_items": pre["month_setup_items"], "meeting_types": pre["meeting_types"],
           "previous": pre["previous"], "slots": pre["slots"], "through_offset": through_offset, "backdate": not args.no_backdate}

    # Attendance must cover every hour: rows already in the database plus planned logs not yet written.
    ctx["attendance"], ctx["existing_logged"], ctx["planned_hours"] = [], {}, {}
    probe = build_steps(fixture, month, ctx)
    state = backend.query("state", state_sql(month, fixture, probe, uid))
    done = set(state["done_ops"])
    reversed_done = {x["op"] for x in fixes["reverse"] if op_id(ctx["org"], "reverse", x["op"]) in done}
    corrected_done = {x["op"] for x in fixes["correct"] if op_id(ctx["org"], "correct", x["op"]) in done}
    pending = {}
    for x in logs:
        if x["day"] > through_offset:
            continue
        hours = x["hours"]
        if x["op"] in done:
            # Already in the database (and counted there); only its pending correction/reversal changes it.
            if x in fixes["reverse"] and x["op"] not in reversed_done:
                hours = -x["hours"]
            elif x in fixes["correct"] and x["op"] not in corrected_done:
                hours = -Q
            else:
                continue
        else:
            if x in fixes["reverse"]:
                continue
            if x in fixes["correct"]:
                hours = x["hours"] - Q
        pending[(x["person"], x["day"])] = pending.get((x["person"], x["day"]), Decimal(0)) + hours
    ctx["existing_logged"] = {k: Decimal(str(v)) for k, v in state["logged"].items()}
    # The capacity a day needs is the larger of what is logged now and what is logged after this run.
    ctx["planned_hours"] = {k: max(Decimal(0), v) for k, v in pending.items()}
    ctx["attendance"] = state["attendance"]
    steps = build_steps(fixture, month, ctx)
    for step in steps:
        step.day_date = month.day(step.day)

    # Fixture tags must be free or belong to this tool's missions.
    ours = set(state["seed_tasks"])
    foreign = [t["tag"] for t in state["tags"] if t["id"] not in ours]
    gate(not foreign, "fixture mission tags are free or this tool's", ", ".join(foreign))
    over = [f"{k} {v} h" for k, v in state["logged"].items() if Decimal(str(v)) > 24]
    gate(not over, "no member-day has more than 24 logged hours", ", ".join(over[:5]))

    fixed = set(state["fixed_rows"])
    due, due_total = [], 0
    for step in steps:
        if step.day > through_offset or step.check == "skip" or (step.kind == "award" and step.day_date >= today):
            continue
        due_total += 1
        if step.check == "skip" or (step.check in ("cmd", "policy", "award", "month") and step.op in done):
            continue
        if step.check == "invite" and (state["invitation"] or fixture["invitation"]["email"] in users):
            continue
        if step.check == "row" and step.record["row_id"] in fixed:
            continue
        due.append(step)
    due.sort(key=Step.key)
    carry = [op_id(ctx["org"], "tool", t["key"], month.first) for t in fixture["tools"] if t["command"] == "carryover"]
    if any(c in done for c in carry):
        notes.append("the carryover step ran in an earlier run")
    elif not ctx["previous"]:
        notes.append("no unfinished previous-month mission qualifies for the carryover step; it is skipped")
    else:
        notes.append(f"carryover source: {ctx['previous'][0]['tag']} {ctx['previous'][0]['title']}")
    if pre["month_setup_items"]:
        notes.append(f"the month is already set up ({pre['month_setup_items']} items); month setup is skipped")
    late = {c: v for c, v in state["contracts"].items() if v and parse_ts(v) > ist(month.first, 0)}
    if late and not args.no_backdate:
        notes.append("history baselines after the 1st move to the 1st: " + ", ".join(f"{c.split('.')[-1]} {v}" for c, v in late.items()))
    notes.append("not seeded (they start at the real time): running timers, checklist item-timer hours, Drive files, the ceremony publish, month close")
    return {"gates": gates, "notes": notes, "steps": steps, "due": due, "due_total": due_total, "state": state, "ctx": ctx, "today": today,
            "through": through}


def print_plan(args, backend, month, result):
    print(f"Demo workspace seed for {month.first:%B %Y} on {backend.label}")
    for ok, label, detail in result["gates"]:
        print(f"  [{'PASS' if ok else 'FAIL'}] {label}{(': ' + detail) if detail else ''}")
    if not result["due"] and not result["steps"]:
        return
    print(f"\nThrough {result['through']} (today {result['today']}); backdating {'off' if args.no_backdate else 'on'}")
    counts = {}
    for step in result["due"]:
        counts[step.kind] = counts.get(step.kind, 0) + 1
    print(f"Steps to run: {len(result['due'])} of {result['due_total']} due ({result['due_total'] - len(result['due'])} already done)")
    for kind in sorted(counts, key=lambda k: RANK[k]):
        print(f"  {kind:<11} {counts[kind]}")
    hours = sum(Decimal(s.record["hours"]) for s in result["due"] if s.record.get("log"))
    if hours:
        print(f"  log hours  {fmt_num(hours)}")
    for note in result["notes"]:
        print(f"  note: {note}")
    if args.verbose:
        for step in result["due"]:
            print(f"    {step.day_date} {step.kind:<10} {step.actor:<4} {step.label}")


def apply(args, backend, month, result, manifest):
    steps, uid = result["due"], result["ctx"]["uid"]
    targets = {} if args.no_backdate else plan_targets(steps, result["today"])
    batches, current = [], []
    for step in steps:
        # A transaction never mixes days, so a failure leaves whole days behind it.
        if current and (len(current) >= args.batch_size or current[-1].day != step.day):
            batches.append(current)
            current = []
        current.append(step)
    if current:
        batches.append(current)
    for index, batch in enumerate(batches, 1):
        outcome = backend.query(f"batch-{index:03d}", batch_sql(batch, uid, targets, month, not args.no_backdate))
        if any(v != "O" for v in outcome["history_triggers"].values()):
            raise RuntimeError(f"batch {index}: history triggers not re-enabled: {outcome}")
        for step in batch:
            manifest["steps"].append({"op": step.op, "kind": step.kind, "day": step.day_date.isoformat(), "label": step.label,
                                      **{k: v for k, v in step.record.items() if k in ("mission", "tag", "kind", "key", "tool", "row_id",
                                                                                         "attendance", "person", "day", "before")}})
        save_manifest(manifest)
        print(f"  batch {index}/{len(batches)}: {batch[0].day_date} {len(batch)} step(s)")


def verify(args, backend, month, result):
    uid, through = result["ctx"]["uid"], result["through"]
    md = uid["md"]
    nxt = through + dt.timedelta(days=1)
    sql = transaction(as_actor(md) + f"""SELECT set_config('seed.verify', jsonb_build_object(
 'counts', (SELECT jsonb_build_object(
   'missions', (SELECT count(*) FROM public.tasks WHERE assigned_date BETWEEN {lit(month.first)} AND {lit(month.last)}),
   'logs', (SELECT count(*) FROM public.daily_task_logs WHERE reversed_at IS NULL AND log_date BETWEEN {lit(month.first)} AND {lit(through)}),
   'checklist_rows', (SELECT count(*) FROM public.checklist_nodes n JOIN public.task_checklists c ON c.id=n.checklist_id JOIN public.tasks t ON t.id=c.task_id
     WHERE t.assigned_date BETWEEN {lit(month.first)} AND {lit(month.last)}),
   'attendance', (SELECT count(*) FROM public.attendance_records WHERE record_state='active' AND attendance_date BETWEEN {lit(month.first)} AND {lit(through)}),
   'facts', (SELECT count(*) FROM public.daily_facts WHERE fact_date BETWEEN {lit(month.first)} AND {lit(through)}),
   'ideas', (SELECT count(*) FROM public.ideas WHERE idea_date BETWEEN {lit(month.first)} AND {lit(through)}),
   'suggestions', (SELECT count(*) FROM public.suggestions WHERE suggestion_date BETWEEN {lit(month.first)} AND {lit(through)}),
   'sales', (SELECT count(*) FROM public.sales_logs WHERE sale_date BETWEEN {lit(month.first)} AND {lit(through)}),
   'meetings', (SELECT count(*) FROM public.meeting_points WHERE meeting_date BETWEEN {lit(month.first)} AND {lit(through)}),
   'reports', (SELECT count(*) FROM public.report_snapshots WHERE status='Draft'),
   'milestones', (SELECT count(*) FROM public.company_milestones))),
 'performance', public.performance_source_context({lit(month.first)}::date,{lit(nxt)}::date,clock_timestamp()),
 'policies', public.policy_list()
)::text, true);""", "current_setting('seed.verify')::jsonb")
    data = backend.query("verify", sql)
    print("\nVerification (as the demo managing director):")
    for k, v in data["counts"].items():
        print(f"  {k:<15} {v}")
    problems = []
    perf = data["performance"]
    if not perf.get("historyAvailable"):
        problems.append(f"history unavailable as of now (available from {perf.get('historyAvailableFrom')})")
    for row in perf.get("attendance", []):
        if row["userId"] not in uid.values():
            continue
        print(f"  attendance {row['userId']}: valid={row['valid']} available={row['available']} hours={row['hours']} reasons={row['reasons']}")
        if not (row["valid"] and row["available"]):
            problems.append(f"attendance for {row['userId']}: {row['reasons']}")
    contribution_reasons = (perf.get("contributions") or {}).get("reasons") or []
    print(f"  contribution reasons: {contribution_reasons or 'none'}")
    if any(str(r).startswith("sales") for r in contribution_reasons):
        problems.append(f"sales inputs are not available: {contribution_reasons}")
    policies = data["policies"].get("policies") if isinstance(data["policies"], dict) else data["policies"]
    print(f"  policies        {len(policies or [])}")
    if problems:
        raise RuntimeError("Verification failed: " + "; ".join(problems))
    print("PASS verification: every demo member's attendance is valid and sales inputs are available")
    print("Next: run the award worker (GitHub Actions 'award-worker', or the app's /api/internal/awards) to certify the days and evaluate policies.")


# --------------------------------------------------------------------------- undo

def undo(args, backend, path):
    source = json.loads(Path(path).read_text(encoding="utf-8"))
    if source.get("tool") != "tools/seed_demo_workspace.py":
        raise Refusal("not a demo workspace seed manifest")
    if source["target"] != target_identity(args, backend):
        raise Refusal(f"Manifest target {source['target']} is not this target")
    uid = source["people"]
    md = uid["md"]
    ops = [s["op"] for s in source["steps"]]
    # The carried-over mission's source is archived with a successor link; both stay as history.
    carry = [s["op"] for s in source["steps"] if s.get("tool") == "carryover"]
    state = backend.query("undo-state", transaction("", f"""jsonb_build_object(
 'ledger', CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN NULL ELSE (SELECT count(*) FROM supabase_migrations.schema_migrations) END,
 'tasks', (SELECT coalesce(jsonb_agg(DISTINCT x),'[]') FROM (
   SELECT result x FROM taskpulse_private.command_receipts WHERE operation_id = ANY({uuid_array(ops)}) AND command='save_task_with_participants'
   UNION SELECT (i->>'taskId')::uuid FROM taskpulse_private.command_receipts r, jsonb_array_elements(r.result_payload->'items') i
   WHERE r.operation_id = ANY({uuid_array(ops)}) AND r.command IN ('task_tools','month_setup') AND r.operation_id <> ALL({uuid_array(carry)})) s
   WHERE x IN (SELECT id FROM public.tasks)),
 'records', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind',split_part(command,'_',2),'id',result)),'[]') FROM taskpulse_private.command_receipts
   WHERE operation_id = ANY({uuid_array(ops)}) AND command ~ '^dated_(fact|idea|suggestion|sale|meeting)_save$' AND request->>1 IS NULL),
 'policies', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'version',p.version)),'[]') FROM taskpulse_private.policy_receipts r
   JOIN taskpulse_private.policies p ON p.id=(r.response->>'policyId')::uuid WHERE r.operation = ANY({uuid_array(ops)}) AND p.archived_at IS NULL),
 'attendance', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'version',a.record_version,'user_id',a.user_id,'day',a.attendance_date,'state',a.record_state)),'[]')
   FROM taskpulse_private.command_receipts r JOIN public.attendance_records a ON a.id=r.result WHERE r.operation_id = ANY({uuid_array(ops)})
   AND r.command='dated_attendance_save')
)"""))
    if state["ledger"] != args.allow_ledger:
        raise Refusal(f"migration ledger has {state['ledger']} entries, expected {args.allow_ledger}")
    report = snapshot(backend, "undo-plan", state["tasks"], with_rows=False) if state["tasks"] else None
    if report and (report["foreign_owned"] or report["extra_tasks"]):
        raise Refusal(f"created missions are referenced by other rows: {report['foreign_owned']} {report['extra_tasks']}")
    before = {s["day"] + "|" + s["person"]: s["before"] for s in source["steps"] if s.get("attendance")}
    by_key = {(a["user_id"], a["day"]): a for a in state["attendance"]}
    restore, withdraw = [], []
    person_of = {v: k for k, v in uid.items()}
    for (user, day), row in by_key.items():
        prior = before.get(f"{day}|{person_of.get(user)}")
        if prior:
            restore.append((row, prior))
        elif row["state"] == "active":
            withdraw.append(row)
    print(f"Undo {path}: {len(state['tasks'])} mission(s), {len(state['records'])} record(s), {len(withdraw)} attendance row(s) to withdraw, "
          f"{len(restore)} to restore, {len(state['policies'])} polic(ies)")
    if report:
        print("  mission rows: " + ", ".join(f"{k} {v}" for k, v in sorted(report["counts"].items())))
    if not args.yes:
        print("Dry run: pass --yes to undo.")
        return
    if backend.is_production and args.confirm_production_ref != PRODUCTION_REF:
        raise Refusal("the demo project needs --confirm-production-ref")
    if state["tasks"]:
        full = snapshot(backend, "undo-snapshot", state["tasks"], with_rows=False)
        body = delete_sql(state["tasks"], full["digest"], UNDO_REASON, {"monthly": [], "reports": []}, "public.task_timers" in full["counts"])
        # Task Tools lineage rows are immutable and an archived mission is read-only; lift those guards for the
        # delete only (from before the soft reversal until after the deferred checks), then check they are back.
        guards = [(f"public.{t}", "a_m09_archive_read_only") for t in ARCHIVE_GUARDED] + [("taskpulse_private.tool_lineage", "m09_lineage_immutable")]

        def toggle(on):
            return "\n".join(f"ALTER TABLE {r} {'ENABLE' if on else 'DISABLE'} TRIGGER {n};" for r, n in guards)
        start = "SET LOCAL search_path TO '';\n"
        anchor = "ALTER TABLE public.daily_task_logs ENABLE TRIGGER m02_retain_logs;"
        assert body.count(start) == 1 and body.count(anchor) == 1, "the shared delete script changed shape"
        body = body.replace(start, start + toggle(False) + "\n", 1).replace(anchor, anchor + "\n" + toggle(True), 1)
        outcome = backend.query("undo-delete", body)
        enabled = backend.query("undo-guards", transaction("", "(SELECT jsonb_agg(DISTINCT tgenabled::text) FROM pg_trigger WHERE tgname IN "
                                                               "('a_m09_archive_read_only','m09_lineage_immutable'))"))
        if outcome["remaining_tasks"] or any(v != "O" for v in outcome["triggers"].values()) or enabled != ["O"]:
            raise RuntimeError(f"Undo verification failed: {outcome}, archive and lineage guards {enabled}")
    lines = [as_actor(md)]
    for rec in state["records"]:
        lines.append(f"SELECT public.dated_record_command({lit(rec['kind'])},{lit(rec['id'])}::uuid,'withdraw',{jlit({'reason': UNDO_REASON})},"
                     f"(SELECT record_version FROM public.{record_table(rec['kind'])} WHERE id={lit(rec['id'])}::uuid),gen_random_uuid()) "
                     f"WHERE (SELECT validation_state FROM public.{record_table(rec['kind'])} WHERE id={lit(rec['id'])}::uuid)<>'withdrawn';")
    for row in withdraw:
        lines.append(f"SELECT public.dated_record_command('attendance',{lit(row['id'])}::uuid,'withdraw',{jlit({'reason': UNDO_REASON})},{row['version']},gen_random_uuid());")
    for row, prior in restore:
        payload = {"business_date": row["day"], "author_id": row["user_id"], "attendance_status": prior["status"], "attendance_hours": str(prior["hours"]),
                   "off_hours": str(prior["off_hours"]), "check_in_at": prior["check_in"], "check_out_at": prior["check_out"],
                   "holiday_name": prior["holiday"], "content": prior.get("notes"), "reason": UNDO_REASON}
        lines.append(f"SELECT public.dated_record_command('attendance',{lit(row['id'])}::uuid,'save',{jlit(payload)},{row['version']},gen_random_uuid());")
    for pol in state["policies"]:
        lines.append(f"SELECT public.policy_command('archive',{jlit({'policyId': pol['id'], 'expectedVersion': pol['version'], 'reason': UNDO_REASON})},gen_random_uuid());")
    inv = source.get("invitation_email")
    lines.append(f"SELECT public.people_command('revoke',jsonb_build_object('invitationId',i.id)) FROM public.member_invitations i "
                 f"WHERE i.email={lit(inv)} AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.id IN (SELECT id FROM public.member_invitations "
                 f"WHERE invited_by={lit(md)}::uuid);")
    rows = [s["row_id"] for s in source["steps"] if s.get("row_id")]
    lines.append(f"DELETE FROM public.report_snapshots WHERE id = ANY({uuid_array(rows)}) AND status='Draft';")
    lines.append(f"DELETE FROM public.company_milestones WHERE id = ANY({uuid_array(rows)});")
    lines.append(AS_OWNER)
    backend.query("undo-records", transaction("\n".join(lines), "to_jsonb(true)"))
    print(f"PASS undo: {len(state['tasks'])} mission(s) deleted, {len(state['records'])} record(s) withdrawn, "
          f"{len(withdraw)} attendance row(s) withdrawn, {len(restore)} restored, {len(state['policies'])} polic(ies) archived")


# --------------------------------------------------------------------------- main

def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--target", choices=("hosted", "local"), required=True)
    parser.add_argument("--project-ref")
    parser.add_argument("--workdir", type=Path)
    parser.add_argument("--confirm-production-ref")
    parser.add_argument("--psql")
    parser.add_argument("--port", type=int, default=15432)
    parser.add_argument("--db")
    parser.add_argument("--month", help="YYYY-MM; must be the current month (default)")
    parser.add_argument("--through", help="last business day to fill (default today)")
    parser.add_argument("--no-backdate", action="store_true", help="keep the real time on history rows")
    parser.add_argument("--batch-size", type=int, default=10, help="steps per transaction (one day at most)")
    parser.add_argument("--allow-ledger", type=int, default=DEFAULT_LEDGER)
    parser.add_argument("--manifest-dir", type=Path, default=Path(tempfile.gettempdir()) / "taskpulse-demo-workspace")
    parser.add_argument("--undo", type=Path, metavar="MANIFEST")
    parser.add_argument("--dry-run", action="store_true", help="print the plan only (default without --yes)")
    parser.add_argument("--yes", action="store_true", help="apply the plan")
    parser.add_argument("--verbose", action="store_true", help="list every step in the plan")
    args = parser.parse_args(argv)
    if args.target == "hosted" and not (args.project_ref and args.workdir):
        parser.error("--target hosted needs --project-ref and --workdir")
    if args.target == "local" and not (args.psql and args.db):
        parser.error("--target local needs --psql and --db")
    if args.batch_size < 1 or args.batch_size > 200:
        parser.error("--batch-size must be 1-200")
    manifest_dir = args.manifest_dir.resolve()
    if manifest_dir == ROOT or ROOT in manifest_dir.parents:
        parser.error("--manifest-dir must be outside the repository")
    args.manifest_dir = manifest_dir
    return args


def main(argv=None):
    args = parse_args(argv)
    args.manifest_dir.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    sql_dir = args.manifest_dir / f"sql-{stamp}-{uuid.uuid4().hex[:4]}"
    sql_dir.mkdir()
    backend = HostedBackend(sql_dir, args.project_ref, args.workdir) if args.target == "hosted" else \
        LocalBackend(sql_dir, args.psql, args.port, args.db)
    try:
        if args.undo:
            undo(args, backend, args.undo)
            return 0
        fixture = load_fixture()
        today = dt.datetime.now(IST).date()
        month = Month(dt.date.fromisoformat((args.month or today.strftime("%Y-%m")) + "-01"))
        result = plan(args, backend, fixture, month)
        print_plan(args, backend, month, result)
        if not all(ok for ok, _, _ in result["gates"]):
            print("\nREFUSED: one or more gates failed; nothing was written.")
            return 2
        if not args.yes or args.dry_run:
            print("\nDry run: nothing was written. Pass --yes to apply.")
            return 0
        if backend.is_production and args.confirm_production_ref != PRODUCTION_REF:
            raise Refusal("the demo project needs --confirm-production-ref")
        manifest = {"path": str(args.manifest_dir / f"demo-workspace-{stamp}-{uuid.uuid4().hex[:6]}.json"), "tool": "tools/seed_demo_workspace.py",
                    "started_at": stamp, "target": target_identity(args, backend), "month": month.first.isoformat(),
                    "through": result["through"].isoformat(), "backdate": not args.no_backdate, "people": result["ctx"]["uid"],
                    "invitation_email": fixture["invitation"]["email"], "contracts_before": result["state"]["contracts"], "steps": []}
        save_manifest(manifest)
        print(f"\nManifest: {manifest['path']}")
        if result["due"]:
            apply(args, backend, month, result, manifest)
        verify(args, backend, month, result)
        manifest["finished_at"] = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        save_manifest(manifest)
        return 0
    except Refusal as refusal:
        print(f"\nREFUSED: {refusal}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
