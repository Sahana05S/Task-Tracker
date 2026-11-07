import { describe, expect, it } from 'vitest';

import {
  filterMeetings, groupMeetingsByMonth, mapMeetingDetail, mapMeetingSummary, nextPointStatus, type MeetingSummary,
} from '@/modules/support/client';

const meeting = (over: Partial<MeetingSummary>): MeetingSummary => ({
  id: 'm', title: 'Site review', date: '2026-11-05', startTime: null, meetingType: null, businessId: null, businessName: null, createdBy: null, state: 'active', createdAt: null,
  members: [], missions: [], openPoints: 0, pointCount: 0, labelIds: [], ...over,
});

describe('meetings (migration 136)', () => {
  it('maps the database rows and ignores malformed parts', () => {
    const summary = mapMeetingSummary({
      id: 'a', title: 'Weekly', date: '2026-11-05', startTime: '10:30', meetingType: 'Project Progress', state: 'active',
      members: [{ id: 'u1', name: 'Asha', active: true }, { name: 'no id' }], missions: [{ id: 't1', tag: 'T1', title: 'Lift' }],
      openPoints: 2, pointCount: '3', labelIds: ['l1', 4],
    });
    expect(summary).toMatchObject({ id: 'a', startTime: '10:30', openPoints: 2, pointCount: 3, labelIds: ['l1'] });
    expect(summary?.members).toEqual([{ id: 'u1', name: 'Asha', active: true }]);
    expect(mapMeetingSummary({ title: 'no id' })).toBeNull();
    const detail = mapMeetingDetail({ id: 'a', date: '2026-11-05', minutes: 'x', version: 4, canEdit: true,
      points: [{ id: 'p', point: 'Order rebar', status: 'Weird', version: 2, canWithdraw: true }] });
    expect(detail?.points[0]).toMatchObject({ id: 'p', status: 'Not Started', version: 2, canWithdraw: true });
    expect(detail?.canManage).toBe(false);
  });

  it('cycles a point with one tap: not started, in progress, done, back', () => {
    expect(nextPointStatus('Not Started')).toBe('In Progress');
    expect(nextPointStatus('In Progress')).toBe('Done');
    expect(nextPointStatus('Done')).toBe('Not Started');
    expect(nextPointStatus('Discarded')).toBe('Not Started');
  });

  it('filters by words, mission and label, and groups by month newest first', () => {
    const list = [
      meeting({ id: '1', date: '2026-11-05', title: 'Crane planning', missions: [{ id: 't1', tag: 'T1', title: 'Lift', status: null }], labelIds: ['l1'] }),
      meeting({ id: '2', date: '2026-11-01', title: 'Weekly', members: [{ id: 'u', name: 'Asha Rao', active: true }] }),
      meeting({ id: '3', date: '2026-10-20', title: 'Weekly' }),
    ];
    expect(filterMeetings(list, { search: 'asha weekly' }).map((m) => m.id)).toEqual(['2']);
    expect(filterMeetings(list, { search: 'lift' }).map((m) => m.id)).toEqual(['1']);
    expect(filterMeetings(list, { missionId: 't1' }).map((m) => m.id)).toEqual(['1']);
    expect(filterMeetings(list, { labelId: 'l1' }).map((m) => m.id)).toEqual(['1']);
    const withBusiness = [...list, meeting({ id: '4', businessId: 'b1' })];
    expect(filterMeetings(withBusiness, { businesses: { ids: ['b1'], none: false } }).map((m) => m.id)).toEqual(['4']);
    expect(filterMeetings(withBusiness, { businesses: { ids: [], none: true } }).map((m) => m.id)).toEqual(['1', '2', '3']);
    expect(filterMeetings(withBusiness, { businesses: null }).length).toBe(4);
    expect(groupMeetingsByMonth(list).map((g) => [g.label, g.meetings.map((m) => m.id)])).toEqual([
      ['November 2026', ['1', '2']], ['October 2026', ['3']],
    ]);
  });
});
