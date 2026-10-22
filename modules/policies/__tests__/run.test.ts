import { describe, expect, it } from 'vitest';

import fixture from '@/__tests__/fixtures/policies-period-facts.json';
import type { Db, DueItem } from '@/modules/policies/internal/queries';
import { runDueItems } from '@/modules/policies/internal/run';

type Call = { name: string; args: Record<string, unknown> };

/** A stand-in for the Supabase client: answers the three RPCs runDueItems uses. */
function fakeDb(options: { factsFail?: boolean; recordFail?: boolean } = {}) {
  const calls: Call[] = [];
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === 'policy_period_facts') {
        return options.factsFail ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } } : { data: fixture.facts, error: null };
      }
      const command = args.p_command;
      if (command === 'record_run') {
        if (options.recordFail) return { data: null, error: { code: '23514', message: 'Each item needs a policy' } };
        const items = (args.p_payload as { items: { evaluations: unknown[] }[] }).items;
        const evaluated = items.reduce((n, i) => n + i.evaluations.length, 0);
        return { data: { runId: `run-${calls.length}`, evaluated, changed: evaluated, notified: 1, stale: 0 }, error: null };
      }
      if (command === 'record_failure') return { data: { runId: 'failed-run', status: 'failed', notified: 1 }, error: null };
      throw new Error(`unexpected rpc ${name}`);
    },
  };
  return { db: db as unknown as Db, calls };
}

const due = (overrides: Partial<DueItem> = {}): DueItem => ({
  policyId: '20000000-0000-0000-0000-000000000001', policyVersion: 2, periodKind: 'week', periodKey: '2026-W42',
  periodStart: '2026-10-12', periodEnd: '2026-10-18', open: false, reason: 'new',
  definition: {
    name: 'On time', description: '', templateKey: 'on_time_all_period', parameters: {}, periodKind: 'week',
    audience: { kind: 'everyone' }, reward: { kind: 'commendation', badge: 'Punctual', points: 20 }, ruleVersion: 'on_time_all_period@1',
  },
  ...overrides,
});

describe('runDueItems', () => {
  it('reads facts once per period range, evaluates and records with the facts read time', async () => {
    const { db, calls } = fakeDb();
    const items = [due(), due({ policyId: '20000000-0000-0000-0000-000000000002', definition: { ...due().definition, templateKey: 'full_attendance' } })];
    const summary = await runDueItems(db, items, 'nightly');
    expect(calls.filter((c) => c.name === 'policy_period_facts')).toHaveLength(1);
    const record = calls.find((c) => c.args.p_command === 'record_run')!;
    const payload = record.args.p_payload as { trigger: string; items: { final: boolean; factsAt: string; evaluations: { outcome: string }[] }[] };
    expect(payload.trigger).toBe('nightly');
    expect(payload.items.map((i) => i.final)).toEqual([true, true]);
    expect(payload.items[0].factsAt).toBe(fixture.facts.readAt);
    expect(payload.items[0].evaluations.map((e) => e.outcome)).toEqual(['met', 'not_met', 'unavailable', 'unavailable', 'unavailable']);
    expect(summary).toEqual({ status: 'completed', periods: 2, evaluated: 10, changed: 10, notified: 1, stale: 0, runIds: ['run-2'] });
  });

  it('records in batches of 50 periods', async () => {
    const { db, calls } = fakeDb();
    const items = Array.from({ length: 51 }, (_, i) => due({ policyId: `20000000-0000-0000-0000-${String(i).padStart(12, '0')}` }));
    const summary = await runDueItems(db, items, 'invalidation');
    expect(calls.filter((c) => c.args.p_command === 'record_run').map((c) => (c.args.p_payload as { items: unknown[] }).items.length)).toEqual([50, 1]);
    expect(summary.periods).toBe(51);
  });

  it('turns a facts failure into a failed run, never a zero result', async () => {
    const { db, calls } = fakeDb({ factsFail: true });
    const summary = await runDueItems(db, [due()], 'nightly');
    expect(summary).toMatchObject({ status: 'failed', errorCode: 'facts_read_failed', runIds: ['failed-run'], evaluated: 0 });
    const failure = calls.find((c) => c.args.p_command === 'record_failure')!.args.p_payload as Record<string, unknown>;
    expect(failure).toMatchObject({ trigger: 'nightly', errorCode: 'facts_read_failed', periods: [{ policyId: due().policyId, periodKey: '2026-W42' }] });
    expect(String(failure.errorDetail)).toMatch(/statement timeout/);
  });

  it('names the stage that failed: an unknown template, a refused record', async () => {
    const unknown = fakeDb();
    expect((await runDueItems(unknown.db, [due({ definition: { ...due().definition, templateKey: 'gone' } })], 'nightly')).errorCode).toBe('evaluation_failed');
    const refused = fakeDb({ recordFail: true });
    expect((await runDueItems(refused.db, [due()], 'on_demand')).errorCode).toBe('record_failed');
  });

  it('does nothing for no due work', async () => {
    const { db, calls } = fakeDb();
    expect((await runDueItems(db, [], 'nightly')).status).toBe('completed');
    expect(calls).toEqual([]);
  });
});
