import { describe, expect, it } from 'vitest';
import { equalParticipantShares, parseSharePercent, readParticipantShares } from '@/lib/tasks/shares';

describe('approved participant credit representation', () => {
  it('uses exact integer thirds and stable UUID ordering', () => {
    expect(equalParticipantShares(['c', 'a', 'b'])).toEqual({ a: 333334, b: 333333, c: 333333 });
    expect(equalParticipantShares(['b', 'c', 'a'])).toEqual({ a: 333334, b: 333333, c: 333333 });
  });
  it('parses percentages without binary fractional rounding', () => {
    expect(parseSharePercent('33.3334')).toBe(333334);
    expect(parseSharePercent('0.0001')).toBe(1);
    expect(parseSharePercent('100')).toBe(1000000);
    for (const value of ['-1', '100.0001', '1e2', '0.00001', 'NaN', '']) expect(parseSharePercent(value)).toBeNull();
  });
  it('requires a complete exact total or all blank inputs', () => {
    const form = new FormData();
    expect(readParticipantShares(form, ['a','b'])).toBeNull();
    form.set('sharePercent:a','40');
    expect(() => readParticipantShares(form,['a','b'])).toThrow('every selected participant');
    form.set('sharePercent:b','60');
    expect(readParticipantShares(form,['a','b'])).toEqual([400000,600000]);
    form.set('sharePercent:b','59.9999');
    expect(() => readParticipantShares(form,['a','b'])).toThrow('100%');
  });
});
