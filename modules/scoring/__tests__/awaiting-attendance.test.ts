import { describe, expect, it } from 'vitest';

import { awaitingAttendance } from '@/modules/scoring/client';

const member = (reasons: string[]) => ({ reasons }) as unknown as Parameters<typeof awaitingAttendance>[0]['members'][number];

describe('awaitingAttendance (last calculated figures, 28 Oct 2026)', () => {
  it('is true only when every member lacks attendance', () => {
    expect(awaitingAttendance({ members: [member(['attendance_unavailable']), member(['attendance_unavailable', 'sales:x'])] })).toBe(true);
    expect(awaitingAttendance({ members: [member(['attendance_unavailable']), member([])] })).toBe(false);
  });
  it('is false for an empty team or other reasons', () => {
    expect(awaitingAttendance({ members: [] })).toBe(false);
    expect(awaitingAttendance({ members: [member(['attendance_invalid'])] })).toBe(false);
  });
});
