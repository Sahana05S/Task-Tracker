'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';

import {
  THEME_COLOR,
  THEME_STORAGE_KEY,
  parseThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '@/shared/ui/theme-script';

export type { ResolvedTheme, ThemePreference } from '@/shared/ui/theme-script';

interface ThemeContextValue {
  /** What the viewer chose on this device (Light on the server and until hydration). */
  preference: ThemePreference;
  /** What is painted now: System resolved against the OS, landing page forced light. */
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = React.createContext<ThemeContextValue>({
  preference: 'light',
  resolved: 'light',
  setPreference: () => undefined,
});

const DARK_QUERY = '(prefers-color-scheme: dark)';

// The stored choice is an external store: other tabs change it through the
// `storage` event, this tab through setPreference, which notifies by hand.
const listeners = new Set<() => void>();
function subscribePreference(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === THEME_STORAGE_KEY) listener(); };
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
function subscribeSystem(listener: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
const systemDark = () => window.matchMedia(DARK_QUERY).matches;
const serverLight = () => 'light' as const;
const serverNotDark = () => false;

/**
 * Keeps `data-theme` on <html> in step with the viewer's choice, the OS setting
 * (for System) and the route. The inline script in the root layout paints the
 * first frame; after hydration this writes the same value (idempotent), so a
 * reload shows no light flash.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const preference = React.useSyncExternalStore(subscribePreference, readPreference, serverLight);
  const dark = React.useSyncExternalStore(subscribeSystem, systemDark, serverNotDark);
  const resolved = resolveTheme(preference, dark, pathname);

  React.useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', resolved);
    root.style.colorScheme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved]);
  }, [resolved]);

  const setPreference = React.useCallback((next: ThemePreference) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Blocked storage: readPreference keeps returning light, so the choice cannot hold.
    }
    listeners.forEach((listener) => listener());
  }, []);

  const value = React.useMemo<ThemeContextValue>(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return React.useContext(ThemeContext);
}
