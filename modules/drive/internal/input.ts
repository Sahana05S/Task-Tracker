// PRIVATE. Parses the Drive operation form; the database re-validates every field.
export interface DriveOperationInput {
 taskId:string;command:string;operationId:string;expectedVersion:number;
 payload:{name:string;ipoRole:string;fileKind:string;templateKey:string;assetKey:string;jobId:string};
}
export function parseDriveOperation(form:FormData):{ok:true;value:DriveOperationInput}|{ok:false;error:string}{
 const read=(key:string)=>String(form.get(key)??'').trim(),version=read('expectedVersion');
 if(!/^\d+$/.test(version))return {ok:false,error:'Reload the task first.'};
 return {ok:true,value:{taskId:read('taskId'),command:read('command'),operationId:read('operationId'),expectedVersion:Number(version),
  payload:{name:read('name'),ipoRole:read('ipoRole'),fileKind:read('fileKind'),templateKey:read('templateKey'),assetKey:read('assetKey'),jobId:read('jobId')}}};
}
