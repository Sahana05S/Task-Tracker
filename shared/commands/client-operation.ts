export async function prepareOperation(form: FormData,scope: string) {
 // A reload may show the post-commit version before the lost response is
 // recovered. Keep the original version with the pending key. Framework action
 // metadata is not business input and can change on reload/build.
 const entries=Array.from(form.entries()).filter(([key])=>key!=='operationId' && !['expectedVersion','lifecycleVersion','participantVersion'].includes(key) && !key.startsWith('$ACTION_'));
 const bytes=new TextEncoder().encode(JSON.stringify([scope,entries]));
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
 const storageKey=`taskpulse-operation:${digest}`;
 const saved=sessionStorage.getItem(storageKey);
 const pending: {operationId: string; version: string|null; lifecycleVersion?:string|null; participantVersion?:string|null}=saved ? JSON.parse(saved)
   : {operationId:crypto.randomUUID(),version:form.has('expectedVersion') ? String(form.get('expectedVersion')) : null,lifecycleVersion:form.has('lifecycleVersion')?String(form.get('lifecycleVersion')):null,participantVersion:form.has('participantVersion')?String(form.get('participantVersion')):null};
 if (!saved) sessionStorage.setItem(storageKey,JSON.stringify(pending));
 form.set('operationId',pending.operationId);
 if (pending.version!==null) form.set('expectedVersion',pending.version);
 if (pending.lifecycleVersion != null) form.set('lifecycleVersion',pending.lifecycleVersion);
 if (pending.participantVersion != null) form.set('participantVersion',pending.participantVersion);
 return () => sessionStorage.removeItem(storageKey);
}
