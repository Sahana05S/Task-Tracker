import { CalendarClockIcon } from 'lucide-react';

import type { LivePresentation } from '@/modules/reports/internal/presentation/model';
import { formatDate, formatDateTime } from '@/shared/tracker/format';
import { HelpTip } from '@/shared/ui/help-tip';
import { PeriodPicker } from '@/shared/ui/period-picker';

/** The month and moment a live view reads, with the picker to change them. */
export function ReportContext({model,keep,picker=true}:{model:LivePresentation;keep?:Readonly<Record<string,string>>;picker?:boolean}) {
 const c=model.calculation.context;
 const complete=model.calculation.status==='complete';
 return <section className="soft-card grid gap-3 p-5 sm:p-6" aria-label="Report period">
  <h2 className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight"><CalendarClockIcon className="text-primary size-5 shrink-0" aria-hidden="true"/>{model.view.period.label}</h2>
  <p role="status" className={complete?'bg-success-subtle text-success-strong rounded-xl px-3 py-2 text-sm':'bg-attention-subtle text-attention-foreground rounded-xl px-3 py-2 text-sm'}>{complete?'Every input is recorded. Awards still need the attendance check.':<>Some inputs are missing, so final scores and rankings wait. Known factors are shown as a partial total. <HelpTip tip="medianDifference"/></>}</p>
  {!model.detailsAvailable?<p role="status" className="bg-attention-subtle text-attention-foreground rounded-xl px-3 py-2 text-sm">Detailed records start on {formatDate(model.detailsAvailableFrom)}; earlier days show totals only.</p>:null}
  {picker?<PeriodPicker month={model.view.period.startDate.slice(0,7)} asOf={model.view.asOf} asOfLabel={formatDateTime(model.view.asOf)} keep={keep}/>:null}
  <details className="disclosure text-muted-foreground text-xs"><summary>Calculation reference</summary><p>Rules {c.ruleVersion} · data version {c.sourceWatermark}. Counted missions follow the eligibility rule; activity lists include every recorded mission.</p></details>
 </section>;
}
