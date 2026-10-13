import type { MemberPerformance } from '@/lib/analytics/engine';
export interface StarPerformerCardProps {performer:MemberPerformance|null;unavailableReason?:string;periodLabel:string;medianProductivity:number|null}
export function StarPerformerCard({unavailableReason,periodLabel}:StarPerformerCardProps) {
  return <section className="soft-card px-4 py-6"><h2 className="text-sm font-semibold">Awards - {periodLabel}</h2><p className="text-muted-foreground mt-1 text-xs">{unavailableReason??'Award selection awaits M08. Saved awards remain available in team reports.'}</p></section>;
}
