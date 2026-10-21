import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/modules/time-tracking/timer-actions', () => ({ startTaskTimer: vi.fn(), stopTaskTimer: vi.fn() }));

import { RunningTimerProvider } from '@/modules/time-tracking/components/running-timer-context';
import { TimerButton, timerCommandForm } from '@/modules/time-tracking/components/timer-button';
import type { RunningTimer } from '@/modules/time-tracking/client';

const timer: RunningTimer = {
  id: 'timer-1', executionVersion: 3, startedAt: '2026-10-21T04:00:00.000Z',
  taskId: 'task-a', taskTag: 'TT-1', taskTitle: 'Site survey',
};

function render(taskId: string, running: RunningTimer[]) {
  const button = createElement(TimerButton, { taskId, taskLabel: taskId === 'task-a' ? 'TT-1' : 'TT-2' });
  return renderToStaticMarkup(createElement(RunningTimerProvider, { timers: running, children: button }));
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

  it('is unavailable, with the reason, on every other mission', () => {
    const html = render('task-b', [timer]);
    expect(html).toContain('data-state="blocked"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('title="Your timer is running on TT-1. Stop it there first."');
  });

  it('starts by mission id and stops by timer id and version', () => {
    expect(Object.fromEntries(timerCommandForm(null, 'task-b'))).toEqual({ taskId: 'task-b' });
    expect(Object.fromEntries(timerCommandForm(timer, 'task-a'))).toEqual({ timerId: 'timer-1', expectedVersion: '3' });
  });
});
