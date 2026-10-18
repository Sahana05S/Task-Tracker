import { handleAwardWorkerRun } from '@/modules/scoring';
export const runtime='nodejs';
export async function POST(request:Request){return handleAwardWorkerRun(request);}
