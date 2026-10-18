'use client';
import { useState } from 'react';
import { calculateDailyStarAction,overrideDailyStarAction } from '@/modules/scoring/award-actions';
import { prepareOperation } from '@/shared/commands/client-operation';
import { kolkataDate } from '@/shared/time/kolkata';
import type { AwardReadModel } from '@/modules/scoring/client';
export function AwardControls({awards,members}:{awards:AwardReadModel;members:{id:string;fullName:string}[]}) {
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const completed=awards.days.filter(d=>d.runId&&(d.reaffirmationRequired||d.certified&&['completed_winner','completed_none'].includes(d.status)));
 const defaultDay=new Date(kolkataDate()+'T00:00:00Z');defaultDay.setUTCDate(defaultDay.getUTCDate()-1);
 async function send(form:FormData,override=false){setBusy(true);try{if(override){const day=completed.find(d=>d.date===form.get('starDate'));if(!day)throw new Error('Select a complete current award run.');form.set('runId',day.runId!);form.set('expectedVersion',String(day.version));}
  const clear=await prepareOperation(form,override?'award-override':'award-request');const result=await (override?overrideDailyStarAction:calculateDailyStarAction)(form);
  if(result.success){clear();setMessage(override?'Override saved with retained original evidence.':'Award request queued. The worker will record its outcome; this is not a successful calculation.');}else setMessage(result.error??'Award command failed.');
 }catch(e){setMessage(e instanceof Error?e.message:'Award command failed.');}finally{setBusy(false);}}
 return <section className="soft-card p-5 sm:p-6"><h2 className="text-foreground text-base font-bold tracking-tight">Director award controls</h2><form action={f=>send(f)} className="mt-3 flex flex-wrap gap-2"><input aria-label="Kolkata award date" type="date" name="starDate" defaultValue={defaultDay.toISOString().slice(0,10)} required className="field"/><button className="button-primary" disabled={busy}>Request calculation</button></form>
 <form action={f=>send(f,true)} className="border-border mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2"><select name="starDate" aria-label="Complete automatic run" required disabled={!completed.length} className="field"><option value="">Select a complete automatic run</option>{completed.map(d=><option key={d.date} value={d.date}>{d.date}</option>)}</select><select name="overrideUserId" aria-label="Override winner" required className="field"><option value="">Select eligible employee</option>{members.map(m=><option key={m.id} value={m.id}>{m.fullName}</option>)}</select><textarea name="overrideReason" aria-label="Override reason" minLength={8} required placeholder="Explain the override." className="field min-h-20 sm:col-span-2"/><button className="button-secondary justify-self-start" disabled={busy||!completed.length||!awards.policyApproved}>Save director override</button></form><p role="status" className="text-muted-foreground mt-2 text-sm">{message}</p></section>;
}
