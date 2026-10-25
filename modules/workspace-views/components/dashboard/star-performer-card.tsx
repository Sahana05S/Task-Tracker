import type { MemberPerformance } from '@/modules/scoring/client';
import type { AwardReadModel } from '@/modules/scoring/client';
import { AwardSummary } from './award-summary';
export interface StarPerformerCardProps {awards?:AwardReadModel;performer:MemberPerformance|null;unavailableReason?:string;periodLabel:string;medianProductivity:number|null}
/** The award strip when awards are read; nothing (never an "unavailable" note) when they are not. */
export function StarPerformerCard({awards}:StarPerformerCardProps) {
  return awards?<AwardSummary awards={awards} names={{}}/>:null;
}
