import { handleFileView } from '@/modules/files';

export const runtime = 'nodejs';
export async function GET(request: Request) { return handleFileView(request); }
