import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { isProtectedPath, PROTECTED_PREFIXES } from '@/lib/auth/protected-routes';

describe('protected workspace routes', () => {
  it('guards every workspace route at the edge', () => {
    const workspaceRoutes = readWorkspaceRoutePrefixes();

    expect(workspaceRoutes.every((route) => isProtectedPath(route))).toBe(true);
    expect([...PROTECTED_PREFIXES].sort()).toEqual(workspaceRoutes);
  });

  it('guards nested workspace routes', () => {
    expect(isProtectedPath('/tasks/Sep26_T1')).toBe(true);
    expect(isProtectedPath('/tasks/Sep26_T1/checklist')).toBe(true);
    expect(isProtectedPath('/team/SRB-HRC/reports')).toBe(true);
  });

  it('leaves public routes public', () => {
    expect(isProtectedPath('/')).toBe(false);
    expect(isProtectedPath('/login')).toBe(false);
    expect(isProtectedPath('/auth/callback')).toBe(false);
  });
});

function readWorkspaceRoutePrefixes(): string[] {
  const workspaceRoot = join(process.cwd(), 'app', '(workspace)');

  return readdirSync(workspaceRoot)
    .filter((entry) => {
      const fullPath = join(workspaceRoot, entry);
      return (
        statSync(fullPath).isDirectory() &&
        !entry.startsWith('_') &&
        routeDirectoryHasPage(fullPath)
      );
    })
    .map((entry) => `/${entry}`)
    .sort();
}

function routeDirectoryHasPage(directory: string): boolean {
  if (existsSync(join(directory, 'page.tsx'))) return true;

  return readdirSync(directory).some((entry) => {
    const fullPath = join(directory, entry);
    return statSync(fullPath).isDirectory() && routeDirectoryHasPage(fullPath);
  });
}
