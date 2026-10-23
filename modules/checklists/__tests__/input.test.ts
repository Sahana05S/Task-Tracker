import { describe, expect, it } from 'vitest';
import { parseChecklistCommand } from '../internal/input';

function form(command: string, fields: Record<string, string>) {
  const data = new FormData();
  Object.entries({ command, taskId: 'task', expectedVersion: '4', operationId: 'operation', ...fields })
    .forEach(([key, value]) => data.set(key, value));
  return data;
}

describe('checklist command contract (one kind of row)', () => {
  it('adds a row under any row with only a title, section and parent', () => {
    const parsed = parseChecklistCommand(form('add', { checklist_id: 'list', title: 'Check beams', section: 'activity', parent_id: 'row-1', node_type: 'Page', linked_task_id: 'x' }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.payload).toEqual({ title: 'Check beams', description: null, section: 'activity', parent_id: 'row-1', checklist_id: 'list' });
  });

  it('no longer offers Sub-missions or section reviews', () => {
    expect(parseChecklistCommand(form('submission', { title: 'x', section: 'activity' }))).toEqual({ ok: false, error: 'Unknown checklist action.' });
    expect(parseChecklistCommand(form('section', { section: 'setup', intentional_empty: 'true', reason: 'x' }))).toEqual({ ok: false, error: 'Unknown checklist action.' });
  });

  it('rejects priority outside the supported ordering range', () => {
    expect(parseChecklistCommand(form('add', { title: 'x', section: 'activity', priority: '4' }))).toEqual({ ok: false, error: 'Choose a priority from 0 to 3.' });
  });

  it('keeps a row\'s link and type when it moves or is edited', () => {
    const parsed = parseChecklistCommand(form('edit', { node_id: 'row-2', section: 'activity', parent_id: 'row-1', linked_task_id: 'mission', node_type: 'Item', reason: 'belongs there' }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.payload).toEqual({ node_id: 'row-2', title: null, section: 'activity', parent_id: 'row-1', linked_task_id: 'mission', node_type: 'Item', reason: 'belongs there' });
  });

  it('preserves links and estimates', () => {
    const parsed = parseChecklistCommand(form('add', { title: 'x', section: 'activity', links: 'https://example.com', estimated_minutes: '15' }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.payload.links).toEqual(['https://example.com']);
    expect(parsed.value.payload.estimated_minutes).toBe(15);
  });
});
