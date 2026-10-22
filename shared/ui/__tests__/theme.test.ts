import { describe, expect, it } from 'vitest';
import { LIGHT_ONLY_PATHS, THEME_SCRIPT, THEME_STORAGE_KEY, parseThemePreference, resolveTheme } from '../theme-script';

/** Runs the pre-paint script against a fake page and returns what it stamped on <html>. */
function paint({ stored, systemDark = false, pathname = '/today', storageThrows = false }: { stored?: string | null; systemDark?: boolean; pathname?: string; storageThrows?: boolean }) {
  const attrs: Record<string, string> = {};
  const style: Record<string, string> = {};
  const localStorage = {
    getItem: (key: string) => {
      if (storageThrows) throw new Error('blocked');
      return key === THEME_STORAGE_KEY ? stored ?? null : null;
    },
  };
  const run = new Function('document', 'localStorage', 'window', 'location', THEME_SCRIPT);
  run(
    { documentElement: { setAttribute: (name: string, value: string) => { attrs[name] = value; }, style } },
    localStorage,
    { matchMedia: (query: string) => ({ matches: query.includes('dark') && systemDark }) },
    { pathname },
  );
  return { theme: attrs['data-theme'], colorScheme: style.colorScheme };
}

describe('theme preference', () => {
  it('reads light, dark and system and falls back to light', () => {
    expect(parseThemePreference('dark')).toBe('dark');
    expect(parseThemePreference('system')).toBe('system');
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference(null)).toBe('light');
    expect(parseThemePreference('blue')).toBe('light');
  });

  it('resolves system against the OS and forces the landing page light', () => {
    expect(resolveTheme('system', true, '/today')).toBe('dark');
    expect(resolveTheme('system', false, '/today')).toBe('light');
    expect(resolveTheme('dark', false, '/login')).toBe('dark');
    expect(resolveTheme('dark', true, '/')).toBe('light');
    expect(LIGHT_ONLY_PATHS).toContain('/');
  });
});

describe('pre-paint theme script', () => {
  it('stamps the stored choice before the first paint', () => {
    expect(paint({ stored: 'dark' })).toEqual({ theme: 'dark', colorScheme: 'dark' });
    expect(paint({ stored: 'light', systemDark: true })).toEqual({ theme: 'light', colorScheme: 'light' });
    expect(paint({ stored: null, systemDark: true })).toEqual({ theme: 'light', colorScheme: 'light' });
  });

  it('follows the OS only in system mode', () => {
    expect(paint({ stored: 'system', systemDark: true }).theme).toBe('dark');
    expect(paint({ stored: 'system', systemDark: false }).theme).toBe('light');
  });

  it('keeps the landing page light and survives blocked storage', () => {
    expect(paint({ stored: 'dark', pathname: '/' }).theme).toBe('light');
    expect(paint({ stored: 'dark', pathname: '/reset-password' }).theme).toBe('dark');
    expect(paint({ stored: 'dark', storageThrows: true }).theme).toBe('light');
  });

  it('is plain inline script: one statement, no module syntax, no newlines', () => {
    expect(THEME_SCRIPT).not.toMatch(/\n|import |export /);
    expect(THEME_SCRIPT.startsWith('(function(){')).toBe(true);
  });
});
