import type { CalculationResult } from './engine';
/** Reports retain the exact shared result/context; no report-specific scoring path. */
export function performanceReport(calculation:CalculationResult,userId?:string|null) {
  const selected=userId?calculation.members.filter(m=>m.userId===userId):calculation.members;
  if(userId&&selected.length!==1)throw new Error('Employee calculation is unavailable.');
  return {ruleVersion:calculation.context.ruleVersion,context:calculation.context,status:calculation.status,members:selected};
}
