import { handlePayrollExport } from '@/modules/payroll';
export async function GET(request: Request) { return handlePayrollExport(request); }
