import { describe, expect, it } from 'vitest';

import {
  businessParamValue,
  businessQueryFilter,
  defaultBusinessSelection,
  EVERY_BUSINESS,
  formatWeekHours,
  isChipOn,
  matchesBusiness,
  parseBusinessParam,
  summaryLines,
  toggleBusiness,
  type Business,
} from '@/modules/businesses/client';
import { mapCatalogue, mapSummary } from '@/modules/businesses/internal/rules';

const PRINT = '11111111-1111-4111-8111-111111111111';
const FISH = '22222222-2222-4222-8222-222222222222';
const BUILD = '33333333-3333-4333-8333-333333333333';
const OLD = '44444444-4444-4444-8444-444444444444';

const business = (id: string, slug: string, sort: number, archived = false): Business => ({
  id, name: slug, slug, colour: 'primary', sort, archived, memberIds: [],
});
const LIST: Business[] = [
  business(PRINT, '3d-printing', 10),
  business(FISH, 'fish-sales', 20),
  business(BUILD, 'construction-services', 30),
  business(OLD, 'old-line', 40, true),
];

describe('where the chips open', () => {
  it('opens on the member\'s own active businesses, in chip order', () => {
    expect(parseBusinessParam(null, LIST, [FISH, PRINT, OLD])).toEqual({ all: false, ids: [PRINT, FISH], none: false });
  });
  it('opens on All when the member has no (active) business', () => {
    expect(parseBusinessParam(undefined, LIST, [])).toEqual(EVERY_BUSINESS);
    expect(defaultBusinessSelection(LIST, [OLD])).toEqual(EVERY_BUSINESS);
  });
  it('reads all, slugs and none from ?business=, ignoring unknown and archived slugs', () => {
    expect(parseBusinessParam('all', LIST, [PRINT])).toEqual(EVERY_BUSINESS);
    expect(parseBusinessParam('fish-sales,none', LIST, [PRINT])).toEqual({ all: false, ids: [FISH], none: true });
    expect(parseBusinessParam(['FISH-SALES', '3d-printing'], LIST, [])).toEqual({ all: false, ids: [PRINT, FISH], none: false });
    expect(parseBusinessParam('none', LIST, [PRINT])).toEqual({ all: false, ids: [], none: true });
    // Nothing usable falls back to the member's own.
    expect(parseBusinessParam('old-line,nope', LIST, [BUILD])).toEqual({ all: false, ids: [BUILD], none: false });
  });
});

describe('pressing chips', () => {
  it('from All, a business or No business shows only it', () => {
    expect(toggleBusiness(EVERY_BUSINESS, FISH, LIST)).toEqual({ all: false, ids: [FISH], none: false });
    expect(toggleBusiness(EVERY_BUSINESS, 'none', LIST)).toEqual({ all: false, ids: [], none: true });
  });
  it('adds and removes businesses, and the last one off goes back to All', () => {
    let s = toggleBusiness(EVERY_BUSINESS, BUILD, LIST);
    s = toggleBusiness(s, PRINT, LIST);
    expect(s).toEqual({ all: false, ids: [PRINT, BUILD], none: false });
    s = toggleBusiness(s, 'none', LIST);
    expect(isChipOn(s, 'none')).toBe(true);
    s = toggleBusiness(toggleBusiness(toggleBusiness(s, PRINT, LIST), BUILD, LIST), 'none', LIST);
    expect(s).toEqual(EVERY_BUSINESS);
    expect(toggleBusiness(s, 'all', LIST)).toEqual(EVERY_BUSINESS);
  });
  it('ignores an archived or unknown business', () => {
    const s = { all: false as const, ids: [FISH], none: false };
    expect(toggleBusiness(s, OLD, LIST)).toBe(s);
  });
  it('writes the selection back as ?business= and reads it again', () => {
    const s = { all: false as const, ids: [FISH, PRINT], none: true };
    expect(businessParamValue(s, LIST)).toBe('3d-printing,fish-sales,none');
    expect(parseBusinessParam(businessParamValue(s, LIST), LIST, [])).toEqual({ all: false, ids: [PRINT, FISH], none: true });
    expect(businessParamValue(EVERY_BUSINESS, LIST)).toBe('all');
  });
});

describe('which missions show', () => {
  it('matches by business, and No business matches missions without one', () => {
    const s = { all: false as const, ids: [PRINT], none: true };
    expect(matchesBusiness(s, PRINT)).toBe(true);
    expect(matchesBusiness(s, FISH)).toBe(false);
    expect(matchesBusiness(s, null)).toBe(true);
    expect(matchesBusiness({ all: false, ids: [PRINT], none: false }, null)).toBe(false);
    expect(matchesBusiness(EVERY_BUSINESS, OLD)).toBe(true);
  });
  it('gives the database filter for Today', () => {
    expect(businessQueryFilter(EVERY_BUSINESS)).toBeNull();
    expect(businessQueryFilter({ all: false, ids: [FISH, 'not-a-uuid'], none: true })).toEqual({ ids: [FISH], none: true });
  });
});

describe('the summary lines', () => {
  const summary = mapSummary({
    weekStart: '2026-11-02', today: '2026-11-07', permanentAvailable: false,
    rows: [{ businessId: PRINT, openMissions: 3, permanentMissions: null, weekHours: '12.50' }, { businessId: null, openMissions: 1, permanentMissions: null, weekHours: 0 }],
  })!;
  it('lists each selected business, and No business when chosen', () => {
    const lines = summaryLines({ all: false, ids: [PRINT, FISH], none: true }, LIST, summary);
    expect(lines.map((l) => l.key)).toEqual([PRINT, FISH, 'none']);
    expect(lines[0].row).toEqual({ businessId: PRINT, openMissions: 3, permanentMissions: null, weekHours: 12.5 });
    expect(lines[1].row.openMissions).toBe(0);
  });
  it('under All lists every active business and No business only when it has work', () => {
    expect(summaryLines(EVERY_BUSINESS, LIST, summary).map((l) => l.key)).toEqual([PRINT, FISH, BUILD, 'none']);
    const quiet = { ...summary, rows: summary.rows.filter((r) => r.businessId) };
    expect(summaryLines(EVERY_BUSINESS, LIST, quiet).map((l) => l.key)).toEqual([PRINT, FISH, BUILD]);
  });
  it('formats hours', () => {
    expect(formatWeekHours(0)).toBe('0 h');
    expect(formatWeekHours(12.5)).toBe('12.5 h');
    expect(formatWeekHours(3.04)).toBe('3 h');
  });
  it('maps the catalogue defensively', () => {
    expect(mapCatalogue(null)).toBeNull();
    expect(mapCatalogue({ canManage: true, businesses: [{ id: PRINT, name: 'P', slug: 'p', colour: '#fff', memberIds: [1, 'x'] }, 'junk'] }))
      .toEqual({ canManage: true, businesses: [{ id: PRINT, name: 'P', slug: 'p', colour: 'neutral', sort: 0, archived: false, memberIds: ['x'] }] });
  });
});
