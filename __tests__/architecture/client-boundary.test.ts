import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { expect, it } from 'vitest';

/**
 * A server file (no 'use client') may render a client component, but it must not call a plain
 * function or read a constant exported from a 'use client' file: on the server that export is only a
 * client reference, and calling it throws when the page renders ("This page didn't load"). Unit tests
 * render outside Next and never see it (the Master checklist failed this way on 6 November 2026).
 * Components are PascalCase; anything starting lower-case or in UPPER_CASE is flagged.
 */
const ROOT = process.cwd();
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    return statSync(path).isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}
const isClient = (text: string) => /^\s*['"]use client['"]/.test(text);
const FILES = new Map(['app', 'modules', 'shared'].flatMap((dir) => sources(join(ROOT, dir))).map((path) => [path, readFileSync(path, 'utf8')]));

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(ROOT, spec.slice(2)) : spec.startsWith('.') ? normalize(join(dirname(from), spec)) : null;
  if (!base) return null;
  return ['.tsx', '.ts', '/index.ts', '/index.tsx'].map((ext) => base + ext).find((path) => existsSync(path)) ?? null;
}

it('never calls a plain function from a client file inside a server file', () => {
  const offenders: string[] = [];
  for (const [path, text] of FILES) {
    if (isClient(text)) continue;
    for (const [, names, spec] of text.matchAll(/import\s+(?!type\b)\{([^}]*)\}\s+from\s+'([^']+)'/g)) {
      const target = resolve(path, spec);
      const targetText = target ? FILES.get(target) : undefined;
      if (!target || !targetText || !isClient(targetText)) continue;
      for (const raw of names.split(',')) {
        const name = raw.trim().split(/\s+as\s+/)[0].trim();
        if (!name || name.startsWith('type ')) continue;
        if (/^[a-z]/.test(name) || /^[A-Z0-9_]+$/.test(name)) offenders.push(`${relative(ROOT, path)} -> ${relative(ROOT, target)}: ${name}`);
      }
    }
  }
  expect(offenders).toEqual([]);
});
