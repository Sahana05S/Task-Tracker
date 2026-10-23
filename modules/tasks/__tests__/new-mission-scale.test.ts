import { describe, expect, it } from 'vitest';

import { parseNewMissionScale } from '@/modules/tasks/internal/input';

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe('new mission scale mode', () => {
  it('keeps the fixed weight path when no mode or manual is sent', () => {
    expect(parseNewMissionScale(form({}))).toEqual({ ok: true, value: { mode: 'manual' } });
    expect(parseNewMissionScale(form({ scaleMode: 'manual', scaleMultiplier: '9' }))).toEqual({ ok: true, value: { mode: 'manual' } });
  });

  it('reads the hours multiplier', () => {
    expect(parseNewMissionScale(form({ scaleMode: 'hours', scaleMultiplier: '1.5' }))).toEqual({
      ok: true,
      value: { mode: 'hours', inputs: { multiplier: 1.5 } },
    });
    expect(parseNewMissionScale(form({ scaleMode: 'hours', scaleMultiplier: '0' }))).toMatchObject({ ok: true });
    expect(parseNewMissionScale(form({ scaleMode: 'hours' }))).toEqual({ ok: false, error: 'Enter the multiplier.' });
    expect(parseNewMissionScale(form({ scaleMode: 'hours', scaleMultiplier: '-1' }))).toEqual({ ok: false, error: 'The multiplier must be a number of 0 or more.' });
    expect(parseNewMissionScale(form({ scaleMode: 'hours', scaleMultiplier: 'abc' })).ok).toBe(false);
  });

  it('reads a whole activity count and the scale per activity', () => {
    expect(parseNewMissionScale(form({ scaleMode: 'activity_count', scaleActivityCount: '4', scaleUnit: '2.5' }))).toEqual({
      ok: true,
      value: { mode: 'activity_count', inputs: { activity_count: 4, unit_scale: 2.5 } },
    });
    expect(parseNewMissionScale(form({ scaleMode: 'activity_count', scaleActivityCount: '2.5', scaleUnit: '1' }))).toEqual({
      ok: false,
      error: 'The number of activities must be a whole number.',
    });
    expect(parseNewMissionScale(form({ scaleMode: 'activity_count', scaleActivityCount: '3' }))).toEqual({ ok: false, error: 'Enter the scale per activity.' });
  });

  it('refuses linked and unknown modes, which need the Lifecycle and scale panel', () => {
    for (const scaleMode of ['linked', 'formula']) {
      expect(parseNewMissionScale(form({ scaleMode }))).toEqual({ ok: false, error: 'Choose how the mission is weighted.' });
    }
  });
});
