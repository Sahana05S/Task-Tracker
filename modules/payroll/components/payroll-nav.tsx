import Link from 'next/link';

import { cn } from '@/shared/utils';

const TABS = [
  { href: '/payroll', label: 'Salary calculation' },
  { href: '/payroll/employees', label: 'Employees' },
  { href: '/payroll/history', label: 'Salary records' },
  { href: '/payroll/settings', label: 'Settings' },
] as const;

/** Payroll's own tabs (the sheet's Salary Calculation, Employee Data, Salary History and options). */
export function PayrollNav({ active, month }: { active: (typeof TABS)[number]['href']; month?: string }) {
  return (
    <nav aria-label="Payroll" className="bg-muted flex w-full gap-0.5 overflow-x-auto rounded-full p-1 sm:w-fit">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={month && tab.href !== '/payroll/settings' && tab.href !== '/payroll/history' ? `${tab.href}?month=${month}` : tab.href}
          aria-current={active === tab.href ? 'page' : undefined}
          className={cn('nav-pill shrink-0', active === tab.href && 'nav-pill-active')}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

/** A plain GET form, so the month changes without JavaScript too. */
export function MonthPicker({ month, label = 'Month' }: { month: string; label?: string }) {
  return (
    <form method="get" className="flex items-end gap-2">
      <label className="field-label">
        {label}
        <input type="month" name="month" defaultValue={month} required className="field" />
      </label>
      <button type="submit" className="border-border bg-card text-foreground hover:bg-muted h-10 rounded-xl border px-4 text-sm font-medium">
        Show
      </button>
    </form>
  );
}
