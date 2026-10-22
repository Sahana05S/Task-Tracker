import type { AwardReadModel } from '@/modules/scoring/client';
import { displayPerformance } from '@/shared/math/exact';
import { PerformanceBreakdown } from './performance-breakdown';
import { formatDateTime } from '@/shared/tracker/format';
import { codeLabel, codeLabels } from '@/shared/tracker/labels';
export function AwardHistory({awards}:{awards:AwardReadModel}) {
 return <section className="soft-card grid gap-2 p-5 sm:p-6"><h2 className="text-foreground text-base font-bold tracking-tight">Calculated daily score history</h2><p className="text-muted-foreground text-xs">Every person's daily score, winners or not. {awards.legacy.length} older stars from the sheet are kept separately.</p>
 {awards.history.length?awards.history.map(row=><details key={row.runId} className="disclosure"><summary>{row.date}: {codeLabel(row.status)}, {codeLabel(row.gate.state)}, score {displayPerformance(row.calculation.compositeExact,2)}</summary>{row.gate.reasons.length?<p>{codeLabels(row.gate.reasons)}</p>:null}<p className="text-muted-foreground text-xs">Read as of {typeof row.context.asOf==='string'?formatDateTime(row.context.asOf):'—'}.</p><PerformanceBreakdown result={row.calculation} context={row.calculationContext??undefined}/></details>):<p className="bg-muted/70 text-muted-foreground rounded-xl px-4 py-3 text-sm">No daily scores have been calculated for this period yet.</p>}
 </section>;
}
