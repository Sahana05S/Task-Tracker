import { handlePolicyWorkerRun } from '@/modules/policies';
export const runtime='nodejs';
export async function POST(request:Request){return handlePolicyWorkerRun(request);}
