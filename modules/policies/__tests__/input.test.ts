import { describe, expect, it } from 'vitest';

import { parseParameter, parsePolicyForm } from '@/modules/policies/internal/input';

function form(values: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) for (const item of Array.isArray(v) ? v : [v]) f.append(k, item);
  return f;
}

const onTime = {
  templateKey: 'on_time_all_period', name: '  On time all month ', description: 'The MD example', periodKind: 'month',
  'param.cutoff': '09:30', 'param.graceDays': '1', 'param.minWorkingDays': '0', 'param.halfDaysCount': 'on', 'param.missingCheckIn': 'late',
  audienceKind: 'everyone', badge: 'Punctual', points: '20',
};

describe('parsePolicyForm', () => {
  it('reads a complete on-time policy', () => {
    expect(parsePolicyForm(form(onTime))).toEqual({
      ok: true,
      value: {
        name: 'On time all month', description: 'The MD example', templateKey: 'on_time_all_period', periodKind: 'month',
        parameters: { cutoff: '09:30', graceDays: 1, minWorkingDays: 0, halfDaysCount: true, missingCheckIn: 'late' },
        audience: { kind: 'everyone' }, reward: { kind: 'commendation', badge: 'Punctual', points: 20 }, ruleVersion: 'on_time_all_period@1',
      },
    });
  });

  it('reads an unchecked box as false and role or member audiences', () => {
    const roles = parsePolicyForm(form({ ...onTime, 'param.halfDaysCount': '', audienceKind: 'roles', audienceRoles: ['team_member', 'team_member', 'boss'] }));
    expect(roles.ok && roles.value.parameters.halfDaysCount).toBe(false);
    expect(roles.ok && roles.value.audience).toEqual({ kind: 'roles', roles: ['team_member'] });
    const id = '00000000-0000-0000-0000-000000000004';
    const members = parsePolicyForm(form({ ...onTime, audienceKind: 'members', audienceIds: [id, 'nope'] }));
    expect(members.ok && members.value.audience).toEqual({ kind: 'members', ids: [id] });
  });

  it('refuses with a plain message', () => {
    const cases: [Record<string, string | string[]>, RegExp][] = [
      [{ ...onTime, templateKey: 'made_up' }, /Choose a template/],
      [{ ...onTime, name: '' }, /name/],
      [{ ...onTime, periodKind: 'year' }, /per day, week, month/],
      [{ ...onTime, 'param.cutoff': '9:30' }, /24-hour time/],
      [{ ...onTime, 'param.graceDays': '1.5' }, /whole number from 0 to 10/],
      [{ ...onTime, 'param.missingCheckIn': 'maybe' }, /choose one/],
      [{ ...onTime, audienceKind: 'roles' }, /at least one role/],
      [{ ...onTime, audienceKind: 'members' }, /at least one member/],
      [{ ...onTime, badge: '' }, /badge/],
      [{ ...onTime, points: '-1' }, /0 to 1000/],
      [{ ...onTime, points: '2.5' }, /whole number/],
      [{ templateKey: 'active_day_streak', name: 'Streak', periodKind: 'day', badge: 'x', points: '1' }, /per week, month/],
    ];
    for (const [values, message] of cases) {
      const parsed = parsePolicyForm(form(values));
      expect(parsed.ok, JSON.stringify(values)).toBe(false);
      expect(!parsed.ok && parsed.error).toMatch(message);
    }
  });
});

describe('parseParameter', () => {
  it('respects steps for decimal parameters', () => {
    const spec = { key: 'minHours', label: 'Minimum hours', type: 'number' as const, min: 0.25, max: 12, step: 0.25 };
    expect(parseParameter(spec, '0.75')).toEqual({ ok: true, value: 0.75 });
    expect(parseParameter(spec, '0.3').ok).toBe(false);
    expect(parseParameter(spec, '').ok).toBe(false);
  });
});
