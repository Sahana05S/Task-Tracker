import Link from 'next/link';

import { formatINR, type PayItem, type PayrollLine, type PayrollMonth } from '@/modules/payroll/client';
import { EmptyState } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

const num = (value: number, digits = 2) => value.toLocaleString('en-IN', { maximumFractionDigits: digits });
const hours = (value: number) => `${num(value)} h`;

/** A missing salary is shown as missing, never as zero. */
function Money({ value, strong = false }: { value: number | null; strong?: boolean }) {
  if (value === null) return <span className="text-attention-foreground text-xs font-medium">Salary not set</span>;
  return <span className={cn('tabular', strong && 'text-foreground font-semibold')}>{formatINR(value)}</span>;
}

function Items({ title, items, sign }: { title: string; items: PayItem[]; sign: '−' | '+' }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-muted-foreground text-[11px] font-semibold uppercase">{title}</p>
      <ul className="mt-0.5 grid gap-0.5">
        {items.map((item, index) => (
          <li key={`${item.name}-${index}`} className="flex justify-between gap-3">
            <span>{item.name}</span>
            <span className="tabular">{sign} {formatINR(item.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Breakdown({ line }: { line: PayrollLine }) {
  const { fixed, variable, incentives } = line.breakdown;
  if (fixed.length + variable.length + incentives.length === 0) return <span className="text-muted-foreground">No deductions</span>;
  return (
    <details className="group">
      <summary className="text-primary cursor-pointer text-xs font-medium">Breakdown</summary>
      <div className="mt-2 grid min-w-56 gap-2 text-xs">
        <Items title="Fixed" items={fixed} sign="−" />
        <Items title="This month" items={variable} sign="−" />
        <Items title="Incentives" items={incentives} sign="+" />
      </div>
    </details>
  );
}

const HEAD = 'border-border border-b px-3 py-2 text-left text-xs font-semibold whitespace-nowrap';
const CELL = 'border-border border-b px-3 py-2 align-top whitespace-nowrap';

/**
 * The sheet's Salary Calculation columns A-J, one row per employee. Live for a
 * draft month; the frozen salary records once finalised.
 */
export function SalaryTable({ month }: { month: PayrollMonth }) {
  if (month.lines.length === 0) {
    return <EmptyState title="Nobody on this month's payroll">Active members and anyone with attendance in the month appear here.</EmptyState>;
  }
  const total = month.lines.reduce((sum, line) => sum + (line.inHandRounded ?? 0), 0);
  const period = month.period.slice(0, 7);
  return (
    <div className="soft-card overflow-x-auto p-0">
      <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th scope="col" className={cn(HEAD, 'bg-card sticky left-0 z-10')}>Employee</th>
            <th scope="col" className={HEAD}>Hours worked</th>
            <th scope="col" className={HEAD} title="P + 0.75 × UD + 0.5 × Half day">Days worked</th>
            <th scope="col" className={cn(HEAD, 'text-right')}>Monthly salary</th>
            <th scope="col" className={cn(HEAD, 'text-right')}>Per day</th>
            <th scope="col" className={cn(HEAD, 'text-right')} title="Per day × (days worked + extra paid days)">Calculated max</th>
            <th scope="col" className={cn(HEAD, 'text-right')} title="Fixed + monthly deductions − incentives">Deductions</th>
            <th scope="col" className={cn(HEAD, 'text-right')} title="Calculated max − deductions">Non-capped</th>
            <th scope="col" className={cn(HEAD, 'text-right')} title="The lower of calculated max and monthly salary">Capped</th>
            <th scope="col" className={cn(HEAD, 'text-right')} title="Capped − deductions">In hand</th>
            <th scope="col" className={HEAD}>Details</th>
          </tr>
        </thead>
        <tbody>
          {month.lines.map((line) => (
            <tr key={line.userId}>
              <th scope="row" className={cn(CELL, 'bg-card sticky left-0 z-10 text-left font-medium')}>
                <Link href={`/payroll/employees/${line.userId}?month=${period}`} className="text-foreground hover:text-primary hover:underline">
                  {line.fullName}
                </Link>
                {line.employeeId ? <span className="text-muted-foreground block font-mono text-[11px]">{line.employeeId}</span> : null}
              </th>
              <td className={cn(CELL, 'tabular')}>
                {hours(line.hoursWorked)}
                {line.offHours > 0 ? <span className="text-muted-foreground block text-[11px]">+{hours(line.offHours)} off-hours</span> : null}
              </td>
              <td className={CELL}>
                <span className="tabular font-semibold">{num(line.daysWorked)}</span>
                <span className="text-muted-foreground block text-[11px]">
                  {line.presentDays} P · {line.udDays} UD · {line.halfDays} H
                </span>
              </td>
              <td className={cn(CELL, 'text-right')}><Money value={line.monthlySalary} /></td>
              <td className={cn(CELL, 'text-right')}>{line.perDay === null ? '—' : <span className="tabular">{formatINR(line.perDay)}</span>}</td>
              <td className={cn(CELL, 'text-right')}>{line.calculated === null ? '—' : <span className="tabular">{formatINR(line.calculated)}</span>}</td>
              <td className={cn(CELL, 'text-right tabular')}>{formatINR(line.deductions)}</td>
              <td className={cn(CELL, 'text-right')}>{line.nonCapped === null ? '—' : <span className="tabular">{formatINR(line.nonCapped)}</span>}</td>
              <td className={cn(CELL, 'text-right')}>{line.capped === null ? '—' : <span className="tabular">{formatINR(line.capped)}</span>}</td>
              <td className={cn(CELL, 'text-right')}>
                {line.inHandRounded === null ? '—' : <Money value={line.inHandRounded} strong />}
                {line.advanceBalance > 0 ? (
                  <span className="text-muted-foreground block text-[11px]">Advance due {formatINR(line.advanceBalance)}</span>
                ) : null}
              </td>
              <td className={CELL}><Breakdown line={line} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={9} className="px-3 py-3 text-right text-sm font-semibold">Total in hand</th>
            <td className="tabular px-3 py-3 text-right font-bold">{formatINR(total)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
