import * as React from 'react';

import { StatementEditor } from '@/modules/milestones/components/statement-editor';
import {
  CORE_VALUES_KEY,
  findStatement,
  MISSION_KEY,
  parseCoreValues,
  VISION_KEY,
} from '@/modules/milestones/client';
import type { CompanyStatement } from '@/types/tracker';

export interface OrganizationShowcaseProps {
  statements: readonly CompanyStatement[];
  /** Leadership sees an Edit control on each card. */
  canManage: boolean;
}

/**
 * Vision, mission and core values, read from `public.company_statements`.
 *
 * A Server Component: the text is server data and the only interactive part is
 * the editor, which is its own client island per card. That keeps the reading
 * path — which is what every member hits — out of the client bundle entirely.
 *
 * The statement icons the static version carried are gone. They were decorative
 * on a card that already has a heading, and the utilitarian pass removed that
 * class of glyph everywhere else.
 */
export function OrganizationShowcase({
  statements,
  canManage,
}: OrganizationShowcaseProps) {
  const vision = findStatement(statements, VISION_KEY);
  const mission = findStatement(statements, MISSION_KEY);
  const coreValues = findStatement(statements, CORE_VALUES_KEY);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <StatementCard
          statement={vision}
          fallbackTitle="Vision"
          canManage={canManage}
        />
        <StatementCard
          statement={mission}
          fallbackTitle="Mission"
          canManage={canManage}
        />
      </div>

      <CoreValuesCard statement={coreValues} canManage={canManage} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Vision and mission                                                         */
/* -------------------------------------------------------------------------- */

interface StatementCardProps {
  statement: CompanyStatement | null;
  /** Used for the heading when the row has not been seeded. */
  fallbackTitle: string;
  canManage: boolean;
}

function StatementCard({
  statement,
  fallbackTitle,
  canManage,
}: StatementCardProps) {
  const headingId = `statement-${fallbackTitle.toLowerCase()}`;

  if (!statement) {
    return <MissingStatement title={fallbackTitle} headingId={headingId} />;
  }

  return (
    <section
      aria-labelledby={headingId}
      className="soft-card flex flex-col gap-2 p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 id={headingId} className="eyebrow">
          {statement.title}
        </h3>
        {canManage ? <StatementEditor statement={statement} /> : null}
      </div>

      <p className="text-foreground text-lg leading-snug font-semibold tracking-tight">
        {statement.statement}
      </p>
      {statement.subtext ? (
        <p className="text-muted-foreground text-sm">{statement.subtext}</p>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Core values                                                                */
/* -------------------------------------------------------------------------- */

function CoreValuesCard({
  statement,
  canManage,
}: {
  statement: CompanyStatement | null;
  canManage: boolean;
}) {
  if (!statement) {
    return (
      <MissingStatement title="Core values" headingId="core-values-heading" />
    );
  }

  const values = parseCoreValues(statement.statement);

  return (
    <section aria-labelledby="core-values-heading" className="soft-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <h3 id="core-values-heading" className="eyebrow">
          {statement.title}
        </h3>
        {canManage ? <StatementEditor statement={statement} /> : null}
      </div>

      {statement.subtext ? (
        <p className="text-muted-foreground mt-1 text-sm">{statement.subtext}</p>
      ) : null}

      {values.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-sm">
          No values recorded yet.
        </p>
      ) : (
        <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {values.map((value, index) => (
            <div key={`${value.name}-${index}`} className="flex gap-2.5">
              {/*
                An index rather than an icon. The values are an ordered list of
                four-ish items, and a number says "one of several" without
                inventing a symbol for an idea like "Shared Ownership".
              */}
              <span
                aria-hidden="true"
                className="text-primary bg-primary-subtle mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg font-mono text-[10px] font-semibold"
              >
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-foreground text-sm font-medium">
                  {value.name}
                </dt>
                {value.description ? (
                  <dd className="text-muted-foreground text-sm">
                    {value.description}
                  </dd>
                ) : null}
              </div>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Missing row                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Shown when a `key_name` the showcase expects has no row.
 *
 * Only reachable if someone deleted a seeded statement, since
 * `04_milestones_and_vision.sql` creates all three. Naming the key is deliberate:
 * it is the one piece of information needed to put the row back.
 */
function MissingStatement({
  title,
  headingId,
}: {
  title: string;
  headingId: string;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className="soft-card flex flex-col gap-1.5 p-5 sm:p-6"
    >
      <h3 id={headingId} className="eyebrow">
        {title}
      </h3>
      <p className="text-muted-foreground text-sm">
        No statement recorded. A managing director or project engineer can add one
        by inserting a{' '}
        <code className="bg-muted text-foreground rounded px-1 py-0.5 font-mono text-xs">
          company_statements
        </code>{' '}
        row for this block.
      </p>
    </section>
  );
}
