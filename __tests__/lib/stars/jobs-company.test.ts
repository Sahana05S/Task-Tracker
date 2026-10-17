import { describe, expect, it, vi } from 'vitest';

import { calculateAward } from '@/lib/stars/calculation';
import { runAwardJobs } from '@/lib/stars/jobs';

vi.mock('@/lib/stars/calculation', () => ({ calculateAward: vi.fn() }));

const NOW = '2026-10-15T09:59:58.123456+00:00';
const client = (jobs: unknown[]) => ({
  rpc: vi.fn(async (name: string) =>
    name === 'observation_clock' ? { data: NOW, error: null }
      : name === 'award_policy_context' ? { data: { policy: { id: 'fixture' } }, error: null }
        : name === 'claim_award_jobs' ? { data: jobs, error: null }
          : { data: { status: 'blocked' }, error: null }),
});

describe('M15.2 award worker company scope', () => {
  it('runs each claimed job through a client for that job\'s company', async () => {
    vi.mocked(calculateAward).mockResolvedValue({ status: 'blocked', winnerId: null, reasons: [], context: { businessDate: '2026-10-12', asOf: 'x' }, candidates: [] } as never);
    const shared = client([
      { id: 'a-job', date: '2026-10-12', leaseToken: 'a-lease', version: 1, organizationId: 'company-a' },
      { id: 'b-job', date: '2026-10-12', leaseToken: 'b-lease', version: 1, organizationId: 'company-b' },
    ]);
    const scoped = new Map<string, ReturnType<typeof client>>();
    const forOrganization = (org: string) => {
      if (!scoped.has(org)) scoped.set(org, client([]));
      return scoped.get(org)! as never;
    };
    await runAwardJobs(shared as never, 10, forOrganization);
    // The claim is unscoped; everything for a job goes through its company's client.
    expect(shared.rpc.mock.calls.map(c => c[0])).toEqual(['award_policy_context', 'claim_award_jobs']);
    expect(vi.mocked(calculateAward).mock.calls.map(c => c[0])).toEqual([scoped.get('company-a'), scoped.get('company-b')]);
    expect(scoped.get('company-a')!.rpc).toHaveBeenCalledWith('award_command', expect.objectContaining({ p_command: 'commit', p_operation: 'a-lease' }));
    expect(scoped.get('company-b')!.rpc).toHaveBeenCalledWith('award_command', expect.objectContaining({ p_command: 'commit', p_operation: 'b-lease' }));
    expect(scoped.get('company-a')!.rpc).not.toHaveBeenCalledWith('award_command', expect.objectContaining({ p_operation: 'b-lease' }));
  });

  it('keeps the shared client for a job without a company (older database)', async () => {
    const shared = client([{ id: 'job', date: '2026-10-12', leaseToken: 'lease', version: 1 }]);
    const forOrganization = vi.fn();
    await runAwardJobs(shared as never, 10, forOrganization);
    expect(forOrganization).not.toHaveBeenCalled();
    expect(shared.rpc).toHaveBeenCalledWith('award_command', expect.objectContaining({ p_operation: 'lease' }));
  });
});
