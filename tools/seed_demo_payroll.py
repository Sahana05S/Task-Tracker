"""Fill the demo project's payroll (M18, migration 74) with made-up data so every payroll page shows something.

All amounts below are invented demo figures, not anyone's real salary. The tool replays them through the
app's own commands, as the demo company's managing director (the only role payroll allows):

  0 state     gates: migration ledger at least 74, one active company, exactly one active managing
              director, every demo employee below active in that company, and no payroll data yet
              (the tool runs once; it refuses a company that already has salaries)
  1 files     payroll_command per employee: profile, salary revisions, fixed deductions, monthly
              deductions and incentives, advances
  2 finalise  payroll_month_command('finalize') for FINALISE_MONTH, so Salary records has a month;
              the current month stays a live draft
  3 verify    payroll_month as the director for every month seeded: each line's columns are checked
              against the salary rules (E = D / E3, F = E x (C + extra), I = MIN(F, D), J = I - G) and
              each employee's deductions against the amounts seeded here

Hosted mode reuses the Supabase CLI query channel of tools/seed_sheet_to_project.py. The demo project
is the ref that tool calls production, so --yes there needs --confirm-production-ref. Without --yes
only the plan and the gates are shown.
"""

import argparse
import datetime as dt
import sys
import tempfile
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_sheet_to_project import (  # noqa: E402
    AS_OWNER, PRODUCTION_REF, HostedBackend, Refusal, as_actor, jlit, lit, op_id, transaction,
)

MIN_LEDGER = 74
FINALISE_MONTH = '2026-09'
MONTHS = ['2026-09', '2026-10']

# Invented demo figures, keyed by employee ID. Components use the names migration 74 seeds.
EMPLOYEES = {
    'SRB HRC': {
        'profile': {'joiningDate': '2024-03-01', 'paymentMode': 'bank_transfer', 'accountNumber': 'DEMO 0000 1101', 'employmentStatus': 'active', 'notes': 'Demo data'},
        'revisions': [('2026-08', '45000', 'Demo salary')],
        'fixed': [('Professional Tax', '200', '2026-08', ''), ('Provident Fund', '1800', '2026-08', ''), ('Mobile Bill', '500', '2026-08', '')],
        'monthly': [('2026-09', 'incentive', 'Bonus', '2000', 'Festival bonus')],
        'advances': [],
    },
    'ARK KVL': {
        'profile': {'joiningDate': '2025-06-16', 'paymentMode': 'upi', 'accountNumber': '', 'employmentStatus': 'active', 'notes': 'Demo data'},
        'revisions': [('2026-08', '24000', 'Demo salary')],
        'fixed': [('Professional Tax', '200', '2026-08', '')],
        'monthly': [('2026-09', 'variable_deduction', 'Late Login Deduction', '150', '3 late logins'),
                    ('2026-09', 'incentive', 'Star Performer', '1000', 'Star of the month'),
                    ('2026-10', 'variable_deduction', 'Mobile Bill', '250', ''),
                    ('2026-10', 'incentive', 'Fuel Allowance', '600', 'Site visits')],
        'advances': [],
    },
    'SRB PDM': {
        'profile': {'joiningDate': '2024-03-04', 'paymentMode': 'bank_transfer', 'accountNumber': 'DEMO 0000 2202', 'employmentStatus': 'active', 'notes': 'Demo data'},
        'revisions': [('2026-08', '26000', 'Demo salary'), ('2026-10', '28000', 'Demo revision')],
        'fixed': [('Professional Tax', '200', '2026-08', ''), ('Provident Fund', '1800', '2026-10', '')],
        'monthly': [('2026-09', 'variable_deduction', 'Advance', '2000', 'Advance repayment'),
                    ('2026-10', 'variable_deduction', 'Advance', '2000', 'Advance repayment'),
                    ('2026-10', 'incentive', 'Incentive', '1500', 'Project handover')],
        'advances': [('2026-09-03', 'Medical', '6000')],
    },
    'SRB VJY': {
        'profile': {'joiningDate': '2024-03-01', 'paymentMode': 'cash', 'accountNumber': '', 'employmentStatus': 'active', 'notes': 'Demo data'},
        'revisions': [('2026-08', '32000', 'Demo salary')],
        'fixed': [('Professional Tax', '200', '2026-08', ''), ('Recurring Deposit', '1000', '2026-08', '')],
        'monthly': [('2026-09', 'variable_deduction', 'Fuel Expenses', '400', ''),
                    ('2026-10', 'variable_deduction', 'Advance', '1000', 'Advance repayment'),
                    ('2026-10', 'variable_deduction', 'Inadequate Performance', '500', 'Missed review')],
        'advances': [('2026-10-08', 'Personal', '3000')],
    },
}


def employee_sql(uid, md, section, payload_sql, op):
    """One payroll_command as the director, with the employee's current pay-file version."""
    return (AS_OWNER
            + f"SELECT set_config('seed.v', coalesce((SELECT version FROM taskpulse_private.employee_pay_profiles WHERE user_id={lit(uid)}::uuid),0)::text, true);\n"
            + as_actor(md)
            + f"SELECT public.payroll_command({lit(section)}, {payload_sql}, current_setting('seed.v')::bigint, {lit(op)}::uuid);\n")


def component(kind, name):
    return (f"(SELECT c.id::text FROM taskpulse_private.pay_components c WHERE c.organization_id=(SELECT id FROM public.organizations WHERE is_default) "
            f"AND c.kind={lit(kind)} AND c.name={lit(name)})")


def build_steps(ids, md):
    steps = []
    for emp, data in EMPLOYEES.items():
        uid = ids[emp]
        base = {'userId': uid}
        steps.append((f'{emp} profile', employee_sql(uid, md, 'profile', jlit({**base, **data['profile']}), op_id('payroll-demo', emp, 'profile'))))
        for month, amount, note in data['revisions']:
            steps.append((f'{emp} salary {amount} from {month}', employee_sql(uid, md, 'revision',
                jlit({**base, 'effectiveFrom': month, 'monthlySalary': amount, 'note': note}), op_id('payroll-demo', emp, 'revision', month))))
        for name, amount, start, until in data['fixed']:
            # The component id is looked up as the owner inside the same transaction (private table).
            payload = f"({jlit({**base, 'monthlyAmount': amount, 'effectiveFrom': start, 'effectiveUntil': until})} || jsonb_build_object('componentId', current_setting('seed.c')))"
            sql = AS_OWNER + f"SELECT set_config('seed.c', {component('fixed_deduction', name)}, true);\n"
            steps.append((f'{emp} fixed {name} {amount}', sql + employee_sql(uid, md, 'fixed', payload, op_id('payroll-demo', emp, 'fixed', name, start))))
        for index, (month, kind, name, amount, note) in enumerate(data['monthly']):
            payload = f"({jlit({**base, 'period': month, 'amount': amount, 'note': note})} || jsonb_build_object('componentId', current_setting('seed.c')))"
            sql = AS_OWNER + f"SELECT set_config('seed.c', {component(kind, name)}, true);\n"
            steps.append((f'{emp} {month} {name} {amount}', sql + employee_sql(uid, md, 'adjustment', payload, op_id('payroll-demo', emp, 'adjustment', index))))
        for paid_on, reason, amount in data['advances']:
            steps.append((f'{emp} advance {amount} on {paid_on}', employee_sql(uid, md, 'advance',
                jlit({**base, 'paidOn': paid_on, 'reason': reason, 'amount': amount}), op_id('payroll-demo', emp, 'advance', paid_on))))
    period = f'{FINALISE_MONTH}-01'
    steps.append((f'finalise {FINALISE_MONTH}', AS_OWNER
        + f"SELECT set_config('seed.v', coalesce((SELECT version FROM taskpulse_private.payroll_months WHERE period_start={lit(period)}::date "
        + "AND organization_id=(SELECT id FROM public.organizations WHERE is_default)),0)::text, true);\n"
        + as_actor(md)
        + f"SELECT public.payroll_month_command('finalize', {lit(period)}::date, NULL, current_setting('seed.v')::bigint, {lit(op_id('payroll-demo', 'finalize', FINALISE_MONTH))}::uuid);\n"))
    return steps


STATE_SQL = """(SELECT jsonb_build_object(
 'ledger', (SELECT max(version)::int FROM supabase_migrations.schema_migrations),
 'companies', (SELECT count(*) FROM public.organizations WHERE status='active'),
 'directors', (SELECT jsonb_agg(u.id) FROM public.users u WHERE u.role='managing_director' AND u.is_active),
 'employees', (SELECT jsonb_object_agg(u.employee_id, u.id) FROM public.users u WHERE u.is_active
   AND u.organization_id=(SELECT id FROM public.organizations WHERE is_default)),
 'payroll_rows', (SELECT count(*) FROM taskpulse_private.salary_revisions)+(SELECT count(*) FROM taskpulse_private.pay_adjustments)
   +(SELECT count(*) FROM taskpulse_private.salary_advances)+(SELECT count(*) FROM taskpulse_private.payroll_months)))"""


def verify_sql(md):
    reads = ", ".join(f"{lit(m)}, public.payroll_month({lit(m + '-01')}::date)" for m in MONTHS)
    return transaction(as_actor(md) + f"SELECT set_config('seed.read', jsonb_build_object({reads})::text, true);\n",
                       "current_setting('seed.read')::jsonb")


def expected_deductions(emp, month):
    data, total = EMPLOYEES[emp], Decimal(0)
    for name, amount, start, until in data['fixed']:
        if start <= month and (not until or until >= month):
            total += Decimal(amount)
    for m, kind, name, amount, note in data['monthly']:
        if m == month:
            total += Decimal(amount) if kind == 'variable_deduction' else -Decimal(amount)
    return total


def check_month(month, read, employee_ids):
    """Every line against the salary rules and the seeded amounts; returns printable rows."""
    rows, problems = [], []
    h = read['header']
    e3, extra = Decimal(str(h['actualWorkingDays'])), Decimal(str(h['extraPaidDays']))
    by_uid = {uid: emp for emp, uid in employee_ids.items()}
    for line in read['lines']:
        emp = by_uid.get(line['userId'])
        d = Decimal(str(line['monthlySalary'])) if line['monthlySalary'] is not None else None
        c, g = Decimal(str(line['daysWorked'])), Decimal(str(line['deductions']))
        if d is None:
            problems.append(f"{line['fullName']}: no salary")
            continue
        e = d / e3
        f = e * (c + extra)
        i = min(f, d)
        j = (i - g).quantize(Decimal(1), rounding='ROUND_HALF_UP') if i - g >= 0 else -((g - i).quantize(Decimal(1), rounding='ROUND_HALF_UP'))
        if abs(Decimal(str(line['calculated'])) - f) > Decimal('0.01') or abs(Decimal(str(line['capped'])) - i) > Decimal('0.01') \
                or Decimal(str(line['inHandRounded'])) != j:
            problems.append(f"{line['fullName']}: columns do not follow the rules")
        if emp and g != expected_deductions(emp, month):
            problems.append(f"{line['fullName']}: deductions {g} != seeded {expected_deductions(emp, month)}")
        rows.append(f"  {line['fullName']:<24} days {c:>6}  salary {d:>9}  calc {f:>10.2f}  capped {i:>10.2f}  deductions {g:>8}  in hand {line['inHandRounded']:>7}"
                    f"  advance due {line['advanceBalance']}")
    return rows, problems


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
    backend = HostedBackend(Path(tempfile.mkdtemp(prefix='payroll-demo-')), args.project_ref, args.workdir)

    state = backend.query('state', transaction('', STATE_SQL))
    gates = [
        (state['ledger'] >= MIN_LEDGER, f"migration ledger {state['ledger']} >= {MIN_LEDGER}"),
        (state['companies'] == 1, f"one active company ({state['companies']})"),
        (len(state['directors'] or []) == 1, f"exactly one active managing director ({len(state['directors'] or [])})"),
        (all(e in (state['employees'] or {}) for e in EMPLOYEES), 'every demo employee is active: ' + ', '.join(EMPLOYEES)),
        (state['payroll_rows'] == 0, f"no payroll data yet ({state['payroll_rows']} rows)"),
    ]
    for ok, label in gates:
        print(('PASS ' if ok else 'FAIL ') + label)
    if not all(ok for ok, _ in gates):
        raise SystemExit('Refused: a gate failed; nothing was written.')

    md, ids = state['directors'][0], {e: state['employees'][e] for e in EMPLOYEES}
    steps = build_steps(ids, md)
    print(f'\nPlan ({len(steps)} commands as the managing director, one transaction):')
    for label, _ in steps:
        print('  ' + label)
    if not args.yes:
        print('\nDry run: nothing written. Add --yes --confirm-production-ref to apply.')
        return 0

    body = '\n'.join(f'-- {label}\n{sql}' for label, sql in steps)
    backend.query('seed', transaction(body, "(SELECT jsonb_build_object('revisions',(SELECT count(*) FROM taskpulse_private.salary_revisions)))"))
    print('\nApplied.')

    reads = backend.query('verify', verify_sql(md))
    failed = False
    for month in MONTHS:
        read = reads[month]
        h = read['header']
        print(f"\n{month} ({read['state']}): working days {h['workingDaysInMonth']}, festival holidays {h['festivalHolidays']}, "
              f"actual {h['actualWorkingDays']}, extra paid days {h['extraPaidDays']}")
        rows, problems = check_month(month, read, ids)
        print('\n'.join(rows))
        for problem in problems:
            print('  PROBLEM ' + problem)
        failed = failed or bool(problems)
    if reads[FINALISE_MONTH]['state'] != 'finalized':
        print(f'PROBLEM {FINALISE_MONTH} is not finalised')
        failed = True
    print('\nVerified.' if not failed else '\nVerification found problems.')
    return 1 if failed else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Refusal as error:
        raise SystemExit(f'Refused: {error}')
