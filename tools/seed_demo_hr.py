"""Fill the demo project's HR pages (M19, migrations 80-81) with made-up data so they show something.

Everything below is invented demo content. The tool replays it through the app's own commands:

  0 state     gates: migration ledger at least 81, one active company, exactly one active managing
              director, at least three other active members, no Code of Conduct and no reviews yet
              (the tool runs once)
  1 conduct   code_of_conduct_command('publish') as the director: a short demo Code of Conduct (v1);
              the first member then accepts it
  2 reviews   performance_review_command as the director: "October 2026 review" for three members on
              the six seeded metrics; the second member rates themselves and submits; the third
              does too and the director rates and completes it. The first stays with the employee.
  3 verify    performance_reviews() as the director: one review in each state

Personal records are not seeded: they are files each employee uploads (the Storage API, not SQL).

Hosted mode reuses the Supabase CLI query channel of tools/seed_sheet_to_project.py. The demo project
is the ref that tool calls production, so --yes there needs --confirm-production-ref. Without --yes
only the plan and the gates are shown.
"""

import argparse
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_sheet_to_project import (  # noqa: E402
    AS_OWNER, PRODUCTION_REF, HostedBackend, as_actor, jlit, lit, op_id, transaction,
)

MIN_LEDGER = 81
TITLE = 'October 2026 review'

CONDUCT = """This demo Code of Conduct shows how the page looks. The managing director replaces it with the company's own.

# 1. Integrity
- Record time, attendance and expenses truthfully.
- Declare any personal interest in a decision you take for the company.

# 2. Respect
- Treat colleagues, customers and site workers with courtesy.
- Report harassment or discrimination to the managing director.

# 3. Safety on site
- Wear the protective equipment the site requires.
- Stop work and report any unsafe condition straight away.

# 4. Confidential information
- Customer details, prices and drawings stay inside the company."""

# Invented self and director scores per metric (the six metrics migration 81 seeds, in order).
SELF = [
    (4, 'I check drawings twice before release'), (3, 'Late twice this month'), (4, ''),
    (5, 'Helped the site team with the handover'), (3, ''), (4, 'Finished the AutoCAD course'),
]
DIRECTOR = [
    (4, 'Consistent quality'), (3, 'Needs to be on time for client calls'), (4, ''),
    (5, 'Strong support during handover'), (4, 'Clear weekly updates'), (4, ''),
]
SELF_PROS, SELF_CONS = ['Careful with details', 'Quick to help colleagues'], ['Time keeping in the mornings']
MD_PROS, MD_CONS = ['Reliable on deadlines', 'Good with customers'], ['Punctuality for client calls', 'Delegate more']
SUMMARY = 'A solid month. Keep the quality; focus on punctuality for client calls next month.'

STATE_SQL = """(SELECT jsonb_build_object(
 'ledger', (SELECT max(version::int) FROM supabase_migrations.schema_migrations),
 'companies', (SELECT count(*) FROM public.organizations WHERE status='active'),
 'directors', (SELECT jsonb_agg(u.id) FROM public.users u WHERE u.role='managing_director' AND u.is_active),
 'members', (SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name) ORDER BY u.full_name) FROM public.users u
   WHERE u.is_active AND u.role<>'managing_director' AND u.organization_id=(SELECT id FROM public.organizations WHERE is_default)),
 'existing', (SELECT count(*) FROM taskpulse_private.code_of_conduct_versions)+(SELECT count(*) FROM taskpulse_private.performance_reviews)))"""


def ratings(scores):
    return [{'sort': i, 'score': s, 'comment': c} for i, (s, c) in enumerate(scores)]


def review_id(uid):
    """The member's seeded review, found as the owner inside the same transaction (private table)."""
    return f"(SELECT id FROM taskpulse_private.performance_reviews WHERE employee_id={lit(uid)}::uuid AND title={lit(TITLE)})"


def review_sql(actor, op, uid, payload, key):
    return (AS_OWNER
            + f"SELECT set_config('seed.r', {review_id(uid)}::text, true), "
            + f"set_config('seed.v', (SELECT version FROM taskpulse_private.performance_reviews WHERE id={review_id(uid)})::text, true);\n"
            + as_actor(actor)
            + f"SELECT public.performance_review_command({lit(op)}, current_setting('seed.r')::uuid, {jlit(payload)}, "
            + f"current_setting('seed.v')::bigint, {lit(op_id('hr-demo', key))}::uuid);\n")


def build_steps(md, members):
    first, second, third = members[:3]
    steps = [
        ('publish the demo Code of Conduct (v1)', as_actor(md)
         + f"SELECT public.code_of_conduct_command('publish', 'Code of Conduct', {lit(CONDUCT)}, 0, {lit(op_id('hr-demo', 'conduct'))}::uuid);\n"),
        (f"{first['name']} accepts it", as_actor(first['id'])
         + f"SELECT public.code_of_conduct_command('acknowledge', NULL, NULL, 1, {lit(op_id('hr-demo', 'accept', first['id']))}::uuid);\n"),
        (f"start '{TITLE}' for {first['name']}, {second['name']}, {third['name']}", AS_OWNER
         + "SELECT set_config('seed.m', (SELECT jsonb_agg(id ORDER BY sort,name)::text FROM taskpulse_private.review_metrics "
         + "WHERE organization_id=(SELECT id FROM public.organizations WHERE is_default) AND active), true);\n"
         + as_actor(md)
         + f"SELECT public.performance_review_command('create', NULL, jsonb_build_object('employeeIds', {jlit([first['id'], second['id'], third['id']])}, "
         + f"'title', {lit(TITLE)}, 'metricIds', current_setting('seed.m')::jsonb), 0, {lit(op_id('hr-demo', 'create'))}::uuid);\n"),
    ]
    for member in (second, third):
        steps.append((f"{member['name']} rates themselves and submits", review_sql(member['id'], 'self', member['id'],
            {'ratings': ratings(SELF), 'pros': SELF_PROS, 'cons': SELF_CONS, 'submit': True}, ('self', member['id']))))
    steps.append((f"the director rates {third['name']} and completes the review", review_sql(md, 'director', third['id'],
        {'ratings': ratings(DIRECTOR), 'pros': MD_PROS, 'cons': MD_CONS, 'summary': SUMMARY, 'complete': True}, ('director', third['id']))))
    return steps


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--project-ref', required=True)
    parser.add_argument('--workdir', type=Path, required=True, help='Supabase CLI folder linked only to that project')
    parser.add_argument('--confirm-production-ref')
    parser.add_argument('--yes', action='store_true', help='apply (default: plan and gates only)')
    args = parser.parse_args(argv)

    link = args.workdir / 'supabase' / '.temp' / 'project-ref'
    if not link.is_file() or link.read_text(encoding='utf-8').strip() != args.project_ref:
        raise SystemExit(f'Refused: {link} is not linked to {args.project_ref}')
    if args.project_ref != PRODUCTION_REF:
        raise SystemExit('Refused: this tool seeds only the demo project')
    if args.yes and args.confirm_production_ref != PRODUCTION_REF:
        raise SystemExit('Refused: --yes on the demo project needs --confirm-production-ref')
    backend = HostedBackend(Path(tempfile.mkdtemp(prefix='hr-demo-')), args.project_ref, args.workdir)

    state = backend.query('state', transaction('', STATE_SQL))
    members = state['members'] or []
    gates = [
        ((state['ledger'] or 0) >= MIN_LEDGER, f"migration ledger {state['ledger']} >= {MIN_LEDGER}"),
        (state['companies'] == 1, f"one active company ({state['companies']})"),
        (len(state['directors'] or []) == 1, f"exactly one active managing director ({len(state['directors'] or [])})"),
        (len(members) >= 3, f"at least three other active members ({len(members)})"),
        (state['existing'] == 0, f"no Code of Conduct or reviews yet ({state['existing']} rows)"),
    ]
    for ok, label in gates:
        print(('PASS ' if ok else 'FAIL ') + label)
    if not all(ok for ok, _ in gates):
        raise SystemExit('Refused: a gate failed; nothing was written.')

    md = state['directors'][0]
    steps = build_steps(md, members)
    print(f'\nPlan ({len(steps)} commands, one transaction):')
    for label, _ in steps:
        print('  ' + label)
    if not args.yes:
        print('\nDry run: nothing written. Add --yes --confirm-production-ref to apply.')
        return 0

    body = '\n'.join(f'-- {label}\n{sql}' for label, sql in steps)
    backend.query('seed', transaction(body, "(SELECT jsonb_build_object('reviews',(SELECT count(*) FROM taskpulse_private.performance_reviews)))"))
    print('\nApplied.')

    read = backend.query('verify', transaction(as_actor(md) + "SELECT set_config('seed.read', public.performance_reviews()::text, true);\n",
                                               "current_setting('seed.read')::jsonb"))
    statuses = sorted(review['status'] for review in read['reviews'])
    print('Reviews by state:', ', '.join(statuses))
    if statuses != ['awaiting_md', 'awaiting_self', 'completed']:
        raise SystemExit('Verify failed: expected one review in each state.')
    print('Verified: one review in each state.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
