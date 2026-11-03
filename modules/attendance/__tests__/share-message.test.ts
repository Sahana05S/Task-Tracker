import { describe, expect, it } from 'vitest';

import { CHECK_IN_NOTES, checkInMessage, checkOutMessage, firstName, greetingFor, noteFor } from '../client';
import { whatsappHref } from '@/shared/ui/share-link';

/** An instant at an India wall-clock time (IST is UTC+05:30, no daylight saving). */
const ist = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);

describe('greetingFor', () => {
  it('switches at 12:00 and 17:00 India time', () => {
    expect(greetingFor(ist('2026-11-03', '11:59')).greeting).toBe('Good morning');
    expect(greetingFor(ist('2026-11-03', '12:00')).greeting).toBe('Good afternoon');
    expect(greetingFor(ist('2026-11-03', '16:59')).greeting).toBe('Good afternoon');
    expect(greetingFor(ist('2026-11-03', '17:00')).greeting).toBe('Good evening');
  });

  it('reads India time whatever the instant’s own zone', () => {
    // 04:00 UTC is 09:30 in India.
    expect(greetingFor(new Date('2026-11-03T04:00:00Z')).greeting).toBe('Good morning');
  });
});

describe('noteFor', () => {
  it('gives the same note all day and the next note the next day', () => {
    const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'];
    const notes = days.map(noteFor);
    for (let i = 1; i < notes.length; i++) expect(notes[i]).not.toBe(notes[i - 1]);
    expect(new Set(notes.slice(0, CHECK_IN_NOTES.length)).size).toBe(CHECK_IN_NOTES.length);
    expect(notes[CHECK_IN_NOTES.length]).toBe(notes[0]);
  });
});

describe('firstName', () => {
  it('takes the name up to the first space', () => {
    expect(firstName('Sahana S')).toBe('Sahana');
    expect(firstName('  Harish Chakravarthy I ')).toBe('Harish');
    expect(firstName('Aishwarya')).toBe('Aishwarya');
  });
});

describe('checkInMessage', () => {
  it('greets, gives the check-in time and date, and ends with the day’s note', () => {
    const at = ist('2026-11-03', '09:12').toISOString();
    const lines = checkInMessage('Sahana S', at).split('\n');
    expect(lines[0]).toBe('Good morning, team! ☀️');
    expect(lines[1]).toBe('Sahana checked in at 9:12 AM · Tue 3 Nov.');
    expect(lines[2]).toBe(noteFor('2026-11-03'));
  });
});

describe('checkOutMessage', () => {
  it('puts both times above the daily report', () => {
    const text = checkOutMessage(ist('2026-11-03', '09:12').toISOString(), ist('2026-11-03', '18:40').toISOString(), '*Daily report · Sahana S*\nTuesday');
    expect(text).toBe('Checked in at 9:12 AM · checked out at 6:40 PM.\n\n*Daily report · Sahana S*\nTuesday');
  });

  it('still says when the day ended if the report could not be read', () => {
    expect(checkOutMessage(ist('2026-11-03', '09:12').toISOString(), ist('2026-11-03', '18:40').toISOString(), '')).toBe('Checked in at 9:12 AM · checked out at 6:40 PM.');
  });
});

describe('whatsappHref', () => {
  it('opens WhatsApp with the whole message and no recipient', () => {
    const text = 'Good morning, team! ☀️\nA & B #1 · 50%?';
    const href = whatsappHref(text);
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(href.slice('https://wa.me/?text='.length))).toBe(text);
    // Newlines, & and # would cut the message short if left raw.
    expect(href.slice('https://wa.me/?text='.length)).not.toMatch(/[\n&#]/);
  });
});
