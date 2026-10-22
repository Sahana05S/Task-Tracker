// PRIVATE. Activity, contribution and mission templates.
import { computeStreak, type DayCode } from '@/modules/recognition/client';

import { PERIOD_LABELS } from '../periods';
import type { DayFact } from '../types';
import { decide, num, plural, reason, str, type PolicyTemplate } from './spec';

/** The approved active-day streak code of a day (migration 45's rule). */
function streakCode(day: DayFact): DayCode {
  if (day.status === null || day.status === 'Holiday' || day.status === 'Leave' || day.status === 'Off Hours') return 's';
  return (day.status === 'Present' || day.status === 'Half Day') && day.active ? 'c' : 'b';
}

export const activeDayStreak: PolicyTemplate = {
  key: 'active_day_streak',
  label: 'Active day streak',
  summary: (p, kind) => `Reach an active-day streak of ${plural(num(p, 'streakLength', 7), 'day')} within the ${PERIOD_LABELS[kind].noun}.`,
  periodKinds: ['week', 'month'],
  parameters: [{ key: 'streakLength', label: 'Streak length', type: 'integer', min: 2, max: 31, unit: 'days', help: 'Uses the streak rule: worked and logged something, holidays and leave are skipped.' }],
  defaults: { streakLength: 7 },
  defaultReward: { badge: 'On a roll', points: 15 },
  ruleVersion: 'active_day_streak@1',
  evaluate: ({ member, period }, p) => {
    const length = num(p, 'streakLength', 7);
    const codes = member.days.map(streakCode).join('');
    const longest = codes ? computeStreak(codes, member.days[0].date, member.userId, { milestones: [] }).longest : 0;
    return decide(longest >= length ? [] : [reason('streak_short', [], { count: longest, limit: length })], [],
      { longest, from: period.start });
  },
};

const KIND_LABELS: Record<string, string> = { facts: 'facts', ideas: 'ideas', suggestions: 'suggestions', sales: 'sales entries', any: 'contributions' };

export const validatedContributions: PolicyTemplate = {
  key: 'validated_contributions',
  label: 'Validated contributions',
  summary: (p, kind) => `Have at least ${num(p, 'count', 3)} validated ${KIND_LABELS[str(p, 'kind', 'any')] ?? 'contributions'} in the ${PERIOD_LABELS[kind].noun}.`,
  periodKinds: ['day', 'week', 'month'],
  parameters: [
    {
      key: 'kind', label: 'Which contributions', type: 'choice',
      options: [
        { value: 'any', label: 'Any (facts, ideas, suggestions, sales)' }, { value: 'facts', label: 'Facts' }, { value: 'ideas', label: 'Ideas' },
        { value: 'suggestions', label: 'Suggestions' }, { value: 'sales', label: 'Sales entries' },
      ],
    },
    { key: 'count', label: 'At least', type: 'integer', min: 1, max: 100 },
  ],
  defaults: { kind: 'any', count: 3 },
  defaultReward: { badge: 'Contributor', points: 15 },
  ruleVersion: 'validated_contributions@1',
  evaluate: ({ member }, p) => {
    const kind = str(p, 'kind', 'any');
    const needed = num(p, 'count', 3);
    const c = member.contributions;
    const count = kind === 'any' ? c.facts + c.ideas + c.suggestions + c.sales : c[kind as keyof typeof c] ?? 0;
    return decide(count >= needed ? [] : [reason('contributions_short', [], { count, limit: needed })], [], { count, kind });
  },
};

export const noOverdueAtPeriodEnd: PolicyTemplate = {
  key: 'no_overdue_at_period_end',
  label: 'No overdue missions at period end',
  summary: (p, kind) => {
    const grace = num(p, 'graceTasks', 0);
    return `At the end of the ${PERIOD_LABELS[kind].noun}, ${grace > 0 ? `at most ${plural(grace, 'open mission')} past` : 'no open mission is past'} its due date.`;
  },
  periodKinds: ['day', 'week', 'month'],
  parameters: [{ key: 'graceTasks', label: 'Overdue missions allowed', type: 'integer', min: 0, max: 20 }],
  defaults: { graceTasks: 0 },
  defaultReward: { badge: 'Deadline keeper', points: 20 },
  ruleVersion: 'no_overdue_at_period_end@1',
  evaluate: ({ member }, p) => {
    const grace = num(p, 'graceTasks', 0);
    const { overdue, open } = member.tasks;
    return decide(overdue > grace ? [reason('overdue_tasks', [], { count: overdue, limit: grace })] : [], [], { overdue, open });
  },
};

export const allMissionsFresh: PolicyTemplate = {
  key: 'all_missions_fresh_at_period_end',
  label: 'Missions fresh at period end',
  summary: (p, kind) => {
    const stale = num(p, 'staleAllowed', 0);
    return `At the end of the ${PERIOD_LABELS[kind].noun}, no mission is rotten`
      + (stale > 0 ? ` and at most ${plural(stale, 'is', 'are')} stale.` : ' or stale.');
  },
  periodKinds: ['day', 'week', 'month'],
  parameters: [{ key: 'staleAllowed', label: 'Stale missions allowed', type: 'integer', min: 0, max: 20 }],
  defaults: { staleAllowed: 0 },
  defaultReward: { badge: 'Fresh keeper', points: 20 },
  ruleVersion: 'all_missions_fresh_at_period_end@1',
  evaluate: ({ member }, p) => {
    const allowed = num(p, 'staleAllowed', 0);
    const { stale, rotten, undated } = member.tasks;
    const failed = [
      ...(rotten > 0 ? [reason('rotten_tasks', [], { count: rotten })] : []),
      ...(stale > allowed ? [reason('stale_tasks', [], { count: stale, limit: allowed })] : []),
    ];
    return decide(failed, undated > 0 ? [reason('undated_tasks', [], { count: undated })] : [], { stale, rotten, undated });
  },
};
