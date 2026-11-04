import { describe, expect, it } from 'vitest';

import { checkOutMessage, formatTimeBlocks, timeBlockDay, type BlockSession, type BreakTimes } from '@/modules/attendance/client';

const DATE = '2026-11-04';
const at = (hhmm: string) => `${DATE}T${hhmm}:00+05:30`;
const BREAKS: BreakTimes = { morningTeaAt: '11:00', lunchStart: '13:00', lunchEnd: '14:00', eveningTeaAt: '16:00' };
const A = { taskId: 'a', taskTag: 'Nov26_A1', taskTitle: 'Elevation' };
const B = { taskId: 'b', taskTag: 'Nov26_B2', taskTitle: 'Site survey' };
const session = (mission: typeof A, start: string, end: string | null): BlockSession => ({ ...mission, start: at(start), end: end === null ? null : at(end) });
const HOUR = 3600;

function day(sessions: BlockSession[], breaks = BREAKS, checkIn = '09:00', checkOut = '18:00') {
  return timeBlockDay({ date: DATE, checkedInAt: at(checkIn), checkedOutAt: at(checkOut), breaks, sessions, manual: [] });
}

describe('check-out report in four time blocks (user decision, 4 November 2026)', () => {
  it('splits the day at morning tea, lunch and evening tea, with lunch not counted', () => {
    const result = day([session(A, '09:00', '18:00')]);
    expect(result.blocks.map((b) => [b.label, b.productiveSeconds / HOUR])).toEqual([
      ['Check-in to morning tea', 2], ['Morning tea to lunch', 2], ['Lunch to evening tea', 2], ['Evening tea to check-out', 2],
    ]);
    expect(result.productiveSeconds).toBe(8 * HOUR);
  });

  it('lists each mission with its clipped time and merges overlapping timers in the block total', () => {
    const result = day([session(A, '09:00', '13:00'), session(B, '11:00', '14:00')]);
    const [first, second, third] = result.blocks;
    expect(first.missions.map((m) => [m.taskTag, m.seconds / HOUR])).toEqual([['Nov26_A1', 2]]);
    expect(second.missions.map((m) => [m.taskTag, m.seconds / HOUR])).toEqual([['Nov26_A1', 2], ['Nov26_B2', 2]]);
    expect(second.productiveSeconds).toBe(2 * HOUR);
    expect(third.missions).toEqual([]); // B's 13:00-14:00 was lunch
    expect(result.productiveSeconds).toBe(4 * HOUR);
  });

  it('skips blocks wholly before check-in or after check-out and clips the edges', () => {
    const result = day([session(A, '12:00', '15:00')], BREAKS, '12:00', '15:00');
    expect(result.blocks.map((b) => b.label)).toEqual(['Morning tea to lunch', 'Lunch to evening tea']);
    expect(result.blocks[0].start).toBe(Date.parse(at('12:00')));
    expect(result.blocks[1].end).toBe(Date.parse(at('15:00')));
    expect(result.productiveSeconds).toBe(2 * HOUR);
  });

  it('joins the blocks on either side of a break that is not set', () => {
    const noTea = day([session(A, '09:00', '18:00')], { ...BREAKS, morningTeaAt: null, eveningTeaAt: null });
    expect(noTea.blocks.map((b) => b.label)).toEqual(['Check-in to lunch', 'Lunch to check-out']);
    expect(noTea.productiveSeconds).toBe(8 * HOUR);
    const noLunch = day([session(A, '09:00', '18:00')], { ...BREAKS, lunchStart: null, lunchEnd: null });
    expect(noLunch.blocks.map((b) => b.label)).toEqual(['Check-in to morning tea', 'Morning tea to evening tea', 'Evening tea to check-out']);
    expect(noLunch.productiveSeconds).toBe(9 * HOUR);
  });

  it('counts a timer still running up to check-out and leaves out time outside the day', () => {
    const result = day([session(A, '08:00', '10:00'), session(B, '17:00', null)]);
    expect(result.productiveSeconds).toBe(2 * HOUR); // 09:00-10:00 and 17:00-18:00
  });

  it('formats WhatsApp text with each block, the day total and manual entries', () => {
    const text = formatTimeBlocks(timeBlockDay({ date: DATE, checkedInAt: at('09:00'), checkedOutAt: at('17:30'), breaks: BREAKS,
      sessions: [session(A, '09:00', '13:00'), session(B, '11:00', '14:00')], manual: [{ ...B, hours: 1.5 }] }));
    expect(text).toContain('*Check-in to morning tea* (9:00 AM – 11:00 AM)');
    expect(text).toContain('• Nov26_A1 Elevation · 2 h 00 m');
    expect(text).toContain('Productive: 2 h 00 m');
    expect(text).toContain('No timers ran.');
    expect(text).toContain('*Productive hours today · 4 h 00 m*');
    expect(text).toContain('*Logged without times · 1 h 30 m*');
    expect(checkOutMessage(at('09:00'), at('17:30'), 'Report', text)).toMatch(/^Checked in at 9:00 AM · checked out at 5:30 PM\.\n\n\*Check-in to morning tea\*[\s\S]*\n\nReport$/);
  });
});
