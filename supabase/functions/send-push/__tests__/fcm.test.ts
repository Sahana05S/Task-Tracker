import { describe, expect, it } from 'vitest';

import { classifyFcmReply, fcmMessage, safePath, sameSecret, type PushItem } from '../fcm';

const item: PushItem = {
  id: '00000000-0000-0000-0000-000000000001',
  lease: '00000000-0000-0000-0000-000000000002',
  organizationId: '00000000-0000-0000-0000-000000000003',
  attempt: 1,
  token: 'fcm-token-abcdefghijklmnopqrstuvwxyz',
  platform: 'android',
  notificationId: '00000000-0000-0000-0000-000000000004',
  kind: 'task_assigned',
  title: 'New mission: T-12',
  body: '',
  href: '/tasks/T-12',
};

const fcmError = (status: string, errorCode?: string, message = '') => ({
  error: { status, message, details: errorCode ? [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }] : [] },
});

describe('send-push FCM helpers', () => {
  it('builds a v1 message with string data, the app channel and no empty body', () => {
    const { message } = fcmMessage(item);
    expect(message.token).toBe(item.token);
    expect(message.notification).toEqual({ title: 'New mission: T-12' });
    expect(message.data).toEqual({ href: '/tasks/T-12', notificationId: item.notificationId, kind: 'task_assigned' });
    expect(message.android.notification.channel_id).toBe('stellar_default');
    expect(fcmMessage({ ...item, body: 'Due Friday' }).message.notification).toEqual({ title: 'New mission: T-12', body: 'Due Friday' });
  });

  it('opens only in-app paths', () => {
    expect(safePath('/policies')).toBe('/policies');
    expect(safePath(null)).toBe('/dashboard');
    expect(safePath('https://evil.example')).toBe('/dashboard');
    expect(safePath('//evil.example')).toBe('/dashboard');
  });

  it('maps FCM replies to outbox outcomes', () => {
    expect(classifyFcmReply(200, { name: 'projects/p/messages/1' })).toEqual({ outcome: 'sent' });
    expect(classifyFcmReply(404, fcmError('NOT_FOUND', 'UNREGISTERED')).outcome).toBe('invalid_token');
    expect(classifyFcmReply(403, fcmError('PERMISSION_DENIED', 'SENDER_ID_MISMATCH')).outcome).toBe('invalid_token');
    expect(classifyFcmReply(400, fcmError('INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'The registration token is not a valid FCM registration token')).outcome).toBe('invalid_token');
    expect(classifyFcmReply(400, fcmError('INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'Invalid JSON payload')).outcome).toBe('failed');
    expect(classifyFcmReply(429, fcmError('RESOURCE_EXHAUSTED', 'QUOTA_EXCEEDED')).outcome).toBe('retry');
    expect(classifyFcmReply(503, null)).toEqual({ outcome: 'retry', error: 'HTTP_503' });
    expect(classifyFcmReply(401, fcmError('UNAUTHENTICATED', 'THIRD_PARTY_AUTH_ERROR'))).toMatchObject({ outcome: 'retry', configError: true });
  });

  it('compares the bearer secret exactly', () => {
    expect(sameSecret('a'.repeat(40), 'a'.repeat(40))).toBe(true);
    expect(sameSecret('a'.repeat(40), `${'a'.repeat(39)}b`)).toBe(false);
    expect(sameSecret('short', 'a'.repeat(40))).toBe(false);
  });
});
