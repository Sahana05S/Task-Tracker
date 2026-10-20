import * as React from 'react';

import { HERO_STATS } from '@/modules/marketing/internal/content';

/**
 * The three headline figures, on the white page just below the cloud bank.
 * They used to close the hero; the hero's bottom now belongs to the clouds.
 */
export function MetricStrip() {
  return (
    <dl className="soft-card mx-auto grid max-w-5xl grid-cols-1 gap-6 rounded-2xl border bg-white px-6 py-7 sm:grid-cols-3 sm:gap-8 sm:px-8">
      {HERO_STATS.map(({ value, label }) => (
        <div key={label} className="flex min-w-0 flex-col gap-1">
          <dt className="sr-only">{label}</dt>
          <dd className="stat-figure text-primary text-2xl font-bold tracking-tight break-words sm:text-3xl">
            {value}
          </dd>
          <dd className="text-muted-foreground text-sm leading-normal">{label}</dd>
        </div>
      ))}
    </dl>
  );
}
