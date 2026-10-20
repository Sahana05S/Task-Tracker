import { describe, expect, it } from 'vitest';
import { rawContribution, contributionFromStates, rawSales, salesFromStates } from '../internal/contract';
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
    const result=parseInputContext({ruleVersion:'m06-support-inputs-v1',available:false,reasons:['history_before_input_baseline'],raw:{sale:null}});
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
  it('maps sales as flag counts (D05): (1.5*BO + BN + 0.75*BP)/50, exact',()=>{
    expect(rawSales(3,1,2)).toBe(0.12);expect(rawSales(1,0,0)).toBe(0.02);expect(rawSales(0,0,0)).toBe(0);
    expect(rawSales(300,200,100)).toBe(13.5);expect(rawSales(2,1,2)).toBe(0.1);
    expect(()=>rawSales(1,2,0)).toThrow();expect(()=>rawSales(1,0,2)).toThrow();expect(()=>rawSales(-1,0,0)).toThrow();expect(()=>rawSales(NaN,0,0)).toThrow();
  });
  it('counts pending and validated sales once, excludes rejected/withdrawn, keeps provenance gaps unavailable',()=>{
    const reviewed={state:'validated' as const,authorId:'seller',validatorId:'reviewer',validatedAt:'2026-10-12T00:00:00Z',isNewProject:true,basementPaymentReceived:true};
    const pending={state:'pending' as const,authorId:'seller',validatorId:null,validatedAt:null,isNewProject:false,basementPaymentReceived:true};
    const plain={...pending,basementPaymentReceived:false};
    expect(salesFromStates([reviewed,pending,plain,{...reviewed,state:'rejected'},{...reviewed,state:'withdrawn'}],true)).toMatchObject({available:true,rawValue:0.12,salesCounts:{BN:3,BO:1,BP:2},validatedCount:1,eligibleUnvalidatedCount:2,reasons:[]});
    expect(salesFromStates([],true)).toMatchObject({available:true,rawValue:0,salesCounts:{BN:0,BO:0,BP:0}});
    expect(salesFromStates([{...pending,state:'legacy_unvalidated'}],true)).toMatchObject({available:false,rawValue:null,reasons:['legacy_population_or_validation_provenance_missing']});
    expect(salesFromStates([{...reviewed,validatorId:'seller'}],true)).toMatchObject({available:false,rawValue:null});
    expect(salesFromStates([{...pending,isNewProject:null}],true)).toMatchObject({available:false,reasons:['sales_flags_missing']});
    expect(salesFromStates([],false)).toMatchObject({available:false,reasons:['history_before_input_baseline']});
  });
});
