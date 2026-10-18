import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Architecture guard. See docs/ARCHITECTURE.md.
 *
 * - modules/<name>/internal is private to its module.
 * - shared/ is the common kernel and depends on no module or legacy folder.
 * - Domain modules never import view modules, and modules never form cycles.
 * - Pages, route handlers and components do not query the database directly.
 *   LEGACY_DIRECT_DB lists the files that still do; it may only shrink.
 */

const ROOT = process.cwd();
const SOURCE_DIRS = ['app', 'components', 'lib', 'modules', 'shared'];
const VIEW_MODULES = new Set(['workspace-views']);

/**
 * Files that still call .from()/.rpc() outside a module. Every page and route
 * now goes through a module, so this stays empty; do not add to it.
 */
const LEGACY_DIRECT_DB = new Set<string>([
]);

interface SourceFile { path: string; text: string; imports: string[] }

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function loadSources(): SourceFile[] {
  return SOURCE_DIRS.flatMap((dir) => walk(join(ROOT, dir))).map((full) => {
    const text = readFileSync(full, 'utf8');
    const imports = [...text.matchAll(/(?:from|import\(|vi\.mock\()\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    return { path: relative(ROOT, full).split(sep).join('/'), text, imports };
  });
}

/** Resolves an import to a repo path (without extension), or null for packages. */
function resolveImport(from: string, spec: string): string | null {
  if (spec.startsWith('@/')) return spec.slice(2);
  if (!spec.startsWith('.')) return null;
  const parts = from.split('/').slice(0, -1);
  for (const piece of spec.split('/')) {
    if (piece === '..') parts.pop();
    else if (piece !== '.') parts.push(piece);
  }
  return parts.join('/');
}

function moduleOf(path: string): string | null {
  const match = /^modules\/([^/]+)\//.exec(path + '/');
  return match ? match[1] : null;
}

const isTest = (path: string) => path.includes('/__tests__/');
const sources = loadSources();

describe('module boundaries', () => {
  it('keeps modules/<name>/internal private to its module', () => {
    const violations = sources.flatMap((file) =>
      file.imports.flatMap((spec) => {
        const target = resolveImport(file.path, spec);
        const owner = target && moduleOf(target);
        if (!target || !owner || !target.startsWith(`modules/${owner}/internal`)) return [];
        return moduleOf(file.path) === owner ? [] : [`${file.path} -> ${spec}`];
      }),
    );
    expect(violations).toEqual([]);
  });

  it('keeps shared/ free of module and legacy imports', () => {
    const violations = sources
      .filter((file) => file.path.startsWith('shared/'))
      .flatMap((file) =>
        file.imports
          .filter((spec) => {
            const target = resolveImport(file.path, spec);
            return target !== null && /^(modules|lib|components|app)\//.test(target);
          })
          .map((spec) => `${file.path} -> ${spec}`),
      );
    expect(violations).toEqual([]);
  });

  it('never lets a domain module import a view module', () => {
    const violations = sources.flatMap((file) => {
      const owner = moduleOf(file.path);
      if (!owner || VIEW_MODULES.has(owner)) return [];
      return file.imports
        .map((spec) => resolveImport(file.path, spec))
        .filter((target): target is string => target !== null && VIEW_MODULES.has(moduleOf(target) ?? ''))
        .map((target) => `${file.path} -> ${target}`);
    });
    expect(violations).toEqual([]);
  });

  it('has no import cycles between modules', () => {
    const graph = new Map<string, Set<string>>();
    for (const file of sources) {
      const owner = moduleOf(file.path);
      if (!owner || isTest(file.path)) continue;
      for (const spec of file.imports) {
        const target = resolveImport(file.path, spec);
        const dep = target && moduleOf(target);
        if (dep && dep !== owner) {
          if (!graph.has(owner)) graph.set(owner, new Set());
          graph.get(owner)!.add(dep);
        }
      }
    }
    const cycles: string[] = [];
    const state = new Map<string, 'visiting' | 'done'>();
    const visit = (node: string, trail: string[]) => {
      if (state.get(node) === 'done') return;
      if (state.get(node) === 'visiting') {
        cycles.push([...trail.slice(trail.indexOf(node)), node].join(' -> '));
        return;
      }
      state.set(node, 'visiting');
      for (const next of graph.get(node) ?? []) visit(next, [...trail, node]);
      state.set(node, 'done');
    };
    for (const node of graph.keys()) visit(node, []);
    expect(cycles).toEqual([]);
  });

  it('keeps direct database calls out of pages, routes and components', () => {
    const direct = sources
      .filter((file) => /^(app|components)\//.test(file.path) || /^modules\/[^/]+\/components\//.test(file.path))
      .filter((file) => !isTest(file.path) && /\.from\(['"]|\.rpc\(/.test(file.text))
      .map((file) => file.path);
    const unexpected = direct.filter((path) => !LEGACY_DIRECT_DB.has(path));
    const cleaned = [...LEGACY_DIRECT_DB].filter((path) => !direct.includes(path));
    expect(unexpected, 'move these queries into a module internal/ file').toEqual([]);
    expect(cleaned, 'these files are clean now: remove them from LEGACY_DIRECT_DB').toEqual([]);
  });
});
