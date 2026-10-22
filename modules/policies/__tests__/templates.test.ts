import { describe, expect, it } from 'vitest';

import fixture from '@/__tests__/fixtures/policies-period-facts.json';
import { parseParameter } from '@/modules/policies/internal/input';
import { describeReason, REASON_LABELS } from '@/modules/policies/internal/labels';
import { TEMPLATES, templateFor } from '@/modules/policies/internal/templates';
import type { FactsModel, Parameters, Period } from '@/modules/policies/internal/types';

const facts = fixture.facts as FactsModel;
const period = fixture.period as Period;
const member = (id: string) => facts.members.find((m) => m.userId === id)!;

describe('policy templates over the shared fixture (closed week 2026-W42)', () => {
  for (const c of fixture.cases) {
    const label = `${c.template} ${JSON.stringify(c.parameters)}`;
    it(label, () => {
      const template = templateFor(c.template)!;
      const params = { ...template.defaults, ...(c.parameters as Parameters) };
      for (const [id, expected] of Object.entries(c.expected)) {
        const result = template.evaluate({ member: member(id), period, today: facts.today, final: true }, params);
        expect([member(id).name, result.outcome]).toEqual([member(id).name, expected]);
        expect(result.reasons.map((r) => r.code)).toEqual((c.reasons as Record<string, string[]>)[id]);
      }
    });
  }

  it('lists the late dates and the allowance as evidence', () => {
    const result = templateFor('on_time_all_period')!.evaluate(
      { member: member('00000000-0000-0000-0000-000000000012'), period, today: facts.today, final: true },
      templateFor('on_time_all_period')!.defaults,
    );
    expect(result.reasons[0]).toEqual({ code: 'late', dates: ['2026-10-14'], count: 1, limit: 0 });
    expect(result.evidence).toMatchObject({ workingDays: 6, lateDays: ['2026-10-14'], cutoff: '09:30' });
  });

  it('treats today as pending: a missing check-in or record today is not yet missing', () => {
    const today = '2026-10-16';
    const chitra = member('00000000-0000-0000-0000-000000000013');
    const open = { ...chitra, days: chitra.days.filter((d) => d.date <= today) };
    const onTime = templateFor('on_time_all_period')!;
    const result = onTime.evaluate({ member: open, period, today, final: false }, onTime.defaults);
    expect(result.reasons).toEqual([{ code: 'check_in_missing', dates: ['2026-10-13'], count: 1 }]);
    const esha = member('00000000-0000-0000-0000-000000000015');
    const noRecordToday = { ...esha, days: esha.days.filter((d) => d.date === today) };
    expect(templateFor('full_attendance')!.evaluate({ member: noRecordToday, period, today, final: false }, {}).outcome).toBe('met');
  });

  it('does not judge "too few working days" until the period has ended', () => {
    const onTime = templateFor('on_time_all_period')!;
    const dev = member('00000000-0000-0000-0000-000000000014');
    const result = onTime.evaluate({ member: dev, period, today: '2026-10-17', final: false }, { ...onTime.defaults, minWorkingDays: 6 });
    expect(result.outcome).toBe('unavailable');
    expect(result.reasons.map((r) => r.code)).toEqual(['no_working_days']);
  });
});

describe('template catalogue', () => {
  it('has unique keys, a rule version, a reward and defaults that parse', () => {
    expect(new Set(TEMPLATES.map((t) => t.key)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) {
      expect(t.key).toMatch(/^[a-z][a-z0-9_]{2,59}$/);
      expect(t.ruleVersion.startsWith(t.key + '@')).toBe(true);
      expect(t.defaultReward.points).toBeGreaterThanOrEqual(0);
      expect(t.periodKinds.length).toBeGreaterThan(0);
      for (const spec of t.parameters) {
        const value = t.defaults[spec.key];
        expect(value, `${t.key}.${spec.key} default`).not.toBeUndefined();
        const raw = typeof value === 'boolean' ? (value ? 'on' : '') : String(value);
        expect(parseParameter(spec, raw)).toEqual({ ok: true, value });
      }
      for (const kind of t.periodKinds) expect(t.summary(t.defaults, kind)).toMatch(/\.$/);
    }
  });

  it('has plain words for every reason code a template can give', () => {
    const codes = new Set(fixture.cases.flatMap((c) => Object.values(c.reasons as Record<string, string[]>).flat()));
    for (const code of codes) expect(REASON_LABELS[code], code).toBeTruthy();
    expect(describeReason({ code: 'late', dates: ['2026-10-14', '2026-10-15'], count: 2, limit: 0 })).toBe('Checked in after the cut-off on 14 Oct, 15 Oct.');
    expect(describeReason({ code: 'attendance_missing', dates: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'] }))
      .toBe('No attendance recorded on 12 Oct, 13 Oct, 14 Oct, 15 Oct and 2 more days.');
    expect(describeReason({ code: 'streak_short', count: 3, limit: 5 })).toBe('Longest active-day streak was 3 days; 5 needed.');
  });

  it('words the summaries with the parameters filled in', () => {
    expect(templateFor('on_time_all_period')!.summary({ cutoff: '09:45', graceDays: 1 }, 'month'))
      .toBe('Check in by 09:45 on every working day of the month, with 1 late day allowed.');
    expect(templateFor('validated_contributions')!.summary({ kind: 'ideas', count: 2 }, 'week'))
      .toBe('Have at least 2 validated ideas in the week.');
    expect(templateFor('all_missions_fresh_at_period_end')!.summary({ staleAllowed: 0 }, 'day'))
      .toBe('At the end of the day, no mission is rotten or stale.');
  });
});
