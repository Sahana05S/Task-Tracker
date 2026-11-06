import { describe, expect, it, vi } from 'vitest';

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/shared/supabase/server', () => ({ createClient: async () => ({ rpc, from }) }));

import { getActivity } from '@/modules/records';
import { activityCsv, activityFilter, cursorParam, mapActivity, parseCursor, type ActivityRow, type Person } from '@/modules/records/internal/activity-mapping';

const ASHA = '11111111-1111-4111-8111-111111111111';
const DIRECTOR = '22222222-2222-4222-8222-222222222222';
const people = new Map<string, Person>([
  [ASHA, { id: ASHA, fullName: 'Asha', employeeId: 'EMP-4' }],
  [DIRECTOR, { id: DIRECTOR, fullName: 'Dev', employeeId: 'EMP-1' }],
]);
const row = (over: Partial<ActivityRow>): ActivityRow => ({
  id: 'audit:1', occurred_at: '2026-10-20T10:00:00Z', kind: 'missions', action: 'UPDATE', actor_id: DIRECTOR, subject_user_id: null,
  task_id: null, task_tag: null, record_kind: null, record_id: null, fields: null, reason: null, period: null, ...over,
});

describe('activity wording and links', () => {
  it('words a review of someone else\'s record and links its history', () => {
    const entry = mapActivity(row({ kind: 'records', action: 'validate', subject_user_id: ASHA, record_kind: 'fact', record_id: 'f1', reason: ' Checked ' }), people);
    expect(entry).toMatchObject({ summary: 'Reviewed a daily fact', actor: 'Dev', about: 'Asha', href: '/records/fact/f1/history', linkLabel: 'History', reason: 'Checked' });
  });

  it('names the objective and shows what changed (migration 128)', () => {
    const renamed = mapActivity(row({ action: 'checklist_edit', record_kind: 'task_checklists', task_tag: 'T1', detail: 'Survey the north site',
      changes: { title: { before: 'Survey the site', after: 'Survey the north site' } } }), people);
    expect([renamed.summary, renamed.detail, renamed.changes]).toEqual(['Edited a checklist objective', 'Survey the north site',
      [{ label: 'Title', before: 'Survey the site', after: 'Survey the north site' }]]);
    const ticked = mapActivity(row({ action: 'checklist_state', record_kind: 'task_checklists', detail: 'Call the client', changes: { state: { before: 'No', after: 'Yes' } } }), people);
    expect(ticked.changes).toEqual([{ label: 'Tick', before: 'Not done', after: 'Done' }]);
    // A removal sends the row's title as its reason; it is not repeated beside the detail.
    const removed = mapActivity(row({ action: 'checklist_delete', record_kind: 'task_checklists', detail: 'Call the client', reason: 'Call the client' }), people);
    expect([removed.detail, removed.reason]).toEqual(['Call the client', null]);
    const due = mapActivity(row({ record_kind: 'tasks', fields: ['due_date'], changes: { due_date: { before: '2026-11-10', after: '2026-11-14' } } }), people);
    expect(due.changes).toEqual([{ label: 'Due date', before: '10 Nov 2026', after: '14 Nov 2026' }]);
    expect(activityCsv([renamed])).toContain('Edited a checklist objective: Survey the north site; Title: Survey the site → Survey the north site');
    // Older databases send neither column.
    expect(mapActivity(row({ action: 'checklist_add', record_kind: 'task_checklists' }), people)).toMatchObject({ detail: null, changes: [] });
  });

  it('names changed mission fields in plain words and links the mission', () => {
    const entry = mapActivity(row({ record_kind: 'tasks', task_tag: 'Oct26_T3', fields: ['due_date', 'priority'] }), people);
    expect(entry).toMatchObject({ summary: "Changed the mission's due date, priority", href: '/tasks/Oct26_T3', linkLabel: 'Oct26_T3', about: null });
  });

  it('words row changes by table, commands by prefix, and unknown codes readably', () => {
    expect(mapActivity(row({ action: 'INSERT', record_kind: 'task_assignees', subject_user_id: ASHA }), people).summary).toBe('Added a member to the Mission Crew');
    expect(mapActivity(row({ action: 'checklist_state', record_kind: 'task_checklists' }), people).summary).toBe('Updated a checklist objective');
    const reviewed = mapActivity(row({ action: 'checklist_review', record_kind: 'task_checklists', reason: 'Work needed: Add the site photo' }), people);
    expect([reviewed.summary, reviewed.reason]).toEqual(['Reviewed a checklist objective', 'Work needed: Add the site photo']);
    expect(mapActivity(row({ action: 'checklist_something_new', record_kind: 'task_checklists' }), people).summary).toBe('Checklist: something new');
    expect(mapActivity(row({ action: 'task_tools_bulk_done', record_kind: 'tool_previews' }), people).summary).toBe('Marked missions done');
    expect(mapActivity(row({ action: 'save_task_with_participants', record_kind: 'tasks', task_tag: 'T1' }), people).summary).toBe('Saved the mission and its assignees');
    expect(mapActivity(row({ action: 'transition', record_kind: 'tasks', task_tag: 'T1' }), people).summary).toBe("Changed the mission's status");
    expect(mapActivity(row({ kind: 'company', action: 'some_new_command', record_kind: 'x' }), people).summary).toBe('Some new command');
  });

  it('words time, month and people rows and links where there is a place to go', () => {
    expect(mapActivity(row({ kind: 'time', action: 'reverse_log', actor_id: ASHA, subject_user_id: ASHA, task_tag: 'T1', record_kind: 'log' }), people))
      .toMatchObject({ summary: 'Reversed a time log', about: null, href: '/tasks/T1' });
    expect(mapActivity(row({ kind: 'month', action: 'month_close', period: '2026-09-01' }), people))
      .toMatchObject({ summary: 'Closed the month', href: '/reports?tab=month&period=2026-09' });
    expect(mapActivity(row({ kind: 'people', action: 'deactivate_member', record_kind: 'users', subject_user_id: ASHA }), people))
      .toMatchObject({ summary: 'Deactivated a member', about: 'Asha', href: '/team/EMP-4', linkLabel: 'Profile' });
  });

  it('words each Settings > Company save and links its section (migration 59)', () => {
    const save = (section: string) => mapActivity(row({ kind: 'company', action: `company_settings_${section}`, record_kind: 'organization_settings', fields: null }), people);
    expect(save('agenda')).toMatchObject({ summary: 'Changed the meeting agenda', href: '/settings?tab=company#agenda', linkLabel: 'Company settings' });
    expect(save('categories')).toMatchObject({ summary: 'Changed the mission types', href: '/settings?tab=company#mission-types' });
    expect(save('meeting_types')).toMatchObject({ summary: 'Changed the meeting types', href: '/settings?tab=company#meeting-types' });
    expect(save('standing_missions')).toMatchObject({ summary: 'Changed the standing missions', href: '/settings?tab=company#standing-missions' });
    expect(save('holidays')).toMatchObject({ summary: 'Changed the holiday calendar', href: '/settings?tab=company#holidays' });
    expect(save('something_new')).toMatchObject({ summary: 'Changed company settings', href: '/settings?tab=company' });
  });

  it('words label changes, names the label and links the mission or the label directory (migration 116)', () => {
    expect(mapActivity(row({ kind: 'company', action: 'label_create', record_kind: 'labels', reason: '#Crane' }), people))
      .toMatchObject({ summary: 'Created a label', reason: '#Crane', href: '/labels', linkLabel: 'Labels' });
    expect(mapActivity(row({ kind: 'company', action: 'label_rename', record_kind: 'labels' }), people).summary).toBe('Renamed a label');
    expect(mapActivity(row({ kind: 'company', action: 'label_archive', record_kind: 'labels' }), people).summary).toBe('Archived a label');
    expect(mapActivity(row({ kind: 'company', action: 'label_restore', record_kind: 'labels' }), people).summary).toBe('Restored a label');
    expect(mapActivity(row({ action: 'label_link_attach', record_kind: 'label_links', task_tag: 'Nov26_PJT3', reason: '#Crane' }), people))
      .toMatchObject({ summary: 'Added a label', reason: '#Crane', href: '/tasks/Nov26_PJT3', linkLabel: 'Nov26_PJT3' });
    expect(mapActivity(row({ action: 'label_link_detach', record_kind: 'label_links' }), people))
      .toMatchObject({ summary: 'Removed a label', href: '/labels' });
  });

  it('words notes with their hashtags (migration 126)', () => {
    expect(mapActivity(row({ action: 'mission_note_add', record_kind: 'mission_learnings', task_tag: 'Nov26_PJT3', reason: '#mistake #client' }), people))
      .toMatchObject({ summary: 'Added a note #mistake #client', reason: null, href: '/tasks/Nov26_PJT3' });
    expect(mapActivity(row({ action: 'mission_note_edit', record_kind: 'mission_learnings', reason: '#learning' }), people).summary).toBe('Edited a note #learning');
    expect(mapActivity(row({ action: 'mission_note_delete', record_kind: 'mission_learnings', reason: '#risk #site' }), people).summary).toBe('Deleted a note #risk #site');
    expect(mapActivity(row({ action: 'mission_learning_add', record_kind: 'mission_learnings' }), people).summary).toBe('Added a note');
    expect(mapActivity(row({ kind: 'company', action: 'label_note_type_on', record_kind: 'labels', reason: '#client' }), people).summary).toBe('Made a label a note type');
  });

  it('never shows an id for an unknown person', () => {
    expect(mapActivity(row({ actor_id: '33333333-3333-4333-8333-333333333333' }), people).actor).toBe('Former member');
  });
});

describe('activity filter and cursor', () => {
  const manager = { id: DIRECTOR, role: 'managing_director' as const };
  it('defaults to the last seven days and caps a range at 93 days', () => {
    expect(activityFilter({}, '2026-10-21', manager)).toEqual({ from: '2026-10-15', to: '2026-10-21', kind: null, member: null });
    expect(activityFilter({ from: '2026-01-01', to: '2026-10-21' }, '2026-10-21', manager).from).toBe('2026-07-21');
    expect(activityFilter({ from: '2026-10-21', to: '2026-10-01', kind: 'secrets' }, '2026-10-21', manager)).toMatchObject({ from: '2026-10-01', to: '2026-10-21', kind: null });
  });
  it('keeps members on themselves', () => {
    expect(activityFilter({ member: DIRECTOR, kind: 'records' }, '2026-10-21', { id: ASHA, role: 'team_member' })).toMatchObject({ member: ASHA, kind: 'records' });
    expect(activityFilter({ member: ASHA }, '2026-10-21', manager).member).toBe(ASHA);
  });
  it('round-trips a cursor and ignores a malformed one', () => {
    const cursor = { at: '2026-10-20T10:00:00.123+00:00', id: 'audit:0000000000000000042' };
    expect(parseCursor(cursorParam(cursor))).toEqual(cursor);
    expect(parseCursor('nonsense')).toBeNull();
    expect(parseCursor('not-a-date~audit:1')).toBeNull();
  });
});

describe('activity CSV', () => {
  it('writes Kolkata date and time and guards formula-like text', () => {
    const entry = mapActivity(row({ kind: 'records', action: 'save', actor_id: ASHA, subject_user_id: ASHA, record_kind: 'fact', record_id: 'f1', reason: '=HYPERLINK("x")' }), people);
    const [header, line] = activityCsv([entry]).split('\r\n');
    expect(header).toBe('"Date","Time (Asia/Kolkata)","Kind","Who","What","About","Reason","Link"');
    expect(line).toBe(`"2026-10-20","15:30","Records","Asha","Saved a daily fact","","'=HYPERLINK(""x"")","/records/fact/f1/history"`);
  });
});

describe('getActivity', () => {
  const users = { select: async () => ({ data: [{ id: ASHA, full_name: 'Asha', employee_id: 'EMP-4' }], error: null }) };
  it('reports a database without migration 54 as not available', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    from.mockReturnValueOnce(users);
    await expect(getActivity({ from: '2026-10-15', to: '2026-10-21', kind: null, member: null }, null, 50)).resolves.toEqual({ available: false });
  });
  it('asks for one extra row and returns the cursor of the last shown row', async () => {
    const rows = [row({ id: 'a:3', occurred_at: '2026-10-20T12:00:00Z' }), row({ id: 'a:2', occurred_at: '2026-10-20T11:00:00Z' }), row({ id: 'a:1' })];
    rpc.mockResolvedValueOnce({ data: rows, error: null });
    from.mockReturnValueOnce(users);
    const page = await getActivity({ from: '2026-10-15', to: '2026-10-21', kind: 'missions', member: null }, { at: '2026-10-21T00:00:00Z', id: 'z' }, 2);
    expect(rpc).toHaveBeenLastCalledWith('activity_feed', expect.objectContaining({ p_kind: 'missions', p_limit: 3, p_before: { at: '2026-10-21T00:00:00Z', id: 'z' } }));
    expect(page).toMatchObject({ available: true, next: { at: '2026-10-20T11:00:00Z', id: 'a:2' } });
    expect(page.available && page.entries.map((entry) => entry.id)).toEqual(['a:3', 'a:2']);
  });
  it('throws on any other database failure', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Members can only list their own activity' } });
    from.mockReturnValueOnce(users);
    await expect(getActivity({ from: '2026-10-15', to: '2026-10-21', kind: null, member: null }, null, 50)).rejects.toThrow('Activity unavailable');
  });
});

describe('ActivityLog', () => {
  it('groups by Kolkata day, keeps filters in links, and pages with Older and Newest', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { ActivityLog } = await import('@/modules/records/components/activity-log');
    const entries = [
      mapActivity(row({ id: 'a:2', occurred_at: '2026-10-20T19:00:00Z', kind: 'time', action: 'create_log', actor_id: ASHA, subject_user_id: ASHA, task_tag: 'T1', record_kind: 'log' }), people),
      mapActivity(row({ id: 'a:1', occurred_at: '2026-10-20T10:00:00Z', kind: 'records', action: 'validate', subject_user_id: ASHA, record_kind: 'fact', record_id: 'f1' }), people),
    ];
    const html = renderToStaticMarkup(createElement(ActivityLog, {
      filter: { from: '2026-10-15', to: '2026-10-21', kind: 'records', member: ASHA },
      page: { available: true, entries, next: { at: '2026-10-20T10:00:00Z', id: 'a:1' }, people: [...people.values()] },
      paged: true,
      canChooseMember: true,
    }));
    expect(html.indexOf('21 Oct 2026')).toBeGreaterThan(-1);
    expect(html.indexOf('21 Oct 2026')).toBeLessThan(html.indexOf('20 Oct 2026'));
    expect(html).toContain('href="/api/records/activity?from=2026-10-15&amp;to=2026-10-21&amp;kind=records&amp;member=' + ASHA + '"');
    expect(html).toContain('before=2026-10-20T10%3A00%3A00Z%7Ea%3A1');
    expect(html).toContain('>Newest<');
    expect(html).toContain('<option value="' + ASHA + '" selected="">Asha</option>');
    expect(html).toContain('aria-current="page"');
  });

  it('shows the not-available state alone when the database lacks the read', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { ActivityLog } = await import('@/modules/records/components/activity-log');
    const html = renderToStaticMarkup(createElement(ActivityLog, {
      filter: { from: '2026-10-15', to: '2026-10-21', kind: null, member: null }, page: { available: false }, paged: false, canChooseMember: true,
    }));
    expect(html).toContain('not available here yet');
    expect(html).not.toContain('<form');
  });
});
