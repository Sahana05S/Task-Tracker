import { describe, expect, it } from 'vitest';

import { joinNames, mapMissionActivity, type MissionActivityRow } from '@/modules/records/internal/mission-activity-mapping';

const MD = 'md', PADMA = 'padma', SAHANA = 'sahana', ASHA = 'asha';
const names = new Map([[MD, 'Director'], [PADMA, 'Padmapriya'], [SAHANA, 'Sahana'], [ASHA, 'Asha']]);
const AT = '2026-11-05T05:00:00Z';
const row = (over: Partial<MissionActivityRow>): MissionActivityRow => ({
  id: `audit:${Math.random()}`, occurred_at: AT, action: 'INSERT', actor_id: MD, subject_user_id: null,
  record_kind: 'tasks', record_id: null, fields: null, changes: null, detail: null, role: null, reason: null, ...over,
});

describe('mission activity wording', () => {
  it('joins names', () => {
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A and B');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
  });

  it('merges the people one save added into one named line', () => {
    const entries = mapMissionActivity([
      row({ record_kind: 'task_assignees', subject_user_id: PADMA, role: 'Collaborator', changes: { share_units: { after: 500000 } } }),
      row({ record_kind: 'task_assignees', subject_user_id: SAHANA, role: 'Collaborator' }),
      row({ record_kind: 'task_reviewers', subject_user_id: ASHA, role: 'Observer' }),
    ], names);
    expect(entries.map((e) => [e.summary, e.actor])).toEqual([
      ['Padmapriya and Sahana were added to the Mission Crew', 'Director'],
      ['Asha was added as an observer', 'Director'],
    ]);
    expect(entries[0].changes).toEqual([]);
  });

  it('keeps separate saves and removals apart', () => {
    const entries = mapMissionActivity([
      row({ record_kind: 'task_assignees', action: 'DELETE', subject_user_id: PADMA }),
      row({ record_kind: 'task_assignees', subject_user_id: SAHANA, occurred_at: '2026-11-04T05:00:00Z' }),
      row({ action: 'task_people_remove_observer', subject_user_id: ASHA }),
      row({ action: 'task_people_add_crew', subject_user_id: 'gone' }),
    ], names);
    expect(entries.map((e) => e.summary)).toEqual([
      'Padmapriya was removed from the Crew',
      'Sahana was added to the Mission Crew',
      'Asha is no longer an observer',
      'Former member was added to the Mission Crew',
    ]);
  });

  it('shows before and after values for shares, scale and mission fields', () => {
    const [share, scale, due] = mapMissionActivity([
      row({ record_kind: 'task_assignees', action: 'UPDATE', subject_user_id: ASHA, changes: { share_units: { before: 1000000, after: 333334 }, assignment_role: { before: 'Owner', after: 'Owner' } } }),
      row({ action: 'scale', changes: { scale: { before: 10, after: 12 } }, reason: 'Bigger scope', occurred_at: '2026-11-05T04:00:00Z' }),
      row({ action: 'UPDATE', fields: ['due_date', 'title'], changes: { due_date: { before: '2026-11-03', after: '2026-11-10' }, title: { before: 'Calls', after: 'Marketing calls' } }, occurred_at: '2026-11-05T03:00:00Z' }),
    ], names);
    expect(share.summary).toBe("Asha's Crew share changed");
    expect(share.changes).toEqual([{ label: 'Share', before: '100%', after: '33.3%' }]);
    expect([scale.summary, scale.reason, scale.changes]).toEqual(["Set the mission's scale", 'Bigger scope', [{ label: 'Scale', before: '10', after: '12' }]]);
    expect(due.summary).toBe("Changed the mission's due date, title");
    expect(due.changes.map((c) => `${c.label}: ${c.before} -> ${c.after}`)).toEqual(['Due date: 3 Nov 2026 -> 10 Nov 2026', 'Title: Calls -> Marketing calls']);
  });

  it('names files, objectives and labels without repeating the name as a reason', () => {
    const entries = mapMissionActivity([
      row({ action: 'task_proof_add', record_kind: 'task_proofs', detail: 'Site photo.pdf', reason: 'Site photo.pdf', role: 'proof' }),
      row({ action: 'task_proof_withdraw', record_kind: 'task_proofs', detail: 'Plan.docx', reason: 'Plan.docx', role: 'input' }),
      row({ action: 'checklist_state', record_kind: 'task_checklists', detail: 'Call the client' }),
      row({ action: 'checklist_assign', record_kind: 'task_checklists', detail: 'Prospecting', subject_user_id: PADMA }),
      row({ action: 'label_link_attach', record_kind: 'label_links', reason: '#Crane' }),
      row({ action: 'mission_note_add', record_kind: 'mission_learnings', detail: 'Foundation', reason: '#risk #site' }),
      row({ action: 'mission_learning_withdraw', record_kind: 'mission_learnings', reason: 'mistake' }),
      row({ action: 'INSERT', record_kind: 'tasks' }),
    ], names);
    expect(entries.map((e) => [e.summary, e.detail, e.reason])).toEqual([
      ['Added a proof', 'Site photo.pdf', null],
      ['Removed an Input document', 'Plan.docx', null],
      ['Updated a checklist objective', 'Call the client', null],
      ['Padmapriya owns the Quest', 'Prospecting', null],
      ['Added a label', null, '#Crane'],
      ['Added a note #risk #site', 'Foundation', null],
      ['Deleted a note #mistake', null, null],
      ['Created the mission', null, null],
    ]);
  });
});
