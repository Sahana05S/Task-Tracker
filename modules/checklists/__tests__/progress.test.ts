import { describe, expect, it } from 'vitest';
import { computeChecklistProgress, type ChecklistProgressNode } from '@/modules/checklists/internal/progress';
import fixtures from '@/__tests__/fixtures/checklist-rollups.json';

type Fixture = {
 name: string; nodes: unknown[]; noChecklist?: boolean; expectedProgress: number | null;
 expectedComplete?: boolean; expectedActivityState?: string; expectedError?: string; expectedNoErrors?: boolean;
};

describe('checklist rollups (one kind of row, migration 63)',()=>{
 for(const fixture of fixtures as Fixture[]) it(fixture.name,()=>{
  const r=computeChecklistProgress(fixture.nodes as ChecklistProgressNode[],{hasChecklist:!fixture.noChecklist});
  if(fixture.expectedProgress===null) expect(r.taskProgress).toBeNull();
  else expect(r.taskProgress).toBeCloseTo(fixture.expectedProgress,12);
  if(fixture.expectedComplete!==undefined) expect(r.isComplete).toBe(fixture.expectedComplete);
  if(fixture.expectedActivityState) expect(r.sections.activity.state).toBe(fixture.expectedActivityState);
  if(fixture.expectedError) expect(r.errors.some(e=>e.startsWith(fixture.expectedError!))).toBe(true);
  if(fixture.expectedNoErrors) expect(r.errors).toEqual([]);
  expect(r.nodeProgress.every(n=>n.progressPercentage===null||Number.isFinite(n.progressPercentage))).toBe(true);
 });
 it('cannot conceal a cycle behind N/A',()=>{
  const r=computeChecklistProgress([{id:'a',parentNodeId:'b',section:'activity',completionState:'N/A'},{id:'b',parentNodeId:'a',section:'activity'}]);
  expect(r.errors.some(e=>e.startsWith('cycle'))).toBe(true);
 });
 it('treats an empty checklist as complete and every section as N/A',()=>{
  const r=computeChecklistProgress([]);
  expect(r.errors).toEqual([]);expect(r.isComplete).toBe(true);
  expect(Object.values(r.sections).map(s=>s.state)).toEqual(['not_applicable','not_applicable','not_applicable']);
 });
});
