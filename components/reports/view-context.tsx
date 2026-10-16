import { CalendarClockIcon } from 'lucide-react';

import type { LivePresentation } from '@/lib/presentation/model';
export function ReportContext({model}:{model:LivePresentation}) {
 const c=model.calculation.context;
 const complete=model.calculation.status==='complete';
 return <section className="soft-card grid gap-2 p-5 sm:p-6" aria-label="Report context">
  <h2 className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight"><CalendarClockIcon className="text-primary size-5 shrink-0" aria-hidden="true"/>Live view · {model.view.period.label}</h2>
  <p className="text-muted-foreground text-sm">As of {new Date(c.asOf).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} Asia/Kolkata · {c.ruleVersion}</p>
  <p className="text-muted-foreground text-xs">Metric population: eligible carried tasks and period earnings. Operational counts include recorded tasks. Source watermark: {c.sourceWatermark}.</p>
  <p role="status" className={complete?'bg-success-subtle text-success-strong rounded-xl px-3 py-2 text-sm':'bg-attention-subtle text-attention-foreground rounded-xl px-3 py-2 text-sm'}>{complete?'Calculation complete; attendance eligibility still applies.':'Final scores and certified rankings are unavailable where required inputs are missing. Available-factor subtotals are partial.'}</p>
  {!model.detailsAvailable?<p role="status" className="bg-attention-subtle text-attention-foreground rounded-xl px-3 py-2 text-sm">Historical presentation details unavailable before {model.detailsAvailableFrom}; recorded metric evidence remains separate.</p>:null}
  <form className="mt-1 flex flex-wrap items-end gap-3" method="get">
   <label className="field-label">Month<input className="field" type="month" name="period" defaultValue={model.view.period.startDate.slice(0,7)}/></label>
   <label className="field-label min-w-0 flex-1 sm:max-w-sm">As-of instant (with timezone)<input className="field w-full" name="asOf" defaultValue={model.view.asOf}/></label>
   <button className="button-secondary" type="submit">View</button>
  </form>
 </section>;
}
