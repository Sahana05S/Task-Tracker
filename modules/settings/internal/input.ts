import { ISO_DATE_PATTERN, readString, UUID_PATTERN } from '@/shared/forms/form-data';
import { TASK_CATEGORIES, TASK_PRIORITIES } from '@/shared/tracker/enums';
import type { Json } from '@/types/database';

import { SETTINGS_SECTIONS, STANDING_SCALE_MODES, type SettingsSection } from './rules';

/**
 * Parses a Company settings form: `section`, `expectedVersion`, `operationId`
 * and the section's `payload` JSON. PRIVATE. These checks give friendly
 * messages; `company_settings_command` enforces the same rules.
 */

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export interface SettingsCommandInput {
  section: SettingsSection;
  payload: Record<string, Json>;
  expectedVersion: number;
  operationId: string;
}

const PREFIX = /^[A-Z][A-Z0-9]{0,5}$/;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const order = (value: unknown, fallback: number) => (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 999 ? (value as number) : fallback);

export function parseSettingsCommand(form: FormData): Parsed<SettingsCommandInput> {
  const section = readString(form, 'section') as SettingsSection;
  if (!(SETTINGS_SECTIONS as readonly string[]).includes(section)) return { ok: false, error: 'Unknown settings section.' };
  const version = readString(form, 'expectedVersion');
  const expectedVersion = Number(version);
  const operationId = readString(form, 'operationId');
  if (!/^\d{1,15}$/.test(version) || !UUID_PATTERN.test(operationId)) {
    return { ok: false, error: 'Reload the page and try again.' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readString(form, 'payload') || 'null');
  } catch {
    return { ok: false, error: 'The form could not be read. Reload and try again.' };
  }
  const payload = PARSERS[section](raw);
  if (!payload.ok) return payload;
  return { ok: true, value: { section, payload: payload.value, expectedVersion, operationId } };
}

const PARSERS: Record<SettingsSection, (raw: unknown) => Parsed<Record<string, Json>>> = {
  agenda(raw) {
    const agenda = isRecord(raw) && typeof raw.agenda === 'string' ? raw.agenda : null;
    if (agenda === null || agenda.length > 4000) return { ok: false, error: 'Keep the agenda under 4000 characters.' };
    return { ok: true, value: { agenda } };
  },

  categories(raw) {
    if (!isRecord(raw) || !Array.isArray(raw.entries)) return { ok: false, error: 'Mission types could not be read.' };
    const overrides: Record<string, Json> = {};
    let active = 0;
    for (const [index, entry] of raw.entries.entries()) {
      if (!isRecord(entry) || !(TASK_CATEGORIES as readonly unknown[]).includes(entry.code)) return { ok: false, error: 'Unknown mission type.' };
      const label = text(entry.label);
      if (label.length < 1 || label.length > 60) return { ok: false, error: `Give ${String(entry.code)} a name of 1-60 characters.` };
      const isActive = entry.active !== false;
      if (isActive) active += 1;
      overrides[String(entry.code)] = { label, active: isActive, sort: index };
    }
    if (active === 0) return { ok: false, error: 'Keep at least one mission type in use.' };
    return { ok: true, value: { overrides } };
  },

  meeting_types(raw) {
    if (!isRecord(raw) || !Array.isArray(raw.types) || raw.types.length > 40) return { ok: false, error: 'Up to 40 meeting types.' };
    const types: Json[] = [];
    const seen = new Set<string>();
    for (const [index, entry] of raw.types.entries()) {
      if (!isRecord(entry)) return { ok: false, error: 'Meeting types could not be read.' };
      const prefix = text(entry.prefix).toUpperCase();
      const name = text(entry.name);
      if (!PREFIX.test(prefix)) return { ok: false, error: `Prefix "${prefix || '(empty)'}": use 1-6 capital letters or digits, starting with a letter.` };
      if (name.length < 1 || name.length > 60) return { ok: false, error: `Give the ${prefix} meeting type a name of 1-60 characters.` };
      for (const key of [`p:${prefix}`, `n:${name.toLowerCase()}`]) {
        if (seen.has(key)) return { ok: false, error: `Each meeting type needs its own prefix and name (${key.startsWith('p:') ? prefix : name} is repeated).` };
        seen.add(key);
      }
      types.push({ ...(UUID_PATTERN.test(text(entry.id)) ? { id: text(entry.id) } : {}), prefix, name, sort: index, active: entry.active !== false });
    }
    return { ok: true, value: { types } };
  },

  standing_missions(raw) {
    if (!isRecord(raw) || !Array.isArray(raw.missions) || raw.missions.length > 60) return { ok: false, error: 'Up to 60 standing missions.' };
    const missions: Json[] = [];
    for (const [index, entry] of raw.missions.entries()) {
      if (!isRecord(entry)) return { ok: false, error: 'Standing missions could not be read.' };
      const titlePattern = text(entry.titlePattern);
      if (titlePattern.length < 1 || titlePattern.length > 200) return { ok: false, error: 'Give every standing mission a title of 1-200 characters.' };
      if (/[{}]/.test(titlePattern.replace(/\{(month|member)\}/g, ''))) return { ok: false, error: `"${titlePattern}": only {month} and {member} can go in braces.` };
      if (!(TASK_CATEGORIES as readonly unknown[]).includes(entry.category)) return { ok: false, error: `Choose a mission type for "${titlePattern}".` };
      if (!(TASK_PRIORITIES as readonly unknown[]).includes(entry.priority)) return { ok: false, error: `Choose a priority for "${titlePattern}".` };
      if (!(STANDING_SCALE_MODES as readonly unknown[]).includes(entry.scaleMode)) return { ok: false, error: `Choose how "${titlePattern}" is weighted.` };
      const ownerMode = entry.ownerMode === 'single' ? 'single' : 'per_member';
      const ownerId = ownerMode === 'single' && UUID_PATTERN.test(text(entry.ownerId)) ? text(entry.ownerId) : null;
      missions.push({
        ...(UUID_PATTERN.test(text(entry.id)) ? { id: text(entry.id) } : {}),
        titlePattern,
        category: entry.category as string,
        priority: entry.priority as string,
        ownerMode,
        ownerId,
        scaleMode: entry.scaleMode as string,
        sort: order(entry.sort, index),
        active: entry.active !== false,
      });
    }
    return { ok: true, value: { missions } };
  },

  holidays(raw) {
    if (!isRecord(raw) || !Array.isArray(raw.holidays) || raw.holidays.length > 1000) return { ok: false, error: 'Up to 1000 holidays.' };
    const holidays: Json[] = [];
    const seen = new Set<string>();
    for (const entry of raw.holidays) {
      if (!isRecord(entry)) return { ok: false, error: 'Holidays could not be read.' };
      const date = text(entry.date);
      const name = text(entry.name);
      if (!ISO_DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return { ok: false, error: 'Pick a date for every holiday.' };
      if (name.length < 1 || name.length > 120) return { ok: false, error: `Name the holiday on ${date} (up to 120 characters).` };
      if (seen.has(date)) return { ok: false, error: `${date} is listed twice; keep one holiday per date.` };
      seen.add(date);
      holidays.push({ date, name });
    }
    holidays.sort((a, b) => String((a as { date: string }).date).localeCompare(String((b as { date: string }).date)));
    return { ok: true, value: { holidays } };
  },
};
