import { describe,expect,it,vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
vi.mock('@/shared/supabase/server',()=>({createClient:vi.fn()}));
import { archiveDifferences,archivedCsv,archivedReport,archivedText,compareRevisions,type MonthArchive } from '@/modules/reports/internal/month/archive';
import { ArchivedReport } from '@/modules/reports/components/archived-report';
import { FACTORS } from '@/modules/scoring/client';

function fixture(score:string|null,change=false):MonthArchive {
 const factors=Object.fromEntries(FACTORS.map(f=>[f,{unit:'source unit',rawExact:{numerator:f==='productivity'?'1':'0',denominator:f==='productivity'?'160':'1'},medianExact:{numerator:'0',denominator:'1'},deltaExact:{numerator:'1',denominator:'160'},contributionExact:change&&f==='facts'?{numerator:'2',denominator:'1'}:{numerator:'1',denominator:'160'},coefficient:'1',cohortId:'cohort',population:['u1'],reasons:f==='sales'?['sales_field_mapping_missing']:[]}])) as MonthArchive['members'][number]['result']['factors'];
 return {id:'r1',period:'2026-09-01',revisionNumber:change?2:1,disposition:'closed',superseded:false,asOf:'2026-10-02T00:00:00Z',cutoffLocalDate:'2026-10-02',recordedAt:'2026-10-02T00:00:01Z',reason:'Evidence retained',ruleVersion:'m07-ten-factor-v1',sourceWatermark:'12:3:1',certification:'incomplete_uncertified',dataQualityReasons:['sales_field_mapping_missing'],members:[{userId:'u1',result:{userId:'u1',status:'incomplete',factors,compositeExact:score?{numerator:score,denominator:'1'}:null} as MonthArchive['members'][number]['result']}],calculationContext:{ruleVersion:'m07-ten-factor-v1',sourceWatermark:'12:3:1'} as MonthArchive['calculationContext'],sourceInputs:{tasks:[{id:'t1',scaleVersion:'2',shareVersion:'3'}]},presentationInputs:{tasks:[{id:'t1',title:'Original'}]},awardEvidence:[],monthlySelection:{status:'incomplete',winnerId:null,counts:{},reasons:['daily_award_evidence_incomplete'],missingDates:[],tiedIds:[],tieBreak:{}}};
}

describe('immutable report output',()=>{
 it('keeps the archived version, missing certification and small exact factor value in JSON/text/CSV',()=>{
  const old=fixture(null),report=archivedReport(old);
  expect(report.sourceInputs).toEqual({tasks:[{id:'t1',scaleVersion:'2',shareVersion:'3'}]});
  expect(report.certification).toBe('incomplete_uncertified');
  expect(report.monthlySelection.winnerId).toBeNull();
  expect(archivedText(old)).toContain('0.006250');
  expect(archivedCsv(old)).toContain('0.006250');
  expect(archivedText(old)).toContain('Unavailable — not certified');
 });
 it('compares retained revisions without recalculating either one',()=>{
  const old=fixture(null),next=fixture('2',true),before=JSON.stringify(old);
  const diff=compareRevisions(old,next);
  expect(diff[0].changedFactors).toEqual(['facts']);
  expect(diff[0].oldScore).toBeNull();
  expect(JSON.stringify(old)).toBe(before);
  expect(archiveDifferences(old,next).changedSources).toEqual([]);
  next.sourceInputs={tasks:[{id:'t1',scaleVersion:'3',shareVersion:'3'}]};
  expect(archiveDifferences(old,next).changedSources).toEqual(['tasks:t1']);
 });
 it('renders a revision label, frozen downloads and its retained detail evidence',()=>{
  const html=renderToStaticMarkup(createElement(ArchivedReport,{archive:fixture(null),previous:null,employee:null}));
  expect(html).toContain('Closed with gaps');
  expect(html).toContain('revision=1');
  expect(html).toContain('Original');
 });
});
