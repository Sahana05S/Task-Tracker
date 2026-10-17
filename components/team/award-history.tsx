import type { AwardReadModel } from '@/lib/stars/read-model';
import { displayPerformance } from '@/lib/performance/exact';
import { PerformanceBreakdown } from './performance-breakdown';
export function AwardHistory({awards}:{awards:AwardReadModel}) {
 return <section className="soft-card grid gap-2 p-5 sm:p-6"><h2 className="text-foreground text-base font-bold tracking-tight">Calculated daily score history</h2><p className="text-muted-foreground text-xs">All retained candidate observations, including non-winners. {awards.legacy.length} legacy winner records remain separate and uncertified.</p>
 {awards.history.length?awards.history.map(row=><details key={row.runId} className="disclosure"><summary>{row.date}: {row.status}, {row.gate.state}, score {displayPerformance(row.calculation.compositeExact,2)}</summary><p>{row.gate.reasons.join('; ')}</p><p>Source context: {String(row.context.policyId??'unapproved')}; cutoff {String(row.context.cutoff??'unavailable')}; observed as of {String(row.context.asOf??'unavailable')}</p><PerformanceBreakdown result={row.calculation} context={row.calculationContext??undefined}/></details>):<p className="bg-muted/70 text-muted-foreground rounded-xl px-4 py-3 text-sm">No calculated candidate history is available. Winner records are not score measurements for other dates.</p>}
 </section>;
}
