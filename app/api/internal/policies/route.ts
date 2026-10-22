import { handlePolicyWorkerRun } from '@/modules/policies';
export const runtime='nodejs';
// Up to 20 due periods per company in one call; the schedule calls again for the rest.
export const maxDuration=60;
export async function POST(request:Request){return handlePolicyWorkerRun(request);}
