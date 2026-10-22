import { describe, expect, it } from 'vitest';

import fixture from '@/__tests__/fixtures/policies-period-facts.json';
import { countOutcomes, effectiveParameters, evaluatePolicy, inAudience } from '@/modules/policies/internal/evaluate';
import { periodOf } from '@/modules/policies/internal/periods';
import type { FactsModel, PolicyDefinition } from '@/modules/policies/internal/types';

const facts = fixture.facts as FactsModel;
const week = periodOf('week', '2026-10-12');
const definition: PolicyDefinition = {
  name: 'On time all week', description: '', templateKey: 'on_time_all_period', parameters: {}, periodKind: 'week',
  audience: { kind: 'everyone' }, reward: { kind: 'commendation', badge: 'Punctual', points: 20 }, ruleVersion: 'on_time_all_period@1',
};

describe('evaluatePolicy', () => {
  it('evaluates every audience member; a closed period is final', () => {
    const result = evaluatePolicy(definition, week, facts);
    expect(result.final).toBe(true);
    expect(result.period.key).toBe('2026-W42');
    expect(result.evaluations.map((e) => e.outcome)).toEqual(['met', 'not_met', 'unavailable', 'unavailable', 'unavailable']);
    expect(countOutcomes(result.evaluations)).toEqual({ met: 1, notMet: 1, unavailable: 3 });
  });

  it('gives provisional results while the period runs', () => {
    const open = { ...facts, today: '2026-10-18' };
    expect(evaluatePolicy(definition, week, open).final).toBe(false);
  });

  it('filters by role or member audience', () => {
    const engineers = evaluatePolicy({ ...definition, audience: { kind: 'roles', roles: ['project_engineer'] } }, week, facts);
    expect(engineers.evaluations.map((e) => e.name)).toEqual(['Chitra (missing check-ins)']);
    const one = evaluatePolicy({ ...definition, audience: { kind: 'members', ids: ['00000000-0000-0000-0000-000000000011'] } }, week, facts);
    expect(one.evaluations).toHaveLength(1);
    expect(inAudience({ kind: 'everyone' }, 'x', 'team_member')).toBe(true);
  });

  it('judges a day period by that day only, from wider facts', () => {
    const wednesday = periodOf('day', '2026-10-14');
    const result = evaluatePolicy({ ...definition, periodKind: 'day' }, wednesday, facts);
    expect(result.evaluations.find((e) => e.name.startsWith('Bala'))!.outcome).toBe('not_met');
    expect(result.evaluations.find((e) => e.name.startsWith('Chitra'))!.outcome).toBe('met');
  });

  it('fills template defaults under saved parameters', () => {
    expect(effectiveParameters({ templateKey: 'on_time_all_period', parameters: { cutoff: '10:00' } }))
      .toMatchObject({ cutoff: '10:00', graceDays: 0, missingCheckIn: 'unavailable' });
  });

  it('refuses unknown templates and facts that do not cover the period', () => {
    expect(() => evaluatePolicy({ ...definition, templateKey: 'nope' }, week, facts)).toThrow(/Unknown policy template/);
    expect(() => evaluatePolicy(definition, periodOf('month', '2026-10-01'), facts)).toThrow(/do not cover/);
  });
});
