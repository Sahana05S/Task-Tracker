import { describe, expect, it } from 'vitest';

import cases from '@/__tests__/fixtures/payroll-cases.json';
import {
  classifyDays,
  computePayLine,
  daysWorked,
  formatINR,
  maskAccountNumber,
  monthLabel,
  monthPeriod,
  payrollHeader,
  roundRupee,
  type PayInputs,
} from '@/modules/payroll/client';
import { parsePayrollCommand, parsePayrollMonthCommand } from '@/modules/payroll/internal/input';
import { mapPayrollMonth } from '@/modules/payroll/internal/mappers';

const OP = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const COMPONENT = '33333333-3333-4333-8333-333333333333';

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}
const command = (section: string, payload: unknown) =>
  parsePayrollCommand(form({ section, expectedVersion: '3', operationId: OP, payload: JSON.stringify(payload) }));

describe('payroll header (E1-E3)', () => {
  it('matches the October 2026 sheet: 27 working days, 3 festival holidays, 24 actual', () => {
    const { period, weeklyOffDays, holidayDates, expected } = cases.header;
    expect(payrollHeader(period, weeklyOffDays, holidayDates)).toEqual(expected);
  });

  it('does not count a holiday that falls on a weekly off day', () => {
    expect(payrollHeader('2026-10-01', [0], ['2026-10-25']).festivalHolidays).toBe(0);
  });

  it('follows the company weekly offs (Saturday and Sunday)', () => {
    expect(payrollHeader('2026-10-01', [0, 6], []).workingDaysInMonth).toBe(22);
  });
});

describe('days worked (C = P + 0.75 UD + 0.5 H)', () => {
  it('classifies Present by hours and counts Half Day as 0.5', () => {
    const counts = classifyDays(
      [
        { status: 'Present', attendanceHours: 8 },
        { status: 'Present', attendanceHours: 9.5 },
        { status: 'Present', attendanceHours: 7.5 },
        { status: 'Half Day', attendanceHours: 4 },
        { status: 'Absent', attendanceHours: 0 },
        { status: 'Leave', attendanceHours: 0 },
        { status: 'Holiday', attendanceHours: 0 },
        { status: 'Off Hours', attendanceHours: 0, offHours: 3 },
      ],
      8,
    );
    expect(counts).toEqual({ presentDays: 2, udDays: 1, halfDays: 1, hoursWorked: 29, offHours: 3 });
    expect(daysWorked(counts)).toBe(3.25);
  });

  it('reproduces the sheet day counts', () => {
    expect(daysWorked({ presentDays: 17, udDays: 1, halfDays: 0 })).toBe(17.75);
    expect(daysWorked({ presentDays: 13, udDays: 0, halfDays: 2 })).toBe(14);
  });
});

describe('salary columns E-J', () => {
  for (const testCase of cases.cases) {
    it(testCase.name, () => {
      const result = computePayLine(testCase.input as PayInputs);
      for (const [key, value] of Object.entries(testCase.expected)) {
        const actual = result[key as keyof typeof result];
        if (value === null) expect(actual, key).toBeNull();
        else expect(actual, key).toBeCloseTo(value as number, 6);
      }
    });
  }

  it('rounds halves away from zero like PostgreSQL', () => {
    expect(roundRupee(2100.5)).toBe(2101);
    expect(roundRupee(-0.5)).toBe(-1);
    expect(roundRupee(3666.6666)).toBe(3667);
  });
});

describe('formatting', () => {
  it('shows whole rupees in Indian grouping and a dash when unknown', () => {
    expect(formatINR(1234567.4)).toBe('₹12,34,567');
    expect(formatINR(null)).toBe('—');
  });

  it('normalises months and masks account numbers', () => {
    expect(monthPeriod('2026-10')).toBe('2026-10-01');
    expect(monthPeriod('2026-13')).toBeNull();
    expect(monthLabel('2026-10-01')).toBe('October 2026');
    expect(maskAccountNumber('1234 5678 9012')).toBe('•••• 9012');
  });
});

describe('payroll forms', () => {
  it('parses a salary revision with commas', () => {
    const parsed = command('revision', { userId: USER, effectiveFrom: '2026-11', monthlySalary: '25,000', note: '' });
    expect(parsed).toEqual({ ok: true, value: { section: 'revision', expectedVersion: 3, operationId: OP, payload: { userId: USER, effectiveFrom: '2026-11', monthlySalary: '25000', note: '' } } });
  });

  it('rejects zero amounts, a missing employee and an unknown section', () => {
    expect(command('adjustment', { userId: USER, period: '2026-10', componentId: COMPONENT, amount: '0' }).ok).toBe(false);
    expect(command('advance', { paidOn: '2026-10-01', reason: 'Medical', amount: '500' }).ok).toBe(false);
    expect(command('payslip', { userId: USER }).ok).toBe(false);
  });

  it('rejects a fixed deduction that ends before it starts', () => {
    const parsed = command('fixed', { userId: USER, componentId: COMPONENT, monthlyAmount: '200', effectiveFrom: '2026-10', effectiveUntil: '2026-09' });
    expect(parsed).toEqual({ ok: false, error: 'The last month cannot be before the first month.' });
  });

  it('needs a reason to reopen a month', () => {
    const base = { period: '2026-10', expectedVersion: '1', operationId: OP };
    expect(parsePayrollMonthCommand(form({ ...base, action: 'reopen', reason: '' })).ok).toBe(false);
    expect(parsePayrollMonthCommand(form({ ...base, action: 'finalize' }))).toEqual({
      ok: true,
      value: { action: 'finalize', period: '2026-10-01', reason: null, expectedVersion: 1, operationId: OP },
    });
  });
});

describe('payroll month payload', () => {
  it('keeps unknown salaries as null and reads the breakdown', () => {
    const month = mapPayrollMonth({
      period: '2026-10-01',
      state: 'draft',
      header: { workingDaysInMonth: 27, festivalHolidays: 3, actualWorkingDays: 24, extraPaidDays: 2, fullDayHours: 8 },
      lines: [{ userId: USER, fullName: 'A', daysWorked: 3, monthlySalary: null, deductions: 0, breakdown: { fixed: [{ name: 'TDS', amount: 100 }] } }],
    });
    expect(month.lines[0].monthlySalary).toBeNull();
    expect(month.lines[0].inHand).toBeNull();
    expect(month.lines[0].breakdown.fixed).toEqual([{ name: 'TDS', amount: 100 }]);
  });
});
