// PRIVATE (client-safe via client.ts). Browser-side helpers for the Android
// app (stellar-mobile, a Capacitor shell that loads this site). The Capacitor
// packages are imported on demand, and only after the shell's bridge is found,
// so a normal browser never loads or runs them.

import { isPushToken, PUSH_TOKEN_STORAGE_KEY } from './rules';

/** True inside the Android (or a future iOS) app; false in any browser and on the server. */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const bridge = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof bridge?.isNativePlatform === 'function' && bridge.isNativePlatform();
}

interface NativePrintPlugin {
  print(): Promise<void>;
}

/**
 * Prints the page: the browser's dialog, or inside the app Android's print
 * service (the shell's NativePrint plugin; Android WebView ignores window.print()).
 * Both offer "Save as PDF".
 */
export async function printPage(): Promise<void> {
  if (!isNativeApp()) {
    window.print();
    return;
  }
  const { registerPlugin } = await import('@capacitor/core');
  await registerPlugin<NativePrintPlugin>('NativePrint').print();
}

export function storedPushToken(): string | null {
  try {
    const token = window.localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
    return isPushToken(token) ? token : null;
  } catch {
    return null;
  }
}

export function storePushToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
  } catch {
    // Private storage off: sign-out then leaves the phone registered until the next sign-in re-points it.
  }
}

/**
 * Before signing out in the app: stop notifications to this phone. Never holds
 * sign-out up for more than three seconds, and does nothing in a browser.
 */
export async function forgetThisDevice(): Promise<void> {
  if (!isNativeApp()) return;
  const token = storedPushToken();
  if (!token) return;
  storePushToken(null);
  await Promise.race([
    // Loaded on demand, so the edge proxy's import of this module carries no server action.
    import('@/modules/mobile/actions').then(({ unregisterDeviceAction }) => unregisterDeviceAction(token)).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}
