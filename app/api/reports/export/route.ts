import { handleReportExport } from '@/modules/reports';
export async function GET(request:Request){return handleReportExport(request);}
