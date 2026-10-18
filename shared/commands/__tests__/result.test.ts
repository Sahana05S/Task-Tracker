import { describe,it,expect } from 'vitest';
import { commandIdentity,executionError,executionResult } from '@/shared/commands/result';
describe('M02 command responses',()=>{
 it('requires a stable operation ID and a nonnegative safe version',()=>{
  const form=new FormData(); expect(commandIdentity(form)).toEqual({operationId:null,version:null});
  form.set('operationId','10000000-0000-0000-0000-000000000001'); form.set('expectedVersion','3');
  expect(commandIdentity(form).version).toBe(3); form.set('expectedVersion','-1'); expect(commandIdentity(form).version).toBeNull();
 });
 it('returns actionable conflict/authorization types and never assumes malformed success',()=>{
  expect(executionError({code:'40001',message:'Reload'})).toMatchObject({success:false,errorCode:'conflict',error:'Reload'});
  expect(executionError({code:'42501',message:'Forbidden'}).errorCode).toBe('forbidden');
  expect(()=>executionResult({})).toThrow('same operation key');
 });
});
