import { describe, expect, it } from 'vitest';

import { endOfKolkataDay, monthBounds, periodQuery, selectionFromAsOf, selectionInstant } from '@/shared/time/period-selection';

const NOW = new Date('2026-10-22T08:30:00.000Z'); // 22 Oct, 14:00 India time

describe('period picker query', () => {
  it('sends only the month for "latest", dropping any old as-of and keeping other parameters', () => {
    expect(periodQuery({ month: '2026-09', mode: 'latest', date: '', time: '' }, { tab: 'month', asOf: 'x' }, NOW)).toBe('tab=month&period=2026-09');
  });

  it('sends the last instant of the chosen day for "end of a day"', () => {
    expect(endOfKolkataDay('2026-10-20')).toBe('2026-10-20T18:29:59.999Z');
    expect(periodQuery({ month: '2026-10', mode: 'endOfDay', date: '2026-10-20', time: '' }, {}, NOW)).toBe('period=2026-10&asOf=2026-10-20T18%3A29%3A59.999Z');
  });

  it('sends a custom India time as an instant', () => {
    expect(selectionInstant({ month: '2026-10', mode: 'custom', date: '2026-10-21', time: '09:30' })).toBe('2026-10-21T04:00:00.000Z');
    expect(selectionInstant({ month: '2026-10', mode: 'custom', date: '2026-10-21', time: '9:30' })).toBeNull();
  });

  it('reads latest instead of asking for a moment that has not happened', () => {
    expect(periodQuery({ month: '2026-10', mode: 'endOfDay', date: '2026-10-22', time: '' }, {}, NOW)).toBe('period=2026-10');
    expect(periodQuery({ month: '2026-10', mode: 'custom', date: '2026-10-22', time: '15:00' }, {}, NOW)).toBe('period=2026-10');
  });
});

describe('period picker bounds and starting state', () => {
  it('keeps chosen days inside the month and before now', () => {
    expect(monthBounds('2026-10', NOW)).toEqual({ first: '2026-10-01', last: '2026-10-31', lastStarted: '2026-10-22', lastEnded: '2026-10-21' });
    expect(monthBounds('2026-09', NOW)).toMatchObject({ lastStarted: '2026-09-30', lastEnded: '2026-09-30' });
    expect(monthBounds('2026-02', NOW).last).toBe('2026-02-28');
  });

  it('recognises the default read as latest and explicit reads as what was asked', () => {
    expect(selectionFromAsOf('2026-10', '2026-10-22T08:29:55.000Z', NOW).mode).toBe('latest');
    expect(selectionFromAsOf('2026-09', endOfKolkataDay('2026-09-30'), NOW).mode).toBe('latest');
    expect(selectionFromAsOf('2026-10', endOfKolkataDay('2026-10-15'), NOW)).toMatchObject({ mode: 'endOfDay', date: '2026-10-15' });
    expect(selectionFromAsOf('2026-10', '2026-10-15T06:15:00.000Z', NOW)).toMatchObject({ mode: 'custom', date: '2026-10-15', time: '11:45' });
  });
});
