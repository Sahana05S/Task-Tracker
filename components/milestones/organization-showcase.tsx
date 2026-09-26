import * as React from 'react';

import {
  CORE_VALUES,
  MISSION,
  VISION,
  type StatementBlock,
} from '@/lib/milestones/content';

/**
 * Vision, mission and core values.
 *
 * Presented as a two-column pair of statement cards above a values grid, so the
 * page reads top-down from intent to behaviour.
 */
export function OrganizationShowcase() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <StatementCard block={VISION} />
        <StatementCard block={MISSION} />
      </div>

      <section
        aria-labelledby="core-values-heading"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <h3
          id="core-values-heading"
          className="text-xs font-medium tracking-wide text-slate-500 uppercase"
        >
          Core values
        </h3>

        <dl className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {CORE_VALUES.map(({ name, description, icon: Icon }) => (
            <div key={name} className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-sm font-medium text-slate-900">{name}</dt>
                <dd className="text-sm text-slate-600">{description}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function StatementCard({ block }: { block: StatementBlock }) {
  const { title, statement, detail, icon: Icon } = block;
  const headingId = `statement-${title.toLowerCase()}`;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4"
    >
      <h3
        id={headingId}
        className="flex items-center gap-2 text-xs font-medium tracking-wide text-slate-500 uppercase"
      >
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        {title}
      </h3>
      <p className="text-base leading-snug font-medium text-slate-900">
        {statement}
      </p>
      <p className="text-sm text-slate-600">{detail}</p>
    </section>
  );
}
