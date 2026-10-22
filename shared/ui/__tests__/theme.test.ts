import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIGHT_ONLY_PATHS, THEME_COLOR, THEME_SCRIPT, THEME_STORAGE_KEY, parseThemePreference, resolveTheme } from '../theme-script';

/** Runs the pre-paint script against a fake page and returns what it stamped on <html>. */
function paint({ stored, systemDark = false, pathname = '/today', storageThrows = false }: { stored?: string | null; systemDark?: boolean; pathname?: string; storageThrows?: boolean }) {
  const attrs: Record<string, string> = {};
  const style: Record<string, string> = {};
  const meta: Record<string, string> = {};
  const localStorage = {
    getItem: (key: string) => {
      if (storageThrows) throw new Error('blocked');
      return key === THEME_STORAGE_KEY ? stored ?? null : null;
    },
  };
  const run = new Function('document', 'localStorage', 'window', 'location', THEME_SCRIPT);
  run(
    {
      documentElement: { setAttribute: (name: string, value: string) => { attrs[name] = value; }, style },
      querySelector: (selector: string) => (selector.includes('theme-color') ? { setAttribute: (name: string, value: string) => { meta[name] = value; } } : null),
    },
    localStorage,
    { matchMedia: (query: string) => ({ matches: query.includes('dark') && systemDark }) },
    { pathname },
  );
  return { theme: attrs['data-theme'], colorScheme: style.colorScheme, themeColor: meta.content };
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
    expect(paint({ stored: 'dark' })).toEqual({ theme: 'dark', colorScheme: 'dark', themeColor: '#0d1020' });
    expect(paint({ stored: 'light', systemDark: true })).toEqual({ theme: 'light', colorScheme: 'light', themeColor: '#f7f6fd' });
    expect(paint({ stored: null, systemDark: true })).toEqual({ theme: 'light', colorScheme: 'light', themeColor: '#f7f6fd' });
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

  it('points the browser UI colour at each theme’s page background', () => {
    const css = readFileSync(join(__dirname, '..', '..', '..', 'app', 'globals.css'), 'utf8');
    const background = (block: string) => block.match(/--background:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(background(css.slice(css.indexOf(':root {')))).toBe(THEME_COLOR.light);
    expect(background(css.slice(css.indexOf("[data-theme='dark'] {")))).toBe(THEME_COLOR.dark);
  });

  it('is plain inline script: one statement, no module syntax, no newlines', () => {
    expect(THEME_SCRIPT).not.toMatch(/\n|import |export /);
    expect(THEME_SCRIPT.startsWith('(function(){')).toBe(true);
  });
});
