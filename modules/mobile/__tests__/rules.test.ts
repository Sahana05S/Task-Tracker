import { describe, expect, it } from 'vitest';

import { backAction, isNativePlatform, isPushToken, tapPath } from '@/modules/mobile/internal/rules';
import { isNativeApp } from '@/modules/mobile/internal/native';

describe('Android app bridge rules', () => {
  it('opens only in-app paths from a tapped notification', () => {
    expect(tapPath({ href: '/tasks/T-12', kind: 'task_assigned' })).toBe('/tasks/T-12');
    expect(tapPath({ href: '/awards?month=2026-10' })).toBe('/awards?month=2026-10');
    expect(tapPath({ href: 'https://evil.example/' })).toBe('/dashboard');
    expect(tapPath({ href: '//evil.example' })).toBe('/dashboard');
    expect(tapPath({})).toBe('/dashboard');
    expect(tapPath(null)).toBe('/dashboard');
  });

  it('accepts FCM tokens and the two native platforms only', () => {
    expect(isPushToken('dXk3:APA91bH_abc-def.ghiJKLmnopQRS')).toBe(true);
    expect(isPushToken('short')).toBe(false);
    expect(isPushToken('has spaces in it, not a token at all')).toBe(false);
    expect(isNativePlatform('android')).toBe(true);
    expect(isNativePlatform('web')).toBe(false);
  });

  it('closes a dialog first, then goes back, then leaves the app', () => {
    expect(backAction(true, true)).toBe('close-dialog');
    expect(backAction(false, true)).toBe('back');
    expect(backAction(false, false)).toBe('minimize');
  });

  it('is not the app on the server or in a plain browser', () => {
    expect(isNativeApp()).toBe(false);
  });
});
