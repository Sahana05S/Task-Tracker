import { handleAuthCallback } from '@/modules/auth';

/** Email-confirmation and password-recovery callback; see modules/auth. */
export async function GET(request: Request) {
  return handleAuthCallback(request);
}
