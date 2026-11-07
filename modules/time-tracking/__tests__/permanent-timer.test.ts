import { describe, expect, it } from 'vitest';

import { canStartTimerForTask } from '@/modules/time-tracking/internal/timers/permissions';

/* Migration 135: only the Crew times a permanent mission; managers keep timing normal ones. */
describe('permanent mission timer', () => {
  const md = { id: 'md', role: 'managing_director' as const, isActive: true };
  const crew = { id: 'crew', role: 'team_member' as const, isActive: true };
  const base = { assigneeId: 'crew', assigneeIds: ['crew'], status: 'In Progress' as const, archivedEffectiveDate: null };

  it('offers the timer to the Crew only on a permanent mission', () => {
    expect(canStartTimerForTask(crew, { ...base, isPermanent: true })).toBe(true);
    expect(canStartTimerForTask(md, { ...base, isPermanent: true })).toBe(false);
    expect(canStartTimerForTask(md, { ...base, isPermanent: false })).toBe(true);
  });
});
