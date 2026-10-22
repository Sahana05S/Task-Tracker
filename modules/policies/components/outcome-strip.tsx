import { cn } from '@/shared/utils';

import type { Outcome, OutcomeCounts } from '@/modules/policies/client';

/**
 * This period's outcomes as one thin proportion bar plus the counts in words.
 * Colours were checked with the dataviz validator (CVD separation >= 18 ΔE);
 * they sit below 3:1 on white, so the counts are always printed beside them.
 */
export const OUTCOME_COLORS = { met: '#0f9f74', notMet: '#7468d0', unavailable: '#e08e0b' } as const;

/** The colour dot of one outcome, beside its label. */
export function OutcomeDot({ outcome, className }: { outcome: Outcome; className?: string }) {
  return <span aria-hidden="true" className={cn('inline-block size-1.5 shrink-0 rounded-full', className)}
    style={{ backgroundColor: OUTCOME_COLORS[outcome === 'not_met' ? 'notMet' : outcome] }} />;
}

const SEGMENTS = [
  { key: 'met', label: 'met' },
  { key: 'notMet', label: 'not met' },
  { key: 'unavailable', label: 'can’t judge' },
] as const;

export function outcomeSummary(counts: OutcomeCounts): string {
  return SEGMENTS.filter((s) => counts[s.key] > 0).map((s) => `${counts[s.key]} ${s.label}`).join(' · ') || 'No results yet';
}

export function OutcomeStrip({ counts, className }: { counts: OutcomeCounts | null; className?: string }) {
  const total = counts ? counts.met + counts.notMet + counts.unavailable : 0;
  if (!counts || total === 0) {
    return <p className={cn('text-muted-foreground text-xs', className)}>Not evaluated yet</p>;
  }
  return (
    <div className={cn('grid min-w-0 gap-1', className)}>
      <div role="img" aria-label={outcomeSummary(counts)} className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full">
        {SEGMENTS.map((s) => counts[s.key] > 0 ? (
          <span key={s.key} className="h-full rounded-full first:rounded-l-full last:rounded-r-full"
            style={{ flexGrow: counts[s.key], backgroundColor: OUTCOME_COLORS[s.key] }} />
        ) : null)}
      </div>
      <p aria-hidden="true" className="text-muted-foreground flex flex-wrap gap-x-2 text-xs tabular-nums">
        {SEGMENTS.map((s) => counts[s.key] > 0 ? (
          <span key={s.key} className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: OUTCOME_COLORS[s.key] }} />
            {counts[s.key]} {s.label}
          </span>
        ) : null)}
      </p>
    </div>
  );
}
