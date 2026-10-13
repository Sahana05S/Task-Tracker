import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {prepareOperation} from '@/lib/commands/client-operation';
beforeEach(()=>{
 const storage=new Map<string,string>();
 vi.stubGlobal('crypto',webcrypto);
 vi.stubGlobal('sessionStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});
});
afterEach(()=>vi.unstubAllGlobals());
function correction(version: string,notes='Work') {
 const form=new FormData(); form.set('logId','log');form.set('notes',notes);form.set('expectedVersion',version);return form;
}
it('recovers an uncertain correction with its original key/version after reload',async()=>{
 const first=correction('1');await prepareOperation(first,'correct');
 const reloaded=correction('2');await prepareOperation(reloaded,'correct');
 expect(reloaded.get('operationId')).toBe(first.get('operationId'));
 expect(reloaded.get('expectedVersion')).toBe('1');
});
it('confirms the old key before allowing a fresh identical intended operation',async()=>{
 const first=correction('1');const confirmed=await prepareOperation(first,'correct');confirmed();
 const next=correction('2');await prepareOperation(next,'correct');
 expect(next.get('operationId')).not.toBe(first.get('operationId'));
 expect(next.get('expectedVersion')).toBe('2');
});
it('isolates changed payloads while ignoring framework action metadata',async()=>{
 const first=correction('1'); first.set('$ACTION_REF','old'); await prepareOperation(first,'correct');
 const same=correction('1'); same.set('$ACTION_REF','new'); await prepareOperation(same,'correct');
 expect(same.get('operationId')).toBe(first.get('operationId'));
 const changed=correction('2','Corrected work'); await prepareOperation(changed,'correct');
 expect(changed.get('operationId')).not.toBe(first.get('operationId'));
});

it('retains both structural versions after an uncertain task save',async()=>{
 const first=new FormData();first.set('taskId','task');first.set('title','Work');first.set('participantVersion','3');first.set('lifecycleVersion','8');
 await prepareOperation(first,'save_task_with_participants');
 const reload=new FormData();reload.set('taskId','task');reload.set('title','Work');reload.set('participantVersion','4');reload.set('lifecycleVersion','12');
 await prepareOperation(reload,'save_task_with_participants');
 expect(reload.get('operationId')).toBe(first.get('operationId'));
 expect(reload.get('participantVersion')).toBe('3');expect(reload.get('lifecycleVersion')).toBe('8');
});
