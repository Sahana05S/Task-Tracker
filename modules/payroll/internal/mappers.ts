import type { EmploymentStatus, PayComponentKind, PaymentMode } from './rules';

/**
 * Payroll RPC payloads (migration 74) -> domain types. PRIVATE; the types are
 * re-exported through `client.ts`. Amounts arrive as JSON numbers.
 */

export interface PayItem {
  name: string;
  amount: number;
}

export interface PayrollLine {
  userId: string;
  employeeId: string | null;
  fullName: string;
  employmentStatus: EmploymentStatus | null;
  hoursWorked: number;
  offHours: number;
  presentDays: number;
  udDays: number;
  halfDays: number;
  daysWorked: number;
  monthlySalary: number | null;
  perDay: number | null;
  calculated: number | null;
  fixedTotal: number;
  variableTotal: number;
  incentiveTotal: number;
  deductions: number;
  nonCapped: number | null;
  capped: number | null;
  inHand: number | null;
  inHandRounded: number | null;
  advancesTaken: number;
  advancesRecovered: number;
  advanceBalance: number;
  breakdown: { fixed: PayItem[]; variable: PayItem[]; incentives: PayItem[] };
}

export interface PayrollMonth {
  period: string;
  state: 'draft' | 'finalized';
  revision: number;
  version: number;
  header: { workingDaysInMonth: number; festivalHolidays: number; actualWorkingDays: number; extraPaidDays: number; fullDayHours: number };
  finalizedAt: string | null;
  finalizedBy: string | null;
  reopenReason: string | null;
  lines: PayrollLine[];
}

export interface PayComponent {
  id: string;
  kind: PayComponentKind;
  name: string;
  isAdvanceRecovery: boolean;
  active: boolean;
  sort: number;
}

export interface PayrollEmployee {
  userId: string;
  employeeId: string | null;
  fullName: string;
  isActive: boolean;
  jobTitle: string | null;
  department: string | null;
  reportsTo: string | null;
  employmentStatus: EmploymentStatus;
  joiningDate: string | null;
  paymentMode: PaymentMode | null;
  hasAccountNumber: boolean;
  version: number;
  currentSalary: number | null;
  nextSalary: { effectiveFrom: string; monthlySalary: number } | null;
}

export interface PayrollMonthSummary {
  period: string;
  state: 'draft' | 'finalized';
  revision: number;
  finalizedAt: string | null;
  employees: number;
  totalInHand: number | null;
}

export interface PayrollSetup {
  settings: { version: number; extraPaidDays: number; fullDayHours: number };
  components: PayComponent[];
  employees: PayrollEmployee[];
  months: PayrollMonthSummary[];
}

export interface EmployeePayFile {
  userId: string;
  employeeId: string | null;
  fullName: string;
  isActive: boolean;
  jobTitle: string | null;
  period: string;
  version: number;
  profile: {
    joiningDate: string | null;
    accountNumber: string | null;
    paymentMode: PaymentMode | null;
    employmentStatus: EmploymentStatus;
    salaryHandlerId: string | null;
    notes: string;
  };
  revisions: { id: string; effectiveFrom: string; monthlySalary: number; note: string }[];
  fixedDeductions: { id: string; componentId: string; component: string; monthlyAmount: number; effectiveFrom: string; effectiveUntil: string | null }[];
  adjustments: { id: string; period: string; componentId: string; component: string; kind: PayComponentKind; isAdvanceRecovery: boolean; amount: number; note: string }[];
  advances: { id: string; paidOn: string; reason: string; amount: number }[];
  records: { period: string; revision: number; daysWorked: number; monthlySalary: number | null; deductions: number; inHandRounded: number | null }[];
  line: PayrollLine | null;
}

type Row = Record<string, unknown>;
const obj = (value: unknown): Row => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Row) : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown): string => (typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value));
const strOrNull = (value: unknown): string | null => (value === null || value === undefined || value === '' ? null : String(value));
const num = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (value: unknown): number | null => (value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null);
const items = (value: unknown): PayItem[] => list(value).map((item) => ({ name: str(obj(item).name), amount: num(obj(item).amount) }));

export function mapPayrollLine(raw: unknown): PayrollLine {
  const r = obj(raw);
  const breakdown = obj(r.breakdown);
  return {
    userId: str(r.userId),
    employeeId: strOrNull(r.employeeId),
    fullName: str(r.fullName),
    employmentStatus: strOrNull(r.employmentStatus) as EmploymentStatus | null,
    hoursWorked: num(r.hoursWorked),
    offHours: num(r.offHours),
    presentDays: num(r.presentDays),
    udDays: num(r.udDays),
    halfDays: num(r.halfDays),
    daysWorked: num(r.daysWorked),
    monthlySalary: numOrNull(r.monthlySalary),
    perDay: numOrNull(r.perDay),
    calculated: numOrNull(r.calculated),
    fixedTotal: num(r.fixedTotal),
    variableTotal: num(r.variableTotal),
    incentiveTotal: num(r.incentiveTotal),
    deductions: num(r.deductions),
    nonCapped: numOrNull(r.nonCapped),
    capped: numOrNull(r.capped),
    inHand: numOrNull(r.inHand),
    inHandRounded: numOrNull(r.inHandRounded),
    advancesTaken: num(r.advancesTaken),
    advancesRecovered: num(r.advancesRecovered),
    advanceBalance: num(r.advanceBalance),
    breakdown: { fixed: items(breakdown.fixed), variable: items(breakdown.variable), incentives: items(breakdown.incentives) },
  };
}

export function mapPayrollMonth(raw: unknown): PayrollMonth {
  const r = obj(raw);
  const h = obj(r.header);
  return {
    period: str(r.period),
    state: r.state === 'finalized' ? 'finalized' : 'draft',
    revision: num(r.revision),
    version: num(r.version),
    header: {
      workingDaysInMonth: num(h.workingDaysInMonth),
      festivalHolidays: num(h.festivalHolidays),
      actualWorkingDays: num(h.actualWorkingDays),
      extraPaidDays: num(h.extraPaidDays),
      fullDayHours: num(h.fullDayHours),
    },
    finalizedAt: strOrNull(r.finalizedAt),
    finalizedBy: strOrNull(r.finalizedBy),
    reopenReason: strOrNull(r.reopenReason),
    lines: list(r.lines).map(mapPayrollLine),
  };
}

export function mapPayrollSetup(raw: unknown): PayrollSetup {
  const r = obj(raw);
  const s = obj(r.settings);
  return {
    settings: { version: num(s.version), extraPaidDays: num(s.extraPaidDays ?? 2), fullDayHours: num(s.fullDayHours ?? 8) },
    components: list(r.components).map((c) => {
      const x = obj(c);
      return { id: str(x.id), kind: str(x.kind) as PayComponentKind, name: str(x.name), isAdvanceRecovery: x.isAdvanceRecovery === true, active: x.active !== false, sort: num(x.sort) };
    }),
    employees: list(r.employees).map((e) => {
      const x = obj(e);
      const next = x.nextSalary ? obj(x.nextSalary) : null;
      return {
        userId: str(x.userId),
        employeeId: strOrNull(x.employeeId),
        fullName: str(x.fullName),
        isActive: x.isActive !== false,
        jobTitle: strOrNull(x.jobTitle),
        department: strOrNull(x.department),
        reportsTo: strOrNull(x.reportsTo),
        employmentStatus: (strOrNull(x.employmentStatus) ?? 'active') as EmploymentStatus,
        joiningDate: strOrNull(x.joiningDate),
        paymentMode: strOrNull(x.paymentMode) as PaymentMode | null,
        hasAccountNumber: x.hasAccountNumber === true,
        version: num(x.version),
        currentSalary: numOrNull(x.currentSalary),
        nextSalary: next ? { effectiveFrom: str(next.effectiveFrom), monthlySalary: num(next.monthlySalary) } : null,
      };
    }),
    months: list(r.months).map((m) => {
      const x = obj(m);
      return {
        period: str(x.period),
        state: x.state === 'finalized' ? 'finalized' : 'draft',
        revision: num(x.revision),
        finalizedAt: strOrNull(x.finalizedAt),
        employees: num(x.employees),
        totalInHand: numOrNull(x.totalInHand),
      };
    }),
  };
}

export function mapEmployeePayFile(raw: unknown): EmployeePayFile {
  const r = obj(raw);
  const p = obj(r.profile);
  return {
    userId: str(r.userId),
    employeeId: strOrNull(r.employeeId),
    fullName: str(r.fullName),
    isActive: r.isActive !== false,
    jobTitle: strOrNull(r.jobTitle),
    period: str(r.period),
    version: num(r.version),
    profile: {
      joiningDate: strOrNull(p.joiningDate),
      accountNumber: strOrNull(p.accountNumber),
      paymentMode: strOrNull(p.paymentMode) as PaymentMode | null,
      employmentStatus: (strOrNull(p.employmentStatus) ?? 'active') as EmploymentStatus,
      salaryHandlerId: strOrNull(p.salaryHandlerId),
      notes: str(p.notes),
    },
    revisions: list(r.revisions).map((v) => {
      const x = obj(v);
      return { id: str(x.id), effectiveFrom: str(x.effectiveFrom), monthlySalary: num(x.monthlySalary), note: str(x.note) };
    }),
    fixedDeductions: list(r.fixedDeductions).map((v) => {
      const x = obj(v);
      return { id: str(x.id), componentId: str(x.componentId), component: str(x.component), monthlyAmount: num(x.monthlyAmount), effectiveFrom: str(x.effectiveFrom), effectiveUntil: strOrNull(x.effectiveUntil) };
    }),
    adjustments: list(r.adjustments).map((v) => {
      const x = obj(v);
      return {
        id: str(x.id), period: str(x.period), componentId: str(x.componentId), component: str(x.component),
        kind: str(x.kind) as PayComponentKind, isAdvanceRecovery: x.isAdvanceRecovery === true, amount: num(x.amount), note: str(x.note),
      };
    }),
    advances: list(r.advances).map((v) => {
      const x = obj(v);
      return { id: str(x.id), paidOn: str(x.paidOn), reason: str(x.reason), amount: num(x.amount) };
    }),
    records: list(r.records).map((v) => {
      const x = obj(v);
      return { period: str(x.period), revision: num(x.revision), daysWorked: num(x.daysWorked), monthlySalary: numOrNull(x.monthlySalary), deductions: num(x.deductions), inHandRounded: numOrNull(x.inHandRounded) };
    }),
    line: r.line ? mapPayrollLine(r.line) : null,
  };
}
