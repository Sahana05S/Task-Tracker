'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';

import {
  MOTION_STORAGE_KEY,
  THEME_COLOR,
  THEME_STORAGE_KEY,
  parseMotionPreference,
  parseThemePreference,
  resolveTheme,
  type MotionPreference,
  type ResolvedTheme,
  type ThemePreference,
} from '@/shared/ui/theme-script';

export type { MotionPreference, ResolvedTheme, ThemePreference } from '@/shared/ui/theme-script';

interface ThemeContextValue {
  /** What the viewer chose on this device (Light on the server and until hydration). */
  preference: ThemePreference;
  /** What is painted now: System resolved against the OS, landing page forced light. */
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  /** Reduce motion on this device (Normal on the server and until hydration). */
  motion: MotionPreference;
  setMotion: (motion: MotionPreference) => void;
}

const ThemeContext = React.createContext<ThemeContextValue>({
  preference: 'light',
  resolved: 'light',
  setPreference: () => undefined,
  motion: 'normal',
  setMotion: () => undefined,
});

const DARK_QUERY = '(prefers-color-scheme: dark)';

// Each stored choice is an external store: other tabs change it through the
// `storage` event, this tab through the setter, which notifies by hand.
const listeners = new Set<() => void>();
function subscribeStored(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === THEME_STORAGE_KEY || event.key === MOTION_STORAGE_KEY) listener(); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}
function readPreference(): ThemePreference {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'light';
  }
}
function readMotion(): MotionPreference {
  try {
    return parseMotionPreference(window.localStorage.getItem(MOTION_STORAGE_KEY));
  } catch {
    return 'normal';
  }
}
function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Blocked storage: the reader keeps returning the default, so the choice cannot hold.
  }
  listeners.forEach((listener) => listener());
}
function subscribeSystem(listener: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
const systemDark = () => window.matchMedia(DARK_QUERY).matches;
const serverLight = () => 'light' as const;
const serverNotDark = () => false;
const serverNormal = () => 'normal' as const;

/**
 * Keeps `data-theme` on <html> in step with the viewer's choice, the OS setting
 * (for System) and the route. The inline script in the root layout paints the
 * first frame; after hydration this writes the same value (idempotent), so a
 * reload shows no light flash.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const preference = React.useSyncExternalStore(subscribeStored, readPreference, serverLight);
  const motion = React.useSyncExternalStore(subscribeStored, readMotion, serverNormal);
  const dark = React.useSyncExternalStore(subscribeSystem, systemDark, serverNotDark);
  const resolved = resolveTheme(preference, dark, pathname);

  React.useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', resolved);
    root.style.colorScheme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved]);
  }, [resolved]);

  // Same stamp as the inline script; removing the attribute restores animation at once.
  React.useEffect(() => {
    const root = document.documentElement;
    if (motion === 'reduce') root.setAttribute('data-motion', 'reduce');
    else root.removeAttribute('data-motion');
  }, [motion]);

  const setPreference = React.useCallback((next: ThemePreference) => writeStored(THEME_STORAGE_KEY, next), []);
  const setMotion = React.useCallback((next: MotionPreference) => writeStored(MOTION_STORAGE_KEY, next), []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference, motion, setMotion }),
    [preference, resolved, setPreference, motion, setMotion],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return React.useContext(ThemeContext);
}
