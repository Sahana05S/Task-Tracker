import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buildPresentation, compiledLogs, dailyReport, dailyReportText, reportsTab, viewContext, type LivePresentation } from '@/modules/reports/client';
import { DailyReportView } from '@/modules/reports/components/daily-report';
import type { DailyTaskLog } from '@/types/tracker';

// The M11 fixture: October 2026 as of the 13th; member 04 has T1 (undated) and
// M11-SYNTHETIC (due 20 Oct), and one log on the 13th.
const response = JSON.parse(readFileSync('__tests__/fixtures/m11-fresh-context.json', 'utf-8'));
const view = viewContext(response.sources.periodStart.slice(0, 7), response.sources.asOf, new Date(response.sources.asOf));
const MEMBER = '00000000-0000-0000-0000-000000000004';
const base = () => buildPresentation(response, view, MEMBER);

function withLogs(model: LivePresentation, logs: DailyTaskLog[]): LivePresentation {
  return { ...model, logs };
}

function log(n: number, date: string, overrides: Partial<DailyTaskLog> = {}): DailyTaskLog {
  const template = base().logs[0];
  return { ...template, id: `log-${date}-${n}`, logDate: date, hoursWorked: 0.5, updateNotes: `Update ${n}`, createdAt: `${date}T0${n % 10}:00:00Z`, ...overrides };
}

describe('dailyReportText', () => {
  it('uses WhatsApp bold for the title and each section, with the member name', () => {
    const text = dailyReportText(base(), MEMBER, '2026-10-13');
    const lines = text.split('\n');
    expect(lines[0]).toBe('*Daily report · user4*');
    expect(lines[1]).toBe('Tuesday, 13 October 2026');
    expect(text).toMatch(/^\*Today, 13 Oct · 1\.00 h\*$/m);
    expect(text).toMatch(/^\*Yesterday, 12 Oct · 0\.00 h\*$/m);
    expect(text).toContain('*Open missions (2)*');
  });

  it('says so when a day has no logs, and never shows contribution counts', () => {
    const text = dailyReportText(withLogs(base(), []), MEMBER, '2026-10-13');
    expect(text).toMatch(/^\*Today, 13 Oct · 0\.00 h\*\nNo task logs\.$/m);
    expect(text).toMatch(/^\*Yesterday, 12 Oct · 0\.00 h\*\nNo task logs\.$/m);
    expect(text).not.toMatch(/fact|idea|suggestion|sale/i);
  });

  it('lists eight logs per day, then "(n more)", and the hours still count every log', () => {
    const logs = Array.from({ length: 11 }, (_, n) => log(n, '2026-10-13'));
    const text = dailyReportText(withLogs(base(), logs), MEMBER, '2026-10-13');
    const today = text.slice(text.indexOf('*Today'), text.indexOf('*Yesterday'));
    expect(today.match(/^• /gm)).toHaveLength(8);
    expect(today).toContain('(3 more)');
    expect(today).toContain('· 5.50 h*');
  });

  it('lists missions by due date, undated last, with progress and "no due date"', () => {
    const text = dailyReportText(base(), MEMBER, '2026-10-13');
    const missions = text.slice(text.indexOf('*Open missions'));
    expect(missions.indexOf('M11-SYNTHETIC')).toBeLessThan(missions.indexOf('T1'));
    expect(missions).toMatch(/• T1 · .+\n {2}(\d+%|Progress not set) · no due date/);
    expect(missions).toContain('due 20 Oct');
  });

  it('keeps lines short: long notes are cut with an ellipsis', () => {
    const long = 'Reconciled the site survey drawings against the structural engineer comments for block B and updated the BOQ';
    const text = dailyReportText(withLogs(base(), [log(1, '2026-10-13', { updateNotes: long })]), MEMBER, '2026-10-13');
    const note = text.split('\n').find((line) => line.startsWith('  Reconciled'))!;
    expect(note.length).toBeLessThanOrEqual(82);
    expect(note.endsWith('…')).toBe(true);
  });

  it('marks yesterday as outside the month on the 1st, and is empty for an unknown member', () => {
    expect(dailyReportText(base(), MEMBER, '2026-10-01')).toContain('Not in this month’s tracker.');
    expect(dailyReportText(base(), 'nobody', '2026-10-13')).toBe('');
  });

  it("only uses the member's own logs", () => {
    const other = log(1, '2026-10-13', { userId: '00000000-0000-0000-0000-000000000005', hoursWorked: 7 });
    const report = dailyReport(withLogs(base(), [log(2, '2026-10-13'), other]), MEMBER, '2026-10-13')!;
    expect(report.today.hours).toBe(0.5);
  });
});

describe('daily report read model', () => {
  it('compiles logs inside the inclusive range, newest first', () => {
    const logs = [log(1, '2026-10-02'), log(2, '2026-10-05'), log(3, '2026-10-09')];
    expect(compiledLogs(withLogs(base(), logs), MEMBER, '2026-10-02', '2026-10-05').map((l) => l.logDate)).toEqual(['2026-10-05', '2026-10-02']);
  });

  it('sorts logs without a creation time (as the live presentation returns them)', () => {
    const logs = [log(1, '2026-10-05'), log(2, '2026-10-05'), log(3, '2026-10-06')].map((l) => ({ ...l, createdAt: undefined as unknown as string }));
    expect(compiledLogs(withLogs(base(), logs), MEMBER, '2026-10-01', '2026-10-13').map((l) => l.logDate)).toEqual(['2026-10-06', '2026-10-05', '2026-10-05']);
  });

  it('reads validity per day up to the report day from recorded attendance', () => {
    const report = dailyReport(base(), MEMBER, '2026-10-05')!;
    expect(report.validity.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
    expect(report.validity.every((d) => ['valid', 'invalid', 'unavailable'].includes(d.state))).toBe(true);
  });

  it('lists missions open on the report day, not as they stand now', () => {
    const m = base();
    const [t1, t2] = m.tasks.filter((t) => t.assigneeIds.includes(MEMBER));
    const tasks = [
      { ...t1, assignedDate: '2026-10-01', status: 'Done' as const, completedDate: '2026-10-12' },
      { ...t2, assignedDate: '2026-10-11' },
    ];
    const open = (date: string) => dailyReport({ ...m, tasks }, MEMBER, date)!.openMissions.map((t) => t.id);
    expect(open('2026-10-10')).toEqual([t1.id]); // finished later; the other was assigned later
    expect(open('2026-10-11').sort()).toEqual([t1.id, t2.id].sort());
    expect(open('2026-10-12')).toEqual([t2.id]); // finished that day
  });

  it('chooses the Reports tab: daily by default, month for month links', () => {
    expect(reportsTab({})).toBe('daily');
    expect(reportsTab({ tab: 'month' })).toBe('month');
    expect(reportsTab({ period: '2026-09' })).toBe('month');
    expect(reportsTab({ revision: '2' })).toBe('month');
    expect(reportsTab({ tab: 'daily', period: '2026-09' })).toBe('daily');
  });
});

describe('DailyReportView', () => {
  const render = (canPickMember: boolean) => renderToStaticMarkup(createElement(DailyReportView, { model: base(), memberId: MEMBER, date: '2026-10-13', from: '2026-10-01', to: '2026-10-13', maxDate: '2026-10-13', canPickMember }));

  it('renders the day, open missions, compilation, validity and the share panel', () => {
    const html = render(false);
    for (const text of ['Share as text', 'Copy text', 'Message preview', 'Open missions · 2', 'Task logs compilation', 'Report validity', 'Today · 1.00 h', 'name="date"', 'name="from"', 'name="to"']) expect(html).toContain(text);
    expect(html).toContain('<strong>Daily report · user4</strong>');
  });

  it('offers the member picker to managers only', () => {
    expect(render(false)).not.toContain('name="member"');
    expect(render(true)).toContain('name="member"');
    expect(render(true)).toContain('value="TEST-4" selected=""');
  });
});
