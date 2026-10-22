import type { MemberPerformance } from '@/modules/scoring/client';
import { FactorDifferentialsChart } from '@/modules/workspace-views/components/dashboard/factor-differentials-chart';

export interface ProductivityChartProps {
  members: readonly MemberPerformance[];
  medianProductivity: number | null;
}

/**
 * Productivity differentials: the productivity factor of the shared engine,
 * highest rate first. Members with unavailable attendance or earned credit are
 * counted under the chart instead of drawn.
 */
export function ProductivityChart({ members, medianProductivity }: ProductivityChartProps) {
  const ordered = [...members].sort((a, b) => (b.productivity ?? -Infinity) - (a.productivity ?? -Infinity));
  return (
    <FactorDifferentialsChart
      title="Productivity differentials"
      subtitle="Period scaled credit per regular attendance hour, as the difference from the team median"
      unit="scaled progress / attendance hour"
      median={medianProductivity}
      members={ordered.map((member) => ({
        userId: member.userId,
        fullName: member.fullName,
        delta: member.calculation?.factors.productivity.deltaExact ?? member.productivityDiff,
      }))}
    />
  );
}
