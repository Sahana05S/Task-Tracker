'use client';

import { buttonVariants } from '@/shared/ui/button';
import { useActionState,useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArchiveIcon } from 'lucide-react';
import { monthArchiveAction,type MonthActionState } from '@/modules/reports/month-actions';
import type { MonthHistory } from '@/modules/reports/internal/month/archive';
import { cn } from '@/shared/utils';
import { codeLabel } from '@/shared/tracker/labels';
import { HelpTip } from '@/shared/ui/help-tip';

export function MonthArchiveControls({period,history,canClose,completeMonth,operation}:{period:string;history:MonthHistory;canClose:boolean;completeMonth:boolean;operation:string}){
 const [result,action,pending]=useActionState(monthArchiveAction,{ok:false,message:''} as MonthActionState);
 const router=useRouter();
 useEffect(()=>{if(result.ok)router.refresh();},[result,router]);
 const prefix=`/reports?period=${period.slice(0,7)}`;
 return <section className="soft-card grid gap-3 p-5 sm:p-6" aria-label="Month archive">
  <h2 className="text-foreground flex flex-wrap items-center gap-2 text-base font-bold tracking-tight"><ArchiveIcon className="text-primary size-5 shrink-0" aria-hidden="true"/>Month close · {codeLabel(history.state)}<HelpTip tip="monthClose"/></h2>
  <p className="text-muted-foreground text-sm">Each closed revision keeps its figures as they were. A month closed with missing inputs is marked so, and missing scores stay missing.</p>
  <nav aria-label="Report versions" className="flex flex-wrap gap-2"><Link className="section-tab bg-muted" href={prefix}>Live report</Link>{history.revisions.map(r=><Link className="section-tab bg-muted" key={r.number} href={`${prefix}&revision=${r.number}`}>Revision {r.number} · {codeLabel(r.disposition)} · {codeLabel(r.certification)}</Link>)}</nav>
  {canClose?<form action={action} className="border-border mt-1 grid gap-3 border-t pt-4 md:grid-cols-2">
   <input type="hidden" name="period" value={period}/><input type="hidden" name="version" value={history.version}/><input type="hidden" name="operation" value={operation}/>
   <label className="field-label md:col-span-2">Reason<input required minLength={8} name="reason" className="field block w-full" placeholder="Why the month is being closed or corrected"/></label>
   {history.state==='closed'?<><p className="text-muted-foreground text-sm md:col-span-2">Open a correction for one record and its dates. Everything else in the closed month stays locked.</p>
    <label className="field-label">Record type<select name="kind" className="field block w-full">{([['log','Time log'],['attendance','Attendance'],['fact','Daily fact'],['idea','Idea'],['suggestion','Suggestion'],['sale','Sale'],['task','Mission']] as const).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></label>
    <label className="field-label">Record reference<input required name="recordId" className="field block w-full" placeholder="From the record's History page"/></label>
    <label className="field-label">From date<input required type="date" name="from" className="field block w-full"/></label>
    <label className="field-label">Through date<input required type="date" name="through" className="field block w-full"/></label>
    <button className={cn(buttonVariants(), 'justify-self-start')} disabled={pending} name="command" value="begin_correction">Authorize correction</button></>:
    <div className="flex flex-wrap items-center gap-2 md:col-span-2"><button className={buttonVariants({ variant: 'outline' })} disabled={pending} name="command" value="draft">Capture draft</button><button className={buttonVariants()} disabled={pending||!completeMonth} name="command" value={history.state==='correction'?'revise':'close'}>{history.state==='correction'?'Publish new revision':'Close month'}</button>{!completeMonth?<p className="text-muted-foreground text-sm">You can close the month once it has ended (India time).</p>:null}</div>}
  </form>:null}
  {result.message?<p role="status" className="bg-muted/70 rounded-xl px-3 py-2 text-sm">{result.message}</p>:null}
 </section>;
}
