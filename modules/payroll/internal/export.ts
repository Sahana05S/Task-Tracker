import 'server-only';

import { NextResponse } from 'next/server';

import { getCurrentProfile } from '@/shared/session/profile';

import { readPayrollMonth } from './queries';
import { canManagePayroll } from './permissions';
import { monthPeriod } from './rules';
import type { PayrollMonth } from './mappers';

const cell = (value: string | number | null) => {
  const text = value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const amount = (value: number | null) => (value === null ? '' : value.toFixed(2));

/** The Salary Calculation table as CSV, one row per employee (exact amounts; in hand also rounded). */
export function payrollCsv(month: PayrollMonth): string {
  const header = ['Employee', 'Employee ID', 'Hours worked', 'Off-hours', 'Present days', 'Under hours days', 'Half days', 'Days worked',
    'Monthly salary', 'Per day salary', 'Calculated max salary', 'Fixed deductions', 'Monthly deductions', 'Incentives', 'Deductions',
    'Non capped max salary', 'Capped salary', 'In hand (exact)', 'In hand (rounded)', 'Advance balance'];
  const rows = month.lines.map((l) => [l.fullName, l.employeeId, l.hoursWorked, l.offHours, l.presentDays, l.udDays, l.halfDays, l.daysWorked,
    amount(l.monthlySalary), amount(l.perDay), amount(l.calculated), amount(l.fixedTotal), amount(l.variableTotal), amount(l.incentiveTotal),
    amount(l.deductions), amount(l.nonCapped), amount(l.capped), amount(l.inHand), l.inHandRounded, amount(l.advanceBalance)]);
  const h = month.header;
  const preface = [
    ['Month', month.period.slice(0, 7)],
    ['State', month.state === 'finalized' ? `Finalised (revision ${month.revision})` : 'Draft (live)'],
    ['Working days in month', h.workingDaysInMonth],
    ['Festival holidays', h.festivalHolidays],
    ['Actual working days', h.actualWorkingDays],
    ['Extra paid days', h.extraPaidDays],
    [],
  ];
  return [...preface, header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** GET /api/payroll/export?month=YYYY-MM: managing director only (the RPC checks again). PRIVATE. */
export async function handlePayrollExport(request: Request): Promise<Response> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive || !canManagePayroll(profile.role)) return NextResponse.json({ error: 'Only the managing director can export payroll.' }, { status: 403 });
  const period = monthPeriod(new URL(request.url).searchParams.get('month'));
  if (!period) return NextResponse.json({ error: 'A month (YYYY-MM) is required.' }, { status: 400 });
  const result = await readPayrollMonth(period);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.reason === 'forbidden' ? 403 : 503 });
  return new Response(payrollCsv(result.data), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="payroll-${period.slice(0, 7)}${result.data.state === 'finalized' ? `-revision-${result.data.revision}` : '-draft'}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
