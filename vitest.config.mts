import { configDefaults, defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts'],
    // Session worktrees live under .claude/worktrees; they are separate checkouts.
    exclude: [...configDefaults.exclude, '.claude/**'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts', 'shared/**/*.ts', 'modules/**/*.ts'],
      exclude: [
        'shared/supabase/**', // Supabase client wrappers — need a live connection
        '**/queries.ts',      // DB query helpers — integration territory
        '**/mappers.ts',      // Thin wire-to-domain converters — covered implicitly
        'lib/marketing/**',  // Static typed content, no logic
      ],
    },
  },
  resolve: {
    alias: {
      '@': __dirname,
      // Next.js provides 'server-only' at build time; tests run outside Next.
      'server-only': `${__dirname}/__tests__/stubs/server-only.ts`,
    },
  },
});
