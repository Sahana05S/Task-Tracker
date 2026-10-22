import { UUID_PATTERN } from '@/shared/forms/form-data';
import { CATEGORY_LABELS, TASK_CATEGORIES, TASK_PRIORITIES } from '@/shared/tracker/enums';
import type { TaskCategory, TaskPriority } from '@/types/tracker';

/**
 * Company settings contract and pure rules (migration 53). PRIVATE; client-safe,
 * re-exported through `client.ts`.
 *
 * The thirteen mission codes stay fixed in `shared/tracker/enums.ts` (tags and
 * scoring depend on them); a company only renames, hides and orders them.
 */

export interface CategoryOverride {
  label?: string;
  active?: boolean;
  sort?: number;
}
export type CategoryOverrides = Partial<Record<TaskCategory, CategoryOverride>>;

export interface CategoryEntry {
  code: TaskCategory;
  label: string;
  active: boolean;
  sort: number;
}

export interface MeetingType {
  id: string;
  prefix: string;
  name: string;
  sort: number;
  active: boolean;
}

export interface CompanyHoliday {
  date: string;
  name: string;
}

export type OwnerMode = 'per_member' | 'single';
export type StandingScaleMode = 'manual' | 'hours' | 'activity_count';
export const STANDING_SCALE_MODES = ['hours', 'manual', 'activity_count'] as const satisfies readonly StandingScaleMode[];

export interface StandingMission {
  id: string;
  titlePattern: string;
  category: TaskCategory;
  priority: TaskPriority;
  ownerMode: OwnerMode;
  /** Single owner; null means the managing director chosen at month setup. */
  ownerId: string | null;
  scaleMode: StandingScaleMode;
  sort: number;
  active: boolean;
}

export interface CompanySettings {
  /** Optimistic version; every saved section increments it. */
  version: number;
  updatedAt: string | null;
  meetingAgenda: string;
  categoryOverrides: CategoryOverrides;
  meetingTypes: MeetingType[];
  holidays: CompanyHoliday[];
  /** Managers only; empty for other roles. */
  standingMissions: StandingMission[];
}

export const SETTINGS_SECTIONS = ['agenda', 'categories', 'meeting_types', 'standing_missions', 'holidays'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** Settings before migration 53 (or a company that saved nothing): built-in labels, no lists. */
export const EMPTY_COMPANY_SETTINGS: CompanySettings = {
  version: 0,
  updatedAt: null,
  meetingAgenda: '',
  categoryOverrides: {},
  meetingTypes: [],
  holidays: [],
  standingMissions: [],
};

/** The thirteen codes with the company's labels, flags and order applied (stable by built-in order). */
export function buildCategoryCatalogue(overrides: CategoryOverrides = {}): CategoryEntry[] {
  return TASK_CATEGORIES.map((code, index) => {
    const override = overrides[code] ?? {};
    return {
      code,
      label: override.label?.trim() || CATEGORY_LABELS[code],
      active: override.active ?? true,
      sort: override.sort ?? index,
    };
  }).sort((a, b) => a.sort - b.sort || TASK_CATEGORIES.indexOf(a.code) - TASK_CATEGORIES.indexOf(b.code));
}

/** Code -> label lookup over a catalogue. */
export function categoryLabelMap(catalogue: readonly CategoryEntry[]): Record<TaskCategory, string> {
  const labels = { ...CATEGORY_LABELS } as Record<TaskCategory, string>;
  for (const entry of catalogue) labels[entry.code] = entry.label;
  return labels;
}

/**
 * Choices for a mission-type select: active codes in company order, plus the
 * current code when it has been hidden since (so an edit never drops it).
 */
export function categoryChoices(catalogue: readonly CategoryEntry[], current?: TaskCategory | null): CategoryEntry[] {
  return catalogue.filter((entry) => entry.active || entry.code === current);
}

/**
 * Choices for the meeting-point "Meeting type" select: active types in order,
 * plus the saved value when it is no longer in the list (older free text).
 */
export function meetingTypeChoices(types: readonly MeetingType[], current?: string | null): { value: string; label: string }[] {
  const active = types.filter((type) => type.active).map((type) => ({ value: type.name, label: `${type.prefix} · ${type.name}` }));
  const saved = current?.trim();
  if (saved && !active.some((choice) => choice.value === saved)) {
    const known = types.find((type) => type.name === saved);
    active.push({ value: saved, label: known ? `${known.prefix} · ${known.name} (hidden)` : `${saved} (not in the list)` });
  }
  return active;
}

/** Agenda text split into display lines (blank lines dropped). */
export function agendaLines(agenda: string): string[] {
  return agenda.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

/** A standing mission's title for a month and member, as month setup will render it. */
export function renderTitlePattern(pattern: string, month: Date, member?: string): string {
  const monthLabel = month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return pattern.replaceAll('{month}', monthLabel).replaceAll('{member}', member ?? '{member}');
}

/**
 * The sheet tag format the database allocator produces (migration 53):
 * `<Mon><YY>_<PREFIX><n>`, one running number per company per month.
 */
export function formatSheetTag(month: Date, prefix: string, n: number | string): string {
  const mon = month.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }).slice(0, 3);
  const yy = String(month.getUTCFullYear() % 100).padStart(2, '0');
  return `${mon}${yy}_${prefix}${n}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const asString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const asNumber = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/** Parses the `company_settings()` payload defensively; unknown entries are dropped. */
export function parseCompanySettings(raw: unknown): CompanySettings {
  if (!isRecord(raw)) return EMPTY_COMPANY_SETTINGS;
  const overrides: CategoryOverrides = {};
  if (isRecord(raw.categoryOverrides)) {
    for (const code of TASK_CATEGORIES) {
      const entry = raw.categoryOverrides[code];
      if (!isRecord(entry)) continue;
      overrides[code] = {
        ...(typeof entry.label === 'string' ? { label: entry.label } : {}),
        ...(typeof entry.active === 'boolean' ? { active: entry.active } : {}),
        ...(typeof entry.sort === 'number' ? { sort: entry.sort } : {}),
      };
    }
  }
  const list = (value: unknown) => (Array.isArray(value) ? value.filter(isRecord) : []);
  return {
    version: asNumber(raw.version),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    meetingAgenda: asString(raw.meetingAgenda),
    categoryOverrides: overrides,
    meetingTypes: list(raw.meetingTypes).map((m) => ({
      id: asString(m.id),
      prefix: asString(m.prefix),
      name: asString(m.name),
      sort: asNumber(m.sort),
      active: m.active !== false,
    })),
    holidays: list(raw.holidays).map((h) => ({ date: asString(h.date), name: asString(h.name) })),
    standingMissions: list(raw.standingMissions)
      .filter((s) => (TASK_CATEGORIES as readonly unknown[]).includes(s.category))
      .map((s) => ({
        id: asString(s.id),
        titlePattern: asString(s.titlePattern),
        category: s.category as TaskCategory,
        priority: (TASK_PRIORITIES as readonly unknown[]).includes(s.priority) ? (s.priority as TaskPriority) : 'Medium',
        ownerMode: s.ownerMode === 'single' ? 'single' : 'per_member',
        ownerId: typeof s.ownerId === 'string' && UUID_PATTERN.test(s.ownerId) ? s.ownerId : null,
        scaleMode: (STANDING_SCALE_MODES as readonly unknown[]).includes(s.scaleMode) ? (s.scaleMode as StandingScaleMode) : 'hours',
        sort: asNumber(s.sort),
        active: s.active !== false,
      })),
  };
}
