import { afterEach,describe,it,expect,vi } from 'vitest';
vi.mock('server-only',()=>({}));
// Preserve authorization coverage for a future explicit resume. Current deferral
// is tested with the real gate in deferred.test.ts; this does not enable workers.
vi.mock('@/lib/integrations/drive/availability',()=>({DRIVE_INTEGRATION_DEFERRED:false,DRIVE_UNAVAILABLE_MESSAGE:'Fixture only'}));
import { googleToken } from '@/lib/integrations/drive/auth';
import { POST,GET } from '@/app/api/internal/drive/route';
import type { DrivePolicy } from '@/lib/integrations/drive/contract';
const policy={auth:'organization_oauth',organizationEmail:'worker@example.test',scope:'drive.file'} as DrivePolicy;
afterEach(()=>vi.unstubAllEnvs());
describe('M10 server credential boundary',()=>{
 it('protects read-only setup with the server token before any account access',async()=>{vi.stubEnv('TASKPULSE_DRIVE_WORKER_TOKEN','fixture-only');expect((await GET(new Request('http://localhost',{headers:{authorization:'Bearer forged'}}))).status).toBe(403);});
 it('allows setup diagnostics with mutation disabled and reports absent credentials safely',async()=>{
  vi.stubEnv('TASKPULSE_DRIVE_WORKER_ENABLED','');vi.stubEnv('TASKPULSE_DRIVE_WORKER_TOKEN','fixture-only');vi.stubEnv('TASKPULSE_DRIVE_SERVICE_ACCOUNT_EMAIL','');
  const request=new Request('http://localhost',{headers:{authorization:'Bearer fixture-only'}}),response=await GET(request);
  expect(response.status).toBe(503);expect(await response.json()).toEqual({status:'blocked',errorCode:'credentials_missing'});
  expect((await POST(request)).status).toBe(503);
 });
 it('requires explicit sandbox worker delivery',async()=>{vi.stubEnv('TASKPULSE_DRIVE_WORKER_ENABLED','');expect((await POST(new Request('http://localhost',{method:'POST'}))).status).toBe(503);});
 it('rejects forged worker authorization before DB access',async()=>{vi.stubEnv('TASKPULSE_DRIVE_WORKER_ENABLED','sandbox');vi.stubEnv('TASKPULSE_DRIVE_WORKER_TOKEN','fixture-only');expect((await POST(new Request('http://localhost',{method:'POST',headers:{authorization:'Bearer forged'}}))).status).toBe(403);});
 it('does not infer Drive access from Google login or absent credentials',async()=>{const fetcher=vi.fn();await expect(googleToken(policy,{},fetcher)()).rejects.toThrow('credentials_missing');expect(fetcher).not.toHaveBeenCalled();});
 it('uses secure server token exchange and caches without exposing secrets',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({access_token:'fixture-token',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'})));
  const token=googleToken(policy,{TASKPULSE_DRIVE_OAUTH_CLIENT_ID:'fixture-id',TASKPULSE_DRIVE_OAUTH_CLIENT_SECRET:'fixture-secret',TASKPULSE_DRIVE_OAUTH_REFRESH_TOKEN:'fixture-refresh'},fetcher);
  expect(await token()).toBe('fixture-token');expect(await token()).toBe('fixture-token');expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token');
 });
 it('sanitizes revoked credentials instead of forwarding provider errors',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response('{"error":"invalid_grant","error_description":"sensitive"}',{status:400}));
  await expect(googleToken(policy,{TASKPULSE_DRIVE_OAUTH_CLIENT_ID:'fixture-id',TASKPULSE_DRIVE_OAUTH_CLIENT_SECRET:'fixture-secret',TASKPULSE_DRIVE_OAUTH_REFRESH_TOKEN:'fixture-refresh'},fetcher)()).rejects.toThrow('credentials_revoked');
 });
 it('rejects scope mismatch without silently requesting broader access',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response('{"access_token":"fixture-token","scope":"https://www.googleapis.com/auth/drive"}'));
  await expect(googleToken(policy,{TASKPULSE_DRIVE_OAUTH_CLIENT_ID:'fixture-id',TASKPULSE_DRIVE_OAUTH_CLIENT_SECRET:'fixture-secret',TASKPULSE_DRIVE_OAUTH_REFRESH_TOKEN:'fixture-refresh'},fetcher)()).rejects.toThrow('access_denied');
 });
});
