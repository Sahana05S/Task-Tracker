import type { CalculationResult } from '@/modules/scoring/client';
import type { LivePresentation } from '@/modules/reports/client';
import type { AwardReadModel } from '@/modules/scoring/client';
import { ReportContext } from '@/modules/reports/components/view-context';
import { AwardStatus } from '@/modules/scoring/components/award-status';
import { PerformanceBreakdown } from '@/modules/scoring/components/performance-breakdown';

/**
 * Optional diagnostics, collapsed by default: calculation context, award runs
 * with their exact reason codes, and per-member factor inputs. Per-member
 * inputs follow the existing presentation scope: managers see the team, a
 * member sees only their own (team_summary_with_own_details), an employee
 * report sees that employee.
 */
export function CalculationDetails({presentation,calculation,awards,names,viewerId,snapshotCount}:{
  presentation: LivePresentation;
  calculation: CalculationResult | null | undefined;
  awards?: AwardReadModel;
  names: Record<string, string>;
  viewerId: string;
  snapshotCount: number;
}) {
  const visible = (userId: string) => presentation.scope === 'manager_team_detail'
    || (presentation.scope === 'employee_detail' ? userId === presentation.employeeId : userId === viewerId);
  const members = (calculation?.members ?? []).filter(member => visible(member.userId));
  return (
    <details id="calculation-details" className="soft-card group p-5 sm:p-6">
      <summary className="cursor-pointer list-none">
        <span className="text-foreground text-base font-bold tracking-tight">Calculation details</span>
        <span className="text-muted-foreground ml-2 text-xs">Award runs and each person's inputs</span>
      </summary>
      <div className="mt-4 grid gap-4">
        <ReportContext model={presentation} picker={false} />
        <p className="text-muted-foreground text-xs">{snapshotCount} saved monthly figures, kept with the rules they were saved under.</p>
        {awards ? <AwardStatus awards={awards} names={names} /> : null}
        <section className="grid gap-2" aria-label="Performance inputs">
          <h3 className="text-sm font-semibold">Performance inputs</h3>
          {members.length === 0 ? <p className="text-muted-foreground text-sm">No individual inputs are visible to you for this period.</p> : null}
          {members.map(result => (
            <details key={result.userId} className="border-border rounded-xl border bg-card p-3">
              <summary className="text-primary cursor-pointer text-sm font-semibold">{names[result.userId] ?? 'Employee'}</summary>
              <PerformanceBreakdown result={result} context={calculation?.context} />
            </details>
          ))}
        </section>
      </div>
    </details>
  );
}
