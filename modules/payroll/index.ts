// PUBLIC server-side API of the payroll module (managing director only).
import 'server-only';

export * from '@/modules/payroll/client';
export type { PayrollRead } from '@/modules/payroll/internal/queries';

/** Settings, components, every member's pay profile and the finalised months. */
export { readPayrollSetup as getPayrollSetup } from '@/modules/payroll/internal/queries';
/** Salary Calculation for a first-of-month period: live for a draft, frozen once finalised. */
export { readPayrollMonth as getPayrollMonth } from '@/modules/payroll/internal/queries';
/** One employee's pay file (the sheet's EMP tab) with that month's line. */
export { readEmployeePayFile as getEmployeePayFile } from '@/modules/payroll/internal/queries';
