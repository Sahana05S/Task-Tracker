import { describe, expect, it } from 'vitest';
import { SPLASH_FORCE_QUERY, SPLASH_SCRIPT, SPLASH_STORAGE_KEY } from '../splash-script';

/** Runs the pre-paint script against a fake page and reports what it stamped and stored. */
function open({ webdriver = false, search = '', motion = null as string | null, osReduced = false, seen = false, storageThrows = false } = {}) {
  const attrs: Record<string, string> = {};
  const store = new Map<string, string>(seen ? [[SPLASH_STORAGE_KEY, '1']] : []);
  const localStorage = {
    getItem: (key: string) => { if (storageThrows) throw new Error('blocked'); return store.get(key) ?? null; },
    setItem: (key: string, value: string) => { store.set(key, value); },
  };
  const run = new Function('document', 'navigator', 'location', 'window', 'localStorage', SPLASH_SCRIPT);
  run(
    { documentElement: { getAttribute: (name: string) => (name === 'data-motion' ? motion : null), setAttribute: (name: string, value: string) => { attrs[name] = value; } } },
    { webdriver },
    { search },
    { matchMedia: (query: string) => ({ matches: query.includes('reduce') && osReduced }) },
    localStorage,
  );
  return { splash: attrs['data-splash'], stored: store.get(SPLASH_STORAGE_KEY) };
}

describe('post-sign-in splash script', () => {
  it('plays once per sign-in on this device and remembers that it did', () => {
    expect(open()).toEqual({ splash: 'on', stored: '1' });
    expect(open({ seen: true }).splash).toBeUndefined();
  });

  it('never plays for automation unless the screenshot flag is set', () => {
    expect(open({ webdriver: true }).splash).toBeUndefined();
    expect(open({ webdriver: true, search: '?splash=1' }).splash).toBe('on');
    expect(open({ webdriver: true, search: '?due=today&splash=1' }).splash).toBe('on');
    expect(SPLASH_FORCE_QUERY.test('?splash=10')).toBe(false);
  });

  it('never plays under reduced motion, from the OS or the app switch', () => {
    expect(open({ osReduced: true }).splash).toBeUndefined();
    expect(open({ motion: 'reduce' }).splash).toBeUndefined();
  });

  it('survives blocked storage by showing nothing', () => {
    expect(open({ storageThrows: true }).splash).toBeUndefined();
  });

  it('is plain inline script: one statement, no module syntax, no newlines', () => {
    expect(SPLASH_SCRIPT).not.toMatch(/\n|import |export /);
    expect(SPLASH_SCRIPT.startsWith('(function(){')).toBe(true);
  });
});
