import { describe, expect, it } from 'vitest';

import { mapRecordRevision } from '@/modules/records/internal/revisions';

const names = new Map([['u1', 'Kaviya'], ['u2', 'Harish']]);

describe('mapRecordRevision', () => {
  it('turns a reviewed attendance revision into readable facts', () => {
    const revision = mapRecordRevision({
      version: 3,
      command: 'validate',
      recordedAt: '2026-10-19T05:30:00Z',
      reason: 'Checked against the gate log',
      source: { user_id: 'u1', attendance_date: '2026-10-18', validation_state: 'validated', validated_by: 'u2', attendance_hours: 8, off_hours: '1.5', hours_confirmed: true },
    }, 'attendance', names);
    expect(revision).toMatchObject({
      version: '3',
      action: 'Reviewed',
      businessDate: '2026-10-18',
      author: 'Kaviya',
      reviewState: 'Validated',
      validator: 'Harish',
      attendance: { hours: 8, offHours: '1.5', measured: true },
      reason: 'Checked against the gate log',
      isLegacyBaseline: false,
    });
  });

  it('marks the legacy baseline and never shows a raw code', () => {
    const revision = mapRecordRevision({ version: 1, command: 'legacy_current_baseline', source: { idea_date: '2026-09-02', posted_by: 'missing', record_state: 'legacy_unvalidated', idea: 'Reuse formwork' } }, 'idea', names);
    expect(revision.isLegacyBaseline).toBe(true);
    expect(revision.action).not.toContain('_');
    expect(revision.reviewState).toBe('Earlier record, not reviewed');
    expect(revision.author).toBe('Not recorded');
    expect(revision.text).toBe('Reuse formwork');
    expect(revision.attendance).toBeNull();
  });

  it('humanises an unknown command and survives a malformed row', () => {
    expect(mapRecordRevision({ command: 'bulk_merge' }, 'fact', names).action).toBe('Bulk merge');
    const empty = mapRecordRevision(null, 'fact', names);
    expect(empty).toMatchObject({ version: '—', action: 'Changed', recordedAt: null, businessDate: null });
  });
});
