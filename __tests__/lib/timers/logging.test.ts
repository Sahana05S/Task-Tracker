import { describe, expect, it } from 'vitest';

import { createTimerLogDraft } from '@/lib/timers/logging';

describe('createTimerLogDraft', () => {
  it('creates a daily log draft from stopped timer timestamps', () => {
    expect(
      createTimerLogDraft({
        startedAt: new Date('2026-10-02T09:00:00.000Z'),
        stoppedAt: new Date('2026-10-02T10:15:00.000Z'),
        notes: 'Site visit follow-up',
      }),
    ).toEqual({
      logDate: '2026-10-02',
      hoursWorked: 1.25,
      elapsedSeconds: 4500,
      updateNotes: 'Site visit follow-up',
    });
  });

  it('falls back to a generated timer note when notes are blank', () => {
    expect(
      createTimerLogDraft({
        startedAt: new Date('2026-10-02T09:00:00.000Z'),
        stoppedAt: new Date('2026-10-02T09:30:00.000Z'),
        notes: '   ',
      }).updateNotes,
    ).toBe(
      'Timer session from 2026-10-02T09:00:00.000Z to 2026-10-02T09:30:00.000Z.',
    );
  });
});
