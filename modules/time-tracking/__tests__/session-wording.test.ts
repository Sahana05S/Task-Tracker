import { describe, expect, it } from 'vitest';

import { describeSessionEvent, mapSessionActivity, sessionSummary } from '@/modules/time-tracking/client';

const at = '2026-11-03T10:00:00Z';

describe('timer session report (migration 110)', () => {
  it('reads events and drops malformed entries', () => {
    const activity = mapSessionActivity({ timer_id: 't1', events: [
      { at, action: 'checklist_state', nodeTitle: 'Draw elevation', state: 'Yes' },
      { action: 'checklist_add' },
      'nonsense',
    ] });
    expect(activity).toEqual({ timerId: 't1', events: [{ at, action: 'checklist_state', nodeTitle: 'Draw elevation', state: 'Yes' }], nodeId: null, questTitle: null });
    expect(mapSessionActivity({ timer_id: 't3', events: [], node_id: 'q1', quest_title: 'Survey' })).toMatchObject({ nodeId: 'q1', questTitle: 'Survey' });
    expect(mapSessionActivity({ timer_id: 't2', events: null }).events).toEqual([]);
  });

  it('words checklist and mission commands', () => {
    expect(describeSessionEvent({ at, action: 'checklist_state', nodeTitle: 'Survey', state: 'N/A' })).toBe('marked “Survey” N/A');
    expect(describeSessionEvent({ at, action: 'checklist_add', nodeTitle: 'Survey', state: null })).toBe('added “Survey”');
    expect(describeSessionEvent({ at, action: 'checklist_delete', nodeTitle: null, state: null })).toBe('removed a row');
    expect(describeSessionEvent({ at, action: 'checklist_submission', nodeTitle: 'Drawings', state: null })).toBe('added the Quest “Drawings”');
    expect(describeSessionEvent({ at, action: 'transition', nodeTitle: null, state: null })).toBe('changed the status');
    expect(describeSessionEvent({ at, action: 'something_new', nodeTitle: null, state: null })).toBe('something new');
  });

  it('summarises a session in one sentence', () => {
    const e = (title: string) => ({ at, action: 'checklist_add', nodeTitle: title, state: null });
    expect(sessionSummary([])).toBeNull();
    expect(sessionSummary([e('A')])).toBe('During this session: added “A”.');
    expect(sessionSummary([e('A'), e('B')])).toBe('During this session: added “A” and added “B”.');
    expect(sessionSummary([e('A'), e('B'), e('C'), e('D'), e('E')])).toBe('During this session: added “A”, added “B”, added “C” and 2 more.');
  });
});
