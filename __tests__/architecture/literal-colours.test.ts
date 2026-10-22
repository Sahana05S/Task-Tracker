import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Signed-in code takes its colours from the tokens in `app/globals.css`, which
 * have light and dark values. A literal colour (a Tailwind palette class such
 * as `bg-white` or `text-slate-500`, or a hex value) paints the same in both
 * themes, so it is a dark-theme defect. The public landing page (`modules/
 * marketing`, `app/page.tsx`) keeps its own look and is not scanned.
 *
 * Anything that must stay literal (a third party's logo) is listed in
 * ALLOWED with the exact literal, so a new one is a deliberate edit here.
 */
const ROOT = join(__dirname, '..', '..');
const SCAN = ['app', 'modules', 'shared/ui'];
const SKIP_DIRS = new Set(['__tests__', 'marketing']);
const SKIP = [/^app\/page\.tsx$/, /^app\/globals\.css$/];
const ALLOWED: Record<string, string[]> = {
  // Google's "G" mark keeps its brand colours in both themes.
  'modules/auth/components/auth-form.tsx': ['#4285F4', '#34A853', '#FBBC05', '#EA4335'],
  // <meta name="theme-color"> cannot read a CSS variable; shared/ui/__tests__/theme.test.ts ties these to --background.
  'shared/ui/theme-script.ts': ['#f7f6fd', '#0d1020'],
};

const PALETTE = '(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)';
const UTILITY = '(?:bg|text|border|from|to|via|ring|ring-offset|fill|stroke|outline|divide|decoration|shadow|accent|caret|placeholder)';
const LITERALS = [
  new RegExp(`(?<![\\w-])${UTILITY}-${PALETTE}(?:-\\d{2,3})?(?:/\\d{1,3})?(?![\\w-])`, 'g'),
  // Hex colours: in arbitrary values (`bg-[#fff]`), attributes (`fill="#fff"`), strings and CSS.
  // An in-page anchor (`href="#add"`) is not a colour.
  /(?<=[\['"(:,\s])(?<!href=["'])#[0-9a-fA-F]{3,8}(?![\w-])/g,
];

// Cheap test before the full patterns run: most files have no palette word or hex at all.
const MAYBE = new RegExp(`#[0-9a-fA-F]{3}|-${PALETTE}(?![\\w])`);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) yield* walk(join(dir, entry.name)); }
    else if (/\.(tsx?|css)$/.test(entry.name)) yield join(dir, entry.name);
  }
}

describe('theme tokens', () => {
  it('signed-in code has no literal colours outside the allow list', () => {
    const offenders: string[] = [];
    for (const base of SCAN) {
      for (const file of walk(join(ROOT, base))) {
        const rel = relative(ROOT, file).replace(/\\/g, '/');
        if (SKIP.some((s) => s.test(rel))) continue;
        const text = readFileSync(file, 'utf8');
        if (!MAYBE.test(text)) continue;
        const allowed = new Set(ALLOWED[rel] ?? []);
        for (const pattern of LITERALS) {
          for (const match of text.matchAll(pattern)) {
            if (allowed.has(match[0])) continue;
            const line = text.slice(0, match.index).split('\n').length;
            offenders.push(`${rel}:${line}: ${match[0]}`);
          }
        }
      }
    }
    expect(offenders, `Use a token from app/globals.css instead:\n${offenders.join('\n')}`).toEqual([]);
  });
});
