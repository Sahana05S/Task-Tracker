'use client';
import { startTransition, useActionState, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { prepareOperation } from '@/shared/commands/client-operation';
import type { ActionResponse } from '@/types/tracker';
export function ExecutionForm({action,scope,children,className}: {
 action: (form: FormData)=>Promise<ActionResponse<unknown>>; scope: string;
 children: React.ReactNode; className?: string;
}) {
 const router=useRouter(); const [changed,setChanged]=useState(false); const formRef=useRef<HTMLFormElement>(null);
 const [state,submit,pending]=useActionState(async (_previous: ActionResponse<unknown>|null,form: FormData) => {
  setChanged(false);
  try {
   if(form.has('taskVersion')) { const [id,version]=String(form.get('taskVersion')).split(':'); form.delete('taskVersion'); form.set('taskId',id); form.set('expectedVersion',version); }
   const confirmed=await prepareOperation(form,scope);
   const result=await action(form);
   if (result.success) { confirmed(); formRef.current?.reset(); router.refresh(); }
   return result;
  } catch { return {success:false,error:'The response was interrupted. Retry the same values to recover the saved result.',errorCode:'unavailable' as const}; }
 },null);
 // React 19 resets a form after every action, so a refused command cleared what
 // the user typed. onSubmit dispatches in a transition and prevents default,
 // which makes React skip its action pipeline (and that reset); success resets
 // explicitly. `action` stays so server HTML blocks native pre-hydration submits.
 return <form ref={formRef} action={submit} className={className} onChange={()=>setChanged(true)} onSubmit={event=>{
  event.preventDefault();
  const data=new FormData(event.currentTarget,(event.nativeEvent as SubmitEvent).submitter);
  startTransition(()=>submit(data));
 }}>
  <fieldset disabled={pending || (state?.success===true && !changed)} className="grid gap-2 border-0 p-0">
   {children}
  </fieldset>
  {state?.success && !changed ? <button type="button" className="text-sm underline" onClick={()=>setChanged(true)}>Make another change</button> : null}
  {pending ? <p role="status" className="text-sm">Saving…</p> : null}
  {state ? <p role={state.success?'status':'alert'} className={state.success?'text-sm text-emerald-700':'text-sm text-red-700'}>{state.success?'Saved.':state.error}</p> : null}
 </form>;
}
