import type { MemberPerformance } from '@/lib/analytics/engine';
import type { AwardReadModel } from '@/lib/stars/read-model';
import { AwardStatus } from '@/components/team/award-status';
export interface StarPerformerCardProps {awards?:AwardReadModel;performer:MemberPerformance|null;unavailableReason?:string;periodLabel:string;medianProductivity:number|null}
export function StarPerformerCard({awards,unavailableReason,periodLabel}:StarPerformerCardProps) {
  if(awards)return <AwardStatus awards={awards}/>;
  return <section className="soft-card p-5 sm:p-6"><h2 className="text-foreground text-base font-bold tracking-tight">Awards - {periodLabel}</h2><p className="text-muted-foreground mt-1 text-xs">{unavailableReason??'Award selection awaits M08. Saved awards remain available in team reports.'}</p></section>;
}
