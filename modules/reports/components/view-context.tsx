import { CalendarClockIcon } from 'lucide-react';

import type { LivePresentation } from '@/modules/reports/internal/presentation/model';
import { formatDateTime } from '@/shared/tracker/format';
import { PeriodPicker } from '@/shared/ui/period-picker';

/** The month and moment a live view reads, with the picker to change them (no missing-input notices). */
export function ReportContext({model,keep,picker=true}:{model:LivePresentation;keep?:Readonly<Record<string,string>>;picker?:boolean}) {
 const c=model.calculation.context;
 return <section className="soft-card grid gap-3 p-5 sm:p-6" aria-label="Report period">
  <h2 className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight"><CalendarClockIcon className="text-primary size-5 shrink-0" aria-hidden="true"/>{model.view.period.label}</h2>
  {picker?<PeriodPicker month={model.view.period.startDate.slice(0,7)} asOf={model.view.asOf} asOfLabel={formatDateTime(model.view.asOf)} keep={keep}/>:null}
  <details className="disclosure text-muted-foreground text-xs"><summary>Calculation reference</summary><p>Rules {c.ruleVersion} · data version {c.sourceWatermark}. Counted missions follow the eligibility rule; activity lists include every recorded mission.</p></details>
 </section>;
}
