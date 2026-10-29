'use server';

// PUBLIC server actions of the mobile module, called by the native bridge in
// the Android app. The database allows only the signed-in, active member's own phone.
import type { ActionResponse } from '@/types/tracker';

import { registerDevice, unregisterDevice } from '@/modules/mobile/internal/commands';
import { isNativePlatform, isPushToken } from '@/modules/mobile/internal/rules';

/** Saves this phone's push token for the signed-in member (called on every app start). */
export async function registerDeviceAction(token: string, platform: string): Promise<ActionResponse<null>> {
  if (!isPushToken(token) || !isNativePlatform(platform)) return { success: false, error: 'This phone could not be set up for notifications.', errorCode: 'validation' };
  try {
    await registerDevice(token, platform);
    return { success: true, data: null };
  } catch {
    return { success: false, error: 'This phone could not be set up for notifications.', errorCode: 'unavailable' };
  }
}

/** Stops notifications to this phone; called just before signing out. */
export async function unregisterDeviceAction(token: string): Promise<ActionResponse<null>> {
  if (!isPushToken(token)) return { success: false, error: 'Unknown phone.', errorCode: 'validation' };
  try {
    await unregisterDevice(token);
    return { success: true, data: null };
  } catch {
    return { success: false, error: 'This phone could not be removed.', errorCode: 'unavailable' };
  }
}
