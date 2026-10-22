import { handleActivityExport } from '@/modules/records';
export async function GET(request: Request) { return handleActivityExport(request); }
