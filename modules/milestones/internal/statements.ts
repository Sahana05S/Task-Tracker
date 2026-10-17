import type { CompanyStatement } from '@/types/tracker';

/**
 * Pure helpers for the organisational statements.
 *
 * No React and no Supabase, so the parsing below is reasoned about on its own.
 */

/* -------------------------------------------------------------------------- */
/* Keys                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The `key_name` values the showcase renders, in display order.
 *
 * Seeded by `04_milestones_and_vision.sql`. A row with any other key is stored
 * and editable but is not shown, so adding a fourth block is a change here rather
 * than a migration.
 */
export const VISION_KEY = 'vision';
export const MISSION_KEY = 'mission';
export const CORE_VALUES_KEY = 'core_values';

export const SHOWCASE_STATEMENT_KEYS = [
  VISION_KEY,
  MISSION_KEY,
  CORE_VALUES_KEY,
] as const;

export type ShowcaseStatementKey = (typeof SHOWCASE_STATEMENT_KEYS)[number];

export function isShowcaseStatementKey(
  value: string,
): value is ShowcaseStatementKey {
  return (SHOWCASE_STATEMENT_KEYS as readonly string[]).includes(value);
}

/** Finds one statement by key, or `null` when it has not been seeded. */
export function findStatement(
  statements: readonly CompanyStatement[],
  keyName: string,
): CompanyStatement | null {
  return statements.find((entry) => entry.keyName === keyName) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Core values                                                                */
/* -------------------------------------------------------------------------- */

export interface CoreValue {
  name: string;
  /** Elaboration, or `null` when the line carried a name only. */
  description: string | null;
}

/**
 * Splits the `core_values` statement into individual values.
 *
 * The stored format is one value per line, `Name: description`. Only the first
 * colon splits, so a description may contain further colons. A line with no colon
 * becomes a value with no elaboration rather than being dropped — someone typing
 * a bare list should still see it rendered.
 *
 * Blank lines are ignored, so trailing newlines and double-spacing in the editor
 * do not produce empty cards.
 */
export function parseCoreValues(statement: string): CoreValue[] {
  return statement
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const separator = line.indexOf(':');

      if (separator === -1) {
        return { name: line, description: null };
      }

      const name = line.slice(0, separator).trim();
      const description = line.slice(separator + 1).trim();

      // A line that opens with a colon has no name; treat the whole thing as the
      // value rather than rendering an empty heading.
      if (name === '') {
        return { name: description, description: null };
      }

      return { name, description: description === '' ? null : description };
    });
}
