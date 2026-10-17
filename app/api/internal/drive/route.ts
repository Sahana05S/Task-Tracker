import { handleDriveSetupCheck,handleDriveWorkerRun } from '@/modules/drive';
export const runtime='nodejs';
export async function GET(request:Request){return handleDriveSetupCheck(request);}
export async function POST(request:Request){return handleDriveWorkerRun(request);}
