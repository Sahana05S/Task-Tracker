/**
 * Pure helpers for send-push (no Deno APIs, so vitest covers them):
 * the FCM HTTP v1 message for one outbox row, and what an FCM reply means for
 * that row (migration 91's push_complete outcomes).
 */

export interface PushItem {
  id: string;
  lease: string;
  organizationId: string;
  attempt: number;
  token: string;
  platform: 'android' | 'ios';
  notificationId: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
}

export type PushOutcome = 'sent' | 'retry' | 'invalid_token' | 'failed';

export interface PushResult {
  id: string;
  lease: string;
  outcome: PushOutcome;
  error?: string;
}

/** The Android channel the app creates on start (stellar-mobile Notifications.java; also Firebase's default). */
export const ANDROID_CHANNEL_ID = 'stellar_default';

/** In-app paths only, the same rule as notifications.href (migration 56). */
export function safePath(href: string | null): string {
  return href && /^\/[A-Za-z0-9/_?=&%.-]{0,199}$/.test(href) && !href.startsWith('//') ? href : '/';
}

export function fcmMessage(item: PushItem) {
  return {
    message: {
      token: item.token,
      notification: { title: item.title, ...(item.body ? { body: item.body } : {}) },
      // Data values must be strings; the app opens `href` when the notification is tapped.
      data: { href: safePath(item.href), notificationId: item.notificationId, kind: item.kind },
      android: {
        priority: 'HIGH',
        collapse_key: item.kind,
        notification: { channel_id: ANDROID_CHANNEL_ID, tag: item.notificationId },
      },
      apns: { payload: { aps: { sound: 'default' } } },
    },
  };
}

interface FcmErrorBody {
  error?: { status?: string; message?: string; details?: { '@type'?: string; errorCode?: string }[] };
}

/** Maps an FCM v1 reply to an outbox outcome. `configError` stops the batch (bad credentials). */
export function classifyFcmReply(status: number, body: unknown): { outcome: PushOutcome; error?: string; configError?: boolean } {
  if (status >= 200 && status < 300) return { outcome: 'sent' };
  const err = (body as FcmErrorBody | null)?.error;
  const code = err?.details?.find((d) => d.errorCode)?.errorCode ?? err?.status ?? `HTTP_${status}`;
  const error = `${code}${err?.message ? `: ${err.message}` : ''}`.slice(0, 300);
  // A token from another Firebase project is as unusable as an expired one.
  if (code === 'UNREGISTERED' || code === 'SENDER_ID_MISMATCH' || status === 404) return { outcome: 'invalid_token', error };
  if (code === 'INVALID_ARGUMENT' && /token/i.test(err?.message ?? '')) return { outcome: 'invalid_token', error };
  // Credentials: every row would fail the same way, so keep them waiting and stop.
  if (status === 401 || status === 403 || code === 'THIRD_PARTY_AUTH_ERROR') return { outcome: 'retry', error, configError: true };
  if (status === 429 || status >= 500 || code === 'UNAVAILABLE' || code === 'INTERNAL' || code === 'QUOTA_EXCEEDED') {
    return { outcome: 'retry', error };
  }
  return { outcome: 'failed', error };
}

/** Constant-time comparison of the bearer secret. */
export function sameSecret(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i += 1) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
