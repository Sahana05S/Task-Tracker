import Link from 'next/link';

import { EMPLOYMENT_STATUS_LABELS, formatINR, monthLabel, PAYMENT_MODE_LABELS, type PayrollEmployee } from '@/modules/payroll/client';
import { EmptyState } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

const HEAD = 'border-border border-b px-3 py-2 text-left text-xs font-semibold whitespace-nowrap';
const CELL = 'border-border border-b px-3 py-2 align-top';

/** The sheet's Employee Data tab: one row per member with their pay profile and current salary. */
export function EmployeeList({ employees, month }: { employees: PayrollEmployee[]; month: string }) {
  if (employees.length === 0) return <EmptyState>No members yet. Invite people from Team &gt; Manage people.</EmptyState>;
  return (
    <div className="soft-card overflow-x-auto p-0">
      <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th scope="col" className={HEAD}>Employee</th>
            <th scope="col" className={HEAD}>Designation</th>
            <th scope="col" className={HEAD}>Supervisor</th>
            <th scope="col" className={HEAD}>Joined</th>
            <th scope="col" className={HEAD}>Payment</th>
            <th scope="col" className={HEAD}>Status</th>
            <th scope="col" className={cn(HEAD, 'text-right')}>Monthly salary</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => (
            <tr key={e.userId} className={cn(!e.isActive && 'text-muted-foreground')}>
              <th scope="row" className={cn(CELL, 'text-left font-medium')}>
                <Link href={`/payroll/employees/${e.userId}?month=${month}`} className="text-foreground hover:text-primary hover:underline">
                  {e.fullName}
                </Link>
                <span className="text-muted-foreground block font-mono text-[11px]">
                  {e.employeeId ?? '—'}
                  {e.isActive ? '' : ' · account removed'}
                </span>
              </th>
              <td className={CELL}>
                {e.jobTitle ?? '—'}
                {e.department ? <span className="text-muted-foreground block text-[11px]">{e.department}</span> : null}
              </td>
              <td className={CELL}>{e.reportsTo ?? '—'}</td>
              <td className={cn(CELL, 'tabular whitespace-nowrap')}>{e.joiningDate ?? '—'}</td>
              <td className={CELL}>
                {e.paymentMode ? PAYMENT_MODE_LABELS[e.paymentMode] : '—'}
                {e.hasAccountNumber ? <span className="text-muted-foreground block text-[11px]">Account saved</span> : null}
              </td>
              <td className={CELL}>{EMPLOYMENT_STATUS_LABELS[e.employmentStatus]}</td>
              <td className={cn(CELL, 'text-right whitespace-nowrap')}>
                {e.currentSalary === null ? (
                  <span className="text-attention-foreground text-xs font-medium">Not set</span>
                ) : (
                  <span className="tabular font-semibold">{formatINR(e.currentSalary)}</span>
                )}
                {e.nextSalary ? (
                  <span className="text-muted-foreground block text-[11px]">
                    {formatINR(e.nextSalary.monthlySalary)} from {monthLabel(e.nextSalary.effectiveFrom)}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
