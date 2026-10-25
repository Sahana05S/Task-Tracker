# payroll

## What it does
Employee pay files and monthly salary for the managing director only (M18). It replaces the workbook
"3_1_c_Employee Management and Info": Salary Calculation, Employee Data, Salary History and one EMP tab per
employee. The rules are recorded in DECISIONS "M18 payroll" and in `docs/plans/M18-payroll.md`.

The salary maths, per employee and month:
- **Header:**
  - E1 = calendar days − weekly offs
  - E2 = calendar holidays that fall on working days
  - E3 = E1 − E2
- **C (days worked)** = P + 0.75·UD + 0.5·H
  - P = Present with at least the full-day hours (default 8)
  - UD = Under Hours Day: Present with fewer hours
  - H = Half Day
- **D** = the salary revision in effect for the month.
- **E** = D ÷ E3.
- **F** = E × (C + extra paid days, default 2).
- **G** = fixed + monthly deductions − incentives.
- **H** = F − G.
- **I** = MIN(F, D).
- **J** = I − G, rounded to the nearest rupee when the month is finalised.
- **Advance balance** = advances taken − "Advance" deductions recovered.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getPayrollSetup()`, `getPayrollMonth(period)`, `getEmployeePayFile(userId, period)`; everything in `client.ts` |
| `actions.ts` | `savePayrollEntry` (settings, component, profile, revision, fixed, adjustment, advance, withdraw), `payrollMonthAction` (finalize, reopen) |
| `client.ts` | Types; `computePayLine`, `classifyDays`, `daysWorked`, `payrollHeader`, `roundRupee`, `formatINR`, `monthPeriod`, `monthLabel`, `maskAccountNumber`, labels; `canManagePayroll` |
| `components/` | The payroll pages' UI |

## Private (`internal/`)
| File | Job |
|---|---|
| `queries.ts` | `payroll_setup`, `payroll_month`, `payroll_employee_file` |
| `commands.ts` | `payroll_command`, `payroll_month_command` |
| `rules.ts` | The salary rules (a mirror of `payroll_compute` for previews and tests) |
| `permissions.ts` | `canManagePayroll` (managing director) |
| `input.ts` | Parse and validate the forms |
| `mappers.ts` | RPC payload -> domain types |

## Database it owns
Migration 74 (`74_payroll_foundation.sql`).

**Private tables** (no API grants):
- `taskpulse_private.payroll_settings`
- `employee_pay_profiles`
- `salary_revisions`
- `pay_components`
- `fixed_deductions`
- `pay_adjustments`
- `salary_advances`
- `payroll_months`
- `payroll_lines`

**Functions:**
- `taskpulse_private.payroll_compute(org, period)`: the one calculation
- `payroll_header`
- `payroll_director`
- `payroll_seed_components`
- **Public RPCs:** `payroll_setup()`, `payroll_month(date)`, `payroll_employee_file(uuid, date)`, `payroll_command(text, jsonb, bigint, uuid)` and `payroll_month_command(text, date, text, bigint, uuid)`. Each refuses anyone but an active managing director (42501).

## Depends on
- Reads `public.users`, `public.attendance_records`, `taskpulse_private.company_holidays`, `organization_settings.weekly_off_days` and `departments`, inside the database only.
- `shared/*`.
