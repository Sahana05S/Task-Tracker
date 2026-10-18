import { handleAuthCallback } from '@/modules/auth';

/** Email-confirmation and OAuth callback; see modules/auth. */
export async function GET(request: Request) {
  return handleAuthCallback(request);
}
