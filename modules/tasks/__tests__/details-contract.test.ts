import {describe,it,expect,vi} from 'vitest';
import {DETAIL_FIELDS,detailValues,ipoLinks,isValidDetailEntry,sectionsForRole} from '@/modules/tasks/internal/details-contract';
import type {TaskDetailSection,TaskLink} from '@/types/tracker';
const expected={description:'Description',smart_specific:'Specific',smart_measurable:'Measurable',smart_achievable:'Achievable',smart_relevant:'Relevant',smart_time_bound:'Time-Bound',input_content:'Inputs',process_content:'Process',output_content:'Outputs',reviewer_notes:'Reviewer notes'};
describe('native M04 detail contract',()=>{
 it('matches every independently expected field and its label',()=>{expect(Object.fromEntries(DETAIL_FIELDS.map(f=>[f.key,f.label]))).toEqual(expected);});
 it('returns every exact user value without using aggregate SMART or template instructions',()=>{
  const rows=Object.keys(expected).map(key=>({keyName:key,content:'User '+key})) as TaskDetailSection[];
  rows.push({keyName:'smart_goals',content:'Ambiguous legacy goal'} as TaskDetailSection);
  expect(detailValues(rows)).toEqual(Object.fromEntries(Object.keys(expected).map(k=>[k,'User '+k])));
  expect(detailValues([]).smart_specific).toBe('');
 });
 it('selects IPO links by explicit role, preserving ambiguous links outside IPO',()=>{
  const links=[{id:'a',linkType:'Document',ipoRole:'output',notes:'input'},{id:'b',linkType:'Folder',ipoRole:'input'},{id:'c',linkType:'Document',notes:'output'}] as TaskLink[];
  expect(ipoLinks(links,'input').map(l=>l.id)).toEqual(['b']);expect(ipoLinks(links,'output').map(l=>l.id)).toEqual(['a']);
 });
 it('renders canonical IPO content and preserves unrelated prefixed user sections',()=>{
  const rows=[{keyName:'input_content',content:'Entered input'},{keyName:'input_drawing',content:'Legacy drawing'},{keyName:'output_content',content:'Output'},{keyName:'input_empty',content:' '}] as TaskDetailSection[];
  expect(sectionsForRole(rows,'input').map(r=>r.content)).toEqual(['Entered input','Legacy drawing']);
 });
 it('separates a valid entry from eligibility and optional scale/deadline',()=>{
  const task={taskTag:'T1',title:'New work',category:'T',priority:'No',assigneeIds:['active-assignee']};
  expect(isValidDetailEntry(task)).toBe(true);
  for(const patch of [{taskTag:''},{title:' '},{category:'invalid'},{priority:'invalid'},{assigneeIds:[]}])expect(isValidDetailEntry({...task,...patch})).toBe(false);
 });
});
vi.mock('@/shared/session/profile',()=>({getCurrentProfile:vi.fn(async()=>({id:'manager',isActive:true}))}));
const rpc=vi.fn(async()=>({data:{nativeState:'ready'},error:null}));
vi.mock('@/shared/supabase/server',()=>({createClient:vi.fn(async()=>({rpc}))}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {saveTaskDetails,initializeTaskDetails,addTaskAsset} from '@/modules/tasks/detail-actions';
it('structured actions send every matching canonical field through one command',async()=>{
 const form=new FormData();form.set('taskId','task');form.set('expectedVersion','4');form.set('operationId','operation');
 for(const key of Object.keys(expected))form.set(key,'User '+key);
 expect((await saveTaskDetails(form)).success).toBe(true);
 expect(rpc).toHaveBeenLastCalledWith('task_details_command',expect.objectContaining({p_command:'save',p_payload:Object.fromEntries(Object.keys(expected).map(k=>[k,'User '+k])),p_expected_version:4}));
 await initializeTaskDetails(form);expect(rpc).toHaveBeenLastCalledWith('task_details_command',expect.objectContaining({p_command:'initialize'}));
 form.set('ipoRole','output');form.set('linkType','Document');form.set('label','Output');form.set('url','https://example.test/output');
 await addTaskAsset(form);expect(rpc).toHaveBeenLastCalledWith('task_details_command',expect.objectContaining({p_command:'link',p_payload:expect.objectContaining({ipo_role:'output'})}));
});
