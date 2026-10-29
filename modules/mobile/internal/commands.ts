// PRIVATE. The signed-in member's own phone (migration 91, owned by notifications):
// the database checks the account and scopes every call to it.
import { createClient } from '@/shared/supabase/server';

import type { NativePlatform } from './rules';

export async function registerDevice(token: string, platform: NativePlatform): Promise<void> {
  const db = await createClient();
  const { error } = await db.rpc('device_register', { p_token: token, p_platform: platform });
  if (error) throw new Error(`The phone could not be registered: ${error.message}`);
}

export async function unregisterDevice(token: string): Promise<void> {
  const db = await createClient();
  const { error } = await db.rpc('device_unregister', { p_token: token });
  if (error) throw new Error(`The phone could not be removed: ${error.message}`);
}
