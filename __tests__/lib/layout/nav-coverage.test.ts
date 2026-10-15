import { describe,expect,it } from 'vitest';
import { MORE_ITEMS,NAV_SECTIONS,activeSection,isMoreActive } from '@/components/layout/nav-items';
import { PROTECTED_PREFIXES } from '@/lib/auth/protected-routes';
import { weekStartOf } from '@/lib/today/queries';

describe('redesigned navigation keeps every workspace route reachable',()=>{
 it('maps every protected route to a section tab or a More item',()=>{
  // /records/* is record history, opened from each record; check one per kind.
  const samples=PROTECTED_PREFIXES.flatMap(prefix=>prefix==='/records'
   ?['attendance','fact','idea','suggestion','sale','meeting'].map(kind=>`/records/${kind}/00000000-0000-4000-8000-000000000000/history`)
   :[prefix]);
  const orphans=samples.filter(path=>!activeSection(path)&&!isMoreActive(path));
  expect(orphans).toEqual([]);
 });
 it('has five primary destinations, four phone tabs (with More) and no duplicate hrefs',()=>{
  expect(NAV_SECTIONS.map(s=>s.label)).toEqual(['Today','Missions','Records','Team','Reports']);
  expect(NAV_SECTIONS.filter(s=>s.inBottomNav).map(s=>s.label)).toEqual(['Today','Missions','Team']);
  const hrefs=[...NAV_SECTIONS.flatMap(s=>s.tabs.map(t=>t.href)),...MORE_ITEMS.map(i=>i.href)];
  expect(new Set(hrefs).size).toBe(hrefs.length);
 });
 it('keeps the master checklist inside Missions, not a separate destination',()=>{
  expect(activeSection('/tasks/M13-X/checklist')?.label).toBe('Missions');
 });
});

describe('Today week boundary',()=>{
 it('starts the Asia/Kolkata week on Monday',()=>{
  expect(weekStartOf('2026-10-15')).toBe('2026-10-12');
  expect(weekStartOf('2026-10-12')).toBe('2026-10-12');
  expect(weekStartOf('2026-10-18')).toBe('2026-10-12');
  expect(weekStartOf('2026-11-01')).toBe('2026-10-26');
 });
});
