import { describe, expect, it } from 'vitest';
import { parseChecklistCommand } from '../internal/input';

function submission(priority = '2') {
  const form = new FormData();
  Object.entries({ command: 'submission', taskId: 'task', expectedVersion: '4',
    operationId: 'operation', checklist_id: 'owned', title: 'Prepare handoff',
    description: 'Review deliverables', section: 'activity', parent_id: '', priority,
  }).forEach(([key, value]) => form.set(key, value));
  return form;
}

describe('Sub-mission command contract', () => {
  it('sends the owning checklist and priority without unsupported row detail fields', () => {
    const form = submission();
    form.set('links', 'https://example.com');
    form.set('estimated_minutes', '15');
    const parsed = parseChecklistCommand(form);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.payload).toEqual({ title: 'Prepare handoff', description: 'Review deliverables',
      section: 'activity', parent_id: null, checklist_id: 'owned', priority: 2 });
  });

  it('rejects priority outside the supported ordering range', () => {
    expect(parseChecklistCommand(submission('4'))).toEqual({ ok: false, error: 'Choose a priority from 0 to 3.' });
  });

  it('preserves ordinary item links and estimates', () => {
    const form = submission();
    form.set('command', 'add');
    form.set('links', 'https://example.com');
    form.set('estimated_minutes', '15');
    const parsed = parseChecklistCommand(form);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.payload.links).toEqual(['https://example.com']);
    expect(parsed.value.payload.estimated_minutes).toBe(15);
  });
});
