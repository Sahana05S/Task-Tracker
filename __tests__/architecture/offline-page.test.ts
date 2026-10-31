import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Android app's offline page (/offline, M21) is kept by a service worker
 * and may be shown from an older build. A Server Action id from that build
 * would no longer exist, and a request-time API would make the page personal
 * or uncachable. So nothing the page imports, directly or indirectly, may be a
 * Server Action file or read cookies/headers.
 */

const ROOT = process.cwd();
const ENTRY = 'app/offline/page.tsx';

function resolveFile(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = spec.slice(2);
  else if (spec.startsWith('.')) {
    const parts = from.split('/').slice(0, -1);
    for (const piece of spec.split('/')) {
      if (piece === '..') parts.pop();
      else if (piece !== '.') parts.push(piece);
    }
    base = parts.join('/');
  } else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (/\.(ts|tsx)$/.test(candidate) && existsSync(join(ROOT, candidate))) return candidate;
  }
  return null;
}

function importGraph(entry: string): Map<string, string> {
  const seen = new Map<string, string>([[entry, readFileSync(join(ROOT, entry), 'utf8')]]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    const text = seen.get(file)!;
    // Type-only imports carry no code into the page.
    for (const match of text.matchAll(/(?:import|export)\s+(?!type\b)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]/g)) {
      const target = resolveFile(file, match[1] ?? match[2]);
      if (target && !seen.has(target)) {
        seen.set(target, readFileSync(join(ROOT, target), 'utf8'));
        queue.push(target);
      }
    }
  }
  return seen;
}

describe('offline page', () => {
  const graph = importGraph(ENTRY);

  it('walks into the offline module', () => {
    expect(graph.has('modules/offline/components/offline-app.tsx')).toBe(true);
    expect(graph.has('modules/offline/internal/store.ts')).toBe(true);
  });

  it('imports no Server Action, directly or indirectly', () => {
    const actions = [...graph].filter(([path, text]) => /(^|\/)[a-z-]*actions\.ts$/.test(path) || /^\s*['"]use server['"]/.test(text)).map(([path]) => path);
    expect(actions).toEqual([]);
  });

  it('reads no cookies, headers or session', () => {
    const requestTime = [...graph].filter(([, text]) => /from\s*['"](next\/headers|@\/shared\/session[^'"]*|@\/shared\/supabase\/server)['"]/.test(text)).map(([path]) => path);
    expect(requestTime).toEqual([]);
  });

  it('is built once per deploy', () => {
    expect(graph.get(ENTRY)).toMatch(/export const dynamic = 'force-static'/);
  });
});
