import type { MemberPerformance } from '@/modules/scoring/client';
import type { AwardReadModel } from '@/modules/scoring/client';
import { AwardStatus } from '@/modules/scoring/components/award-status';
export interface StarPerformerCardProps {awards?:AwardReadModel;performer:MemberPerformance|null;unavailableReason?:string;periodLabel:string;medianProductivity:number|null}
export function StarPerformerCard({awards,unavailableReason,periodLabel}:StarPerformerCardProps) {
  if(awards)return <AwardStatus awards={awards}/>;
  return <section className="soft-card p-5 sm:p-6"><h2 className="text-foreground text-base font-bold tracking-tight">Awards - {periodLabel}</h2><p className="text-muted-foreground mt-1 text-xs">{unavailableReason??'Awards for this month are not decided yet. Saved awards stay available in team reports.'}</p></section>;
}
