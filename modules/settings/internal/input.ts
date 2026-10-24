import { ISO_DATE_PATTERN, readString, UUID_PATTERN } from '@/shared/forms/form-data';
import { TASK_CATEGORIES, TASK_PRIORITIES } from '@/shared/tracker/enums';
import type { Json } from '@/types/database';

import { BRANDING_URL_FIELDS, isBrandUrl, SETTINGS_SECTIONS, STANDING_SCALE_MODES, type SettingsSection } from './rules';

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

  departments(raw) {
    if (!isRecord(raw) || !Array.isArray(raw.departments) || raw.departments.length > 100) return { ok: false, error: 'Up to 100 departments.' };
    const departments: Json[] = [];
    const seen = new Set<string>();
    for (const [index, entry] of raw.departments.entries()) {
      if (!isRecord(entry)) return { ok: false, error: 'Departments could not be read.' };
      const name = text(entry.name);
      if (name.length < 1 || name.length > 60) return { ok: false, error: 'Give every department a name of 1-60 characters.' };
      if (seen.has(name.toLowerCase())) return { ok: false, error: `Each department needs its own name (${name} is repeated).` };
      seen.add(name.toLowerCase());
      // Saved departments keep their id; new rows send none and get one from the database.
      departments.push({ ...(UUID_PATTERN.test(text(entry.id)) ? { id: text(entry.id) } : {}), name, sort: index, active: entry.active !== false });
    }
    return { ok: true, value: { departments } };
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

  attendance(raw) {
    if (!isRecord(raw) || typeof raw.checkInEnabled !== 'boolean') return { ok: false, error: 'Attendance settings could not be read.' };
    const coordinate = (value: unknown) => (value === null || value === undefined || value === '' ? null : Number(value));
    const latitude = coordinate(raw.officeLatitude), longitude = coordinate(raw.officeLongitude);
    if ((latitude === null) !== (longitude === null)) return { ok: false, error: 'Give both the office latitude and longitude, or neither.' };
    if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) return { ok: false, error: 'The office latitude must be between -90 and 90.' };
    if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) return { ok: false, error: 'The office longitude must be between -180 and 180.' };
    const radius = Number(raw.officeRadiusM), days = Number(raw.photoRetentionDays);
    if (!Number.isInteger(radius) || radius < 20 || radius > 5000) return { ok: false, error: 'The office radius must be 20 to 5000 metres.' };
    if (!Number.isInteger(days) || days < 7 || days > 730) return { ok: false, error: 'Keep photos for 7 to 730 days.' };
    return { ok: true, value: { checkInEnabled: raw.checkInEnabled, officeLatitude: latitude, officeLongitude: longitude, officeRadiusM: radius, photoRetentionDays: days } };
  },

  mission_defaults(raw) {
    if (!isRecord(raw) || !(STANDING_SCALE_MODES as readonly unknown[]).includes(raw.scaleMode)) {
      return { ok: false, error: 'Choose how new missions are weighted.' };
    }
    return { ok: true, value: { scaleMode: raw.scaleMode as string } };
  },

  branding(raw) {
    if (!isRecord(raw) || Object.keys(raw).some((key) => !(BRANDING_URL_FIELDS as readonly string[]).includes(key))) {
      return { ok: false, error: 'Branding could not be read.' };
    }
    const value: Record<string, Json> = {};
    for (const key of BRANDING_URL_FIELDS) {
      if (raw[key] !== undefined && raw[key] !== null && typeof raw[key] !== 'string') return { ok: false, error: 'Branding could not be read.' };
      const url = text(raw[key]);
      if (url && !isBrandUrl(url)) return { ok: false, error: 'Each logo address must start with / (a file of this site) or https://, up to 500 characters.' };
      value[key] = url || null;
    }
    return { ok: true, value };
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
