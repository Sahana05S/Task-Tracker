import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePerformanceSources,resolvePerformance } from '@/modules/scoring/internal/performance/sources';
// Exported by tools/test_m17_sales_database.py after migration 46 (D05 flag-count mapping).
// Independent expectations: fresh user4 has 3 entries/1 new/2 basement = 3/25; the upgrade database also
// holds one pre-upgrade new+basement entry, so 4/2/3 = 9.25/50 = 37/200. user5 1/0/0 = 1/50; user6 none = 0.
const U=(n:number)=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
describe.each([['fresh',{numerator:'3',denominator:'25'}],['upgrade',{numerator:'37',denominator:'200'}]] as const)('M17 mapped sales from PostgreSQL (%s)',(kind,user4)=>{
 it('reads the mapped sales raw values exactly and never reports the old mapping gap',()=>{
  const sources=parsePerformanceSources(JSON.parse(readFileSync(`__tests__/fixtures/m17-sales-source-${kind}.json`,'utf8')));
  const calculation=resolvePerformance(sources);
  const sales=(id:string)=>calculation.members.find(m=>m.userId===id)!.factors.sales;
  expect(sales(U(4)).rawExact).toEqual(user4);
  expect(sales(U(5)).rawExact).toEqual({numerator:'1',denominator:'50'});
  expect(sales(U(6)).rawExact).toEqual({numerator:'0',denominator:'1'});
  for(const m of calculation.members)expect(m.factors.sales.reasons.join(' ')).not.toContain('sales_field_mapping_missing');
 });
});
