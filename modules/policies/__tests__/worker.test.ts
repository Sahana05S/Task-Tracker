import { describe, expect, it } from 'vitest';

import fixture from '@/__tests__/fixtures/policies-period-facts.json';
import type { Db, DueItem } from '@/modules/policies/internal/queries';
import { runPolicyWorker, TIME_BUDGET_MS } from '@/modules/policies/internal/worker';

const item: DueItem = {
  policyId: '20000000-0000-0000-0000-000000000001', policyVersion: 1, periodKind: 'week', periodKey: '2026-W42',
  periodStart: '2026-10-12', periodEnd: '2026-10-18', open: false, reason: 'invalidated',
  definition: {
    name: 'On time', description: '', templateKey: 'on_time_all_period', parameters: {}, periodKind: 'week',
    audience: { kind: 'everyone' }, reward: { kind: 'commendation', badge: 'Punctual', points: 20 }, ruleVersion: 'on_time_all_period@1',
  },
};

type Setup = { batches?: DueItem[][]; dueFails?: boolean; recordThrows?: boolean };

/**
 * Per company: the successive due-work batches (each read returns the next, then nothing),
 * a due-work failure, or a database that refuses every command.
 */
function companies(setup: Record<string, Setup>) {
  const commands: { org: string; command: string; payload: Record<string, unknown> }[] = [];
  const reads: Record<string, number> = {};
  const clientFor = (org: string) => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      const s = setup[org];
      if (name === 'policy_due_work') {
        if (s.dueFails) return { data: null, error: { code: '42501', message: 'A company-scoped worker is required' } };
        const n = reads[org] = (reads[org] ?? 0) + 1;
        const left = (s.batches ?? []).slice(n - 1);
        return { data: { today: '2026-10-22', through: '2026-10-22', remaining: left.flat().length, items: left[0] ?? [] }, error: null };
      }
      if (name === 'policy_period_facts') return { data: fixture.facts, error: null };
      commands.push({ org, command: String(args.p_command), payload: args.p_payload as Record<string, unknown> });
      if (s.recordThrows) throw new Error('connection reset');
      if (args.p_command === 'record_run') return { data: { runId: 'r', evaluated: 5, changed: 5, notified: 1, stale: 0 }, error: null };
      return { data: { runId: 'f', status: 'failed', notified: 1 }, error: null };
    },
  }) as unknown as Db;
  return { clientFor, commands, reads };
}

describe('runPolicyWorker', () => {
  it('drains each company with its own client, batch after batch, until nothing is due', async () => {
    const { clientFor, commands, reads } = companies({ a: { batches: [[item], [item]] }, b: {} });
    const outcomes = await runPolicyWorker(['a', 'b'], clientFor);
    expect(outcomes).toEqual([
      { organizationId: 'a', status: 'completed', periods: 2, evaluated: 10, changed: 10, notified: 2, stale: 0, remaining: 0 },
      { organizationId: 'b', status: 'idle', periods: 0, evaluated: 0, changed: 0, notified: 0, stale: 0, remaining: 0 },
    ]);
    expect(reads).toEqual({ a: 3, b: 1 });
    expect(commands.map((c) => [c.org, c.command, c.payload.trigger])).toEqual([['a', 'record_run', 'invalidation'], ['a', 'record_run', 'invalidation']]);
  });

  it('stops starting batches when the time budget is spent and reports what the database still has due', async () => {
    let clock = 0;
    const { clientFor, commands } = companies({ a: { batches: [[item], [item], [item]] }, b: { batches: [[item]] } });
    const outcomes = await runPolicyWorker(['a', 'b'], clientFor, () => (clock += TIME_BUDGET_MS / 3));
    // Each clock read advances a third of the budget: two batches fit, then a and b stop with work left.
    expect(outcomes.map((o) => [o.organizationId, o.periods, o.remaining])).toEqual([['a', 2, 1], ['b', 0, 1]]);
    expect(commands).toHaveLength(2);
  });

  it('calls a run nightly unless every period is a correction', async () => {
    const { clientFor, commands } = companies({ a: { batches: [[item, { ...item, reason: 'new' }]] } });
    await runPolicyWorker(['a'], clientFor);
    expect(commands[0].payload.trigger).toBe('nightly');
  });

  it('records a failed run when due work cannot be read, and carries on with the next company', async () => {
    const { clientFor, commands } = companies({ a: { dueFails: true }, b: { batches: [[item]] } });
    const outcomes = await runPolicyWorker(['a', 'b'], clientFor);
    expect(outcomes[0]).toMatchObject({ organizationId: 'a', status: 'failed', errorCode: 'due_work_failed', remaining: 0 });
    expect(outcomes[1]).toMatchObject({ organizationId: 'b', status: 'completed', remaining: 0 });
    expect(commands[0]).toMatchObject({ org: 'a', command: 'record_failure', payload: { trigger: 'nightly', errorCode: 'due_work_failed' } });
  });

  it('keeps going when a company cannot even record its failure', async () => {
    const { clientFor } = companies({ a: { batches: [[item]], recordThrows: true }, b: { batches: [[item]] } });
    const outcomes = await runPolicyWorker(['a', 'b'], clientFor);
    expect(outcomes.map((o) => [o.organizationId, o.status, o.errorCode])).toEqual([['a', 'failed', 'record_failed'], ['b', 'completed', undefined]]);
  });
});
