/**
 * Words for stored codes that reach the interface (states, statuses, reasons).
 * Known codes get a written label; anything else is made readable instead of
 * shown raw, so a new code never surfaces as `snake_case` on screen.
 */

const LABELS: Record<string, string> = {
  // Checklist sections
  complete: 'Complete',
  partial: 'In progress',
  not_applicable: 'Not applicable',
  uninitialized: 'Not confirmed yet',
  missing: 'Not set up',
  invalid: 'Needs attention',
  // Records and reviews
  pending: 'Waiting for review',
  validated: 'Validated',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  legacy_unvalidated: 'Earlier record, not reviewed',
  // Awards
  completed_winner: 'Winner chosen',
  completed_none: 'No winner',
  blocked: 'Waiting for data',
  failed: 'Failed',
  // Provider work (Drive)
  not_requested: 'Not requested',
  // Task Tools results
  committed: 'Done',
  replayed: 'Already done',
};

/** Words for one code; `fallback` when the code is empty. */
export function codeLabel(code: string | null | undefined, fallback = 'Not recorded'): string {
  if (!code) return fallback;
  const known = LABELS[code];
  if (known) return known;
  const words = code.split(':')[0].replaceAll('_', ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : fallback;
}
