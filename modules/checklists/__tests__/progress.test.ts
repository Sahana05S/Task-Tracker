import { describe, expect, it } from 'vitest';
import { computeChecklistProgress, type ChecklistProgressNode, type ChecklistSection, type SectionInitialization } from '@/modules/checklists/internal/progress';
import fixtures from '@/__tests__/fixtures/m05-rollups.json';
describe('M05 independent section rollups',()=>{
 for(const fixture of fixtures) it(fixture.name,()=>{
  const r=computeChecklistProgress(fixture.nodes as ChecklistProgressNode[],fixture.initialization as Partial<Record<ChecklistSection,SectionInitialization>>);
  if(fixture.expectedProgress===null) expect(r.taskProgress).toBeNull();
  else expect(r.taskProgress).toBeCloseTo(fixture.expectedProgress,12);
  if('expectedComplete' in fixture) expect(r.isComplete).toBe(fixture.expectedComplete);
  if('expectedActivityState' in fixture) expect(r.sections.activity.state).toBe(fixture.expectedActivityState);
  if('expectedError' in fixture) expect(r.errors.some(e=>e.startsWith(fixture.expectedError!))).toBe(true);
  expect(r.nodeProgress.every(n=>n.progressPercentage===null||Number.isFinite(n.progressPercentage))).toBe(true);
 });
 it('cannot conceal a cycle behind N/A',()=>{
  const r=computeChecklistProgress([{id:'a',parentNodeId:'b',section:'activity',completionState:'N/A'},{id:'b',parentNodeId:'a',section:'activity'}],{activity:{initialized:true,intentionalEmpty:false}});
  expect(r.errors.some(e=>e.startsWith('cycle'))).toBe(true);
 });
 it('does not treat initialized but unconfirmed empty work as complete',()=>{
  const r=computeChecklistProgress([],{activity:{initialized:true,intentionalEmpty:false}});
  expect(r.errors).toContain('empty_unconfirmed:activity');expect(r.isComplete).toBe(false);
 });
});
