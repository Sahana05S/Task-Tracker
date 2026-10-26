// PUBLIC server-side API of the payroll module (managing director only, except
// getMySalary: each member's own finalised months, M19).
import 'server-only';

export * from '@/modules/payroll/client';
export type { PayrollRead } from '@/modules/payroll/internal/queries';

/** Settings, components, every member's pay profile and the finalised months. */
export { readPayrollSetup as getPayrollSetup } from '@/modules/payroll/internal/queries';
/** Salary Calculation for a first-of-month period: live for a draft, frozen once finalised. */
export { readPayrollMonth as getPayrollMonth } from '@/modules/payroll/internal/queries';
/** One employee's pay file (the sheet's EMP tab) with that month's line. */
export { readEmployeePayFile as getEmployeePayFile } from '@/modules/payroll/internal/queries';
/** The signed-in member's own finalised salary months (M19; any active member). */
export { readMySalary as getMySalary } from '@/modules/payroll/internal/queries';
/** One employee's finalised salary months for the pay file's graph (managing director). */
export { readSalaryHistory as getSalaryHistory } from '@/modules/payroll/internal/queries';
/** GET handler for /api/payroll/export (CSV of a month's Salary Calculation). */
export { handlePayrollExport } from '@/modules/payroll/internal/export';
