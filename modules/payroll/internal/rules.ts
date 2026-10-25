import type { AttendanceStatus } from '@/types/tracker';

/**
 * The salary rules of the workbook "3_1_c_Employee Management and Info"
 * (DECISIONS "M18 payroll"). PRIVATE; re-exported through `client.ts`.
 * `taskpulse_private.payroll_compute` (migration 74) is the authoritative
 * calculation; these mirror it for instant previews and tests only.
 */

export const PAYROLL_SECTIONS = ['settings', 'component', 'profile', 'revision', 'fixed', 'adjustment', 'advance', 'withdraw'] as const;
export type PayrollSection = (typeof PAYROLL_SECTIONS)[number];

export const PAY_COMPONENT_KINDS = ['fixed_deduction', 'variable_deduction', 'incentive'] as const;
export type PayComponentKind = (typeof PAY_COMPONENT_KINDS)[number];
export const PAY_COMPONENT_KIND_LABELS: Record<PayComponentKind, string> = {
  fixed_deduction: 'Fixed deduction',
  variable_deduction: 'Monthly deduction',
  incentive: 'Incentive',
};

export const EMPLOYMENT_STATUSES = ['active', 'on_notice', 'left', 'not_on_payroll'] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];
export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  active: 'Active',
  on_notice: 'On notice',
  left: 'Left',
  not_on_payroll: 'Not on payroll',
};

export const PAYMENT_MODES = ['bank_transfer', 'cash', 'upi', 'cheque'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];
export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  upi: 'UPI',
  cheque: 'Cheque',
};

/** UD ("Under Hours Days") and Half Day weights in C = P + 0.75*UD + 0.5*H. */
export const UD_WEIGHT = 0.75;
export const HALF_DAY_WEIGHT = 0.5;
export const DEFAULT_PAYROLL_SETTINGS = { extraPaidDays: 2, fullDayHours: 8 } as const;

export interface DayCounts {
  presentDays: number;
  udDays: number;
  halfDays: number;
  hoursWorked: number;
  offHours: number;
}

/**
 * P = Present with at least the full-day hours, UD = Present with fewer,
 * H = Half Day; Absent, Leave, Holiday and Off Hours count 0. Hours worked
 * (column B) is the sum of regular hours, shown but not used in the maths.
 */
export function classifyDays(
  days: { status: AttendanceStatus; attendanceHours: number; offHours?: number }[],
  fullDayHours: number,
): DayCounts {
  const counts: DayCounts = { presentDays: 0, udDays: 0, halfDays: 0, hoursWorked: 0, offHours: 0 };
  for (const day of days) {
    counts.hoursWorked += day.attendanceHours;
    counts.offHours += day.offHours ?? 0;
    if (day.status === 'Present') {
      if (day.attendanceHours >= fullDayHours) counts.presentDays += 1;
      else counts.udDays += 1;
    } else if (day.status === 'Half Day') counts.halfDays += 1;
  }
  return counts;
}

/** Column C: P + 0.75*UD + 0.5*H. */
export function daysWorked(counts: Pick<DayCounts, 'presentDays' | 'udDays' | 'halfDays'>): number {
  return counts.presentDays + UD_WEIGHT * counts.udDays + HALF_DAY_WEIGHT * counts.halfDays;
}

export interface PayrollHeader {
  /** E1: calendar days minus weekly off days. */
  workingDaysInMonth: number;
  /** E2: calendar holidays that fall on working days. */
  festivalHolidays: number;
  /** E3 = E1 - E2. */
  actualWorkingDays: number;
}

/** The Salary Calculation header for a first-of-month period (YYYY-MM-01). */
export function payrollHeader(period: string, weeklyOffDays: readonly number[], holidayDates: readonly string[]): PayrollHeader {
  const [year, month] = period.split('-').map(Number);
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const holidays = new Set(holidayDates);
  let working = 0;
  let festival = 0;
  for (let day = 1; day <= length; day += 1) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (weeklyOffDays.includes(date.getUTCDay())) continue;
    working += 1;
    if (holidays.has(date.toISOString().slice(0, 10))) festival += 1;
  }
  return { workingDaysInMonth: working, festivalHolidays: festival, actualWorkingDays: working - festival };
}

export interface PayInputs {
  daysWorked: number;
  /** D; null when no salary is set for the month. */
  monthlySalary: number | null;
  actualWorkingDays: number;
  extraPaidDays: number;
  fixedTotal: number;
  variableTotal: number;
  incentiveTotal: number;
}

export interface PayFigures {
  perDay: number | null;
  calculated: number | null;
  deductions: number;
  nonCapped: number | null;
  capped: number | null;
  inHand: number | null;
  inHandRounded: number | null;
}

/**
 * Columns E-J: E = D / E3; F = E * (C + extra paid days); G = fixed +
 * variable - incentives; H = F - G; I = MIN(F, D); J = I - G, rounded to the
 * nearest rupee on finalising. Unknown inputs give null, never zero.
 */
export function computePayLine(input: PayInputs): PayFigures {
  const deductions = input.fixedTotal + input.variableTotal - input.incentiveTotal;
  const perDay = input.monthlySalary !== null && input.actualWorkingDays > 0 ? input.monthlySalary / input.actualWorkingDays : null;
  const calculated = perDay === null ? null : perDay * (input.daysWorked + input.extraPaidDays);
  const capped = calculated === null || input.monthlySalary === null ? null : Math.min(calculated, input.monthlySalary);
  const inHand = capped === null ? null : capped - deductions;
  return {
    perDay,
    calculated,
    deductions,
    nonCapped: calculated === null ? null : calculated - deductions,
    capped,
    inHand,
    inHandRounded: inHand === null ? null : roundRupee(inHand),
  };
}

/** Nearest rupee, halves away from zero (PostgreSQL round(numeric)). */
export function roundRupee(value: number): number {
  // The epsilon absorbs binary noise such as 2100.4999999 from exact halves.
  return Math.sign(value) * Math.round(Math.abs(value) + 1e-9);
}

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0, minimumFractionDigits: 0 });

/** Whole rupees in Indian grouping (the sheet's display format); a dash when unknown. */
export function formatINR(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : INR.format(roundRupee(value));
}

/** "2026-10" or "2026-10-15" -> "2026-10-01"; null when not a month. */
export function monthPeriod(value: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value ?? '');
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return null;
  return `${match[1]}-${match[2]}-01`;
}

/** "2026-10-01" -> "October 2026". */
export function monthLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Last 4 characters only, e.g. "•••• 4321". */
export function maskAccountNumber(value: string | null | undefined): string {
  if (!value) return '—';
  const compact = value.replace(/[\s-]/g, '');
  return compact.length <= 4 ? '••••' : `•••• ${compact.slice(-4)}`;
}
