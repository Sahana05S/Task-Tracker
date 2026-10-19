import { describe, expect, it } from 'vitest';
import { attachTaskParticipants, withTaskParticipants } from '@/modules/tasks/internal/mappers';
import type { Task } from '@/types/tracker';

const mission = (id: string, mode = 'configured'): Task => ({
  id, assigneeId: 'legacy-owner', reviewerId: 'legacy-reviewer',
  assigneeIds: ['legacy-owner'], reviewerIds: ['legacy-reviewer'],
  participantCreditMode: mode,
} as Task);

describe('participant read projection', () => {
  it('keeps configured shares and primary ordering independent for each mission', () => {
    const [a, b] = attachTaskParticipants([mission('a'), mission('b')], [
      { task_id: 'a', user_id: 'secondary', is_primary: false, share_units: 3 },
      { task_id: 'b', user_id: 'other', is_primary: true, share_units: 9 },
      { task_id: 'a', user_id: 'primary', is_primary: true, share_units: 7 },
    ], [{ task_id: 'a', user_id: 'reviewer', is_primary: true }]);
    expect(a.assigneeIds).toEqual(['primary', 'secondary']);
    expect(a.participantShares).toEqual({ secondary: 3, primary: 7 });
    expect(a.reviewerIds).toEqual(['legacy-reviewer', 'reviewer']);
    expect(b.assigneeIds).toEqual(['other']);
    expect(b.participantShares).toEqual({ other: 9 });
  });

  it('retains legacy fallback ownership without inventing configured shares', () => {
    const [a, b] = attachTaskParticipants([mission('a', 'legacy'), mission('b')], [
      { task_id: 'a', user_id: 'secondary', is_primary: false, share_units: null },
    ], []);
    expect(a.assigneeIds).toEqual(['legacy-owner', 'secondary']);
    expect(a.participantShares).toBeNull();
    expect(b.assigneeIds).toEqual(['legacy-owner']);
    expect(b.participantShares).toEqual({});
    expect(b.reviewerIds).toEqual(['legacy-reviewer']);
  });

  it('matches the earlier projection at scale without repeated share scans', () => {
    const tasks = Array.from({ length: process.env.TASKPULSE_BENCHMARK === '1' ? 10_000 : 1_000 }, (_, i) => mission(String(i)));
    const assignees = tasks.flatMap(task => [
      { task_id: task.id, user_id: 'primary', is_primary: true, share_units: 7 },
      { task_id: task.id, user_id: 'secondary', is_primary: false, share_units: 3 },
    ]);
    const before = performance.now();
    const old = tasks.map(task => withTaskParticipants({ ...task,
      participantShares: Object.fromEntries(assignees.filter(row => row.task_id === task.id).map(row => [row.user_id, row.share_units])),
    }, { assigneeIds: ['primary', 'secondary'], reviewerIds: undefined }));
    const oldMs = performance.now() - before;
    const after = performance.now();
    const current = attachTaskParticipants(tasks, assignees, []);
    const currentMs = performance.now() - after;
    expect(current).toEqual(old);
    if (process.env.TASKPULSE_BENCHMARK === '1') console.log(JSON.stringify({
      benchmark: 'participant-projection-only', missions: tasks.length,
      participantRows: assignees.length, beforeMs: oldMs, afterMs: currentMs,
      scope: 'in-memory synthetic mapping; not database or capacity evidence',
    }));
  }, 60_000);
});
