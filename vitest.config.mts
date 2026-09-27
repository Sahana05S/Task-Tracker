import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts'],
      exclude: [
        'lib/supabase/**',   // Supabase client wrappers — need a live connection
        'lib/**/queries.ts', // DB query helpers — integration territory
        'lib/**/mappers.ts', // Thin wire-to-domain converters — covered implicitly
        'lib/marketing/**',  // Static typed content, no logic
      ],
    },
  },
  resolve: {
    alias: {
      '@': __dirname,
    },
  },
});
