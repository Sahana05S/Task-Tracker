'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { NOTIFICATIONS_CHANGED_EVENT } from '@/modules/notifications/client';
import { THEME_COLOR } from '@/shared/ui/theme-script';

import { registerDeviceAction } from '@/modules/mobile/actions';
import { isNativeApp, storePushToken } from '@/modules/mobile/internal/native';
import { backAction, isNativePlatform, tapPath } from '@/modules/mobile/internal/rules';

interface Handle {
  remove: () => Promise<void>;
}

/** Status bar below the page, in the page's colours, following Light/Dark changes. */
async function followTheme(): Promise<() => void> {
  const { StatusBar, Style } = await import('@capacitor/status-bar');
  const apply = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
    void StatusBar.setBackgroundColor({ color: THEME_COLOR[dark ? 'dark' : 'light'] }).catch(() => undefined);
  };
  await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => undefined);
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/** Back closes an open dialog or menu first, then goes back, then leaves the app. */
async function handleBack(): Promise<Handle> {
  const { App } = await import('@capacitor/app');
  return App.addListener('backButton', ({ canGoBack }) => {
    const dialogOpen = document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"]') !== null;
    const action = backAction(dialogOpen, canGoBack);
    if (action === 'close-dialog') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    else if (action === 'back') window.history.back();
    else void App.minimizeApp();
  });
}

/** Asks once for permission, registers with FCM and saves the token for this member. */
async function setUpPush(open: (path: string) => void): Promise<Handle[]> {
  const [{ Capacitor }, { PushNotifications }] = await Promise.all([import('@capacitor/core'), import('@capacitor/push-notifications')]);
  const platform = Capacitor.getPlatform();
  const changed = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  const handles = await Promise.all([
    PushNotifications.addListener('registration', ({ value }) => {
      storePushToken(value);
      if (isNativePlatform(platform)) void registerDeviceAction(value, platform);
    }),
    PushNotifications.addListener('registrationError', (error) => console.warn('Phone notifications could not be set up', error.error)),
    // Shown by the system while the app is in the background; in the foreground the bell updates.
    PushNotifications.addListener('pushNotificationReceived', changed),
    PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
      changed();
      open(tapPath(notification.data));
    }),
  ]);
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') permission = await PushNotifications.requestPermissions();
  if (permission.receive === 'granted') await PushNotifications.register();
  return handles;
}

/**
 * Mounted once in the signed-in workspace. In a browser it does nothing; in the
 * Android app it registers the phone for notifications (re-saved on every start),
 * opens a tapped notification's page, maps the back button and colours the status bar.
 */
export function NativeBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!isNativeApp()) return;
    let stopped = false;
    const cleanups: (() => void)[] = [];
    const keep = (cleanup: () => void) => (stopped ? cleanup() : cleanups.push(cleanup));
    const fail = (what: string) => (error: unknown) => console.warn(`Native ${what} unavailable`, error);

    followTheme().then(keep, fail('status bar'));
    handleBack().then((h) => keep(() => void h.remove()), fail('back button'));
    setUpPush((path) => router.push(path)).then((hs) => keep(() => hs.forEach((h) => void h.remove())), fail('notifications'));

    return () => {
      stopped = true;
      cleanups.splice(0).forEach((cleanup) => cleanup());
    };
  }, [router]);

  return null;
}
