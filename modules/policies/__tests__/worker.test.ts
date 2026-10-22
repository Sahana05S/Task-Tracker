import { describe, expect, it } from 'vitest';

import fixture from '@/__tests__/fixtures/policies-period-facts.json';
import type { Db, DueItem } from '@/modules/policies/internal/queries';
import { runPolicyWorker } from '@/modules/policies/internal/worker';

const item: DueItem = {
  policyId: '20000000-0000-0000-0000-000000000001', policyVersion: 1, periodKind: 'week', periodKey: '2026-W42',
  periodStart: '2026-10-12', periodEnd: '2026-10-18', open: false, reason: 'invalidated',
  definition: {
    name: 'On time', description: '', templateKey: 'on_time_all_period', parameters: {}, periodKind: 'week',
    audience: { kind: 'everyone' }, reward: { kind: 'commendation', badge: 'Punctual', points: 20 }, ruleVersion: 'on_time_all_period@1',
  },
};

/** Per company: due items (or a due-work failure) and the commands it received. */
function companies(setup: Record<string, { items?: DueItem[]; remaining?: number; dueFails?: boolean }>) {
  const commands: { org: string; command: string; payload: Record<string, unknown> }[] = [];
  const clientFor = (org: string) => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      const s = setup[org];
      if (name === 'policy_due_work') {
        if (s.dueFails) return { data: null, error: { code: '42501', message: 'A company-scoped worker is required' } };
        const items = s.items ?? [];
        return { data: { today: '2026-10-22', through: '2026-10-22', remaining: s.remaining ?? items.length, items }, error: null };
      }
      if (name === 'policy_period_facts') return { data: fixture.facts, error: null };
      commands.push({ org, command: String(args.p_command), payload: args.p_payload as Record<string, unknown> });
      if (args.p_command === 'record_run') return { data: { runId: 'r', evaluated: 5, changed: 5, notified: 1, stale: 0 }, error: null };
      return { data: { runId: 'f', status: 'failed', notified: 1 }, error: null };
    },
  }) as unknown as Db;
  return { clientFor, commands };
}

describe('runPolicyWorker', () => {
  it('evaluates each company with its own client and reports what is left', async () => {
    const { clientFor, commands } = companies({ a: { items: [item], remaining: 21 }, b: {} });
    const outcomes = await runPolicyWorker(['a', 'b'], clientFor);
    expect(outcomes).toEqual([
      { organizationId: 'a', status: 'completed', periods: 1, evaluated: 5, changed: 5, notified: 1, stale: 0, remaining: 20 },
      { organizationId: 'b', status: 'idle', periods: 0, evaluated: 0, changed: 0, notified: 0, stale: 0, remaining: 0 },
    ]);
    expect(commands.map((c) => [c.org, c.command, c.payload.trigger])).toEqual([['a', 'record_run', 'invalidation']]);
  });

  it('calls a run nightly unless every period is a correction', async () => {
    const { clientFor, commands } = companies({ a: { items: [item, { ...item, periodKey: '2026-W42', reason: 'new' }] } });
    await runPolicyWorker(['a'], clientFor);
    expect(commands[0].payload.trigger).toBe('nightly');
  });

  it('records a failed run when due work cannot be read, and carries on with the next company', async () => {
    const { clientFor, commands } = companies({ a: { dueFails: true }, b: { items: [item] } });
    const outcomes = await runPolicyWorker(['a', 'b'], clientFor);
    expect(outcomes[0]).toMatchObject({ organizationId: 'a', status: 'failed', errorCode: 'due_work_failed', remaining: 0 });
    expect(outcomes[1]).toMatchObject({ organizationId: 'b', status: 'completed' });
    expect(commands[0]).toMatchObject({ org: 'a', command: 'record_failure', payload: { trigger: 'nightly', errorCode: 'due_work_failed' } });
  });
});
