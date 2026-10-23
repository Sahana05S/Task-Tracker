// Light / Dark / System appearance, chosen per device. No directive: the root
// layout (a server component) inlines THEME_SCRIPT, and the client provider in
// theme.tsx reuses the same rules, so the first paint and every later change agree.

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'taskpulse:theme';
/** Browser UI colour (`<meta name="theme-color">`) per theme: each theme's page background. */
export const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#f7f6fd', dark: '#101113' };
/** The public landing page keeps its own light look whatever the device prefers. */
export const LIGHT_ONLY_PATHS: readonly string[] = ['/'];

export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'dark' || value === 'system' ? value : 'light';
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean, pathname: string): ResolvedTheme {
  if (LIGHT_ONLY_PATHS.includes(pathname)) return 'light';
  return preference === 'dark' || (preference === 'system' && systemDark) ? 'dark' : 'light';
}

/**
 * Runs in <head> before the first paint: reads the stored choice and the OS
 * setting and stamps `data-theme` on <html>, so a dark page never flashes light.
 * Any failure (blocked storage, no matchMedia) leaves the light default.
 */
export const THEME_SCRIPT = `(function(){var e=document.documentElement,t='light';try{var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});`
  + `if(p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches))t='dark';`
  + `if(${JSON.stringify(LIGHT_ONLY_PATHS)}.indexOf(location.pathname)>=0)t='light'}catch(_){}`
  + `e.setAttribute('data-theme',t);e.style.colorScheme=t;`
  + `var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',${JSON.stringify(THEME_COLOR)}[t])})()`;
