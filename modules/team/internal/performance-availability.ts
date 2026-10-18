import { UnmeasuredProgressError } from '@/modules/scoring/client';
import type { TeamAnalytics } from '@/modules/scoring/client';
export async function optionalEmployeePerformance(load: ()=>Promise<TeamAnalytics>,userId: string) {
 try {
  const analytics=await load();
  const performance=analytics.members.find(member=>member.userId===userId)??null;
  return {performance,performanceUnavailableReason:performance?.performanceUnavailableReason??(performance?undefined:'Employee performance is unavailable for the requested as-of cohort or source history.')};
 } catch(error) {
  if (!(error instanceof UnmeasuredProgressError)) throw error;
  return {performance:null,performanceUnavailableReason:error.message};
 }
}
