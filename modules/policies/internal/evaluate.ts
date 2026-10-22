// PRIVATE. The one evaluator. Preview, "Evaluate now" and the nightly worker
// all call evaluatePolicy over the same facts, so their answers never drift.
import { isOpen } from './periods';
import { templateFor } from './templates';
import type { Audience, FactsModel, MemberFacts, MemberRole, Parameters, Period, PeriodEvaluation, PolicyDefinition } from './types';

export function inAudience(audience: Audience, userId: string, role: MemberRole): boolean {
  if (audience.kind === 'everyone') return true;
  if (audience.kind === 'roles') return audience.roles.includes(role);
  return audience.ids.includes(userId);
}

/** Days of the member that fall inside the period (facts may cover a wider range). */
function clip(member: MemberFacts, period: Period): MemberFacts {
  return { ...member, days: member.days.filter((d) => d.date >= period.start && d.date <= period.end) };
}

/** The template's defaults with the saved values on top. */
export function effectiveParameters(definition: Pick<PolicyDefinition, 'templateKey' | 'parameters'>): Parameters {
  return { ...(templateFor(definition.templateKey)?.defaults ?? {}), ...definition.parameters };
}

/**
 * Evaluates one policy for one period over facts covering that period. Every
 * member of the audience gets an outcome; a period that has not ended gives
 * provisional (final: false) results.
 */
export function evaluatePolicy(definition: PolicyDefinition, period: Period, facts: FactsModel): PeriodEvaluation {
  const template = templateFor(definition.templateKey);
  if (!template) throw new Error(`Unknown policy template "${definition.templateKey}".`);
  if (facts.from > period.start || facts.to < period.end) throw new Error('Facts do not cover the policy period.');
  const final = !isOpen(period, facts.today);
  const params = effectiveParameters(definition);
  const evaluations = facts.members
    .filter((m) => inAudience(definition.audience, m.userId, m.role))
    .map((m) => {
      const result = template.evaluate({ member: clip(m, period), period, today: facts.today, final }, params);
      return { employeeId: m.userId, name: m.name, ...result };
    });
  return { period, final, evaluations };
}

export interface OutcomeCounts { met: number; notMet: number; unavailable: number }

export function countOutcomes(evaluations: { outcome: string }[]): OutcomeCounts {
  const counts = { met: 0, notMet: 0, unavailable: 0 };
  for (const e of evaluations) {
    if (e.outcome === 'met') counts.met += 1;
    else if (e.outcome === 'not_met') counts.notMet += 1;
    else counts.unavailable += 1;
  }
  return counts;
}
