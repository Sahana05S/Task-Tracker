// PRIVATE (client-safe via client.ts). Pure rules for the Android app bridge.

export type NativePlatform = 'android' | 'ios';

/**
 * The Android shell appends this to the WebView's User-Agent
 * (stellar-mobile, capacitor.config.ts `appendUserAgent`), so the server can
 * tell an app request from a browser before any page renders.
 */
export const NATIVE_APP_USER_AGENT = 'StellarApp';

/** True for a request from the Android app, judged by its User-Agent header. */
export function isNativeAppRequest(userAgent: string | null | undefined): boolean {
  return typeof userAgent === 'string' && userAgent.includes(NATIVE_APP_USER_AGENT);
}

/** An FCM registration token, as migration 91's device_register accepts it. */
export const PUSH_TOKEN_PATTERN = /^[A-Za-z0-9:_.-]{20,4096}$/;

/** Where the bridge keeps this phone's token, so sign-out can remove it. */
export const PUSH_TOKEN_STORAGE_KEY = 'stellar.pushToken';

export function isPushToken(value: unknown): value is string {
  return typeof value === 'string' && PUSH_TOKEN_PATTERN.test(value);
}

export function isNativePlatform(value: unknown): value is NativePlatform {
  return value === 'android' || value === 'ios';
}

/**
 * The in-app page a tapped phone notification opens: its `href` when that is an
 * in-app path (the same rule as notifications.href), else the dashboard.
 */
export function tapPath(data: unknown): string {
  const href = typeof data === 'object' && data !== null ? (data as { href?: unknown }).href : null;
  return typeof href === 'string' && /^\/[A-Za-z0-9/_?=&%.-]{0,199}$/.test(href) && !href.startsWith('//') ? href : '/dashboard';
}

/** What the Android back button does: close an open dialog, go back, or leave the app. */
export function backAction(dialogOpen: boolean, canGoBack: boolean): 'close-dialog' | 'back' | 'minimize' {
  if (dialogOpen) return 'close-dialog';
  return canGoBack ? 'back' : 'minimize';
}
