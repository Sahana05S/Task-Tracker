import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Conflict errors must not use SQLSTATE 40001.
 *
 * PostgREST 14 retries any transaction that ends in 40001 without limit, so a
 * command that raises it for a stale version or a reused operation key loops
 * forever. Migration 52 moved every existing command to PT409 (HTTP 409); these
 * checks keep later migrations and app code from bringing 40001 back.
 */

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const FIRST_GUARDED = 53;

/** Raising or trapping SQLSTATE 40001 in any spelling. */
const RAISES_40001 = /errcode\s*=\s*'40001'|sqlstate\s*'40001'|\bserialization_failure\b/i;
/** Comparing an error code with '40001' instead of calling isConflictCode. */
const COMPARES_40001 = /(?:[!=]==?)\s*["'`]40001["'`]|["'`]40001["'`]\s*(?:[!=]==?)|case\s+["'`]40001["'`]/;

/** Drops block comments and whole-line comments only, so string literals stay intact. */
function withoutComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--[^\n]*$/gm, '');
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('conflict SQLSTATE', () => {
  it('no migration from 53 on raises 40001 or traps serialization_failure', () => {
    const offenders = readdirSync(MIGRATIONS)
      .filter((name) => /^\d+_.*\.sql$/.test(name) && Number(name.split('_')[0]) >= FIRST_GUARDED)
      .filter((name) => {
        const sql = withoutComments(readFileSync(join(MIGRATIONS, name), 'utf8'));
        return RAISES_40001.test(sql);
      });
    expect(offenders).toEqual([]);
  });

  it('the patterns catch the spellings they are meant to catch', () => {
    expect(RAISES_40001.test("RAISE EXCEPTION 'Changed -- reload' USING ERRCODE = '40001';")).toBe(true);
    expect(RAISES_40001.test("EXCEPTION WHEN SQLSTATE '40001' THEN")).toBe(true);
    expect(RAISES_40001.test('EXCEPTION WHEN serialization_failure THEN')).toBe(true);
    expect(RAISES_40001.test("RAISE EXCEPTION 'x' USING ERRCODE = 'PT409';")).toBe(false);
    expect(COMPARES_40001.test('error.code === "40001"')).toBe(true);
    expect(COMPARES_40001.test("case '40001':")).toBe(true);
    expect(COMPARES_40001.test('isConflictCode(error.code)')).toBe(false);
  });

  it('migration 52 converts conflicts to PT409', () => {
    const sql = withoutComments(readFileSync(join(MIGRATIONS, '52_conflict_errors_without_retry.sql'), 'utf8'));
    expect(sql).toContain("ERRCODE=''PT409''");
    expect(sql).toContain('m15_secure()');
  });

  it('app code reads conflicts only through isConflictCode', () => {
    const allowed = new Set([join('shared', 'commands', 'conflict.ts')]);
    const offenders = ['app', 'modules', 'shared']
      .flatMap((dir) => sourceFiles(join(ROOT, dir)))
      .map((path) => relative(ROOT, path))
      .filter((path) => !path.split(sep).includes('__tests__') && !allowed.has(path))
      .filter((path) => COMPARES_40001.test(readFileSync(join(ROOT, path), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
