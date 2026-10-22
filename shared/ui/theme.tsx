'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { MonitorIcon, MoonIcon, SunIcon, type LucideIcon } from 'lucide-react';

import {
  THEME_STORAGE_KEY,
  parseThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '@/shared/ui/theme-script';

export type { ResolvedTheme, ThemePreference } from '@/shared/ui/theme-script';

interface ThemeContextValue {
  /** What the viewer chose on this device (Light until read). */
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

/** The three choices, in the order the account menu and Settings show them. */
export const THEME_OPTIONS: readonly { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
];

const DARK_QUERY = '(prefers-color-scheme: dark)';

function readPreference(): ThemePreference {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'light';
  }
}

/**
 * Keeps `data-theme` on <html> in step with the viewer's choice, the OS setting
 * (for System) and the route. The inline script in the root layout paints the
 * first frame; this takes over after hydration and never repaints before it
 * has read the stored choice, so a reload shows no light flash.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [preference, setPreferenceState] = React.useState<ThemePreference | null>(null);
  const [systemDark, setSystemDark] = React.useState(false);

  React.useEffect(() => {
    setPreferenceState(readPreference());
    const media = window.matchMedia(DARK_QUERY);
    setSystemDark(media.matches);
    const onMedia = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    // Another tab changed the choice.
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) setPreferenceState(parseThemePreference(event.newValue));
    };
    media.addEventListener('change', onMedia);
    window.addEventListener('storage', onStorage);
    return () => {
      media.removeEventListener('change', onMedia);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const resolved = preference ? resolveTheme(preference, systemDark, pathname) : null;
  React.useEffect(() => {
    if (!resolved) return;
    const root = document.documentElement;
    root.setAttribute('data-theme', resolved);
    root.style.colorScheme = resolved;
  }, [resolved]);

  const setPreference = React.useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Blocked storage: the choice holds for this visit only.
    }
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ preference: preference ?? 'light', resolved: resolved ?? 'light', setPreference }),
    [preference, resolved, setPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return React.useContext(ThemeContext);
}
