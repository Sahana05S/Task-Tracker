'use client';

import { useActionState,useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { monthArchiveAction,type MonthActionState } from '@/app/(workspace)/reports/month-actions';
import type { MonthHistory } from '@/lib/month/archive';

export function MonthArchiveControls({period,history,canClose,completeMonth,operation}:{period:string;history:MonthHistory;canClose:boolean;completeMonth:boolean;operation:string}){
 const [result,action,pending]=useActionState(monthArchiveAction,{ok:false,message:''} as MonthActionState);
 const router=useRouter();
 useEffect(()=>{if(result.ok)router.refresh();},[result,router]);
 const prefix=`/reports?period=${period.slice(0,7)}`;
 return <section className="soft-card space-y-3 p-4" aria-label="Month archive">
  <h2 className="font-semibold">Month archive · {history.state}</h2>
  <p>Archived revisions retain their original evidence. Incomplete archives are labelled not certified; unavailable scores and winners stay unavailable.</p>
  <nav aria-label="Report versions" className="flex flex-wrap gap-3"><Link className="underline" href={prefix}>Live report</Link>{history.revisions.map(r=><Link className="underline" key={r.number} href={`${prefix}&revision=${r.number}`}>Revision {r.number} · {r.disposition} · {r.certification==='certified'?'Certified':'Incomplete'}</Link>)}</nav>
  {canClose?<form action={action} className="grid gap-3 md:grid-cols-2">
   <input type="hidden" name="period" value={period}/><input type="hidden" name="version" value={history.version}/><input type="hidden" name="operation" value={operation}/>
   <label className="md:col-span-2">Reason<input required minLength={8} name="reason" className="block w-full rounded border p-2" placeholder="Why this archive or correction is needed"/></label>
   {history.state==='closed'?<><p className="md:col-span-2 text-sm">Open a bounded correction. Name the exact source record and date range; other closed records remain locked.</p>
    <label>Source kind<select name="kind" className="block w-full rounded border p-2">{['log','attendance','fact','idea','suggestion','sale','task'].map(k=><option key={k}>{k}</option>)}</select></label>
    <label>Source record UUID<input required name="recordId" className="block w-full rounded border p-2"/></label>
    <label>From date<input required type="date" name="from" className="block w-full rounded border p-2"/></label>
    <label>Through date<input required type="date" name="through" className="block w-full rounded border p-2"/></label>
    <button className="rounded border p-2" disabled={pending} name="command" value="begin_correction">Authorize correction</button></>:
    <><button className="rounded border p-2" disabled={pending} name="command" value="draft">Capture draft</button><button className="rounded border p-2" disabled={pending||!completeMonth} name="command" value={history.state==='correction'?'revise':'close'}>{history.state==='correction'?'Publish new revision':'Close month'}</button>{!completeMonth?<p className="text-sm">Close becomes available after the Kolkata month ends.</p>:null}</>}
  </form>:null}
  {result.message?<p role="status">{result.message}</p>:null}
 </section>;
}
