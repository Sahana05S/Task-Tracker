import { afterEach,describe,it,expect,vi } from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@supabase/supabase-js',()=>({createClient:vi.fn()}));
vi.mock('@/lib/integrations/drive/setup',()=>({verifyApprovedSandboxAccess:vi.fn()}));
vi.mock('@/lib/auth/profile',()=>({getCurrentProfile:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import { GET,POST } from '@/app/api/internal/drive/route';
import { createClient } from '@supabase/supabase-js';
import { verifyApprovedSandboxAccess } from '@/lib/integrations/drive/setup';
import { getCurrentProfile } from '@/lib/auth/profile';
import { requestDriveOperation } from '@/app/tasks/drive-actions';
import { DRIVE_UNAVAILABLE_MESSAGE } from '@/lib/integrations/drive/availability';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
describe('M10 user-deferred provider boundary',()=>{
 it.each([['read-only diagnostic',GET],['mutating worker',POST]] as const)('keeps %s unavailable even with sandbox flags and a valid token',async(_,handler)=>{
  vi.stubEnv('TASKPULSE_DRIVE_WORKER_ENABLED','sandbox');vi.stubEnv('TASKPULSE_DRIVE_WORKER_TOKEN','fixture-only');
  const response=await handler(new Request('http://localhost/api/internal/drive',{headers:{authorization:'Bearer fixture-only'}}));
  expect(response.status).toBe(503);expect(await response.json()).toEqual({status:'unavailable',reason:DRIVE_UNAVAILABLE_MESSAGE});
  expect(createClient).not.toHaveBeenCalled();expect(verifyApprovedSandboxAccess).not.toHaveBeenCalled();
 });
 it('rejects provider requests without querying profiles or queuing database work',async()=>{
  expect(await requestDriveOperation(new FormData())).toEqual({success:false,error:DRIVE_UNAVAILABLE_MESSAGE});expect(getCurrentProfile).not.toHaveBeenCalled();
 });
});
