import { describe, expect, it } from 'vitest';

import type { Person } from '@/modules/records/internal/activity-mapping';
import { groupMissionHistory, type MissionHistoryRow } from '@/modules/records/internal/mission-history-mapping';

const ASHA = '11111111-1111-4111-8111-111111111111';
const people = new Map<string, Person>([[ASHA, { id: ASHA, fullName: 'Asha', employeeId: 'EMP-4' }]]);
let next = 0;
const row = (over: Partial<MissionHistoryRow>): MissionHistoryRow => ({
  id: ++next, occurred_at: '2026-10-23T05:00:00.000001+00:00', actor_id: ASHA, command: 'UPDATE', table_name: 'tasks',
  row_id: 't1', fields: null, changes: null, payload: null, label: null, reason: null, ...over,
});

describe('mission change log', () => {
  it('names the checklist answer and lists every value the action changed', () => {
    const [change] = groupMissionHistory([
      row({ command: 'checklist_state', table_name: 'task_checklists', payload: { state: 'Yes' }, label: 'Site survey' }),
      row({ table_name: 'checklist_nodes', label: 'Site survey', fields: ['completion_state', 'is_complete', 'updated_at'],
        changes: { completion_state: { before: 'No', after: 'Yes' }, is_complete: { before: false, after: true } } }),
      row({ fields: ['progress_percentage', 'metric_version'], changes: { progress_percentage: { before: 40, after: 60 } } }),
      row({ fields: ['work_revision'], changes: { work_revision: { before: 57, after: 58 } } }),
    ], people);
    expect(change).toMatchObject({
      actor: 'Asha',
      headline: 'Marked “Site survey” Yes',
      lines: ['Row “Site survey” · Answer: No → Yes', 'Progress: 40% → 60%'],
    });
  });

  it('words a timer start and stop as separate actions, newest first', () => {
    const changes = groupMissionHistory([
      row({ occurred_at: '2026-10-23T06:20:00+00:00', command: 'stop_timer', table_name: 'task_timers', payload: {} }),
      row({ occurred_at: '2026-10-23T06:20:00+00:00', table_name: 'task_timers', fields: ['elapsed_seconds', 'status', 'stopped_at'],
        changes: { status: { before: 'Running', after: 'Stopped' }, elapsed_seconds: { before: 0, after: 4800 }, stopped_at: { before: null, after: '2026-10-23T06:20:00+00:00' } } }),
      row({ occurred_at: '2026-10-23T06:20:00+00:00', command: 'INSERT', table_name: 'daily_task_logs',
        fields: ['hours_worked', 'progress_delta', 'update_notes', 'user_id'],
        changes: { hours_worked: { before: null, after: 1.33 }, progress_delta: { before: null, after: 10 }, update_notes: { before: null, after: 'Drawings' } } }),
      row({ occurred_at: '2026-10-23T05:00:00+00:00', command: 'INSERT', table_name: 'task_timers', fields: ['started_at', 'status'],
        changes: { started_at: { before: null, after: '2026-10-23T05:00:00+00:00' }, status: { before: null, after: 'Running' } } }),
    ], people);
    expect(changes.map((change) => change.headline)).toEqual(['Stopped the timer and logged the time', 'Started the timer']);
    expect(changes[0].lines).toEqual([
      'Timer · Time: 0 min → 1 h 20 min',
      'Timer · Status: Running → Stopped',
      'Timer · Stopped: empty → 23 Oct 2026, 11:50 am',
      'Logged time',
      'Time log · Hours: 1.33 h',
      'Time log · Progress added: 10%',
      'Time log · Notes: “Drawings”',
    ]);
    expect(changes[1].lines).toEqual(['Started: 23 Oct 2026, 10:30 am']);
  });

  it('shows before and after of a plain edit and names fields whose old values were not kept', () => {
    const [edit] = groupMissionHistory([
      row({ fields: ['due_date', 'title'], changes: { due_date: { before: '2026-10-01', after: '2026-10-05' }, title: { before: 'Survey', after: 'Site survey' } } }),
    ], people);
    expect(edit).toMatchObject({ headline: 'Edited the mission', lines: ['Due date: 01 Oct 2026 → 05 Oct 2026', 'Title: “Survey” → “Site survey”'] });
    const [old] = groupMissionHistory([row({ fields: ['description', 'status'], changes: { status: { before: 'Not Started', after: 'In Progress' } } })], people);
    expect(old.lines).toEqual(['Description changed', 'Status: Not Started → In Progress']);
  });
});
