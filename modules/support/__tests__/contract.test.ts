import { describe, expect, it } from 'vitest';
import { rawContribution, contributionFromStates } from '../internal/contract';
import { parseInputContext, loadContributionContext } from '../internal/input-context';
describe('M06 raw contribution arithmetic and availability',()=>{
  it('uses confirmed facts coefficients on explicitly classified counts',()=>expect(rawContribution('fact',2,1)).toBe(1.88));
  it('uses confirmed idea and suggestion coefficients',()=>{
    expect(rawContribution('idea',1,2)).toBe(3.5);expect(rawContribution('suggestion',1,2)).toBe(3.5);
  });
  it('keeps a measured empty confirmed population zero',()=>expect(rawContribution('fact',0,0)).toBe(0));
  it('rejects invalid counts instead of making zero',()=>{
    expect(()=>rawContribution('fact',-1,1)).toThrow();expect(()=>rawContribution('idea',NaN,2)).toThrow();
  });
  it('preserves explicit unavailable inputs',()=>{
    const result=parseInputContext({ruleVersion:'m06-support-inputs-v1',available:false,reasons:['sales_field_mapping_missing'],raw:{sale:null}});
    expect(result.available).toBe(false);expect(result.raw).toEqual({sale:null});
  });
  it('rejects missing context',()=>expect(()=>parseInputContext(null)).toThrow('unavailable'));
  it('does not turn a missing table query into healthy empty input',async()=>{
    const db={rpc:async()=>({data:null,error:{code:'42P01',message:'Source table missing'}})};
    await expect(loadContributionContext(db as never,'2026-10-01','2026-11-01','2026-10-12T00:00:00Z')).rejects.toThrow('Source table missing');
  });
  it('credits actual pending and validated states while excluding rejected/withdrawn',()=>{
    const reviewed={state:'validated' as const,authorId:'employee',validatorId:'reviewer',validatedAt:'2026-10-12T00:00:00Z'};
    const pending={state:'pending' as const,authorId:'employee',validatorId:null,validatedAt:null};
    expect(contributionFromStates('fact',[reviewed,reviewed,pending,{...pending,state:'rejected'},{...pending,state:'withdrawn'}],true)).toMatchObject({available:true,rawValue:1.88,validatedCount:2,eligibleUnvalidatedCount:1});
    expect(contributionFromStates('idea',[reviewed,pending,pending],true).rawValue).toBe(3.5);
  });
  it('does not reinterpret legacy unknown populations or incomplete review provenance',()=>{
    const unknown={state:'legacy_unvalidated' as const,authorId:'employee',validatorId:null,validatedAt:null};
    expect(contributionFromStates('fact',[unknown],true)).toMatchObject({available:false,rawValue:null});
    expect(contributionFromStates('fact',[{...unknown,state:'validated',validatorId:'reviewer'}],true)).toMatchObject({available:false,rawValue:null});
    expect(contributionFromStates('fact',[{...unknown,state:'validated',validatorId:'employee',validatedAt:'2026-10-12T00:00:00Z'}],true)).toMatchObject({available:false,rawValue:null});
    expect(contributionFromStates('fact',[],false)).toMatchObject({available:false,rawValue:null});
    expect(contributionFromStates('fact',[],true)).toMatchObject({available:true,rawValue:0});
  });
});
