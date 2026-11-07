/**
 * Businesses (migration 134): types, mappers and the chip selection kept in
 * `?business=`. PRIVATE, re-exported through client.ts. Pure: no server code.
 *
 * A business is a view, not a permission: choosing chips only narrows which
 * missions a list shows.
 */

export const BUSINESS_COLOURS = ['neutral', 'primary', 'success', 'attention', 'danger', 'recognition'] as const;
export type BusinessColour = (typeof BUSINESS_COLOURS)[number];

export const BUSINESS_COLOUR_NAME: Record<BusinessColour, string> = {
  neutral: 'Grey', primary: 'Blue', success: 'Green', attention: 'Amber', danger: 'Red', recognition: 'Gold',
};

/** The dot's fill per colour token, all from app/globals.css. */
export const BUSINESS_DOT_CLASS: Record<BusinessColour, string> = {
  neutral: 'bg-muted-foreground',
  primary: 'bg-primary',
  success: 'bg-success',
  attention: 'bg-attention-strong',
  danger: 'bg-danger',
  recognition: 'bg-recognition',
};

export const BUSINESS_NAME_MAX = 60;

export interface Business {
  id: string;
  name: string;
  slug: string;
  colour: BusinessColour;
  sort: number;
  archived: boolean;
  /** The people who work in it (set by the managing director on Team profiles). */
  memberIds: string[];
}

export interface BusinessCatalogue {
  /** The managing director: manages the list and each person's businesses. */
  canManage: boolean;
  /** Active ones first by order, archived ones last. */
  businesses: Business[];
}

export interface BusinessSummaryRow {
  /** Null for missions with no business. */
  businessId: string | null;
  openMissions: number;
  /** Null until permanent missions exist (migration 135). */
  permanentMissions: number | null;
  /** Unreversed hours logged Monday to today (India time). */
  weekHours: number;
}

export interface BusinessSummary {
  weekStart: string;
  today: string;
  permanentAvailable: boolean;
  rows: BusinessSummaryRow[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function colourOf(value: unknown): BusinessColour {
  return (BUSINESS_COLOURS as readonly unknown[]).includes(value) ? (value as BusinessColour) : 'neutral';
}

export function isBusinessColour(value: string): value is BusinessColour {
  return (BUSINESS_COLOURS as readonly string[]).includes(value);
}

export function mapBusiness(value: unknown): Business | null {
  const row = record(value);
  if (!row || typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.slug !== 'string') return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    colour: colourOf(row.colour),
    sort: typeof row.sort === 'number' ? row.sort : 0,
    archived: row.archived === true,
    memberIds: Array.isArray(row.memberIds) ? row.memberIds.filter((id): id is string => typeof id === 'string') : [],
  };
}

export function mapCatalogue(value: unknown): BusinessCatalogue | null {
  const row = record(value);
  if (!row || !Array.isArray(row.businesses)) return null;
  return {
    canManage: row.canManage === true,
    businesses: row.businesses.map(mapBusiness).filter((b): b is Business => b !== null),
  };
}

export function mapIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && UUID.test(id)) : [];
}

export function mapSummary(value: unknown): BusinessSummary | null {
  const row = record(value);
  if (!row || !Array.isArray(row.rows)) return null;
  const rows = row.rows.flatMap((item): BusinessSummaryRow[] => {
    const r = record(item);
    if (!r) return [];
    return [{
      businessId: typeof r.businessId === 'string' ? r.businessId : null,
      openMissions: Number(r.openMissions) || 0,
      permanentMissions: r.permanentMissions === null || r.permanentMissions === undefined ? null : Number(r.permanentMissions) || 0,
      weekHours: Number(r.weekHours) || 0,
    }];
  });
  return {
    weekStart: String(row.weekStart ?? ''),
    today: String(row.today ?? ''),
    permanentAvailable: row.permanentAvailable === true,
    rows,
  };
}

/* The chip selection ---------------------------------------------------------------------------- */

/** The query parameter Missions and Today keep the chips in. */
export const BUSINESS_PARAM = 'business';
/** `?business=all`: every mission. */
export const ALL_BUSINESSES = 'all';
/** The "No business" chip in `?business=`. */
export const NO_BUSINESS = 'none';

export type BusinessSelection =
  | { all: true }
  | { all: false; ids: string[]; none: boolean };

export const EVERY_BUSINESS: BusinessSelection = { all: true };

/** Businesses that get a chip: active ones, in order. */
export function chipBusinesses(businesses: readonly Business[]): Business[] {
  return businesses.filter((b) => !b.archived);
}

/** Where a page opens without `?business=`: the member's own active businesses, or All when they have none. */
export function defaultBusinessSelection(businesses: readonly Business[], mine: readonly string[]): BusinessSelection {
  const own = new Set(mine);
  const ids = chipBusinesses(businesses).filter((b) => own.has(b.id)).map((b) => b.id);
  return ids.length ? { all: false, ids, none: false } : EVERY_BUSINESS;
}

/**
 * Reads `?business=` (`all`, or slugs and `none` separated by commas or repeated). Unknown or archived
 * slugs are ignored; nothing usable left (or no parameter) means the member's default.
 */
export function parseBusinessParam(
  raw: string | readonly string[] | null | undefined,
  businesses: readonly Business[],
  mine: readonly string[],
): BusinessSelection {
  const values = (typeof raw === 'string' ? [raw] : raw ?? [])
    .flatMap((value) => value.split(','))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (values.includes(ALL_BUSINESSES)) return EVERY_BUSINESS;
  const bySlug = new Map(chipBusinesses(businesses).map((b) => [b.slug, b.id]));
  const wanted = new Set(values.map((slug) => bySlug.get(slug)).filter((id): id is string => !!id));
  const ids = chipBusinesses(businesses).filter((b) => wanted.has(b.id)).map((b) => b.id);
  const none = values.includes(NO_BUSINESS);
  if (!ids.length && !none) return defaultBusinessSelection(businesses, mine);
  return { all: false, ids, none };
}

/** The `?business=` value for a selection: `all`, or the chosen slugs in chip order then `none`. */
export function businessParamValue(selection: BusinessSelection, businesses: readonly Business[]): string {
  if (selection.all) return ALL_BUSINESSES;
  const chosen = new Set(selection.ids);
  const slugs = chipBusinesses(businesses).filter((b) => chosen.has(b.id)).map((b) => b.slug);
  if (selection.none) slugs.push(NO_BUSINESS);
  return slugs.length ? slugs.join(',') : ALL_BUSINESSES;
}

/**
 * One chip pressed. All selects everything; a business or "No business" from All shows only it;
 * otherwise it is added or removed, and removing the last one goes back to All.
 */
export function toggleBusiness(selection: BusinessSelection, chip: string, businesses: readonly Business[]): BusinessSelection {
  if (chip === ALL_BUSINESSES) return EVERY_BUSINESS;
  const isNone = chip === NO_BUSINESS;
  if (!isNone && !chipBusinesses(businesses).some((b) => b.id === chip)) return selection;
  if (selection.all) return isNone ? { all: false, ids: [], none: true } : { all: false, ids: [chip], none: false };
  const ids = isNone ? selection.ids : selection.ids.includes(chip) ? selection.ids.filter((id) => id !== chip) : [...selection.ids, chip];
  const none = isNone ? !selection.none : selection.none;
  const ordered = chipBusinesses(businesses).filter((b) => ids.includes(b.id)).map((b) => b.id);
  return ordered.length || none ? { all: false, ids: ordered, none } : EVERY_BUSINESS;
}

export function isChipOn(selection: BusinessSelection, chip: string): boolean {
  if (chip === ALL_BUSINESSES) return selection.all;
  if (selection.all) return false;
  return chip === NO_BUSINESS ? selection.none : selection.ids.includes(chip);
}

/** Does a mission with this business show under the selection. */
export function matchesBusiness(selection: BusinessSelection, businessId: string | null | undefined): boolean {
  if (selection.all) return true;
  return businessId ? selection.ids.includes(businessId) : selection.none;
}

/** The selection as a database filter: null for every mission. */
export function businessQueryFilter(selection: BusinessSelection): { ids: string[]; none: boolean } | null {
  if (selection.all) return null;
  return { ids: selection.ids.filter((id) => UUID.test(id)), none: selection.none };
}

/** The summary lines under the chips: each selected business (every active one under All), then "No business". */
export function summaryLines(
  selection: BusinessSelection,
  businesses: readonly Business[],
  summary: BusinessSummary,
): { key: string; business: Business | null; row: BusinessSummaryRow }[] {
  const rowFor = (id: string | null): BusinessSummaryRow =>
    summary.rows.find((r) => r.businessId === id) ?? { businessId: id, openMissions: 0, permanentMissions: summary.permanentAvailable ? 0 : null, weekHours: 0 };
  const shown = chipBusinesses(businesses).filter((b) => selection.all || selection.ids.includes(b.id));
  const lines = shown.map((b) => ({ key: b.id, business: b as Business | null, row: rowFor(b.id) }));
  const noneRow = rowFor(null);
  const showNone = selection.all ? noneRow.openMissions > 0 || noneRow.weekHours > 0 || (noneRow.permanentMissions ?? 0) > 0 : selection.none;
  if (showNone) lines.push({ key: NO_BUSINESS, business: null, row: noneRow });
  return lines;
}

/** "12.5 h", "0 h". */
export function formatWeekHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} h`;
}
