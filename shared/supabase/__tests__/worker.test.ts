import { afterEach, describe, expect, it, vi } from 'vitest';

import { authorizeWorkerRequest, workerConnection } from '@/shared/supabase/worker';

const request = (authorization?: string) =>
  new Request('https://app.test/api/internal/policies', { method: 'POST', headers: authorization ? { authorization } : {} });

afterEach(() => vi.unstubAllEnvs());

describe('authorizeWorkerRequest', () => {
  it('refuses everyone (403) without a token, and is unavailable (503) to the worker until the switch is on', async () => {
    vi.stubEnv('TASKPULSE_AWARD_WORKER_TOKEN', '');
    vi.stubEnv('TASKPULSE_AWARD_WORKER_ENABLED', 'production');
    // No token configured: nothing about the setup is disclosed to a caller.
    expect(authorizeWorkerRequest(request('Bearer x'))?.status).toBe(403);
    vi.stubEnv('TASKPULSE_AWARD_WORKER_TOKEN', 'secret-token');
    expect(authorizeWorkerRequest(request('Bearer wrong'))?.status).toBe(403);
    vi.stubEnv('TASKPULSE_AWARD_WORKER_ENABLED', 'on');
    const off = authorizeWorkerRequest(request('Bearer secret-token'), 'Policies worker')!;
    expect(off.status).toBe(503);
    expect(await off.json()).toEqual({ status: 'unavailable', reason: 'Policies worker is not configured.' });
  });

  it('refuses a missing or wrong bearer token (403) and lets the right one through', () => {
    vi.stubEnv('TASKPULSE_AWARD_WORKER_TOKEN', 'secret-token');
    vi.stubEnv('TASKPULSE_AWARD_WORKER_ENABLED', 'sandbox');
    expect(authorizeWorkerRequest(request())?.status).toBe(403);
    expect(authorizeWorkerRequest(request('Bearer secret-tokem'))?.status).toBe(403);
    expect(authorizeWorkerRequest(request('secret-token'))?.status).toBe(403);
    expect(authorizeWorkerRequest(request('Bearer secret-token'))).toBeNull();
  });

  it('reads the service-role connection only when both values are set', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(workerConnection()).toBeNull();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    expect(workerConnection()).toEqual({ url: 'https://db.test', key: 'service-key' });
  });
});
