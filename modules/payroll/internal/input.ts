import { ISO_DATE_PATTERN, readString, UUID_PATTERN } from '@/shared/forms/form-data';
import type { Json } from '@/types/database';

import { EMPLOYMENT_STATUSES, monthPeriod, PAY_COMPONENT_KINDS, PAYMENT_MODES, PAYROLL_SECTIONS, type PayrollSection } from './rules';

/**
 * Parses payroll forms: `section`, `expectedVersion`, `operationId` and the
 * section's `payload` JSON. PRIVATE. These checks give friendly messages;
 * `payroll_command` (migration 74) enforces the same rules.
 */

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export interface PayrollCommandInput {
  section: PayrollSection;
  payload: Record<string, Json>;
  expectedVersion: number;
  operationId: string;
}

export interface PayrollMonthCommandInput {
  action: 'finalize' | 'reopen';
  period: string;
  reason: string | null;
  expectedVersion: number;
  operationId: string;
}

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
/** Rupees as typed ("12,500" allowed); null when not a non-negative amount with up to 2 decimals. */
const money = (value: unknown): string | null => {
  const raw = typeof value === 'number' ? String(value) : text(value).replace(/,/g, '');
  return MONEY.test(raw) ? raw : null;
};
const positive = (value: unknown) => {
  const amount = money(value);
  return amount !== null && Number(amount) > 0 ? amount : null;
};
const uuid = (value: unknown) => (typeof value === 'string' && UUID_PATTERN.test(value) ? value : null);

function envelope(form: FormData): Parsed<{ expectedVersion: number; operationId: string }> {
  const version = readString(form, 'expectedVersion');
  const operationId = readString(form, 'operationId');
  if (!/^\d{1,15}$/.test(version) || !UUID_PATTERN.test(operationId)) return { ok: false, error: 'Reload the page and try again.' };
  return { ok: true, value: { expectedVersion: Number(version), operationId } };
}

export function parsePayrollCommand(form: FormData): Parsed<PayrollCommandInput> {
  const section = readString(form, 'section') as PayrollSection;
  if (!(PAYROLL_SECTIONS as readonly string[]).includes(section)) return { ok: false, error: 'Unknown payroll form.' };
  const head = envelope(form);
  if (!head.ok) return head;
  let raw: unknown;
  try {
    raw = JSON.parse(readString(form, 'payload') || 'null');
  } catch {
    return { ok: false, error: 'The form could not be read. Reload and try again.' };
  }
  if (!isRecord(raw)) return { ok: false, error: 'The form could not be read. Reload and try again.' };
  if (section !== 'settings' && section !== 'component' && !uuid(raw.userId)) return { ok: false, error: 'Choose an employee.' };
  const payload = PARSERS[section](raw);
  if (!payload.ok) return payload;
  return { ok: true, value: { section, payload: payload.value, ...head.value } };
}

const PARSERS: Record<PayrollSection, (raw: Record<string, unknown>) => Parsed<Record<string, Json>>> = {
  settings(raw) {
    const extra = money(raw.extraPaidDays);
    const hours = money(raw.fullDayHours);
    if (extra === null || Number(extra) > 31) return { ok: false, error: 'Extra paid days must be between 0 and 31.' };
    if (hours === null || Number(hours) < 0.25 || Number(hours) > 24) return { ok: false, error: 'Full-day hours must be between 0.25 and 24.' };
    return { ok: true, value: { extraPaidDays: extra, fullDayHours: hours } };
  },

  component(raw) {
    const name = text(raw.name);
    if (name.length < 1 || name.length > 60) return { ok: false, error: 'Give the component a name of 1-60 characters.' };
    const id = raw.id === undefined || raw.id === null || raw.id === '' ? null : uuid(raw.id);
    if (raw.id && !id) return { ok: false, error: 'Reload the page and try again.' };
    const value: Record<string, Json> = { name, active: raw.active !== false };
    if (Number.isInteger(raw.sort) && (raw.sort as number) >= 0 && (raw.sort as number) <= 999) value.sort = raw.sort as number;
    if (id) value.id = id;
    else {
      if (!(PAY_COMPONENT_KINDS as readonly unknown[]).includes(raw.kind)) return { ok: false, error: 'Choose whether this is a fixed deduction, a monthly deduction or an incentive.' };
      value.kind = raw.kind as string;
    }
    return { ok: true, value };
  },

  profile(raw) {
    const joiningDate = text(raw.joiningDate);
    if (joiningDate && !ISO_DATE_PATTERN.test(joiningDate)) return { ok: false, error: 'Enter the joining date as a date.' };
    const accountNumber = text(raw.accountNumber);
    if (accountNumber && !/^[A-Za-z0-9 -]{4,34}$/.test(accountNumber)) return { ok: false, error: 'The account number should be 4-34 letters or digits.' };
    const paymentMode = text(raw.paymentMode);
    if (paymentMode && !(PAYMENT_MODES as readonly string[]).includes(paymentMode)) return { ok: false, error: 'Choose a payment mode.' };
    const employmentStatus = text(raw.employmentStatus) || 'active';
    if (!(EMPLOYMENT_STATUSES as readonly string[]).includes(employmentStatus)) return { ok: false, error: 'Choose an employment status.' };
    const salaryHandlerId = text(raw.salaryHandlerId);
    if (salaryHandlerId && !uuid(salaryHandlerId)) return { ok: false, error: 'Choose a salary handler from the list.' };
    const notes = text(raw.notes);
    if (notes.length > 1000) return { ok: false, error: 'Keep the notes under 1000 characters.' };
    return { ok: true, value: { userId: raw.userId as string, joiningDate, accountNumber, paymentMode, employmentStatus, salaryHandlerId, notes } };
  },

  revision(raw) {
    const month = monthPeriod(text(raw.effectiveFrom));
    const amount = money(raw.monthlySalary);
    if (!month) return { ok: false, error: 'Choose the month the salary starts.' };
    if (amount === null) return { ok: false, error: 'Enter the monthly salary in rupees.' };
    const note = text(raw.note);
    if (note.length > 200) return { ok: false, error: 'Keep the note under 200 characters.' };
    return { ok: true, value: { userId: raw.userId as string, effectiveFrom: month.slice(0, 7), monthlySalary: amount, note } };
  },

  fixed(raw) {
    const componentId = uuid(raw.componentId);
    const amount = positive(raw.monthlyAmount);
    const from = monthPeriod(text(raw.effectiveFrom));
    const until = text(raw.effectiveUntil) ? monthPeriod(text(raw.effectiveUntil)) : null;
    if (!componentId) return { ok: false, error: 'Choose a fixed deduction.' };
    if (amount === null) return { ok: false, error: 'Enter a monthly amount above zero.' };
    if (!from) return { ok: false, error: 'Choose the first month of the deduction.' };
    if (text(raw.effectiveUntil) && !until) return { ok: false, error: 'Choose a valid last month, or leave it empty.' };
    if (until && until < from) return { ok: false, error: 'The last month cannot be before the first month.' };
    const value: Record<string, Json> = { userId: raw.userId as string, componentId, monthlyAmount: amount, effectiveFrom: from.slice(0, 7), effectiveUntil: until ? until.slice(0, 7) : '' };
    if (raw.id) {
      const id = uuid(raw.id);
      if (!id) return { ok: false, error: 'Reload the page and try again.' };
      value.id = id;
    }
    return { ok: true, value };
  },

  adjustment(raw) {
    const period = monthPeriod(text(raw.period));
    const componentId = uuid(raw.componentId);
    const amount = positive(raw.amount);
    const note = text(raw.note);
    if (!period) return { ok: false, error: 'Choose the month.' };
    if (!componentId) return { ok: false, error: 'Choose a deduction or incentive.' };
    if (amount === null) return { ok: false, error: 'Enter an amount above zero.' };
    if (note.length > 200) return { ok: false, error: 'Keep the note under 200 characters.' };
    return { ok: true, value: { userId: raw.userId as string, period: period.slice(0, 7), componentId, amount, note } };
  },

  advance(raw) {
    const paidOn = text(raw.paidOn);
    const reason = text(raw.reason);
    const amount = positive(raw.amount);
    if (!ISO_DATE_PATTERN.test(paidOn)) return { ok: false, error: 'Enter the date the advance was paid.' };
    if (reason.length < 1 || reason.length > 200) return { ok: false, error: 'Give a reason of 1-200 characters.' };
    if (amount === null) return { ok: false, error: 'Enter an amount above zero.' };
    return { ok: true, value: { userId: raw.userId as string, paidOn, reason, amount } };
  },

  withdraw(raw) {
    const entry = text(raw.entry);
    const id = uuid(raw.id);
    if (!['revision', 'fixed', 'adjustment', 'advance'].includes(entry) || !id) return { ok: false, error: 'Reload the page and try again.' };
    return { ok: true, value: { userId: raw.userId as string, entry, id } };
  },
};

export function parsePayrollMonthCommand(form: FormData): Parsed<PayrollMonthCommandInput> {
  const action = readString(form, 'action');
  if (action !== 'finalize' && action !== 'reopen') return { ok: false, error: 'Unknown action.' };
  const period = monthPeriod(readString(form, 'period'));
  if (!period) return { ok: false, error: 'Choose a month.' };
  const head = envelope(form);
  if (!head.ok) return head;
  const reason = readString(form, 'reason').trim();
  if (action === 'reopen' && (reason.length < 1 || reason.length > 500)) return { ok: false, error: 'Say why the month is being reopened (up to 500 characters).' };
  return { ok: true, value: { action, period, reason: action === 'reopen' ? reason : null, ...head.value } };
}
