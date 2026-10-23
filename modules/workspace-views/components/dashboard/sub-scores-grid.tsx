import { FACTOR_LABELS, FACTORS, FACTOR_UNITS, type CalculationResult } from '@/modules/scoring/client';
import { EmptyState } from '@/shared/ui/mission-ui';
import { FactorDifferentialsChart } from '@/modules/workspace-views/components/dashboard/factor-differentials-chart';

/**
 * "Performance sub-scores": the ten factors of the shared engine in engine
 * order, one differences-with-median chart each. Members keep the same
 * (alphabetical) order in every chart so a person can be followed across all
 * ten. Everything comes from the calculation the page already holds; nothing
 * is recalculated. Per-member factor detail follows the presentation scope:
 * managers see the team, a member sees only their own bars against the
 * team median (`onlyUserId`).
 */
export function SubScoresGrid({
  calculation,
  names,
  onlyUserId = null,
}: {
  calculation: CalculationResult | null | undefined;
  names: Record<string, string>;
  onlyUserId?: string | null;
}) {
  const members = (calculation?.members ?? [])
    .filter((member) => onlyUserId === null || member.userId === onlyUserId)
    .map((member) => ({ member, fullName: names[member.userId] ?? 'Employee' }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return (
    <section id="sub-scores" aria-labelledby="sub-scores-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="sub-scores-title" className="panel-title text-lg">Performance sub-scores</h2>
        <p className="text-muted-foreground text-sm">
          {onlyUserId === null
            ? 'Each factor of the shared score as the difference from the team median. Right of the line is above the median.'
            : 'Your difference from the team median on each factor of the shared score. Right of the line is above the median; managers see the whole team.'}
        </p>
      </div>
      {members.length === 0 ? (
        <EmptyState>No performance has been calculated for this period.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {FACTORS.map((factor) => {
            const results = members.map(({ member }) => member.factors[factor]);
            return (
              <FactorDifferentialsChart
                key={factor}
                title={FACTOR_LABELS[factor]}
                unit={FACTOR_UNITS[factor]}
                median={results.find((result) => result.medianExact)?.medianExact ?? null}
                reasons={results.flatMap((result) => result.reasons)}
                members={members.map(({ member, fullName }) => ({
                  userId: member.userId,
                  fullName,
                  delta: member.factors[factor].available ? member.factors[factor].deltaExact : null,
                }))}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
