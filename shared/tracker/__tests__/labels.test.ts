import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ATTENDANCE_STATUSES,
  CHECKLIST_NODE_TYPES,
  MILESTONE_STATUSES,
  TASK_CATEGORIES,
  TASK_FRESHNESS_STATES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  USER_ROLES,
} from '@/shared/tracker/enums';
import {
  ATTENDANCE_STATUS_MEANINGS,
  CATEGORY_MEANINGS,
  CHECKLIST_NODE_MEANINGS,
  codeLabel,
  codeLabels,
  codeMeaning,
  GLOSSARY,
  guideHref,
  KNOWN_CODES,
  MILESTONE_STATUS_MEANINGS,
  ROLE_MEANINGS,
  TASK_FRESHNESS_MEANINGS,
  TASK_PRIORITY_MEANINGS,
  TASK_STATUS_MEANINGS,
} from '@/shared/tracker/labels';

const ROOT = join(__dirname, '..', '..', '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/**
 * Codes the scoring engine, award rules and attendance context emit as reasons:
 * literals passed to `unavailableRaw(...)`, pushed onto or listed in `reasons`,
 * or tested with `reasons.includes(...)`.
 */
function emittedReasonCodes(): string[] {
  const position = /(?:unavailableRaw\(|[rR]easons\.push\(|[rR]easons:\s*\[|reasons\.includes\(|reasons\.some\()((?:\s*'[a-z0-9_]+'\s*,?)+)/g;
  const codes = new Set<string>();
  for (const dir of ['modules/scoring/internal', 'modules/attendance/internal', 'modules/recognition/internal']) {
    for (const file of sources(join(ROOT, dir))) {
      for (const match of readFileSync(file, 'utf8').matchAll(position)) {
        for (const literal of match[1].matchAll(/'([a-z0-9_]+)'/g)) if (literal[1].includes('_')) codes.add(literal[1]);
      }
    }
  }
  return [...codes].sort();
}

/** Award and validity codes the database writes (migrations 20-23, 45, 50). */
const DATABASE_REASONS = [
  'attendance_missing', 'legacy_hours_unconfirmed', 'effort_hours_invalid', 'attendance_hours_invalid',
  'attendance_state_hours_incompatible', 'effort_exceeds_attendance_capacity', 'history_before_input_baseline',
  'completed_winner', 'completed_none', 'calculation_failed', 'source_query_failed', 'required_inputs_unavailable',
  'award_cutoff_not_reached', 'award_policy_unapproved', 'daily_coverage_incomplete', 'exact_monthly_tie',
  'no_effective_daily_wins', 'monthly_tie_break_unavailable', 'incomplete_uncertified', 'legacy_unvalidated',
  'sales_flags_missing', 'sales_field_mapping_missing', 'legacy_population_or_validation_provenance_missing',
  'attendance_unavailable', 'attendance_invalid', 'frozen_period',
];

describe('codeLabel', () => {
  it('uses the written label for known codes', () => {
    expect(codeLabel('not_applicable')).toBe('Not applicable');
    expect(codeLabel('completed_winner')).toBe('Winner chosen');
    expect(codeLabel('factor_median_unavailable')).toBe("Team median can't be calculated yet");
  });

  it('reads a factor-prefixed reason as its reason', () => {
    expect(codeLabel('productivity:raw_input_unavailable')).toBe('Required input not available');
    expect(codeMeaning('sales:factor_median_unavailable')).toMatch(/middle value/);
  });

  it('makes unknown codes readable and drops an id suffix', () => {
    expect(codeLabel('some_new_code')).toBe('Some new code');
    expect(codeLabel('unsectioned:3f2a')).toBe('Unsectioned');
    expect(codeMeaning('some_new_code')).toBeNull();
  });

  it('falls back when the code is empty', () => {
    expect(codeLabel(null)).toBe('Not recorded');
    expect(codeLabel('', 'Unknown')).toBe('Unknown');
  });

  it('joins distinct labels once', () => {
    expect(codeLabels(['attendance_unavailable', 'productivity:attendance_unavailable'])).toBe('Attendance not recorded for some days');
  });
});

describe('glossary coverage', () => {
  it('gives every emitted scoring, award and attendance reason a label and meaning', () => {
    const emitted = emittedReasonCodes();
    expect(emitted.length).toBeGreaterThan(20);
    const missing = [...emitted, ...DATABASE_REASONS].filter((code) => !KNOWN_CODES.includes(code));
    expect(missing).toEqual([]);
    for (const code of KNOWN_CODES) {
      expect(codeLabel(code)).not.toContain('_');
      expect(codeMeaning(code)).toMatch(/\.$/);
    }
  });

  it('explains every value of every tracker enum', () => {
    const pairs: [readonly string[], Record<string, string>][] = [
      [TASK_STATUSES, TASK_STATUS_MEANINGS],
      [TASK_PRIORITIES, TASK_PRIORITY_MEANINGS],
      [TASK_FRESHNESS_STATES, TASK_FRESHNESS_MEANINGS],
      [ATTENDANCE_STATUSES, ATTENDANCE_STATUS_MEANINGS],
      [USER_ROLES, ROLE_MEANINGS],
      [TASK_CATEGORIES, CATEGORY_MEANINGS],
      [CHECKLIST_NODE_TYPES, CHECKLIST_NODE_MEANINGS],
      [MILESTONE_STATUSES, MILESTONE_STATUS_MEANINGS],
    ];
    for (const [values, meanings] of pairs) {
      expect(Object.keys(meanings).sort()).toEqual([...values].sort());
      for (const value of values) expect(meanings[value].trim()).not.toBe('');
    }
  });

  it('links every glossary term to a guide section', () => {
    for (const term of Object.values(GLOSSARY)) {
      expect(guideHref(term)).toMatch(/^\/guide\/[a-z]+#[a-z-]+$/);
      expect(term.meaning).toMatch(/\.$/);
    }
  });
});
