'use client';
import { useState } from 'react';
import { calculateDailyStarAction,overrideDailyStarAction } from '@/app/(workspace)/team/star-actions';
import { prepareOperation } from '@/lib/commands/client-operation';
import { kolkataDate } from '@/lib/tasks/contract';
import type { AwardReadModel } from '@/lib/stars/read-model';
export function AwardControls({awards,members}:{awards:AwardReadModel;members:{id:string;fullName:string}[]}) {
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const completed=awards.days.filter(d=>d.runId&&(d.reaffirmationRequired||d.certified&&['completed_winner','completed_none'].includes(d.status)));
 const defaultDay=new Date(kolkataDate()+'T00:00:00Z');defaultDay.setUTCDate(defaultDay.getUTCDate()-1);
 async function send(form:FormData,override=false){setBusy(true);try{if(override){const day=completed.find(d=>d.date===form.get('starDate'));if(!day)throw new Error('Select a complete current award run.');form.set('runId',day.runId!);form.set('expectedVersion',String(day.version));}
  const clear=await prepareOperation(form,override?'award-override':'award-request');const result=await (override?overrideDailyStarAction:calculateDailyStarAction)(form);
  if(result.success){clear();setMessage(override?'Override saved with retained original evidence.':'Award request queued. The worker will record its outcome; this is not a successful calculation.');}else setMessage(result.error??'Award command failed.');
 }catch(e){setMessage(e instanceof Error?e.message:'Award command failed.');}finally{setBusy(false);}}
 return <section className="soft-card p-4"><h2 className="font-semibold">Director award controls</h2><form action={f=>send(f)} className="mt-2 flex gap-2"><input aria-label="Kolkata award date" type="date" name="starDate" defaultValue={defaultDay.toISOString().slice(0,10)} required/><button className="button-primary" disabled={busy}>Request calculation</button></form>
 <form action={f=>send(f,true)} className="mt-3 grid gap-2"><select name="starDate" aria-label="Complete automatic run" required disabled={!completed.length}><option value="">Select a complete automatic run</option>{completed.map(d=><option key={d.date} value={d.date}>{d.date}</option>)}</select><select name="overrideUserId" aria-label="Override winner" required><option value="">Select eligible employee</option>{members.map(m=><option key={m.id} value={m.id}>{m.fullName}</option>)}</select><textarea name="overrideReason" aria-label="Override reason" minLength={8} required placeholder="Explain the override."/><button disabled={busy||!completed.length||!awards.policyApproved}>Save director override</button></form><p role="status" className="mt-2 text-sm">{message}</p></section>;
}
