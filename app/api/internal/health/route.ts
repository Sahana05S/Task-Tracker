import { handleHealthCheck } from '@/modules/scoring';
export const runtime='nodejs';
export async function GET(request:Request){return handleHealthCheck(request);}
