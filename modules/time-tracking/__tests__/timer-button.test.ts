import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/modules/time-tracking/timer-actions', () => ({ startTaskTimer: vi.fn(), startItemTimer: vi.fn(), stopTaskTimer: vi.fn() }));

import { RunningTimerProvider } from '@/modules/time-tracking/components/running-timer-context';
import { TimerButton, timerCommandForm } from '@/modules/time-tracking/components/timer-button';
import { questTree, runningTimerLabel, type RunningTimer } from '@/modules/time-tracking/client';

const timer: RunningTimer = {
  id: 'timer-1', executionVersion: 3, startedAt: '2026-10-21T04:00:00.000Z',
  taskId: 'task-a', taskTag: 'TT-1', taskTitle: 'Site survey',
};

function render(taskId: string, running: RunningTimer[], quest?: { nodeId: string; questTitle: string }, questMissionIds?: string[]) {
  const button = createElement(TimerButton, { taskId, taskLabel: taskId === 'task-a' ? 'TT-1' : 'TT-2', ...quest });
  return renderToStaticMarkup(createElement(RunningTimerProvider, { timers: running, questMissionIds, children: button }));
}

describe('timer button', () => {
  it('offers Start when no timer is running', () => {
    const html = render('task-a', []);
    expect(html).toContain('data-state="idle"');
    expect(html).toContain('aria-label="Start timer on TT-1"');
    expect(html).toContain('Start timer');
    expect(html).not.toContain('aria-disabled');
  });

  it('offers Stop with a clock on the running mission', () => {
    const html = render('task-a', [timer]);
    expect(html).toContain('data-state="running"');
    expect(html).toContain('aria-label="Stop timer on TT-1"');
    expect(html).toContain('Stop');
  });

  it('offers Start on every other mission while one runs (several timers at once, migration 118)', () => {
    const html = render('task-b', [timer]);
    expect(html).toContain('data-state="idle"');
    expect(html).toContain('aria-label="Start timer on TT-2"');
    expect(html).not.toContain('aria-disabled');
  });

  it('offers Stop on each running mission when several run', () => {
    const other: RunningTimer = { ...timer, id: 'timer-2', taskId: 'task-b', taskTag: 'TT-2', taskTitle: 'Drawings' };
    expect(render('task-a', [timer, other])).toContain('aria-label="Stop timer on TT-1"');
    expect(render('task-b', [timer, other])).toContain('aria-label="Stop timer on TT-2"');
  });

  it('starts by mission id and stops by timer id and version', () => {
    expect(Object.fromEntries(timerCommandForm(null, 'task-b'))).toEqual({ taskId: 'task-b' });
    expect(Object.fromEntries(timerCommandForm(timer, 'task-a'))).toEqual({ timerId: 'timer-1', expectedVersion: '3' });
  });

  it('sends the session note from the Stop sheet (D-C2)', () => {
    expect(Object.fromEntries(timerCommandForm(timer, 'task-a', 'Drew the elevation'))).toEqual({ timerId: 'timer-1', expectedVersion: '3', notes: 'Drew the elevation' });
  });

  describe('Quest timers (migration 123)', () => {
    const survey = { nodeId: 'quest-1', questTitle: 'Survey' };
    const drawings = { nodeId: 'quest-2', questTitle: 'Drawings' };
    const onSurvey: RunningTimer = { ...timer, id: 'timer-q1', nodeId: 'quest-1', questTitle: 'Survey' };

    it('names the Quest and starts by Quest id', () => {
      expect(render('task-a', [], survey, ['task-a'])).toContain('aria-label="Start timer on TT-1 › Survey"');
      expect(Object.fromEntries(timerCommandForm(null, 'task-a', undefined, 'quest-1'))).toEqual({ nodeId: 'quest-1' });
    });

    it('keys the running timer by mission and Quest: one person can time two Quests at once', () => {
      expect(render('task-a', [onSurvey], survey, ['task-a'])).toContain('aria-label="Stop timer on TT-1 › Survey"');
      expect(render('task-a', [onSurvey], drawings, ['task-a'])).toContain('aria-label="Start timer on TT-1 › Drawings"');
    });

    it('hides the mission timer on a mission with Quests, unless a mission timer is still running', () => {
      expect(render('task-a', [], undefined, ['task-a'])).toBe('');
      expect(render('task-a', [onSurvey], undefined, ['task-a'])).toBe('');
      expect(render('task-a', [timer], undefined, ['task-a'])).toContain('aria-label="Stop timer on TT-1"');
      expect(render('task-a', [], undefined, ['task-b'])).toContain('aria-label="Start timer on TT-1"');
    });

    it('labels running timers "TAG › Quest"', () => {
      expect(runningTimerLabel(onSurvey)).toBe('TT-1 › Survey');
      expect(runningTimerLabel(timer)).toBe('TT-1');
    });

    it('lists Quests with their sub-Quests in reading order', () => {
      const q = (nodeId: string, parentQuestId: string | null) => ({ nodeId, ownedChecklistId: `list-${nodeId}`, parentQuestId, checklistId: 'c', title: nodeId, assigneeId: null, ownSeconds: 0, totalSeconds: 0 });
      const tree = questTree([q('a', null), q('b', null), q('a1', 'a'), q('a1x', 'a1'), q('orphan', 'gone')]);
      expect(tree.map(({ quest, depth }) => `${quest.nodeId}:${depth}`)).toEqual(['a:0', 'a1:1', 'a1x:2', 'b:0', 'orphan:0']);
    });
  });
});
