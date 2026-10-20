import { afterEach,describe,it,expect,vi } from 'vitest';
import { POST } from '@/app/api/internal/awards/route';
afterEach(()=>vi.unstubAllEnvs());
describe('M08 worker endpoint boundary',()=>{
 it('is disabled without explicitly configured sandbox delivery',async()=>{vi.stubEnv('TASKPULSE_AWARD_WORKER_ENABLED','');vi.stubEnv('TASKPULSE_AWARD_WORKER_TOKEN','fixture-only-token');expect((await POST(new Request('http://localhost/api/internal/awards',{method:'POST'}))).status).toBe(503);});
 it('stays off for any mode other than sandbox or production',async()=>{vi.stubEnv('TASKPULSE_AWARD_WORKER_ENABLED','true');vi.stubEnv('TASKPULSE_AWARD_WORKER_TOKEN','fixture-only-token');expect((await POST(new Request('http://localhost/api/internal/awards',{method:'POST',headers:{authorization:'Bearer fixture-only-token'}}))).status).toBe(503);});
 it('accepts the production mode and still checks the token before database access',async()=>{vi.stubEnv('TASKPULSE_AWARD_WORKER_ENABLED','production');vi.stubEnv('TASKPULSE_AWARD_WORKER_TOKEN','fixture-only-token');expect((await POST(new Request('http://localhost/api/internal/awards',{method:'POST',headers:{authorization:'Bearer forged-fixture'}}))).status).toBe(403);});
 it('denies absent or forged worker credentials before database access',async()=>{vi.stubEnv('TASKPULSE_AWARD_WORKER_ENABLED','sandbox');vi.stubEnv('TASKPULSE_AWARD_WORKER_TOKEN','fixture-only-token');expect((await POST(new Request('http://localhost/api/internal/awards',{method:'POST',headers:{authorization:'Bearer forged-fixture'}}))).status).toBe(403);});
});
