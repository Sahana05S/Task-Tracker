import type { AwardReadModel } from '@/lib/stars/read-model';
import { displayPerformance } from '@/lib/performance/exact';
import { PerformanceBreakdown } from './performance-breakdown';
export function AwardHistory({awards}:{awards:AwardReadModel}) {
 return <section className="soft-card p-4"><h2 className="font-semibold">Calculated daily score history</h2><p className="text-xs">All retained candidate observations, including non-winners. {awards.legacy.length} legacy winner records remain separate and uncertified.</p>
 {awards.history.length?awards.history.map(row=><details key={row.runId} className="mt-2"><summary>{row.date}: {row.status}, {row.gate.state}, score {displayPerformance(row.calculation.compositeExact,2)}</summary><p>{row.gate.reasons.join('; ')}</p><p>Source context: {String(row.context.policyId??'unapproved')}; cutoff {String(row.context.cutoff??'unavailable')}; observed as of {String(row.context.asOf??'unavailable')}</p><PerformanceBreakdown result={row.calculation} context={row.calculationContext??undefined}/></details>):<p className="text-sm">No calculated candidate history is available. Winner records are not score measurements for other dates.</p>}
 </section>;
}
