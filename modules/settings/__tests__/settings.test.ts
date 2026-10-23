import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  agendaLines,
  buildCategoryCatalogue,
  categoryChoices,
  categoryLabelMap,
  formatSheetTag,
  meetingTypeChoices,
  renderTitlePattern,
  type MeetingType,
} from '@/modules/settings/client';
import { parseCompanySettings } from '@/modules/settings/internal/rules';
import { parseSettingsCommand } from '@/modules/settings/internal/input';
import { CompanySettingsProvider } from '@/modules/settings/components/company-settings-context';
import { MeetingTypeSelect } from '@/modules/settings/components/meeting-type-select';
import { MeetingAgenda } from '@/modules/settings/components/meeting-agenda';
import { CATEGORY_LABELS, TASK_CATEGORIES } from '@/shared/tracker/enums';
import type { Task } from '@/types/tracker';

const TYPES: MeetingType[] = [
  { id: 'a', prefix: 'DL', name: 'Daily', sort: 0, active: true },
  { id: 'b', prefix: 'WL', name: 'Weekly', sort: 1, active: true },
  { id: 'c', prefix: 'QTL', name: 'Quarterly', sort: 2, active: false },
];

function withSettings(node: ReactNode, overrides = {}, meetingTypes: MeetingType[] = TYPES) {
  return renderToStaticMarkup(createElement(CompanySettingsProvider, { catalogue: buildCategoryCatalogue(overrides), meetingTypes, defaultScaleMode: 'manual', children: node }));
}

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}
const OP = '11111111-1111-4111-8111-111111111111';

describe('mission type catalogue', () => {
  it('keeps the built-in codes, labels and order without overrides', () => {
    const catalogue = buildCategoryCatalogue();
    expect(catalogue.map((entry) => entry.code)).toEqual([...TASK_CATEGORIES]);
    expect(catalogue.every((entry) => entry.active && entry.label === CATEGORY_LABELS[entry.code])).toBe(true);
  });

  it('applies company labels, hidden flags and order', () => {
    const catalogue = buildCategoryCatalogue({ PJT: { label: 'Project Task', sort: -1 }, MKT: { active: false }, T: { label: '  ' } });
    expect(catalogue[0]).toMatchObject({ code: 'PJT', label: 'Project Task' });
    expect(catalogue.find((entry) => entry.code === 'MKT')?.active).toBe(false);
    expect(categoryLabelMap(catalogue).T).toBe('General Task');
  });

  it('hides inactive codes from choices except the one a mission already has', () => {
    const catalogue = buildCategoryCatalogue({ MKT: { active: false }, OT: { active: false } });
    expect(categoryChoices(catalogue).map((entry) => entry.code)).not.toContain('MKT');
    expect(categoryChoices(catalogue, 'MKT').map((entry) => entry.code)).toContain('MKT');
    expect(categoryChoices(catalogue, 'MKT').map((entry) => entry.code)).not.toContain('OT');
  });
});

describe('meeting type select', () => {
  it('lists active types as prefix and name, without hidden ones', () => {
    expect(meetingTypeChoices(TYPES).map((choice) => choice.label)).toEqual(['DL · Daily', 'WL · Weekly']);
  });

  it('keeps a saved value that left the list', () => {
    expect(meetingTypeChoices(TYPES, 'Quarterly').at(-1)).toEqual({ value: 'Quarterly', label: 'QTL · Quarterly (hidden)' });
    expect(meetingTypeChoices(TYPES, 'Board review').at(-1)).toEqual({ value: 'Board review', label: 'Board review (not in the list)' });
    expect(meetingTypeChoices(TYPES, 'Daily')).toHaveLength(2);
  });

  it('renders a select from the company list, and free text when none are set up', () => {
    const select = withSettings(createElement(MeetingTypeSelect, { defaultValue: 'Weekly' }));
    expect(select).toMatch(/<select name="meeting_type" required=""/);
    expect(select).toContain('<option value="Weekly" selected="">WL · Weekly</option>');
    expect(select).not.toContain('Quarterly');
    const text = withSettings(createElement(MeetingTypeSelect, { defaultValue: 'Weekly' }), {}, []);
    expect(text).not.toContain('<select');
    expect(text).toMatch(/<input[^>]*name="meeting_type"[^>]*value="Weekly"/);
  });
});

describe('agenda', () => {
  const AGENDA = 'Regular Meeting Agenda:\n\n1. Review Reports\n2. Raise Concerns\n3. Pitch in Ideas\n4. Share lessons learnt';
  it('drops blank lines', () => {
    expect(agendaLines(AGENDA)).toHaveLength(5);
  });
  it('renders the heading and numbered steps', () => {
    const html = renderToStaticMarkup(createElement(MeetingAgenda, { agenda: AGENDA, canEdit: false }));
    expect(html).toContain('Regular Meeting Agenda</h2>');
    expect(html.match(/<li /g)).toHaveLength(4);
    expect(html).toContain('Pitch in Ideas');
    expect(html).not.toContain('Edit agenda');
  });
  it('offers directors a way to add a missing agenda and hides it from others', () => {
    expect(renderToStaticMarkup(createElement(MeetingAgenda, { agenda: ' ', canEdit: true }))).toContain('/settings?tab=company#agenda');
    expect(renderToStaticMarkup(createElement(MeetingAgenda, { agenda: '', canEdit: false }))).toBe('');
  });
});

describe('sheet tags and title patterns', () => {
  it('formats tags like the database allocator (<Mon><YY>_<PREFIX><n>)', () => {
    expect(formatSheetTag(new Date(Date.UTC(2026, 8, 1)), 'OT', 1)).toBe('Sep26_OT1');
    expect(formatSheetTag(new Date(Date.UTC(2026, 10, 1)), 'PJT', 27)).toBe('Nov26_PJT27');
    expect(formatSheetTag(new Date(Date.UTC(2030, 0, 1)), 'T', 4)).toBe('Jan30_T4');
  });
  it('renders {month} and {member}', () => {
    expect(renderTitlePattern('Off Hours - {month} - {member}', new Date(Date.UTC(2026, 8, 1)), 'Vijayanath M')).toBe('Off Hours - September 2026 - Vijayanath M');
  });
});

describe('settings payload', () => {
  it('parses the database read defensively', () => {
    const parsed = parseCompanySettings({
      version: 3,
      meetingAgenda: 'x',
      categoryOverrides: { T: { label: 'General', active: true }, XX: { label: 'nope' } },
      meetingTypes: [{ id: 'a', prefix: 'DL', name: 'Daily', sort: 0, active: true }],
      holidays: [{ date: '2026-10-20', name: 'Diwali' }],
      standingMissions: [{ id: 'm', titlePattern: 'HRC Tasks - {month}', category: 'T', priority: 'Medium', ownerMode: 'single', ownerId: null, scaleMode: 'hours', sort: 0, active: true }, { category: 'ZZ' }],
    });
    expect(parsed.version).toBe(3);
    expect(Object.keys(parsed.categoryOverrides)).toEqual(['T']);
    expect(parsed.standingMissions).toHaveLength(1);
    expect(parseCompanySettings(null).meetingTypes).toEqual([]);
  });

  it('turns the mission-type list into ordered overrides and keeps one in use', () => {
    const entries = TASK_CATEGORIES.map((code) => ({ code, label: CATEGORY_LABELS[code], active: code !== 'MKT' }));
    const ok = parseSettingsCommand(form({ section: 'categories', expectedVersion: '2', operationId: OP, payload: JSON.stringify({ entries }) }));
    expect(ok.ok && ok.value.payload.overrides).toMatchObject({ SD: { sort: 0, active: true }, MKT: { active: false } });
    const none = TASK_CATEGORIES.map((code) => ({ code, label: 'x', active: false }));
    expect(parseSettingsCommand(form({ section: 'categories', expectedVersion: '2', operationId: OP, payload: JSON.stringify({ entries: none }) }))).toEqual({ ok: false, error: 'Keep at least one mission type in use.' });
  });

  it('refuses repeated meeting prefixes, stray placeholders and duplicate holidays', () => {
    const base = { expectedVersion: '0', operationId: OP };
    const types = parseSettingsCommand(form({ ...base, section: 'meeting_types', payload: JSON.stringify({ types: [{ prefix: 'dl', name: 'Daily' }, { prefix: 'DL', name: 'Other' }] }) }));
    expect(types.ok).toBe(false);
    const mission = { titlePattern: 'Review {week}', category: 'T', priority: 'Medium', ownerMode: 'per_member', scaleMode: 'hours' };
    expect(parseSettingsCommand(form({ ...base, section: 'standing_missions', payload: JSON.stringify({ missions: [mission] }) })).ok).toBe(false);
    const day = { date: '2026-10-20', name: 'Diwali' };
    expect(parseSettingsCommand(form({ ...base, section: 'holidays', payload: JSON.stringify({ holidays: [day, day] }) })).ok).toBe(false);
    expect(parseSettingsCommand(form({ ...base, section: 'holidays', payload: JSON.stringify({ holidays: [day] }) }))).toMatchObject({ ok: true, value: { payload: { holidays: [day] } } });
  });

  it('reads and saves the default scale mode for new missions', () => {
    expect(parseCompanySettings(null).defaultScaleMode).toBe('manual');
    expect(parseCompanySettings({ defaultScaleMode: 'hours' }).defaultScaleMode).toBe('hours');
    expect(parseCompanySettings({ defaultScaleMode: 'linked' }).defaultScaleMode).toBe('manual');
    const base = { section: 'mission_defaults', expectedVersion: '4', operationId: OP };
    expect(parseSettingsCommand(form({ ...base, payload: '{"scaleMode":"activity_count"}' }))).toMatchObject({ ok: true, value: { section: 'mission_defaults', payload: { scaleMode: 'activity_count' } } });
    for (const payload of ['{"scaleMode":"linked"}', '{}', '{"scaleMode":1}']) {
      expect(parseSettingsCommand(form({ ...base, payload }))).toEqual({ ok: false, error: 'Choose how new missions are weighted.' });
    }
  });

  it('needs a version and an operation id', () => {
    expect(parseSettingsCommand(form({ section: 'agenda', expectedVersion: '', operationId: OP, payload: '{"agenda":""}' })).ok).toBe(false);
    expect(parseSettingsCommand(form({ section: 'nope', expectedVersion: '0', operationId: OP, payload: '{}' })).ok).toBe(false);
  });
});
