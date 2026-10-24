import { handleAttendancePhotoRetention } from '@/modules/attendance';
export const runtime='nodejs';
// Up to 200 expired photos per batch; the schedule calls again while some remain.
export const maxDuration=60;
export async function POST(request:Request){return handleAttendancePhotoRetention(request);}
