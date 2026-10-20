import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleHealthCheck, summariseHealth } from '@/modules/scoring/internal/stars/health';

const zero = { failedOrBlockedJobs: 0, longLeasedJobs: 0, staleAwardSlots: 0, latestAwardSuccessAt: '2026-10-19T18:31:00Z' };
const authed = () => new Request('http://localhost/api/internal/health', { headers: { authorization: 'Bearer fixture-only-token' } });

afterEach(() => vi.unstubAllEnvs());

describe('summariseHealth', () => {
  it('is healthy only when every count is zero', () => {
    expect(summariseHealth(zero)).toEqual({ status: 'healthy', ...zero });
    expect(summariseHealth({ ...zero, latestAwardSuccessAt: null }).status).toBe('healthy');
    for (const key of ['failedOrBlockedJobs', 'longLeasedJobs', 'staleAwardSlots'] as const) {
      expect(summariseHealth({ ...zero, [key]: 2 })).toMatchObject({ status: 'unhealthy', [key]: 2 });
    }
  });

  it('rejects a missing or malformed payload instead of reading it as zero', () => {
    expect(() => summariseHealth(null)).toThrow();
    expect(() => summariseHealth({ ...zero, longLeasedJobs: undefined })).toThrow(/longLeasedJobs/);
    expect(() => summariseHealth({ ...zero, staleAwardSlots: '0' })).toThrow();
    expect(() => summariseHealth({ ...zero, failedOrBlockedJobs: -1 })).toThrow();
    expect(() => summariseHealth({ ...zero, latestAwardSuccessAt: 'yesterday' })).toThrow();
  });
});

describe('GET /api/internal/health boundary', () => {
  it('is unavailable without a configured token and refuses forged tokens before any read', async () => {
    const read = vi.fn();
    vi.stubEnv('TASKPULSE_AWARD_WORKER_TOKEN', '');
    expect((await handleHealthCheck(authed(), read)).status).toBe(503);
    vi.stubEnv('TASKPULSE_AWARD_WORKER_TOKEN', 'fixture-only-token');
    const forged = new Request('http://localhost/api/internal/health', { headers: { authorization: 'Bearer forged' } });
    expect((await handleHealthCheck(forged, read)).status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  });

  it('answers 200 when healthy and 503 with the counts otherwise', async () => {
    vi.stubEnv('TASKPULSE_AWARD_WORKER_TOKEN', 'fixture-only-token');
    const ok = await handleHealthCheck(authed(), async () => zero);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ status: 'healthy' });
    const bad = await handleHealthCheck(authed(), async () => ({ ...zero, longLeasedJobs: 1 }));
    expect(bad.status).toBe(503);
    expect(await bad.json()).toMatchObject({ status: 'unhealthy', longLeasedJobs: 1 });
  });

  it('reports a missing read function or a failed read as unavailable, not healthy', async () => {
    vi.stubEnv('TASKPULSE_AWARD_WORKER_TOKEN', 'fixture-only-token');
    const missing = await handleHealthCheck(authed(), async () => null);
    expect(missing.status).toBe(503);
    expect(await missing.json()).toMatchObject({ status: 'unavailable' });
    const failed = await handleHealthCheck(authed(), async () => { throw new Error('down'); });
    expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({ status: 'unavailable' });
  });
});
