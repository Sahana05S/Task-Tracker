import type { MemberCalculation } from '@/modules/scoring/internal/performance/engine';
/** M08 consumes this shared-engine result; this module does not select awards. */
export function performanceForAward(calculation:MemberCalculation) {
  if(calculation.status!=='complete'||!calculation.eligibleForRanking||calculation.composite===null)throw new Error('A complete eligible ten-factor calculation is required.');
  return {userId:calculation.userId,score:calculation.composite,scoreExact:calculation.compositeExact,factors:calculation.factors};
}
